import { expect, it } from 'vitest';
import { scoreReplay } from '../rankedReplay';
import { planRun, playRanked, STYLES } from './play';

it('keeps a run that ends in range, and the verifier scores it the same', () => {
  const seed = 1000;
  // Learn this seed's natural scores, then ask for exactly one of them.
  const natural = playRanked(seed, STYLES[0]);
  const played = planRun(seed, natural.destroyed, natural.destroyed);
  expect(played?.destroyed).toBe(natural.destroyed);
  if (!played) return;
  // scoreReplay throws unless the run ends in defeat.
  const verified = scoreReplay(seed, played.replay);
  expect(verified.destroyed).toBe(played.destroyed);
  expect(verified.durationSeconds).toBe(played.durationSeconds);
}, 60_000);

it('returns null when no style ends in range', () => {
  expect(planRun(1000, 1_000_000, 1_000_001, [STYLES[0]])).toBeNull();
}, 60_000);
