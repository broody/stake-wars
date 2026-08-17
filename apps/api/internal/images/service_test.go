package images

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"path/filepath"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/objectstore"
	"stakewars.com/api/internal/starknet"
)

func TestAuthorizeAndPublishControlPointImage(t *testing.T) {
	service, objects, control := testService(t, true)
	detail := encodedPNG(t, 512)
	thumbnail := encodedPNG(t, 256)

	authorization, err := service.Authorize(context.Background(), "0xabc", AuthorizeInput{
		Targets:   []Target{{ControlPointID: 42, OwnershipGeneration: 7}, {ControlPointID: 43, OwnershipGeneration: 8}},
		Placement: testPlacement(), ContentType: "image/png",
		DetailSize: int64(len(detail)), ThumbnailSize: int64(len(thumbnail)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if authorization.UploadID == "" || len(objects.authorized) != 2 {
		t.Fatalf("unexpected authorization: %+v", authorization)
	}
	objects.data[objects.authorized[0]] = detail
	objects.data[objects.authorized[1]] = thumbnail

	published, err := service.Complete(context.Background(), authorization.UploadID, "0xabc")
	if err != nil {
		t.Fatal(err)
	}
	if len(published.Targets) != 2 || published.Targets[0].ControlPointID != 42 ||
		published.ImageURL == "" || published.ThumbnailURL == "" {
		t.Fatalf("unexpected published image: %+v", published)
	}
	approved, err := service.Approved(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(approved) != 1 || approved[0].ID != published.ID {
		t.Fatalf("unexpected approved images: %+v", approved)
	}
	if control.checks != 4 {
		t.Fatalf("expected ownership at authorization and completion, got %d checks", control.checks)
	}
}

func TestAuthorizeRejectsNonOwner(t *testing.T) {
	service, _, _ := testService(t, false)
	_, err := service.Authorize(context.Background(), "0xdef", AuthorizeInput{
		Targets: []Target{{ControlPointID: 4, OwnershipGeneration: 1}}, Placement: testPlacement(), ContentType: "image/webp",
		DetailSize: 100, ThumbnailSize: 50,
	})
	if err != ErrForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestCompleteRejectsMismatchedImageSignature(t *testing.T) {
	service, objects, _ := testService(t, true)
	detail := encodedPNG(t, 512)
	thumbnail := encodedPNG(t, 256)
	authorization, err := service.Authorize(context.Background(), "0xabc", AuthorizeInput{
		Targets: []Target{{ControlPointID: 2, OwnershipGeneration: 1}}, Placement: testPlacement(), ContentType: "image/webp",
		DetailSize: int64(len(detail)), ThumbnailSize: int64(len(thumbnail)),
	})
	if err != nil {
		t.Fatal(err)
	}
	objects.data[objects.authorized[0]] = detail
	objects.data[objects.authorized[1]] = thumbnail
	if _, err := service.Complete(context.Background(), authorization.UploadID, "0xabc"); err == nil {
		t.Fatal("expected image signature validation to fail")
	}
}

func testPlacement() Placement {
	return Placement{
		ProjectorMatrix: []float64{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1},
		Scale:           0.5, ViewportAspect: 1.5,
	}
}

func testService(t *testing.T, allowed bool) (*Service, *fakeObjectStore, *fakeControlReader) {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "images.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	objects := &fakeObjectStore{data: make(map[string][]byte)}
	control := &fakeControlReader{allowed: allowed}
	return NewService(NewStore(db), objects, control, "SN_SEPOLIA", 2*1024*1024), objects, control
}

type fakeObjectStore struct {
	authorized []string
	data       map[string][]byte
}

func (s *fakeObjectStore) AuthorizePut(
	_ context.Context,
	key, _ string,
	_ int64,
	lifetime time.Duration,
) (objectstore.PutAuthorization, error) {
	s.authorized = append(s.authorized, key)
	return objectstore.PutAuthorization{
		URL:       "https://upload.example/" + key,
		ExpiresAt: time.Now().UTC().Add(lifetime),
	}, nil
}

func (s *fakeObjectStore) Read(_ context.Context, key string, _ int64) ([]byte, error) {
	return s.data[key], nil
}

func (s *fakeObjectStore) PublicURL(key string) string {
	return "https://assets.example/" + key
}

type fakeControlReader struct {
	allowed bool
	checks  int
}

func (*fakeControlReader) ControlPointStatus(context.Context, uint32) (starknet.ControlPointStatus, error) {
	return starknet.ControlPointStatus{}, nil
}

func (*fakeControlReader) OperatorStatus(context.Context, string) (starknet.OperatorStatus, error) {
	return starknet.OperatorStatus{}, nil
}

func (r *fakeControlReader) CanManageImage(context.Context, uint32, string, uint64) (bool, error) {
	r.checks++
	return r.allowed, nil
}

func encodedPNG(t *testing.T, size int) []byte {
	t.Helper()
	picture := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			picture.SetRGBA(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 80, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, picture); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}
