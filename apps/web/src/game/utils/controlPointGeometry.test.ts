import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTROL_POINT_COUNT,
  createControlPointGeometry,
  createControlPointSetGeometry,
  extractControlPointPositions,
  isControlPointId,
} from './controlPointGeometry';

describe('canonical Control Point geometry', () => {
  it('contains exactly one triangle for every on-chain Control Point', () => {
    const geometry = createControlPointGeometry();

    expect(geometry.index).toBeNull();
    expect(geometry.getAttribute('position').count / 3).toBe(
      CONTROL_POINT_COUNT
    );
  });

  it('uses a stable, deterministic ordering for Control Point IDs', () => {
    const geometry = createControlPointGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const digest = createHash('sha256')
      .update(Buffer.from(positions.buffer))
      .digest('hex');

    expect(digest).toBe(
      '7ff5ef80dbd17349029311018c6fa166d31295a308f079076c3bdb2ca682801d'
    );
  });

  it('extracts the triangle assigned to a Control Point ID', () => {
    const geometry = createControlPointGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const controlPointId = 1_337;

    expect(Array.from(extractControlPointPositions([controlPointId]))).toEqual(
      Array.from(positions.slice(controlPointId * 9, controlPointId * 9 + 9))
    );
  });

  it('combines multiple Control Points into one render layer', () => {
    const geometry = createControlPointSetGeometry([3, 21, 987]);

    expect(geometry.getAttribute('position').count / 3).toBe(3);
  });

  it('rejects IDs outside the on-chain range', () => {
    expect(isControlPointId(0)).toBe(true);
    expect(isControlPointId(CONTROL_POINT_COUNT - 1)).toBe(true);
    expect(isControlPointId(-1)).toBe(false);
    expect(isControlPointId(CONTROL_POINT_COUNT)).toBe(false);
    expect(() => extractControlPointPositions([CONTROL_POINT_COUNT])).toThrow(
      RangeError
    );
  });
});
