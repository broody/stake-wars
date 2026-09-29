// Public Starknet staking statistics served by the Stake Wars API. Token
// amounts are base-unit decimal strings; fields named *Btc are normalized to
// 18 decimals like the staking contract's BTC staking power.

export interface StakingEpoch {
  id: number;
  startBlock: number;
  lengthBlocks: number;
  durationSeconds: number;
  blocksElapsed: number;
  estimatedEndAt: number;
}

export interface StakingPrices {
  strkUsd: number;
  btcUsd: number;
  updatedAt: number;
  source: string;
}

export interface StakingTokenStake {
  address: string;
  symbol: string;
  decimals: number;
  kind: 'strk' | 'btc';
  active: boolean;
  staked: string;
  pending: string;
}

export interface StakingValidatorPool {
  address: string;
  token: string;
  symbol: string;
  decimals: number;
  amount: string;
}

export interface StakingValidator {
  address: string;
  rewardAddress: string;
  operationalAddress: string;
  rank: number | null;
  featured: boolean;
  status: 'active' | 'exiting';
  unstakeAt: number | null;
  selfStake: string;
  delegatedStrk: string;
  totalStrk: string;
  delegatedBtc: string;
  pools: StakingValidatorPool[];
  commissionBps: number | null;
  stakingPowerPercent: number;
  aprStrkPercent: number | null;
  aprBtcPercent: number | null;
  delegators: number | null;
  pendingStrk: string;
  pendingBtc: string;
  unclaimedRewards: string;
}

export interface StakingUnlockDay {
  day: number;
  strk: string;
  btc: string;
  count: number;
}

export interface StakingPendingExit {
  member: string;
  validator: string;
  token: string;
  symbol: string;
  decimals: number;
  amount: string;
  unlockAt: number;
  estimated: boolean;
}

export interface StakingExitingValidator {
  address: string;
  selfStake: string;
  delegatedStrk: string;
  delegatedBtc: string;
  unlockAt: number;
}

export interface StakingIndexProgress {
  deploymentBlock: number;
  headBlock: number;
  stakingBlock: number;
  stakingSynced: boolean;
  membersBlock: number;
  membersSynced: boolean;
  historyThrough: number | null;
  historySynced: boolean;
}

export interface StakingSnapshot {
  network: string;
  observedAt: string;
  block: { number: number; timestamp: number };
  contracts: {
    staking: string;
    rewardSupplier: string;
    mintingCurve: string;
    featuredPool: string;
  };
  epoch: StakingEpoch;
  parameters: {
    minStake: string;
    exitWaitWindowSeconds: number;
    yearlyMint: string;
    btcRewardSharePercent: number;
  };
  prices: StakingPrices | null;
  tokens: StakingTokenStake[];
  totals: {
    strkStaked: string;
    btcStaked: string;
    strkPending: string;
    strkPendingDelegators: string;
    strkPendingValidators: string;
    btcPending: string;
    activeValidators: number;
    exitingValidators: number;
    delegators: number | null;
  };
  apr: { maxStrkPercent: number | null; maxBtcPercent: number | null };
  featured: StakingValidator | null;
  validators: StakingValidator[];
  unstaking: {
    pendingExits: number;
    withdrawableStrk: string;
    withdrawableBtc: string;
    schedule: StakingUnlockDay[];
    largest: StakingPendingExit[];
    exitingValidators: StakingExitingValidator[];
  };
  index: StakingIndexProgress;
}

/** Pending amounts in history count delegator exit intents only. */
export interface StakingHistoryPoint {
  timestamp: number;
  block: number;
  strkStaked: string;
  btcStaked: string;
  strkPending: string;
  btcPending: string;
  featuredStrk: string | null;
  featuredBtc: string | null;
  live: boolean;
}

export interface StakingHistory {
  network: string;
  synced: boolean;
  points: StakingHistoryPoint[];
}
