package auction

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"
)

const (
	Algorithm          = "RSA-OAEP-256"
	ProtocolVersion    = 1
	maxCiphertextBytes = 4096
)

var (
	ErrDisabled          = errors.New("sealed bidding is not configured")
	ErrInvalidEnvelope   = errors.New("invalid sealed bid envelope")
	ErrEnvelopeExists    = errors.New("sealed bid envelope already exists")
	ErrEnvelopeNotFound  = errors.New("sealed bid envelope not found")
	ErrNoValidCandidates = errors.New("auction has no valid candidates")
	starkFieldPrime      = starkPrime()
	maxU128              = new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1))
)

type PublicKey struct {
	KeyID         string `json:"keyId"`
	Algorithm     string `json:"algorithm"`
	Threshold     int    `json:"threshold"`
	CommitteeSize int    `json:"committeeSize"`
	PublicKeyPEM  string `json:"publicKeyPem"`
}

type Envelope struct {
	ControlPointID int    `json:"controlPointId"`
	Operator       string `json:"operator"`
	Commitment     string `json:"commitment"`
	KeyID          string `json:"keyId"`
	Ciphertext     string `json:"ciphertext"`
}

type PlainBid struct {
	Version        int    `json:"version"`
	ControlPointID int    `json:"controlPointId"`
	Operator       string `json:"operator"`
	MaxBid         string `json:"maxBid"`
	Nonce          string `json:"nonce"`
}

type Candidate struct {
	Operator       string
	Commitment     string
	LockedPower    *big.Int
	SubmissionRank uint64
	Incumbent      bool
}

type Rules struct {
	ControlPointID   int
	Incumbent        string
	IncumbentPower   *big.Int
	ReservePower     *big.Int
	IncumbentInvalid bool
}

type Settlement struct {
	Winner        string   `json:"winner"`
	RunnerUpBid   *big.Int `json:"runnerUpBid"`
	ClearingPower *big.Int `json:"clearingPower"`
}

type Service struct {
	db         *sql.DB
	network    string
	privateKey *rsa.PrivateKey
	publicKey  PublicKey
	now        func() time.Time
}

func NewService(db *sql.DB, network, privateKeyPEM string) (*Service, error) {
	if strings.TrimSpace(privateKeyPEM) == "" {
		return nil, nil
	}
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("decode AUCTION_PRIVATE_KEY_PEM")
	}
	privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		if legacy, legacyErr := x509.ParsePKCS1PrivateKey(block.Bytes); legacyErr == nil {
			privateKey = legacy
		} else {
			return nil, fmt.Errorf("parse AUCTION_PRIVATE_KEY_PEM: %w", err)
		}
	}
	rsaKey, ok := privateKey.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("AUCTION_PRIVATE_KEY_PEM must contain an RSA private key")
	}
	if rsaKey.N.BitLen() < 3072 {
		return nil, fmt.Errorf("AUCTION_PRIVATE_KEY_PEM must be at least 3072 bits")
	}
	publicDER, err := x509.MarshalPKIXPublicKey(&rsaKey.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("marshal auction public key: %w", err)
	}
	digest := sha256.Sum256(publicDER)
	publicPEM := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER})
	return &Service{
		db:         db,
		network:    network,
		privateKey: rsaKey,
		publicKey: PublicKey{
			KeyID:         hex.EncodeToString(digest[:16]),
			Algorithm:     Algorithm,
			Threshold:     1,
			CommitteeSize: 1,
			PublicKeyPEM:  string(publicPEM),
		},
		now: time.Now,
	}, nil
}

func (s *Service) PublicKey() PublicKey {
	return s.publicKey
}

func (s *Service) StoreEnvelope(ctx context.Context, envelope Envelope) error {
	if s == nil {
		return ErrDisabled
	}
	envelope.Operator = normalizeAddress(envelope.Operator)
	envelope.Commitment = normalizeFelt(envelope.Commitment)
	if envelope.ControlPointID < 0 || envelope.Operator == "" || envelope.Commitment == "" || envelope.KeyID != s.publicKey.KeyID {
		return ErrInvalidEnvelope
	}
	ciphertext, err := base64.StdEncoding.DecodeString(envelope.Ciphertext)
	if err != nil || len(ciphertext) == 0 || len(ciphertext) > maxCiphertextBytes || len(ciphertext) != s.privateKey.Size() {
		return ErrInvalidEnvelope
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO sealed_bid_envelopes(
			commitment, network, control_point_id, operator_address, key_id, ciphertext, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`, envelope.Commitment, s.network, envelope.ControlPointID, envelope.Operator, envelope.KeyID, ciphertext, s.now().Unix())
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return ErrEnvelopeExists
		}
		return fmt.Errorf("store sealed bid envelope: %w", err)
	}
	return nil
}

func (s *Service) Resolve(ctx context.Context, rules Rules, candidates []Candidate) (Settlement, error) {
	if s == nil {
		return Settlement{}, ErrDisabled
	}
	incumbent := normalizeAddress(rules.Incumbent)
	valid := make([]openedCandidate, 0, len(candidates)+1)
	validIncumbent := false
	for _, candidate := range candidates {
		opened, err := s.openCandidate(ctx, rules.ControlPointID, candidate)
		if err != nil {
			continue
		}
		if !opened.incumbent && opened.bid.Cmp(rules.ReservePower) < 0 {
			continue
		}
		valid = append(valid, opened)
		validIncumbent = validIncumbent || opened.incumbent
	}
	if !validIncumbent && !rules.IncumbentInvalid {
		valid = append(valid, openedCandidate{
			operator:  incumbent,
			bid:       cloneBig(rules.IncumbentPower),
			locked:    cloneBig(rules.IncumbentPower),
			incumbent: true,
		})
	}
	if len(valid) == 0 {
		return Settlement{Winner: "0x0", RunnerUpBid: big.NewInt(0), ClearingPower: big.NewInt(0)}, nil
	}
	sortCandidates(valid)
	winner := valid[0]
	runnerUp := big.NewInt(0)
	if len(valid) > 1 {
		runnerUp = cloneBig(valid[1].bid)
	}
	clearing := cloneBig(runnerUp)
	if winner.incumbent {
		if clearing.Cmp(rules.IncumbentPower) < 0 {
			clearing = cloneBig(rules.IncumbentPower)
		}
	} else if clearing.Cmp(rules.ReservePower) < 0 {
		clearing = cloneBig(rules.ReservePower)
	}
	if clearing.Cmp(winner.bid) > 0 || clearing.Cmp(winner.locked) > 0 {
		return Settlement{}, ErrNoValidCandidates
	}
	return Settlement{Winner: winner.operator, RunnerUpBid: runnerUp, ClearingPower: clearing}, nil
}

type openedCandidate struct {
	operator  string
	bid       *big.Int
	locked    *big.Int
	rank      uint64
	incumbent bool
}

func (s *Service) openCandidate(ctx context.Context, controlPointID int, candidate Candidate) (openedCandidate, error) {
	operator := normalizeAddress(candidate.Operator)
	commitment := normalizeFelt(candidate.Commitment)
	var ciphertext []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT ciphertext FROM sealed_bid_envelopes
		WHERE commitment = ? AND network = ? AND control_point_id = ? AND operator_address = ?
	`, commitment, s.network, controlPointID, operator).Scan(&ciphertext)
	if errors.Is(err, sql.ErrNoRows) {
		return openedCandidate{}, ErrEnvelopeNotFound
	}
	if err != nil {
		return openedCandidate{}, fmt.Errorf("load sealed bid envelope: %w", err)
	}
	plaintext, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, s.privateKey, ciphertext, nil)
	if err != nil {
		return openedCandidate{}, ErrInvalidEnvelope
	}
	if Commitment(plaintext) != commitment {
		return openedCandidate{}, ErrInvalidEnvelope
	}
	var bid PlainBid
	if err := json.Unmarshal(plaintext, &bid); err != nil {
		return openedCandidate{}, ErrInvalidEnvelope
	}
	amount, ok := new(big.Int).SetString(bid.MaxBid, 10)
	if bid.Version != ProtocolVersion || bid.ControlPointID != controlPointID || normalizeAddress(bid.Operator) != operator || !ok || amount.Sign() <= 0 || amount.Cmp(maxU128) > 0 || strings.TrimSpace(bid.Nonce) == "" || candidate.LockedPower == nil || amount.Cmp(candidate.LockedPower) > 0 {
		return openedCandidate{}, ErrInvalidEnvelope
	}
	return openedCandidate{
		operator:  operator,
		bid:       amount,
		locked:    cloneBig(candidate.LockedPower),
		rank:      candidate.SubmissionRank,
		incumbent: candidate.Incumbent,
	}, nil
}

func Commitment(plaintext []byte) string {
	digest := sha256.Sum256(plaintext)
	value := new(big.Int).SetBytes(digest[:])
	value.Mod(value, starkFieldPrime)
	return "0x" + value.Text(16)
}

func sortCandidates(values []openedCandidate) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && candidateBefore(values[j], values[j-1]); j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

func candidateBefore(left, right openedCandidate) bool {
	if comparison := left.bid.Cmp(right.bid); comparison != 0 {
		return comparison > 0
	}
	if left.incumbent != right.incumbent {
		return left.incumbent
	}
	return left.rank < right.rank
}

func normalizeAddress(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if !strings.HasPrefix(value, "0x") {
		return ""
	}
	parsed, ok := new(big.Int).SetString(strings.TrimPrefix(value, "0x"), 16)
	if !ok || parsed.Sign() <= 0 || parsed.Cmp(starkFieldPrime) >= 0 {
		return ""
	}
	return "0x" + parsed.Text(16)
}

func normalizeFelt(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	base := 10
	digits := value
	if strings.HasPrefix(value, "0x") {
		base = 16
		digits = strings.TrimPrefix(value, "0x")
	}
	parsed, ok := new(big.Int).SetString(digits, base)
	if !ok || parsed.Sign() <= 0 || parsed.Cmp(starkFieldPrime) >= 0 {
		return ""
	}
	return "0x" + parsed.Text(16)
}

func cloneBig(value *big.Int) *big.Int {
	if value == nil {
		return big.NewInt(0)
	}
	return new(big.Int).Set(value)
}

func starkPrime() *big.Int {
	prime := new(big.Int).Lsh(big.NewInt(1), 251)
	prime.Add(prime, new(big.Int).Mul(big.NewInt(17), new(big.Int).Lsh(big.NewInt(1), 192)))
	prime.Add(prime, big.NewInt(1))
	return prime
}

func ParsePower(value string) (*big.Int, error) {
	amount, ok := new(big.Int).SetString(strings.TrimSpace(value), 10)
	if !ok || amount.Sign() < 0 || amount.Cmp(maxU128) > 0 {
		return nil, fmt.Errorf("invalid u128 power %q", strconv.Quote(value))
	}
	return amount, nil
}
