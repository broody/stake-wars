# StakeWars API

The Go API owns wallet authentication and off-chain image metadata. The Dojo
World remains authoritative for Control Point ownership, while image bytes are
uploaded directly to Tigris rather than passing through this service.

## Local development

From the repository root:

```bash
pnpm --filter @stakewars/api dev
```

The service defaults to `http://localhost:8080` and stores local data in
`./stakewars.db` relative to `apps/api`. Without `STARKNET_RPC_URL`, health,
readiness, configuration, and challenge creation remain available, but wallet
session creation returns `503` because signatures cannot be verified.

Run the Sepolia Torii indexer separately from the repository root:

```bash
pnpm dev:torii
```

Torii listens on `127.0.0.1:8081`, persists its rebuildable index under
`contracts/.torii/sepolia`, and starts at the world deployment block rather
than scanning Sepolia from genesis. The launcher enables debug output and saves
each session to `contracts/.torii/logs/torii-sepolia-<timestamp>.log` while
continuing to stream the same output to the terminal.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Enables production-only origin defaults when set to `production`. |
| `PORT` | `8080` | HTTP listen port. |
| `DATABASE_PATH` | `./stakewars.db` | SQLite database path. Production uses `/data/stakewars.db`. |
| `STARKNET_RPC_URL` | unset | Starknet JSON-RPC endpoint used for authoritative contract calls. |
| `STARKNET_CHAIN_ID` | `SN_MAIN` | SNIP-12 authentication domain and public network identifier. |
| `TORII_URL` | unset | Internal Torii HTTP origin. Production uses `http://127.0.0.1:8081`. |
| `MAX_IMAGE_BYTES` | `2097152` | Maximum encoded image size. This is an application policy and can be changed without changing Tigris. |
| `AUTH_CHALLENGE_TTL` | `5m` | Lifetime of a single-use wallet challenge. |
| `AUTH_SESSION_TTL` | `15m` | Lifetime of an API bearer session. |
| `ALLOWED_ORIGINS` | production domains plus localhost in development | Comma-separated exact browser origins allowed by CORS. |

`STARKNET_RPC_URL` should be supplied as a Fly secret rather than committed to
the repository.

## Current endpoints

```text
GET  /healthz
GET  /readyz
GET  /v1/config
GET  /torii/health
POST /torii/graphql
POST /v1/auth/challenges
POST /v1/auth/sessions
```

Production runs the API and the pinned Torii 1.8.0 binary under one supervised
container on the existing Fly Machine. They use separate SQLite databases on
the `/data` volume. Only Torii health and GraphQL are reverse-proxied; its raw
SQL endpoint and internal gRPC/relay ports are not public. `/readyz` checks both
the application database and Torii, and the container exits if either process
stops.

The Torii process is intentionally constrained to one query thread, one indexer
thread, a 32 MiB SQLite cache, eight read connections, and a 320 MiB hard SQLite
memory limit so this initial deployment can share the 512 MiB Machine. Monitor
memory and index lag before increasing traffic. If either becomes material,
move Torii to its own Machine instead of scaling the SQLite-backed API above one
active Machine.

Authentication uses server-generated SNIP-12 typed data. The API verifies the
signature by calling `is_valid_signature` on the wallet's Starknet account
contract. Challenges expire after a short interval and are consumed atomically
when a session is created, preventing replay.

The public configuration endpoint exposes `maxImageBytes` so the frontend does
not need to hard-code the current upload policy.
