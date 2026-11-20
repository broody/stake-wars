import * as THREE from 'three';
import { colors } from '../../ui/tokens';

export const PICKUP_MODELS = [
  'shard-1',
  'shard-2',
  'shard-10',
  'repair',
  'tractor',
  'emp',
  'drop',
  'drop-large',
] as const;
export type PickupModel = (typeof PICKUP_MODELS)[number];
export const shardModel = (value: number): PickupModel =>
  value < 2 ? 'shard-1' : value < 10 ? 'shard-2' : 'shard-10';

type Plan = [number, number][];
const { fg, line, accent, gold, success, danger } = colors;
const steel = fg.disabled,
  charcoal = line.strong,
  joint = line.DEFAULT,
  porcelain = fg.secondary;

const octagon = (w: number, d: number, cut: number): Plan => [
  [-w + cut, -d],
  [w - cut, -d],
  [w, -d + cut],
  [w, d - cut],
  [w - cut, d],
  [-w + cut, d],
  [-w, d - cut],
  [-w, -d + cut],
];
const hexagon = (radius: number, sides = 6): Plan =>
  Array.from({ length: sides }, (_, i) => [
    Math.sin((i * 2 * Math.PI) / sides) * radius,
    Math.cos((i * 2 * Math.PI) / sides) * radius,
  ]);

/** Bake the fabrication details and their colors into one opaque draw per model. */
class PickupMesh {
  private positions: number[] = [];
  private colors: number[] = [];
  private readonly vertex = new THREE.Vector3();

  add(
    geometry: THREE.BufferGeometry,
    tint: string,
    x = 0,
    y = 0,
    z = 0,
    yaw = 0
  ) {
    geometry.rotateY(yaw).translate(x, y, z);
    const vertices = geometry.getAttribute('position'),
      index = geometry.index;
    const color = new THREE.Color(tint);
    for (let i = 0; i < (index?.count ?? vertices.count); i++) {
      this.vertex.fromBufferAttribute(vertices, index ? index.getX(i) : i);
      this.positions.push(this.vertex.x, this.vertex.y, this.vertex.z);
      this.colors.push(color.r, color.g, color.b);
    }
    geometry.dispose();
  }

  plate(
    plan: Plan,
    height: number,
    bevel: number,
    tint: string,
    x = 0,
    y = 0,
    z = 0,
    yaw = 0
  ) {
    const shape = new THREE.Shape(
      plan.map(([u, v]) => new THREE.Vector2(u, -v))
    );
    const part = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 1,
    });
    part.translate(0, 0, -height / 2).rotateX(-Math.PI / 2);
    this.add(part, tint, x, y, z, yaw);
  }

  /** Six cut faces, a metal keeper around the waist and an off-center chisel tip. */
  crystal(
    x: number,
    y: number,
    z: number,
    size: number,
    lean: number,
    palette: readonly string[]
  ) {
    const ring = (h: number, w: number) => [
      [-0.16 * w, h, -0.72 * w],
      [0.78 * w, h, -0.38 * w],
      [w, h, 0.04 * w],
      [0.22 * w, h, 0.71 * w],
      [-0.81 * w, h, 0.35 * w],
      [-w, h, -0.13 * w],
    ];
    const rings = [
      ring(-0.28, 0.24),
      ring(-0.15, 0.37),
      ring(-0.085, 0.37),
      ring(0.28, 0.31),
    ];
    const toe = [-0.075, -0.53, 0.03],
      tip = [0.15, 0.75, -0.065];
    const sin = Math.sin(lean),
      cos = Math.cos(lean);
    const triangle = (a: number[], b: number[], c: number[], tint: string) => {
      const color = new THREE.Color(tint);
      for (const [u, v, w] of [a, b, c]) {
        this.positions.push(
          x + size * (u * cos - v * sin),
          y + size * (v * cos + u * sin),
          z + size * w
        );
        this.colors.push(color.r, color.g, color.b);
      }
    };
    for (let i = 0; i < palette.length; i++) {
      const j = (i + 1) % palette.length;
      triangle(toe, rings[0][i], rings[0][j], palette[j]);
      for (let k = 0; k < rings.length - 1; k++) {
        const a = rings[k],
          b = rings[k + 1];
        const tint =
          k === 1 ? (i % 3 === 1 ? gold.DEFAULT : steel) : palette[i];
        triangle(a[i], b[i], b[j], tint);
        triangle(a[i], b[j], a[j], tint);
      }
      triangle(rings[3][i], tip, rings[3][j], palette[j]);
    }
  }

  finish(name: PickupModel, scale: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.name = name;
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(this.positions, 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(this.colors, 3)
    );
    geometry.scale(scale, scale, scale);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function repair(m: PickupMesh) {
  const casework = octagon(0.69, 0.47, 0.14);
  m.plate(casework, 0.3, 0.035, charcoal);
  m.plate(casework, 0.07, 0.04, steel, 0, -0.19);
  m.plate(casework, 0.09, 0.04, porcelain, 0, 0.2);
  m.plate(octagon(0.4, 0.34, 0.09), 0.022, 0.014, joint, 0, 0.278);
  const cross: Plan = [
    [-0.085, -0.235],
    [0.085, -0.235],
    [0.085, -0.085],
    [0.245, -0.085],
    [0.245, 0.085],
    [0.085, 0.085],
    [0.085, 0.235],
    [-0.085, 0.235],
    [-0.085, 0.085],
    [-0.245, 0.085],
    [-0.245, -0.085],
    [-0.085, -0.085],
  ];
  m.plate(cross, 0.027, 0.012, success, 0, 0.306);
  for (const side of [-1, 1]) {
    m.plate(
      octagon(0.076, 0.44, 0.04),
      0.13,
      0.013,
      charcoal,
      side * 0.55,
      0.244
    );
    for (const z of [-0.31, 0.31]) {
      m.add(
        new THREE.BoxGeometry(0.1, 0.025, 0.066),
        fg.muted,
        side * 0.55,
        0.318,
        z
      );
    }
    m.plate(
      octagon(0.2, 0.025, 0.015),
      0.065,
      0.008,
      success,
      0,
      0.02,
      side * 0.49
    );
  }
}

function tractor(m: PickupMesh) {
  const yoke: Plan = [
    [-0.59, 0.45],
    [-0.59, -0.2],
    [-0.33, -0.55],
    [0.33, -0.55],
    [0.59, -0.2],
    [0.59, 0.45],
    [0.28, 0.45],
    [0.28, -0.1],
    [0.15, -0.25],
    [-0.15, -0.25],
    [-0.28, -0.1],
    [-0.28, 0.45],
  ];
  m.plate(yoke, 0.22, 0.04, charcoal);
  m.plate(yoke, 0.045, 0.015, steel, 0, 0.15);
  for (const side of [-1, 1]) {
    const x = side * 0.435;
    m.plate(octagon(0.179, 0.23, 0.045), 0.34, 0.02, joint, x, 0.028, 0.21);
    for (const z of [0.08, 0.2, 0.32]) {
      m.add(
        new THREE.BoxGeometry(0.37, 0.335, 0.05),
        fg.secondary,
        x,
        0.057,
        z
      );
    }
    m.plate(octagon(0.165, 0.08, 0.04), 0.34, 0.018, gold.edge, x, 0.025, 0.49);
  }
  m.plate(octagon(0.22, 0.09, 0.055), 0.06, 0.014, porcelain, 0, 0.19, -0.405);
  for (const x of [-0.09, 0, 0.09])
    m.add(
      new THREE.BoxGeometry(0.028, 0.016, 0.096),
      charcoal,
      x,
      0.234,
      -0.405
    );
}

function emp(m: PickupMesh) {
  // Swept armored vanes leave three open channels around the charged core.
  const vane: Plan = [
    [0.16, -0.19],
    [0.39, -0.235],
    [0.73, 0.03],
    [0.67, 0.16],
    [0.405, 0.11],
    [0.26, 0.235],
    [0.14, 0.16],
  ];
  const inset: Plan = [
    [0.31, -0.127],
    [0.397, -0.142],
    [0.606, 0.037],
    [0.455, 0.002],
    [0.33, 0.079],
  ];
  for (let i = 0; i < 3; i++) {
    const yaw = (i * 2 * Math.PI) / 3;
    m.plate(vane, 0.15, 0.027, steel, 0, -0.025, 0, yaw);
    m.plate(inset, 0.045, 0.012, porcelain, 0, 0.09, 0, yaw);
    const stripe: Plan = [
      [0.41, -0.085],
      [0.445, -0.058],
      [0.424, 0.026],
      [0.39, 0.047],
    ];
    m.plate(stripe, 0.012, 0, danger.strong, 0, 0.126, 0, yaw);
  }
  m.plate(hexagon(0.31), 0.24, 0.03, joint);
  m.plate(hexagon(0.275), 0.06, 0.02, danger.DEFAULT, 0, 0.105);
  m.plate(hexagon(0.215), 0.069, 0.01, charcoal, 0, 0.175);
  const cap = new THREE.OctahedronGeometry(0.19);
  cap.scale(1, 0.92, 1);
  m.add(cap, danger.DEFAULT, 0, 0.239);
  for (let i = 0; i < 3; i++) {
    const yaw = (i * 2 * Math.PI) / 3;
    m.add(
      new THREE.BoxGeometry(0.06, 0.16, 0.063),
      steel,
      0.166 * Math.sin(yaw),
      0.216,
      0.166 * Math.cos(yaw),
      yaw
    );
  }
}

function supply(m: PickupMesh, large: boolean) {
  // Clipped triangular armor courses share a gold gasket at the equator.
  const corners = hexagon(0.48, 3);
  const plan = corners.flatMap(([x, z], i) =>
    [corners[(i + 2) % 3], corners[(i + 1) % 3]].map(
      ([u, v]): [number, number] => [
        x * 0.87 + u * 0.13,
        -(z * 0.87 + v * 0.13),
      ]
    )
  );
  const courses = [
    [-0.38, 0.12],
    [-0.23, 0.46],
    [-0.042, 0.96],
    [0.014, 1],
    [0.046, 0.96],
    [0.22, 0.69],
    [0.39, 0.23],
  ];
  for (let row = 1; row < courses.length; row++) {
    const [bottom, lo] = courses[row - 1],
      [top, hi] = courses[row];
    const pos: number[] = [];
    for (let i = 0; i < plan.length; i++) {
      const [x, z] = plan[i],
        [u, v] = plan[(i + 1) % plan.length];
      pos.push(
        x * lo,
        bottom,
        z * lo,
        x * hi,
        top,
        z * hi,
        u * lo,
        bottom,
        v * lo,
        u * lo,
        bottom,
        v * lo,
        x * hi,
        top,
        z * hi,
        u * hi,
        top,
        v * hi
      );
    }
    const wall = new THREE.BufferGeometry();
    wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    m.add(
      wall,
      [steel, steel, gold.DEFAULT, gold.edge, charcoal, steel][row - 1]
    );
  }
  m.plate(
    plan.map(([x, z]) => [x * 0.23, z * 0.23]),
    0.012,
    0,
    steel,
    0,
    0.386
  );
  m.plate(
    plan.map(([x, z]) => [x * 0.12, z * 0.12]),
    0.012,
    0,
    steel,
    0,
    -0.376
  );
  m.plate(hexagon(0.1, 3), 0.02, 0.007, gold.edge, 0, 0.39, 0, Math.PI);
  for (let i = 0; i < 3; i++) {
    const yaw = (i * 2 * Math.PI) / 3;
    const atFace = (
      part: THREE.BufferGeometry,
      tint: string,
      height: number,
      reach: number
    ) =>
      m.add(
        part,
        tint,
        Math.sin(yaw) * reach,
        height,
        Math.cos(yaw) * reach,
        yaw
      );
    atFace(new THREE.BoxGeometry(0.3, 0.064, 0.065), joint, -0.01, 0.228);
    atFace(new THREE.BoxGeometry(0.18, 0.052, 0.074), gold.edge, -0.01, 0.246);
    const faceplate = new THREE.BoxGeometry(0.19, 0.22, 0.029).rotateX(-0.39);
    atFace(faceplate, fg.muted, 0.145, 0.201);
    atFace(
      new THREE.BoxGeometry(0.106, 0.13, 0.029).rotateX(-0.39),
      charcoal,
      0.153,
      0.218
    );
    const marks = large ? 3 : 1;
    for (let k = 0; k < marks; k++) {
      const h = 0.147 + (k - (marks - 1) / 2) * 0.035;
      atFace(
        new THREE.BoxGeometry(0.063, 0.017, 0.013).rotateX(-0.39),
        gold.edge,
        h,
        0.236 - (h - 0.147) * 0.41
      );
    }
  }
  m.add(
    new THREE.CylinderGeometry(0.017, 0.009, 0.4, 6),
    gold.DEFAULT,
    0,
    -0.566
  );
  m.add(new THREE.OctahedronGeometry(0.04), gold.edge, 0, -0.77);
}

export function createPickupGeometry(kind: PickupModel) {
  const m = new PickupMesh();
  switch (kind) {
    case 'shard-1':
    case 'shard-2':
    case 'shard-10': {
      const palette =
        kind === 'shard-1'
          ? [
              accent.DEFAULT,
              colors.warning.faint,
              accent.soft,
              colors.owned,
              danger.strong,
              gold.edge,
            ]
          : kind === 'shard-2'
            ? [
                colors.owned,
                colors.warning.faint,
                gold.DEFAULT,
                colors.warning.soft,
                accent.soft,
                gold.edge,
              ]
            : [
                gold.edge,
                fg.DEFAULT,
                gold.DEFAULT,
                colors.warning.soft,
                gold.soft,
                colors.warning.faint,
              ];
      m.crystal(0, 0, 0, 1, -0.12, palette);
      if (kind !== 'shard-1')
        m.crystal(-0.34, -0.09, 0.19, 0.72, 0.54, palette);
      if (kind === 'shard-10')
        m.crystal(0.3, -0.11, -0.22, 0.81, -0.62, palette);
      return m.finish(
        kind,
        kind === 'shard-1' ? 0.094 : kind === 'shard-2' ? 0.108 : 0.127
      );
    }
    case 'repair':
      repair(m);
      break;
    case 'tractor':
      tractor(m);
      break;
    case 'emp':
      emp(m);
      break;
    case 'drop':
    case 'drop-large':
      supply(m, kind === 'drop-large');
      return m.finish(kind, 1);
  }
  return m.finish(kind, 0.145);
}
