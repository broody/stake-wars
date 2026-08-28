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
	detail := encodedRectPNG(t, arbiterDetailWidth, arbiterDetailHeight)
	thumbnail := encodedRectPNG(t, arbiterThumbnailWidth, arbiterThumbnailHeight)
	authorization, err := service.Authorize(
		context.Background(),
		"0xabc",
		ArbiterAuthorizeInput{
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
		published.ThumbnailURL == "" {
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
	if err != nil || billboard.ImageURL != published.ImageURL {
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
	detail := encodedRectPNG(t, arbiterDetailWidth, arbiterDetailHeight)
	thumbnail := encodedRectPNG(t, arbiterThumbnailWidth, arbiterThumbnailHeight)
	authorization, err := service.Authorize(
		context.Background(),
		"0xabc",
		ArbiterAuthorizeInput{
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

type fakeArbiterController struct {
	roundID uint64
	address string
	checks  int
}

func (c *fakeArbiterController) CurrentController(
	context.Context,
	string,
) (uint64, string, error) {
	c.checks++
	return c.roundID, c.address, nil
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
