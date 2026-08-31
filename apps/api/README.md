# Stake Wars API

The Go API owns wallet authentication and off-chain image metadata. Open
Challenges and settlement are handled directly by the Dojo World; the API
holds no game funds, encryption keys, settlement key, or STRK. Image bytes are
uploaded directly to Tigris rather than passing through this service.

## Local development

From the repository root:

```bash
pnpm dev:api
```

For the complete local Sepolia Arbiter rehearsal, keep Torii and the Whisper
operator running, bootstrap the first round explicitly, and launch the web app
with its local API/operator overrides:

```bash
pnpm dev:torii
pnpm dev:whisper
pnpm dev:api
pnpm arbiter:bootstrap
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
not authoritative for Arbiter control or history. The API reconciles each
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
| `ARBITER_BIDDING_DURATION` | `72h` | Expected duration for canonical start-on-bid Arbiter rounds. Sepolia rehearsal environments currently set this to `5m`. |
| `ARBITER_ACCEPTANCE_DURATION` | `15m` | Grace period after bidding for the operator to accept submitted private notes. Local rehearsal uses `3m`. |
| `ARBITER_SETTLEMENT_DURATION` | `6h` | Settlement/recovery window after acceptance. Local rehearsal uses `22m`. |
| `ARBITER_COORDINATOR_URL` | unset | Whisper operator origin used by recurring auction creation and post-settlement winner resolution. |
| `ARBITER_COORDINATOR_TOKEN` | unset | Server-only bearer token for the operator's auction-creation and winner-disclosure endpoints. |
| `ARBITER_PAYMENT_TOKEN` | unset | Canonical payment token for newly created Arbiter rounds. |
| `ARBITER_RESERVE_PRICE` | `100000000000000000` | Reserve in payment-token base units. |
| `ARBITER_MAX_BIDS` | `32` | Maximum accepted bid tranches for each round. |
| `ARBITER_WINNER_PAYLOAD_DOMAIN` | Stake Wars v1 felt | Fixed application domain for opaque winner commitments. |
| `MAX_IMAGE_BYTES` | `2097152` | Maximum encoded image size. |
| `AUTH_CHALLENGE_TTL` | `5m` | Lifetime of a single-use wallet challenge. |
| `AUTH_SESSION_TTL` | `15m` | Lifetime of an API bearer session. |
| `ALLOWED_ORIGINS` | production domains plus localhost in development | Comma-separated exact browser origins allowed by CORS. |
| `CONTROL_SYSTEM_ADDRESS` | unset | Deployed Dojo Control System used for image ownership verification. |
| `IMAGE_BUCKET` | unset | S3-compatible bucket that stores Sector image objects. |
| `IMAGE_PUBLIC_URL` | unset | Public CDN origin for image delivery, such as `https://assets.stakewars.gg`. |
| `S3_ENDPOINT` | unset | S3-compatible API endpoint, such as `https://fly.storage.tigris.dev`. |
| `AWS_REGION` | `auto` | S3 signing region used by the object store. |
| `AWS_ACCESS_KEY_ID` | unset | Object-store write credential; configure as a secret. |
| `AWS_SECRET_ACCESS_KEY` | unset | Object-store write credential; configure as a secret. |

`STARKNET_RPC_URL` should be supplied as a Fly secret rather than committed to
the repository.

## Current endpoints

```text
GET  /healthz
GET  /readyz
GET  /v1/config
GET  /v1/stats
GET  /v1/arbiter
GET  /v1/arbiter/history
GET  /torii/health
POST /torii/graphql
POST /v1/auth/challenges
POST /v1/auth/sessions
GET  /v1/sector-artworks
POST /v1/sector-artworks/uploads
POST /v1/sector-artworks/uploads/{uploadId}/complete
```

Image uploads are enabled only when all object-storage settings are present.
The browser creates one 256 px atlas image and one 512 px detail image for
each camera-projected artwork, obtains
object-specific five-minute PUT URLs, uploads both objects directly to storage,
and calls the completion endpoint. Completion downloads only those bounded
objects for signature, MIME, dimensions, and size validation, rechecks current
on-chain ownership for every target, and publishes generation-bound target
metadata with the captured camera and placement transform.

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
