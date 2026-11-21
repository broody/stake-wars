package survivor

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// The local UUID is a guest's credential. Only its digest appears on public boards.
var guestUUID = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var ErrGuest = errors.New("a guest UUID v4 is required")
var ErrName = errors.New("choose a name with 1 to 32 visible characters")

func GuestPlayer(id string) (string, error) {
	if !guestUUID.MatchString(id) {
		return "", ErrGuest
	}
	digest := sha256.Sum256([]byte(strings.ToLower(id)))
	return "guest-" + hex.EncodeToString(digest[:]), nil
}

func guest(player string) bool { return strings.HasPrefix(player, "guest-") }

var ErrRevision = errors.New("the name changed; sign the new revision")

func ValidName(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" || utf8.RuneCountInString(value) > 32 || strings.IndexFunc(value, func(r rune) bool { return !unicode.IsPrint(r) }) >= 0 {
		return "", ErrName
	}
	return value, nil
}

func (s *Store) SetGuestName(ctx context.Context, player, raw string) (string, error) {
	if !guest(player) {
		return "", ErrGuest
	}
	value, err := ValidName(raw)
	if err != nil {
		return "", err
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO survivor_profiles(network,player,name) VALUES(?,?,?)
    ON CONFLICT(network,player) DO UPDATE SET name=excluded.name`, s.Network, player, value)
	return value, err
}

func (s *Store) NextNameRevision(ctx context.Context, wallet string) (int64, error) {
	var next int64
	err := s.DB.QueryRowContext(ctx, "SELECT coalesce((SELECT revision FROM survivor_profiles WHERE network=? AND player=?),0)+1", s.Network, wallet).Scan(&next)
	return next, err
}

func (s *Store) SetWalletName(ctx context.Context, wallet, name string, revision int64) error {
	result, err := s.DB.ExecContext(ctx, `INSERT INTO survivor_profiles(network,player,name,revision)
        SELECT ?,?,?,? WHERE ?=coalesce((SELECT revision FROM survivor_profiles WHERE network=? AND player=?),0)+1
        ON CONFLICT(network,player) DO UPDATE SET name=excluded.name,revision=excluded.revision`, s.Network, wallet, name, revision, revision, s.Network, wallet)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n == 0 {
		return ErrRevision
	}
	return err
}

func (s *Store) Profile(ctx context.Context, player string) (string, error) {
	var saved string
	err := s.DB.QueryRowContext(ctx, "SELECT name FROM survivor_profiles WHERE network=? AND player=?", s.Network, player).Scan(&saved)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return saved, err
}
