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
import type {
  ControlPointOwnership,
  ControlPointStatus,
  CoreMode,
  IndexedControlPoint,
  OperatorStatus,
} from '../types';
import {
  canManageControlPointImage,
  getControlPointStatus,
  getControlPointStatuses,
  getOperatorStatus,
} from '../services/starknet';
import { useWallet } from './WalletContext';
import { isControlPointId } from '../utils/controlPointGeometry';
import { addressesMatch, isZeroAddress } from '../utils/format';
import { getIndexedControlPoints } from '../services/torii';
import { updateControlPointSelection } from '../utils/controlPointSelection';
import { MAX_CONTROL_POINT_SELECTION } from '../services/controlPointLimits';

interface ControlPointContextValue {
  mode: CoreMode;
  isControlPointInteractionLocked: boolean;
  selectedControlPointId: number | null;
  selectedControlPointIds: number[];
  selectedControlPoint: ControlPointStatus | null;
  selectedControlPoints: ControlPointStatus[];
  operatorStatus: OperatorStatus | null;
  occupiedControlPointIds: number[];
  ownedControlPointIds: number[];
  opponentControlPointIds: number[];
  contestedControlPointIds: number[];
  controlPointOwnerGroups: number[][];
  controlPointControlledSince: ReadonlyMap<number, number>;
  controlPointOwnershipById: ReadonlyMap<number, ControlPointOwnership>;
  projectionControlPointIds: number[];
  projectionLoadingId: number | null;
  isControlPointLoading: boolean;
  isOperatorLoading: boolean;
  controlPointError: string | null;
  operatorError: string | null;
  isControlPointIndexLoading: boolean;
  controlPointIndexError: string | null;
  projectionError: string | null;
  changeMode: (mode: CoreMode) => void;
  selectControlPoint: (
    controlPointId: number | null,
    extendSelection?: boolean
  ) => void;
  selectControlPoints: (controlPointIds: number[]) => void;
  removeSelectedControlPoints: (controlPointIds: readonly number[]) => void;
  toggleProjectionControlPoint: (controlPointId: number) => Promise<void>;
  clearProjectionSelection: () => void;
  refreshControlPoint: () => void;
  refreshOperator: () => void;
  refreshControlPointIndex: () => void;
  setControlPointInteractionLocked: (locked: boolean) => void;
  confirmCapturedControlPoints: (
    controlPoints: ControlPointStatus[],
    operator: string,
    capturePower: bigint,
    clearSelection?: boolean
  ) => void;
  confirmReinforcedControlPoints: (
    controlPoints: ControlPointStatus[],
    capturePower: bigint
  ) => void;
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
    return `${label} is owned by another Operator.`;
  }
  if (status.stale || status.needsSync) {
    return `${label} has stale ownership and must be synced first.`;
  }
  return `${label} is not eligible for image projection.`;
}

export function ControlPointProvider({ children }: PropsWithChildren) {
  const { address } = useWallet();
  const [mode, setMode] = useState<CoreMode>('control');
  const [isControlPointInteractionLocked, setControlPointInteractionLocked] =
    useState(false);
  const [selectedControlPointIds, setSelectedControlPointIds] = useState<
    number[]
  >([]);
  const [selectedControlPoints, setSelectedControlPoints] = useState<
    ControlPointStatus[]
  >([]);
  const [knownControlPoints, setKnownControlPoints] = useState<
    Map<number, ControlPointStatus>
  >(() => new Map());
  const [indexedControlPoints, setIndexedControlPoints] = useState<
    Map<number, IndexedControlPoint>
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
  const [isControlPointIndexLoading, setControlPointIndexLoading] =
    useState(false);
  const [controlPointIndexError, setControlPointIndexError] = useState<
    string | null
  >(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const [controlPointRevision, setControlPointRevision] = useState(0);
  const [operatorRevision, setOperatorRevision] = useState(0);
  const [controlPointIndexRevision, setControlPointIndexRevision] = useState(0);
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
      setSelectedControlPointIds([]);
      setSelectedControlPoints([]);
      setControlPointError(null);
      setProjectionError(null);
      setProjectionLoadingId(null);

      if (nextMode === 'control') {
        setProjectionControlPointIds([]);
      }
    },
    [address]
  );

  const selectControlPoint = useCallback(
    (controlPointId: number | null, extendSelection = false) => {
      if (controlPointId !== null && !isControlPointId(controlPointId)) {
        throw new RangeError(`Invalid Control Point ID: ${controlPointId}`);
      }

      if (controlPointId === null) {
        setSelectedControlPointIds([]);
        return;
      }

      setSelectedControlPointIds((current) => {
        const next = updateControlPointSelection(
          current,
          controlPointId,
          extendSelection
        );
        return next.length <= MAX_CONTROL_POINT_SELECTION ? next : current;
      });
    },
    []
  );

  const selectControlPoints = useCallback((controlPointIds: number[]) => {
    if (controlPointIds.some((id) => !isControlPointId(id))) {
      throw new RangeError('Selection contains an invalid Control Point ID');
    }
    const uniqueControlPointIds = [...new Set(controlPointIds)];
    if (uniqueControlPointIds.length > MAX_CONTROL_POINT_SELECTION) {
      throw new RangeError(
        `At most ${MAX_CONTROL_POINT_SELECTION} Control Points can be selected`
      );
    }

    setSelectedControlPointIds(uniqueControlPointIds);
  }, []);

  const removeSelectedControlPoints = useCallback(
    (controlPointIds: readonly number[]) => {
      const removed = new Set(controlPointIds);
      setSelectedControlPointIds((current) =>
        current.filter((controlPointId) => !removed.has(controlPointId))
      );
      setSelectedControlPoints((current) =>
        current.filter((controlPoint) => !removed.has(controlPoint.id))
      );
    },
    []
  );

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

  const refreshControlPointIndex = useCallback(() => {
    setControlPointIndexRevision((revision) => revision + 1);
  }, []);

  const confirmCapturedControlPoints = useCallback(
    (
      controlPoints: ControlPointStatus[],
      operator: string,
      capturePower: bigint,
      clearSelection = true
    ) => {
      const controlledSince = Math.floor(Date.now() / 1_000);
      const confirmedControlPoints = controlPoints.map((controlPoint) => ({
        ...controlPoint,
        controller: operator,
        capturePower,
        ownershipGeneration: controlPoint.ownershipGeneration + 1n,
        controlledSince,
        stale: false,
        needsSync: false,
      }));

      setKnownControlPoints((current) => {
        const next = new Map(current);
        confirmedControlPoints.forEach((controlPoint) => {
          next.set(controlPoint.id, controlPoint);
        });
        return next;
      });
      setIndexedControlPoints((current) => {
        const next = new Map(current);
        confirmedControlPoints.forEach((controlPoint) => {
          next.set(controlPoint.id, {
            id: controlPoint.id,
            controller: controlPoint.controller,
            controllerGeneration: operatorStatus?.generation || 1n,
            capturePower: controlPoint.capturePower,
            ownershipGeneration: controlPoint.ownershipGeneration,
            controlledSince: controlPoint.controlledSince,
            activeChallengeId: controlPoint.activeChallengeId,
          });
        });
        return next;
      });
      if (clearSelection) {
        setSelectedControlPointIds([]);
        setSelectedControlPoints([]);
      }
      setControlPointError(null);
    },
    [operatorStatus?.generation]
  );

  const confirmReinforcedControlPoints = useCallback(
    (controlPoints: ControlPointStatus[], capturePower: bigint) => {
      const reinforcedControlPoints = controlPoints.map((controlPoint) => ({
        ...controlPoint,
        capturePower,
      }));
      const reinforcedById = new Map(
        reinforcedControlPoints.map((controlPoint) => [
          controlPoint.id,
          controlPoint,
        ])
      );

      setKnownControlPoints((current) => {
        const next = new Map(current);
        reinforcedControlPoints.forEach((controlPoint) => {
          next.set(controlPoint.id, controlPoint);
        });
        return next;
      });
      setIndexedControlPoints((current) => {
        const next = new Map(current);
        reinforcedControlPoints.forEach((controlPoint) => {
          const previous = current.get(controlPoint.id);
          next.set(controlPoint.id, {
            id: controlPoint.id,
            controller: controlPoint.controller,
            controllerGeneration:
              previous?.controllerGeneration ||
              operatorStatus?.generation ||
              1n,
            capturePower: controlPoint.capturePower,
            ownershipGeneration: controlPoint.ownershipGeneration,
            controlledSince: controlPoint.controlledSince,
            activeChallengeId: controlPoint.activeChallengeId,
          });
        });
        return next;
      });
      setSelectedControlPoints((current) =>
        current.map(
          (controlPoint) => reinforcedById.get(controlPoint.id) ?? controlPoint
        )
      );
      setControlPointError(null);
    },
    [operatorStatus?.generation]
  );

  useEffect(() => {
    const controller = new AbortController();
    setControlPointIndexLoading(true);
    setControlPointIndexError(null);

    getIndexedControlPoints(controller.signal)
      .then((controlPoints) => {
        setIndexedControlPoints(
          new Map(
            controlPoints.map((controlPoint) => [controlPoint.id, controlPoint])
          )
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setControlPointIndexError(
            error instanceof Error
              ? error.message
              : 'Unable to read the Torii Control Point index.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setControlPointIndexLoading(false);
        }
      });

    return () => controller.abort();
  }, [controlPointIndexRevision]);

  useEffect(() => {
    const controller = new AbortController();

    if (selectedControlPointIds.length === 0 || mode !== 'control') {
      setSelectedControlPoints([]);
      setControlPointError(null);
      setControlPointLoading(false);
      return () => controller.abort();
    }

    setSelectedControlPoints([]);
    setControlPointError(null);
    setControlPointLoading(true);

    getControlPointStatuses(selectedControlPointIds, controller.signal)
      .then((statuses) => {
        setSelectedControlPoints(statuses);
        statuses.forEach(rememberControlPoint);
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
    selectedControlPointIds,
  ]);

  const selectedControlPointId =
    selectedControlPointIds[selectedControlPointIds.length - 1] ?? null;
  const selectedControlPoint =
    selectedControlPoints.find(
      (controlPoint) => controlPoint.id === selectedControlPointId
    ) ?? null;

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

  const activeControlPoints = useMemo(() => {
    const points = new Map<
      number,
      {
        controller: string;
        ownershipGeneration: bigint;
        controlledSince: number | null;
        activeChallengeId: bigint;
      }
    >();

    indexedControlPoints.forEach((controlPoint) => {
      if (!isZeroAddress(controlPoint.controller)) {
        points.set(controlPoint.id, {
          controller: controlPoint.controller,
          ownershipGeneration: controlPoint.ownershipGeneration,
          controlledSince: controlPoint.controlledSince,
          activeChallengeId: controlPoint.activeChallengeId,
        });
      }
    });

    knownControlPoints.forEach((status) => {
      if (
        isZeroAddress(status.controller) ||
        status.stale ||
        status.needsSync
      ) {
        points.delete(status.id);
      } else {
        const indexed = points.get(status.id);
        points.set(status.id, {
          controller: status.controller,
          ownershipGeneration: status.ownershipGeneration,
          controlledSince:
            status.controlledSince ??
            (indexed && addressesMatch(indexed.controller, status.controller)
              ? indexed.controlledSince
              : null),
          activeChallengeId: status.activeChallengeId,
        });
      }
    });

    return points;
  }, [indexedControlPoints, knownControlPoints]);

  const {
    occupiedControlPointIds,
    ownedControlPointIds,
    opponentControlPointIds,
    contestedControlPointIds,
    controlPointOwnerGroups,
    controlPointControlledSince,
    controlPointOwnershipById,
  } = useMemo(() => {
    const occupied: number[] = [];
    const owned: number[] = [];
    const opponents: number[] = [];
    const contested: number[] = [];
    const ownerGroups = new Map<string, number[]>();
    const controlledSince = new Map<number, number>();
    const ownershipById = new Map<number, ControlPointOwnership>();

    activeControlPoints.forEach((point, id) => {
      const { controller } = point;
      occupied.push(id);
      const ownerKey = BigInt(controller).toString();
      const ownerControlPointIds = ownerGroups.get(ownerKey) ?? [];
      ownerControlPointIds.push(id);
      ownerGroups.set(ownerKey, ownerControlPointIds);
      ownershipById.set(id, {
        controller,
        ownershipGeneration: point.ownershipGeneration,
      });

      if (address && addressesMatch(controller, address)) {
        owned.push(id);
      } else {
        opponents.push(id);
      }
      if (point.activeChallengeId !== 0n) {
        contested.push(id);
      }
      if (point.controlledSince !== null) {
        controlledSince.set(id, point.controlledSince);
      }
    });

    const ascending = (left: number, right: number) => left - right;
    occupied.sort(ascending);
    owned.sort(ascending);
    opponents.sort(ascending);
    contested.sort(ascending);

    return {
      occupiedControlPointIds: occupied,
      ownedControlPointIds: owned,
      opponentControlPointIds: opponents,
      contestedControlPointIds: contested,
      controlPointOwnerGroups: [...ownerGroups.values()].map((ids) =>
        ids.sort(ascending)
      ),
      controlPointControlledSince: controlledSince,
      controlPointOwnershipById: ownershipById,
    };
  }, [activeControlPoints, address]);

  const value = useMemo<ControlPointContextValue>(
    () => ({
      mode,
      isControlPointInteractionLocked,
      selectedControlPointId,
      selectedControlPointIds,
      selectedControlPoint,
      selectedControlPoints,
      operatorStatus,
      occupiedControlPointIds,
      ownedControlPointIds,
      opponentControlPointIds,
      contestedControlPointIds,
      controlPointOwnerGroups,
      controlPointControlledSince,
      controlPointOwnershipById,
      projectionControlPointIds,
      projectionLoadingId,
      isControlPointLoading,
      isOperatorLoading,
      controlPointError,
      operatorError,
      isControlPointIndexLoading,
      controlPointIndexError,
      projectionError,
      changeMode,
      selectControlPoint,
      selectControlPoints,
      removeSelectedControlPoints,
      toggleProjectionControlPoint,
      clearProjectionSelection,
      refreshControlPoint,
      refreshOperator,
      refreshControlPointIndex,
      setControlPointInteractionLocked,
      confirmCapturedControlPoints,
      confirmReinforcedControlPoints,
    }),
    [
      mode,
      isControlPointInteractionLocked,
      selectedControlPointId,
      selectedControlPointIds,
      selectedControlPoint,
      selectedControlPoints,
      operatorStatus,
      occupiedControlPointIds,
      ownedControlPointIds,
      opponentControlPointIds,
      contestedControlPointIds,
      controlPointOwnerGroups,
      controlPointControlledSince,
      controlPointOwnershipById,
      projectionControlPointIds,
      projectionLoadingId,
      isControlPointLoading,
      isOperatorLoading,
      controlPointError,
      operatorError,
      isControlPointIndexLoading,
      controlPointIndexError,
      projectionError,
      changeMode,
      selectControlPoint,
      selectControlPoints,
      removeSelectedControlPoints,
      toggleProjectionControlPoint,
      clearProjectionSelection,
      refreshControlPoint,
      refreshOperator,
      refreshControlPointIndex,
      confirmCapturedControlPoints,
      confirmReinforcedControlPoints,
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
