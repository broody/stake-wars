import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Quaternion, Vector3 } from 'three';
import {
  SaberAnimation,
  createSaberSlashGeometry,
} from '../utils/saberAnimation';
import { SABER, saberHits, saberReach } from './saberAttack';
async function asset() {
  const bytes = readFileSync(
    new URL(
      '../../../public/models/sector-trooper/sector-trooper-saber.glb',
      import.meta.url
    )
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
}
describe('Saber player animation', () => {
  it('preserves the running leg pose and phase when either upper-body attack starts', async () => {
    const glb = await asset();
    const normal = new SaberAnimation(glb.scene, glb.animations),
      attacking = new SaberAnimation(glb.scene, glb.animations);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 70; i++) {
        const time = i / 60;
        normal.update(time, 0.7);
        attacking.update(
          time,
          0.7,
          {
            id: 1,
            startedAt: 0.4,
            duration: 0.75,
            side,
            forward: { x: 0, y: 0, z: 1 },
          },
          Math.PI / 2
        );
        for (const name of ['thighL', 'shinR', 'footL', 'pelvis']) {
          const a = normal.root.getObjectByName(name),
            b = attacking.root.getObjectByName(name);
          expect(a, name).toBeDefined();
          expect(b!.matrixWorld.elements).toEqual(a!.matrixWorld.elements);
        }
        expect(attacking.gaitTime).toBe(normal.gaitTime);
      }
    }
    const clock = attacking.gaitTime;
    attacking.update(69 / 60, 0.7);
    expect(attacking.gaitTime).toBe(clock);
    normal.dispose();
    attacking.dispose();
  });
  it('has exactly one weapon, and the slash ends on the selected character side', async () => {
    const glb = await asset();
    const a = new SaberAnimation(glb.scene, glb.animations);
    expect(a.root.getObjectByName('SectorTrooper_Saber')).toBeDefined();
    expect(a.root.getObjectByName('SectorTrooper_Rifle')).toBeUndefined();
    for (const side of [-1, 1]) {
      a.update(0, 0, {
        id: 1,
        startedAt: 0,
        duration: 0.75,
        side,
        forward: { x: 0, y: 0, z: 1 },
      });
      a.update(SABER.impact, 0, {
        id: 1,
        startedAt: 0,
        duration: 0.75,
        side,
        forward: { x: 0, y: 0, z: 1 },
      });
      const blade = a.root.getObjectByName('SectorTrooper_Saber')!;
      // glTF converts the weapon blade axis from Blender +Z to local +Y.
      const point = blade.localToWorld(new Vector3(0, 1.12, 0));
      expect(point.x * side).toBeLessThan(0);
    }
    a.dispose();
  });
  it('turns the torso toward a rear strike without accumulating twist while paused', async () => {
    const glb = await asset();
    const a = new SaberAnimation(glb.scene, glb.animations);
    const attack = {
      id: 1,
      startedAt: 0,
      duration: 0.75,
      side: 1,
      forward: { x: 1, y: 0, z: 0 },
    };
    a.update(SABER.impact, 0, attack, 0);
    const chest = a.root.getObjectByName('chest')!;
    expect(chest).toBeDefined();
    const base = chest.quaternion.clone();
    a.update(SABER.impact, 0, attack, Math.PI / 2);
    const aimed = chest.quaternion.clone();
    expect(base.angleTo(aimed)).toBeCloseTo(Math.PI / 2, 5);
    for (let i = 0; i < 5; i++) {
      a.update(SABER.impact, 0, attack, Math.PI / 2);
      expect(chest.quaternion.angleTo(aimed)).toBeLessThan(1e-6);
    }
    a.dispose();
  });
  it('blends death from a running attack, holds the final pose, and can restart', async () => {
    const glb = await asset();
    const a = new SaberAnimation(glb.scene, glb.animations);
    const attack = {
      id: 1,
      startedAt: 0,
      duration: 0.75,
      side: 1,
      forward: { x: 1, y: 0, z: 0 },
    };
    a.update(0, 0.7, attack);
    a.update(0.3, 0.7, attack, Math.PI / 2);
    const head = a.root.getObjectByName('head')!;
    const initial = head.matrixWorld.clone();
    const initialHeight = head.getWorldPosition(new Vector3()).y;
    a.updateDeath(0);
    expect(head.matrixWorld.elements).toEqual(initial.elements);
    expect(a.actions.get('Saber_Death')!.getClip().duration).toBeCloseTo(
      SABER.deathDuration
    );
    a.updateDeath(1);
    const kneesHeadHeight = head.getWorldPosition(new Vector3()).y;
    const kneelingTorso = new Vector3(0, 1, 0).applyQuaternion(
      a.root.getObjectByName('chest')!.getWorldQuaternion(new Quaternion())
    );
    expect(kneelingTorso.y).toBeGreaterThan(0.85);
    expect(kneesHeadHeight).toBeLessThan(initialHeight - 0.25);
    for (let i = 61; i <= SABER.deathDuration * 60; i++) a.updateDeath(i / 60);
    expect(head.getWorldPosition(new Vector3()).y).toBeLessThan(
      kneesHeadHeight - 0.4
    );
    const final = head.matrixWorld.clone();
    const torso = a.root.getObjectByName('chest')!;
    const torsoAxis = new Vector3(0, 1, 0).applyQuaternion(
      torso.getWorldQuaternion(new Quaternion())
    );
    const face = new Vector3(0, 0, 1).applyQuaternion(
      head.getWorldQuaternion(new Quaternion())
    );
    expect(Math.abs(torsoAxis.y)).toBeLessThan(0.15);
    expect(torsoAxis.z).toBeGreaterThan(0.9);
    expect(Math.abs(face.x)).toBeGreaterThan(0.9);
    expect(head.getWorldPosition(new Vector3()).y).toBeLessThan(
      initialHeight - 0.3
    );
    for (const bone of ['head', 'pelvis', 'footL', 'handR'])
      expect(
        a.root
          .getObjectByName(bone)!
          .matrixWorld.elements.every(Number.isFinite)
      ).toBe(true);
    a.updateDeath(SABER.deathDuration + 1);
    expect(head.matrixWorld.elements).toEqual(final.elements);
    a.update(0, 0);
    expect(head.getWorldPosition(new Vector3()).y).toBeGreaterThan(
      initialHeight - 0.1
    );
    a.updateDeath(0);
    a.updateDeath(SABER.deathDuration);
    expect(head.matrixWorld.elements).toEqual(final.elements);
    a.dispose();
  });
  it('matches the displayed sector angle and collision boundary at every level', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      const { reach, width, arc } = saberReach(level, 1);
      const g = createSaberSlashGeometry(0.965, arc, width / 2 / reach);
      const p = g.attributes.position;
      let largestAngle = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) * reach,
          y = (p.getZ(i) * width) / 2;
        expect(saberHits(x, y, reach, width, arc, 1e-6)).toBe(true);
        largestAngle = Math.max(largestAngle, Math.abs(Math.atan2(y, x)));
      }
      expect(largestAngle * 2).toBeCloseTo(arc, 5);
      g.dispose();
    }
    const eclipse = createSaberSlashGeometry(0.965);
    const p = eclipse.attributes.position;
    for (let i = 0; i < p.count; i++)
      expect(saberHits(p.getX(i), p.getZ(i), 1, 2, Math.PI, 1e-6)).toBe(true);
    eclipse.dispose();
  });
});
