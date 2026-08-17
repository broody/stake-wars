package images

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"strings"
	"time"

	_ "golang.org/x/image/webp"

	"stakewars.com/api/internal/objectstore"
	"stakewars.com/api/internal/starknet"
)

const (
	uploadAuthorizationLifetime = 5 * time.Minute
	maximumControlPointID       = 1999
	maximumArtworkTargets       = 200
	maximumDetailDimension      = 512
	maximumThumbnailDimension   = 256
)

var (
	ErrForbidden         = errors.New("image management is not permitted")
	ErrInvalidImage      = errors.New("invalid image")
	ErrUploadUnavailable = errors.New("image upload is unavailable")
)

type AuthorizeInput struct {
	Targets       []Target
	Placement     Placement
	ContentType   string
	DetailSize    int64
	ThumbnailSize int64
}

type UploadTarget struct {
	URL         string    `json:"url"`
	ContentType string    `json:"contentType"`
	Bytes       int64     `json:"bytes"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

type Authorization struct {
	UploadID  string       `json:"uploadId"`
	Detail    UploadTarget `json:"detail"`
	Thumbnail UploadTarget `json:"thumbnail"`
}

type Service struct {
	store       *Store
	objects     objectstore.Store
	control     starknet.ControlReader
	network     string
	maximumSize int64
	now         func() time.Time
	random      io.Reader
}

func NewService(store *Store, objects objectstore.Store, control starknet.ControlReader, network string, maximumSize int64) *Service {
	return &Service{store: store, objects: objects, control: control, network: network,
		maximumSize: maximumSize, now: func() time.Time { return time.Now().UTC() }, random: rand.Reader}
}

func validPlacement(placement Placement) bool {
	if len(placement.ProjectorMatrix) != 16 || !finite(placement.CenterX) ||
		!finite(placement.CenterY) || !finite(placement.Scale) || placement.Scale <= 0 ||
		placement.Scale > 4 || !finite(placement.Rotation) ||
		!finite(placement.ViewportAspect) || placement.ViewportAspect <= 0 ||
		placement.ViewportAspect > 10 {
		return false
	}
	for _, value := range placement.ProjectorMatrix {
		if !finite(value) {
			return false
		}
	}
	return true
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func validTargets(targets []Target) bool {
	if len(targets) == 0 || len(targets) > maximumArtworkTargets {
		return false
	}
	seen := make(map[uint32]struct{}, len(targets))
	for _, target := range targets {
		if target.ControlPointID > maximumControlPointID || target.OwnershipGeneration == 0 {
			return false
		}
		if _, exists := seen[target.ControlPointID]; exists {
			return false
		}
		seen[target.ControlPointID] = struct{}{}
	}
	return true
}

func (s *Service) verifyTargets(ctx context.Context, owner string, targets []Target) error {
	for _, target := range targets {
		allowed, err := s.control.CanManageImage(ctx, target.ControlPointID, owner, target.OwnershipGeneration)
		if err != nil {
			return fmt.Errorf("verify artwork ownership: %w", err)
		}
		if !allowed {
			return ErrForbidden
		}
	}
	return nil
}

func (s *Service) Authorize(ctx context.Context, owner string, input AuthorizeInput) (Authorization, error) {
	if s == nil || s.store == nil || s.objects == nil || s.control == nil {
		return Authorization{}, ErrUploadUnavailable
	}
	if !validTargets(input.Targets) || !validPlacement(input.Placement) ||
		!supportedContentType(input.ContentType) || input.DetailSize <= 0 ||
		input.DetailSize > s.maximumSize || input.ThumbnailSize <= 0 || input.ThumbnailSize > s.maximumSize {
		return Authorization{}, ErrInvalidImage
	}
	if err := s.verifyTargets(ctx, owner, input.Targets); err != nil {
		return Authorization{}, err
	}
	id, err := randomHex(s.random, 16)
	if err != nil {
		return Authorization{}, err
	}
	extension := extensionFor(input.ContentType)
	prefix := fmt.Sprintf("art/%s/%s", strings.ToLower(s.network), id)
	detailKey, thumbnailKey := prefix+"/detail"+extension, prefix+"/thumbnail"+extension
	detailAuth, err := s.objects.AuthorizePut(ctx, detailKey, input.ContentType, input.DetailSize, uploadAuthorizationLifetime)
	if err != nil {
		return Authorization{}, err
	}
	thumbnailAuth, err := s.objects.AuthorizePut(ctx, thumbnailKey, input.ContentType, input.ThumbnailSize, uploadAuthorizationLifetime)
	if err != nil {
		return Authorization{}, err
	}
	now := s.now().UTC().Truncate(time.Second)
	expiresAt := detailAuth.ExpiresAt
	if thumbnailAuth.ExpiresAt.Before(expiresAt) {
		expiresAt = thumbnailAuth.ExpiresAt
	}
	upload := Upload{ID: id, Network: s.network, OwnerAddress: owner, Targets: input.Targets,
		Placement: input.Placement, ContentType: input.ContentType, DetailObjectKey: detailKey,
		DetailSize: input.DetailSize, ThumbnailObjectKey: thumbnailKey, ThumbnailSize: input.ThumbnailSize,
		CreatedAt: now, ExpiresAt: expiresAt.UTC().Truncate(time.Second)}
	if err := s.store.CreateUpload(ctx, upload); err != nil {
		return Authorization{}, err
	}
	return Authorization{UploadID: id,
		Detail:    UploadTarget{URL: detailAuth.URL, ContentType: input.ContentType, Bytes: input.DetailSize, ExpiresAt: detailAuth.ExpiresAt},
		Thumbnail: UploadTarget{URL: thumbnailAuth.URL, ContentType: input.ContentType, Bytes: input.ThumbnailSize, ExpiresAt: thumbnailAuth.ExpiresAt}}, nil
}

func (s *Service) Complete(ctx context.Context, uploadID, owner string) (Artwork, error) {
	if s == nil || s.store == nil || s.objects == nil || s.control == nil {
		return Artwork{}, ErrUploadUnavailable
	}
	upload, err := s.store.Upload(ctx, uploadID)
	if err != nil {
		return Artwork{}, err
	}
	now := s.now().UTC().Truncate(time.Second)
	if upload.OwnerAddress != owner || upload.CompletedAt != nil || upload.ExpiresAt.Before(now) {
		return Artwork{}, ErrForbidden
	}
	if err := s.verifyTargets(ctx, owner, upload.Targets); err != nil {
		return Artwork{}, err
	}
	detail, err := s.objects.Read(ctx, upload.DetailObjectKey, upload.DetailSize)
	if err != nil {
		return Artwork{}, err
	}
	thumbnail, err := s.objects.Read(ctx, upload.ThumbnailObjectKey, upload.ThumbnailSize)
	if err != nil {
		return Artwork{}, err
	}
	if int64(len(detail)) != upload.DetailSize || int64(len(thumbnail)) != upload.ThumbnailSize {
		return Artwork{}, fmt.Errorf("%w: uploaded object size does not match authorization", ErrInvalidImage)
	}
	if err := validateImage(detail, upload.ContentType, maximumDetailDimension); err != nil {
		return Artwork{}, err
	}
	if err := validateImage(thumbnail, upload.ContentType, maximumThumbnailDimension); err != nil {
		return Artwork{}, err
	}
	hash := sha256.Sum256(detail)
	id, err := randomHex(s.random, 16)
	if err != nil {
		return Artwork{}, err
	}
	artwork := Artwork{ID: id, Network: upload.Network, OwnerAddress: owner, Targets: upload.Targets,
		Placement: upload.Placement, ImageURL: s.objects.PublicURL(upload.DetailObjectKey),
		ThumbnailURL: s.objects.PublicURL(upload.ThumbnailObjectKey), ContentHash: hex.EncodeToString(hash[:]), UpdatedAt: now}
	if err := s.store.Publish(ctx, upload, artwork, now); err != nil {
		return Artwork{}, err
	}
	return artwork, nil
}

func (s *Service) Approved(ctx context.Context) ([]Artwork, error) {
	if s == nil || s.store == nil {
		return []Artwork{}, nil
	}
	return s.store.Approved(ctx, s.network)
}

func supportedContentType(contentType string) bool {
	return contentType == "image/webp" || contentType == "image/jpeg" || contentType == "image/png"
}
func extensionFor(contentType string) string {
	if contentType == "image/jpeg" {
		return ".jpg"
	}
	return "." + strings.TrimPrefix(contentType, "image/")
}
func validateImage(data []byte, contentType string, maximumDimension int) error {
	configuration, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("%w: image cannot be decoded", ErrInvalidImage)
	}
	if format != strings.TrimPrefix(contentType, "image/") && !(format == "jpeg" && contentType == "image/jpeg") {
		return fmt.Errorf("%w: image signature does not match content type", ErrInvalidImage)
	}
	if configuration.Width <= 0 || configuration.Height <= 0 || configuration.Width > maximumDimension || configuration.Height > maximumDimension {
		return fmt.Errorf("%w: dimensions exceed %dx%d", ErrInvalidImage, maximumDimension, maximumDimension)
	}
	return nil
}
func randomHex(source io.Reader, size int) (string, error) {
	buffer := make([]byte, size)
	if _, err := io.ReadFull(source, buffer); err != nil {
		return "", fmt.Errorf("generate image identifier: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}
