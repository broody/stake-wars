package starknet

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestJackpotSubmitterSepoliaConfiguration(t *testing.T) {
	rpcURL := os.Getenv("STAKEWARS_JACKPOT_SEPOLIA_RPC_URL")
	jackpotSystem := os.Getenv("STAKEWARS_JACKPOT_SEPOLIA_SYSTEM")
	keeperAccount := os.Getenv("STAKEWARS_JACKPOT_SEPOLIA_KEEPER_ACCOUNT")
	keeperPrivateKey := os.Getenv("STAKEWARS_JACKPOT_SEPOLIA_KEEPER_PRIVATE_KEY")
	if rpcURL == "" || jackpotSystem == "" || keeperAccount == "" || keeperPrivateKey == "" {
		t.Skip("set the Sepolia Jackpot signer smoke configuration to run")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := NewJackpotSubmitter(
		ctx, rpcURL, jackpotSystem, keeperAccount, keeperPrivateKey,
	); err != nil {
		t.Fatalf("initialize live Jackpot submitter: %v", err)
	}
}
