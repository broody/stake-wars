package auction

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"path/filepath"
	"testing"

	"stakewars.com/api/internal/database"
)

func TestResolveUsesSecondPriceAndIncumbentTieBreak(t *testing.T) {
	service := testService(t)
	storeBid(t, service, PlainBid{
		Version: ProtocolVersion, ControlPointID: 7, Operator: "0x222", MaxBid: "2000", Nonce: "b",
	})
	storeBid(t, service, PlainBid{
		Version: ProtocolVersion, ControlPointID: 7, Operator: "0x333", MaxBid: "1500", Nonce: "c",
	})

	settlement, err := service.Resolve(context.Background(), Rules{
		ControlPointID: 7,
		Incumbent:      "0x111",
		IncumbentPower: big.NewInt(1000),
		ReservePower:   big.NewInt(1100),
	}, []Candidate{
		candidateFor(t, service, "0x222", 2000, 1, false),
		candidateFor(t, service, "0x333", 1500, 2, false),
	})
	if err != nil {
		t.Fatal(err)
	}
	if settlement.Winner != "0x222" || settlement.RunnerUpBid.Cmp(big.NewInt(1500)) != 0 || settlement.ClearingPower.Cmp(big.NewInt(1500)) != 0 {
		t.Fatalf("unexpected settlement: %+v", settlement)
	}

	storeBid(t, service, PlainBid{
		Version: ProtocolVersion, ControlPointID: 8, Operator: "0x111", MaxBid: "2000", Nonce: "i",
	})
	storeBid(t, service, PlainBid{
		Version: ProtocolVersion, ControlPointID: 8, Operator: "0x222", MaxBid: "2000", Nonce: "t",
	})
	tied, err := service.Resolve(context.Background(), Rules{
		ControlPointID: 8,
		Incumbent:      "0x111",
		IncumbentPower: big.NewInt(1000),
		ReservePower:   big.NewInt(1100),
	}, []Candidate{
		candidateForPoint(t, service, 8, "0x111", 2200, 1, true),
		candidateForPoint(t, service, 8, "0x222", 2200, 2, false),
	})
	if err != nil {
		t.Fatal(err)
	}
	if tied.Winner != "0x111" || tied.ClearingPower.Cmp(big.NewInt(2000)) != 0 {
		t.Fatalf("incumbent should win a tie: %+v", tied)
	}
}

func TestCommitmentMatchesBrowserFixture(t *testing.T) {
	plaintext := []byte(`{"version":1,"controlPointId":7,"operator":"0x222","maxBid":"2000","nonce":"abc"}`)
	want := "0x85641f4bd175d697e0f6f219b30f8b002d82fb17c36b7e55096fcae55db96c"
	if got := Commitment(plaintext); got != want {
		t.Fatalf("expected %s, got %s", want, got)
	}
}

func TestResolveRejectsBidAbovePublicLock(t *testing.T) {
	service := testService(t)
	storeBid(t, service, PlainBid{
		Version: ProtocolVersion, ControlPointID: 9, Operator: "0x222", MaxBid: "2000", Nonce: "x",
	})
	settlement, err := service.Resolve(context.Background(), Rules{
		ControlPointID: 9,
		Incumbent:      "0x111",
		IncumbentPower: big.NewInt(1000),
		ReservePower:   big.NewInt(1100),
	}, []Candidate{candidateForPoint(t, service, 9, "0x222", 1500, 1, false)})
	if err != nil {
		t.Fatal(err)
	}
	if settlement.Winner != "0x111" || settlement.ClearingPower.Cmp(big.NewInt(1000)) != 0 {
		t.Fatalf("invalid challenger should be ignored: %+v", settlement)
	}
}

func testService(t *testing.T) *Service {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "auction.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	key, err := rsa.GenerateKey(rand.Reader, 3072)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	service, err := NewService(db, "SN_SEPOLIA", string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})))
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func storeBid(t *testing.T, service *Service, bid PlainBid) string {
	t.Helper()
	plaintext, err := json.Marshal(bid)
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, &service.privateKey.PublicKey, plaintext, nil)
	if err != nil {
		t.Fatal(err)
	}
	commitment := Commitment(plaintext)
	err = service.StoreEnvelope(context.Background(), Envelope{
		ControlPointID: bid.ControlPointID,
		Operator:       bid.Operator,
		Commitment:     commitment,
		KeyID:          service.publicKey.KeyID,
		Ciphertext:     base64.StdEncoding.EncodeToString(ciphertext),
	})
	if err != nil {
		t.Fatal(err)
	}
	return commitment
}

func candidateFor(t *testing.T, service *Service, operator string, locked int64, rank uint64, incumbent bool) Candidate {
	return candidateForPoint(t, service, 7, operator, locked, rank, incumbent)
}

func candidateForPoint(t *testing.T, service *Service, pointID int, operator string, locked int64, rank uint64, incumbent bool) Candidate {
	t.Helper()
	var commitment string
	err := service.db.QueryRow(`
		SELECT commitment FROM sealed_bid_envelopes
		WHERE control_point_id = ? AND operator_address = ?
	`, pointID, operator).Scan(&commitment)
	if err != nil {
		t.Fatal(err)
	}
	return Candidate{
		Operator: operator, Commitment: commitment, LockedPower: big.NewInt(locked), SubmissionRank: rank, Incumbent: incumbent,
	}
}
