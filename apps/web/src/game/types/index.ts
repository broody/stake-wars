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
  capturePower: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
  requiredStake: bigint;
  activeChallengeId: bigint;
  challengeLeader: string;
  challengeLeaderPower: bigint;
  challengeDeadline: number | null;
  stale: boolean;
  needsSync: boolean;
}

export interface IndexedControlPoint {
  id: number;
  controller: string;
  controllerGeneration: bigint;
  capturePower: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
}

export interface OperatorStatus {
  operator: string;
  liveDelegatedAmount: bigint;
  pointPower: bigint;
  challengePower: bigint;
  availablePower: bigint;
  generation: bigint;
  controlledPointCount: number;
  activeChallengeId: bigint;
  activeChallengeCommitment: bigint;
  retired: boolean;
  exiting: boolean;
  needsSync: boolean;
}

export interface ChallengeStatus {
  id: bigint;
  controlPointId: number;
  incumbent: string;
  leader: string;
  leaderPower: bigint;
  requiredPower: bigint;
  deadline: number;
  participantCount: number;
  settled: boolean;
  winner: string;
}

export type OperatorActivityType =
  | 'capture'
  | 'loss'
  | 'reinforcement'
  | 'release'
  | 'challenge'
  | 'leadership'
  | 'settlement'
  | 'retirement'
  | 'disqualification'
  | 'relinquishment'
  | 'yield_claim';

export interface OperatorActivity {
  id: string;
  type: OperatorActivityType;
  blockNumber: number;
  eventIndex: number;
  transactionHash: string;
  controlPointId?: number;
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
  unpoolTime: number | null;
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
  unpoolAmount: bigint;
  unpoolTime: number | null;
  exitWaitWindowSeconds: number | null;
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
