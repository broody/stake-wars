import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const cli = fileURLToPath(
  new URL('../../../../scripts/survivors-balance.mjs', import.meta.url)
);
const run = (...args: string[]) =>
  spawnSync(
    process.execPath,
    [cli, '--builds', 'natural', '--cap', '1', ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

it('compares matching seeds across workers and rejects incompatible baselines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'survivors-cli-'));
  try {
    const before = join(dir, 'before.json');
    const after = join(dir, 'after.json');
    const capture = run('--runs', '2', '--workers', '2', '--json', before);
    expect(capture.status, capture.stderr).toBe(0);
    const replay = run(
      '--seed',
      '1',
      '--runs',
      '1',
      '--compare',
      before,
      '--json',
      after
    );
    expect(replay.status, replay.stderr).toBe(0);
    const report = JSON.parse(readFileSync(after, 'utf8'));
    expect(report.summary['vanguard natural'].paired).toMatchObject({
      seconds: 0,
      kills: 0,
      level: 0,
      same: 1,
    });
    expect(report.results[0].seed).toBe(1);

    const incompatible = run(
      '--runs',
      '1',
      '--mode',
      'pressure',
      '--compare',
      before
    );
    expect(incompatible.status).toBe(1);
    expect(incompatible.stderr).toContain('Baseline mode mismatch');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);

it('fails a requested gate when its observation window exceeds the cap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'survivors-check-'));
  try {
    const path = join(dir, 'report.json');
    const check = run('--runs', '1', '--check', '--json', path);
    expect(check.status).toBe(1);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]).toMatchObject({
      ok: null,
      value: 'cap too short',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
