import { describe, expect, it } from 'vitest';
import {
  MAX_TENURE_EXTRUSION,
  sectorTenureHeights,
  formatSectorTenure,
  tenureExtrusionHeight,
  uniformAdjacentSectorHeights,
} from './sectorTenure';
import { adjacentSectorIds, SECTOR_COUNT } from './sectorGeometry';

const DAY = 24 * 60 * 60;
const NOW = 2_000_000_000;

describe('Sector tenure scale', () => {
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

  it('caps old Sectors and rejects unknown timestamps', () => {
    expect(tenureExtrusionHeight(NOW - 10 * 365 * DAY, NOW)).toBe(
      MAX_TENURE_EXTRUSION
    );
    expect(tenureExtrusionHeight(null, NOW)).toBe(0);
    expect(tenureExtrusionHeight(0, NOW)).toBe(0);
  });

  it('does not create a negative extrusion for a future timestamp', () => {
    expect(tenureExtrusionHeight(NOW + DAY, NOW)).toBe(0);
  });

  it('elevates a contiguous same-owner territory to its longest-held sector', () => {
    const first = 0;
    const adjacent = adjacentSectorIds(first)[0];
    const excluded = new Set([
      first,
      adjacent,
      ...adjacentSectorIds(first),
      ...adjacentSectorIds(adjacent),
    ]);
    const disconnected = Array.from(
      { length: SECTOR_COUNT },
      (_, sectorId) => sectorId
    ).find((sectorId) => !excluded.has(sectorId));

    expect(adjacent).toBeDefined();
    expect(disconnected).toBeDefined();

    const uniform = uniformAdjacentSectorHeights(
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

  it('does not combine adjacent Sectors owned by different users', () => {
    const first = 0;
    const adjacent = adjacentSectorIds(first)[0];
    const uniform = uniformAdjacentSectorHeights(
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
    const adjacent = adjacentSectorIds(first)[0];
    const heights = sectorTenureHeights(
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
    const adjacent = adjacentSectorIds(first)[0];
    const heights = sectorTenureHeights(
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

describe('Sector tenure formatting', () => {
  it.each([
    [NOW - 30 * 60, '<1h'],
    [NOW - 3 * 60 * 60, '3h'],
    [NOW - 12 * DAY, '12d'],
    [NOW - 8 * 30 * DAY, '8mo'],
    [NOW - (365 + 4 * 30) * DAY, '1y 4mo'],
  ])('formats %i as %s', (controlledSince, expected) => {
    expect(formatSectorTenure(controlledSince, NOW)).toBe(expected);
  });

  it('keeps missing tenure explicitly unknown', () => {
    expect(formatSectorTenure(null, NOW)).toBe('---');
  });
});
