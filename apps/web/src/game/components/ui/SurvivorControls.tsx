import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { survivorsSession } from '../../survivors/session';

const STICK_RADIUS = 48;
// Radians per drag across the shorter side of the play surface.
const TURN = Math.PI * 1.5;
const TILT = Math.PI * 0.75;
type Point = { x: number; y: number };
type Drag = Point & { id: number; orbiting: boolean };

function touchPair(points: Map<number, Point>) {
  const [a, b] = points.values();
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    gap: Math.hypot(a.x - b.x, a.y - b.y),
  };
}

function canMoveCamera() {
  return (
    survivorsSession.run?.status === 'playing' &&
    !survivorsSession.opening &&
    !survivorsSession.paused
  );
}

/** Own the play surface so camera gestures and the virtual stick cannot steer each other. */
export function SurvivorControls() {
  const surface = useRef<HTMLDivElement>(null);
  const touches = useRef(new Map<number, Point>());
  const pairStart = useRef<
    | (ReturnType<typeof touchPair> & {
        distance: number;
        yaw: number;
        pitch: number;
      })
    | null
  >(null);
  const drag = useRef<Drag | null>(null);
  const [stick, setStick] = useState<
    (Point & { dx: number; dy: number }) | null
  >(null);
  const { cameraOrbit } = survivorsSession;

  useEffect(() => {
    const node = surface.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!canMoveCamera()) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node.clientHeight
            : 1;
      cameraOrbit.zoomTo(
        cameraOrbit.distance * Math.exp(event.deltaY * unit * 0.0014)
      );
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', wheel);
      survivorsSession.stick.x = survivorsSession.stick.y = 0;
    };
  }, [cameraOrbit]);

  function releaseDrag() {
    drag.current = null;
    survivorsSession.stick.x = survivorsSession.stick.y = 0;
    setStick(null);
  }

  function anchorPair() {
    pairStart.current =
      touches.current.size === 2
        ? {
            ...touchPair(touches.current),
            distance: cameraOrbit.distance,
            yaw: cameraOrbit.yaw,
            pitch: cameraOrbit.pitch,
          }
        : null;
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    const {
      pointerId: id,
      pointerType,
      button,
      clientX: x,
      clientY: y,
      currentTarget: node,
    } = event;
    const orbiting = button === 2;
    if (pointerType !== 'touch' && (drag.current || touches.current.size))
      return;
    if ((button !== 0 && !orbiting) || (orbiting && !canMoveCamera())) return;
    event.preventDefault();
    node.setPointerCapture(id);
    if (pointerType === 'touch') {
      touches.current.set(id, { x, y });
      if (touches.current.size > 1) {
        anchorPair();
        releaseDrag();
        return;
      }
    }
    drag.current = { id, x, y, orbiting };
    if (!orbiting) {
      const rect = node.getBoundingClientRect();
      setStick({ x: x - rect.left, y: y - rect.top, dx: 0, dy: 0 });
    }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const {
      pointerId: id,
      clientX: x,
      clientY: y,
      currentTarget: node,
    } = event;
    const points = touches.current;
    const shortSide = Math.max(
      1,
      Math.min(node.clientWidth, node.clientHeight)
    );
    if (points.has(id)) {
      points.set(id, { x, y });
      const start = pairStart.current;
      if (start && canMoveCamera()) {
        const pair = touchPair(points);
        if (Math.min(start.gap, pair.gap) > 8)
          cameraOrbit.zoomTo((start.distance * start.gap) / pair.gap);
        cameraOrbit.turnTo(
          start.yaw - ((pair.x - start.x) / shortSide) * TURN,
          start.pitch + ((pair.y - start.y) / shortSide) * TILT
        );
      }
    }
    const start = drag.current;
    if (start?.id !== id) return;
    const dx = x - start.x,
      dy = y - start.y;
    if (start.orbiting) {
      if (canMoveCamera())
        cameraOrbit.turnTo(
          cameraOrbit.yaw - (dx / shortSide) * TURN,
          cameraOrbit.pitch + (dy / shortSide) * TILT
        );
      start.x = x;
      start.y = y;
    } else {
      const length = Math.hypot(dx, dy);
      const scale = 1 / Math.max(STICK_RADIUS, length);
      survivorsSession.stick.x = length > 6 ? dx * scale : 0;
      survivorsSession.stick.y = length > 6 ? dy * scale : 0;
      setStick(
        (stick) =>
          stick && {
            ...stick,
            dx: dx * scale * STICK_RADIUS,
            dy: dy * scale * STICK_RADIUS,
          }
      );
    }
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    if (touches.current.delete(event.pointerId)) anchorPair();
    if (drag.current?.id === event.pointerId) releaseDrag();
    // After a two-finger gesture, steering requires a fresh one-finger press.
  }

  return (
    <div
      ref={surface}
      className="absolute inset-0 touch-none select-none"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(event) => event.preventDefault()}
    >
      {stick ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full border border-fg-subtle"
          style={{
            left: stick.x - STICK_RADIUS,
            top: stick.y - STICK_RADIUS,
            width: STICK_RADIUS * 2,
            height: STICK_RADIUS * 2,
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/40"
            style={{ marginLeft: stick.dx, marginTop: stick.dy }}
          />
        </div>
      ) : null}
    </div>
  );
}
