package images

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type ArbiterUpload struct {
	ID                 string
	Network            string
	ControllerRoundID  uint64
	OwnerAddress       string
	ContentType        string
	DetailObjectKey    string
	DetailSize         int64
	ThumbnailObjectKey string
	ThumbnailSize      int64
	CreatedAt          time.Time
	ExpiresAt          time.Time
	CompletedAt        *time.Time
}

type ArbiterArtwork struct {
	ID                string    `json:"id"`
	Network           string    `json:"network"`
	ControllerRoundID uint64    `json:"controllerRoundId"`
	OwnerAddress      string    `json:"ownerAddress"`
	ImageURL          string    `json:"imageUrl"`
	ThumbnailURL      string    `json:"thumbnailUrl"`
	ContentHash       string    `json:"contentHash"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

func (s *Store) CreateArbiterUpload(ctx context.Context, upload ArbiterUpload) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO arbiter_image_uploads(
			id, network, controller_round_id, owner_address, content_type,
			detail_object_key, detail_size, thumbnail_object_key, thumbnail_size,
			created_at, expires_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, upload.ID, upload.Network, upload.ControllerRoundID, upload.OwnerAddress,
		upload.ContentType, upload.DetailObjectKey, upload.DetailSize,
		upload.ThumbnailObjectKey, upload.ThumbnailSize, upload.CreatedAt.Unix(),
		upload.ExpiresAt.Unix())
	if err != nil {
		return fmt.Errorf("create Arbiter image upload: %w", err)
	}
	return nil
}

func (s *Store) ArbiterUpload(ctx context.Context, id string) (ArbiterUpload, error) {
	var upload ArbiterUpload
	var createdAt, expiresAt int64
	var completedAt sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT id, network, controller_round_id, owner_address, content_type,
			detail_object_key, detail_size, thumbnail_object_key, thumbnail_size,
			created_at, expires_at, completed_at
		FROM arbiter_image_uploads WHERE id = ?
	`, id).Scan(&upload.ID, &upload.Network, &upload.ControllerRoundID,
		&upload.OwnerAddress, &upload.ContentType, &upload.DetailObjectKey,
		&upload.DetailSize, &upload.ThumbnailObjectKey, &upload.ThumbnailSize,
		&createdAt, &expiresAt, &completedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ArbiterUpload{}, ErrUploadNotFound
	}
	if err != nil {
		return ArbiterUpload{}, fmt.Errorf("read Arbiter image upload: %w", err)
	}
	upload.CreatedAt = time.Unix(createdAt, 0).UTC()
	upload.ExpiresAt = time.Unix(expiresAt, 0).UTC()
	if completedAt.Valid {
		completed := time.Unix(completedAt.Int64, 0).UTC()
		upload.CompletedAt = &completed
	}
	return upload, nil
}

func (s *Store) PublishArbiter(
	ctx context.Context,
	upload ArbiterUpload,
	artwork ArbiterArtwork,
	completedAt time.Time,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin Arbiter artwork publish: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var currentRoundID uint64
	var currentController string
	err = tx.QueryRowContext(ctx, `
		SELECT round_id, claimed_controller
		FROM arbiter_rounds
		WHERE network = ? AND claimed_controller IS NOT NULL
		ORDER BY round_id DESC LIMIT 1
	`, upload.Network).Scan(&currentRoundID, &currentController)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return fmt.Errorf("read current Arbiter controller: %w", err)
	}
	if currentRoundID != upload.ControllerRoundID || currentController != upload.OwnerAddress {
		return ErrForbidden
	}

	result, err := tx.ExecContext(ctx, `
		UPDATE arbiter_image_uploads SET completed_at = ?
		WHERE id = ? AND completed_at IS NULL AND expires_at >= ?
	`, completedAt.Unix(), upload.ID, completedAt.Unix())
	if err != nil {
		return fmt.Errorf("complete Arbiter image upload: %w", err)
	}
	if updated, rowsErr := result.RowsAffected(); rowsErr != nil || updated != 1 {
		return ErrUploadNotFound
	}

	var previousArtwork sql.NullString
	if err := tx.QueryRowContext(ctx, `
		SELECT active_artwork_id FROM arbiter_rounds
		WHERE network = ? AND round_id = ?
	`, upload.Network, upload.ControllerRoundID).Scan(&previousArtwork); err != nil {
		return fmt.Errorf("read active Arbiter artwork: %w", err)
	}
	if previousArtwork.Valid && previousArtwork.String != "" {
		if _, err := tx.ExecContext(ctx, `
			UPDATE arbiter_artworks
			SET moderation_status = 'superseded', updated_at = ?
			WHERE id = ? AND network = ? AND moderation_status = 'approved'
		`, completedAt.Unix(), previousArtwork.String, upload.Network); err != nil {
			return fmt.Errorf("supersede Arbiter artwork: %w", err)
		}
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO arbiter_artworks(
			id, network, controller_round_id, owner_address, image_url, object_key,
			thumbnail_url, thumbnail_object_key, content_hash, moderation_status,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
	`, artwork.ID, artwork.Network, artwork.ControllerRoundID, artwork.OwnerAddress,
		artwork.ImageURL, upload.DetailObjectKey, artwork.ThumbnailURL,
		upload.ThumbnailObjectKey, artwork.ContentHash, completedAt.Unix(),
		completedAt.Unix())
	if err != nil {
		return fmt.Errorf("publish Arbiter artwork: %w", err)
	}
	result, err = tx.ExecContext(ctx, `
		UPDATE arbiter_rounds
		SET active_artwork_id = ?, updated_at = unixepoch()
		WHERE network = ? AND round_id = ? AND claimed_controller = ?
	`, artwork.ID, upload.Network, upload.ControllerRoundID, upload.OwnerAddress)
	if err != nil {
		return fmt.Errorf("activate Arbiter artwork: %w", err)
	}
	if updated, rowsErr := result.RowsAffected(); rowsErr != nil || updated != 1 {
		return ErrForbidden
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit Arbiter artwork publish: %w", err)
	}
	return nil
}
