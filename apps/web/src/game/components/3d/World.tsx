import {
  Suspense,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ArcballControls } from '@react-three/drei';
import { Scene } from './Scene';
import { IdleCameraRotation } from './IdleCameraRotation';
import { useControlPoints } from '../../contexts/ControlPointContext';
import {
  getControlPointIdsInScreenBounds,
  type ScreenBounds,
} from '../../utils/controlPointMarquee';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { MAX_CONTROL_POINT_SELECTION } from '../../services/controlPointLimits';
import { CONTROL_POINT_COLORS } from '../../utils/controlPointVisuals';

const MARQUEE_DRAG_THRESHOLD_PX = 5;

interface PointerPosition {
  x: number;
  y: number;
}

interface MarqueeSelectorHandle {
  select: (bounds: ScreenBounds) => number[];
}

interface MarqueeSelectorProps {
  excludedControlPointIds: ReadonlySet<number>;
}

const MarqueeSelector = forwardRef<MarqueeSelectorHandle, MarqueeSelectorProps>(
  function MarqueeSelector({ excludedControlPointIds }, ref) {
    const { camera, size } = useThree();

    useImperativeHandle(
      ref,
      () => ({
        select: (bounds) =>
          getControlPointIdsInScreenBounds(
            camera,
            size,
            bounds,
            excludedControlPointIds
          ),
      }),
      [camera, excludedControlPointIds, size]
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
  const {
    selectedControlPointIds,
    projectionControlPointIds,
    opponentControlPointIds,
    isControlPointInteractionLocked,
    mode,
    selectControlPoints,
  } = useControlPoints();
  const { notifyWarning } = useTransactionToast();
  const worldRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<MarqueeSelectorHandle>(null);
  const [marqueeStart, setMarqueeStart] = useState<PointerPosition | null>(
    null
  );
  const [marqueeCurrent, setMarqueeCurrent] = useState<PointerPosition | null>(
    null
  );
  const opponentControlPointIdSet = useMemo(
    () => new Set(opponentControlPointIds),
    [opponentControlPointIds]
  );
  const disableIdleRotation =
    selectedControlPointIds.length > 0 ||
    projectionControlPointIds.length > 0 ||
    isControlPointInteractionLocked ||
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
        if (selected && selected.length > MAX_CONTROL_POINT_SELECTION) {
          notifyWarning(
            `That bounding box contains ${selected.length} Control Points. Select a smaller area with no more than ${MAX_CONTROL_POINT_SELECTION} points.`,
            'SELECTION LIMIT'
          );
        } else if (selected) {
          selectControlPoints(selected);
        }
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    },
    [localPointerPosition, marqueeStart, notifyWarning, selectControlPoints]
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
          isControlPointInteractionLocked
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
          <Scene />
        </Suspense>

        <MarqueeSelector
          ref={selectorRef}
          excludedControlPointIds={opponentControlPointIdSet}
        />

        {/* ArcballControls provides free rotation including roll by default */}
        <ArcballControls
          minDistance={8}
          maxDistance={30}
          enablePan={false}
          enabled={marqueeStart === null}
        />

        {/* Idle camera rotation after 10 seconds of inactivity */}
        <IdleCameraRotation disabled={disableIdleRotation} />
      </Canvas>

      {activeMarquee ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border"
          style={{
            left: activeMarquee.left,
            top: activeMarquee.top,
            width: activeMarquee.right - activeMarquee.left,
            height: activeMarquee.bottom - activeMarquee.top,
            borderColor: CONTROL_POINT_COLORS.selected,
            backgroundColor: `${CONTROL_POINT_COLORS.selected}1a`,
            boxShadow: `0 0 12px ${CONTROL_POINT_COLORS.selected}33`,
          }}
        />
      ) : null}
    </div>
  );
}
