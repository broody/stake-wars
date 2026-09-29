package stakingstats

import (
	"fmt"
	"math/big"
	"strings"
	"unicode/utf8"

	"stakewars.com/api/internal/starknet"
)

var maxU128 = new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1))

func parseFelt(value string) (*big.Int, error) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "0x") && !strings.HasPrefix(value, "0X") {
		return nil, fmt.Errorf("expected a 0x-prefixed felt, got %q", value)
	}
	number, ok := new(big.Int).SetString(value[2:], 16)
	if !ok || number.Sign() < 0 {
		return nil, fmt.Errorf("invalid felt %q", value)
	}
	return number, nil
}

func parseU128(value string) (*big.Int, error) {
	number, err := parseFelt(value)
	if err != nil {
		return nil, err
	}
	if number.Cmp(maxU128) > 0 {
		return nil, fmt.Errorf("value exceeds u128")
	}
	return number, nil
}

func parseU64(value string) (uint64, error) {
	number, err := parseFelt(value)
	if err != nil {
		return 0, err
	}
	if !number.IsUint64() {
		return 0, fmt.Errorf("value exceeds u64")
	}
	return number.Uint64(), nil
}

// normalizeAddress canonicalizes a felt as minimal lowercase hex. The zero
// address is valid here because optional contract fields may be empty.
func normalizeAddress(value string) (string, error) {
	return starknet.NormalizeFelt(value)
}

func mustAddress(value string) string {
	normalized, err := normalizeAddress(value)
	if err != nil {
		panic(err)
	}
	return normalized
}

// decodeOption reads a Cairo Option discriminant: 0 is Some, 1 is None.
func decodeOption(value string) (bool, error) {
	variant, err := parseU64(value)
	if err != nil {
		return false, err
	}
	switch variant {
	case 0:
		return true, nil
	case 1:
		return false, nil
	default:
		return false, fmt.Errorf("unknown Option variant %d", variant)
	}
}

// decodeString reads a felt short string or a Cairo ByteArray.
func decodeString(result []string) (string, error) {
	if len(result) == 1 {
		number, err := parseFelt(result[0])
		if err != nil {
			return "", err
		}
		return printable(number.Bytes()), nil
	}
	if len(result) < 3 {
		return "", fmt.Errorf("unexpected string length %d", len(result))
	}
	words, err := parseU64(result[0])
	if err != nil || uint64(len(result)) != words+3 {
		return "", fmt.Errorf("malformed ByteArray")
	}
	var builder strings.Builder
	for index := uint64(0); index < words; index++ {
		number, err := parseFelt(result[1+index])
		if err != nil {
			return "", err
		}
		builder.Write(leftPad(number.Bytes(), 31))
	}
	pending, err := parseFelt(result[1+words])
	if err != nil {
		return "", err
	}
	pendingLength, err := parseU64(result[2+words])
	if err != nil || pendingLength > 30 {
		return "", fmt.Errorf("malformed ByteArray pending word")
	}
	builder.Write(leftPad(pending.Bytes(), int(pendingLength)))
	return printable([]byte(builder.String())), nil
}

func leftPad(value []byte, size int) []byte {
	if len(value) >= size {
		return value[len(value)-size:]
	}
	padded := make([]byte, size)
	copy(padded[size-len(value):], value)
	return padded
}

func printable(value []byte) string {
	if !utf8.Valid(value) {
		return ""
	}
	return strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, string(value)))
}

// stakerInfo mirrors the staking contract's StakerInfoV1.
type stakerInfo struct {
	RewardAddress      string
	OperationalAddress string
	UnstakeTime        *uint64
	AmountOwn          *big.Int
	UnclaimedOwn       *big.Int
	Pool               *poolInfo
	Commission         *uint64
}

type poolInfo struct {
	Pool   string
	Token  string
	Amount *big.Int
}

func decodeStakerInfoV1(result []string, strkToken string) (stakerInfo, error) {
	if len(result) < 6 {
		return stakerInfo{}, fmt.Errorf("unexpected staker info length %d", len(result))
	}
	var info stakerInfo
	var err error
	if info.RewardAddress, err = normalizeAddress(result[0]); err != nil {
		return stakerInfo{}, fmt.Errorf("decode reward address: %w", err)
	}
	if info.OperationalAddress, err = normalizeAddress(result[1]); err != nil {
		return stakerInfo{}, fmt.Errorf("decode operational address: %w", err)
	}
	cursor := 2
	hasUnstake, err := decodeOption(result[cursor])
	if err != nil {
		return stakerInfo{}, fmt.Errorf("decode unstake time: %w", err)
	}
	cursor++
	if hasUnstake {
		unstake, err := parseU64(result[cursor])
		if err != nil {
			return stakerInfo{}, fmt.Errorf("decode unstake time: %w", err)
		}
		info.UnstakeTime = &unstake
		cursor++
	}
	if len(result) < cursor+3 {
		return stakerInfo{}, fmt.Errorf("truncated staker info")
	}
	if info.AmountOwn, err = parseU128(result[cursor]); err != nil {
		return stakerInfo{}, fmt.Errorf("decode own amount: %w", err)
	}
	if info.UnclaimedOwn, err = parseU128(result[cursor+1]); err != nil {
		return stakerInfo{}, fmt.Errorf("decode unclaimed rewards: %w", err)
	}
	hasPool, err := decodeOption(result[cursor+2])
	if err != nil {
		return stakerInfo{}, fmt.Errorf("decode pool info: %w", err)
	}
	cursor += 3
	if hasPool {
		if len(result) != cursor+3 {
			return stakerInfo{}, fmt.Errorf("unexpected staker pool info length")
		}
		pool, err := normalizeAddress(result[cursor])
		if err != nil {
			return stakerInfo{}, fmt.Errorf("decode pool contract: %w", err)
		}
		amount, err := parseU128(result[cursor+1])
		if err != nil {
			return stakerInfo{}, fmt.Errorf("decode pool amount: %w", err)
		}
		commission, err := parseU64(result[cursor+2])
		if err != nil {
			return stakerInfo{}, fmt.Errorf("decode commission: %w", err)
		}
		info.Pool = &poolInfo{Pool: pool, Token: strkToken, Amount: amount}
		info.Commission = &commission
	} else if len(result) != cursor {
		return stakerInfo{}, fmt.Errorf("unexpected staker info length %d", len(result))
	}
	return info, nil
}

// stakerPools mirrors StakerPoolInfoV2: one commission for every pool.
type stakerPools struct {
	Commission *uint64
	Pools      []poolInfo
}

func decodeStakerPoolInfo(result []string) (stakerPools, error) {
	if len(result) < 2 {
		return stakerPools{}, fmt.Errorf("unexpected staker pool info length %d", len(result))
	}
	var pools stakerPools
	hasCommission, err := decodeOption(result[0])
	if err != nil {
		return stakerPools{}, fmt.Errorf("decode commission: %w", err)
	}
	cursor := 1
	if hasCommission {
		commission, err := parseU64(result[1])
		if err != nil {
			return stakerPools{}, fmt.Errorf("decode commission: %w", err)
		}
		pools.Commission = &commission
		cursor++
	}
	if len(result) <= cursor {
		return stakerPools{}, fmt.Errorf("truncated staker pool info")
	}
	count, err := parseU64(result[cursor])
	if err != nil || uint64(len(result)) != uint64(cursor)+1+count*3 {
		return stakerPools{}, fmt.Errorf("unexpected staker pool count")
	}
	cursor++
	pools.Pools = make([]poolInfo, 0, count)
	for index := uint64(0); index < count; index++ {
		offset := cursor + int(index)*3
		pool, err := normalizeAddress(result[offset])
		if err != nil {
			return stakerPools{}, fmt.Errorf("decode pool contract: %w", err)
		}
		token, err := normalizeAddress(result[offset+1])
		if err != nil {
			return stakerPools{}, fmt.Errorf("decode pool token: %w", err)
		}
		amount, err := parseU128(result[offset+2])
		if err != nil {
			return stakerPools{}, fmt.Errorf("decode pool amount: %w", err)
		}
		pools.Pools = append(pools.Pools, poolInfo{Pool: pool, Token: token, Amount: amount})
	}
	return pools, nil
}

type tokenState struct {
	Address string
	Active  bool
}

func decodeTokens(result []string) ([]tokenState, error) {
	if len(result) == 0 {
		return nil, fmt.Errorf("empty token list")
	}
	count, err := parseU64(result[0])
	if err != nil || uint64(len(result)) != 1+count*2 {
		return nil, fmt.Errorf("unexpected token list length")
	}
	tokens := make([]tokenState, 0, count)
	for index := uint64(0); index < count; index++ {
		address, err := normalizeAddress(result[1+index*2])
		if err != nil {
			return nil, fmt.Errorf("decode token address: %w", err)
		}
		active, err := parseU64(result[2+index*2])
		if err != nil || active > 1 {
			return nil, fmt.Errorf("decode token state")
		}
		tokens = append(tokens, tokenState{Address: address, Active: active == 1})
	}
	return tokens, nil
}

// epochInfo mirrors the staking contract's EpochInfo.
type epochInfo struct {
	DurationSeconds         uint64
	Length                  uint64
	StartingBlock           uint64
	StartingEpoch           uint64
	PreviousLength          uint64
	PreviousDurationSeconds uint64
}

func decodeEpochInfo(result []string) (epochInfo, error) {
	if len(result) != 6 {
		return epochInfo{}, fmt.Errorf("unexpected epoch info length %d", len(result))
	}
	values := make([]uint64, len(result))
	for index, value := range result {
		parsed, err := parseU64(value)
		if err != nil {
			return epochInfo{}, fmt.Errorf("decode epoch info: %w", err)
		}
		values[index] = parsed
	}
	info := epochInfo{
		DurationSeconds: values[0], Length: values[1], StartingBlock: values[2],
		StartingEpoch: values[3], PreviousLength: values[4], PreviousDurationSeconds: values[5],
	}
	if info.Length == 0 || info.DurationSeconds == 0 {
		return epochInfo{}, fmt.Errorf("epoch info has zero length")
	}
	return info, nil
}

// bounds returns the first block, length, and target duration of epoch. An
// epoch before StartingEpoch is the final epoch of the previous configuration.
func (info epochInfo) bounds(epoch uint64) (start, length, duration uint64) {
	if epoch >= info.StartingEpoch {
		return info.StartingBlock + (epoch-info.StartingEpoch)*info.Length, info.Length, info.DurationSeconds
	}
	length = info.PreviousLength
	if length == 0 {
		length = info.Length
	}
	duration = info.PreviousDurationSeconds
	if duration == 0 {
		duration = info.DurationSeconds
	}
	back := (info.StartingEpoch - epoch) * length
	if back > info.StartingBlock {
		return 0, length, duration
	}
	return info.StartingBlock - back, length, duration
}

type stakingParameters struct {
	MinStake           *big.Int
	Token              string
	RewardSupplier     string
	ExitWaitWindowSecs uint64
}

func decodeStakingParameters(result []string) (stakingParameters, error) {
	if len(result) != 6 {
		return stakingParameters{}, fmt.Errorf("unexpected staking parameters length %d", len(result))
	}
	minStake, err := parseU128(result[0])
	if err != nil {
		return stakingParameters{}, fmt.Errorf("decode minimum stake: %w", err)
	}
	token, err := normalizeAddress(result[1])
	if err != nil {
		return stakingParameters{}, fmt.Errorf("decode staking token: %w", err)
	}
	rewardSupplier, err := normalizeAddress(result[4])
	if err != nil {
		return stakingParameters{}, fmt.Errorf("decode reward supplier: %w", err)
	}
	exitWindow, err := parseU64(result[5])
	if err != nil {
		return stakingParameters{}, fmt.Errorf("decode exit wait window: %w", err)
	}
	return stakingParameters{
		MinStake: minStake, Token: token, RewardSupplier: rewardSupplier, ExitWaitWindowSecs: exitWindow,
	}, nil
}

// poolParameters mirrors a delegation pool's PoolContractInfoV1.
type poolParameters struct {
	Staker          string
	StakingContract string
	Token           string
}

func decodePoolParameters(result []string) (poolParameters, error) {
	if len(result) != 5 {
		return poolParameters{}, fmt.Errorf("unexpected pool parameters length %d", len(result))
	}
	staker, err := normalizeAddress(result[0])
	if err != nil {
		return poolParameters{}, fmt.Errorf("decode pool staker: %w", err)
	}
	staking, err := normalizeAddress(result[2])
	if err != nil {
		return poolParameters{}, fmt.Errorf("decode staking contract: %w", err)
	}
	token, err := normalizeAddress(result[3])
	if err != nil {
		return poolParameters{}, fmt.Errorf("decode pool token: %w", err)
	}
	return poolParameters{Staker: staker, StakingContract: staking, Token: token}, nil
}

// decodePragmaPrice reads a PragmaPricesResponse as a float price and its
// last update timestamp.
func decodePragmaPrice(result []string) (float64, uint64, error) {
	if len(result) < 4 {
		return 0, 0, fmt.Errorf("unexpected oracle response length %d", len(result))
	}
	price, err := parseU128(result[0])
	if err != nil {
		return 0, 0, err
	}
	decimals, err := parseU64(result[1])
	if err != nil || decimals > 36 {
		return 0, 0, fmt.Errorf("invalid oracle decimals")
	}
	updated, err := parseU64(result[2])
	if err != nil {
		return 0, 0, err
	}
	if price.Sign() == 0 {
		return 0, 0, fmt.Errorf("oracle returned a zero price")
	}
	value, _ := new(big.Rat).SetFrac(price, pow10(int(decimals))).Float64()
	return value, updated, nil
}

func pow10(exponent int) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(exponent)), nil)
}

// normalizeAmount rescales a token amount to 18 decimals, the unit the
// staking contract uses for BTC staking power.
func normalizeAmount(amount *big.Int, decimals uint8) *big.Int {
	switch {
	case decimals == 18:
		return new(big.Int).Set(amount)
	case decimals < 18:
		return new(big.Int).Mul(amount, pow10(18-int(decimals)))
	default:
		return new(big.Int).Quo(amount, pow10(int(decimals)-18))
	}
}
