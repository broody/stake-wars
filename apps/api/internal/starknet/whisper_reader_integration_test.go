package starknet

import (
	"context"
	"os"
	"strconv"
	"testing"
)

func TestWhisperReaderSepoliaSmoke(t *testing.T) {
	address := os.Getenv("STAKEWARS_WHISPER_SEPOLIA_SMOKE_ADDRESS")
	auctionIDText := os.Getenv("STAKEWARS_WHISPER_SEPOLIA_SMOKE_AUCTION_ID")
	if address == "" || auctionIDText == "" {
		t.Skip("set the Sepolia Whisper smoke address and auction ID to run")
	}
	auctionID, err := strconv.ParseUint(auctionIDText, 10, 64)
	if err != nil {
		t.Fatalf("parse smoke auction ID: %v", err)
	}
	rpcURL := os.Getenv("STAKEWARS_WHISPER_SEPOLIA_RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://starknet-sepolia-rpc.publicnode.com"
	}

	reader := NewWhisperReader(rpcURL)
	auction, err := reader.Auction(context.Background(), address, auctionID)
	if err != nil {
		t.Fatalf("read live Whisper auction: %v", err)
	}
	if auction.Status != WhisperStatusSettled ||
		auction.FulfillmentKind != WhisperFulfillmentOffchain ||
		auction.FulfillmentStatus != WhisperFulfillmentStatusOffchain ||
		auction.AssetToken != "0x0" || auction.AssetTokenID != "0" ||
		auction.AssetAmount != "0" {
		t.Fatalf("unexpected live auction: %+v", auction)
	}

	result, err := reader.Result(context.Background(), address, auctionID)
	if err != nil {
		t.Fatalf("read live Whisper result: %v", err)
	}
	if !result.HasWinner || result.WinningBid == "0" || result.ClearingPrice == "0" {
		t.Fatalf("unexpected live result: %+v", result)
	}
}
