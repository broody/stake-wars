/**
 * House bot for the Core Survivors daily board.
 *
 * Each `play` run picks bot wallets that have no score in the open round,
 * plays one ranked run for each with the balance bot, and submits it the way
 * the browser does. The bot plays to survive and dies only when it is
 * overwhelmed, so every run and its death replay are real play. The --min to
 * --max range is split into one band per bot in the round, and each bot keeps
 * only a run that ends in its own band, so the bots' scores spread out. Bot
 * wallets are ordinary signed wallets, so a bot can win the daily prize.
 *
 *   node survivor-bot.cjs check                 test every key, submit nothing
 *   node survivor-bot.cjs play [--runs N]       play and submit N runs (default 1)
 *   node survivor-bot.cjs play --dry-run        plan runs without a ticket or a submission
 *     [--save DIR]                              and write each replay to DIR/<seed>.bin
 *
 * Options and their environment variables:
 *   --api URL        SURVIVOR_BOT_API       (default https://stakewars.fly.dev)
 *   --accounts FILE  SURVIVOR_BOT_ACCOUNTS  (default ~/.starknet_accounts/stakewars_survivor_bots.json)
 *   --rpc URL        SURVIVOR_BOT_RPC       Starknet RPC for `check` and for choosing a signature format
 *   --min N          SURVIVOR_BOT_MIN       the lowest score to submit (default 600)
 *   --max N          SURVIVOR_BOT_MAX       the highest score to submit (default 1600)
 *   --min-bots N     SURVIVOR_BOT_MIN_BOTS  the fewest bots that play a round (default 1)
 *   --max-bots N     SURVIVOR_BOT_MAX_BOTS  the most bots that play a round (default 6)
 *
 * The accounts file is a JSON array of
 *   { "address": "0x…", "privateKey": "0x…", "wallet": "outis" | "ready" | "braavos" }
 * and must be readable by its owner only (mode 0600). The bot never prints a key.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomInt } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ec, RpcProvider, typedData, type TypedData } from 'starknet';
import {
  planRun,
  STYLES,
  type PlayedRun,
} from '../src/game/survivors/bot/play';
import { botsPerRound, botsToPlay } from '../src/game/survivors/bot/rotation';
import { SIM_HZ } from '../src/game/survivors/sim';

type WalletName = 'outis' | 'ready' | 'braavos';
interface BotAccount {
  address: string;
  privateKey: string;
  wallet: WalletName;
}

// The connector ID the browser reports, which picks the board's wallet icon.
// The API reads Outis from the account class instead.
const WALLET_IDS: Record<WalletName, string> = {
  outis: 'outis',
  ready: 'argentX',
  braavos: 'braavos',
};

// The Outis wallet account class the API checks for (apps/api/internal/starknet/survivor.go).
const OUTIS_CLASS = BigInt(
  '0xeb49f5299d144f0b2e434e483758fb6d7d8241632534d86b098047fe4e2b42'
);

/** Don't start a run this close to the round's deadline. Runs last up to about fifteen minutes. */
const DEADLINE_MARGIN_MS = 30 * 60_000;
/** Tickets to try before giving up on one account this cycle. */
const TICKETS_PER_RUN = 12;

// ---------- options ----------

function option(name: string, env: string, fallback?: string) {
  const index = process.argv.indexOf('--' + name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return process.env[env] || fallback;
}
const flag = (name: string) => process.argv.includes('--' + name);

const API = (
  option('api', 'SURVIVOR_BOT_API', 'https://stakewars.fly.dev') as string
).replace(/\/$/, '');
const ACCOUNTS_FILE = option(
  'accounts',
  'SURVIVOR_BOT_ACCOUNTS',
  `${homedir()}/.starknet_accounts/stakewars_survivor_bots.json`
) as string;
const RPC = option('rpc', 'SURVIVOR_BOT_RPC');
const MIN = Number(option('min', 'SURVIVOR_BOT_MIN', '600'));
const MAX = Number(option('max', 'SURVIVOR_BOT_MAX', '1600'));
const MIN_BOTS = Number(option('min-bots', 'SURVIVOR_BOT_MIN_BOTS', '1'));
const MAX_BOTS = Number(option('max-bots', 'SURVIVOR_BOT_MAX_BOTS', '6'));

const log = (message: string) =>
  console.log(`${new Date().toISOString()} ${message}`);
const short = (address: string) =>
  address.slice(0, 6) + '…' + address.slice(-4);

// ---------- accounts ----------

function loadAccounts(): BotAccount[] {
  const mode = statSync(ACCOUNTS_FILE).mode;
  if (mode & 0o077)
    throw new Error(
      `${ACCOUNTS_FILE} must be readable by its owner only. Run chmod 600 on it.`
    );
  const raw: unknown = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0)
    throw new Error(`${ACCOUNTS_FILE} must hold a non-empty JSON array.`);
  return raw.map((entry, index) => {
    const { address, privateKey, wallet } = entry as Partial<BotAccount>;
    if (
      typeof address !== 'string' ||
      !/^0x[0-9a-fA-F]{1,64}$/.test(address) ||
      typeof privateKey !== 'string' ||
      !/^0x[0-9a-fA-F]{1,64}$/.test(privateKey) ||
      !wallet ||
      !(wallet in WALLET_IDS)
    )
      // Name the entry by position only, so a key never reaches the log.
      throw new Error(
        `Account ${index + 1} in ${ACCOUNTS_FILE} needs a hex address, a hex privateKey and a wallet of outis, ready or braavos.`
      );
    return { address: '0x' + BigInt(address).toString(16), privateKey, wallet };
  });
}

// ---------- signing ----------

type Format = 'concise' | 'argent';

/** The signature in the shape the account's is_valid_signature reads. */
function sign(account: BotAccount, hash: string, format: Format): string[] {
  const { r, s } = ec.starkCurve.sign(hash, account.privateKey);
  const hex = (n: bigint) => '0x' + n.toString(16);
  if (format === 'concise') return [hex(r), hex(s)];
  // Argent 0.4 and later: one Starknet signer, as [count, variant, pubkey, r, s].
  return [
    '0x1',
    '0x0',
    ec.starkCurve.getStarkKey(account.privateKey),
    hex(r),
    hex(s),
  ];
}

const VALID = new Set([BigInt('0x56414c4944'), 1n]); // 'VALID', or 1 on older accounts

/** Ask the account itself, as the API does, whether a signature is valid. */
async function validOnchain(
  provider: RpcProvider,
  account: BotAccount,
  hash: string,
  signature: string[]
) {
  try {
    const result = await provider.callContract({
      contractAddress: account.address,
      entrypoint: 'is_valid_signature',
      calldata: [hash, String(signature.length), ...signature],
    });
    return result.length > 0 && VALID.has(BigInt(result[0]));
  } catch {
    return false;
  }
}

async function chooseFormat(account: BotAccount, data: TypedData) {
  const formats: Format[] = ['concise', 'argent'];
  if (!RPC) return formats;
  const provider = new RpcProvider({ nodeUrl: RPC });
  const hash = typedData.getMessageHash(data, account.address);
  for (const format of formats)
    if (
      await validOnchain(provider, account, hash, sign(account, hash, format))
    )
      return [format];
  throw new Error(
    `${short(account.address)} rejects both signature formats. Check its key.`
  );
}

// ---------- API ----------

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: number
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  body?: unknown,
  token?: string
): Promise<T> {
  const response = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const problem = (await response.json()) as {
        detail?: string;
        title?: string;
      };
      detail = problem.detail || problem.title || detail;
    } catch {
      // Not JSON; keep the status.
    }
    throw new HttpError(
      `${path}: ${detail}`,
      response.status,
      Number(response.headers.get('Retry-After')) || 2
    );
  }
  return (await response.json()) as T;
}

interface BoardEntry {
  wallet?: string;
  guest?: string;
  destroyed: number;
}
interface Board {
  network: string;
  round: { id: number; deadline: string; closed: boolean } | null;
  entries: BoardEntry[];
}
const board = () => request<Board>('/v1/survivors/leaderboard');
const ticket = () =>
  request<{ token: string; seed: number }>('/v1/survivors/runs', {});

async function signIn(account: BotAccount) {
  let formats: Format[] | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const challenge = await request<{
      challengeId: string;
      walletAddress: string;
      typedData: TypedData;
    }>('/v1/auth/challenges', {
      walletAddress: account.address,
      scope: 'survivor',
    });
    formats ??= await chooseFormat(account, challenge.typedData);
    const format = formats[attempt];
    if (!format) break;
    const hash = typedData.getMessageHash(
      challenge.typedData,
      challenge.walletAddress
    );
    try {
      const session = await request<{ token: string }>('/v1/auth/sessions', {
        challengeId: challenge.challengeId,
        walletAddress: challenge.walletAddress,
        signature: sign(account, hash, format),
      });
      return session.token;
    } catch (error) {
      lastError = error;
      if (!(error instanceof HttpError) || error.status >= 500) throw error;
    }
  }
  throw lastError ?? new Error(`${short(account.address)} could not sign in.`);
}

/** Submit a finished run, waiting out the API's single verifier when busy. */
async function finish(
  session: string,
  token: string,
  played: PlayedRun,
  account: BotAccount
) {
  const body = {
    token,
    replay: Buffer.from(played.replay).toString('base64'),
    walletId: WALLET_IDS[account.wallet],
  };
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<{ destroyed: number; run: number }>(
        '/v1/survivors/runs/finish',
        body,
        session
      );
    } catch (error) {
      const busy =
        error instanceof HttpError &&
        (error.status === 503 || error.status === 429);
      if (!busy || attempt >= 20) throw error;
      // Back off well past Retry-After so players keep the verifier first.
      await sleep((error.retryAfter + 3 + randomInt(10)) * 1000);
    }
  }
}

// ---------- commands ----------

async function check() {
  const accounts = loadAccounts();
  if (!RPC) throw new Error('check needs --rpc or SURVIVOR_BOT_RPC.');
  const provider = new RpcProvider({ nodeUrl: RPC });
  // Any SNIP-12 message works for the test; nothing is sent to the API.
  const data: TypedData = {
    types: {
      StarknetDomain: [
        { name: 'name', type: 'shortstring' },
        { name: 'version', type: 'shortstring' },
        { name: 'chainId', type: 'shortstring' },
        { name: 'revision', type: 'shortstring' },
      ],
      Check: [{ name: 'Nonce', type: 'felt' }],
    },
    primaryType: 'Check',
    domain: {
      name: 'Survivor bot check',
      version: '1',
      chainId: await provider.getChainId(),
      revision: '1',
    },
    message: { Nonce: String(Date.now()) },
  };
  let failures = 0;
  for (const account of accounts) {
    const label = `${account.wallet.padEnd(7)} ${account.address}`;
    let classHash: string;
    try {
      classHash = await provider.getClassHashAt(account.address);
    } catch {
      failures++;
      log(
        `${label} NOT DEPLOYED: no account contract at this address on this network`
      );
      continue;
    }
    const outis = BigInt(classHash) === OUTIS_CLASS;
    const kind =
      account.wallet === 'outis' && !outis
        ? ' (WARNING: not an Outis account class, so the board will not show it as Outis)'
        : account.wallet !== 'outis' && outis
          ? ' (note: this is an Outis account, and the board will show it as Outis)'
          : '';
    const hash = typedData.getMessageHash(data, account.address);
    const found: Format[] = [];
    for (const format of ['concise', 'argent'] as Format[])
      if (
        await validOnchain(provider, account, hash, sign(account, hash, format))
      )
        found.push(format);
    if (!found.length) failures++;
    log(
      `${label} ` +
        (found.length
          ? `signs (${found.join(', ')})${kind}`
          : 'REJECTED: the key does not sign for this account. It may be the wrong key, or the account needs a guardian or 2FA signature.')
    );
  }
  if (failures) process.exitCode = 1;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function play() {
  const accounts = loadAccounts();
  const dryRun = flag('dry-run');
  const runs = Number(option('runs', 'SURVIVOR_BOT_RUNS', '1'));
  const current = await board();
  if (!current.round || current.round.closed)
    return log('No open round. Nothing to do.');
  const deadline = Date.parse(current.round.deadline);
  if (deadline - Date.now() < DEADLINE_MARGIN_MS)
    return log(`Round ${current.round.id} closes too soon. Nothing to do.`);

  const posted = new Set(
    current.entries.flatMap((e) =>
      e.wallet ? ['0x' + BigInt(e.wallet).toString(16)] : []
    )
  );
  if (!(MIN_BOTS >= 0 && MAX_BOTS >= MIN_BOTS))
    throw new Error(
      '--min-bots and --max-bots must be numbers with min no more than max.'
    );
  if (!(MIN >= 0 && MAX >= MIN))
    throw new Error(
      '--min and --max must be numbers with min no more than max.'
    );
  // Only a few bots play each round, and which ones rotates by round. Each
  // one aims for its own slice of the score range.
  const count = botsPerRound(current.round.id, MIN_BOTS, MAX_BOTS);
  const waiting = botsToPlay(accounts, current.round.id, posted, {
    minBots: MIN_BOTS,
    maxBots: MAX_BOTS,
    min: MIN,
    max: MAX,
  });
  log(
    `Round ${current.round.id}: ${current.entries.length} on the board. ` +
      `${count} of ${accounts.length} bot wallets play this round, ${waiting.length} still to play.`
  );

  for (const { bot: account, min, max } of waiting.slice(0, runs)) {
    let played: PlayedRun | null = null;
    let token = '';
    let started = 0;
    let seed = 0;
    for (let tries = 0; tries < TICKETS_PER_RUN && !played; tries++) {
      const t = dryRun
        ? { token: '', seed: randomInt(2 ** 31) }
        : await ticket();
      started = Date.now();
      token = t.token;
      seed = t.seed;
      // Try the styles in a random order, so builds vary across the board.
      played = planRun(t.seed, min, max, shuffle(STYLES), randomInt(2 ** 31));
    }
    if (!played) {
      log(
        `${short(account.address)}: no run ended between ${min} and ${max} in ${TICKETS_PER_RUN} tries. Skipping.`
      );
      continue;
    }
    log(
      `${short(account.address)} (${account.wallet}): planned ${played.destroyed} destroyed (band ${min}–${max}) in ` +
        `${played.durationSeconds}s (${played.style.policy} upgrades, ${played.style.stance} stance).`
    );
    if (dryRun) {
      const dir = option('save', 'SURVIVOR_BOT_SAVE');
      if (dir) writeFileSync(`${dir}/${seed}.bin`, played.replay);
      continue;
    }

    // The API refuses a replay sent faster than real time. Wait out the run,
    // plus the few seconds a player spends on the results screen.
    const ready =
      started + (played.ticks / SIM_HZ) * 1000 + (5 + randomInt(40)) * 1000;
    await sleep(Math.max(0, ready - Date.now()));

    const latest = await board();
    if (latest.round?.id !== current.round.id || latest.round.closed) {
      log('The round closed while the run played. Not submitting.');
      return;
    }
    const session = await signIn(account);
    let result;
    try {
      result = await finish(session, token, played, account);
    } catch (error) {
      if (error instanceof HttpError && error.status === 422)
        throw new Error(
          `The API rejected the replay. Its Survivor sim probably differs from this build; rebuild the bot from the deployed commit. (${error.message})`
        );
      throw error;
    }
    log(
      `${short(account.address)}: recorded run ${result.run} with ${result.destroyed} destroyed.`
    );
  }
}

const command = process.argv[2];
const commands: Record<string, () => Promise<unknown>> = { check, play };
if (!command || !commands[command]) {
  console.error(
    'Usage: survivor-bot <check|play> [--runs N] [--dry-run] [--api URL] [--accounts FILE] [--rpc URL]'
  );
  process.exit(64);
}
commands[command]().catch((error: unknown) => {
  log(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
