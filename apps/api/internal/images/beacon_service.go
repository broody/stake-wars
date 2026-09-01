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
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"stakewars.com/api/internal/objectstore"
)

const (
	beaconDetailMaximumDimension    = 512
	beaconThumbnailMaximumDimension = 256
	beaconDescriptionMaximumLength  = 280
	beaconDestinationMaximumLength  = 2048
)

type BeaconControllerReader interface {
	CurrentController(ctx context.Context, network string) (
		roundID uint64,
		address string,
		activeArtworkID string,
		err error,
	)
}

type BeaconAuthorizeInput struct {
	Description    string
	DestinationURL string
	ContentType    string
	DetailSize     int64
	ThumbnailSize  int64
}

type BeaconService struct {
	store       *Store
	objects     objectstore.Store
	controllers BeaconControllerReader
	network     string
	maximumSize int64
	now         func() time.Time
	random      io.Reader
}

func NewBeaconService(
	store *Store,
	objects objectstore.Store,
	controllers BeaconControllerReader,
	network string,
	maximumSize int64,
) *BeaconService {
	return &BeaconService{
		store: store, objects: objects, controllers: controllers, network: network,
		maximumSize: maximumSize, now: func() time.Time { return time.Now().UTC() }, random: rand.Reader,
	}
}

func (s *BeaconService) Authorize(
	ctx context.Context,
	owner string,
	input BeaconAuthorizeInput,
) (Authorization, error) {
	if s == nil || s.store == nil || s.objects == nil || s.controllers == nil {
		return Authorization{}, ErrUploadUnavailable
	}
	description, destinationURL, err := normalizeBeaconAdvertisement(
		input.Description,
		input.DestinationURL,
	)
	if err != nil {
		return Authorization{}, err
	}
	if !supportedContentType(input.ContentType) || input.DetailSize <= 0 ||
		input.DetailSize > s.maximumSize || input.ThumbnailSize <= 0 ||
		input.ThumbnailSize > s.maximumSize {
		return Authorization{}, ErrInvalidImage
	}
	roundID, controller, activeArtworkID, err := s.controllers.CurrentController(ctx, s.network)
	if err != nil {
		return Authorization{}, fmt.Errorf("verify Beacon controller: %w", err)
	}
	if controller != owner {
		return Authorization{}, ErrForbidden
	}
	if activeArtworkID != "" {
		return Authorization{}, ErrBeaconAlreadyPublished
	}
	id, err := randomHex(s.random, 16)
	if err != nil {
		return Authorization{}, err
	}
	extension := extensionFor(input.ContentType)
	prefix := fmt.Sprintf("beacon/%s/%d/%s", strings.ToLower(s.network), roundID, id)
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
	upload := BeaconUpload{
		ID: id, Network: s.network, ControllerRoundID: roundID, OwnerAddress: owner,
		Description: description, DestinationURL: destinationURL,
		ContentType: input.ContentType, DetailObjectKey: detailKey, DetailSize: input.DetailSize,
		ThumbnailObjectKey: thumbnailKey, ThumbnailSize: input.ThumbnailSize,
		CreatedAt: now, ExpiresAt: expiresAt.UTC().Truncate(time.Second),
	}
	if err := s.store.CreateBeaconUpload(ctx, upload); err != nil {
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

func (s *BeaconService) Complete(
	ctx context.Context,
	uploadID string,
	owner string,
) (BeaconArtwork, error) {
	if s == nil || s.store == nil || s.objects == nil || s.controllers == nil {
		return BeaconArtwork{}, ErrUploadUnavailable
	}
	upload, err := s.store.BeaconUpload(ctx, uploadID)
	if err != nil {
		return BeaconArtwork{}, err
	}
	now := s.now().UTC().Truncate(time.Second)
	if upload.OwnerAddress != owner || upload.CompletedAt != nil || upload.ExpiresAt.Before(now) {
		return BeaconArtwork{}, ErrForbidden
	}
	roundID, controller, activeArtworkID, err := s.controllers.CurrentController(ctx, s.network)
	if err != nil {
		return BeaconArtwork{}, fmt.Errorf("verify Beacon controller: %w", err)
	}
	if controller != owner || roundID != upload.ControllerRoundID {
		return BeaconArtwork{}, ErrForbidden
	}
	if activeArtworkID != "" {
		return BeaconArtwork{}, ErrBeaconAlreadyPublished
	}
	detail, err := s.objects.Read(ctx, upload.DetailObjectKey, upload.DetailSize)
	if err != nil {
		return BeaconArtwork{}, err
	}
	thumbnail, err := s.objects.Read(ctx, upload.ThumbnailObjectKey, upload.ThumbnailSize)
	if err != nil {
		return BeaconArtwork{}, err
	}
	if int64(len(detail)) != upload.DetailSize || int64(len(thumbnail)) != upload.ThumbnailSize {
		return BeaconArtwork{}, fmt.Errorf("%w: uploaded object size does not match authorization", ErrInvalidImage)
	}
	if err := validateBeaconImage(
		detail, upload.ContentType, beaconDetailMaximumDimension,
	); err != nil {
		return BeaconArtwork{}, err
	}
	if err := validateBeaconImage(
		thumbnail, upload.ContentType, beaconThumbnailMaximumDimension,
	); err != nil {
		return BeaconArtwork{}, err
	}
	hash := sha256.Sum256(detail)
	id, err := randomHex(s.random, 16)
	if err != nil {
		return BeaconArtwork{}, err
	}
	artwork := BeaconArtwork{
		ID: id, Network: upload.Network, ControllerRoundID: upload.ControllerRoundID,
		OwnerAddress: owner, Description: upload.Description,
		DestinationURL: upload.DestinationURL,
		ImageURL:       s.objects.PublicURL(upload.DetailObjectKey),
		ThumbnailURL:   s.objects.PublicURL(upload.ThumbnailObjectKey),
		ContentHash:    hex.EncodeToString(hash[:]), UpdatedAt: now,
	}
	if err := s.store.PublishBeacon(ctx, upload, artwork, now); err != nil {
		return BeaconArtwork{}, err
	}
	return artwork, nil
}

func normalizeBeaconAdvertisement(description, destinationURL string) (string, string, error) {
	description = strings.TrimSpace(description)
	destinationURL = strings.TrimSpace(destinationURL)
	if description == "" || !utf8.ValidString(description) ||
		utf8.RuneCountInString(description) > beaconDescriptionMaximumLength {
		return "", "", fmt.Errorf(
			"%w: description must contain 1-%d characters",
			ErrInvalidAdvertisement,
			beaconDescriptionMaximumLength,
		)
	}
	if destinationURL != "" && !strings.Contains(destinationURL, "://") {
		destinationURL = "https://" + destinationURL
	}
	if destinationURL == "" || len(destinationURL) > beaconDestinationMaximumLength {
		return "", "", fmt.Errorf(
			"%w: destination URL must contain 1-%d characters",
			ErrInvalidAdvertisement,
			beaconDestinationMaximumLength,
		)
	}
	parsed, err := url.Parse(destinationURL)
	if err != nil || parsed.Hostname() == "" || parsed.User != nil ||
		(parsed.Scheme != "https" && parsed.Scheme != "http") {
		return "", "", fmt.Errorf(
			"%w: destination URL must be an absolute HTTP or HTTPS URL without credentials",
			ErrInvalidAdvertisement,
		)
	}
	return description, parsed.String(), nil
}

func validateBeaconImage(data []byte, contentType string, maximumDimension int) error {
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
			"%w: Beacon image dimensions must not exceed %dx%d",
			ErrInvalidImage,
			maximumDimension,
			maximumDimension,
		)
	}
	return nil
}
