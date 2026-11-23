import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ENEMY_GROUND_RADIUS } from '../utils/enemySwarm';
import { extractSectorPositions, SECTOR_COUNT } from '../utils/sectorGeometry';
import { buildFor } from './balance';
import type { HeroId } from './content';
import {
  applyOffer,
  chooseOffer,
  closeSupply,
  createRun,
  SIM_HZ,
  tick,
} from './sim';

/**
 * The API replays ranked runs in Node, so the simulation must give the same
 * bits in every engine. Only `portableMath` may compute transcendental
 * functions; the engine's own versions differ between browsers and Node.
 */
const ENGINE_DEPENDENT = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'hypot',
  'random',
] as const;

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Modules the verifier bundles that the scan does not follow. Each one is
 * checked another way.
 */
const NOT_FOLLOWED: Record<string, string> = {
  // The simulation reads only ENEMY_GROUND_RADIUS here; the rest renders.
  'utils/enemySwarm.ts': 'constant only',
  // three.js builds the Sector table; the hash test below pins its output.
  'utils/sectorGeometry.ts': 'pinned by hash',
};

function resolveImport(from: string, specifier: string) {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`])
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next spelling.
    }
  throw new Error(`Cannot resolve ${specifier} from ${from}`);
}

/** Every source file the verifier reaches from rankedReplay.ts. */
function simulationSources() {
  const seen = new Set<string>();
  const queue = [resolve(here, 'rankedReplay.ts')];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(file, 'utf8');
    for (const [, typeOnly, specifier] of source.matchAll(
      /^import\s+(type\s+)?[^'"]*?from\s+'(\.[^']+)'/gm
    )) {
      if (typeOnly) continue;
      const target = resolveImport(file, specifier);
      const relative = target.slice(resolve(here, '..').length + 1);
      if (!(relative in NOT_FOLLOWED)) queue.push(target);
    }
  }
  return [...seen].filter((file) => file.endsWith('.ts'));
}

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('simulation determinism', () => {
  it('uses no engine-dependent math in any module the verifier runs', () => {
    const files = simulationSources();
    expect(files.length).toBeGreaterThan(10);
    const calls = new RegExp(`\\bMath\\.(${ENGINE_DEPENDENT.join('|')})\\b`);
    const found: string[] = [];
    for (const file of files) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        // `**` is Math.pow, which engines may round differently.
        if (calls.test(line) || /\*\*/.test(line))
          found.push(
            `${file.slice(here.length + 1)}:${index + 1}: ${line.trim()}`
          );
      });
    }
    expect(found).toEqual([]);
  });

  describe('while engine math is watched', () => {
    const original = new Map<string, (...args: number[]) => number>();
    afterEach(() => {
      for (const [name, fn] of original) Object.assign(Math, { [name]: fn });
      original.clear();
    });

    /**
     * Fail on any engine-dependent call made outside three's Sector build.
     * The run stops at the fifth one, so a regression fails quickly.
     */
    function watchMath() {
      const calls: string[] = [];
      for (const name of ENGINE_DEPENDENT) {
        const fn = Math[name] as (...args: number[]) => number;
        original.set(name, fn);
        Object.assign(Math, {
          [name]: (...args: number[]) => {
            const stack = new Error().stack ?? '';
            if (!stack.includes('createCanonicalUnitPositions')) {
              calls.push(
                `Math.${name}\n${stack.split('\n').slice(2, 5).join('\n')}`
              );
              if (calls.length >= 5)
                throw new Error(
                  `Engine math in the simulation:\n${calls.join('\n\n')}`
                );
            }
            return fn(...args);
          },
        });
      }
      return calls;
    }

    // Eight headings, so the hero sweeps the Core without calling trig.
    const HEADINGS = [
      [1, 0],
      [0.7, 0.7],
      [0, 1],
      [-0.7, 0.7],
      [-1, 0],
      [-0.7, -0.7],
      [0, -1],
      [0.7, -0.7],
    ];

    it.each<[HeroId, 'natural' | 'max', number]>([
      ['vanguard', 'natural', 8],
      ['vanguard', 'max', 10],
      ['trooper', 'max', 10],
    ])(
      'plays a %s %s run for %d minutes without it',
      (hero, build, minutes) => {
        const calls = watchMath();
        const run = createRun(77, ENEMY_GROUND_RADIUS, hero);
        for (const offer of buildFor(hero, build)) applyOffer(run, offer);
        const ticks = minutes * 60 * SIM_HZ;
        for (let step = 0; step < ticks; step++) {
          while (run.status === 'choosing')
            chooseOffer(run, step % run.offers.length);
          if (run.status === 'supply') closeSupply(run);
          // Hold integrity up so every enemy and attack gets its turn.
          run.player.hp = Math.max(run.player.hp, run.player.maxHp / 2);
          const [x, y] = HEADINGS[Math.floor(step / 45) % HEADINGS.length];
          tick(run, 1 / SIM_HZ, { x, y });
        }
        expect(run.status).not.toBe('fallen');
        expect(run.kills).toBeGreaterThan(500);
        expect(calls.slice(0, 5)).toEqual([]);
      }
    );
  });

  // three.js builds the Sector table the simulation reads. Upgrading three
  // could move a corner and change every ranked replay without any edit here.
  it('reads the same Sector table', () => {
    const corners = extractSectorPositions(
      Array.from({ length: SECTOR_COUNT }, (_, id) => id),
      1
    );
    let hash = 0x811c9dc5;
    for (const byte of new Uint8Array(
      corners.buffer,
      corners.byteOffset,
      corners.byteLength
    ))
      hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    expect({ count: SECTOR_COUNT, hash: hash.toString(16) })
      .toMatchInlineSnapshot(`
      {
        "count": 2000,
        "hash": "c657e589",
      }
    `);
  });
});
