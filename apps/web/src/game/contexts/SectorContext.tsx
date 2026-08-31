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
import { useSearchParams } from 'react-router-dom';
import type {
  SectorOwnership,
  SectorStatus,
  IndexedSector,
  OperatorStatus,
  ControlView,
} from '../types';
import { getSectorStatuses, getOperatorStatus } from '../services/starknet';
import { useWallet } from './WalletContext';
import { isSectorId } from '../utils/sectorGeometry';
import { addressesMatch, isZeroAddress } from '../utils/format';
import { getIndexedSectors } from '../services/torii';
import { updateSectorSelection } from '../utils/sectorSelection';
import { MAX_SECTOR_SELECTION } from '../services/sectorLimits';
import {
  isProjectionModeEnabled,
  setProjectionMode,
} from '../utils/gameViewSearch';
import {
  sectorStatusMatchesIndexedState,
  sectorStatusesHaveSameEffectiveState,
} from '../utils/sectorState';

interface SectorContextValue {
  controlView: ControlView;
  isProjectionVisible: boolean;
  isCoreWaveFlipped: boolean;
  isImageUploadMode: boolean;
  imageUploadSectorIds: number[];
  isSectorInteractionLocked: boolean;
  selectedSectorId: number | null;
  selectedSectorIds: number[];
  selectedSector: SectorStatus | null;
  selectedSectors: SectorStatus[];
  operatorStatus: OperatorStatus | null;
  occupiedSectorIds: number[];
  ownedSectorIds: number[];
  opponentSectorIds: number[];
  contestedSectorIds: number[];
  sectorOwnerGroups: number[][];
  sectorControlledSince: ReadonlyMap<number, number>;
  sectorCaptureForce: ReadonlyMap<number, bigint>;
  sectorOwnershipById: ReadonlyMap<number, SectorOwnership>;
  isSectorLoading: boolean;
  isOperatorLoading: boolean;
  sectorError: string | null;
  operatorError: string | null;
  isSectorIndexLoading: boolean;
  sectorIndexError: string | null;
  changeControlView: (view: ControlView) => void;
  setProjectionVisible: (visible: boolean) => void;
  setCoreWaveFlipped: (flipped: boolean) => void;
  beginImageUpload: (sectorIds: number[]) => void;
  endImageUpload: () => void;
  selectSector: (sectorId: number | null, extendSelection?: boolean) => void;
  selectSectors: (sectorIds: number[]) => void;
  removeSelectedSectors: (sectorIds: readonly number[]) => void;
  refreshSector: () => void;
  refreshOperator: () => void;
  refreshSectorIndex: () => void;
  setSectorInteractionLocked: (locked: boolean) => void;
  confirmCapturedSectors: (
    sectors: SectorStatus[],
    operator: string,
    captureForce: bigint,
    clearSelection?: boolean
  ) => void;
  confirmReinforcedSectors: (
    sectors: SectorStatus[],
    captureForce: bigint
  ) => void;
}

const SectorContext = createContext<SectorContextValue | undefined>(undefined);

export function SectorProvider({ children }: PropsWithChildren) {
  const { address } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const isProjectionVisible = isProjectionModeEnabled(searchParams);
  const [controlView, setControlView] = useState<ControlView>('flat');
  const [isCoreWaveFlipped, setCoreWaveFlipState] =
    useState(isProjectionVisible);
  const [isImageUploadMode, setImageUploadMode] = useState(false);
  const [imageUploadSectorIds, setImageUploadSectorIds] = useState<number[]>(
    []
  );
  const [isSectorInteractionLocked, setSectorInteractionLocked] =
    useState(false);
  const [selectedSectorIds, setSelectedSectorIds] = useState<number[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<SectorStatus[]>([]);
  const [knownSectors, setKnownSectors] = useState<Map<number, SectorStatus>>(
    () => new Map()
  );
  const [indexedSectors, setIndexedSectors] = useState<
    Map<number, IndexedSector>
  >(() => new Map());
  const indexedSectorsRef = useRef(indexedSectors);
  useEffect(() => {
    indexedSectorsRef.current = indexedSectors;
  }, [indexedSectors]);
  const [operatorStatus, setOperatorStatus] = useState<OperatorStatus | null>(
    null
  );
  const [isSectorLoading, setSectorLoading] = useState(false);
  const [isOperatorLoading, setOperatorLoading] = useState(false);
  const [sectorError, setSectorError] = useState<string | null>(null);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [isSectorIndexLoading, setSectorIndexLoading] = useState(false);
  const [sectorIndexError, setSectorIndexError] = useState<string | null>(null);
  const [sectorRevision, setSectorRevision] = useState(0);
  const [operatorRevision, setOperatorRevision] = useState(0);
  const [sectorIndexRevision, setSectorIndexRevision] = useState(0);

  const rememberSector = useCallback((status: SectorStatus) => {
    setKnownSectors((current) => {
      const indexed = indexedSectorsRef.current.get(status.id);
      if (sectorStatusMatchesIndexedState(status, indexed)) {
        if (!current.has(status.id)) return current;
        const next = new Map(current);
        next.delete(status.id);
        return next;
      }

      const previous = current.get(status.id);
      if (
        previous &&
        sectorStatusesHaveSameEffectiveState(previous, status, indexed)
      ) {
        return current;
      }

      const next = new Map(current);
      next.set(status.id, status);
      return next;
    });
  }, []);

  const changeControlView = useCallback((view: ControlView) => {
    setControlView(view);
  }, []);

  const setProjectionVisible = useCallback(
    (visible: boolean) => {
      setSearchParams((current) => setProjectionMode(current, visible));
    },
    [setSearchParams]
  );

  useEffect(() => {
    setCoreWaveFlipState(isProjectionVisible);
  }, [isProjectionVisible]);

  // Normal projection changes drive the wave flip. Keep an explicit setter so
  // a future Arbiter ability can control the visual state independently.
  const setCoreWaveFlipped = useCallback((flipped: boolean) => {
    setCoreWaveFlipState(flipped);
  }, []);

  const selectSector = useCallback(
    (sectorId: number | null, extendSelection = false) => {
      if (sectorId !== null && !isSectorId(sectorId)) {
        throw new RangeError(`Invalid Sector ID: ${sectorId}`);
      }

      if (sectorId === null) {
        setSelectedSectorIds([]);
        return;
      }

      setSelectedSectorIds((current) => {
        const next = updateSectorSelection(current, sectorId, extendSelection);
        return next.length <= MAX_SECTOR_SELECTION ? next : current;
      });
    },
    []
  );

  const selectSectors = useCallback((sectorIds: number[]) => {
    if (sectorIds.some((id) => !isSectorId(id))) {
      throw new RangeError('Selection contains an invalid Sector ID');
    }
    const uniqueSectorIds = [...new Set(sectorIds)];
    if (uniqueSectorIds.length > MAX_SECTOR_SELECTION) {
      throw new RangeError(
        `At most ${MAX_SECTOR_SELECTION} Sectors can be selected`
      );
    }

    setSelectedSectorIds(uniqueSectorIds);
  }, []);

  const removeSelectedSectors = useCallback((sectorIds: readonly number[]) => {
    const removed = new Set(sectorIds);
    setSelectedSectorIds((current) =>
      current.filter((sectorId) => !removed.has(sectorId))
    );
    setSelectedSectors((current) =>
      current.filter((sector) => !removed.has(sector.id))
    );
  }, []);

  const refreshSector = useCallback(() => {
    setSectorRevision((revision) => revision + 1);
  }, []);

  const refreshOperator = useCallback(() => {
    setOperatorRevision((revision) => revision + 1);
  }, []);

  const refreshSectorIndex = useCallback(() => {
    setSectorIndexRevision((revision) => revision + 1);
  }, []);

  const confirmCapturedSectors = useCallback(
    (
      sectors: SectorStatus[],
      operator: string,
      captureForce: bigint,
      clearSelection = true
    ) => {
      const controlledSince = Math.floor(Date.now() / 1_000);
      const confirmedSectors = sectors.map((sector) => ({
        ...sector,
        controller: operator,
        captureForce,
        ownershipGeneration: sector.ownershipGeneration + 1n,
        controlledSince,
        stale: false,
        needsSync: false,
      }));

      setKnownSectors((current) => {
        const next = new Map(current);
        confirmedSectors.forEach((sector) => {
          next.set(sector.id, sector);
        });
        return next;
      });
      setIndexedSectors((current) => {
        const next = new Map(current);
        confirmedSectors.forEach((sector) => {
          next.set(sector.id, {
            id: sector.id,
            controller: sector.controller,
            controllerGeneration: operatorStatus?.generation || 1n,
            captureForce: sector.captureForce,
            ownershipGeneration: sector.ownershipGeneration,
            controlledSince: sector.controlledSince,
            activeChallengeId: sector.activeChallengeId,
          });
        });
        return next;
      });
      if (clearSelection) {
        setSelectedSectorIds([]);
        setSelectedSectors([]);
      }
      setSectorError(null);
    },
    [operatorStatus?.generation]
  );

  const confirmReinforcedSectors = useCallback(
    (sectors: SectorStatus[], captureForce: bigint) => {
      const reinforcedSectors = sectors.map((sector) => ({
        ...sector,
        captureForce,
      }));
      const reinforcedById = new Map(
        reinforcedSectors.map((sector) => [sector.id, sector])
      );

      setKnownSectors((current) => {
        const next = new Map(current);
        reinforcedSectors.forEach((sector) => {
          next.set(sector.id, sector);
        });
        return next;
      });
      setIndexedSectors((current) => {
        const next = new Map(current);
        reinforcedSectors.forEach((sector) => {
          const previous = current.get(sector.id);
          next.set(sector.id, {
            id: sector.id,
            controller: sector.controller,
            controllerGeneration:
              previous?.controllerGeneration ||
              operatorStatus?.generation ||
              1n,
            captureForce: sector.captureForce,
            ownershipGeneration: sector.ownershipGeneration,
            controlledSince: sector.controlledSince,
            activeChallengeId: sector.activeChallengeId,
          });
        });
        return next;
      });
      setSelectedSectors((current) =>
        current.map((sector) => reinforcedById.get(sector.id) ?? sector)
      );
      setSectorError(null);
    },
    [operatorStatus?.generation]
  );

  useEffect(() => {
    const controller = new AbortController();
    setSectorIndexLoading(true);
    setSectorIndexError(null);

    getIndexedSectors(controller.signal)
      .then((sectors) => {
        setIndexedSectors(
          new Map(sectors.map((sector) => [sector.id, sector]))
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSectorIndexError(
            error instanceof Error
              ? error.message
              : 'Unable to read the Torii Sector index.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSectorIndexLoading(false);
        }
      });

    return () => controller.abort();
  }, [sectorIndexRevision]);

  useEffect(() => {
    const controller = new AbortController();

    if (selectedSectorIds.length === 0) {
      setSelectedSectors([]);
      setSectorError(null);
      setSectorLoading(false);
      return () => controller.abort();
    }

    setSelectedSectors([]);
    setSectorError(null);
    setSectorLoading(true);

    getSectorStatuses(selectedSectorIds, controller.signal)
      .then((statuses) => {
        setSelectedSectors(statuses);
        statuses.forEach(rememberSector);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSectorError(
            error instanceof Error
              ? error.message
              : 'Unable to read this Sector'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSectorLoading(false);
        }
      });

    return () => controller.abort();
  }, [sectorRevision, rememberSector, selectedSectorIds]);

  const selectedSectorId =
    selectedSectorIds[selectedSectorIds.length - 1] ?? null;
  const selectedSector =
    selectedSectors.find((sector) => sector.id === selectedSectorId) ?? null;

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
    setImageUploadMode(false);
    setImageUploadSectorIds([]);
  }, [address]);

  const activeSectors = useMemo(() => {
    const sectors = new Map<
      number,
      {
        controller: string;
        captureForce: bigint;
        ownershipGeneration: bigint;
        controlledSince: number | null;
        activeChallengeId: bigint;
      }
    >();

    indexedSectors.forEach((sector) => {
      if (!isZeroAddress(sector.controller)) {
        sectors.set(sector.id, {
          controller: sector.controller,
          captureForce: sector.captureForce,
          ownershipGeneration: sector.ownershipGeneration,
          controlledSince: sector.controlledSince,
          activeChallengeId: sector.activeChallengeId,
        });
      }
    });

    knownSectors.forEach((status) => {
      if (
        isZeroAddress(status.controller) ||
        status.stale ||
        status.needsSync
      ) {
        sectors.delete(status.id);
      } else {
        const indexed = sectors.get(status.id);
        sectors.set(status.id, {
          controller: status.controller,
          captureForce: status.captureForce,
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

    return sectors;
  }, [indexedSectors, knownSectors]);

  const {
    occupiedSectorIds,
    ownedSectorIds,
    opponentSectorIds,
    contestedSectorIds,
    sectorOwnerGroups,
    sectorControlledSince,
    sectorCaptureForce,
    sectorOwnershipById,
  } = useMemo(() => {
    const occupied: number[] = [];
    const owned: number[] = [];
    const opponents: number[] = [];
    const contested: number[] = [];
    const ownerGroups = new Map<string, number[]>();
    const controlledSince = new Map<number, number>();
    const captureForce = new Map<number, bigint>();
    const ownershipById = new Map<number, SectorOwnership>();

    activeSectors.forEach((sector, id) => {
      const { controller } = sector;
      occupied.push(id);
      const ownerKey = BigInt(controller).toString();
      const ownerSectorIds = ownerGroups.get(ownerKey) ?? [];
      ownerSectorIds.push(id);
      ownerGroups.set(ownerKey, ownerSectorIds);
      ownershipById.set(id, {
        controller,
        ownershipGeneration: sector.ownershipGeneration,
      });
      captureForce.set(id, sector.captureForce);

      if (address && addressesMatch(controller, address)) {
        owned.push(id);
      } else {
        opponents.push(id);
      }
      if (sector.activeChallengeId !== 0n) {
        contested.push(id);
      }
      if (sector.controlledSince !== null) {
        controlledSince.set(id, sector.controlledSince);
      }
    });

    const ascending = (left: number, right: number) => left - right;
    occupied.sort(ascending);
    owned.sort(ascending);
    opponents.sort(ascending);
    contested.sort(ascending);

    return {
      occupiedSectorIds: occupied,
      ownedSectorIds: owned,
      opponentSectorIds: opponents,
      contestedSectorIds: contested,
      sectorOwnerGroups: [...ownerGroups.values()].map((ids) =>
        ids.sort(ascending)
      ),
      sectorControlledSince: controlledSince,
      sectorCaptureForce: captureForce,
      sectorOwnershipById: ownershipById,
    };
  }, [activeSectors, address]);

  const beginImageUpload = useCallback(
    (sectorIds: number[]) => {
      if (sectorIds.some((id) => !isSectorId(id))) {
        throw new RangeError('Image upload contains an invalid Sector ID');
      }
      const uniqueSectorIds = [...new Set(sectorIds)];
      if (uniqueSectorIds.length === 0) {
        throw new RangeError('Choose at least one Sector for image upload');
      }
      if (uniqueSectorIds.length > MAX_SECTOR_SELECTION) {
        throw new RangeError(
          `At most ${MAX_SECTOR_SELECTION} Sectors can be selected`
        );
      }

      const ownedSectorIdSet = new Set(ownedSectorIds);
      if (uniqueSectorIds.some((id) => !ownedSectorIdSet.has(id))) {
        throw new RangeError('Image upload must contain owned Sectors');
      }

      setImageUploadSectorIds(
        uniqueSectorIds.sort((left, right) => left - right)
      );
      setImageUploadMode(true);
    },
    [ownedSectorIds]
  );

  const endImageUpload = useCallback(() => {
    setImageUploadMode(false);
    setImageUploadSectorIds([]);
  }, []);

  const value = useMemo<SectorContextValue>(
    () => ({
      controlView,
      isProjectionVisible,
      isCoreWaveFlipped,
      isImageUploadMode,
      imageUploadSectorIds,
      isSectorInteractionLocked,
      selectedSectorId,
      selectedSectorIds,
      selectedSector,
      selectedSectors,
      operatorStatus,
      occupiedSectorIds,
      ownedSectorIds,
      opponentSectorIds,
      contestedSectorIds,
      sectorOwnerGroups,
      sectorControlledSince,
      sectorCaptureForce,
      sectorOwnershipById,
      isSectorLoading,
      isOperatorLoading,
      sectorError,
      operatorError,
      isSectorIndexLoading,
      sectorIndexError,
      changeControlView,
      setProjectionVisible,
      setCoreWaveFlipped,
      beginImageUpload,
      endImageUpload,
      selectSector,
      selectSectors,
      removeSelectedSectors,
      refreshSector,
      refreshOperator,
      refreshSectorIndex,
      setSectorInteractionLocked,
      confirmCapturedSectors,
      confirmReinforcedSectors,
    }),
    [
      controlView,
      isProjectionVisible,
      isCoreWaveFlipped,
      isImageUploadMode,
      imageUploadSectorIds,
      isSectorInteractionLocked,
      selectedSectorId,
      selectedSectorIds,
      selectedSector,
      selectedSectors,
      operatorStatus,
      occupiedSectorIds,
      ownedSectorIds,
      opponentSectorIds,
      contestedSectorIds,
      sectorOwnerGroups,
      sectorControlledSince,
      sectorCaptureForce,
      sectorOwnershipById,
      isSectorLoading,
      isOperatorLoading,
      sectorError,
      operatorError,
      isSectorIndexLoading,
      sectorIndexError,
      changeControlView,
      setProjectionVisible,
      setCoreWaveFlipped,
      beginImageUpload,
      endImageUpload,
      selectSector,
      selectSectors,
      removeSelectedSectors,
      refreshSector,
      refreshOperator,
      refreshSectorIndex,
      confirmCapturedSectors,
      confirmReinforcedSectors,
    ]
  );

  return (
    <SectorContext.Provider value={value}>{children}</SectorContext.Provider>
  );
}

export function useSectors() {
  const context = useContext(SectorContext);

  if (!context) {
    throw new Error('useSectors must be used within SectorProvider');
  }

  return context;
}
