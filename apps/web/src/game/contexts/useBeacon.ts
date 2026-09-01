import { createContext, useContext } from 'react';
import type { BeaconSnapshot } from '../services/api';

export interface BeaconContextValue {
  snapshot: BeaconSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export const BeaconContext = createContext<BeaconContextValue | undefined>(
  undefined
);

export function useBeacon() {
  const context = useContext(BeaconContext);
  if (!context) {
    throw new Error('useBeacon must be used within BeaconProvider');
  }
  return context;
}
