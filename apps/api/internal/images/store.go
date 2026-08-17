package images

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

var ErrUploadNotFound = errors.New("image upload not found")

type Target struct {
	ControlPointID      uint32 `json:"controlPointId"`
	OwnershipGeneration uint64 `json:"ownershipGeneration"`
}

type Placement struct {
	ProjectorMatrix []float64 `json:"projectorMatrix"`
	CenterX         float64   `json:"centerX"`
	CenterY         float64   `json:"centerY"`
	Scale           float64   `json:"scale"`
	Rotation        float64   `json:"rotation"`
	ViewportAspect  float64   `json:"viewportAspect"`
}

type Upload struct {
	ID                 string
	Network            string
	OwnerAddress       string
	Targets            []Target
	Placement          Placement
	ContentType        string
	DetailObjectKey    string
	DetailSize         int64
	ThumbnailObjectKey string
	ThumbnailSize      int64
	CreatedAt          time.Time
	ExpiresAt          time.Time
	CompletedAt        *time.Time
}

type Artwork struct {
	ID           string    `json:"id"`
	Network      string    `json:"network"`
	OwnerAddress string    `json:"ownerAddress"`
	Targets      []Target  `json:"targets"`
	Placement    Placement `json:"placement"`
	ImageURL     string    `json:"imageUrl"`
	ThumbnailURL string    `json:"thumbnailUrl"`
	ContentHash  string    `json:"contentHash"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func (s *Store) CreateUpload(ctx context.Context, upload Upload) error {
	matrix, err := json.Marshal(upload.Placement.ProjectorMatrix)
	if err != nil {
		return fmt.Errorf("encode projector matrix: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin image upload: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO image_uploads(
			id, network, owner_address, content_type, detail_object_key,
			detail_size, thumbnail_object_key, thumbnail_size, projector_matrix,
			placement_center_x, placement_center_y, placement_scale,
			placement_rotation, viewport_aspect, created_at, expires_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, upload.ID, upload.Network, upload.OwnerAddress, upload.ContentType,
		upload.DetailObjectKey, upload.DetailSize, upload.ThumbnailObjectKey,
		upload.ThumbnailSize, string(matrix), upload.Placement.CenterX,
		upload.Placement.CenterY, upload.Placement.Scale, upload.Placement.Rotation,
		upload.Placement.ViewportAspect, upload.CreatedAt.Unix(), upload.ExpiresAt.Unix())
	if err != nil {
		return fmt.Errorf("create image upload: %w", err)
	}
	for _, target := range upload.Targets {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO image_upload_targets(upload_id, control_point_id, ownership_generation)
			VALUES (?, ?, ?)
		`, upload.ID, target.ControlPointID, target.OwnershipGeneration); err != nil {
			return fmt.Errorf("create image upload target: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit image upload: %w", err)
	}
	return nil
}

func (s *Store) Upload(ctx context.Context, id string) (Upload, error) {
	var upload Upload
	var matrix string
	var createdAt, expiresAt int64
	var completedAt sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT id, network, owner_address, content_type, detail_object_key,
			detail_size, thumbnail_object_key, thumbnail_size, projector_matrix,
			placement_center_x, placement_center_y, placement_scale,
			placement_rotation, viewport_aspect, created_at, expires_at, completed_at
		FROM image_uploads WHERE id = ?
	`, id).Scan(&upload.ID, &upload.Network, &upload.OwnerAddress,
		&upload.ContentType, &upload.DetailObjectKey, &upload.DetailSize,
		&upload.ThumbnailObjectKey, &upload.ThumbnailSize, &matrix,
		&upload.Placement.CenterX, &upload.Placement.CenterY, &upload.Placement.Scale,
		&upload.Placement.Rotation, &upload.Placement.ViewportAspect,
		&createdAt, &expiresAt, &completedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Upload{}, ErrUploadNotFound
	}
	if err != nil {
		return Upload{}, fmt.Errorf("read image upload: %w", err)
	}
	if err := json.Unmarshal([]byte(matrix), &upload.Placement.ProjectorMatrix); err != nil {
		return Upload{}, fmt.Errorf("decode projector matrix: %w", err)
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT control_point_id, ownership_generation
		FROM image_upload_targets WHERE upload_id = ? ORDER BY control_point_id
	`, id)
	if err != nil {
		return Upload{}, fmt.Errorf("read image upload targets: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var target Target
		if err := rows.Scan(&target.ControlPointID, &target.OwnershipGeneration); err != nil {
			return Upload{}, fmt.Errorf("scan image upload target: %w", err)
		}
		upload.Targets = append(upload.Targets, target)
	}
	upload.CreatedAt = time.Unix(createdAt, 0).UTC()
	upload.ExpiresAt = time.Unix(expiresAt, 0).UTC()
	if completedAt.Valid {
		completed := time.Unix(completedAt.Int64, 0).UTC()
		upload.CompletedAt = &completed
	}
	return upload, rows.Err()
}

func (s *Store) Publish(ctx context.Context, upload Upload, artwork Artwork, completedAt time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin artwork publish: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `
		UPDATE image_uploads SET completed_at = ?
		WHERE id = ? AND completed_at IS NULL AND expires_at >= ?
	`, completedAt.Unix(), upload.ID, completedAt.Unix())
	if err != nil {
		return fmt.Errorf("complete image upload: %w", err)
	}
	if updated, err := result.RowsAffected(); err != nil || updated != 1 {
		return ErrUploadNotFound
	}
	matrix, _ := json.Marshal(artwork.Placement.ProjectorMatrix)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO control_point_artworks(
			id, network, owner_address, image_url, object_key, thumbnail_url,
			thumbnail_object_key, content_hash, projector_matrix, placement_center_x,
			placement_center_y, placement_scale, placement_rotation, viewport_aspect,
			moderation_status, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
	`, artwork.ID, artwork.Network, artwork.OwnerAddress, artwork.ImageURL,
		upload.DetailObjectKey, artwork.ThumbnailURL, upload.ThumbnailObjectKey,
		artwork.ContentHash, string(matrix), artwork.Placement.CenterX,
		artwork.Placement.CenterY, artwork.Placement.Scale, artwork.Placement.Rotation,
		artwork.Placement.ViewportAspect, completedAt.Unix(), completedAt.Unix())
	if err != nil {
		return fmt.Errorf("publish artwork: %w", err)
	}
	for _, target := range artwork.Targets {
		if _, err := tx.ExecContext(ctx, `
			UPDATE control_point_artwork_targets SET active = 0
			WHERE control_point_id = ? AND active = 1 AND artwork_id IN (
				SELECT id FROM control_point_artworks WHERE network = ?
			)
		`, target.ControlPointID, artwork.Network); err != nil {
			return fmt.Errorf("supersede artwork target: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO control_point_artwork_targets(
				artwork_id, control_point_id, ownership_generation, active
			) VALUES (?, ?, ?, 1)
		`, artwork.ID, target.ControlPointID, target.OwnershipGeneration); err != nil {
			return fmt.Errorf("publish artwork target: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit artwork publish: %w", err)
	}
	return nil
}

func (s *Store) Approved(ctx context.Context, network string) ([]Artwork, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.id, a.network, a.owner_address, a.image_url, a.thumbnail_url,
			a.content_hash, a.projector_matrix, a.placement_center_x,
			a.placement_center_y, a.placement_scale, a.placement_rotation,
			a.viewport_aspect, a.updated_at, t.control_point_id,
			t.ownership_generation
		FROM control_point_artworks a
		JOIN control_point_artwork_targets t ON t.artwork_id = a.id
		WHERE a.network = ? AND a.moderation_status = 'approved' AND t.active = 1
		ORDER BY a.updated_at ASC, a.id ASC, t.control_point_id ASC
	`, network)
	if err != nil {
		return nil, fmt.Errorf("list artworks: %w", err)
	}
	defer rows.Close()
	byID := make(map[string]*Artwork)
	result := make([]Artwork, 0)
	for rows.Next() {
		var artwork Artwork
		var matrix string
		var updatedAt int64
		var target Target
		if err := rows.Scan(&artwork.ID, &artwork.Network, &artwork.OwnerAddress,
			&artwork.ImageURL, &artwork.ThumbnailURL, &artwork.ContentHash, &matrix,
			&artwork.Placement.CenterX, &artwork.Placement.CenterY,
			&artwork.Placement.Scale, &artwork.Placement.Rotation,
			&artwork.Placement.ViewportAspect, &updatedAt, &target.ControlPointID,
			&target.OwnershipGeneration); err != nil {
			return nil, fmt.Errorf("scan artwork: %w", err)
		}
		current := byID[artwork.ID]
		if current == nil {
			if err := json.Unmarshal([]byte(matrix), &artwork.Placement.ProjectorMatrix); err != nil {
				return nil, fmt.Errorf("decode artwork projector matrix: %w", err)
			}
			artwork.UpdatedAt = time.Unix(updatedAt, 0).UTC()
			result = append(result, artwork)
			current = &result[len(result)-1]
			byID[artwork.ID] = current
		}
		current.Targets = append(current.Targets, target)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate artworks: %w", err)
	}
	return result, nil
}
