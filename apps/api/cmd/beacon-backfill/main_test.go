package main

import "testing"

func TestParseRounds(t *testing.T) {
	rounds, err := parseRounds("1:7,2:9")
	if err != nil {
		t.Fatal(err)
	}
	if len(rounds) != 2 || rounds[0].RoundID != 1 || rounds[0].AuctionID != 7 ||
		rounds[1].RoundID != 2 || rounds[1].AuctionID != 9 {
		t.Fatalf("unexpected rounds: %+v", rounds)
	}
}

func TestParseRoundsRejectsDuplicateAuction(t *testing.T) {
	if _, err := parseRounds("1:7,2:7"); err == nil {
		t.Fatal("expected duplicate auction rejection")
	}
}
