package survivor

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrDay     = errors.New("daily prize deadlines must be at least 24 hours apart")
	ErrClosed  = errors.New("this prize round is closed")
	ErrTicket  = errors.New("this run is unavailable or has been replaced")
	ErrOverlap = errors.New("a Survivor round is already open")
	ErrReplay  = errors.New("the run could not be verified")
	ErrBusy    = errors.New("another run is being verified; please retry")
)

type Round struct {
	ID              int64     `json:"id"`
	Deadline        time.Time `json:"deadline"`
	Closed          bool      `json:"closed"`
	PrizeAmount     *string   `json:"prizeAmount"`
	PaymentStatus   string    `json:"paymentStatus,omitempty"`
	TransactionHash string    `json:"transactionHash,omitempty"`
	PreviousID      *int64    `json:"previousId,omitempty"`
	Winner          *Entry    `json:"winner"`
}

type Upgrade struct {
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	Level int    `json:"level,omitempty"`
}

type RunResult struct {
	Destroyed       int       `json:"destroyed"`
	DurationSeconds int       `json:"durationSeconds"`
	Upgrades        []Upgrade `json:"upgrades"`
}

type Entry struct {
	Outis           bool      `json:"outis"`
	DurationSeconds *int      `json:"durationSeconds"`
	Upgrades        []Upgrade `json:"upgrades"`
	Wallet          string    `json:"wallet,omitempty"`
	Guest           string    `json:"guest,omitempty"`
	Name            string    `json:"name,omitempty"`
	Destroyed       int       `json:"destroyed"`
}

type Board struct {
	PayoutsEnabled bool    `json:"payoutsEnabled"`
	Network        string  `json:"network"`
	Round          *Round  `json:"round"`
	Entries        []Entry `json:"entries"`
}

type Ticket struct {
	Token string `json:"token"`
	Seed  uint32 `json:"seed"`
}

type Store struct {
	DB      *sql.DB
	Network string
	Now     func() time.Time
	Verify  func(context.Context, uint32, []byte, int64) (RunResult, error)
}

func NewStore(db *sql.DB, network string) *Store {
	return &Store{DB: db, Network: network, Now: time.Now, Verify: verifyReplay}
}

func (s *Store) Open(ctx context.Context, deadline time.Time) (int64, error) {
	now := s.Now().Unix()
	if deadline.Unix() <= now {
		return 0, ErrClosed
	}
	result, err := s.DB.ExecContext(ctx, `
        INSERT INTO survivor_rounds (network,deadline,prize_amount)
        SELECT ?,?,? WHERE NOT EXISTS (
            SELECT 1 FROM survivor_rounds WHERE network=? AND (deadline>? OR (prize_amount IS NOT NULL AND deadline>?))
        )`, s.Network, deadline.Unix(), DailyPrize, s.Network, now, deadline.Add(-24*time.Hour).Unix())
	if err != nil {
		return 0, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	if n == 0 {
		var active bool
		err = s.DB.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM survivor_rounds WHERE network=? AND deadline>?)", s.Network, now).Scan(&active)
		if err != nil {
			return 0, err
		}
		if active {
			return 0, ErrOverlap
		}
		return 0, ErrDay
	}
	return result.LastInsertId()
}

// Board reads the round, its frozen winner and the standings from one snapshot.
// ID zero selects the latest round, including a closed round between contests.
func (s *Store) Board(ctx context.Context, id int64) (Board, error) {
	b := Board{Network: s.Network, Entries: []Entry{}}
	now := s.Now()
	if id == 0 {
		if err := s.rollOver(ctx, now); err != nil {
			return b, err
		}
	}
	tx, err := s.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return b, err
	}
	defer tx.Rollback()
	var r Round
	var deadline int64
	var wallet sql.NullString
	var score sql.NullInt64
	var duration *int
	var winnerUpgrades []byte
	err = tx.QueryRowContext(ctx, `SELECT id,deadline,leader_wallet,leading_destroyed,leader_duration_seconds,leader_upgrades,prize_amount,
        (SELECT MAX(old.id) FROM survivor_rounds old WHERE old.network=survivor_rounds.network AND old.id<survivor_rounds.id)
        FROM survivor_rounds WHERE network=? AND (?=0 OR id=?) ORDER BY id DESC LIMIT 1`, s.Network, id, id).Scan(&r.ID, &deadline, &wallet, &score, &duration, &winnerUpgrades, &r.PrizeAmount, &r.PreviousID)
	if errors.Is(err, sql.ErrNoRows) && id == 0 {
		b.Entries, err = s.standings(ctx, tx, 0)
		return b, err
	}
	if err != nil {
		return b, err
	}
	r.Deadline = time.Unix(deadline, 0).UTC()
	r.Closed = now.Unix() >= deadline
	if r.Closed && wallet.Valid {
		r.Winner = &Entry{Wallet: wallet.String, Destroyed: int(score.Int64), DurationSeconds: duration, Outis: r.PrizeAmount != nil}
		if err = tx.QueryRowContext(ctx, "SELECT coalesce((SELECT name FROM survivor_profiles WHERE network=? AND player=?),'')", s.Network, wallet.String).Scan(&r.Winner.Name); err != nil {
			return b, err
		}
		if winnerUpgrades != nil {
			if err = json.Unmarshal(winnerUpgrades, &r.Winner.Upgrades); err != nil {
				return b, err
			}
		}
	}
	if r.Winner != nil && r.PrizeAmount != nil {
		err = tx.QueryRowContext(ctx, `SELECT status,transaction_hash FROM transaction_attempts WHERE network=? AND source='keeper' AND entrypoint='transfer' AND target_id=? ORDER BY id DESC LIMIT 1`, s.Network, prizeTarget(r.ID)).Scan(&r.PaymentStatus, &r.TransactionHash)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return b, err
		}
	}
	b.Round = &r
	b.Entries, err = s.standings(ctx, tx, r.ID)
	return b, err
}

type standingsReader interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func (s *Store) AllTime(ctx context.Context) (Board, error) {
	entries, err := s.standings(ctx, s.DB, 0)
	return Board{Network: s.Network, Entries: entries}, err
}

func (s *Store) standings(ctx context.Context, db standingsReader, roundID int64) ([]Entry, error) {
	args := []any{s.Network}
	filter := ""
	if roundID != 0 {
		filter = " AND round_id=?"
		args = append(args, roundID)
	}
	rows, err := db.QueryContext(ctx, `WITH ranked AS (
        SELECT id,destroyed,
               row_number() OVER (PARTITION BY player ORDER BY destroyed DESC,id) AS position
        FROM survivor_runs WHERE destroyed IS NOT NULL AND network=?`+filter+`
    ), leaders AS (SELECT id FROM ranked WHERE position=1 ORDER BY destroyed DESC,id LIMIT 100)
      SELECT r.player,r.destroyed,r.duration_seconds,r.upgrades,r.outis,coalesce(p.name,'')
      FROM leaders JOIN survivor_runs r ON r.id=leaders.id
      LEFT JOIN survivor_profiles p ON p.network=r.network AND p.player=r.player
      ORDER BY r.destroyed DESC,r.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []Entry{}
	for rows.Next() {
		var e Entry
		var player string
		var upgrades []byte
		if err := rows.Scan(&player, &e.Destroyed, &e.DurationSeconds, &upgrades, &e.Outis, &e.Name); err != nil {
			return nil, err
		}
		if guest(player) {
			e.Guest = player
		} else {
			e.Wallet = player
		}
		if upgrades != nil {
			if err := json.Unmarshal(upgrades, &e.Upgrades); err != nil {
				return nil, err
			}
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// The signed payload contains the round, issue time and a random nonce.
func (s *Store) Start(ctx context.Context, roundID int64) (Ticket, error) {
	var key []byte
	now := s.Now()
	if err := s.rollOver(ctx, now); err != nil {
		return Ticket{}, err
	}
	// A new client lets the server select the open prize round, if any.
	var active int64
	err := s.DB.QueryRowContext(ctx, `SELECT key,coalesce((SELECT id FROM survivor_rounds WHERE network=? AND deadline>? ORDER BY id DESC LIMIT 1),0) FROM survivor_ticket_key`, s.Network, now.Unix()).Scan(&key, &active)
	if err != nil {
		return Ticket{}, err
	}
	if roundID != 0 && roundID != active {
		return Ticket{}, ErrClosed
	}
	roundID = active
	var payload [32]byte
	binary.BigEndian.PutUint64(payload[:8], uint64(roundID))
	binary.BigEndian.PutUint64(payload[8:16], uint64(now.UnixMilli()))
	rand.Read(payload[16:])
	mac := hmac.New(sha256.New, key)
	if roundID == 0 {
		mac.Write([]byte(s.Network))
	}
	mac.Write(payload[:])
	return Ticket{Token: hex.EncodeToString(append(payload[:], mac.Sum(nil)...)), Seed: binary.BigEndian.Uint32(payload[16:20])}, nil
}

type admission struct {
	roundID, started, deadline int64
	seed                       uint32
	score                      sql.NullInt64
}

func (s *Store) admission(ctx context.Context, token, wallet string, digest []byte) (a admission, err error) {
	raw, err := hex.DecodeString(token)
	if err != nil || (len(raw) != 32 && len(raw) != 64) {
		return a, ErrTicket
	}
	var owner string
	err = s.DB.QueryRowContext(ctx, `SELECT coalesce(t.round_id,0),coalesce(r.deadline,0),coalesce(t.started_ms,0),coalesce(t.seed,0),t.player,t.destroyed
        FROM survivor_runs t LEFT JOIN survivor_rounds r ON r.id=t.round_id WHERE t.ticket_hash=? AND t.network=?`, digest, s.Network).Scan(&a.roundID, &a.deadline, &a.started, &a.seed, &owner, &a.score)
	if err == nil {
		if owner != wallet {
			return a, ErrTicket
		}
		return a, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return a, err
	}
	if len(raw) != 64 {
		return a, ErrTicket
	}
	a.roundID = int64(binary.BigEndian.Uint64(raw[:8]))
	var key []byte
	if a.roundID == 0 {
		err = s.DB.QueryRowContext(ctx, "SELECT key FROM survivor_ticket_key").Scan(&key)
	} else {
		err = s.DB.QueryRowContext(ctx, `SELECT key,deadline FROM survivor_ticket_key,survivor_rounds r WHERE r.id=? AND network=?`, a.roundID, s.Network).Scan(&key, &a.deadline)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrTicket
	}
	if err != nil {
		return a, err
	}
	mac := hmac.New(sha256.New, key)
	if a.roundID == 0 {
		mac.Write([]byte(s.Network))
	}
	mac.Write(raw[:32])
	if !hmac.Equal(raw[32:], mac.Sum(nil)) {
		return a, ErrTicket
	}
	a.started = int64(binary.BigEndian.Uint64(raw[8:16]))
	a.seed = binary.BigEndian.Uint32(raw[16:20])
	return a, nil
}

func (s *Store) Finish(ctx context.Context, token, wallet string, replay []byte, checkOutis func(context.Context, string) (bool, error)) (int, error) {
	if len(token) != 64 && len(token) != 128 {
		return 0, ErrTicket
	}
	// Canonical lowercase encoding gives every ticket exactly one receipt key.
	if strings.ToLower(token) != token {
		return 0, ErrTicket
	}
	digest := sha256.Sum256([]byte(token))
	a, err := s.admission(ctx, token, wallet, digest[:])
	if err != nil {
		return 0, err
	}
	if a.score.Valid {
		return int(a.score.Int64), nil
	}
	now := s.Now()

	verified, err := s.Verify(ctx, a.seed, replay, now.UnixMilli()-a.started)
	if err != nil {
		return 0, err
	}
	outis := false
	if !guest(wallet) {
		outis, err = checkOutis(ctx, wallet)
		if err != nil {
			return 0, err
		}
	}
	upgrades, err := json.Marshal(verified.Upgrades)
	if err != nil {
		return 0, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	// A late replay still belongs on the all-time board. The daily winner is frozen.
	if s.Now().Unix() >= a.deadline {
		a.roundID = 0
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO survivor_runs(ticket_hash,network,round_id,player,destroyed,duration_seconds,upgrades,outis)
        VALUES(?,?,nullif(?,0),?,?,?,?,?)
        ON CONFLICT(ticket_hash) DO UPDATE SET round_id=excluded.round_id,destroyed=excluded.destroyed,
        duration_seconds=excluded.duration_seconds,upgrades=excluded.upgrades,outis=excluded.outis
        WHERE survivor_runs.player=excluded.player AND survivor_runs.network=excluded.network AND survivor_runs.destroyed IS NULL`,
		digest[:], s.Network, a.roundID, wallet, verified.Destroyed, verified.DurationSeconds, string(upgrades), outis)
	if err != nil {
		return 0, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	if n == 0 {
		var saved int
		err = tx.QueryRowContext(ctx, "SELECT destroyed FROM survivor_runs WHERE ticket_hash=? AND player=? AND network=?", digest[:], wallet, s.Network).Scan(&saved)
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrTicket
		}
		return saved, err
	}
	if a.roundID != 0 {
		if _, err = tx.ExecContext(ctx, "UPDATE survivor_rounds SET submissions=submissions+1 WHERE id=?", a.roundID); err != nil {
			return 0, err
		}
		if !guest(wallet) {
			if err = updateLeader(ctx, tx, digest[:]); err != nil {
				return 0, err
			}
		}
	}
	return verified.Destroyed, tx.Commit()
}

// Strict improvement preserves the first eligible wallet on a tie.
func updateLeader(ctx context.Context, tx *sql.Tx, digest []byte) error {
	_, err := tx.ExecContext(ctx, `UPDATE survivor_rounds AS r SET
        (leader_wallet,leading_destroyed,leader_duration_seconds,leader_upgrades)=(t.player,t.destroyed,t.duration_seconds,t.upgrades)
        FROM survivor_runs AS t WHERE t.ticket_hash=? AND r.id=t.round_id AND (t.outis OR r.prize_amount IS NULL)
        AND (r.leading_destroyed IS NULL OR t.destroyed>r.leading_destroyed)`, digest)
	return err
}

// Move one already verified guest run to its signed wallet. The guest UUID and
// the original ticket are both required. The replay and prize cannot be counted twice.
func (s *Store) Attach(ctx context.Context, token, from, wallet string, checkOutis func(context.Context, string) (bool, error)) error {
	digest := sha256.Sum256([]byte(token))
	var owner string
	var deadline *int64
	err := s.DB.QueryRowContext(ctx, `SELECT t.player,r.deadline FROM survivor_runs t LEFT JOIN survivor_rounds r ON r.id=t.round_id
        WHERE ticket_hash=? AND t.network=? AND destroyed IS NOT NULL`, digest[:], s.Network).Scan(&owner, &deadline)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrTicket
	}
	if err != nil {
		return err
	}
	if owner == wallet {
		return nil
	}
	if owner != from || !guest(from) {
		return ErrTicket
	}
	if deadline != nil && *deadline <= s.Now().Unix() {
		return ErrClosed
	}
	outis, err := checkOutis(ctx, wallet)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if deadline != nil && *deadline <= s.Now().Unix() {
		return ErrClosed
	}
	result, err := tx.ExecContext(ctx, `UPDATE survivor_runs SET player=?,outis=? WHERE network=? AND ticket_hash=? AND player=?`, wallet, outis, s.Network, digest[:], from)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		if err = tx.QueryRowContext(ctx, "SELECT player FROM survivor_runs WHERE ticket_hash=?", digest[:]).Scan(&owner); err != nil {
			return err
		}
		if owner == wallet {
			return nil
		}
		return ErrTicket
	}
	if err = updateLeader(ctx, tx, digest[:]); err != nil {
		return err
	}
	return tx.Commit()
}
