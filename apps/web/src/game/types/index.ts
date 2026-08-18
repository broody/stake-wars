export interface ArtData {
  _id: string;
  ownerId: string;
  sectorIds: number[];
  image: string;
  name?: string;
  cameraPos?: string;
  cameraUp?: string;
  cameraAspect?: number;
}

export interface SectorStatus {
  id: number;
  controller: string;
  captureForce: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
  requiredStake: bigint;
  activeChallengeId: bigint;
  challengeLeadChangeCount: number;
  challengeDeadline: number | null;
  stale: boolean;
  needsSync: boolean;
}

export interface IndexedSector {
  id: number;
  controller: string;
  controllerGeneration: bigint;
  captureForce: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
  activeChallengeId: bigint;
}

export interface SectorOwnership {
  controller: string;
  ownershipGeneration: bigint;
}

export interface SectorArtworkTarget {
  sectorId: number;
  ownershipGeneration: number;
}

export interface ArtworkPlacement {
  projectorMatrix: number[];
  centerX: number;
  centerY: number;
  scale: number;
  rotation: number;
  viewportAspect: number;
}

export interface SectorArtwork {
  id: string;
  network: string;
  ownerAddress: string;
  targets: SectorArtworkTarget[];
  placement: ArtworkPlacement;
  imageUrl: string;
  thumbnailUrl: string;
  contentHash: string;
  updatedAt: string;
}

export interface OperatorStatus {
  operator: string;
  liveDelegatedAmount: bigint;
  sectorForce: bigint;
  challengeForce: bigint;
  spentForce: bigint;
  availableForce: bigint;
  generation: bigint;
  controlledSectorCount: number;
  activeChallengeCount: number;
  retired: boolean;
  exiting: boolean;
  needsSync: boolean;
}

export interface ChallengeStatus {
  id: bigint;
  sectorId: number;
  incumbent: string;
  leader: string;
  leadingForce: bigint;
  lastLoser: string;
  lastLosingForce: bigint;
  deadline: number;
  leadChangeCount: number;
  participantCount: number;
  settled: boolean;
  winner: string;
  winningForce: bigint;
  losingForce: bigint;
}

export interface ChallengeParticipantStatus {
  challengeId: bigint;
  operator: string;
  committedForce: bigint;
  sectorForceIncluded: bigint;
  additionalForce: bigint;
  joined: boolean;
  resolved: boolean;
  won: boolean;
}

export type OperatorActivityType =
  | 'capture'
  | 'loss'
  | 'reinforcement'
  | 'release'
  | 'challenge_initiated'
  | 'challenge_escalated'
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
  sectorId?: number;
  amount: bigint;
  secondaryAmount?: bigint;
  counterparty?: string;
  affectedSectorCount?: number;
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
