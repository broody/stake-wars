export interface ArtData {
  _id: string;
  ownerId: string;
  controlPointIds: number[];
  image: string;
  name?: string;
  cameraPos?: string;
  cameraUp?: string;
  cameraAspect?: number;
}

export interface ControlPointStatus {
  id: number;
  controller: string;
  allocatedStake: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
  requiredStake: bigint;
  stale: boolean;
  needsSync: boolean;
}

export interface IndexedControlPoint {
  id: number;
  controller: string;
  allocatedStake: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
}

export interface OperatorStatus {
  operator: string;
  liveDelegatedAmount: bigint;
  totalAllocated: bigint;
  availableStake: bigint;
  generation: bigint;
  controlledPointCount: number;
  needsSync: boolean;
}

export type OperatorActivityType =
  | 'capture'
  | 'loss'
  | 'reinforcement'
  | 'release'
  | 'redeployment'
  | 'disqualification'
  | 'yield_claim';

export interface OperatorActivity {
  id: string;
  type: OperatorActivityType;
  blockNumber: number;
  eventIndex: number;
  transactionHash: string;
  controlPointId?: number;
  destinationControlPointId?: number;
  amount: bigint;
  secondaryAmount?: bigint;
  counterparty?: string;
  affectedPointCount?: number;
}

export interface StakingPoolInfo {
  poolAddress: string;
  validatorAddress: string;
  stakingContractAddress: string;
  tokenAddress: string;
  commissionBps: number;
}

export interface PoolMemberInfo {
  rewardAddress: string;
  amount: bigint;
  unclaimedRewards: bigint;
  commissionBps: number;
  unpoolAmount: bigint;
}

export interface YieldClaim {
  id: string;
  blockNumber: number;
  eventIndex: number;
  transactionHash: string;
  poolMember: string;
  rewardAddress: string;
  amount: bigint;
  executedAt: string;
}

export interface YieldSummary {
  stakedAmount: bigint;
  claimedRewards: bigint | null;
  unclaimedRewards: bigint;
  lifetimeRewards: bigint | null;
  memberSince: string | null;
  claimCount: number;
  rewardAddress: string | null;
  commissionBps: number | null;
  claims: YieldClaim[];
}

export type CoreMode = 'control' | 'projection';

export interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  canConnect: boolean;
  address: string | null;
  chainId: string | null;
  walletName: string | null;
  username: string | null;
  error: string | null;
}

export const UKN_RES = 65536;
