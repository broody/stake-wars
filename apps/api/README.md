# Stake Wars API

The Go API owns wallet authentication, off-chain image metadata, and optional
permissionless maintenance. Open Challenges and all winner decisions are
handled directly by the Dojo World. When the keeper is enabled, the
API holds only a dedicated unprivileged signing key and a small fee balance;
it never holds game funds, prize assets, admin roles, or encryption keys. Image
bytes are uploaded directly to Tigris rather than passing through this service.

## Local development

From the repository root:

```bash
pnpm dev:api
```

For the complete local Sepolia Beacon rehearsal, keep Torii and the Whisper
operator running, bootstrap the first round explicitly, and launch the web app
with its local API/operator overrides:

```bash
pnpm dev:torii
pnpm dev:whisper
pnpm dev:api
pnpm beacon:bootstrap
pnpm dev:web:e2e
```

The API and operator launchers read the same coordinator token from
`~/.starknet_accounts/whisper/coordinator_token`. It must be a regular
owner-only (`0600`) file containing at least 32 characters. Signing and viewing
keys remain in the Whisper operator's existing owner-only manifests and are
never loaded by the Go API.

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
configuration indexes raw events from the staking pool and the active Whisper
deployment. Those events remain available for indexed inspection, but Torii is
not authoritative for Beacon control or history. The API reconciles each
canonical round from Whisper's onchain auction and result views through direct
Starknet RPC.

After a direct-RPC result reports a winner, the API makes a server-to-server
authenticated request to the Whisper operator's
`GET /v1/auctions/{auctionId}/winner` endpoint. The operator decrypts and
revalidates only the winning capsule and returns its committed wallet address.
The API verifies the disclosed group and winner commitment against the onchain
result before atomically activating the controller. Torii lag therefore cannot
leave the previous winner in control.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Enables production-only origin defaults when set to `production`. |
| `PORT` | `8080` | HTTP listen port. |
| `DATABASE_PATH` | `./stakewars.db` | SQLite database path. Production uses `/data/stakewars.db`. |
| `STARKNET_RPC_URL` | unset | Starknet JSON-RPC endpoint used for wallet signature verification and authoritative reads. |
| `STARKNET_CHAIN_ID` | `SN_MAIN` | SNIP-12 authentication domain and public network identifier. |
| `TORII_URL` | unset | Internal Torii HTTP origin. Production uses `http://127.0.0.1:8081`. |
| `TORII_STAKING_POOL_ADDRESS` | unset | Indexed staking pool used to derive cached public staking statistics. |
| `TORII_WHISPER_ADDRESS` | unset | Whisper contract whose raw auction lifecycle events Torii indexes. |
| `TORII_WHISPER_BLOCK` | unset | Whisper deployment block used as the event-indexing start. |
| `BEACON_BIDDING_DURATION` | `72h` | Expected duration for canonical start-on-bid Beacon rounds. Sepolia rehearsal environments currently set this to `5m`. |
| `BEACON_ACCEPTANCE_DURATION` | `15m` | Grace period after bidding for the operator to accept submitted private notes. Local rehearsal uses `3m`. |
| `BEACON_SETTLEMENT_DURATION` | `6h` | Settlement/recovery window after acceptance. Local rehearsal uses `22m`. |
| `BEACON_COORDINATOR_URL` | unset | Whisper operator origin used by recurring auction creation and post-settlement winner resolution. |
| `BEACON_COORDINATOR_TOKEN` | unset | Server-only bearer token for the operator's auction-creation and winner-disclosure endpoints. |
| `BEACON_PAYMENT_TOKEN` | unset | Canonical payment token for newly created Beacon rounds. |
| `BEACON_RESERVE_PRICE` | `100000000000000000` | Reserve in payment-token base units. |
| `BEACON_MAX_BIDS` | `32` | Maximum accepted bid tranches for each round. |
| `BEACON_WINNER_PAYLOAD_DOMAIN` | `STAKEWARS_BEACON_V1` felt | Fixed application domain for opaque winner commitments. |
| `MAX_IMAGE_BYTES` | `2097152` | Maximum encoded image size. |
| `AUTH_CHALLENGE_TTL` | `5m` | Lifetime of a single-use wallet challenge. |
| `AUTH_SESSION_TTL` | `15m` | Lifetime of an API bearer session. |
| `ALLOWED_ORIGINS` | production domains plus localhost in development | Comma-separated exact browser origins allowed by CORS. |
| `CONTROL_SYSTEM_ADDRESS` | unset | Deployed Dojo Control System used for image ownership verification and optional contest settlement. |
| `SUPPLY_DROP_SYSTEM_ADDRESS` | unset | Deployed Dojo SupplyDrop System. Configuring this enables the periodic keeper. |
| `SUPPLY_DROP_KEEPER_ACCOUNT_ADDRESS` | unset | Dedicated unprivileged Starknet account used to pay for permissionless maintenance calls. Shared by SupplyDrop and Challenge duties. |
| `SUPPLY_DROP_KEEPER_PRIVATE_KEY` | unset | Private key for the dedicated keeper account. Configure only as a server secret. |
| `CHALLENGE_KEEPER_ENABLED` | `false` | Automatically settle expired contests using the existing SupplyDrop keeper signer. Requires all three SupplyDrop keeper variables, `CONTROL_SYSTEM_ADDRESS`, `STARKNET_RPC_URL`, and `TORII_URL`. |
| `IMAGE_BUCKET` | unset | S3-compatible bucket that stores Sector image objects. |
| `IMAGE_PUBLIC_URL` | unset | Public CDN origin for image delivery, such as `https://assets.stakewars.gg`. |
| `S3_ENDPOINT` | unset | S3-compatible API endpoint, such as `https://fly.storage.tigris.dev`. |
| `AWS_REGION` | `auto` | S3 signing region used by the object store. |
| `AWS_ACCESS_KEY_ID` | unset | Object-store write credential; configure as a secret. |
| `AWS_SECRET_ACCESS_KEY` | unset | Object-store write credential; configure as a secret. |

`STARKNET_RPC_URL` and `SUPPLY_DROP_KEEPER_PRIVATE_KEY` should be supplied as Fly
secrets rather than committed to the repository. The three SupplyDrop keeper
variables are all-or-none. At startup, the API derives the public key from the
private key and verifies it against the configured account contract before the
worker begins. The keeper runs every 20 seconds, locks expired active rounds,
and settles drawing rounds only after the contract's block-hash availability
delay has elapsed.

Enable `CHALLENGE_KEEPER_ENABLED=true` to settle expired Sector contests in the
same 20-second maintenance loop. The keeper discovers contested Sectors through
paginated Torii queries, then checks each Sector's current challenge ID and
deadline directly onchain. It compares deadlines with the latest block timestamp,
so an incorrect server clock cannot trigger early settlement. Each pass attempts
at most five settlements and rotates through the backlog to avoid starving later
Sectors. Indexer lag, a new challenge, an escalation, or a user settling first
causes stale work to be skipped or rechecked. The contract still determines the
winner and all FORCE accounting; the backend receives no game privileges.

Challenge and SupplyDrop calls share one signer and nonce lock. Before broadcast,
the signer persists the locally computed transaction hash in SQLite, then waits
for an accepted receipt. A timeout or lost RPC response keeps that hash pending;
startup restores it and maintenance checks its receipt before further sends.
Completion is followed by a fresh onchain state read. Explicitly rejected
transactions can be retried on later passes with a new attempt record.

Keep the dedicated account funded with STRK for fees and monitor `Challenge
settled` and maintenance error logs. Manual settlement remains available when
the keeper is delayed or disabled. This duty covers `settle_challenge`;
additional older losing positions still use the separate permissionless
`resolve_challenge_position` entrypoint.

Activation requires a backend deployment with the flag enabled and the existing
keeper secrets configured for that network. Local API runs must use the shared
Sepolia deployment and a Sepolia keeper; never inject the production signing key
into a local frontend or demo. Setting the flag to `false` disables automatic
contest settlement without disabling SupplyDrop maintenance.

## Durable transaction diagnostics

Migration `011_transaction_journal.sql` adds `transaction_attempts` and
`transaction_attempt_events` to the existing application database. Keeper
challenge/Supply Drop calls and Beacon coordinator requests record an attempt
before submitting work. Each attempt retains its network, source, signer (for
local submissions), contract, entrypoint, target, timestamps, transaction hash
when known, and status. Events append the lifecycle stage, receipt block, RPC
code, message, and bounded diagnostic data. A successful retry never overwrites
an earlier attempt's failure. Beacon requests retain their stable request ID to
correlate with the Whisper operator journal.

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
stakewars-transaction-history --db /data/stakewars.db --target 527
stakewars-transaction-history --db /data/stakewars.db --attempt 123
```

The JSON report reads only the two journal tables, never mutates the database,
and includes up to 100 recent events per attempt alongside its full event count.
Times are Unix seconds. Local development can use
`go run ./cmd/transaction-history --db <path>` from `apps/api`.

Whisper is a separate submitting process with its own database. Its journal
covers auction creation, vault registration, acceptance, settlement, aborts,
and rejected-bid refunds. See [operator diagnostics](../../vendor/whisper/operator/README.md#durable-transaction-diagnostics)
for its coverage and recovery limits; the API cannot see RPC errors hidden behind
an operator HTTP response.

## Current endpoints

```text
GET  /healthz
GET  /readyz
GET  /v1/config
GET  /v1/stats
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
