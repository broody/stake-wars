# Core Survivors house bot

The house bot keeps a few wallets on the Core Survivors daily board. It plays
real ranked runs with the balance bot's pilot, records them as the same
replay the browser sends, and submits them through the public API. The API
verifies them like any other run.

## Scores and the prize

The bot submits only runs that end with between 600 and 1,600 enemies
destroyed (`--min` and `--max`). Each bot in a round aims for its own slice of
that range, so the bots' scores spread across the board instead of bunching
together.

Every run is real play. The bot always plays to survive, and it dies only
when the Legion overwhelms it, so its death replay shows a real defeat. It
reaches the range by choice of run, not by throwing one:

- It plays four styles: greedy or random upgrades, with an engaging or a
  kiting stance. Its natural runs mostly end between 600 and 1,700, and any
  one slice of the range catches about one run in eight.
- For each run ticket, it tries the styles in random order and keeps the
  first run that ends in its slice. If none does, it takes a new ticket, up
  to twelve.
- It scores every replay with the verifier's own code before sending it.

Runs in range last about four to twelve minutes. The bot waits that long before
submitting, because the API refuses replays sent faster than real time.

Bot wallets are ordinary signed wallets. A bot that tops the daily board wins
the 100 STRK prize like anyone else. Past winners scored 2,825 and 2,353, but
on a quiet day a bot will often win.

## Which bots play

Between one and six bots play each round, so some days the board has one bot
and others has all six. Each count is about equally likely, and the set rotates
from round to round (`--min-bots` and `--max-bots`). The choice depends only on the round ID
and the bot addresses, so every timer firing in a round agrees on the same
set. A bot already on the board uses up one of the round's places, so a round
never has more bots than its count.

The score range is split into one equal slice per bot in the round, and the
slices are dealt out by a second hash of the round ID, so a different wallet
tends to score highest each day. The outer tenth of each slice is left empty,
so no two bots' scores are ever close. With the default range they are at
least 50 apart with four bots and at least 33 apart with six. A lone bot aims
for 700–1,500.

## What one cycle does

1. Reads the open round. It stops if the round closes within 30 minutes.
2. Picks this round's bots that have no score yet, up to `--runs`.
3. For each one, takes a run ticket, finds a run that ends in range, and
   waits out the run's real play time.
4. Signs in with the wallet's key (the same SNIP-12 challenge a browser wallet
   signs) and submits the replay. When the API's single verifier is busy, it
   backs off well past `Retry-After`, so players keep priority.

## Accounts file

A JSON array, readable by its owner only (`chmod 600`). The bot refuses a file
other users can read, and it never prints a key.

```json
[
  { "address": "0x…", "privateKey": "0x…", "wallet": "outis" },
  { "address": "0x…", "privateKey": "0x…", "wallet": "ready" },
  { "address": "0x…", "privateKey": "0x…", "wallet": "braavos" }
]
```

`wallet` picks the icon on the board. The API reads Outis from the account
class, so an `outis` entry shows as Outis only if the account really is one.
Each account must sign with its Stark key alone. An account with an Argent
guardian or 2FA cannot. Signing a sign-in message costs no gas, so the
accounts need no STRK.

## Build

From `apps/web`:

```bash
pnpm build:survivor-bot
```

This writes `apps/web/bot-dist/survivor-bot.cjs`, one file holding the bot,
the game sim and starknet.js. Build it from the commit the API is running.
If the API's sim changes, the API rejects the bot's replays with HTTP 422
until you rebuild and copy the new bundle.

## Commands

```bash
node survivor-bot.cjs check --rpc URL            # test each key against its account; submits nothing
node survivor-bot.cjs play --dry-run --save DIR  # plan runs without a ticket or submission
node survivor-bot.cjs play --runs 2              # play and submit
```

`--api`, `--accounts`, `--rpc`, `--min` and `--max` also read
`SURVIVOR_BOT_API`, `SURVIVOR_BOT_ACCOUNTS`, `SURVIVOR_BOT_RPC`,
`SURVIVOR_BOT_MIN` and `SURVIVOR_BOT_MAX`.

## Install on the validator VPS

The VPS has Docker but no Node, so the bot runs in a stock `node:22-slim`
container. It uses the host network to reach Pathfinder on `127.0.0.1:9545`.
The container is read-only, has no capabilities and is limited to 384 MB.

```bash
ssh root@VPS 'install -d -m 755 /opt/survivor-bot && install -d -m 700 /etc/survivor-bot'
scp apps/web/bot-dist/survivor-bot.cjs root@VPS:/opt/survivor-bot/
scp scripts/survivor-bot/survivor-bot.{service,timer} root@VPS:/etc/systemd/system/
# Write /etc/survivor-bot/accounts.json on the VPS itself, then chmod 600 it.
ssh root@VPS 'docker run --rm --network host -v /opt/survivor-bot/survivor-bot.cjs:/bot/b.cjs:ro -v /etc/survivor-bot/accounts.json:/bot/a.json:ro node:22-slim node /bot/b.cjs check --accounts /bot/a.json --rpc http://127.0.0.1:9545/rpc/v0_9'
ssh root@VPS 'systemctl daemon-reload && systemctl enable --now survivor-bot.timer'
```

Watch it with `journalctl -u survivor-bot`. Stop it with
`systemctl disable --now survivor-bot.timer`.
