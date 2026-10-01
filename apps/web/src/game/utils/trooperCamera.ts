import * as THREE from 'three';

/** Orbit in the trooper's local tangent frame, preserving the initial framing. */
export class TrooperCameraOrbit {
  yaw = 0;
  pitch = Math.atan2(1.43, 2.9);
  distance = Math.hypot(1.43, 2.9);
  aiming = false;
  private aimRequested = false;
  private zoomDistance = this.distance;
  private readonly heading = new THREE.Vector3();
  private readonly renderedPosition = new THREE.Vector3();
  private readonly renderedTarget = new THREE.Vector3();
  private readonly followStartPosition = new THREE.Vector3();
  private readonly followStartTarget = new THREE.Vector3();
  private hasSample = false;
  private followElapsed = 0.25;

  beginAim() {
    this.aiming = true;
    this.aimRequested = true;
  }

  endAim(cancel = false) {
    this.aiming = false;
    if (cancel) this.aimRequested = false;
  }

  consumeAimRequest() {
    const requested = this.aiming || this.aimRequested;
    this.aimRequested = false;
    return requested;
  }

  alignCharacter() {
    const turn = this.yaw;
    // Start from the rendered camera pose, including any unfinished transition.
    if (this.hasSample) {
      this.followStartPosition.copy(this.renderedPosition);
      this.followStartTarget.copy(this.renderedTarget);
      this.followElapsed = 0;
    }
    this.yaw = 0;
    return turn;
  }

  zoom(pixels: number) {
    if (!Number.isFinite(pixels)) return;
    this.zoomDistance = THREE.MathUtils.clamp(
      this.zoomDistance *
        Math.exp(THREE.MathUtils.clamp(pixels * 0.0015, -4, 4)),
      1.1,
      12
    );
  }

  update(delta: number) {
    const step = THREE.MathUtils.clamp(delta, 0, 0.05);
    this.followElapsed = Math.min(0.25, this.followElapsed + step);
    this.distance = THREE.MathUtils.damp(
      this.distance,
      this.zoomDistance,
      14,
      step
    );
  }

  drag(dx: number, dy: number) {
    this.yaw =
      THREE.MathUtils.euclideanModulo(
        this.yaw - dx * 0.005 + Math.PI,
        Math.PI * 2
      ) - Math.PI;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, 0.12, 1.35);
  }

  sample(
    normal: THREE.Vector3,
    forward: THREE.Vector3,
    radius: number,
    position: THREE.Vector3,
    target: THREE.Vector3
  ) {
    target
      .copy(normal)
      .multiplyScalar(radius + 0.32)
      .addScaledVector(forward, 0.3);
    this.heading.copy(forward).applyAxisAngle(normal, this.yaw);
    position
      .copy(target)
      .addScaledVector(this.heading, -this.distance * Math.cos(this.pitch))
      .addScaledVector(normal, this.distance * Math.sin(this.pitch));
    if (this.followElapsed < 0.25) {
      const blend = THREE.MathUtils.smoothstep(this.followElapsed, 0, 0.25);
      position.lerpVectors(this.followStartPosition, position, blend);
      target.lerpVectors(this.followStartTarget, target, blend);
    }
    this.renderedPosition.copy(position);
    this.renderedTarget.copy(target);
    this.hasSample = true;
  }
}

/** Left drag orbits freely; right drag aligns and steers the character. */
export function bindTrooperOrbit(
  canvas: HTMLCanvasElement,
  orbit: TrooperCameraOrbit,
  turnCharacter: (radians: number) => void
) {
  let drag: {
    id: number;
    button: number;
    x: number;
    y: number;
    cursor: string;
  } | null = null;
  const release = () => {
    if (!drag) return;
    const { id, cursor } = drag;
    if (drag.button === 2) orbit.endAim();
    drag = null;
    canvas.style.cursor = cursor;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const down = (event: PointerEvent) => {
    if ((event.button !== 0 && event.button !== 2) || drag) return;
    event.preventDefault();
    event.stopPropagation();
    drag = {
      id: event.pointerId,
      button: event.button,
      x: event.clientX,
      y: event.clientY,
      cursor: canvas.style.cursor,
    };
    if (event.button === 2) {
      orbit.beginAim();
      turnCharacter(orbit.alignCharacter());
    }
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!(event.buttons & (drag.button === 0 ? 1 : 2))) {
      release();
      return;
    }
    event.preventDefault();
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (drag.button === 2) {
      turnCharacter(-dx * 0.005);
      orbit.drag(0, dy);
    } else {
      orbit.drag(dx, dy);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const up = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) release();
  };
  const context = (event: MouseEvent) => event.preventDefault();
  const wheel = (event: WheelEvent) => {
    if (!event.deltaY) return;
    event.preventDefault();
    event.stopPropagation();
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? canvas.clientHeight || 800
          : 1;
    orbit.zoom(event.deltaY * unit);
  };
  const visibility = () => {
    if (document.hidden) cancel();
  };
  const cancel = () => {
    release();
    orbit.endAim(true);
  };
  const lostCapture = () => {
    if (drag) cancel();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', lostCapture);
  canvas.addEventListener('contextmenu', context);
  canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    cancel();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('lostpointercapture', lostCapture);
    canvas.removeEventListener('contextmenu', context);
    canvas.removeEventListener('wheel', wheel);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', visibility);
  };
}
