package starknet

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/NethermindEth/juno/core/crypto"
	"github.com/NethermindEth/juno/core/felt"
)

const (
	primaryType       = "StakeWarsAuth"
	validatedResponse = "0x56414c4944" // felt252 encoding of "VALID"
	maxSignatureFelts = 64
)

var hexFeltPattern = regexp.MustCompile(`^0x[0-9a-fA-F]+$`)

// Verifier builds SNIP-12 challenges and verifies their signatures through the
// wallet account contract's is_valid_signature entrypoint.
type Verifier struct {
	chainID string
	rpc     *rpcClient
}

// NewVerifier returns a Starknet account signature verifier. An empty RPC URL
// still permits challenge creation, but verification returns ErrUnavailable.
func NewVerifier(rpcURL, chainID string) *Verifier {
	return &Verifier{
		chainID: chainID,
		rpc:     newRPCClient(rpcURL),
	}
}

// ErrUnavailable indicates that signature verification has no configured RPC.
var ErrUnavailable = errors.New("starknet RPC is not configured")

// NormalizeWallet validates and canonicalizes a Starknet contract address.
func (v *Verifier) NormalizeWallet(value string) (string, error) {
	return normalizeAddress(value)
}

// TypedData builds the exact SNIP-12 payload that a wallet must sign.
func (v *Verifier) TypedData(
	wallet, nonce string,
	issuedAt, expiresAt time.Time,
) (json.RawMessage, error) {
	payload := challengeTypedData{
		Types: map[string][]typeParameter{
			"StarknetDomain": {
				{Name: "name", Type: "shortstring"},
				{Name: "version", Type: "shortstring"},
				{Name: "chainId", Type: "shortstring"},
				{Name: "revision", Type: "shortstring"},
			},
			primaryType: {
				{Name: "wallet", Type: "ContractAddress"},
				{Name: "nonce", Type: "felt"},
				{Name: "issued_at", Type: "timestamp"},
				{Name: "expires_at", Type: "timestamp"},
				{Name: "statement", Type: "shortstring"},
			},
		},
		PrimaryType: primaryType,
		Domain: challengeDomain{
			Name: "StakeWars", Version: "1", ChainID: v.chainID, Revision: "1",
		},
		Message: challengeMessage{
			Wallet:    wallet,
			Nonce:     nonce,
			IssuedAt:  issuedAt.Unix(),
			ExpiresAt: expiresAt.Unix(),
			Statement: "Sign in to StakeWars",
		},
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal typed challenge: %w", err)
	}

	// Validate the typed data now so malformed server configuration is caught
	// before the challenge is persisted or returned to a wallet.
	if _, err := messageHash(encoded, wallet); err != nil {
		return nil, err
	}
	return encoded, nil
}

// Verify asks the account contract whether the signature is valid for the
// server-generated typed data.
func (v *Verifier) Verify(
	ctx context.Context,
	wallet string,
	typedData json.RawMessage,
	signature []string,
) (bool, error) {
	if len(signature) == 0 || len(signature) > maxSignatureFelts {
		return false, fmt.Errorf("signature must contain between 1 and %d felts", maxSignatureFelts)
	}

	hash, err := messageHash(typedData, wallet)
	if err != nil {
		return false, err
	}
	calldata := make([]string, 0, len(signature)+2)
	calldata = append(calldata, hash, fmt.Sprintf("0x%x", len(signature)))
	for _, item := range signature {
		normalized, err := normalizeFelt(item)
		if err != nil {
			return false, fmt.Errorf("invalid signature felt: %w", err)
		}
		calldata = append(calldata, normalized)
	}

	resultValues, err := v.rpc.call(ctx, wallet, "is_valid_signature", calldata)
	if err != nil {
		return false, err
	}
	if len(resultValues) != 1 {
		return false, fmt.Errorf("unexpected is_valid_signature response length %d", len(resultValues))
	}

	result, err := normalizeFelt(resultValues[0])
	if err != nil {
		return false, fmt.Errorf("invalid is_valid_signature response: %w", err)
	}
	return result == validatedResponse, nil
}

func messageHash(encoded json.RawMessage, wallet string) (string, error) {
	var value challengeTypedData
	if err := json.Unmarshal(encoded, &value); err != nil {
		return "", fmt.Errorf("parse typed challenge: %w", err)
	}
	expectedDomainTypes := []typeParameter{
		{Name: "name", Type: "shortstring"},
		{Name: "version", Type: "shortstring"},
		{Name: "chainId", Type: "shortstring"},
		{Name: "revision", Type: "shortstring"},
	}
	expectedMessageTypes := []typeParameter{
		{Name: "wallet", Type: "ContractAddress"},
		{Name: "nonce", Type: "felt"},
		{Name: "issued_at", Type: "timestamp"},
		{Name: "expires_at", Type: "timestamp"},
		{Name: "statement", Type: "shortstring"},
	}
	if value.PrimaryType != primaryType ||
		value.Domain.Name != "StakeWars" ||
		value.Domain.Version != "1" ||
		value.Domain.ChainID == "" ||
		value.Domain.Revision != "1" ||
		value.Message.Statement != "Sign in to StakeWars" ||
		!sameTypeParameters(value.Types["StarknetDomain"], expectedDomainTypes) ||
		!sameTypeParameters(value.Types[primaryType], expectedMessageTypes) {
		return "", fmt.Errorf("parse typed challenge: unsupported type or revision")
	}
	if value.Message.IssuedAt <= 0 || value.Message.ExpiresAt <= value.Message.IssuedAt {
		return "", fmt.Errorf("parse typed challenge: invalid validity period")
	}

	account, err := feltFromHex(wallet)
	if err != nil {
		return "", fmt.Errorf("hash typed challenge account: %w", err)
	}
	nonce, err := feltFromHex(value.Message.Nonce)
	if err != nil {
		return "", fmt.Errorf("hash typed challenge nonce: %w", err)
	}
	messageWallet, err := feltFromHex(value.Message.Wallet)
	if err != nil {
		return "", fmt.Errorf("hash typed challenge wallet: %w", err)
	}
	if !account.Equal(messageWallet) {
		return "", fmt.Errorf("hash typed challenge: wallet mismatch")
	}

	domainType := crypto.StarknetKeccak([]byte(
		`"StarknetDomain"("name":"shortstring","version":"shortstring","chainId":"shortstring","revision":"shortstring")`,
	))
	domainName, err := shortStringFelt(value.Domain.Name)
	if err != nil {
		return "", fmt.Errorf("hash domain name: %w", err)
	}
	domainVersion, err := shortStringFelt(value.Domain.Version)
	if err != nil {
		return "", fmt.Errorf("hash domain version: %w", err)
	}
	domainChainID, err := shortStringFelt(value.Domain.ChainID)
	if err != nil {
		return "", fmt.Errorf("hash domain chain ID: %w", err)
	}
	domainRevision, err := shortStringFelt(value.Domain.Revision)
	if err != nil {
		return "", fmt.Errorf("hash domain revision: %w", err)
	}
	domainHash := crypto.PoseidonArray(
		&domainType,
		domainName,
		domainVersion,
		domainChainID,
		domainRevision,
	)

	messageType := crypto.StarknetKeccak([]byte(
		`"StakeWarsAuth"("wallet":"ContractAddress","nonce":"felt","issued_at":"timestamp","expires_at":"timestamp","statement":"shortstring")`,
	))
	issuedAt := new(felt.Felt).SetUint64(uint64(value.Message.IssuedAt))
	expiresAt := new(felt.Felt).SetUint64(uint64(value.Message.ExpiresAt))
	statement, err := shortStringFelt(value.Message.Statement)
	if err != nil {
		return "", fmt.Errorf("hash challenge statement: %w", err)
	}
	typedMessageHash := crypto.PoseidonArray(
		&messageType,
		messageWallet,
		nonce,
		issuedAt,
		expiresAt,
		statement,
	)
	prefix, err := shortStringFelt("StarkNet Message")
	if err != nil {
		return "", fmt.Errorf("hash challenge prefix: %w", err)
	}
	hash := crypto.PoseidonArray(prefix, &domainHash, account, &typedMessageHash)
	return hash.String(), nil
}

func sameTypeParameters(actual, expected []typeParameter) bool {
	if len(actual) != len(expected) {
		return false
	}
	for index := range actual {
		if actual[index] != expected[index] {
			return false
		}
	}
	return true
}

func feltFromHex(value string) (*felt.Felt, error) {
	if !hexFeltPattern.MatchString(value) {
		return nil, fmt.Errorf("expected a 0x-prefixed hexadecimal felt")
	}
	result, err := new(felt.Felt).SetString(value)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func shortStringFelt(value string) (*felt.Felt, error) {
	if len(value) == 0 || len(value) > 31 {
		return nil, fmt.Errorf("shortstring must contain between 1 and 31 bytes")
	}
	if number, ok := new(big.Int).SetString(value, 0); ok {
		return new(felt.Felt).SetBigInt(number), nil
	}
	for _, character := range []byte(value) {
		if character > 0x7f {
			return nil, fmt.Errorf("shortstring must contain ASCII characters")
		}
	}
	return new(felt.Felt).SetBigInt(new(big.Int).SetBytes([]byte(value))), nil
}

func normalizeAddress(value string) (string, error) {
	normalized, number, err := parseHexFelt(value)
	if err != nil {
		return "", err
	}
	if number.Sign() == 0 {
		return "", fmt.Errorf("wallet address cannot be zero")
	}
	if number.BitLen() > 251 {
		return "", fmt.Errorf("wallet address exceeds Starknet address range")
	}
	return normalized, nil
}

func normalizeFelt(value string) (string, error) {
	normalized, _, err := parseHexFelt(value)
	return normalized, err
}

func parseHexFelt(value string) (string, *big.Int, error) {
	value = strings.TrimSpace(value)
	parsed, err := feltFromHex(value)
	if err != nil {
		return "", nil, err
	}
	number := parsed.BigInt(new(big.Int))
	return parsed.String(), number, nil
}

type challengeTypedData struct {
	Types       map[string][]typeParameter `json:"types"`
	PrimaryType string                     `json:"primaryType"`
	Domain      challengeDomain            `json:"domain"`
	Message     challengeMessage           `json:"message"`
}

type typeParameter struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type challengeDomain struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	ChainID  string `json:"chainId"`
	Revision string `json:"revision"`
}

type challengeMessage struct {
	Wallet    string `json:"wallet"`
	Nonce     string `json:"nonce"`
	IssuedAt  int64  `json:"issued_at"`
	ExpiresAt int64  `json:"expires_at"`
	Statement string `json:"statement"`
}
