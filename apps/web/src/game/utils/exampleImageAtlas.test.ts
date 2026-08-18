import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_IMAGE_ATLAS_COLUMNS,
  EXAMPLE_IMAGE_ATLAS_HEIGHT,
  EXAMPLE_IMAGE_ATLAS_ROWS,
  EXAMPLE_IMAGE_ATLAS_WIDTH,
  EXAMPLE_IMAGE_DETAIL_SIZE,
  createExampleDetailImageGeometry,
  createExampleImageGeometry,
  selectExampleImageSectorIds,
} from './exampleImageAtlas';
import { SECTOR_COUNT } from './sectorGeometry';

describe('example image atlas', () => {
  it('selects deterministic occupied Sectors', () => {
    const owners = Array.from({ length: SECTOR_COUNT }, (_, id) =>
      id % 7 === 0 ? -1 : id % 4
    );
    const first = selectExampleImageSectorIds(owners, 256, 47);
    const second = selectExampleImageSectorIds(owners, 256, 47);

    expect(first).toEqual(second);
    expect(first).toHaveLength(256);
    expect(new Set(first).size).toBe(256);
    expect(first.every((sectorId) => owners[sectorId] >= 0)).toBe(true);
  });

  it('caps image selection at the occupied Sector count', () => {
    const owners = Array.from({ length: SECTOR_COUNT }, (_, id) =>
      id < 120 ? 0 : -1
    );

    expect(selectExampleImageSectorIds(owners, SECTOR_COUNT, 11)).toHaveLength(
      120
    );
  });

  it('creates one textured triangle per example image', () => {
    const sectorIds = [0, 17, SECTOR_COUNT - 1];
    const heights = new Map([
      [0, 0],
      [17, 0.4],
      [SECTOR_COUNT - 1, 0.9],
    ]);
    const geometry = createExampleImageGeometry(sectorIds, heights);
    const positions = geometry.getAttribute('position');
    const uvs = geometry.getAttribute('uv');

    expect(positions.count).toBe(sectorIds.length * 3);
    expect(uvs.count).toBe(sectorIds.length * 3);
    for (let index = 0; index < uvs.count; index += 1) {
      expect(uvs.getX(index)).toBeGreaterThan(0);
      expect(uvs.getX(index)).toBeLessThan(1);
      expect(uvs.getY(index)).toBeGreaterThan(0);
      expect(uvs.getY(index)).toBeLessThan(1);
    }

    geometry.dispose();
  });

  it('fits every Sector into the fixed atlas dimensions', () => {
    expect(EXAMPLE_IMAGE_ATLAS_COLUMNS * EXAMPLE_IMAGE_ATLAS_ROWS).toBe(2_048);
    expect(EXAMPLE_IMAGE_ATLAS_WIDTH).toBe(4_096);
    expect(EXAMPLE_IMAGE_ATLAS_HEIGHT).toBe(2_048);
    expect(EXAMPLE_IMAGE_DETAIL_SIZE).toBe(512);
  });

  it('maps the focused detail texture across one full triangle', () => {
    const geometry = createExampleDetailImageGeometry(17, new Map());
    const uvs = geometry.getAttribute('uv');

    expect(
      Array.from({ length: uvs.count }, (_, index) => [
        uvs.getX(index),
        uvs.getY(index),
      ])
    ).toEqual([
      [0.5, 1],
      [0, 0],
      [1, 0],
    ]);

    geometry.dispose();
  });
});
