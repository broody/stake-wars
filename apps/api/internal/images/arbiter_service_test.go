package images

import (
	"bytes"
	"context"
	"database/sql"
	"image"
	"image/color"
	"image/png"
	"path/filepath"
	"testing"

	"stakewars.com/api/internal/arbiter"
	"stakewars.com/api/internal/database"
)

func TestAuthorizeAndPublishArbiterImage(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "arbiter-images.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	seedArbiterController(t, db, 4, "0xabc")

	objects := &fakeObjectStore{data: make(map[string][]byte)}
	controllers := &fakeArbiterController{roundID: 4, address: "0xabc"}
	store := NewStore(db)
	service := NewArbiterService(
		store, objects, controllers, "SN_SEPOLIA", 2*1024*1024,
	)
	detail := encodedRectPNG(t, 320, arbiterDetailMaximumDimension)
	thumbnail := encodedRectPNG(t, 160, arbiterThumbnailMaximumDimension)
	authorization, err := service.Authorize(
		context.Background(),
		"0xabc",
		ArbiterAuthorizeInput{
			Description: "Build on Starknet.", DestinationURL: "https://starknet.io/build",
			ContentType: "image/png", DetailSize: int64(len(detail)),
			ThumbnailSize: int64(len(thumbnail)),
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	objects.data[objects.authorized[0]] = detail
	objects.data[objects.authorized[1]] = thumbnail

	published, err := service.Complete(context.Background(), authorization.UploadID, "0xabc")
	if err != nil {
		t.Fatal(err)
	}
	if published.ControllerRoundID != 4 || published.ImageURL == "" ||
		published.ThumbnailURL == "" || published.Description != "Build on Starknet." ||
		published.DestinationURL != "https://starknet.io/build" {
		t.Fatalf("unexpected Arbiter artwork: %+v", published)
	}
	controller, err := arbiter.NewStore(db).Controller(context.Background(), "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if controller.ActiveArtworkID != published.ID || controllers.checks != 2 {
		t.Fatalf("unexpected controller projection: %+v", controller)
	}
	billboard, err := arbiter.NewStore(db).Billboard(
		context.Background(), "SN_SEPOLIA", controller.ActiveArtworkID,
	)
	if err != nil || billboard.ImageURL != published.ImageURL ||
		billboard.Description != published.Description ||
		billboard.DestinationURL != published.DestinationURL {
		t.Fatalf("unexpected billboard: %+v, %v", billboard, err)
	}
}

func TestArbiterImageCompletionRejectsSupersededController(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "arbiter-images.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	seedArbiterController(t, db, 4, "0xabc")
	objects := &fakeObjectStore{data: make(map[string][]byte)}
	controllers := &fakeArbiterController{roundID: 4, address: "0xabc"}
	service := NewArbiterService(
		NewStore(db), objects, controllers, "SN_SEPOLIA", 2*1024*1024,
	)
	detail := encodedRectPNG(t, arbiterDetailMaximumDimension, 320)
	thumbnail := encodedRectPNG(t, arbiterThumbnailMaximumDimension, 160)
	authorization, err := service.Authorize(
		context.Background(),
		"0xabc",
		ArbiterAuthorizeInput{
			Description: "A short transmission.", DestinationURL: "https://example.com",
			ContentType: "image/png", DetailSize: int64(len(detail)),
			ThumbnailSize: int64(len(thumbnail)),
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	objects.data[objects.authorized[0]] = detail
	objects.data[objects.authorized[1]] = thumbnail
	controllers.roundID = 5
	controllers.address = "0xdef"
	if _, err := service.Complete(
		context.Background(), authorization.UploadID, "0xabc",
	); err != ErrForbidden {
		t.Fatalf("expected forbidden after controller changed, got %v", err)
	}
}

func TestArbiterImageCanOnlyBePublishedOncePerControlTerm(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "arbiter-once.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	seedArbiterController(t, db, 4, "0xabc")

	objects := &fakeObjectStore{data: make(map[string][]byte)}
	controllerStore := arbiter.NewStore(db)
	service := NewArbiterService(
		NewStore(db), objects, controllerStore, "SN_SEPOLIA", 2*1024*1024,
	)
	detail := encodedRectPNG(t, 320, arbiterDetailMaximumDimension)
	thumbnail := encodedRectPNG(t, 160, arbiterThumbnailMaximumDimension)
	input := ArbiterAuthorizeInput{
		Description:    "The first and only transmission.",
		DestinationURL: "https://example.com/first",
		ContentType:    "image/png", DetailSize: int64(len(detail)),
		ThumbnailSize: int64(len(thumbnail)),
	}
	authorization, err := service.Authorize(context.Background(), "0xabc", input)
	if err != nil {
		t.Fatal(err)
	}
	objects.data[objects.authorized[0]] = detail
	objects.data[objects.authorized[1]] = thumbnail
	if _, err := service.Complete(context.Background(), authorization.UploadID, "0xabc"); err != nil {
		t.Fatal(err)
	}

	if _, err := service.Authorize(context.Background(), "0xabc", input); err != ErrArbiterAlreadyPublished {
		t.Fatalf("expected one-time publication rejection, got %v", err)
	}
}

func TestValidateArbiterAdvertisement(t *testing.T) {
	description, destination, err := normalizeArbiterAdvertisement(
		"  Visit the winning project.  ",
		"https://example.com/campaign",
	)
	if err != nil || description != "Visit the winning project." ||
		destination != "https://example.com/campaign" {
		t.Fatalf("unexpected normalized advertisement: %q, %q, %v", description, destination, err)
	}

	for _, testCase := range []struct {
		description string
		destination string
	}{
		{description: "", destination: "https://example.com"},
		{description: "Missing a scheme.", destination: "example.com"},
		{description: "Unsafe scheme.", destination: "javascript:alert(1)"},
		{description: "Credentials are not allowed.", destination: "https://user:pass@example.com"},
	} {
		if _, _, err := normalizeArbiterAdvertisement(testCase.description, testCase.destination); err == nil {
			t.Fatalf("expected invalid advertisement rejection for %+v", testCase)
		}
	}
}

func TestValidateArbiterImageAcceptsAnyRatioWithinLimit(t *testing.T) {
	for _, dimensions := range []struct {
		width  int
		height int
	}{
		{width: 512, height: 128},
		{width: 128, height: 512},
		{width: 512, height: 512},
	} {
		image := encodedRectPNG(t, dimensions.width, dimensions.height)
		if err := validateArbiterImage(image, "image/png", 512); err != nil {
			t.Fatalf("expected %dx%d image to be accepted: %v", dimensions.width, dimensions.height, err)
		}
	}
}

func TestValidateArbiterImageRejectsDimensionOverLimit(t *testing.T) {
	image := encodedRectPNG(t, 513, 100)
	if err := validateArbiterImage(image, "image/png", 512); err == nil {
		t.Fatal("expected oversized image to be rejected")
	}
}

type fakeArbiterController struct {
	roundID       uint64
	address       string
	activeArtwork string
	checks        int
}

func (c *fakeArbiterController) CurrentController(
	context.Context,
	string,
) (uint64, string, string, error) {
	c.checks++
	return c.roundID, c.address, c.activeArtwork, nil
}

func seedArbiterController(t *testing.T, db *sql.DB, roundID uint64, address string) {
	t.Helper()
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO arbiter_rounds(
			network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			claimed_controller, claimed_at, billboard_starts_at
		) VALUES ('SN_SEPOLIA', ?, '0x1', ?, '0x2', '0x3', '0x4', '0x5', '0x6', ?, 100, 100)
	`, roundID, roundID, address)
	if err != nil {
		t.Fatal(err)
	}
}

func encodedRectPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	picture := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			picture.SetRGBA(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 80, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, picture); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}
