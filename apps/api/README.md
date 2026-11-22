# Stake Wars API

The Go API owns wallet authentication, off-chain image metadata, and optional
permissionless maintenance. Sector captures, instant takeovers, and all winner
decisions are handled directly by the Dojo World. When the keeper is enabled,
the API holds only a dedicated unprivileged signing key and a small fee balance;
it never holds game funds, prize assets, admin roles, or encryption keys. Image
bytes are uploaded directly to Tigris rather than passing through this service.

## Local development

From the repository root:

```bash
pnpm dev:api
```

For the complete local Sepolia Beacon rehearsal, run Torii and the API, then
launch the web app with its local API override:

```bash
pnpm dev:torii
pnpm dev:api
pnpm dev:web:e2e
```

The launcher reads `VITE_BEACON_SYSTEM_ADDRESS` from `apps/web/.env.sepolia`
as `BEACON_SYSTEM_ADDRESS`. When it is empty, the API still serves the
preserved controller, transmission, and history and reports that no round is
open.

The service defaults to `http://localhost:8080` and stores local data in
`./stakewars.db` relative to `apps/api`. The repository launcher reads the
shared Sepolia RPC and Control System from `apps/web/.env.sepolia` and connects
to the running `stakewars-minio` Docker container. That container must expose
its S3 API on port 9000 and contain the public `stakewars-art` bucket. MinIO
credentials are read directly from the container environment and are never
written to the repository or printed.

Run the Sepolia Torii indexer separately from the repository root:

```bash
pnpm dev:torii
```

Torii listens on `127.0.0.1:8081`, persists its rebuildable index under
`contracts/.torii/sepolia`, and starts at the World deployment block. The
launcher enables debug output and mirrors timestamped logs under
`contracts/.torii/logs/`. In addition to the Stake Wars World, the Sepolia
configuration indexes raw events from the staking pool.

## Beacon auction

The Beacon is an open ascending auction run by the Dojo Beacon System. Bids,
the leader, the deadline, and the winner are public onchain state, so the API
never learns a winner from an off-chain party. `GET /v1/beacon` reads the
current round and its exact minimum next bid through direct Starknet RPC and
reports the chain timestamp as `observedAt`.

Settlement opens the next round in the same transaction, so every round below
the current one is settled and has a winner. Before answering, the API copies
any newly settled round into `beacon_controllers`; the periodic worker does the
same. Artwork authorization and completion both re-run that projection and
fail closed when the chain cannot be read, so a replaced controller cannot
publish. Rounds imported from the Whisper era keep `source = 'whisper'`; the
projector refuses to run when the Beacon System's first round would overlap
them.

With `BEACON_KEEPER_ENABLED=true`, the keeper submits the permissionless
`settle_beacon_auction` call once the chain clock passes the deadline. Anyone
else, including the winner, can submit the same call.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Enables production-only origin defaults when set to `production`. |
| `PORT` | `8080` | HTTP listen port. |
| `DATABASE_PATH` | `./stakewars.db` | SQLite database path. Production uses `/data/stakewars.db`. |
| `STARKNET_RPC_URL` | unset | Starknet JSON-RPC endpoint used for wallet signature verification and authoritative reads. |
| `STARKNET_CHAIN_ID` | `SN_MAIN` | SNIP-12 authentication domain and public network identifier. |
| `TORII_URL` | unset | Internal Torii HTTP origin. Production uses `http://127.0.0.1:8081`. |
| `TORII_STAKING_POOL_ADDRESS` | unset | Stake Wars delegation pool. Derives cached public staking statistics and, with `STARKNET_RPC_URL`, enables the network staking index, which resolves the staking contract and featured validator from this pool. |
| `BEACON_SYSTEM_ADDRESS` | unset | Deployed Dojo Beacon System. Requires `STARKNET_RPC_URL`. Unset reports no open round while still serving the preserved controller and history. |
| `BEACON_KEEPER_ENABLED` | `false` | Automatically settle expired Beacon rounds using the existing SupplyDrop keeper signer. Requires all three SupplyDrop keeper variables and `BEACON_SYSTEM_ADDRESS`. |
| `MAX_IMAGE_BYTES` | `2097152` | Maximum encoded image size. |
| `AUTH_CHALLENGE_TTL` | `5m` | Lifetime of a single-use wallet challenge. |
| `AUTH_SESSION_TTL` | `15m` | Lifetime of an API bearer session. |
| `ALLOWED_ORIGINS` | production domains plus localhost in development | Comma-separated exact browser origins allowed by CORS. |
| `CONTROL_SYSTEM_ADDRESS` | unset | Deployed Dojo Control System used for image ownership verification. With the keeper configured, it also enables Operator synchronization: every minute the keeper submits `sync_operators` for Operators the chain reports as out of sync, such as one who unpooled outside the game. |
| `SUPPLY_DROP_SYSTEM_ADDRESS` | unset | Deployed Dojo SupplyDrop System. Configuring this enables the periodic keeper. |
| `SUPPLY_DROP_KEEPER_ACCOUNT_ADDRESS` | unset | Dedicated unprivileged Starknet account used to pay for permissionless maintenance calls. Shared by SupplyDrop, Beacon, and Operator synchronization duties. |
| `SUPPLY_DROP_KEEPER_PRIVATE_KEY` | unset | Private key for the dedicated keeper account. Configure only as a server secret. |
| `IMAGE_BUCKET` | unset | S3-compatible bucket that stores Sector image objects. |
| `IMAGE_PUBLIC_URL` | unset | Public CDN origin for image delivery, such as `https://assets.stakewars.gg`. |
| `S3_ENDPOINT` | unset | S3-compatible API endpoint, such as `https://fly.storage.tigris.dev`. |
| `AWS_REGION` | `auto` | S3 signing region used by the object store. |
| `AWS_ACCESS_KEY_ID` | unset | Object-store write credential; configure as a secret. |
| `AWS_SECRET_ACCESS_KEY` | unset | Object-store write credential; configure as a secret. |

`STARKNET_RPC_URL` and `SUPPLY_DROP_KEEPER_PRIVATE_KEY` should be supplied as Fly
secrets rather than committed to the repository. The three SupplyDrop keeper
variables are configured together for SupplyDrop maintenance. A payout-only Survivor deployment uses the same signer and leaves the SupplyDrop system unset. At startup, the API derives the public key from the
private key and verifies it against the configured account contract before the
worker begins. The keeper runs every 20 seconds, locks expired active rounds,
and settles drawing rounds only after the contract's block-hash availability
delay has elapsed.

SupplyDrop lock and settlement calls share one signer and nonce lock. Before
broadcast, the signer persists the locally computed transaction hash in SQLite,
then waits for an accepted receipt. A timeout or lost RPC response keeps that
hash pending; startup restores it and maintenance checks its receipt before
further sends. Completion is followed by a fresh onchain state read. Explicitly
rejected transactions can be retried on later passes with a new attempt record.

Keep the dedicated account funded with STRK for fees and monitor maintenance
error logs. Manual locking and settlement remain available when the keeper is
delayed or disabled. Sector captures and takeovers complete in the player's own
transaction, so the keeper has no capture or takeover duty.

When `CONTROL_SYSTEM_ADDRESS` is also set, a separate one-minute pass lists the
unretired Operators indexed by Torii, reads each one's live status from the
Control System, and submits `sync_operators` only for those the chain reports
as out of sync. This retires an Operator who unpooled outside the game, which
releases their Sectors and hides their artwork. An idle pass sends nothing.

Local API runs must use the shared Sepolia deployment and a Sepolia keeper;
never inject the production signing key into a local frontend or demo.

## Durable transaction diagnostics

Migration `011_transaction_journal.sql` adds `transaction_attempts` and
`transaction_attempt_events` to the existing application database. Keeper
Supply Drop and Beacon settlement calls record an attempt before
submitting work. Each attempt retains its network, source, signer (for
local submissions), contract, entrypoint, target, timestamps, transaction hash
when known, and status. Events append the lifecycle stage, receipt block, RPC
code, message, and bounded diagnostic data. A successful retry never overwrites
an earlier attempt's failure.

The database uses WAL and `synchronous=FULL`; failure to persist broadcast intent
prevents the keeper from sending. Diagnostic writes have a separate bounded
context so request cancellation does not discard the error. Signed requests,
calldata, signing keys, credentials, and proof material are excluded. Existing
rows and logs are not backfilled or rewritten. These records share the existing
SQLite volume and its backup lifecycle; keep that database intact.

The keeper treats an uncertain broadcast as `unknown`, not as a failed send.
It keeps checking the saved hash after a restart and does not automatically
replace or resubmit that transaction. A hash that remains absent from the chain
requires operator investigation; no timeout proves it was never accepted.
An interrupted pre-broadcast preparation is safe to retry. This assumes one API
process and exclusive use of its dedicated keeper account.

Inspect journal metadata with the read-only command (included in the API image):

```sh
# Run inside the API container, or supply the path to an existing local database.
stakewars-transaction-history --db /data/stakewars.db --limit 20
stakewars-transaction-history --db /data/stakewars.db --target 7
stakewars-transaction-history --db /data/stakewars.db --attempt 123
```

The JSON report reads only the two journal tables, never mutates the database,
and includes up to 100 recent events per attempt alongside its full event count.
Times are Unix seconds. Local development can use
`go run ./cmd/transaction-history --db <path>` from `apps/api`.

## Current endpoints

```text
GET  /healthz
GET  /readyz
GET  /v1/config
GET  /v1/stats
GET  /v1/staking
GET  /v1/staking/history
GET  /v1/beacon
GET  /v1/beacon/history
GET  /torii/health
POST /torii/graphql
POST /v1/auth/challenges
POST /v1/auth/sessions
GET  /v1/sector-artworks
POST /v1/sector-artworks/uploads
POST /v1/sector-artworks/uploads/{uploadId}/complete
POST /v1/beacon/artwork/uploads
POST /v1/beacon/artwork/uploads/{uploadId}/complete
```

`GET /v1/staking` serves the network staking snapshot: validators, per-token
totals, APR, the current epoch, pending exits and their unlock schedule, and the
featured Stake Wars validator. `GET /v1/staking/history` lists daily totals at
each UTC day's last block, ending with the live observation. Both return `503`
until the first snapshot is built. A dedicated worker indexes the official
staking contract's events and delegation-pool member balances into rebuildable
`staking_*` tables, resuming a backfill from its saved continuation token. The
first backfill reads every staking event since launch and takes several
minutes; the index can be rebuilt by deleting the `staking_*` rows.

Image uploads are enabled only when all object-storage settings are present.
The browser preserves the source aspect ratio while fitting each
camera-projected artwork into one 256 px atlas image and one 512 px detail
image, obtains
object-specific five-minute PUT URLs, uploads both objects directly to storage,
and calls the completion endpoint. Completion downloads only those bounded
objects for signature, MIME, dimensions, and size validation, rechecks current
on-chain ownership for every target, and publishes generation-bound target
metadata with the captured camera and placement transform.

A Beacon controller may publish exactly one transmission during its
control term. The upload authorization binds a required plain-text description
and absolute HTTP(S) destination URL to the image; completion rechecks current
control and atomically locks the controller's publication slot.

The image bucket must allow public `GET` requests and browser `PUT` CORS from
the configured Stake Wars origins, including the `Content-Type` request header.
Keep object-store write credentials in Fly secrets; they never belong in the
frontend environment or repository.

Production runs the API and pinned Torii 1.8.0 binary under one supervised
container on the existing Fly Machine. They use separate SQLite databases on
the `/data` volume. Only Torii health and GraphQL are reverse-proxied; raw SQL,
gRPC, and relay ports remain private. `/readyz` checks both the application
database and Torii.

The Torii process is constrained to one query thread, one indexer thread, a
32 MiB SQLite cache, eight read connections, and a 320 MiB hard SQLite memory
limit so the initial deployment can share the 512 MiB Machine. If memory or
index lag becomes material, move Torii to its own Machine instead of scaling the
SQLite-backed API above one active Machine.

Authentication uses server-generated SNIP-12 typed data. The API verifies the
signature through the wallet account contract's `is_valid_signature` entrypoint.
Challenges expire quickly and are consumed atomically to prevent replay. The
public configuration endpoint exposes image policy and network information so
the frontend does not hard-code them.

## Survivor prize rounds

The existing API serves the Survivor leaderboard from the application SQLite
database. Each operator-opened round belongs to one network. To open a round,
run the following inside the API environment with its existing database path
and chain ID. The default deadline is the next 10:00 p.m. EST (03:00 UTC,
fixed year-round).

```sh
stakewars-survivor-round
```

Web, iOS and Android clients use the same HTTP API. The public endpoint
`GET /v1/survivors/leaderboard` shows the latest round and the top 100 players. Use `?scope=all` for all-time standings, including runs finished between rounds.
Each entry includes `destroyed`, whole seconds of simulated play in
`durationSeconds`, and an ordered `upgrades` array with the name, kind and
applicable level of each awarded upgrade. A tied or lower score preserves the
earlier best run. Older scores have null details, while an empty array means a
verified run earned zero upgrades.
Use `?round=ID` to retrieve an earlier round. To override the default when
opening a round, pass `-deadline` with an RFC3339 timestamp. Successive prize
deadlines must be at least 24 hours apart.
Starting a run is public. Submitting a score requires a wallet-authenticated Survivor session. Historical guest entries keep their hashed public identifiers. Display names may repeat.

| Endpoint | Request and result |
| --- | --- |
| `POST /v1/survivors/runs` | Send `{}` to get a signed ticket and simulation seed. The API selects the open prize round, if any. |
| `POST /v1/survivors/runs/finish` | Send `{token, replay}` with a signed Survivor bearer session at game over. Replay is base64-encoded input from the shared simulation. Retry the same ticket with the same wallet after a transient failure. |
| `POST /v1/survivors/runs/wallet` | Send `{token, guestId}` with a signed Survivor bearer session to attach one previously recorded guest run to that wallet. Prize-round runs can be attached until the round closes. |
| `POST /v1/survivors/profile` | Send `{guestId}` to read a guest name. Include `name` to set it. An unset name is returned as an empty string. |
| `GET /v1/survivors/profile?wallet=ADDRESS` | Read a wallet name. An unnamed wallet appears by its shortened address on the leaderboard. |
| `POST /v1/survivors/profile/wallet` | Send `{wallet, name}` for SNIP-12 typed data and its revision. Sign and resend the same fields with `revision` and `signature`. A newer revision supersedes old signatures. |

Clients rank by the best verified run for each player, breaking ties by first
recording. The API stores each verified wallet submission, including lower scores. Runs
verified after their starting round closes count towards all-time standings.
The prize tie goes to the first verified Outis account to register that score.

The API checks the
deployed class of each submitting account against Outis Wallet's account class
list. A closed round's `winner` is the highest-scoring Outis wallet. A round
with no eligible scores closes without a payout. At every cutoff the API opens a
fresh 100 STRK round, whether or not the closed round had a winner. The new
round starts with empty standings and the next eligible 03:00 UTC
deadline. After downtime it opens the current contest once. Earlier rounds
remain available by ID. Each new daily round records a fixed
prize of 100 STRK (100000000000000000000 base units). Existing rounds retain
the prize amount recorded when they opened.

The winner does not claim the prize. Two minutes after the deadline, the
payout duty sends the round's prize to the winning wallet. The delay lets a run
that was verified just before the deadline finish committing before the winner
is read. The Outis check happens when the score is submitted. The payout does
not check the account class again. The leaderboard reports the payment status
and the transaction hash.

To enable payouts in a deployment, set `SURVIVOR_PAYOUTS_ENABLED=true` with
the existing funded keeper signer and Starknet RPC configured for that network.
With `SUPPLY_DROP_SYSTEM_ADDRESS` unset, only the Survivor payout duty uses the signer. The keeper account supplies the prize and network fees. Its existing nonce lock
and SQLite transaction journal are shared with the other duties. The worker
records the transfer hash before broadcasting and reconciles uncertain receipts
before another attempt. The duty pays one round per tick, oldest first. When
payouts are first enabled, it also pays every earlier closed round that has a
winner and no payment yet. Keep the keeper account funded with enough STRK for
every prize it owes plus fees.

The normal API build (`pnpm --filter @stakewars/api build`) bundles the web
simulation into the API Docker context. Build the frontend and API from the same
gameplay revision and release balance changes between prize rounds. A single
memory-limited Node process replays each submitted run outside SQLite transactions.
