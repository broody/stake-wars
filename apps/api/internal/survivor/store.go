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
	ErrNoClip  = errors.New("this run has no death clip")
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
	// Clip is the gzipped death clip, or nil when the run has none.
	Clip []byte `json:"clip"`
}

// Finished is a recorded run. Clip says whether its death clip can be watched.
type Finished struct {
	Destroyed int   `json:"destroyed"`
	Run       int64 `json:"run"`
	Clip      bool  `json:"clip"`
}

type Entry struct {
	WalletKind string `json:"walletKind,omitempty"`
	// Run identifies the run behind this score, so its death clip can be fetched.
	Run             int64     `json:"run,omitempty"`
	Clip            bool      `json:"clip,omitempty"`
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
	var winnerKind string
	var score sql.NullInt64
	var duration *int
	var winnerUpgrades []byte
	err = tx.QueryRowContext(ctx, `SELECT id,deadline,leader_wallet,coalesce(leader_wallet_kind,''),leading_destroyed,leader_duration_seconds,leader_upgrades,prize_amount,
        (SELECT MAX(old.id) FROM survivor_rounds old WHERE old.network=survivor_rounds.network AND old.id<survivor_rounds.id)
        FROM survivor_rounds WHERE network=? AND (?=0 OR id=?) ORDER BY id DESC LIMIT 1`, s.Network, id, id).Scan(&r.ID, &deadline, &wallet, &winnerKind, &score, &duration, &winnerUpgrades, &r.PrizeAmount, &r.PreviousID)
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
		r.Winner = &Entry{Wallet: wallet.String, Destroyed: int(score.Int64), DurationSeconds: duration, WalletKind: winnerKind}
		if err = tx.QueryRowContext(ctx, "SELECT coalesce((SELECT name FROM survivor_profiles WHERE network=? AND player=?),'')", s.Network, wallet.String).Scan(&r.Winner.Name); err != nil {
			return b, err
		}
		// The leader's run is their first run with the winning score.
		err = tx.QueryRowContext(ctx, `SELECT t.id,EXISTS(SELECT 1 FROM survivor_clips c WHERE c.run_id=t.id)
            FROM survivor_runs t WHERE t.round_id=? AND t.player=? AND t.destroyed=? ORDER BY t.id LIMIT 1`,
			r.ID, wallet.String, score.Int64).Scan(&r.Winner.Run, &r.Winner.Clip)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
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
      SELECT r.id,EXISTS(SELECT 1 FROM survivor_clips c WHERE c.run_id=r.id),
             r.player,r.destroyed,r.duration_seconds,r.upgrades,coalesce(r.wallet_kind,''),coalesce(p.name,'')
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
		if err := rows.Scan(&e.Run, &e.Clip, &player, &e.Destroyed, &e.DurationSeconds, &upgrades, &e.WalletKind, &e.Name); err != nil {
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

// WalletKind names the wallet that submitted a run, such as "outis". It
// returns an empty string when the wallet is unknown.
type WalletKind func(ctx context.Context, wallet string) (string, error)

func (s *Store) Finish(ctx context.Context, token, wallet string, replay []byte, walletKind WalletKind) (Finished, error) {
	if len(token) != 64 && len(token) != 128 {
		return Finished{}, ErrTicket
	}
	// Canonical lowercase encoding gives every ticket exactly one receipt key.
	if strings.ToLower(token) != token {
		return Finished{}, ErrTicket
	}
	digest := sha256.Sum256([]byte(token))
	a, err := s.admission(ctx, token, wallet, digest[:])
	if err != nil {
		return Finished{}, err
	}
	if a.score.Valid {
		return s.finished(ctx, s.DB, digest[:], wallet)
	}
	now := s.Now()

	verified, err := s.Verify(ctx, a.seed, replay, now.UnixMilli()-a.started)
	if err != nil {
		return Finished{}, err
	}
	kind := ""
	if !guest(wallet) {
		kind, err = walletKind(ctx, wallet)
		if err != nil {
			return Finished{}, err
		}
	}
	upgrades, err := json.Marshal(verified.Upgrades)
	if err != nil {
		return Finished{}, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return Finished{}, err
	}
	defer tx.Rollback()
	// A late replay still belongs on the all-time board. The daily winner is frozen.
	if s.Now().Unix() >= a.deadline {
		a.roundID = 0
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO survivor_runs(ticket_hash,network,round_id,player,destroyed,duration_seconds,upgrades,outis,wallet_kind)
        VALUES(?,?,nullif(?,0),?,?,?,?,?,nullif(?,''))
        ON CONFLICT(ticket_hash) DO UPDATE SET round_id=excluded.round_id,destroyed=excluded.destroyed,
        duration_seconds=excluded.duration_seconds,upgrades=excluded.upgrades,outis=excluded.outis,wallet_kind=excluded.wallet_kind
        WHERE survivor_runs.player=excluded.player AND survivor_runs.network=excluded.network AND survivor_runs.destroyed IS NULL`,
		digest[:], s.Network, a.roundID, wallet, verified.Destroyed, verified.DurationSeconds, string(upgrades), kind == "outis", kind)
	if err != nil {
		return Finished{}, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return Finished{}, err
	}
	if n == 0 {
		// Another request recorded this ticket first.
		return s.finished(ctx, tx, digest[:], wallet)
	}
	if a.roundID != 0 {
		if _, err = tx.ExecContext(ctx, "UPDATE survivor_rounds SET submissions=submissions+1 WHERE id=?", a.roundID); err != nil {
			return Finished{}, err
		}
		if !guest(wallet) {
			if err = updateLeader(ctx, tx, digest[:]); err != nil {
				return Finished{}, err
			}
		}
	}
	if len(verified.Clip) > maxClipBytes {
		verified.Clip = nil
	}
	if verified.Clip != nil {
		_, err = tx.ExecContext(ctx, `INSERT INTO survivor_clips(run_id,clip)
            SELECT id,? FROM survivor_runs WHERE ticket_hash=?`, verified.Clip, digest[:])
		if err != nil {
			return Finished{}, err
		}
		if err = s.pruneClips(ctx, tx, wallet); err != nil {
			return Finished{}, err
		}
	}
	saved, err := s.finished(ctx, tx, digest[:], wallet)
	if err != nil {
		return Finished{}, err
	}
	return saved, tx.Commit()
}

// maxClipBytes bounds one stored death clip. A late-game clip is about 40 KB.
const maxClipBytes = 128 * 1024

type rowQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (s *Store) finished(ctx context.Context, db rowQuerier, digest []byte, wallet string) (Finished, error) {
	var f Finished
	err := db.QueryRowContext(ctx, `SELECT id,destroyed,EXISTS(SELECT 1 FROM survivor_clips c WHERE c.run_id=survivor_runs.id)
        FROM survivor_runs WHERE ticket_hash=? AND player=? AND network=? AND destroyed IS NOT NULL`,
		digest, wallet, s.Network).Scan(&f.Run, &f.Destroyed, &f.Clip)
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrTicket
	}
	return f, err
}

// pruneClips keeps only the clips a player's runs can still be watched from:
// their latest run, their all-time best, their best in the two newest rounds,
// and their best in every round they lead.
func (s *Store) pruneClips(ctx context.Context, tx *sql.Tx, player string) error {
	_, err := tx.ExecContext(ctx, `WITH mine AS (
            SELECT id,round_id,destroyed FROM survivor_runs
            WHERE network=?1 AND player=?2 AND destroyed IS NOT NULL
        ), shown AS (
            SELECT round_id FROM (SELECT id AS round_id FROM survivor_rounds WHERE network=?1 ORDER BY id DESC LIMIT 2)
            UNION SELECT id FROM survivor_rounds WHERE network=?1 AND leader_wallet=?2
        ), keep AS (
            SELECT max(id) AS id FROM mine
            UNION SELECT id FROM (SELECT id FROM mine ORDER BY destroyed DESC,id LIMIT 1)
            UNION SELECT id FROM (
                SELECT id,row_number() OVER (PARTITION BY round_id ORDER BY destroyed DESC,id) AS position
                FROM mine WHERE round_id IN (SELECT round_id FROM shown)
            ) WHERE position=1
        )
        DELETE FROM survivor_clips WHERE run_id IN (SELECT id FROM mine) AND run_id NOT IN (SELECT id FROM keep)`,
		s.Network, player)
	return err
}

// Clip returns a run's gzipped death clip.
func (s *Store) Clip(ctx context.Context, run int64) ([]byte, error) {
	var clip []byte
	err := s.DB.QueryRowContext(ctx, `SELECT c.clip FROM survivor_clips c JOIN survivor_runs r ON r.id=c.run_id
        WHERE c.run_id=? AND r.network=?`, run, s.Network).Scan(&clip)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoClip
	}
	return clip, err
}

// Any signed wallet can lead. Strict improvement preserves the first wallet on a tie.
func updateLeader(ctx context.Context, tx *sql.Tx, digest []byte) error {
	_, err := tx.ExecContext(ctx, `UPDATE survivor_rounds AS r SET
        (leader_wallet,leading_destroyed,leader_duration_seconds,leader_upgrades,leader_wallet_kind)=(t.player,t.destroyed,t.duration_seconds,t.upgrades,t.wallet_kind)
        FROM survivor_runs AS t WHERE t.ticket_hash=? AND r.id=t.round_id
        AND (r.leading_destroyed IS NULL OR t.destroyed>r.leading_destroyed)`, digest)
	return err
}

// Move one already verified guest run to its signed wallet. The guest UUID and
// the original ticket are both required. The replay and prize cannot be counted twice.
func (s *Store) Attach(ctx context.Context, token, from, wallet string, walletKind WalletKind) error {
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
	kind, err := walletKind(ctx, wallet)
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
	result, err := tx.ExecContext(ctx, `UPDATE survivor_runs SET player=?,outis=?,wallet_kind=nullif(?,'') WHERE network=? AND ticket_hash=? AND player=?`, wallet, kind == "outis", kind, s.Network, digest[:], from)
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
	if err = s.pruneClips(ctx, tx, wallet); err != nil {
		return err
	}
	return tx.Commit()
}
