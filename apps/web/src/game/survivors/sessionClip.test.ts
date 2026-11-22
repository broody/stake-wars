// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { ENEMY_GROUND_RADIUS } from '../utils/enemySwarm';
import { CLIP_TICKS } from './clip';
import {
  RankedReplay,
  rankedRun,
  scoreReplay,
  supplyAction,
} from './rankedReplay';
import { SurvivorsSession } from './session';

it('plays a death clip on the Core without taking input', () => {
  const run = rankedRun(21);
  const recorder = new RankedReplay();
  while (run.status !== 'fallen') {
    if (run.status === 'choosing') recorder.choose(run, 0);
    else if (run.status === 'supply') recorder.choose(run, supplyAction);
    else recorder.advance(run, { x: 0, y: 0 });
  }
  const { clip } = scoreReplay(21, recorder.data(), { clip: true });

  const session = new SurvivorsSession();
  session.watching = { clip: clip!, player: { name: 'Moon Pilot' } };
  session.start(ENEMY_GROUND_RADIUS);
  expect(session.watchingClip).toBe(true);
  expect(session.opening).toBe(false);
  expect(session.replay).toBeNull();
  const view = { ...session.run!.view };
  // A viewer's keys never steer the replay.
  session.keys.add('KeyD');
  for (let frame = 0; frame < CLIP_TICKS * 2; frame++) {
    session.advance(1 / 30);
    if (session.run!.status === 'fallen') break;
  }
  expect(session.run!.status).toBe('fallen');
  expect(session.run!.kills).toBe(run.kills);
  expect(session.run!.time).toBe(run.time);
  expect(session.run!.view).toEqual(view);

  // Watching again starts the same clip over.
  session.start(ENEMY_GROUND_RADIUS);
  expect(session.run!.status).toBe('playing');
  expect(session.run!.time).toBeLessThan(run.time);
});
