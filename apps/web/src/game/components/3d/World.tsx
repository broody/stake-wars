import {
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ArcballControls } from '@react-three/drei';
import { useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Scene } from './Scene';
import { IdleCameraRotation } from './IdleCameraRotation';
import { CameraArrival } from './CameraArrival';
import { useSectors } from '../../contexts/SectorContext';
import {
  getSectorIdsInScreenBounds,
  type ScreenBounds,
} from '../../utils/sectorMarquee';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { MAX_SECTOR_SELECTION } from '../../services/sectorLimits';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import { useSectorImages } from '../../contexts/SectorImageContext';
import { suggestedPlacement } from '../../utils/sectorArtworkProjection';
import { ArbiterModal } from '../ui/ArbiterModal';
import { ArbiterCameraTracker } from './ArbiterCameraTracker';

const MARQUEE_DRAG_THRESHOLD_PX = 5;
const PLACEMENT_CORNERS = [
  {
    horizontal: -1,
    vertical: -1,
    label: 'top left',
    className: '-left-1.5 -top-1.5 cursor-nwse-resize',
  },
  {
    horizontal: 1,
    vertical: -1,
    label: 'top right',
    className: '-right-1.5 -top-1.5 cursor-nesw-resize',
  },
  {
    horizontal: -1,
    vertical: 1,
    label: 'bottom left',
    className: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  },
  {
    horizontal: 1,
    vertical: 1,
    label: 'bottom right',
    className: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
  },
] as const;

function PlacementCameraCapture() {
  const { camera, size } = useThree();
  const { projectionSectorIds } = useSectors();
  const { placementDraft, capturePlacement, updatePlacement } =
    useSectorImages();
  const lastProjectorRef = useRef<{ matrix: number[]; aspect: number } | null>(
    null
  );

  useFrame(() => {
    if (!placementDraft || projectionSectorIds.length === 0) {
      lastProjectorRef.current = null;
      return;
    }
    camera.updateMatrixWorld(true);
    if ('updateProjectionMatrix' in camera) camera.updateProjectionMatrix();
    const viewProjection = camera.projectionMatrix
      .clone()
      .multiply(camera.matrixWorldInverse);
    const aspect = size.width / Math.max(1, size.height);
    const matrix = viewProjection.toArray();
    const previous = lastProjectorRef.current;
    const changed =
      !previous ||
      Math.abs(previous.aspect - aspect) > 0.000001 ||
      matrix.some(
        (value, index) =>
          Math.abs(value - (previous.matrix[index] ?? 0)) > 0.000001
      );
    if (!changed) return;

    lastProjectorRef.current = { matrix, aspect };
    if (!placementDraft.placement) {
      capturePlacement(suggestedPlacement(matrix, aspect, projectionSectorIds));
      return;
    }
    updatePlacement({ projectorMatrix: matrix, viewportAspect: aspect });
  });

  return null;
}

function PlacementGuide({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { placementDraft, updatePlacement } = useSectorImages();
  const dragRef = useRef<{
    x: number;
    y: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const resizeRef = useRef<{
    oppositeX: number;
    oppositeY: number;
    unitX: number;
    unitY: number;
  } | null>(null);
  const placement = placementDraft?.placement;
  if (!placement) return null;
  const bounds = containerRef.current?.getBoundingClientRect();
  const width = bounds?.width ?? 1;
  const height = bounds?.height ?? 1;
  const size = placement.scale * height;
  const left = ((placement.centerX + 1) / 2) * width - size / 2;
  const top = ((1 - placement.centerY) / 2) * height - size / 2;

  return (
    <div
      className="absolute cursor-move border border-dashed border-white/75 bg-white/[0.025] shadow-[0_0_0_1px_rgba(0,0,0,0.75)]"
      style={{
        left,
        top,
        width: size,
        height: size,
        transform: `rotate(${placement.rotation}rad)`,
      }}
      role="application"
      aria-label="Artwork placement. Drag to move, drag a corner or scroll to resize."
      tabIndex={0}
      onWheel={(event) => {
        event.preventDefault();
        updatePlacement({
          scale: THREE.MathUtils.clamp(
            placement.scale * Math.exp(event.deltaY * 0.001),
            0.05,
            2
          ),
        });
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          centerX: placement.centerX,
          centerY: placement.centerY,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        updatePlacement({
          centerX: drag.centerX + ((event.clientX - drag.x) * 2) / width,
          centerY: drag.centerY - ((event.clientY - drag.y) * 2) / height,
        });
      }}
      onPointerUp={(event) => {
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      {PLACEMENT_CORNERS.map((corner) => (
        <button
          key={corner.label}
          type="button"
          aria-label={`Resize artwork from ${corner.label} corner`}
          aria-valuemin={5}
          aria-valuemax={200}
          aria-valuenow={Math.round(placement.scale * 100)}
          className={`absolute z-10 h-3 w-3 border border-white bg-black/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${corner.className}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const centerX =
              (bounds?.left ?? 0) + ((placement.centerX + 1) / 2) * width;
            const centerY =
              (bounds?.top ?? 0) + ((1 - placement.centerY) / 2) * height;
            const inverseSqrtTwo = 1 / Math.sqrt(2);
            const localUnitX = corner.horizontal * inverseSqrtTwo;
            const localUnitY = corner.vertical * inverseSqrtTwo;
            const cosine = Math.cos(placement.rotation);
            const sine = Math.sin(placement.rotation);
            const unitX = localUnitX * cosine - localUnitY * sine;
            const unitY = localUnitX * sine + localUnitY * cosine;
            const centerToCorner = size * inverseSqrtTwo;
            resizeRef.current = {
              oppositeX: centerX - unitX * centerToCorner,
              oppositeY: centerY - unitY * centerToCorner,
              unitX,
              unitY,
            };
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            const resize = resizeRef.current;
            if (!resize) return;
            const diagonal = THREE.MathUtils.clamp(
              (event.clientX - resize.oppositeX) * resize.unitX +
                (event.clientY - resize.oppositeY) * resize.unitY,
              0.05 * height * Math.sqrt(2),
              2 * height * Math.sqrt(2)
            );
            const nextSize = diagonal / Math.sqrt(2);
            const nextCenterX =
              resize.oppositeX + (resize.unitX * diagonal) / 2;
            const nextCenterY =
              resize.oppositeY + (resize.unitY * diagonal) / 2;
            updatePlacement({
              centerX: ((nextCenterX - (bounds?.left ?? 0)) / width) * 2 - 1,
              centerY: 1 - ((nextCenterY - (bounds?.top ?? 0)) / height) * 2,
              scale: nextSize / height,
            });
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            resizeRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            event.stopPropagation();
            resizeRef.current = null;
          }}
          onKeyDown={(event) => {
            if (
              event.key !== 'ArrowUp' &&
              event.key !== 'ArrowRight' &&
              event.key !== 'ArrowDown' &&
              event.key !== 'ArrowLeft'
            ) {
              return;
            }
            event.preventDefault();
            const increase =
              event.key === 'ArrowUp' || event.key === 'ArrowRight';
            updatePlacement({
              scale: THREE.MathUtils.clamp(
                placement.scale * (increase ? 1.05 : 0.95),
                0.05,
                2
              ),
            });
          }}
        />
      ))}
    </div>
  );
}

interface PointerPosition {
  x: number;
  y: number;
}

interface MarqueeSelectorHandle {
  select: (bounds: ScreenBounds) => number[];
}

interface MarqueeSelectorProps {
  excludedSectorIds: ReadonlySet<number>;
}

const MarqueeSelector = forwardRef<MarqueeSelectorHandle, MarqueeSelectorProps>(
  function MarqueeSelector({ excludedSectorIds }, ref) {
    const { camera, size } = useThree();

    useImperativeHandle(
      ref,
      () => ({
        select: (bounds) =>
          getSectorIdsInScreenBounds(camera, size, bounds, excludedSectorIds),
      }),
      [camera, excludedSectorIds, size]
    );

    return null;
  }
);

function marqueeBounds(
  start: PointerPosition,
  current: PointerPosition
): ScreenBounds {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    right: Math.max(start.x, current.x),
    bottom: Math.max(start.y, current.y),
  };
}

export function World() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    selectedSectorIds,
    projectionSectorIds,
    opponentSectorIds,
    isSectorInteractionLocked,
    mode,
    selectSectors,
  } = useSectors();
  const { notifyWarning } = useTransactionToast();
  const worldRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<MarqueeSelectorHandle>(null);
  const ignoreArbiterInspectRef = useRef(false);
  const [marqueeStart, setMarqueeStart] = useState<PointerPosition | null>(
    null
  );
  const [marqueeCurrent, setMarqueeCurrent] = useState<PointerPosition | null>(
    null
  );
  const isArbiterOpen = searchParams.get('tracking') === 'arbiter';
  const setArbiterTracking = useCallback(
    (isTracking: boolean) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (isTracking) {
            next.set('tracking', 'arbiter');
          } else if (next.get('tracking') === 'arbiter') {
            next.delete('tracking');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const openArbiterBriefing = useCallback(() => {
    if (ignoreArbiterInspectRef.current) return;
    selectSectors([]);
    setArbiterTracking(true);
  }, [selectSectors, setArbiterTracking]);
  const closeArbiterBriefing = useCallback(
    () => setArbiterTracking(false),
    [setArbiterTracking]
  );

  useEffect(() => {
    if (!isArbiterOpen) return;

    const stopTrackingOnClick = () => {
      ignoreArbiterInspectRef.current = true;
      setArbiterTracking(false);
      queueMicrotask(() => {
        ignoreArbiterInspectRef.current = false;
      });
    };

    window.addEventListener('click', stopTrackingOnClick, true);
    return () => window.removeEventListener('click', stopTrackingOnClick, true);
  }, [isArbiterOpen, setArbiterTracking]);
  const opponentSectorIdSet = useMemo(
    () => new Set(opponentSectorIds),
    [opponentSectorIds]
  );
  const disableIdleRotation =
    selectedSectorIds.length > 0 ||
    projectionSectorIds.length > 0 ||
    isSectorInteractionLocked ||
    isArbiterOpen ||
    marqueeStart !== null;

  const localPointerPosition = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): PointerPosition => {
      const bounds = worldRef.current?.getBoundingClientRect();
      return {
        x: event.clientX - (bounds?.left ?? 0),
        y: event.clientY - (bounds?.top ?? 0),
      };
    },
    []
  );

  const finishMarquee = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!marqueeStart) return;

      event.preventDefault();
      event.stopPropagation();
      const end = localPointerPosition(event);
      const distance = Math.hypot(
        end.x - marqueeStart.x,
        end.y - marqueeStart.y
      );

      if (distance >= MARQUEE_DRAG_THRESHOLD_PX) {
        const selected = selectorRef.current?.select(
          marqueeBounds(marqueeStart, end)
        );
        if (selected && selected.length > MAX_SECTOR_SELECTION) {
          notifyWarning(
            `That bounding box contains ${selected.length} Sectors. Select a smaller area with no more than ${MAX_SECTOR_SELECTION} sectors.`,
            'SELECTION LIMIT'
          );
        } else if (selected) {
          selectSectors(selected);
        }
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    },
    [localPointerPosition, marqueeStart, notifyWarning, selectSectors]
  );

  const cancelMarquee = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!marqueeStart) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    },
    [marqueeStart]
  );

  const activeMarquee =
    marqueeStart && marqueeCurrent
      ? marqueeBounds(marqueeStart, marqueeCurrent)
      : null;

  return (
    <div
      ref={worldRef}
      className="relative h-full w-full"
      onContextMenu={(event) => {
        if (mode === 'control') event.preventDefault();
      }}
      onPointerDownCapture={(event) => {
        if (
          event.button !== 2 ||
          mode !== 'control' ||
          isSectorInteractionLocked
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const start = localPointerPosition(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        setMarqueeStart(start);
        setMarqueeCurrent(start);
      }}
      onPointerMoveCapture={(event) => {
        if (!marqueeStart) return;
        event.preventDefault();
        event.stopPropagation();
        setMarqueeCurrent(localPointerPosition(event));
      }}
      onPointerUpCapture={finishMarquee}
      onPointerCancelCapture={cancelMarquee}
    >
      <Canvas
        camera={{ position: [0, 0, 15], fov: 75 }}
        style={{ width: '100%', height: '100%', background: '#000000' }}
      >
        <Suspense fallback={null}>
          <Scene
            isArbiterTracking={isArbiterOpen}
            onInspectArbiter={openArbiterBriefing}
          />
        </Suspense>

        <MarqueeSelector
          ref={selectorRef}
          excludedSectorIds={opponentSectorIdSet}
        />
        <PlacementCameraCapture />

        {/* ArcballControls provides free rotation including roll by default */}
        <ArcballControls
          minDistance={8}
          maxDistance={30}
          enablePan={false}
          enabled={marqueeStart === null && !isArbiterOpen}
        />

        <CameraArrival />

        {/* Idle camera rotation after 10 seconds of inactivity */}
        <IdleCameraRotation disabled={disableIdleRotation} />
        <ArbiterCameraTracker active={isArbiterOpen} />
      </Canvas>

      <PlacementGuide containerRef={worldRef} />

      <ArbiterModal isOpen={isArbiterOpen} onClose={closeArbiterBriefing} />

      {activeMarquee ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border"
          style={{
            left: activeMarquee.left,
            top: activeMarquee.top,
            width: activeMarquee.right - activeMarquee.left,
            height: activeMarquee.bottom - activeMarquee.top,
            borderColor: SECTOR_COLORS.selected,
            backgroundColor: `${SECTOR_COLORS.selected}1a`,
            boxShadow: `0 0 12px ${SECTOR_COLORS.selected}33`,
          }}
        />
      ) : null}
    </div>
  );
}
