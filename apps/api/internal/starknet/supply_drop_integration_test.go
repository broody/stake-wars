package starknet

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestSupplyDropSubmitterSepoliaConfiguration(t *testing.T) {
	rpcURL := os.Getenv("STAKEWARS_SUPPLY_DROP_SEPOLIA_RPC_URL")
	supplyDropSystem := os.Getenv("STAKEWARS_SUPPLY_DROP_SEPOLIA_SYSTEM")
	keeperAccount := os.Getenv("STAKEWARS_SUPPLY_DROP_SEPOLIA_KEEPER_ACCOUNT")
	keeperPrivateKey := os.Getenv("STAKEWARS_SUPPLY_DROP_SEPOLIA_KEEPER_PRIVATE_KEY")
	if rpcURL == "" || supplyDropSystem == "" || keeperAccount == "" || keeperPrivateKey == "" {
		t.Skip("set the Sepolia SupplyDrop signer smoke configuration to run")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := NewSupplyDropSubmitter(
		ctx, rpcURL, supplyDropSystem, keeperAccount, keeperPrivateKey,
	); err != nil {
		t.Fatalf("initialize live SupplyDrop submitter: %v", err)
	}
}
