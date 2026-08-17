import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getControlPointIdsInScreenBounds } from './controlPointMarquee';

function createCamera() {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);
  return camera;
}

describe('Control Point marquee selection', () => {
  it('selects visible Control Points that overlap the bounding box', () => {
    const selected = getControlPointIdsInScreenBounds(
      createCamera(),
      { width: 1_000, height: 1_000 },
      { left: 450, top: 450, right: 550, bottom: 550 }
    );

    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThan(100);
  });

  it('does not select Control Points on the hidden side of the Core', () => {
    const selected = getControlPointIdsInScreenBounds(
      createCamera(),
      { width: 1_000, height: 1_000 },
      { left: 0, top: 0, right: 1_000, bottom: 1_000 }
    );

    expect(selected.length).toBeGreaterThan(500);
    expect(selected.length).toBeLessThan(1_000);
  });

  it('returns no points for a box outside the viewport', () => {
    const selected = getControlPointIdsInScreenBounds(
      createCamera(),
      { width: 1_000, height: 1_000 },
      { left: -200, top: -200, right: -100, bottom: -100 }
    );

    expect(selected).toEqual([]);
  });

  it('excludes Control Points that are not eligible for marquee selection', () => {
    const viewport = { width: 1_000, height: 1_000 };
    const bounds = { left: 450, top: 450, right: 550, bottom: 550 };
    const allVisible = getControlPointIdsInScreenBounds(
      createCamera(),
      viewport,
      bounds
    );
    const excluded = new Set(allVisible.slice(0, 3));

    const selected = getControlPointIdsInScreenBounds(
      createCamera(),
      viewport,
      bounds,
      excluded
    );

    expect(selected).toEqual(
      allVisible.filter((controlPointId) => !excluded.has(controlPointId))
    );
  });
});
