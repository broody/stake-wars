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
  requiredStake: bigint;
  stale: boolean;
  needsSync: boolean;
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
