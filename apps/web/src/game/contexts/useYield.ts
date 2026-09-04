import { createContext, useContext } from 'react';
import type { YieldSummary } from '../types';
import type { ExternalDelegationPosition } from '../services/stakingPoolDiscovery';

export type ClaimPhase = 'idle' | 'submitting' | 'confirming';
export type StakingActionPhase = 'idle' | 'submitting' | 'confirming';

export interface YieldContextValue {
  summary: YieldSummary | null;
  isLoading: boolean;
  error: string | null;
  historyError: string | null;
  stakePhase: StakingActionPhase;
  stakeError: string | null;
  claimPhase: ClaimPhase;
  claimError: string | null;
  unstakePhase: StakingActionPhase;
  withdrawPhase: StakingActionPhase;
  stakingError: string | null;
  externalDelegations: ExternalDelegationPosition[];
  externalDelegationsLoading: boolean;
  externalDelegationsError: string | null;
  switchPhase: StakingActionPhase;
  switchingPoolAddress: string | null;
  switchError: string | null;
  refreshStaking: () => void;
  stake: (amount: bigint) => Promise<void>;
  claimYield: () => Promise<void>;
  unstakeAll: () => Promise<void>;
  withdrawUnstaked: () => Promise<void>;
  switchDelegation: (position: ExternalDelegationPosition) => Promise<void>;
}

export const YieldContext = createContext<YieldContextValue | undefined>(
  undefined
);

export function useYield() {
  const context = useContext(YieldContext);
  if (!context) {
    throw new Error('useYield must be used within YieldProvider');
  }
  return context;
}
