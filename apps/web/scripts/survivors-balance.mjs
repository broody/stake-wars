#!/usr/bin/env node
/**
 * Core Survivors balance simulator.
 *
 *   pnpm sim:balance [options]      (from the repository root)
 *
 *   --runs N         seeds 0..N-1 per build (default 24)
 *   --cap SECONDS    play every run to this time (default 1500)
 *   --builds LIST    natural,mid,max (default all three)
 *   --policy NAME    greedy | random | first (default greedy)
 *   --workers N      worker threads (default: cores - 2)
 *   --json FILE      save the full results
 *   --compare FILE   print the change from a saved --json
 *
 * The sim is bundled once with Vite's SSR build, then seeds run in parallel.
 */
import { availableParallelism } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    parentPort.postMessage(sim.runSurvivor(job));
  process.exit(0);
}

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    i++;
  } else args.set(key, 'true');
}
const runs = Number(args.get('runs') ?? 24);
const cap = Number(args.get('cap') ?? 1500);
const builds = (args.get('builds') ?? 'natural,mid,max').split(',');
const policy = args.get('policy') ?? 'greedy';
const workers = Number(
  args.get('workers') ?? Math.max(1, availableParallelism() - 2)
);

// Bundle the balance entry so worker threads can import plain JavaScript.
const outDir = resolve(web, 'node_modules/.cache/survivors-balance');
mkdirSync(outDir, { recursive: true });
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
const { TARGETS } = await import(bundle);

const jobs = builds.flatMap((name) =>
  Array.from({ length: runs }, (_, seed) => ({
    seed,
    policy,
    build: name,
    cap,
  }))
);
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
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
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
    if (minutes[m].taken > minutes[m].healed) losingFrom = minutes[m].minute;
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
  const losingFrom = losingFromMinutes(minutes);
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
      group.filter((r) => lasted(r) > TARGETS.earlySeconds).length /
      group.length,
    causes,
    minutes,
    damageShare: Object.fromEntries(
      Object.entries(damage).map(([id, v]) => [id, v / totalDamage])
    ),
    healShare: Object.fromEntries(
      Object.entries(healing).map(([id, v]) => [id, v / totalHealing])
    ),
    losingFrom,
    firstEvolution: evolutions.length ? median(evolutions) : null,
    evolvedShare: evolutions.length / group.length,
    level: median(group.map((r) => r.level)),
  };
}

const summary = Object.fromEntries(
  builds.map((name) => [
    name,
    summarize(results.filter((r) => r.build === name)),
  ])
);
const baseline = args.has('compare')
  ? JSON.parse(readFileSync(args.get('compare'), 'utf8')).summary
  : null;
// Recompute from the saved minutes so older files compare like for like.
for (const before of Object.values(baseline ?? {}))
  before.losingFrom = losingFromMinutes(before.minutes);
const delta = (now, before, format = clock) =>
  before === undefined || before === null || !Number.isFinite(before)
    ? ''
    : ` (${now - before >= 0 ? '+' : '-'}${format(Math.abs(now - before))})`;

const lines = [];
const say = (text = '') => lines.push(text);
say(
  `Core Survivors balance: ${runs} seeds per build, ${clock(cap)} cap, ${policy} picks, ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s`
);
say(
  'Headless: default landscape view, flat Core, virtual health (see balance/run.ts).'
);
for (const name of builds) {
  const s = summary[name];
  const b = baseline?.[name];
  say();
  say(`== ${name} build ==`);
  say(
    `  falls at   median ${clock(s.median)}${delta(s.median, b?.median)}   ` +
      `p10 ${clock(s.p10)}  p25 ${clock(s.p25)}  p75 ${clock(s.p75)}  p90 ${clock(s.p90)}`
  );
  say(
    `  lasts cap  ${pct(s.capShare)}${b ? delta(s.capShare * 100, b.capShare * 100, (v) => `${Math.round(v)}%`) : ''}` +
      `   past ${clock(TARGETS.earlySeconds)}: ${pct(s.earlyShare)}   final level ${s.level}`
  );
  const causes = Object.entries(s.causes)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  say(`  killed by  ${causes || 'nothing'}`);
  say(
    `  losing     ${s.losingFrom ? `from minute ${s.losingFrom}` : 'never while most runs stand: heals at least as fast as it is hurt'}` +
      (b
        ? `   (before: ${b.losingFrom ? `minute ${b.losingFrom}` : 'never'})`
        : '')
  );
  say(
    `  evolves    ${pct(s.evolvedShare)} of runs, first at ${clock(s.firstEvolution ?? NaN)}`
  );
  say(
    `  damage     ${Object.entries(s.damageShare)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v)}`)
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
        `${(m.taken - m.healed).toFixed(0).padStart(7)}  ${m.alive.toFixed(0).padStart(7)}  ` +
        `${m.level.toFixed(0).padStart(5)}`
    );
  }
}

// ---------- Targets ----------

const checks = [];
const within = ([lo, hi], value) => value >= lo && value <= hi;
const span = ([lo, hi]) => `${clock(lo)}–${clock(hi)}`;
if (summary.natural)
  checks.push([
    `${pct(TARGETS.earlyShare)} of natural runs pass ${clock(TARGETS.earlySeconds)}`,
    summary.natural.earlyShare >= TARGETS.earlyShare,
    pct(summary.natural.earlyShare),
  ]);
if (summary.mid) {
  const safe = summary.mid.minutes[TARGETS.midSafeMinute - 1]?.standing ?? 0;
  checks.push([
    `${pct(TARGETS.midSafeShare)} of mid builds stand at minute ${TARGETS.midSafeMinute}`,
    safe >= TARGETS.midSafeShare,
    pct(safe),
  ]);
  checks.push([
    `mid build falls at ${span(TARGETS.midMedian)} (median)`,
    within(TARGETS.midMedian, summary.mid.median),
    summary.mid.capShare >= 0.5
      ? `${pct(summary.mid.capShare)} last the cap`
      : clock(summary.mid.median),
  ]);
}
for (const [name, by] of [
  ['mid', TARGETS.midLosingBy],
  ['max', TARGETS.maxLosingBy],
])
  if (summary[name])
    checks.push([
      `${name === 'max' ? 'maxed' : 'mid'} build loses health on balance by minute ${by}`,
      summary[name].losingFrom !== null && summary[name].losingFrom <= by,
      summary[name].losingFrom ? `minute ${summary[name].losingFrom}` : 'never',
    ]);
if (summary.max)
  checks.push([
    `maxed build falls at ${span(TARGETS.maxMedian)} (median)`,
    within(TARGETS.maxMedian, summary.max.median),
    summary.max.capShare >= 0.5
      ? `${pct(summary.max.capShare)} last the cap`
      : clock(summary.max.median),
  ]);
say();
say('== targets ==');
for (const [label, ok, value] of checks)
  say(`  ${ok ? 'PASS' : 'MISS'}  ${label}: ${value}`);

console.log(lines.join('\n'));
if (args.has('json')) {
  writeFileSync(
    args.get('json'),
    JSON.stringify(
      { options: { runs, cap, builds, policy }, summary, results },
      null,
      1
    )
  );
  console.log(`\nSaved ${args.get('json')}`);
}
