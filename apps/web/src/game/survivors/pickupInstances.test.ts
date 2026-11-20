import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FULL_FIELD, ITEM_ENTRIES } from '../catalog/itemPreview';
import { createRun, MAX_GEMS } from './sim';
import { PICKUP_MODELS } from './pickupGeometry';
import { PickupInstances } from './pickupInstances';

describe('Survivors pickup batches', () => {
  it('draws every item in the full-field preview with one opaque batch per model', () => {
    const run = createRun(3, 5);
    FULL_FIELD.setup(run);
    expect(run.gems).toHaveLength(MAX_GEMS);
    expect(ITEM_ENTRIES.map((e) => e.id).sort()).toEqual(
      [...PICKUP_MODELS].sort()
    );
    const renderer = new PickupInstances();
    try {
      renderer.update(run, 5, 1);
      const batches = renderer.group.children as THREE.InstancedMesh[];
      expect(batches).toHaveLength(PICKUP_MODELS.length);
      expect(new Set(batches.map((batch) => batch.material)).size).toBe(1);
      expect(batches.reduce((n, b) => n + b.count, 0)).toBe(
        MAX_GEMS + run.items.length
      );
      for (const batch of batches) {
        expect(batch.geometry.groups).toHaveLength(0);
        expect((batch.material as THREE.Material).transparent).toBe(false);
        expect(batch.geometry.getAttribute('color').count).toBe(
          batch.geometry.getAttribute('position').count
        );
        expect(batch.geometry.boundingSphere!.radius).toBeGreaterThan(0);
        if (batch.name.startsWith('shard-'))
          expect(
            batch.geometry.getAttribute('position').count / 3
          ).toBeLessThanOrEqual(144);
      }
      run.gems.length = 0;
      run.items.length = 0;
      renderer.update(run, 5, 1);
      expect(batches.every((b) => b.count === 0 && !b.visible)).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  it('keeps rendering when the number of utility pickups exceeds the initial buffer', () => {
    const run = createRun(7, 5);
    const repair = ITEM_ENTRIES.find((e) => e.id === 'repair')!;
    for (let i = 0; i < 31; i++) repair.setup(run);
    const renderer = new PickupInstances();
    try {
      renderer.update(run, 5, 1);
      const [batch] = renderer.group.children as THREE.InstancedMesh[];
      expect(renderer.group.children).toHaveLength(1);
      expect(batch.count).toBe(31);
      const first = new THREE.Matrix4(),
        last = new THREE.Matrix4();
      batch.getMatrixAt(0, first);
      batch.getMatrixAt(30, last);
      expect(first.equals(last)).toBe(true);
      expect(first.determinant()).toBeCloseTo(1);
    } finally {
      renderer.dispose();
    }
  });
});
