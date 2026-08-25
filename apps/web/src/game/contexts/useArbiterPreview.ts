import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createArbiterMockSnapshot,
  isArbiterMockMode,
} from '../services/arbiterMock';
import type { ArbiterPreviewMode } from '../services/arbiterMock';
import { useArbiter } from './useArbiter';

export function useArbiterPreview() {
  const liveState = useArbiter();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMockMode = searchParams.get('arbiterMock');
  const mockMode =
    import.meta.env.DEV && isArbiterMockMode(requestedMockMode)
      ? requestedMockMode
      : null;
  const mockSnapshot = useMemo(
    () => (mockMode ? createArbiterMockSnapshot(mockMode) : null),
    [mockMode]
  );

  const changePreviewMode = useCallback(
    (mode: ArbiterPreviewMode) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (mode === 'live') next.delete('arbiterMock');
          else next.set('arbiterMock', mode);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return {
    snapshot: mockSnapshot ?? liveState.snapshot,
    isLoading: mockSnapshot ? false : liveState.isLoading,
    error: mockSnapshot ? null : liveState.error,
    refresh: liveState.refresh,
    previewMode: import.meta.env.DEV
      ? ((mockMode ?? 'live') as ArbiterPreviewMode)
      : undefined,
    onPreviewModeChange: import.meta.env.DEV ? changePreviewMode : undefined,
  };
}
