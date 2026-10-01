/**
 * Surface math for Core Survivors. Every actor is a unit normal on the Core;
 * world position is `normal × groundRadius`. Plain objects keep the
 * simulation free of three.js and cheap to allocate.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  return set(out, a.x, a.y, a.z);
}

export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

export function cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  return set(
    out,
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}

export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  a.x /= length;
  a.y /= length;
  a.z /= length;
  return a;
}

/** Chord length between two normals; equals the arc angle for nearby points. */
export function chord(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
}

/** Unit tangent at `p` pointing toward `q`; `fallback` when they coincide. */
export function tangentToward(
  out: Vec3,
  p: Vec3,
  q: Vec3,
  fallback?: Vec3
): Vec3 {
  const d = dot(p, q);
  set(out, q.x - p.x * d, q.y - p.y * d, q.z - p.z * d);
  if (out.x * out.x + out.y * out.y + out.z * out.z < 1e-12) {
    if (fallback) copy(out, fallback);
    else set(out, 0, 0, 0);
    return out;
  }
  return normalize(out);
}

/** Remove the normal component of `v` at `p`. */
export function projectTangent(v: Vec3, p: Vec3): Vec3 {
  const d = dot(v, p);
  v.x -= p.x * d;
  v.y -= p.y * d;
  v.z -= p.z * d;
  return v;
}

/**
 * Walk `p` along the great circle through tangent `dir` by `arc` radians,
 * carrying `dir` with it (parallel transport).
 */
export function stepAlong(p: Vec3, dir: Vec3, arc: number) {
  const c = Math.cos(arc);
  const s = Math.sin(arc);
  const px = p.x;
  const py = p.y;
  const pz = p.z;
  set(p, px * c + dir.x * s, py * c + dir.y * s, pz * c + dir.z * s);
  set(dir, dir.x * c - px * s, dir.y * c - py * s, dir.z * c - pz * s);
  normalize(p);
  normalize(projectTangent(dir, p));
}

const scratchDir = vec3();

/** Move `p` toward `q` by at most `arc` radians. */
export function stepToward(p: Vec3, q: Vec3, arc: number) {
  const angle = angleBetween(p, q);
  if (angle < 1e-9) return;
  tangentToward(scratchDir, p, q);
  stepAlong(p, scratchDir, Math.min(arc, angle));
}

/** The point `arc` radians from `p` along tangent `dir`. */
export function pointAt(out: Vec3, p: Vec3, dir: Vec3, arc: number): Vec3 {
  const c = Math.cos(arc);
  const s = Math.sin(arc);
  return normalize(
    set(out, p.x * c + dir.x * s, p.y * c + dir.y * s, p.z * c + dir.z * s)
  );
}

/** Rotate `v` about unit `axis` by `angle` (Rodrigues). */
export function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = dot(axis, v) * (1 - c);
  return set(
    v,
    v.x * c + (axis.y * v.z - axis.z * v.y) * s + axis.x * k,
    v.y * c + (axis.z * v.x - axis.x * v.z) * s + axis.y * k,
    v.z * c + (axis.x * v.y - axis.y * v.x) * s + axis.z * k
  );
}

export function randomUnit(out: Vec3, random: () => number): Vec3 {
  const z = random() * 2 - 1;
  const a = random() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return set(out, Math.cos(a) * r, Math.sin(a) * r, z);
}

/** Spherical interpolation between two nearby normals, for rendering. */
export function lerpNormal(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  return normalize(
    set(
      out,
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    )
  );
}
