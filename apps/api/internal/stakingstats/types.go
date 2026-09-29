package stakingstats

import "time"

// Snapshot is the public, cached view of Starknet staking. Token amounts are
// decimal strings in base units; fields named *Btc are normalized to 18
// decimals like the staking contract's BTC staking power.
type Snapshot struct {
	Network    string        `json:"network"`
	ObservedAt time.Time     `json:"observedAt"`
	Block      BlockRef      `json:"block"`
	Contracts  ContractRefs  `json:"contracts"`
	Epoch      Epoch         `json:"epoch"`
	Parameters Parameters    `json:"parameters"`
	Prices     *Prices       `json:"prices"`
	Tokens     []TokenStake  `json:"tokens"`
	Totals     Totals        `json:"totals"`
	APR        APR           `json:"apr"`
	Featured   *Validator    `json:"featured"`
	Validators []Validator   `json:"validators"`
	Unstaking  Unstaking     `json:"unstaking"`
	Index      IndexProgress `json:"index"`

	livePoint *HistoryPoint
}

type BlockRef struct {
	Number    uint64 `json:"number"`
	Timestamp int64  `json:"timestamp"`
}

type ContractRefs struct {
	Staking        string `json:"staking"`
	RewardSupplier string `json:"rewardSupplier"`
	MintingCurve   string `json:"mintingCurve"`
	FeaturedPool   string `json:"featuredPool"`
}

type Epoch struct {
	ID              uint64 `json:"id"`
	StartBlock      uint64 `json:"startBlock"`
	LengthBlocks    uint64 `json:"lengthBlocks"`
	DurationSeconds uint64 `json:"durationSeconds"`
	BlocksElapsed   uint64 `json:"blocksElapsed"`
	EstimatedEndAt  int64  `json:"estimatedEndAt"`
}

type Parameters struct {
	MinStake              string `json:"minStake"`
	ExitWaitWindowSeconds uint64 `json:"exitWaitWindowSeconds"`
	YearlyMint            string `json:"yearlyMint"`
	BtcRewardSharePercent uint64 `json:"btcRewardSharePercent"`
}

type Prices struct {
	StrkUsd   float64 `json:"strkUsd"`
	BtcUsd    float64 `json:"btcUsd"`
	UpdatedAt int64   `json:"updatedAt"`
	Source    string  `json:"source"`
}

type TokenStake struct {
	Address  string `json:"address"`
	Symbol   string `json:"symbol"`
	Decimals uint8  `json:"decimals"`
	Kind     string `json:"kind"`
	Active   bool   `json:"active"`
	Staked   string `json:"staked"`
	Pending  string `json:"pending"`
}

type Totals struct {
	StrkStaked            string `json:"strkStaked"`
	BtcStaked             string `json:"btcStaked"`
	StrkPending           string `json:"strkPending"`
	StrkPendingDelegators string `json:"strkPendingDelegators"`
	StrkPendingValidators string `json:"strkPendingValidators"`
	BtcPending            string `json:"btcPending"`
	ActiveValidators      int    `json:"activeValidators"`
	ExitingValidators     int    `json:"exitingValidators"`
	Delegators            *int   `json:"delegators"`
}

type APR struct {
	MaxStrkPercent *float64 `json:"maxStrkPercent"`
	MaxBtcPercent  *float64 `json:"maxBtcPercent"`
}

type Validator struct {
	Address             string          `json:"address"`
	RewardAddress       string          `json:"rewardAddress"`
	OperationalAddress  string          `json:"operationalAddress"`
	Rank                *int            `json:"rank"`
	Featured            bool            `json:"featured"`
	Status              string          `json:"status"`
	UnstakeAt           *int64          `json:"unstakeAt"`
	SelfStake           string          `json:"selfStake"`
	DelegatedStrk       string          `json:"delegatedStrk"`
	TotalStrk           string          `json:"totalStrk"`
	DelegatedBtc        string          `json:"delegatedBtc"`
	Pools               []ValidatorPool `json:"pools"`
	CommissionBps       *uint64         `json:"commissionBps"`
	StakingPowerPercent float64         `json:"stakingPowerPercent"`
	AprStrkPercent      *float64        `json:"aprStrkPercent"`
	AprBtcPercent       *float64        `json:"aprBtcPercent"`
	Delegators          *int            `json:"delegators"`
	PendingStrk         string          `json:"pendingStrk"`
	PendingBtc          string          `json:"pendingBtc"`
	UnclaimedRewards    string          `json:"unclaimedRewards"`
}

type ValidatorPool struct {
	Address  string `json:"address"`
	Token    string `json:"token"`
	Symbol   string `json:"symbol"`
	Decimals uint8  `json:"decimals"`
	Amount   string `json:"amount"`
}

type Unstaking struct {
	PendingExits      int                `json:"pendingExits"`
	WithdrawableStrk  string             `json:"withdrawableStrk"`
	WithdrawableBtc   string             `json:"withdrawableBtc"`
	Schedule          []UnlockDay        `json:"schedule"`
	Largest           []PendingExit      `json:"largest"`
	ExitingValidators []ExitingValidator `json:"exitingValidators"`
}

// UnlockDay totals the exits whose window ends during the UTC day starting at Day.
type UnlockDay struct {
	Day   int64  `json:"day"`
	Strk  string `json:"strk"`
	Btc   string `json:"btc"`
	Count int    `json:"count"`
}

type PendingExit struct {
	Member    string `json:"member"`
	Validator string `json:"validator"`
	Token     string `json:"token"`
	Symbol    string `json:"symbol"`
	Decimals  uint8  `json:"decimals"`
	Amount    string `json:"amount"`
	UnlockAt  int64  `json:"unlockAt"`
	Estimated bool   `json:"estimated"`
}

type ExitingValidator struct {
	Address       string `json:"address"`
	SelfStake     string `json:"selfStake"`
	DelegatedStrk string `json:"delegatedStrk"`
	DelegatedBtc  string `json:"delegatedBtc"`
	UnlockAt      int64  `json:"unlockAt"`
}

type IndexProgress struct {
	DeploymentBlock uint64 `json:"deploymentBlock"`
	HeadBlock       uint64 `json:"headBlock"`
	StakingBlock    uint64 `json:"stakingBlock"`
	StakingSynced   bool   `json:"stakingSynced"`
	MembersBlock    uint64 `json:"membersBlock"`
	MembersSynced   bool   `json:"membersSynced"`
	HistoryThrough  *int64 `json:"historyThrough"`
	HistorySynced   bool   `json:"historySynced"`
}

// History lists daily network totals, ending with the live observation.
type History struct {
	Network string         `json:"network"`
	Synced  bool           `json:"synced"`
	Points  []HistoryPoint `json:"points"`
}

// HistoryPoint pending amounts count delegator exit intents only; validator
// self-stake exits are not reconstructible at past blocks.
type HistoryPoint struct {
	Timestamp    int64   `json:"timestamp"`
	Block        uint64  `json:"block"`
	StrkStaked   string  `json:"strkStaked"`
	BtcStaked    string  `json:"btcStaked"`
	StrkPending  string  `json:"strkPending"`
	BtcPending   string  `json:"btcPending"`
	FeaturedStrk *string `json:"featuredStrk"`
	FeaturedBtc  *string `json:"featuredBtc"`
	Live         bool    `json:"live"`
}
