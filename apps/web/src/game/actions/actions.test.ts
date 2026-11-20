import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SABER, saberClipTime } from '../survivors/saberAttack';
import { CHAIN_TRAVEL, SIM_HZ } from '../survivors/sim';
import { chord, dot } from '../survivors/sphere';
import { VANGUARD, VanguardAnimation } from '../utils/vanguardAnimation';
import { ACTION_LEAD, ACTIONS, actionById, WALK_INPUT } from './actions';
import { ActionDriver, STEP } from './driver';
import {
  CLIP_SECONDS,
  probeAction,
  SWING_BLEND,
  swingClipRate,
  swingElapsedAt,
  swingFrameTimes,
} from './timeline';

const action = (id: string) => actionById(id)!;

async function vanguard() {
  const bytes = readFileSync(
    new URL('../../../public/models/vanguard/vanguard.glb', import.meta.url)
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
}

/** Ground speed over the last tick, as the renderer measures it. */
function speedAt(driver: ActionDriver, loopTime: number) {
  driver.show(driver.runTime(loopTime));
  const { player, groundRadius } = driver.run;
  return chord(player.prev, player.n) * groundRadius * SIM_HZ;
}

describe('Vanguard action scripts', () => {
  it('walks at the Walk clip’s authored speed and runs at full speed', () => {
    expect(WALK_INPUT).toBeGreaterThan(0.1);
    expect(speedAt(new ActionDriver(action('walk'), undefined), 1)).toBeCloseTo(
      VANGUARD.walkSpeed * VANGUARD.scale,
      4
    );
    const run = speedAt(new ActionDriver(action('run'), undefined), 1);
    expect(run).toBeGreaterThan(VANGUARD.runBy);
  });

  it('plays the clip each swing is named for', () => {
    const clips = {
      forehand: 'Attack',
      backhand: 'AttackBackhand',
      'run-forehand': 'RunAttack',
      'run-backhand': 'RunAttackBackhand',
    };
    for (const [id, clip] of Object.entries(clips))
      expect(probeAction(action(id)).swing?.clip, id).toBe(clip);
    // Ahead and behind lean right, so neither is left to rounding.
    for (const bearing of ['ahead', 'behind'] as const)
      expect(
        probeAction(action('forehand'), {
          stance: 'stand',
          bearing,
          blade: 1,
        }).swing?.clip,
        bearing
      ).toBe('AttackBackhand');
  });

  it('swings once, ACTION_LEAD into the loop, and marks the ground at the hit', () => {
    for (const spec of ACTIONS.filter((a) => a.swing)) {
      const probe = probeAction(spec);
      const swing = probe.swing!;
      expect(swing.start, spec.id).toBeCloseTo(ACTION_LEAD, 5);
      expect(swing.duration).toBe(SABER.duration);
      expect(Math.abs(probe.slash!.start - swing.impact)).toBeLessThan(STEP);
      expect(probe.slash!.kind).toBe(
        spec.swing!.blade === 'eclipse' ? 'eclipse' : 'sweep'
      );
      expect(probe.slash!.start + probe.slash!.life).toBeLessThan(probe.loop);
      expect(probe.sounds.filter((s) => s.id === 'swing')).toHaveLength(1);
    }
  });

  it('hits the target on every swing preset', () => {
    for (const spec of ACTIONS.filter((a) => a.swing)) {
      const driver = new ActionDriver(spec, spec.swing);
      driver.show(driver.runTime(driver.loop));
      expect(driver.run.damageBy.blade ?? 0, spec.id).toBeGreaterThan(0);
    }
  });

  it('keeps a running target beside the Vanguard', () => {
    const driver = new ActionDriver(action('run-forehand'), undefined);
    driver.show(driver.runTime(0));
    const start = chord(driver.run.enemies[0].n, driver.run.player.n);
    driver.show(driver.runTime(ACTION_LEAD));
    expect(chord(driver.run.enemies[0].n, driver.run.player.n)).toBeCloseTo(
      start,
      6
    );
  });

  it('throws a crescent, sends a shockwave, and blocks then breaks the Aegis', () => {
    const crescent = probeAction(action('crescent'));
    expect(crescent.crescent!.start).toBeCloseTo(crescent.swing!.impact, 1);
    expect(crescent.crescent!.end).toBeLessThan(crescent.loop);
    // Effects show from the start of the tick that makes them.
    expect(probeAction(action('rebuke')).rebuke!.start).toBeCloseTo(
      ACTION_LEAD - STEP,
      5
    );
    expect(probeAction(action('aegis')).aegis.map((a) => a.result)).toEqual([
      'blocked',
      'blocked',
      'broke',
    ]);
    const wounds = probeAction(action('hurt')).wounds;
    expect(wounds).toHaveLength(2);
    expect(wounds[0]).toBeCloseTo(ACTION_LEAD, 5);
    expect(probeAction(action('defeated')).fall).toBeCloseTo(ACTION_LEAD, 5);
  });

  it.each([
    ['shards', 2],
    ['shard-halo', 6],
  ] as const)('shows the %s orbit and replays its contacts', (id, count) => {
    const driver = new ActionDriver(action(id), undefined);
    driver.show(driver.runTime(0));
    const weapon = driver.run.weapons.find((w) => w.id === 'shards')!;
    expect(weapon.count).toBe(count);
    const startRadius = weapon.radius;
    driver.show(driver.runTime(1.4));
    if (id === 'shard-halo')
      expect(weapon.radius).toBeLessThan(startRadius - 0.4);
    else expect(weapon.radius).toBe(startRadius);
    const impacts = probeAction(action(id)).sounds.filter(
      (event) => event.id === 'hit'
    );
    expect(impacts.length).toBeGreaterThan(1);
    const atHit = driver.runTime(impacts[0].at);
    driver.show(atHit);
    const first = structuredClone(
      driver.run.texts.find((hit) => hit.shardTangent)
    );
    expect(first?.shardTangent).toBeDefined();
    const total = driver.run.damageBy.shards;
    expect(total).toBeGreaterThan(0);
    driver.show(driver.runTime(driver.loop));
    driver.show(atHit);
    expect(driver.run.texts.find((hit) => hit.shardTangent)).toEqual(first);
    expect(driver.run.damageBy.shards).toBe(total);
  });

  it.each([
    ['charge', 1, 2.2],
    ['meltdown', 3, 5],
  ] as const)(
    'previews the %s volley, impact and full burn from the game',
    (id, count, life) => {
      const spec = action(id);
      const driver = new ActionDriver(spec, undefined);
      const probe = probeAction(spec);
      expect(probe.lob!.count).toBe(count);
      expect(probe.lob!.start).toBeCloseTo(ACTION_LEAD - STEP);
      expect(probe.burn!.start - probe.lob!.start).toBeCloseTo(0.5, 2);
      expect(probe.burn!.life).toBe(life);
      expect(probe.burn!.start + life).toBeLessThan(driver.loop);
      const flight = driver.runTime(ACTION_LEAD + 0.2);
      driver.show(flight);
      const targets = driver.run.lobs.map((lob) => lob.to);
      expect(new Set(driver.run.lobs.map((lob) => lob.spread)).size).toBe(
        count
      );
      driver.show(driver.runTime(ACTION_LEAD + 0.65));
      expect(driver.run.lobs).toHaveLength(0);
      expect(driver.run.zones.map((zone) => zone.n)).toEqual(targets);
      expect(driver.run.damageBy.charge).toBeGreaterThan(0);
      driver.show(driver.runTime(driver.loop));
      expect(driver.run.zones).toHaveLength(0);
      driver.show(flight);
      expect(driver.run.lobs.map((lob) => lob.to)).toEqual(targets);
    }
  );

  it('replays to the same state when shown again from the start', () => {
    const driver = new ActionDriver(action('run-backhand'), undefined);
    const at = driver.runTime(ACTION_LEAD + 0.4);
    driver.show(at);
    const n = { ...driver.run.player.n };
    const attack = driver.run.player.saberAttack!;
    driver.show(driver.runTime(0));
    driver.show(at);
    expect(driver.run.player.n).toEqual(n);
    expect(driver.run.player.saberAttack).toMatchObject({
      startedAt: attack.startedAt,
      side: attack.side,
    });
  });

  it('lands a single orbital impact and four successive waves of chain impacts', () => {
    const base = probeAction(action('orbital-strike')).strikes;
    expect(base).toHaveLength(1);
    expect(base[0]).toMatchObject({ linked: false, count: 1 });
    const spec = action('chain-barrage');
    const impacts = probeAction(spec).strikes;
    expect(impacts.map(({ linked, count }) => [linked, count])).toEqual([
      [false, 3],
      [true, 3],
      [true, 3],
      [true, 3],
      [true, 3],
    ]);
    const driver = new ActionDriver(spec, undefined);
    let damage = 0;
    for (const [i, hit] of impacts.entries()) {
      expect(hit.at - impacts[0].at).toBeCloseTo(i * CHAIN_TRAVEL, 5);
      driver.show(driver.runTime(hit.at + STEP));
      expect(driver.run.damageBy.strike!).toBeGreaterThan(damage);
      damage = driver.run.damageBy.strike!;
    }
    driver.show(driver.runTime(0));
    driver.show(driver.runTime(driver.loop));
    expect(driver.run.damageBy.strike).toBe(damage);
    expect(driver.run.timers).toHaveLength(0);
  });

  it('tracks a moving chain target and leaves the ripple where the glint landed', () => {
    const driver = new ActionDriver(action('chain-barrage'), undefined);
    const { run } = driver;
    for (const enemy of run.enemies) enemy.speed = 0.28;
    driver.show(driver.runTime(ACTION_LEAD));
    const link = run.effects.find((fx) => fx.kind === 'chain');
    if (link?.kind !== 'chain') throw new Error('Expected a chain in flight');
    const launch = { ...link.b };
    driver.show(driver.runTime(ACTION_LEAD + 2 * STEP));
    expect(chord(link.b, launch)).toBeGreaterThan(0);
    const arrival = { ...link.b };
    driver.show(driver.runTime(ACTION_LEAD + CHAIN_TRAVEL));
    expect(run.ripples.some((ripple) => chord(ripple.n, arrival) < 1e-8)).toBe(
      true
    );
    driver.show(driver.runTime(ACTION_LEAD + 2 * CHAIN_TRAVEL));
    expect(link.b).toEqual(arrival);
  });

  it('runs both lobes of the loadout drill with real shield, pulse and shard contacts', () => {
    const spec = action('moving-loadout');
    const driver = new ActionDriver(spec, undefined);
    const { n } = driver.origin;
    const right = { ...driver.run.right };
    const side = (seconds: number) => {
      driver.show(driver.runTime(seconds));
      return dot(right, driver.run.player.n) * driver.run.groundRadius;
    };
    expect(side(2)).toBeGreaterThan(0.45);
    expect(side(6)).toBeLessThan(-0.45);
    driver.show(driver.runTime(driver.loop));
    expect(
      chord(driver.run.player.n, n) * driver.run.groundRadius
    ).toBeLessThan(0.4);
    expect(driver.run.damageBy.shards).toBeGreaterThan(0);
    expect(driver.run.damageBy.pulse).toBeGreaterThan(0);
    expect(driver.run.absorbedBy.mite).toBeGreaterThan(0);
    const probe = probeAction(spec);
    expect(probe.wounds[0]).toBeGreaterThan(
      probe.aegis.find((hit) => hit.result === 'broke')!.at
    );
    const before = { ...driver.run.damageBy };
    driver.show(driver.runTime(0));
    driver.show(driver.runTime(driver.loop));
    expect(driver.run.damageBy).toEqual(before);
  });
});

describe('swing timing', () => {
  it('inverts saberClipTime', () => {
    for (const duration of [0.5, 0.75])
      for (const clip of [0, 0.1, VANGUARD.impact, 0.6, 22 / 24])
        expect(
          saberClipTime(
            swingElapsedAt(clip, duration, 22 / 24),
            duration,
            22 / 24,
            VANGUARD.impact
          )
        ).toBeCloseTo(clip, 9);
  });

  it('plays the wind-up slower and the follow-through faster than authored', () => {
    expect(swingClipRate(0.1, 0.75, 22 / 24)).toBeCloseTo(8 / 11, 9);
    expect(swingClipRate(0.6, 0.75, 22 / 24)).toBeCloseTo(2, 9);
    expect(swingClipRate(0.6, 0.75, 20 / 24)).toBeCloseTo(12 / 7, 9);
  });

  it('puts the cut frame on the sim’s hit', () => {
    const swing = probeAction(action('forehand')).swing!;
    const frames = swingFrameTimes(swing);
    expect(frames).toHaveLength(23);
    expect(frames[8]).toBeCloseTo(swing.impact, 9);
    expect(frames[22]).toBeCloseTo(swing.start + swing.duration, 9);
  });

  it('matches the model’s clips and the animation’s blend windows', async () => {
    const glb = await vanguard();
    for (const [name, seconds] of Object.entries(CLIP_SECONDS))
      expect(
        glb.animations.find((clip) => clip.name === name)?.duration,
        name
      ).toBeCloseTo(seconds, 6);
    const a = new VanguardAnimation(glb.scene, glb.animations);
    const attack = {
      id: 1,
      startedAt: 1,
      duration: 0.75,
      side: -1,
      forward: { x: 0, y: 0, z: 1 },
    };
    const weight = (phase: number) => {
      a.update(0, 0);
      a.update(1 + phase * 0.75, 0, attack);
      return a.actions.get('Attack:upper')!.getEffectiveWeight();
    };
    expect(weight(SWING_BLEND.in / 2)).toBeCloseTo(0.5, 6);
    expect(weight(1 - SWING_BLEND.out / 2)).toBeCloseTo(0.5, 6);
    expect(weight(0.5)).toBe(1);
    a.dispose();
  });
});
