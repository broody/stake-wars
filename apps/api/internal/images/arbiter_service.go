package images

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"io"
	"strings"
	"time"

	"stakewars.com/api/internal/objectstore"
)

const (
	arbiterDetailMaximumDimension    = 512
	arbiterThumbnailMaximumDimension = 256
)

type ArbiterControllerReader interface {
	CurrentController(ctx context.Context, network string) (roundID uint64, address string, err error)
}

type ArbiterAuthorizeInput struct {
	ContentType   string
	DetailSize    int64
	ThumbnailSize int64
}

type ArbiterService struct {
	store       *Store
	objects     objectstore.Store
	controllers ArbiterControllerReader
	network     string
	maximumSize int64
	now         func() time.Time
	random      io.Reader
}

func NewArbiterService(
	store *Store,
	objects objectstore.Store,
	controllers ArbiterControllerReader,
	network string,
	maximumSize int64,
) *ArbiterService {
	return &ArbiterService{
		store: store, objects: objects, controllers: controllers, network: network,
		maximumSize: maximumSize, now: func() time.Time { return time.Now().UTC() }, random: rand.Reader,
	}
}

func (s *ArbiterService) Authorize(
	ctx context.Context,
	owner string,
	input ArbiterAuthorizeInput,
) (Authorization, error) {
	if s == nil || s.store == nil || s.objects == nil || s.controllers == nil {
		return Authorization{}, ErrUploadUnavailable
	}
	if !supportedContentType(input.ContentType) || input.DetailSize <= 0 ||
		input.DetailSize > s.maximumSize || input.ThumbnailSize <= 0 ||
		input.ThumbnailSize > s.maximumSize {
		return Authorization{}, ErrInvalidImage
	}
	roundID, controller, err := s.controllers.CurrentController(ctx, s.network)
	if err != nil {
		return Authorization{}, fmt.Errorf("verify Arbiter controller: %w", err)
	}
	if controller != owner {
		return Authorization{}, ErrForbidden
	}
	id, err := randomHex(s.random, 16)
	if err != nil {
		return Authorization{}, err
	}
	extension := extensionFor(input.ContentType)
	prefix := fmt.Sprintf("arbiter/%s/%d/%s", strings.ToLower(s.network), roundID, id)
	detailKey, thumbnailKey := prefix+"/detail"+extension, prefix+"/thumbnail"+extension
	detailAuth, err := s.objects.AuthorizePut(
		ctx, detailKey, input.ContentType, input.DetailSize, uploadAuthorizationLifetime,
	)
	if err != nil {
		return Authorization{}, err
	}
	thumbnailAuth, err := s.objects.AuthorizePut(
		ctx, thumbnailKey, input.ContentType, input.ThumbnailSize, uploadAuthorizationLifetime,
	)
	if err != nil {
		return Authorization{}, err
	}
	now := s.now().UTC().Truncate(time.Second)
	expiresAt := detailAuth.ExpiresAt
	if thumbnailAuth.ExpiresAt.Before(expiresAt) {
		expiresAt = thumbnailAuth.ExpiresAt
	}
	upload := ArbiterUpload{
		ID: id, Network: s.network, ControllerRoundID: roundID, OwnerAddress: owner,
		ContentType: input.ContentType, DetailObjectKey: detailKey, DetailSize: input.DetailSize,
		ThumbnailObjectKey: thumbnailKey, ThumbnailSize: input.ThumbnailSize,
		CreatedAt: now, ExpiresAt: expiresAt.UTC().Truncate(time.Second),
	}
	if err := s.store.CreateArbiterUpload(ctx, upload); err != nil {
		return Authorization{}, err
	}
	return Authorization{
		UploadID: id,
		Detail: UploadTarget{
			URL: detailAuth.URL, ContentType: input.ContentType,
			Bytes: input.DetailSize, ExpiresAt: detailAuth.ExpiresAt,
		},
		Thumbnail: UploadTarget{
			URL: thumbnailAuth.URL, ContentType: input.ContentType,
			Bytes: input.ThumbnailSize, ExpiresAt: thumbnailAuth.ExpiresAt,
		},
	}, nil
}

func (s *ArbiterService) Complete(
	ctx context.Context,
	uploadID string,
	owner string,
) (ArbiterArtwork, error) {
	if s == nil || s.store == nil || s.objects == nil || s.controllers == nil {
		return ArbiterArtwork{}, ErrUploadUnavailable
	}
	upload, err := s.store.ArbiterUpload(ctx, uploadID)
	if err != nil {
		return ArbiterArtwork{}, err
	}
	now := s.now().UTC().Truncate(time.Second)
	if upload.OwnerAddress != owner || upload.CompletedAt != nil || upload.ExpiresAt.Before(now) {
		return ArbiterArtwork{}, ErrForbidden
	}
	roundID, controller, err := s.controllers.CurrentController(ctx, s.network)
	if err != nil {
		return ArbiterArtwork{}, fmt.Errorf("verify Arbiter controller: %w", err)
	}
	if controller != owner || roundID != upload.ControllerRoundID {
		return ArbiterArtwork{}, ErrForbidden
	}
	detail, err := s.objects.Read(ctx, upload.DetailObjectKey, upload.DetailSize)
	if err != nil {
		return ArbiterArtwork{}, err
	}
	thumbnail, err := s.objects.Read(ctx, upload.ThumbnailObjectKey, upload.ThumbnailSize)
	if err != nil {
		return ArbiterArtwork{}, err
	}
	if int64(len(detail)) != upload.DetailSize || int64(len(thumbnail)) != upload.ThumbnailSize {
		return ArbiterArtwork{}, fmt.Errorf("%w: uploaded object size does not match authorization", ErrInvalidImage)
	}
	if err := validateArbiterImage(
		detail, upload.ContentType, arbiterDetailMaximumDimension,
	); err != nil {
		return ArbiterArtwork{}, err
	}
	if err := validateArbiterImage(
		thumbnail, upload.ContentType, arbiterThumbnailMaximumDimension,
	); err != nil {
		return ArbiterArtwork{}, err
	}
	hash := sha256.Sum256(detail)
	id, err := randomHex(s.random, 16)
	if err != nil {
		return ArbiterArtwork{}, err
	}
	artwork := ArbiterArtwork{
		ID: id, Network: upload.Network, ControllerRoundID: upload.ControllerRoundID,
		OwnerAddress: owner, ImageURL: s.objects.PublicURL(upload.DetailObjectKey),
		ThumbnailURL: s.objects.PublicURL(upload.ThumbnailObjectKey),
		ContentHash:  hex.EncodeToString(hash[:]), UpdatedAt: now,
	}
	if err := s.store.PublishArbiter(ctx, upload, artwork, now); err != nil {
		return ArbiterArtwork{}, err
	}
	return artwork, nil
}

func validateArbiterImage(data []byte, contentType string, maximumDimension int) error {
	configuration, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("%w: image cannot be decoded", ErrInvalidImage)
	}
	if format != strings.TrimPrefix(contentType, "image/") &&
		!(format == "jpeg" && contentType == "image/jpeg") {
		return fmt.Errorf("%w: image signature does not match content type", ErrInvalidImage)
	}
	if configuration.Width <= 0 || configuration.Height <= 0 ||
		configuration.Width > maximumDimension || configuration.Height > maximumDimension {
		return fmt.Errorf(
			"%w: Arbiter image dimensions must not exceed %dx%d",
			ErrInvalidImage,
			maximumDimension,
			maximumDimension,
		)
	}
	return nil
}
