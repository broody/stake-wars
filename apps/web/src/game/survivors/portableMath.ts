/**
 * Math for the Survivor simulation that gives the same bits in every
 * JavaScript engine.
 *
 * The API verifies a ranked run by replaying it in Node, so the browser and
 * the server must compute every step identically. The language lets each
 * engine choose its own `Math.sin`, `Math.cos`, `Math.atan2`, `Math.exp`,
 * `Math.pow` and `Math.hypot`. Chrome and Node already disagree in the last
 * bit of some results, and the error grows until a level-up lands on another
 * tick and the server rejects an honest run.
 *
 * These versions use only `+`, `-`, `*`, `/`, `Math.sqrt`, `Math.trunc` and
 * bit access through a DataView. IEEE 754 fixes the result of each of those
 * operations exactly, and JavaScript forbids fusing them, so the output is the
 * same everywhere. The kernels are ported from musl and fdlibm and stay within
 * a few units in the last place of the engine's results.
 *
 * Every simulation module must use these functions instead of the `Math`
 * ones. `portableMath.test.ts` enforces this.
 */

const view = new DataView(new ArrayBuffer(8));

function highWord(x: number) {
  view.setFloat64(0, x);
  return view.getUint32(0);
}

function fromWords(high: number, low: number) {
  view.setUint32(0, high >>> 0);
  view.setUint32(4, low >>> 0);
  return view.getFloat64(0);
}

const negative = (x: number) => x < 0 || Object.is(x, -0);

/** 2ⁿ for a normal exponent, built from its bits rather than with `**`. */
const twoTo = (n: number) => fromWords((n + 1023) << 20, 0);
const TWO_TO_MINUS_1022 = twoTo(-1022);
const TWO_TO_MINUS_969 = twoTo(-969);
const TWO_TO_MINUS_28 = twoTo(-28);
const TWO_TO_MINUS_27 = twoTo(-27);
const TWO_TO_MINUS_26 = twoTo(-26);
const TWO_TO_54 = twoTo(54);
const TWO_TO_64 = twoTo(64);
const TWO_TO_66 = twoTo(66);
const TWO_TO_1023 = twoTo(1023);

// sin and cos

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;

const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;
const TO_INT = 1.5 / Number.EPSILON;
const PIO4 = 0.7853981633974483;

/**
 * Reduce `x` by the nearest multiple of π/2 with Cody–Waite's three-part π/2.
 * Accurate while |x| is below about 1.6 million, which covers every angle and
 * clock the game passes in. Larger values still reduce deterministically.
 */
const reduced = { n: 0, hi: 0, lo: 0 };
function reduce(x: number) {
  const fn = x * INV_PIO2 + TO_INT - TO_INT;
  // Each round folds in the next 33 bits of π/2, as fdlibm's reduction does.
  let r = x - fn * PIO2_1;
  let t = r;
  let w = fn * PIO2_2;
  r = t - w;
  w = fn * PIO2_2T - (t - r - w);
  t = r;
  w = fn * PIO2_3;
  r = t - w;
  w = fn * PIO2_3T - (t - r - w);
  const hi = r - w;
  reduced.n = ((fn % 4) + 4) % 4;
  reduced.hi = hi;
  reduced.lo = r - hi - w;
}

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

/** sin(x + y) for |x| ≤ π/4, where y is the tail of a reduced argument. */
function kernelSin(x: number, y: number) {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (y === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

/** cos(x + y) for |x| ≤ π/4, where y is the tail of a reduced argument. */
function kernelCos(x: number, y: number) {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const one = 1 - hz;
  return one + (1 - one - hz + (z * r - x * y));
}

export function sin(x: number) {
  if (!Number.isFinite(x)) return NaN;
  // Keep the sign of zero and skip the polynomial for tiny angles.
  if (Math.abs(x) < TWO_TO_MINUS_26) return x;
  if (Math.abs(x) <= PIO4) return kernelSin(x, 0);
  reduce(x);
  const { n, hi, lo } = reduced;
  if (n === 0) return kernelSin(hi, lo);
  if (n === 1) return kernelCos(hi, lo);
  if (n === 2) return -kernelSin(hi, lo);
  return -kernelCos(hi, lo);
}

export function cos(x: number) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < TWO_TO_MINUS_27) return 1;
  if (Math.abs(x) <= PIO4) return kernelCos(x, 0);
  reduce(x);
  const { n, hi, lo } = reduced;
  if (n === 0) return kernelCos(hi, lo);
  if (n === 1) return -kernelSin(hi, lo);
  if (n === 2) return -kernelCos(hi, lo);
  return kernelSin(hi, lo);
}

// atan, atan2, asin and acos

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1,
  9.82793723247329054082e-1, 1.570796326794896558,
];
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17,
  1.39033110312309984516e-17, 6.12323399573676603587e-17,
];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1,
  1.42857142725034663711e-1, -1.1111110405462355788e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.6531572744216915527e-2,
  1.62858201153657823623e-2,
];

export function atan(input: number) {
  if (Number.isNaN(input)) return NaN;
  const sign = negative(input);
  let x = Math.abs(input);
  if (x >= TWO_TO_66)
    return sign ? -ATAN_HI[3] - ATAN_LO[3] : ATAN_HI[3] + ATAN_LO[3];
  let id: number;
  if (x < 0.4375) {
    if (x < TWO_TO_MINUS_27) return input;
    id = -1;
  } else if (x < 1.1875) {
    if (x < 0.6875) {
      id = 0;
      x = (2 * x - 1) / (2 + x);
    } else {
      id = 1;
      x = (x - 1) / (x + 1);
    }
  } else if (x < 2.4375) {
    id = 2;
    x = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3;
    x = -1 / x;
  }
  const z = x * x;
  const w = z * z;
  const s1 =
    z *
    (AT[0] +
      w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) {
    const result = x - x * (s1 + s2);
    return sign ? -result : result;
  }
  const result = ATAN_HI[id] - (x * (s1 + s2) - ATAN_LO[id] - x);
  return sign ? -result : result;
}

const PI = Math.PI;
const PI_LO = 1.2246467991473532e-16;
const PIO2 = 1.5707963267948966;

export function atan2(y: number, x: number) {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 1) return atan(y);
  const m = (negative(y) ? 1 : 0) | (negative(x) ? 2 : 0);
  if (y === 0) {
    if (m < 2) return y;
    return m === 2 ? PI : -PI;
  }
  if (x === 0) return m & 1 ? -PIO2 : PIO2;
  if (!Number.isFinite(x)) {
    if (!Number.isFinite(y))
      return [PI / 4, -PI / 4, (3 * PI) / 4, (-3 * PI) / 4][m];
    return [0, -0, PI, -PI][m];
  }
  if (!Number.isFinite(y) || Math.abs(y) > TWO_TO_64 * Math.abs(x))
    return m & 1 ? -PIO2 : PIO2;
  const z =
    m & 2 && Math.abs(x) > TWO_TO_64 * Math.abs(y) ? 0 : atan(Math.abs(y / x));
  if (m === 0) return z;
  if (m === 1) return -z;
  if (m === 2) return PI - (z - PI_LO);
  return z - PI_LO - PI;
}

/** NaN outside [-1, 1], like `Math.asin`. */
export const asin = (x: number) => atan2(x, Math.sqrt((1 - x) * (1 + x)));

/** NaN outside [-1, 1], like `Math.acos`. */
export const acos = (x: number) => atan2(Math.sqrt((1 - x) * (1 + x)), x);

// exp, log and pow

/** x × 2ⁿ, built from exact powers of two. */
function scale(x: number, n: number) {
  let y = x;
  if (n > 1023) {
    y *= TWO_TO_1023;
    n -= 1023;
    if (n > 1023) {
      y *= TWO_TO_1023;
      n = Math.min(n - 1023, 1023);
    }
  } else if (n < -1022) {
    // Scale in two steps so a subnormal result rounds only once.
    y *= TWO_TO_MINUS_969;
    n += 969;
    if (n < -1022) {
      y *= TWO_TO_MINUS_969;
      n = Math.max(n + 969, -1022);
    }
  }
  return y * twoTo(n);
}

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;

export function exp(input: number) {
  if (Number.isNaN(input)) return NaN;
  if (input > 709.782712893383973096) return Infinity;
  if (input < -745.13321910194110842) return 0;
  let x = input;
  let hi = 0;
  let lo = 0;
  let k = 0;
  const magnitude = Math.abs(x);
  if (magnitude > 0.5 * Math.LN2) {
    k =
      magnitude >= 1.5 * Math.LN2
        ? Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5))
        : x < 0
          ? -1
          : 1;
    hi = x - k * LN2_HI;
    lo = k * LN2_LO;
    x = hi - lo;
  } else if (magnitude > TWO_TO_MINUS_28) {
    hi = x;
  } else {
    return 1 + x;
  }
  const xx = x * x;
  const c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
  const y = 1 + ((x * c) / (2 - c) - lo + hi);
  return k === 0 ? y : scale(y, k);
}

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

export function log(input: number) {
  if (Number.isNaN(input) || input < 0) return NaN;
  if (input === 0) return -Infinity;
  if (input === Infinity) return Infinity;
  if (input === 1) return 0;
  let x = input;
  let k = 0;
  if (x < TWO_TO_MINUS_1022) {
    k -= 54;
    x *= TWO_TO_54;
  }
  // Split x into 2ᵏ × (1 + f) with 1 + f between √2/2 and √2.
  let high = highWord(x) + 0x3ff00000 - 0x3fe6a09e;
  k += (high >>> 20) - 0x3ff;
  high = (high & 0x000fffff) + 0x3fe6a09e;
  view.setFloat64(0, x);
  x = fromWords(high, view.getUint32(4));
  const f = x - 1;
  const hfsq = 0.5 * f * f;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  return s * (hfsq + (t2 + t1)) + k * LN2_LO - hfsq + f + k * LN2_HI;
}

/**
 * xʸ as e^(y·ln x). Its error grows with |y·ln x|, so it suits moderate
 * results such as the game's difficulty ramps, not extreme powers.
 */
export function pow(x: number, y: number) {
  if (y === 0 || x === 1) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x > 0) return exp(y * log(x));
  if (x === 0) {
    const odd = negative(x) && Math.abs(y % 2) === 1;
    if (y > 0) return odd ? -0 : 0;
    return odd ? -Infinity : Infinity;
  }
  if (!Number.isInteger(y)) return NaN;
  const magnitude = exp(y * log(-x));
  return y % 2 === 0 ? magnitude : -magnitude;
}

// Lengths

/** √(x² + y² + z²), without the engine's own overflow scaling. */
export function hypot(x: number, y: number, z = 0) {
  return Math.sqrt(x * x + y * y + z * z);
}
