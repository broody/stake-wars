import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import type { ControlPointStatus, CoreMode, OperatorStatus } from '../types';
import {
  canManageControlPointImage,
  getControlPointStatus,
  getOperatorStatus,
} from '../services/starknet';
import { useWallet } from './WalletContext';
import { isControlPointId } from '../utils/controlPointGeometry';
import { addressesMatch, isZeroAddress } from '../utils/format';

interface ControlPointContextValue {
  mode: CoreMode;
  selectedControlPointId: number | null;
  selectedControlPoint: ControlPointStatus | null;
  operatorStatus: OperatorStatus | null;
  occupiedControlPointIds: number[];
  projectionControlPointIds: number[];
  projectionLoadingId: number | null;
  isControlPointLoading: boolean;
  isOperatorLoading: boolean;
  controlPointError: string | null;
  operatorError: string | null;
  projectionError: string | null;
  changeMode: (mode: CoreMode) => void;
  selectControlPoint: (controlPointId: number | null) => void;
  toggleProjectionControlPoint: (controlPointId: number) => Promise<void>;
  clearProjectionSelection: () => void;
  refreshControlPoint: () => void;
  refreshOperator: () => void;
}

const ControlPointContext = createContext<ControlPointContextValue | undefined>(
  undefined
);

function projectionErrorFor(
  status: ControlPointStatus,
  operatorAddress: string
): string {
  const label = `CP-${status.id.toString().padStart(4, '0')}`;

  if (isZeroAddress(status.controller)) {
    return `${label} is neutral. Capture it in Core mode before projecting.`;
  }
  if (!addressesMatch(status.controller, operatorAddress)) {
    return `${label} is controlled by another Operator.`;
  }
  if (status.stale || status.needsSync) {
    return `${label} has stale ownership and must be synced first.`;
  }
  return `${label} is not eligible for image projection.`;
}

export function ControlPointProvider({ children }: PropsWithChildren) {
  const { address } = useWallet();
  const [mode, setMode] = useState<CoreMode>('control');
  const [selectedControlPointId, setSelectedControlPointId] = useState<
    number | null
  >(null);
  const [selectedControlPoint, setSelectedControlPoint] =
    useState<ControlPointStatus | null>(null);
  const [knownControlPoints, setKnownControlPoints] = useState<
    Map<number, ControlPointStatus>
  >(() => new Map());
  const [projectionControlPointIds, setProjectionControlPointIds] = useState<
    number[]
  >([]);
  const [projectionLoadingId, setProjectionLoadingId] = useState<number | null>(
    null
  );
  const [operatorStatus, setOperatorStatus] = useState<OperatorStatus | null>(
    null
  );
  const [isControlPointLoading, setControlPointLoading] = useState(false);
  const [isOperatorLoading, setOperatorLoading] = useState(false);
  const [controlPointError, setControlPointError] = useState<string | null>(
    null
  );
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const [controlPointRevision, setControlPointRevision] = useState(0);
  const [operatorRevision, setOperatorRevision] = useState(0);
  const projectionRequest = useRef<AbortController | null>(null);

  const rememberControlPoint = useCallback((status: ControlPointStatus) => {
    setKnownControlPoints((current) => {
      const next = new Map(current);
      next.set(status.id, status);
      return next;
    });
  }, []);

  const changeMode = useCallback(
    (nextMode: CoreMode) => {
      if (nextMode === 'projection' && !address) {
        setProjectionError(
          'Connect an Operator wallet to use Projection mode.'
        );
        return;
      }

      projectionRequest.current?.abort();
      setMode(nextMode);
      setSelectedControlPointId(null);
      setSelectedControlPoint(null);
      setControlPointError(null);
      setProjectionError(null);
      setProjectionLoadingId(null);

      if (nextMode === 'control') {
        setProjectionControlPointIds([]);
      }
    },
    [address]
  );

  const selectControlPoint = useCallback((controlPointId: number | null) => {
    if (controlPointId !== null && !isControlPointId(controlPointId)) {
      throw new RangeError(`Invalid Control Point ID: ${controlPointId}`);
    }

    setSelectedControlPointId((current) =>
      current === controlPointId ? null : controlPointId
    );
  }, []);

  const toggleProjectionControlPoint = useCallback(
    async (controlPointId: number) => {
      if (!isControlPointId(controlPointId)) {
        throw new RangeError(`Invalid Control Point ID: ${controlPointId}`);
      }

      if (projectionControlPointIds.includes(controlPointId)) {
        setProjectionControlPointIds((current) =>
          current.filter((id) => id !== controlPointId)
        );
        setProjectionError(null);
        return;
      }

      if (!address) {
        setProjectionError('Connect an Operator wallet to select projections.');
        return;
      }

      projectionRequest.current?.abort();
      const controller = new AbortController();
      projectionRequest.current = controller;
      setProjectionLoadingId(controlPointId);
      setProjectionError(null);

      try {
        const status = await getControlPointStatus(
          controlPointId,
          controller.signal
        );
        rememberControlPoint(status);

        if (
          isZeroAddress(status.controller) ||
          !addressesMatch(status.controller, address) ||
          status.stale ||
          status.needsSync
        ) {
          setProjectionError(projectionErrorFor(status, address));
          return;
        }

        const canManageImage = await canManageControlPointImage(
          status.id,
          address,
          status.ownershipGeneration,
          controller.signal
        );

        if (!canManageImage) {
          setProjectionError(projectionErrorFor(status, address));
          return;
        }

        setProjectionControlPointIds((current) =>
          current.includes(controlPointId)
            ? current
            : [...current, controlPointId].sort((left, right) => left - right)
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setProjectionError(
            error instanceof Error
              ? error.message
              : 'Unable to verify Control Point ownership.'
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setProjectionLoadingId(null);
        }
      }
    },
    [address, projectionControlPointIds, rememberControlPoint]
  );

  const clearProjectionSelection = useCallback(() => {
    setProjectionControlPointIds([]);
    setProjectionError(null);
  }, []);

  const refreshControlPoint = useCallback(() => {
    setControlPointRevision((revision) => revision + 1);
  }, []);

  const refreshOperator = useCallback(() => {
    setOperatorRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    if (selectedControlPointId === null || mode !== 'control') {
      setSelectedControlPoint(null);
      setControlPointError(null);
      setControlPointLoading(false);
      return () => controller.abort();
    }

    setSelectedControlPoint(null);
    setControlPointError(null);
    setControlPointLoading(true);

    getControlPointStatus(selectedControlPointId, controller.signal)
      .then((status) => {
        setSelectedControlPoint(status);
        rememberControlPoint(status);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setControlPointError(
            error instanceof Error
              ? error.message
              : 'Unable to read this Control Point'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setControlPointLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    controlPointRevision,
    mode,
    rememberControlPoint,
    selectedControlPointId,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    if (!address) {
      setOperatorStatus(null);
      setOperatorError(null);
      setOperatorLoading(false);
      return () => controller.abort();
    }

    setOperatorStatus(null);
    setOperatorError(null);
    setOperatorLoading(true);

    getOperatorStatus(address, controller.signal)
      .then(setOperatorStatus)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOperatorError(
            error instanceof Error
              ? error.message
              : 'Unable to read Operator stake'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setOperatorLoading(false);
        }
      });

    return () => controller.abort();
  }, [address, operatorRevision]);

  useEffect(() => {
    if (address) return;

    projectionRequest.current?.abort();
    setMode('control');
    setProjectionControlPointIds([]);
    setProjectionLoadingId(null);
    setProjectionError(null);
  }, [address]);

  useEffect(
    () => () => {
      projectionRequest.current?.abort();
    },
    []
  );

  const occupiedControlPointIds = useMemo(
    () =>
      [...knownControlPoints.values()]
        .filter(
          (status) =>
            !isZeroAddress(status.controller) &&
            !status.stale &&
            !status.needsSync
        )
        .map((status) => status.id)
        .sort((left, right) => left - right),
    [knownControlPoints]
  );

  const value = useMemo<ControlPointContextValue>(
    () => ({
      mode,
      selectedControlPointId,
      selectedControlPoint,
      operatorStatus,
      occupiedControlPointIds,
      projectionControlPointIds,
      projectionLoadingId,
      isControlPointLoading,
      isOperatorLoading,
      controlPointError,
      operatorError,
      projectionError,
      changeMode,
      selectControlPoint,
      toggleProjectionControlPoint,
      clearProjectionSelection,
      refreshControlPoint,
      refreshOperator,
    }),
    [
      mode,
      selectedControlPointId,
      selectedControlPoint,
      operatorStatus,
      occupiedControlPointIds,
      projectionControlPointIds,
      projectionLoadingId,
      isControlPointLoading,
      isOperatorLoading,
      controlPointError,
      operatorError,
      projectionError,
      changeMode,
      selectControlPoint,
      toggleProjectionControlPoint,
      clearProjectionSelection,
      refreshControlPoint,
      refreshOperator,
    ]
  );

  return (
    <ControlPointContext.Provider value={value}>
      {children}
    </ControlPointContext.Provider>
  );
}

export function useControlPoints() {
  const context = useContext(ControlPointContext);

  if (!context) {
    throw new Error(
      'useControlPoints must be used within ControlPointProvider'
    );
  }

  return context;
}
