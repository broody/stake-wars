import { expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { markedSectors, SectorMarkings } from './sectorMarkings';
import { sectorCorner } from './sectors';
import { vec3 } from './sphere';

it('reaches adjoining faces at a Core vertex and lays each mark on the existing triangle', () => {
  const center = sectorCorner(vec3(), 0, 1);
  const faces = markedSectors(center, 0.008);
  expect(faces.length).toBeGreaterThanOrEqual(5);
  const marks = new SectorMarkings(faces.length, '', {});
  marks.begin(5);
  marks.mark(faces, center, 0.008, 0.1, 0.2);
  const matrix = new Matrix4();
  const corners = [new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)];
  faces.forEach(({ sector }, i) => {
    marks.getMatrixAt(i, matrix);
    for (const [index, local] of corners.entries()) {
      const expected = new Vector3().copy(sectorCorner(vec3(), sector, index));
      expect(
        local.clone().applyMatrix4(matrix).distanceTo(expected)
      ).toBeLessThan(1e-6);
    }
  });
  marks.begin(5);
  marks.flush();
  expect(marks.count).toBe(0);
  marks.dispose();
});
