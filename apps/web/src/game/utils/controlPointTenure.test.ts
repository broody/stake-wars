import { describe, expect, it } from 'vitest';
import {
  MAX_TENURE_EXTRUSION,
  controlPointTenureHeights,
  formatControlPointTenure,
  tenureExtrusionHeight,
  uniformAdjacentControlPointHeights,
} from './controlPointTenure';
import {
  adjacentControlPointIds,
  CONTROL_POINT_COUNT,
} from './controlPointGeometry';

const DAY = 24 * 60 * 60;
const NOW = 2_000_000_000;

describe('Control Point tenure scale', () => {
  it.each([
    [1, 0.09],
    [7, 0.26],
    [30, 0.44],
    [90, 0.57],
    [365, 0.75],
  ])('maps %i days to a stable absolute height', (days, expected) => {
    expect(tenureExtrusionHeight(NOW - days * DAY, NOW)).toBeCloseTo(
      expected,
      2
    );
  });

  it('caps old Control Points and rejects unknown timestamps', () => {
    expect(tenureExtrusionHeight(NOW - 10 * 365 * DAY, NOW)).toBe(
      MAX_TENURE_EXTRUSION
    );
    expect(tenureExtrusionHeight(null, NOW)).toBe(0);
    expect(tenureExtrusionHeight(0, NOW)).toBe(0);
  });

  it('does not create a negative extrusion for a future timestamp', () => {
    expect(tenureExtrusionHeight(NOW + DAY, NOW)).toBe(0);
  });

  it('elevates a contiguous same-owner territory to its longest-held point', () => {
    const first = 0;
    const adjacent = adjacentControlPointIds(first)[0];
    const excluded = new Set([
      first,
      adjacent,
      ...adjacentControlPointIds(first),
      ...adjacentControlPointIds(adjacent),
    ]);
    const disconnected = Array.from(
      { length: CONTROL_POINT_COUNT },
      (_, controlPointId) => controlPointId
    ).find((controlPointId) => !excluded.has(controlPointId));

    expect(adjacent).toBeDefined();
    expect(disconnected).toBeDefined();

    const uniform = uniformAdjacentControlPointHeights(
      [[first, adjacent, disconnected!]],
      new Map([
        [first, 1],
        [adjacent, 4],
        [disconnected!, 2],
      ])
    );

    expect(uniform.get(first)).toBe(4);
    expect(uniform.get(adjacent)).toBe(4);
    expect(uniform.get(disconnected!)).toBe(2);
  });

  it('does not combine adjacent Control Points owned by different users', () => {
    const first = 0;
    const adjacent = adjacentControlPointIds(first)[0];
    const uniform = uniformAdjacentControlPointHeights(
      [[first], [adjacent]],
      new Map([
        [first, 1],
        [adjacent, 4],
      ])
    );

    expect(uniform.get(first)).toBe(1);
    expect(uniform.get(adjacent)).toBe(4);
  });

  it('returns flat territory when tenure extrusion is disabled', () => {
    const first = 0;
    const adjacent = adjacentControlPointIds(first)[0];
    const heights = controlPointTenureHeights(
      false,
      [first, adjacent],
      [[first, adjacent]],
      new Map([
        [first, NOW - DAY],
        [adjacent, NOW - 365 * DAY],
      ]),
      NOW
    );

    expect(heights).toEqual(
      new Map([
        [first, 0],
        [adjacent, 0],
      ])
    );
  });

  it('restores uniform tenure heights when extrusion is enabled', () => {
    const first = 0;
    const adjacent = adjacentControlPointIds(first)[0];
    const heights = controlPointTenureHeights(
      true,
      [first, adjacent],
      [[first, adjacent]],
      new Map([
        [first, NOW - DAY],
        [adjacent, NOW - 365 * DAY],
      ]),
      NOW
    );

    expect(heights.get(first)).toBe(MAX_TENURE_EXTRUSION);
    expect(heights.get(adjacent)).toBe(MAX_TENURE_EXTRUSION);
  });
});

describe('Control Point tenure formatting', () => {
  it.each([
    [NOW - 30 * 60, '<1h'],
    [NOW - 3 * 60 * 60, '3h'],
    [NOW - 12 * DAY, '12d'],
    [NOW - 8 * 30 * DAY, '8mo'],
    [NOW - (365 + 4 * 30) * DAY, '1y 4mo'],
  ])('formats %i as %s', (controlledSince, expected) => {
    expect(formatControlPointTenure(controlledSince, NOW)).toBe(expected);
  });

  it('keeps missing tenure explicitly unknown', () => {
    expect(formatControlPointTenure(null, NOW)).toBe('---');
  });
});
