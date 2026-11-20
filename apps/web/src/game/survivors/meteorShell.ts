import * as THREE from 'three';
import { colors } from '../../ui/tokens';
import { OPENING_CAMERA } from './openingCamera';

export const METEOR_RADIUS = 0.37;

type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

function edgeKey(a: THREE.Vector3, b: THREE.Vector3) {
  // Adjacent subdivided faces can differ by a floating-point rounding error.
  const key = (p: THREE.Vector3) =>
    [p.x, p.y, p.z].map((value) => Math.round(value * 1e5)).join(',');
  return [key(a), key(b)].sort().join('/');
}

function geometry(positions: number[]) {
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  result.computeVertexNormals();
  return result;
}

/** Partition the Core's triangular topology along a single jagged fault. */
function makeHalves() {
  const sphere = new THREE.IcosahedronGeometry(METEOR_RADIUS, 1);
  const source = sphere.getAttribute('position');
  const triangles: {
    corners: Triangle;
    side: number;
    edges: string[];
    center: THREE.Vector3;
  }[] = [];
  const owners = new Map<string, number>();
  for (let i = 0; i < source.count; i += 3) {
    const corners: Triangle = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(source, i + j)
    ) as Triangle;
    const center = corners[0]
      .clone()
      .add(corners[1])
      .add(corners[2])
      .divideScalar(3);
    const side =
      center.x >
      0.12 *
        METEOR_RADIUS *
        Math.sin(
          (8 * center.y) / METEOR_RADIUS + (2 * center.z) / METEOR_RADIUS
        )
        ? 1
        : -1;
    const edges = corners.map((a, j) => edgeKey(a, corners[(j + 1) % 3]));
    for (const edge of edges) {
      const other = owners.get(edge);
      owners.set(edge, other !== undefined && other !== side ? 0 : side);
    }
    triangles.push({ corners, center, side, edges });
  }
  sphere.dispose();

  return [-1, 1].map((side) => {
    const shell: number[] = [],
      fault: number[] = [];
    const quad = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      c: THREE.Vector3,
      d: THREE.Vector3
    ) => {
      for (const v of [a, b, c, a, c, d]) fault.push(v.x, v.y, v.z);
    };
    for (const face of triangles) {
      if (face.side !== side) continue;
      for (const corner of face.corners)
        shell.push(corner.x, corner.y, corner.z);
      face.edges.forEach((edge, j) => {
        if (owners.get(edge) !== 0) return;
        const a = face.corners[j],
          b = face.corners[(j + 1) % 3];
        // A strip of heated surface and its exposed cross section follow the same edge.
        quad(
          a,
          b,
          b.clone().lerp(face.center, 0.13),
          a.clone().lerp(face.center, 0.13)
        );
        quad(
          a,
          b,
          b.clone().multiplyScalar(0.91),
          a.clone().multiplyScalar(0.91)
        );
      });
    }
    const hull = geometry(shell);
    return {
      side,
      hull,
      wire: new THREE.WireframeGeometry(hull),
      fault: geometry(fault),
    };
  });
}

/** The same two meshes form the sealed meteor and the pieces resting around the hero. */
export class MeteorShell {
  readonly root = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly hull = new THREE.MeshStandardMaterial({
    color: colors.line.strong,
    metalness: 0.36,
    roughness: 0.68,
    side: THREE.DoubleSide,
    flatShading: true,
    alphaHash: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  private readonly grid = new THREE.LineBasicMaterial({
    color: colors.fg.secondary,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly crack = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      front: { value: 0 },
      opacity: { value: 1 },
      shellRadius: { value: METEOR_RADIUS },
      ember: { value: new THREE.Color(colors.accent.DEFAULT) },
      hot: { value: new THREE.Color(colors.warning.faint) },
    },
    vertexShader: `
      uniform float shellRadius;
      varying float height;
      void main() {
        height = 0.5 + 0.5 * position.y / shellRadius;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform float front, opacity;
      uniform vec3 ember, hot;
      varying float height;
      void main() {
        float behind = front - height;
        float lit = smoothstep(-0.07, 0.04, behind);
        gl_FragColor = vec4(mix(hot, ember, smoothstep(0., 0.55, behind)), lit * opacity);
        #include <colorspace_fragment>
      }`,
  });
  private readonly halves = makeHalves().map((half) => {
    const pivot = new THREE.Group();
    const skin = new THREE.Mesh(half.hull, this.hull);
    skin.position.set(
      -half.side * 0.55 * METEOR_RADIUS,
      0.56 * METEOR_RADIUS,
      0
    );
    skin.add(
      new THREE.LineSegments(half.wire, this.grid),
      new THREE.Mesh(half.fault, this.crack)
    );
    pivot.add(skin);
    this.spin.add(pivot);
    return { ...half, pivot, hinge: skin.position.clone().negate() };
  });

  constructor() {
    this.root.add(this.spin);
    this.root.visible = false;
  }

  /** Local +Y points away from the ground, +Z toward the hero's front. */
  pose(age: number) {
    const fromImpact = age - OPENING_CAMERA.impact;
    const fromSplit = age - OPENING_CAMERA.split;
    const fade = THREE.MathUtils.smoothstep(fromSplit, 0.82, 1.28);
    this.root.visible = age >= OPENING_CAMERA.release && fade < 1;
    if (!this.root.visible) return;
    this.spin.rotation.set(
      0,
      -OPENING_CAMERA.azimuth + 1.65 * Math.min(0, fromImpact),
      0
    );
    this.hull.opacity = 1 - fade;
    this.grid.opacity = 0.65 * (1 - fade);
    this.crack.uniforms.front.value =
      -0.1 + 1.65 * THREE.MathUtils.smoothstep(fromImpact, 0, 0.38);
    this.crack.uniforms.opacity.value =
      (1 - fade) * (1 - 0.6 * THREE.MathUtils.smoothstep(fromSplit, 0.2, 0.9));
    for (const { side, pivot, hinge } of this.halves) {
      // The trailing half gives way a beat later. Both tip out of the portrait sightline.
      const open = THREE.MathUtils.smoothstep(
        fromSplit - (side > 0 ? 0.055 : 0),
        0,
        0.64
      );
      pivot.rotation.z = -side * 1.47 * open;
      pivot.position.copy(hinge);
      pivot.position.x += side * 0.3 * open;
      pivot.position.y += 0.09 * Math.sin(Math.PI * open) - 0.06 * open;
    }
  }

  dispose() {
    for (const { hull, wire, fault } of this.halves) {
      hull.dispose();
      wire.dispose();
      fault.dispose();
    }
    this.hull.dispose();
    this.grid.dispose();
    this.crack.dispose();
  }
}
