import { createContext, useContext } from 'react';
import type { YieldSummary } from '../types';

export type ClaimPhase = 'idle' | 'submitting' | 'confirming';

export interface YieldContextValue {
  summary: YieldSummary | null;
  isLoading: boolean;
  error: string | null;
  historyError: string | null;
  isOpen: boolean;
  claimPhase: ClaimPhase;
  claimError: string | null;
  openYield: () => void;
  closeYield: () => void;
  refreshYield: () => void;
  claimYield: () => Promise<void>;
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
