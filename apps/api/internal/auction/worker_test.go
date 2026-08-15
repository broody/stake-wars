package auction

import (
	"math/big"
	"testing"

	"github.com/NethermindEth/juno/core/felt"
)

func TestSettlementCallsSynchronizeEveryParticipantBeforeSettlement(t *testing.T) {
	controlSystem := new(felt.Felt).SetUint64(99)
	worker := &Worker{controlSystem: controlSystem}
	participants := make([]chainParticipant, 0, 51)
	for index := 0; index < 51; index++ {
		participants = append(participants, chainParticipant{
			ChallengeID: 1,
			Operator:    "0x" + big.NewInt(int64(index+1)).Text(16),
		})
	}
	winner := new(felt.Felt).SetUint64(1)
	calls, err := worker.settlementCalls(chainChallenge{ID: 1, ControlPointID: 7}, participants, winner, Settlement{
		RunnerUpBid: big.NewInt(1_500), ClearingPower: big.NewInt(1_500),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(calls) != 3 {
		t.Fatalf("expected two sync calls and one settlement, got %d", len(calls))
	}
	if calls[0].FunctionName != "sync_operators" || calls[0].CallData[0].Uint64() != 50 {
		t.Fatalf("unexpected first sync call: %+v", calls[0])
	}
	if calls[1].FunctionName != "sync_operators" || calls[1].CallData[0].Uint64() != 1 {
		t.Fatalf("unexpected second sync call: %+v", calls[1])
	}
	if calls[2].FunctionName != "settle_challenge" {
		t.Fatalf("settlement must be the final call: %+v", calls[2])
	}
}
