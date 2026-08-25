import { createContext, useContext } from 'react';
import type { ArbiterSnapshot } from '../services/api';

export interface ArbiterContextValue {
  snapshot: ArbiterSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export const ArbiterContext = createContext<ArbiterContextValue | undefined>(
  undefined
);

export function useArbiter() {
  const context = useContext(ArbiterContext);
  if (!context) {
    throw new Error('useArbiter must be used within ArbiterProvider');
  }
  return context;
}
