package starknet

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/typeddata"
	"math/big"
	"strconv"
)

// Outis Wallet's @outis/core account.ts lists the wallet account classes.
// OutisAccount 0.5.0 is distinct from upstream Argent and the agent account.
const outisWalletClass = "0xeb49f5299d144f0b2e434e483758fb6d7d8241632534d86b098047fe4e2b42"
const STRKToken = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

func (c *ChainClient) classHashAt(ctx context.Context, wallet string, block *uint64) (string, error) {
	var value string
	err := c.rpc.request(ctx, "starknet_getClassHashAt", map[string]any{"contract_address": wallet, "block_id": blockID(block)}, &value, maxChainCallResponseBytes)
	return value, err
}

func (c *ChainClient) IsOutis(ctx context.Context, wallet string) (bool, error) {
	hash, err := c.classHashAt(ctx, wallet, nil)
	if IsRPCError(err, RPCContractNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	class, err := normalizeFelt(hash)
	return class == outisWalletClass, err
}

func SurvivorNameData(network, wallet, name string, revision int64) (json.RawMessage, error) {
	// Starknet wallet string encoders require ASCII. Escaping also distinguishes a
	// literal backslash from a Unicode escape while preserving the stored name.
	quoted := strconv.QuoteToASCII(name)
	return survivorMessage(network, "SetSurvivorName", []typeParameter{{Name: "Wallet", Type: "ContractAddress"}, {Name: "Name", Type: "string"}, {Name: "Revision", Type: "u128"}},
		map[string]string{"Wallet": wallet, "Name": quoted[1 : len(quoted)-1], "Revision": fmt.Sprint(revision)})
}

func survivorMessage(network, primary string, fields []typeParameter, message map[string]string) (json.RawMessage, error) {
	return json.Marshal(map[string]any{
		"domain":      map[string]string{"name": "Stake Wars", "version": "1", "chainId": network, "revision": "1"},
		"primaryType": primary,
		"types": map[string][]typeParameter{
			"StarknetDomain": {{Name: "name", Type: "shortstring"}, {Name: "version", Type: "shortstring"}, {Name: "chainId", Type: "shortstring"}, {Name: "revision", Type: "shortstring"}},
			primary:          fields,
		},
		"message": message,
	})
}
func (v *Verifier) VerifySurvivorMessage(ctx context.Context, wallet string, data json.RawMessage, signature []string) (bool, error) {
	var claim typeddata.TypedData
	if err := json.Unmarshal(data, &claim); err != nil {
		return false, err
	}
	h, err := claim.GetMessageHash(wallet)
	if err != nil {
		return false, err
	}
	return v.verifyHash(ctx, wallet, h.String(), signature)
}

// Pay only from the journaled shared signer, which serializes all keeper nonces.
func (s *AccountSupplyDropSubmitter) PaySurvivor(ctx context.Context, target, wallet, amount string) (string, error) {
	if s.journal == nil {
		return "", fmt.Errorf("Survivor payout requires the transaction journal")
	}
	recipient, err := feltFromHex(wallet)
	if err != nil {
		return "", err
	}
	baseUnits, ok := new(big.Int).SetString(amount, 10)
	if !ok || baseUnits.Sign() <= 0 || baseUnits.BitLen() > 128 {
		return "", fmt.Errorf("invalid Survivor prize amount")
	}
	token, err := feltFromHex(STRKToken)
	if err != nil {
		return "", err
	}
	return s.invokeCall(ctx, token, "transfer", target, []*felt.Felt{recipient, new(felt.Felt).SetBigInt(baseUnits), new(felt.Felt)})
}
