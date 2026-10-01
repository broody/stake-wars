import { describe, expect, it } from 'vitest';
import { createRun } from './sim';
import { pointAt, vec3 } from './sphere';
import { enemyDeathOpacity } from '../utils/enemyOpacity';

describe('enemies around the fallen player', () => {
  it('fades overlapping units, preserves nearby spectators, and restores opacity on retry', () => {
    const run = createRun(44, 5);
    const crowd = pointAt(vec3(), run.player.n, run.right, 0.45 / 5);
    const spectator = pointAt(vec3(), run.player.n, run.right, 1.1 / 5);
    expect(enemyDeathOpacity(run, crowd, 0.2)).toBe(1);
    run.status = 'fallen';
    expect(enemyDeathOpacity(run, crowd, 0.2)).toBe(0.2);
    expect(enemyDeathOpacity(run, spectator, 0.2)).toBe(1);
    run.status = 'playing';
    expect(enemyDeathOpacity(run, crowd, 0.2)).toBe(1);
  });
});
