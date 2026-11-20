import * as THREE from 'three';
import { SECTOR_COUNT } from '../utils/sectorGeometry';
import { sectorCenter, sectorCorner, sectorsWithin } from './sectors';
import { vec3, type Vec3 } from './sphere';

// Each instance maps the same unit triangle onto one face of the actual Core.
let layout: { transforms: THREE.Matrix4[]; cornerAngle: number } | undefined;
function sectorLayout() {
  if (layout) return layout;
  const points = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  const center = new THREE.Vector3(),
    corner = vec3();
  let cornerAngle = 0;
  const transforms = Array.from({ length: SECTOR_COUNT }, (_, id) => {
    center.copy(sectorCenter(corner, id));
    points.forEach((p, index) => {
      p.copy(sectorCorner(corner, id, index));
      cornerAngle = Math.max(cornerAngle, center.angleTo(p));
    });
    const [a, b, c] = points;
    return new THREE.Matrix4()
      .makeBasis(b.sub(a), c.sub(a), center)
      .setPosition(a);
  });
  return (layout = { transforms, cornerAngle });
}

export function markedSectors(center: Vec3, chord: number) {
  return sectorsWithin(
    center,
    2 * Math.asin(Math.min(1, chord / 2)) + sectorLayout().cornerAngle
  );
}

const vertex = `
  attribute vec4 area;
  attribute vec2 timing;
  uniform float globe;
  varying vec3 offset, bary;
  varying vec2 phase, localGround;
  varying float facet;
  void main() {
    vec3 p = (instanceMatrix * vec4(position, 1.)).xyz;
    offset = (p - area.xyz) / area.w;
    vec3 ref = abs(area.y) < .9 ? vec3(0., 1., 0.) : vec3(1., 0., 0.);
    vec3 right = normalize(cross(ref, area.xyz));
    localGround = vec2(dot(offset, right), dot(offset, cross(area.xyz, right)));
    bary = vec3(1. - position.x - position.y, position.xy);
    phase = timing;
    facet = .5 + .5 * sin(dot(instanceMatrix[3].xyz, vec3(59., 73., 89.)));
    gl_Position = projectionMatrix * modelViewMatrix * vec4((globe + .016) * p, 1.);
  }`;

const fragmentInputs = `
  varying vec3 offset, bary;
  varying vec2 phase, localGround;
  varying float facet;
  float sectorEdge() {
    vec3 pixels = bary / max(fwidth(bary), vec3(.0001));
    return 1. - smoothstep(.14, 1.15, min(pixels.x, min(pixels.y, pixels.z)));
  }`;

/** Batch surface marks on nearby geodesic faces. The shader clips them to the weapon's reach. */
export class SectorMarkings extends THREE.InstancedMesh<
  THREE.BufferGeometry,
  THREE.ShaderMaterial
> {
  private readonly area: THREE.InstancedBufferAttribute;
  private readonly timing: THREE.InstancedBufferAttribute;
  constructor(
    capacity: number,
    fragment: string,
    uniforms: Record<string, THREE.IUniform>
  ) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    super(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragmentInputs + fragment,
        uniforms: { ...uniforms, globe: { value: 5 } },
        transparent: true,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
        toneMapped: false,
      }),
      capacity
    );
    this.count = 0;
    this.frustumCulled = false;
    this.raycast = () => undefined;
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.area = new THREE.InstancedBufferAttribute(
      new Float32Array(4 * capacity),
      4
    ).setUsage(THREE.DynamicDrawUsage);
    this.timing = new THREE.InstancedBufferAttribute(
      new Float32Array(2 * capacity),
      2
    ).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('area', this.area);
    geometry.setAttribute('timing', this.timing);
  }

  begin(globe: number) {
    this.count = 0;
    this.material.uniforms.globe.value = globe;
  }

  mark(
    faces: ReturnType<typeof markedSectors>,
    center: Vec3,
    chord: number,
    t: number,
    u: number
  ) {
    const { transforms } = sectorLayout();
    for (const { sector } of faces) {
      if (this.count >= this.instanceMatrix.count) break;
      const i = this.count++;
      this.setMatrixAt(i, transforms[sector]);
      this.area.setXYZW(i, center.x, center.y, center.z, chord);
      this.timing.setXY(i, t, u);
    }
  }

  flush() {
    if (!this.count) return;
    for (const attr of [this.instanceMatrix, this.area, this.timing]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    return super.dispose();
  }
}
