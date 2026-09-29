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
  SectorOwnership,
  SectorStatus,
  IndexedSector,
  OperatorStatus,
  ControlView,
} from '../types';
import {
  getOperatorStatus,
  getSectorStatus,
  getSectorStatuses,
} from '../services/starknet';
import { useWallet } from './WalletContext';
import { isSectorId } from '../utils/sectorGeometry';
import { addressesMatch, isZeroAddress } from '../utils/format';
import { getSectorIndex } from '../services/torii';
import { updateSectorSelection } from '../utils/sectorSelection';
import { MAX_SECTOR_SELECTION } from '../services/sectorLimits';
import {
  pruneKnownSectors,
  sectorStatusFromIndex,
  sectorStatusMatchesIndexedState,
  sectorStatusesHaveSameEffectiveState,
} from '../utils/sectorState';
import {
  readOccupiedSectorCache,
  writeOccupiedSectorCache,
} from '../services/occupiedSectorCache';

interface SectorContextValue {
  controlView: ControlView;
  isCoreWaveFlipped: boolean;
  /** Shows only the connected Operator's Sectors, and limits selection to them. */
  isOwnedSectorsView: boolean;
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
  sectorOwnerGroups: number[][];
  sectorControlledSince: ReadonlyMap<number, number>;
  sectorCaptureForce: ReadonlyMap<number, bigint>;
  sectorOwnershipById: ReadonlyMap<number, SectorOwnership>;
  isSectorLoading: boolean;
  isOperatorLoading: boolean;
  sectorError: string | null;
  operatorError: string | null;
  isSectorIndexLoading: boolean;
  hasLoadedSectorIndex: boolean;
  sectorIndexError: string | null;
  changeControlView: (view: ControlView) => void;
  setCoreWaveFlipped: (flipped: boolean) => void;
  setOwnedSectorsView: (visible: boolean) => void;
  beginImageUpload: (sectorIds: number[]) => void;
  endImageUpload: () => void;
  selectSector: (sectorId: number | null, extendSelection?: boolean) => void;
  selectSectors: (sectorIds: number[]) => void;
  removeSelectedSectors: (sectorIds: readonly number[]) => void;
  refreshSector: () => void;
  refreshOperator: () => void;
  refreshSectorIndex: () => void;
  /** Records a Sector status read from the chain until Torii catches up. */
  rememberSectorStatus: (status: SectorStatus) => void;
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

// Torii is read for discovery; every Sector action re-reads the chain before it
// is submitted. Polling keeps other Operators' moves visible without a reload.
const SECTOR_INDEX_REFRESH_MS = 30_000;

export function SectorProvider({ children }: PropsWithChildren) {
  const { address } = useWallet();
  const [controlView, setControlView] = useState<ControlView>('flat');
  const [isCoreWaveFlipped, setCoreWaveFlipState] = useState(true);
  const [isOwnedSectorsView, setOwnedSectorsViewState] = useState(false);
  const [isImageUploadMode, setImageUploadMode] = useState(false);
  const [imageUploadSectorIds, setImageUploadSectorIds] = useState<number[]>(
    []
  );
  const [isSectorInteractionLocked, setSectorInteractionLocked] =
    useState(false);
  const [selectedSectorIds, setSelectedSectorIds] = useState<number[]>([]);
  // Used only while the Torii index is unavailable.
  const [chainSelectedSectors, setChainSelectedSectors] = useState<
    SectorStatus[]
  >([]);
  const [knownSectors, setKnownSectors] = useState<Map<number, SectorStatus>>(
    () => new Map()
  );
  const [indexedSectors, setIndexedSectors] = useState<
    Map<number, IndexedSector>
  >(
    () =>
      new Map(
        (readOccupiedSectorCache() ?? []).map((sector) => [sector.id, sector])
      )
  );
  const [minimumStake, setMinimumStake] = useState<bigint | null>(null);
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
  const [hasLoadedSectorIndex, setHasLoadedSectorIndex] = useState(
    indexedSectors.size > 0
  );
  const [sectorIndexError, setSectorIndexError] = useState<string | null>(null);
  const [sectorRevision, setSectorRevision] = useState(0);
  const [operatorRevision, setOperatorRevision] = useState(0);
  const [sectorIndexRevision, setSectorIndexRevision] = useState(0);
  const isBackgroundIndexRefreshRef = useRef(false);
  const selectedSectorIdsRef = useRef(selectedSectorIds);
  useEffect(() => {
    selectedSectorIdsRef.current = selectedSectorIds;
  }, [selectedSectorIds]);

  useEffect(() => {
    writeOccupiedSectorCache(indexedSectors.values());
  }, [indexedSectors]);

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

  // The Core shows artwork by default. Keep an explicit setter so a future
  // Beacon ability can flip it back to the control face.
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
    setChainSelectedSectors((current) =>
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
          });
        });
        return next;
      });
      if (clearSelection) {
        setSelectedSectorIds([]);
        setChainSelectedSectors([]);
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
          });
        });
        return next;
      });
      setChainSelectedSectors((current) =>
        current.map((sector) => reinforcedById.get(sector.id) ?? sector)
      );
      setSectorError(null);
    },
    [operatorStatus?.generation]
  );

  useEffect(() => {
    const controller = new AbortController();
    const isBackgroundRefresh = isBackgroundIndexRefreshRef.current;
    isBackgroundIndexRefreshRef.current = false;
    if (!isBackgroundRefresh) setSectorIndexLoading(true);
    setSectorIndexError(null);

    getSectorIndex(controller.signal)
      .then(({ sectors, minimumStake: indexedMinimumStake }) => {
        const nextIndexedSectors = new Map(
          sectors.map((sector) => [sector.id, sector])
        );
        setIndexedSectors(nextIndexedSectors);
        setKnownSectors((current) =>
          pruneKnownSectors(current, nextIndexedSectors)
        );
        setMinimumStake(indexedMinimumStake);
        setHasLoadedSectorIndex(true);
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
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      isBackgroundIndexRefreshRef.current = true;
      setSectorIndexRevision((revision) => revision + 1);
    }, SECTOR_INDEX_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  // After a Sector action, read the selection from the chain so the result
  // shows immediately; Torii may take a few seconds to index it.
  useEffect(() => {
    if (sectorRevision === 0) return;
    const sectorIds = selectedSectorIdsRef.current;
    if (sectorIds.length === 0) return;
    const controller = new AbortController();
    getSectorStatuses(sectorIds, controller.signal)
      .then((statuses) => statuses.forEach(rememberSector))
      .catch(() => {
        // The index refresh that follows every action still catches up.
      });
    return () => controller.abort();
  }, [rememberSector, sectorRevision]);

  const readsSelectionFromChain =
    minimumStake === null && sectorIndexError !== null;

  // One background chain read for a single selected Sector catches what Torii
  // cannot show yet, such as an owner who unpooled outside the game.
  const singleSelectedSectorId =
    selectedSectorIds.length === 1 ? selectedSectorIds[0] : null;
  useEffect(() => {
    if (singleSelectedSectorId === null || readsSelectionFromChain) return;
    const controller = new AbortController();
    getSectorStatus(singleSelectedSectorId, controller.signal)
      .then(rememberSector)
      .catch(() => {
        // The indexed status stays on screen; actions re-read the chain.
      });
    return () => controller.abort();
  }, [readsSelectionFromChain, rememberSector, singleSelectedSectorId]);

  useEffect(() => {
    const controller = new AbortController();

    if (!readsSelectionFromChain || selectedSectorIds.length === 0) {
      setChainSelectedSectors([]);
      setSectorError(null);
      setSectorLoading(false);
      return () => controller.abort();
    }

    setChainSelectedSectors([]);
    setSectorError(null);
    setSectorLoading(true);

    getSectorStatuses(selectedSectorIds, controller.signal)
      .then((statuses) => {
        setChainSelectedSectors(statuses);
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
  }, [readsSelectionFromChain, rememberSector, selectedSectorIds]);

  const selectedSectorId =
    selectedSectorIds[selectedSectorIds.length - 1] ?? null;

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
      }
    >();

    indexedSectors.forEach((sector) => {
      if (!isZeroAddress(sector.controller)) {
        sectors.set(sector.id, {
          controller: sector.controller,
          captureForce: sector.captureForce,
          ownershipGeneration: sector.ownershipGeneration,
          controlledSince: sector.controlledSince,
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
        });
      }
    });

    return sectors;
  }, [indexedSectors, knownSectors]);

  const indexedSelectedSectors = useMemo(
    () =>
      minimumStake === null
        ? null
        : selectedSectorIds.map((id) =>
            sectorStatusFromIndex(
              id,
              activeSectors.get(id),
              indexedSectors.get(id),
              knownSectors.get(id),
              minimumStake
            )
          ),
    [
      activeSectors,
      indexedSectors,
      knownSectors,
      minimumStake,
      selectedSectorIds,
    ]
  );
  const selectedSectors = indexedSelectedSectors ?? chainSelectedSectors;
  const selectedSector =
    selectedSectors.find((sector) => sector.id === selectedSectorId) ?? null;
  const isSelectionLoading =
    indexedSelectedSectors === null &&
    selectedSectorIds.length > 0 &&
    (!readsSelectionFromChain || isSectorLoading);

  const {
    occupiedSectorIds,
    ownedSectorIds,
    opponentSectorIds,
    sectorOwnerGroups,
    sectorControlledSince,
    sectorCaptureForce,
    sectorOwnershipById,
  } = useMemo(() => {
    const occupied: number[] = [];
    const owned: number[] = [];
    const opponents: number[] = [];
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
      if (sector.controlledSince !== null) {
        controlledSince.set(id, sector.controlledSince);
      }
    });

    const ascending = (left: number, right: number) => left - right;
    occupied.sort(ascending);
    owned.sort(ascending);
    opponents.sort(ascending);

    return {
      occupiedSectorIds: occupied,
      ownedSectorIds: owned,
      opponentSectorIds: opponents,
      sectorOwnerGroups: [...ownerGroups.values()].map((ids) =>
        ids.sort(ascending)
      ),
      sectorControlledSince: controlledSince,
      sectorCaptureForce: captureForce,
      sectorOwnershipById: ownershipById,
    };
  }, [activeSectors, address]);

  useEffect(() => {
    if (ownedSectorIds.length === 0) setOwnedSectorsViewState(false);
  }, [ownedSectorIds]);

  const setOwnedSectorsView = useCallback(
    (visible: boolean) => {
      if (visible && ownedSectorIds.length === 0) return;
      setOwnedSectorsViewState(visible);
      if (!visible) return;
      const owned = new Set(ownedSectorIds);
      const unowned = selectedSectorIdsRef.current.filter(
        (sectorId) => !owned.has(sectorId)
      );
      if (unowned.length > 0) removeSelectedSectors(unowned);
    },
    [ownedSectorIds, removeSelectedSectors]
  );

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
      isCoreWaveFlipped,
      isOwnedSectorsView,
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
      sectorOwnerGroups,
      sectorControlledSince,
      sectorCaptureForce,
      sectorOwnershipById,
      isSectorLoading: isSelectionLoading,
      isOperatorLoading,
      sectorError,
      operatorError,
      isSectorIndexLoading,
      hasLoadedSectorIndex,
      sectorIndexError,
      changeControlView,
      setCoreWaveFlipped,
      setOwnedSectorsView,
      beginImageUpload,
      endImageUpload,
      selectSector,
      selectSectors,
      removeSelectedSectors,
      refreshSector,
      refreshOperator,
      refreshSectorIndex,
      rememberSectorStatus: rememberSector,
      setSectorInteractionLocked,
      confirmCapturedSectors,
      confirmReinforcedSectors,
    }),
    [
      controlView,
      isCoreWaveFlipped,
      isOwnedSectorsView,
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
      sectorOwnerGroups,
      sectorControlledSince,
      sectorCaptureForce,
      sectorOwnershipById,
      isSelectionLoading,
      isOperatorLoading,
      sectorError,
      operatorError,
      isSectorIndexLoading,
      hasLoadedSectorIndex,
      sectorIndexError,
      changeControlView,
      setCoreWaveFlipped,
      setOwnedSectorsView,
      beginImageUpload,
      endImageUpload,
      selectSector,
      selectSectors,
      removeSelectedSectors,
      refreshSector,
      refreshOperator,
      refreshSectorIndex,
      rememberSector,
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
