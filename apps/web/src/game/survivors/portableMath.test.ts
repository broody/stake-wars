import { describe, expect, it } from 'vitest';
import * as portable from './portableMath';

/** Distance between two doubles in units in the last place. */
function ulps(a: number, b: number) {
  if (Object.is(a, b)) return 0;
  const view = new DataView(new ArrayBuffer(16));
  view.setFloat64(0, a);
  view.setFloat64(8, b);
  const order = (offset: number) => {
    const bits = view.getBigInt64(offset);
    return bits < 0n ? -(bits & 0x7fffffffffffffffn) : bits;
  };
  const gap = order(0) - order(8);
  return Number(gap < 0n ? -gap : gap);
}

/** A fixed pseudo-random sequence, so failures reproduce. */
function* samples(count: number, from: number, to: number) {
  let state = 0x9e3779b9;
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    yield from + (to - from) * (state / 2 ** 32);
  }
}

const ONE_ARG = [
  ['sin', -8000, 8000, 1],
  ['cos', -8000, 8000, 1],
  ['atan', -50, 50, 1],
  ['asin', -1, 1, 2],
  ['acos', -1, 1, 2],
  ['exp', -700, 700, 1],
  ['log', 1e-300, 1e300, 1],
] as const;

describe('portable math', () => {
  it.each(ONE_ARG)(
    '%s stays within %d to %d of the engine by at most %d ulp',
    (name, from, to, tolerance) => {
      for (const x of samples(20000, from, to))
        expect(
          ulps(portable[name](x), Math[name](x)),
          `${name}(${x})`
        ).toBeLessThanOrEqual(tolerance);
    }
  );

  it('matches the engine near zero and at the edges of each range', () => {
    for (const x of [1e-9, 0.3, 0.785, 0.7854, 1.5707963, 3.14159, 1e5, 1.6e6])
      for (const value of [x, -x]) {
        expect(ulps(portable.sin(value), Math.sin(value))).toBeLessThanOrEqual(
          1
        );
        expect(ulps(portable.cos(value), Math.cos(value))).toBeLessThanOrEqual(
          1
        );
      }
    for (const x of [-0.999999, -0.5, 0.5, 0.999999])
      expect(ulps(portable.acos(x), Math.acos(x))).toBeLessThanOrEqual(2);
  });

  it('agrees with atan2 in every quadrant', () => {
    const ys = [...samples(300, -40, 40)];
    const xs = [...samples(300, -40, 40)].reverse();
    for (let i = 0; i < ys.length; i++)
      for (const scale of [1, 1e-8, 1e8])
        expect(
          ulps(
            portable.atan2(ys[i], xs[i] * scale),
            Math.atan2(ys[i], xs[i] * scale)
          )
        ).toBeLessThanOrEqual(1);
  });

  it('handles zeros, infinities and NaN like the engine', () => {
    const special = [0, -0, 1, -1, Infinity, -Infinity, NaN];
    for (const y of special)
      for (const x of special)
        expect(portable.atan2(y, x), `atan2(${y}, ${x})`).toBe(
          Math.atan2(y, x)
        );
    for (const name of ['sin', 'atan', 'asin'] as const) {
      expect(portable[name](-0)).toBe(-0);
      expect(portable[name](0)).toBe(0);
    }
    expect(portable.cos(0)).toBe(1);
    expect(portable.acos(1)).toBe(0);
    expect(portable.acos(-1)).toBe(Math.PI);
    expect(portable.asin(1)).toBe(Math.PI / 2);
    expect(portable.acos(1.0000001)).toBeNaN();
    expect(portable.sin(Infinity)).toBeNaN();
    expect(portable.exp(-Infinity)).toBe(0);
    expect(portable.exp(Infinity)).toBe(Infinity);
    expect(portable.exp(0)).toBe(1);
    expect(portable.log(0)).toBe(-Infinity);
    expect(portable.log(-1)).toBeNaN();
    expect(portable.log(1)).toBe(0);
    expect(ulps(portable.log(5e-324), Math.log(5e-324))).toBeLessThanOrEqual(1);
    expect(ulps(portable.exp(-744), Math.exp(-744))).toBeLessThanOrEqual(1);
  });

  it('raises positive bases and signed zero like the engine', () => {
    for (const exponent of samples(2000, -30, 30))
      expect(
        ulps(portable.pow(1.15, exponent), Math.pow(1.15, exponent))
      ).toBeLessThanOrEqual(8);
    expect(ulps(portable.pow(-2, 3), -8)).toBeLessThanOrEqual(2);
    expect(portable.pow(-2, 0.5)).toBeNaN();
    expect(portable.pow(-0, 3)).toBe(-0);
    expect(portable.pow(-0, -3)).toBe(-Infinity);
    expect(portable.pow(0, -2)).toBe(Infinity);
  });

  it('measures two- and three-dimensional lengths', () => {
    expect(portable.hypot(3, 4)).toBe(5);
    expect(portable.hypot(2, 3, 6)).toBe(7);
    for (const x of samples(2000, -100, 100))
      expect(
        ulps(portable.hypot(x, 1.5, -x / 3), Math.hypot(x, 1.5, -x / 3))
      ).toBeLessThanOrEqual(2);
  });

  // Every engine must produce these exact bits. A change here changes the
  // simulation, so ranked replays and death clips from earlier builds will no
  // longer verify.
  it('produces pinned bit patterns', () => {
    const bits = (x: number) => {
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, x);
      return view.getBigUint64(0).toString(16);
    };
    const results = [
      portable.sin(0.7466666666666667),
      portable.sin(0.9600000000000001),
      portable.cos(0.5593364141397201),
      portable.cos(5.701592653589792),
      portable.sin(7919.3),
      portable.atan2(-0.3, -0.7),
      portable.acos(0.123456789),
      portable.asin(-0.987654321),
      portable.exp(-8 / 30),
      portable.pow(1.15, 3.7),
      portable.hypot(0.1, 0.2, 0.3),
    ].map(bits);
    expect(results).toMatchInlineSnapshot(`
      [
        "3fe5bbf947dfae46",
        "3fea36d13c606028",
        "3feb1f9994596e7f",
        "3feabd24acd5e389",
        "3fe37ec012d83b3e",
        "c005e4c36ca0118a",
        "3ff727026158be56",
        "bff69db18528bd75",
        "3fe8827c258b629e",
        "3ffad5c42615df28",
        "3fd7f254dab9cc3b",
      ]
    `);
  });
});
