import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AnimationMixer, LoopOnce, Vector3, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bakeEnemyLocomotion } from '../utils/enemyRunAtlas';
import { applyOffer, createRun, spawnEnemy, tick, type Run } from './sim';
import { SABER } from './saberAttack';
function finishCut(run: Run) {
  for (
    let i = 0;
    i < Math.ceil(SABER.impact / DT) + 2 && !run.defeatedEnemies.length;
    i++
  )
    tick(run, DT, still);
}
import { chord, pointAt, vec3 } from './sphere';
import {
  ENEMY_DEFEAT,
  enemyDefeatOpacity,
  STRIKE_TOSS,
  tossFlight,
} from './enemyDefeat';
const DT = 1 / 30,
  RADIUS = 5.006,
  still = { x: 0, y: 0 };
function encounter(
  kind:
    | 'mite'
    | 'skitter'
    | 'volt'
    | 'lancer'
    | 'captain'
    | 'bulwark'
    | 'seeker' = 'mite'
) {
  const run = createRun(17, RADIUS);
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  run.weapons[0].cooldown = 0;
  const n = pointAt(vec3(), run.player.n, run.right, 0.4 / RADIUS);
  const enemy = spawnEnemy(run, kind, n);
  enemy.hp = 1;
  enemy.speed = 0;
  tick(run, DT, still);
  finishCut(run);
  run.weapons = [];
  return { run, enemy };
}
describe('Enemy defeat lifecycle', () => {
  it('removes each animated enemy variant from combat immediately and rewards it once', () => {
    for (const kind of [
      'mite',
      'skitter',
      'volt',
      'lancer',
      'captain',
      'bulwark',
      'seeker',
    ] as const) {
      const { run, enemy } = encounter(kind);
      expect(run.enemies).not.toContain(enemy);
      expect(run.defeatedEnemies).toHaveLength(1);
      // Saber kills toss small bodies; they leave from where they died.
      const body = run.defeatedEnemies[0];
      expect(body.toss?.from ?? body.n).toEqual(enemy.n);
      expect(body.n).not.toBe(enemy.n);
      expect(run.kills).toBe(1);
      expect(
        run.gems.reduce((sum, gem) => sum + gem.value, 0) + run.player.xp
      ).toBe(enemy.spec.xp);
      for (let i = 0; i < 20; i++) tick(run, DT, still);
      expect(run.kills).toBe(1);
      expect(run.player.hp).toBe(100);
    }
  });
  it('keeps the Seeker collapse until it settles, then removes its harmless remains', () => {
    const { run, enemy } = encounter('seeker');
    expect(run.enemies).not.toContain(enemy);
    const body = run.defeatedEnemies[0];
    expect(body.toss).toBeUndefined();
    run.player.n = { ...body.n };
    for (let i = 0; i < 59; i++) tick(run, DT, still);
    expect(run.defeatedEnemies).toContain(body);
    expect(body.age).toBeGreaterThan(1.8);
    expect(run.player.hp).toBe(100);
    for (let i = 0; i < 17; i++) tick(run, DT, still);
    expect(run.defeatedEnemies).toHaveLength(0);
  });
  it('lets a living unit and the player pass through the remains', () => {
    const { run } = encounter();
    const corpse = run.defeatedEnemies[0];
    const living = spawnEnemy(run, 'mite', corpse.n);
    living.speed = 0;
    tick(run, DT, still);
    expect(chord(living.n, corpse.n)).toBeLessThan(1e-12);
    run.enemies = [];
    const control = createRun(17, RADIUS);
    control.weapons = [];
    control.spawnCredit = -1e6;
    for (let i = 0; i < 15; i++) {
      tick(run, DT, { x: 1, y: 0 });
      tick(control, DT, { x: 1, y: 0 });
    }
    expect(run.player.n).toEqual(control.player.n);
    expect(run.player.hp).toBe(100);
  });
  it('holds the completed collapse briefly, fades, and removes it on schedule', () => {
    const { run } = encounter();
    for (let i = 0; i < 40; i++) tick(run, DT, still);
    expect(run.defeatedEnemies).toHaveLength(1);
    expect(run.defeatedEnemies[0].age).toBeGreaterThan(ENEMY_DEFEAT.duration);
    expect(enemyDefeatOpacity(0)).toBeLessThan(1);
    expect(enemyDefeatOpacity(1.6)).toBeLessThan(enemyDefeatOpacity(1.3));
    expect(enemyDefeatOpacity(ENEMY_DEFEAT.lifetime)).toBe(0);
    for (let i = 0; i < 16; i++) tick(run, DT, still);
    expect(run.defeatedEnemies).toHaveLength(0);
  });
  it('cancels a Bulwark charge on death and leaves harmless debris', () => {
    const run = createRun(17, RADIUS);
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    const weapons = run.weapons;
    run.weapons = [];
    const enemy = spawnEnemy(
      run,
      'bulwark',
      pointAt(vec3(), run.player.n, run.right, 0.4 / RADIUS)
    );
    enemy.cooldown = 0;
    run.player.invulnerable = 1;
    tick(run, DT, still);
    expect(enemy.mode).toBe('thrust');
    enemy.hp = 1;
    run.weapons = weapons;
    run.weapons[0].cooldown = 0;
    tick(run, DT, still);
    finishCut(run);
    expect(run.enemies).not.toContain(enemy);
    expect(run.defeatedEnemies).toHaveLength(1);
    const body = run.defeatedEnemies[0];
    const origin = { ...body.n };
    run.player.n = { ...body.n };
    run.weapons = [];
    for (let i = 0; i < 40; i++) tick(run, DT, still);
    expect(body.n).toEqual(origin);
    expect(run.player.hp).toBe(100);
    expect(run.kills).toBe(1);
  });
  it('freezes the corpse clock while the game waits for an upgrade', () => {
    const { run } = encounter();
    run.status = 'choosing';
    tick(run, 3, still);
    expect(run.defeatedEnemies[0].age).toBe(0);
  });
});
it.each(['mite', 'lancer', 'bulwark'])(
  'bakes exact %s Defeated poses, including the held endpoint, into transparent batches',
  async (model) => {
    const bytes = readFileSync(
      new URL(
        `../../../public/models/hollow-legion/${model}.glb`,
        import.meta.url
      )
    );
    const asset = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ''
    );
    const meshes: SkinnedMesh[] = [];
    asset.scene.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh);
    });
    const parts = bakeEnemyLocomotion(
      asset.scene,
      asset.animations,
      { value: 0 },
      model === 'bulwark' ? 'Walk' : 'Run',
      'Defeated'
    );
    const clip = asset.animations.find((c) => c.name === 'Defeated')!;
    expect(clip.duration).toBe(ENEMY_DEFEAT.duration);
    const mixer = new AnimationMixer(asset.scene),
      action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (let frame = 0; frame <= 30; frame++) {
      mixer.setTime(frame / 24);
      asset.scene.updateMatrixWorld(true);
      for (let j = 0; j < meshes.length; j++) {
        const mesh = meshes[j],
          part = parts[j];
        mesh.skeleton.update();
        expect(part.material.transparent).toBe(true);
        expect(part.material.depthWrite).toBe(false);
        const count = mesh.geometry.attributes.position.count,
          pixels = part.texture.image.data as Float32Array;
        for (let i = 0; i < count; i++) {
          const point = mesh
            .getVertexPosition(i, new Vector3())
            .applyMatrix4(mesh.matrixWorld);
          const offset = ((24 + frame) * count + i) * 4;
          point
            .toArray()
            .forEach((v, k) => expect(pixels[offset + k]).toBeCloseTo(v, 5));
        }
      }
    }
    parts.forEach((p) => {
      p.geometry.dispose();
      p.material.dispose();
      p.texture.dispose();
    });
  }
);

describe('tossed bodies', () => {
  const arc = (a: { x: number; y: number; z: number }, b: typeof a) =>
    chord(a, b) * RADIUS;

  it('throws small saber kills away from the trooper', () => {
    for (const kind of ['mite', 'skitter', 'volt', 'lancer'] as const) {
      const { run, enemy } = encounter(kind);
      const body = run.defeatedEnemies[0];
      expect(body.toss).toBeDefined();
      const flown = arc(enemy.n, body.toss!.land);
      expect(flown).toBeGreaterThanOrEqual(STRIKE_TOSS.distance - 1e-6);
      expect(flown).toBeLessThanOrEqual(
        STRIKE_TOSS.distance + STRIKE_TOSS.spread + 1e-6
      );
      // Then it skids on, farther from where it died.
      const skid = arc(body.toss!.land, body.n);
      expect(skid).toBeGreaterThanOrEqual(STRIKE_TOSS.slide - 1e-6);
      expect(skid).toBeLessThanOrEqual(
        STRIKE_TOSS.slide + STRIKE_TOSS.slideSpread + 1e-6
      );
      expect(arc(enemy.n, body.n)).toBeGreaterThan(flown);
      expect(arc(body.n, run.player.n)).toBeGreaterThan(
        arc(enemy.n, run.player.n)
      );
    }
  });

  it('lands a Mite on its back, rolled and turned; a Lancer on its feet', () => {
    for (const kind of ['mite', 'skitter', 'volt'] as const) {
      const toss = encounter(kind).run.defeatedEnemies[0].toss!;
      expect(Math.abs(toss.spin)).toBeCloseTo(Math.PI, 12);
      // Always leaning a little, so its legs never point straight up.
      expect(toss.tilt).toBeGreaterThanOrEqual(STRIKE_TOSS.minTilt);
      expect(toss.tilt).toBeLessThanOrEqual(STRIKE_TOSS.tilt);
      expect(Math.abs(toss.twist)).toBeLessThanOrEqual(STRIKE_TOSS.twist);
    }
    const leans = [3, 5, 8, 13].map((seed) => {
      const run = createRun(seed, RADIUS);
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      run.weapons[0].cooldown = 0;
      const n = pointAt(vec3(), run.player.n, run.right, 0.4 / RADIUS);
      const enemy = spawnEnemy(run, 'mite', n);
      enemy.hp = 1;
      enemy.speed = 0;
      tick(run, DT, still);
      finishCut(run);
      return run.defeatedEnemies[0].toss!.lean.toFixed(3);
    });
    expect(new Set(leans).size).toBeGreaterThan(1);
    const lancer = encounter('lancer').run.defeatedEnemies[0].toss!;
    expect(Math.abs(lancer.spin)).toBeCloseTo(2 * Math.PI, 12);
    expect(lancer.tilt).toBe(0);
  });

  it('varies each throw', () => {
    const throws = [3, 5, 8, 13, 21].map((seed) => {
      const run = createRun(seed, RADIUS);
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      run.weapons[0].cooldown = 0;
      const n = pointAt(vec3(), run.player.n, run.right, 0.4 / RADIUS);
      const enemy = spawnEnemy(run, 'mite', n);
      enemy.hp = 1;
      enemy.speed = 0;
      tick(run, DT, still);
      finishCut(run);
      const toss = run.defeatedEnemies[0].toss!;
      return { height: toss.height, flown: arc(enemy.n, toss.land) };
    });
    const heights = new Set(throws.map((t) => t.height.toFixed(4)));
    const distances = new Set(throws.map((t) => t.flown.toFixed(3)));
    expect(heights.size).toBeGreaterThan(1);
    expect(distances.size).toBeGreaterThan(1);
    for (const { height } of throws) {
      expect(height).toBeGreaterThanOrEqual(STRIKE_TOSS.height * 0.6);
      expect(height).toBeLessThanOrEqual(STRIKE_TOSS.height * 1.4);
    }
  });

  it('leaves heavy, elite and boss bodies where they fell', () => {
    for (const kind of ['bulwark', 'captain'] as const) {
      const { run, enemy } = encounter(kind);
      expect(run.defeatedEnemies[0].toss).toBeUndefined();
      expect(run.defeatedEnemies[0].n).toEqual(enemy.n);
    }
  });

  it('throws Orbital Strike kills off the impact', () => {
    const run = createRun(23, RADIUS);
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    run.weapons = [];
    applyOffer(run, { kind: 'weapon', id: 'strike', isNew: true });
    const enemy = spawnEnemy(
      run,
      'mite',
      pointAt(vec3(), run.player.n, run.player.forward, 1.5 / RADIUS)
    );
    enemy.hp = 1;
    enemy.speed = 0;
    for (let i = 0; i < 90 && !run.defeatedEnemies.length; i++)
      tick(run, DT, still);
    const body = run.defeatedEnemies[0];
    expect(body.toss).toBeDefined();
    expect(arc(enemy.n, body.n)).toBeGreaterThanOrEqual(
      STRIKE_TOSS.distance - 1e-6
    );
  });

  it('lands the flight and stays down', () => {
    expect(tossFlight(0)).toEqual({ k: 0, travel: 0, lift: 0, slide: 0 });
    expect(tossFlight(STRIKE_TOSS.duration / 2).lift).toBeCloseTo(1, 9);
    const touchdown = tossFlight(STRIKE_TOSS.duration);
    expect(touchdown).toEqual({ k: 1, travel: 1, lift: 0, slide: 0 });
    const skidding = tossFlight(
      STRIKE_TOSS.duration + STRIKE_TOSS.slideDuration / 2
    );
    expect(skidding.lift).toBe(0);
    expect(skidding.slide).toBeGreaterThan(0.5);
    expect(skidding.slide).toBeLessThan(1);
    expect(
      tossFlight(STRIKE_TOSS.duration + STRIKE_TOSS.slideDuration).slide
    ).toBe(1);
  });
});
