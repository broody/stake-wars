#!/usr/bin/env node
/**
 * Core Survivors balance simulator.
 *
 *   pnpm sim:balance [options]      (from the repository root)
 *
 *   --runs N         consecutive seeds per build (default 24)
 *   --seed N         first seed (default 0); use with --runs 1 for a replay
 *   --cap SECONDS    maximum run time (default 900)
 *   --builds LIST    natural,mid,kit,max (default natural,mid,max); a
 *                    hero without a build skips it
 *   --heroes LIST    trooper,vanguard (default: the playable hero)
 *   --stance NAME    kite | engage (default: engage with Aegis, else kite)
 *   --aegis LIST     Aegis settings to try on shielded heroes, as
 *                    key=value pairs; separate variants with /, e.g.
 *                    segments=6,rechargeDelay=4/growth=0.08
 *   --pace LIST      Legion clock speeds to try, separated by /, e.g.
 *                    1.4/1.5/1.6 (default: the game's PACE)
 *   --levels LIST    level speeds to try, separated by / (default: the
 *                    game's LEVEL_PACE); combined with every --pace
 *   --policy NAME    greedy | random | first (default greedy)
 *   --focus WEAPON   prioritize its offered upgrades and evolution partner with greedy picks
 *   --mode NAME      survival (stop at defeat) | pressure (probe to the cap)
 *   --check          exit nonzero on missed or unmeasurable design targets
 *   --workers N      worker threads (default: cores - 2)
 *   --json FILE      save the full results
 *   --compare FILE   print the change from a saved --json
 *
 * The sim is bundled once with Vite's SSR build, then seeds run in parallel.
 */
import { availableParallelism } from 'node:os';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads';

if (!isMainThread) {
  const sim = await import(workerData.bundle);
  for (const job of workerData.jobs)
    parentPort.postMessage({ ...sim.runSurvivor(job), key: job.key });
  process.exit(0);
}

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    ...Object.fromEntries(
      [
        'runs',
        'seed',
        'cap',
        'builds',
        'heroes',
        'stance',
        'aegis',
        'pace',
        'levels',
        'policy',
        'workers',
        'json',
        'compare',
        'mode',
        'focus',
      ].map((key) => [key, { type: 'string' }])
    ),
    check: { type: 'boolean' },
  },
});
function integer(name, fallback, minimum = 1) {
  const n = Number(args[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < minimum)
    throw new Error(`--${name} requires an integer >= ${minimum}`);
  return n;
}
function oneOf(name, value, allowed) {
  if (!allowed.includes(value))
    throw new Error(
      `--${name} must be one of ${allowed.join(', ')}; got ${value}`
    );
  return value;
}
const runs = integer('runs', 24);
const seed = integer('seed', 0, 0);
if (seed + runs > 2 ** 32)
  throw new Error('Seed range exceeds unsigned 32-bit seeds');
const cap = Number(args.cap ?? 900);
if (!Number.isFinite(cap) || cap <= 0)
  throw new Error('--cap requires positive seconds');
const builds = (args.builds ?? 'natural,mid,max').split(',');
const mode = oneOf('mode', args.mode ?? 'survival', ['survival', 'pressure']);
const stance = args.stance;
if (stance) oneOf('stance', stance, ['kite', 'engage']);
const focus = args.focus;
const speeds = (name) =>
  (args[name] ?? '')
    .split('/')
    .filter(Boolean)
    .map((value) => {
      if (!Number.isFinite(Number(value)) || !(Number(value) > 0))
        throw new Error(`--${name} ${value}: expected > 0`);
      return Number(value);
    });
const paces = speeds('pace');
const levelPaces = speeds('levels');
const aegisVariants = (args.aegis ?? '')
  .split('/')
  .filter(Boolean)
  .map((label) => ({
    label,
    tuning: Object.fromEntries(
      label.split(',').map((pair) => {
        const [key, value] = pair.split('=');
        if (!Number.isFinite(Number(value)))
          throw new Error(`--aegis ${pair}: expected key=number`);
        return [key, Number(value)];
      })
    ),
  }));
const policy = oneOf('policy', args.policy ?? 'greedy', [
  'greedy',
  'random',
  'first',
]);
if (focus && policy !== 'greedy')
  throw new Error('--focus requires --policy greedy');
const workers = integer('workers', Math.max(1, availableParallelism() - 2));

// Give each invocation its own bundle so concurrent comparisons cannot overwrite it.
const cache = resolve(web, 'node_modules/.cache/survivors-balance');
mkdirSync(cache, { recursive: true });
const outDir = mkdtempSync(resolve(cache, 'run-'));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));
const { build } = await import('vite');
await build({
  root: web,
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(web, 'src/game/survivors/balance/index.ts'),
    outDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { format: 'es', entryFileNames: 'balance.mjs' } },
  },
});
const bundle = pathToFileURL(resolve(outDir, 'balance.mjs')).href;
const { TARGETS, BUILDS, HEROES, DEFAULT_HERO, carriesAegis } = await import(
  bundle
);
const heroes = (args.heroes ?? DEFAULT_HERO).split(',');
for (const hero of heroes) {
  oneOf('heroes', hero, Object.keys(HEROES));
  if (focus) oneOf('focus', focus, HEROES[hero].weapons);
}
for (const name of builds)
  oneOf('builds', name, Object.values(BUILDS).flatMap(Object.keys));

/**
 * Each hero's builds that exist, once per pace and, for a shielded hero, per
 * Aegis variant, as `hero build [variant]` keys in the report.
 */
const variantsFor = (hero) => {
  const shields =
    HEROES[hero]?.systems.includes('aegis') && aegisVariants.length
      ? aegisVariants
      : [{ label: '', tuning: undefined }];
  return (paces.length ? paces : [undefined]).flatMap((pace) =>
    (levelPaces.length ? levelPaces : [undefined]).flatMap((levelPace) =>
      shields.map(({ label, tuning }) => ({
        label: [
          pace === undefined ? '' : `pace=${pace}`,
          levelPace === undefined ? '' : `levels=${levelPace}`,
          label,
        ]
          .filter(Boolean)
          .join(' '),
        tuning,
        pace,
        levelPace,
      }))
    )
  );
};
const suffix = (label) => (label ? ` [${label}]` : '');
const groups = heroes.flatMap((hero) =>
  builds
    .filter((name) => BUILDS[hero]?.[name])
    .flatMap((name) =>
      variantsFor(hero).map(({ label, tuning, pace, levelPace }) => ({
        hero,
        name,
        label,
        tuning,
        pace,
        levelPace,
        key: `${hero} ${name}${suffix(label)}`,
      }))
    )
);
if (!groups.length || new Set(groups.map((g) => g.key)).size !== groups.length)
  throw new Error('Choose at least one available build and unique scenarios');
const jobs = groups.flatMap(({ hero, name, tuning, pace, levelPace, key }) =>
  Array.from({ length: runs }, (_, i) => ({
    seed: seed + i,
    mode,
    focus,
    policy,
    build: name,
    cap,
    hero,
    stance: stance ?? (carriesAegis(hero) ? 'engage' : 'kite'),
    aegis: tuning,
    pace,
    levelPace,
    key,
  }))
);
// Match individual runs so worker order and extra seeds in a saved file do not
// affect a comparison. Reports from the original simulator used virtual HP.
const reference = new Map();
if (args.compare) {
  const saved = JSON.parse(readFileSync(args.compare, 'utf8'));
  if (!Array.isArray(saved.results))
    throw new Error('--compare needs a full --json report');
  const indexed = new Map();
  for (const r of saved.results) {
    const key =
      r.key && r.key !== r.build ? r.key : `${r.hero ?? 'trooper'} ${r.build}`;
    const id = `${key}:${r.seed}`;
    if (indexed.has(id)) throw new Error(`Duplicate baseline run for ${id}`);
    indexed.set(id, r);
  }
  for (const job of jobs) {
    const id = `${job.key}:${job.seed}`;
    const before = indexed.get(id);
    if (!before) throw new Error(`Missing baseline run for ${id}`);
    const settings = {
      ...before,
      mode: before.mode ?? 'pressure',
      stance: before.stance ?? 'kite',
    };
    for (const field of ['mode', 'policy', 'cap', 'stance', 'focus']) {
      if (job[field] !== settings[field])
        throw new Error(
          `Baseline ${field} mismatch for ${id} (${settings[field]} vs ${job[field]})`
        );
    }
    if (!reference.has(job.key)) reference.set(job.key, new Map());
    reference.get(job.key).set(job.seed, before);
  }
}
const started = Date.now();
const results = [];
const lanes = Array.from({ length: Math.min(workers, jobs.length) }, () => []);
jobs.forEach((job, i) => lanes[i % lanes.length].push(job));
await Promise.all(
  lanes.map(
    (lane) =>
      new Promise((done, fail) => {
        const worker = new Worker(fileURLToPath(import.meta.url), {
          workerData: { bundle, jobs: lane },
        });
        worker.on('message', (result) => {
          results.push(result);
          process.stderr.write(`\r${results.length}/${jobs.length} runs`);
        });
        worker.on('error', fail);
        worker.on('exit', (code) =>
          code === 0 ? done() : fail(new Error(`worker exited ${code}`))
        );
      })
  )
);
process.stderr.write('\n');
results.sort((a, b) => a.key.localeCompare(b.key) || a.seed - b.seed);

// ---------- Report ----------

const quantile = (values, q) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.ceil(at)] - sorted[lo]) * (at - lo);
};
const median = (values) => quantile(values, 0.5);
const clock = (seconds) =>
  Number.isFinite(seconds)
    ? `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`
    : '—';
const pct = (share) => `${Math.round(share * 100)}%`;
const lasted = (r) => r.fellAt ?? r.cap;

/**
 * First minute from which the median run takes more than it heals, through
 * the last minute most runs are still standing. Minutes after most runs have
 * fallen are left out: the bot keeps playing there, but nobody would be.
 */
function losingFromMinutes(minutes) {
  let last = -1;
  minutes.forEach((m, i) => {
    if (m.standing >= 0.5) last = i;
  });
  let losingFrom = null;
  for (let m = last; m >= 0; m--) {
    if (minutes[m].net > 0) losingFrom = minutes[m].minute;
    else break;
  }
  return losingFrom;
}

function summarize(group) {
  const times = group.map(lasted);
  const fell = group.filter((r) => r.fellAt !== null);
  const causes = {};
  for (const r of fell) causes[r.killedBy] = (causes[r.killedBy] ?? 0) + 1;
  const minutes = [];
  const longest = Math.max(...group.map((r) => r.minutes.length));
  for (let m = 0; m < longest; m++) {
    const rows = group.map((r) => r.minutes[m]).filter(Boolean);
    minutes.push({
      minute: m + 1,
      standing:
        group.filter((r) => r.fellAt === null || r.fellAt > (m + 1) * 60)
          .length / group.length,
      taken: median(rows.map((x) => x.taken)),
      healed: median(rows.map((x) => x.healed)),
      net: median(rows.map((x) => x.taken - x.healed)),
      alive: median(rows.map((x) => x.alive)),
      level: median(rows.map((x) => x.level)),
    });
  }
  const damage = {};
  for (const r of group)
    for (const [id, value] of Object.entries(r.damageBy))
      damage[id] = (damage[id] ?? 0) + value;
  const totalDamage = Object.values(damage).reduce((a, b) => a + b, 0) || 1;
  const healing = {};
  for (const r of group)
    for (const [id, value] of Object.entries(r.healedBy ?? {}))
      healing[id] = (healing[id] ?? 0) + value;
  const totalHealing = Object.values(healing).reduce((a, b) => a + b, 0) || 1;
  const absorbed = group.reduce(
    (total, r) =>
      total + Object.values(r.absorbedBy ?? {}).reduce((a, b) => a + b, 0),
    0
  );
  const taken = group.reduce(
    (total, r) => total + Object.values(r.hurtBy).reduce((a, b) => a + b, 0),
    0
  );
  const evolutions = group
    .map((r) => r.firstEvolution)
    .filter((t) => t !== null);
  return {
    runs: group.length,
    median: median(times),
    p10: quantile(times, 0.1),
    p25: quantile(times, 0.25),
    p75: quantile(times, 0.75),
    p90: quantile(times, 0.9),
    capShare: group.filter((r) => r.fellAt === null).length / group.length,
    earlyShare:
      cap <= TARGETS.earlySeconds
        ? null
        : group.filter((r) => lasted(r) > TARGETS.earlySeconds).length /
          group.length,
    causes,
    minutes,
    damageShare: Object.fromEntries(
      Object.entries(damage).map(([id, v]) => [id, v / totalDamage])
    ),
    healShare: Object.fromEntries(
      Object.entries(healing).map(([id, v]) => [id, v / totalHealing])
    ),
    losingFrom: mode === 'pressure' ? losingFromMinutes(minutes) : null,
    absorbedShare: absorbed / (absorbed + taken || 1),
    breaksPerMinute: median(
      group.map(
        (r) =>
          (r.aegisBreaks ?? 0) /
          ((mode === 'pressure' ? r.cap : lasted(r)) / 60)
      )
    ),
    firstEvolution: evolutions.length ? median(evolutions) : null,
    evolvedShare: evolutions.length / group.length,
    level: median(group.map((r) => r.level)),
    kills: median(group.map((r) => r.kills)),
  };
}

const summary = Object.fromEntries(
  groups.map(({ key }) => [
    key,
    summarize(results.filter((r) => r.key === key)),
  ])
);
function compareSeeds(group, before) {
  const differences = (metric) =>
    group.map((r) => metric(r) - metric(before.get(r.seed)));
  const survival = differences(lasted);
  const largest = survival.reduce(
    (best, value, i) => (Math.abs(value) > Math.abs(survival[best]) ? i : best),
    0
  );
  return {
    seconds: median(survival),
    longer: survival.filter((change) => change > 0).length,
    shorter: survival.filter((change) => change < 0).length,
    same: survival.filter((change) => change === 0).length,
    kills: median(differences((r) => r.kills)),
    level: median(differences((r) => r.level)),
    biggestSurvivalChange: {
      seed: group[largest].seed,
      seconds: survival[largest],
    },
  };
}
const delta = (now, before, format = clock) =>
  before === undefined || before === null || !Number.isFinite(before)
    ? ''
    : ` (${now - before >= 0 ? '+' : '-'}${format(Math.abs(now - before))})`;

const lines = [];
const say = (text = '') => lines.push(text);
say(
  `Core Survivors balance: ${runs} seeds per build, ${clock(cap)} cap, ${policy} picks, ` +
    `${focus ? `focus ${focus}, ` : ''}${stance ? `${stance} stance, ` : ''}${((Date.now() - started) / 1000).toFixed(1)}s`
);
say(
  `Headless: default landscape view, flat Core. ${
    mode === 'survival'
      ? 'Survival mode ends at defeat or the cap.'
      : 'Pressure mode continues after virtual defeat; totals include play through the cap.'
  }`
);
for (const { key } of groups) {
  const s = summary[key];
  const before = reference.get(key);
  const b = before && summarize([...before.values()]);
  const group = results.filter((r) => r.key === key);
  say();
  say(`== ${key} build ==`);
  say(
    `  time (capped)  median ${clock(s.median)}${delta(s.median, b?.median)}   ` +
      `p10 ${clock(s.p10)}  p25 ${clock(s.p25)}  p75 ${clock(s.p75)}  p90 ${clock(s.p90)}`
  );
  say(
    `  lasts cap  ${pct(s.capShare)}${b ? delta(s.capShare * 100, b.capShare * 100, (v) => `${Math.round(v)} pp`) : ''}` +
      `   past ${clock(TARGETS.earlySeconds)}: ${s.earlyShare === null ? '—' : pct(s.earlyShare)}   final level ${s.level}   kills ${s.kills}`
  );
  if (before) {
    const paired = compareSeeds(group, before);
    s.paired = paired;
    const signed = (n) => `${n >= 0 ? '+' : ''}${Number(n.toFixed(1))}`;
    say(
      `  paired median change   ${signed(paired.seconds)}s played, ${signed(paired.kills)} kills, ${signed(paired.level)} levels`
    );
    say(
      `  seed outcomes   ${paired.longer} longer, ${paired.shorter} shorter, ${paired.same} same capped time`
    );
    const swing = paired.biggestSurvivalChange;
    if (swing.seconds !== 0)
      say(
        `  largest time change    seed ${swing.seed}, ${signed(swing.seconds)}s`
      );
  }
  if (focus) {
    const owned = group.flatMap((r) => r.weapons.filter((w) => w.id === focus));
    const ranks = [1, 2, 3, 4, 5].map(
      (rank) =>
        `L${rank} ${pct(owned.filter((w) => w.level >= rank).length / group.length)}`
    );
    say(
      `  ${focus} reached   ${ranks.join(', ')}, evolved ${pct(owned.filter((w) => w.evolved).length / group.length)}`
    );
  }
  const causes = Object.entries(s.causes)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  say(`  killed by  ${causes || 'nothing'}`);
  if (mode === 'pressure')
    say(
      `  losing     ${s.losingFrom ? `from minute ${s.losingFrom}` : 'never while most runs stand: heals at least as fast as it is hurt'}` +
        (b
          ? `   (before: ${b.losingFrom ? `minute ${b.losingFrom}` : 'never'})`
          : '')
    );
  say(
    `  evolves    ${pct(s.evolvedShare)}${delta(s.evolvedShare * 100, b && b.evolvedShare * 100, (n) => n.toFixed(1) + ' pp')} of runs, first at ${clock(s.firstEvolution ?? NaN)}${s.firstEvolution === null ? '' : delta(s.firstEvolution, b?.firstEvolution)}`
  );
  if (s.absorbedShare > 0)
    say(
      `  aegis      took ${pct(s.absorbedShare)} of incoming damage, ` +
        `${s.breaksPerMinute.toFixed(2)} breaks/min (median)`
    );
  say(
    `  damage     ${[
      ...new Set([
        ...Object.keys(s.damageShare),
        ...Object.keys(b?.damageShare ?? {}),
      ]),
    ]
      .sort((a, c) => (s.damageShare[c] ?? 0) - (s.damageShare[a] ?? 0))
      .map((k) => {
        const share = s.damageShare[k] ?? 0;
        return `${k} ${pct(share)}${delta(share * 100, b && (b.damageShare[k] ?? 0) * 100, (n) => n.toFixed(1) + ' pp')}`;
      })
      .join(', ')}`
  );
  say(
    `  healed by  ${
      Object.entries(s.healShare ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${pct(v)}`)
        .join(', ') || 'nothing'
    }`
  );
  say('  minute  standing  taken/min  healed/min  net/min  enemies  level');
  for (const m of s.minutes) {
    if (m.minute % 2 && m.minute !== 1) continue;
    say(
      `  ${String(m.minute).padStart(6)}  ${pct(m.standing).padStart(8)}  ` +
        `${m.taken.toFixed(0).padStart(9)}  ${m.healed.toFixed(0).padStart(10)}  ` +
        `${m.net.toFixed(0).padStart(7)}  ${m.alive.toFixed(0).padStart(7)}  ` +
        `${m.level.toFixed(0).padStart(5)}`
    );
  }
}

// ---------- Targets ----------

const checks = [];
const within = ([lo, hi], value) => value >= lo && value <= hi;
const span = ([lo, hi]) => `${clock(lo)}–${clock(hi)}`;
for (const [hero, label] of heroes.flatMap((hero) =>
  variantsFor(hero).map((variant) => [hero, variant.label])
)) {
  const of = (name) => summary[`${hero} ${name}${suffix(label)}`];
  const natural = of('natural');
  const mid = of('mid');
  const max = of('max');
  if (natural)
    checks.push([
      `${hero}${suffix(label)}: ${pct(TARGETS.earlyShare)} of natural runs pass ${clock(TARGETS.earlySeconds)}`,
      natural.earlyShare === null
        ? null
        : natural.earlyShare >= TARGETS.earlyShare,
      natural.earlyShare === null ? 'cap too short' : pct(natural.earlyShare),
    ]);
  if (mid) {
    const safe = mid.minutes[TARGETS.midSafeMinute - 1]?.standing ?? 0;
    const observed = cap >= TARGETS.midSafeMinute * 60;
    checks.push([
      `${hero}${suffix(label)}: ${pct(TARGETS.midSafeShare)} of mid builds stand at minute ${TARGETS.midSafeMinute}`,
      observed ? safe >= TARGETS.midSafeShare : null,
      observed ? pct(safe) : 'cap too short',
    ]);
  }
  // Short natural runs exercise the opening. Longer runs also measure the
  // eight-minute target for the same hero and pick strategy used to tune it.
  const measureNaturalMedian =
    hero === 'vanguard' &&
    mode === 'survival' &&
    policy === 'greedy' &&
    !focus &&
    stance !== 'kite' &&
    cap >= TARGETS.naturalMedian[1];
  for (const [name, s, band] of [
    ['natural', measureNaturalMedian && natural, TARGETS.naturalMedian],
    ['mid', mid, TARGETS.midMedian],
    ['max', max, TARGETS.maxMedian],
  ]) {
    if (!s) continue;
    const censored = s.capShare >= 0.5;
    checks.push([
      `${hero}${suffix(label)}: ${name} build falls at ${span(band)} (median)`,
      censored ? (s.median > band[1] ? false : null) : within(band, s.median),
      censored
        ? `at least ${clock(s.median)} (${pct(s.capShare)} last the cap)`
        : clock(s.median),
    ]);
  }
  for (const [name, by] of [
    ['mid', TARGETS.midLosingBy],
    ['max', TARGETS.maxLosingBy],
  ])
    if (mode === 'pressure' && of(name))
      checks.push([
        `${hero}${suffix(label)}: ${name === 'max' ? 'maxed' : 'mid'} build loses health on balance by minute ${by}`,
        cap < by * 60
          ? null
          : of(name).losingFrom !== null && of(name).losingFrom <= by,
        cap < by * 60
          ? 'cap too short'
          : of(name).losingFrom
            ? `minute ${of(name).losingFrom}`
            : 'never',
      ]);
}
say();
say('== targets ==');
for (const [label, ok, value] of checks)
  say(
    `  ${ok === null ? 'UNMEASURED' : ok ? 'PASS' : 'MISS'}  ${label}: ${value}`
  );

if (!checks.length) say('  No design targets for the selected builds.');
if (args.check && (!checks.length || checks.some(([, ok]) => ok !== true)))
  process.exitCode = 1;

console.log(lines.join('\n'));
if (args.json) {
  writeFileSync(
    args.json,
    JSON.stringify(
      {
        options: {
          runs,
          seed,
          mode,
          focus,
          cap,
          builds,
          heroes,
          stance,
          aegis: aegisVariants,
          paces,
          levelPaces,
          policy,
        },
        summary,
        checks: checks.map(([label, ok, value]) => ({ label, ok, value })),
        results,
      },
      null,
      1
    )
  );
  console.log(`\nSaved ${args.json}`);
}
