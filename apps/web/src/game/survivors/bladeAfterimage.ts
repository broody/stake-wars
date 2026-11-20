import * as THREE from 'three';
import { colors } from '../../ui/tokens';
import { SABER, type SaberAttack } from './saberAttack';

// Authored socket-space endpoints from the Vanguard's sword-metadata.json.
export function sampleBlade(
  socket: THREE.Object3D,
  base: THREE.Vector3,
  tip: THREE.Vector3
) {
  base.set(0, 0.158, 0).applyMatrix4(socket.matrixWorld);
  tip.set(0, 0.995, 0).applyMatrix4(socket.matrixWorld);
}

const SAMPLES = 96;
const AFTERIMAGE_SECONDS = 0.095;
const base = new THREE.Vector3(),
  tip = new THREE.Vector3();

/** A brief world-space exposure of the actual moving blade around its contact frame. */
export class BladeAfterimage {
  private readonly positions = new THREE.BufferAttribute(
    new Float32Array(SAMPLES * 6),
    3
  ).setUsage(THREE.DynamicDrawUsage);
  private readonly stroke = new THREE.BufferAttribute(
    new Float32Array(SAMPLES * 4),
    2
  ).setUsage(THREE.DynamicDrawUsage);
  readonly mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        now: { value: 0 },
        edge: { value: new THREE.Color(colors.fg.DEFAULT) },
        wake: { value: new THREE.Color(colors.accent.soft) },
      },
      vertexShader: `
      varying vec2 sampleUV;
      void main() {
        sampleUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
      fragmentShader: `
      uniform float now;
      uniform vec3 edge, wake;
      varying vec2 sampleUV;
      void main() {
        float fresh = 1. - smoothstep(0., ${AFTERIMAGE_SECONDS}, now - sampleUV.x);
        float tip = smoothstep(.80, .98, sampleUV.y);
        float light = fresh * smoothstep(.04, .52, sampleUV.y) * (.28 + .70 * tip);
        gl_FragColor = vec4(mix(wake, edge, tip), light);
        #include <colorspace_fragment>
      }`,
    })
  );
  private owner?: SaberAttack;
  private count = 0;
  private last = -Infinity;

  constructor() {
    const index: number[] = [];
    for (let i = 0; i < 2 * (SAMPLES - 1); i += 2)
      index.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    this.mesh.geometry.setIndex(index);
    this.mesh.geometry.setAttribute('position', this.positions);
    this.mesh.geometry.setAttribute('uv', this.stroke);
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.raycast = () => undefined;
  }

  sample(
    time: number,
    attack: SaberAttack | undefined,
    socket: THREE.Object3D | undefined
  ) {
    if (this.owner !== attack || time < this.last) {
      this.owner = attack;
      this.count = 0;
      this.last = -Infinity;
    }
    this.mesh.visible = false;
    if (!socket || !attack) return;
    const elapsed = (time - attack.startedAt) / attack.duration;
    const contact = SABER.impact / SABER.duration;
    // Gate out the preparation and recovery. A stationary guard never leaves a trail.
    if (
      elapsed >= contact - 0.16 &&
      elapsed <= contact + 0.1 &&
      time - this.last >= 1 / 240 &&
      this.count < SAMPLES
    ) {
      if (time - this.last > AFTERIMAGE_SECONDS) this.count = 0;
      socket.updateWorldMatrix(true, false);
      sampleBlade(socket, base, tip);
      const i = this.count++ * 2;
      this.positions.setXYZ(i, base.x, base.y, base.z);
      this.positions.setXYZ(i + 1, tip.x, tip.y, tip.z);
      this.stroke.setXY(i, time, 0);
      this.stroke.setXY(i + 1, time, 1);
      this.positions.needsUpdate = this.stroke.needsUpdate = true;
      this.last = time;
      this.mesh.geometry.setDrawRange(0, (this.count - 1) * 6);
    }
    this.mesh.material.uniforms.now.value = time;
    this.mesh.visible = this.count > 1 && time - this.last < AFTERIMAGE_SECONDS;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
