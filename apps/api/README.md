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

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Enables production-only origin defaults when set to `production`. |
| `PORT` | `8080` | HTTP listen port. |
| `DATABASE_PATH` | `./stakewars.db` | SQLite database path. Production uses `/data/stakewars.db`. |
| `STARKNET_RPC_URL` | unset | Starknet JSON-RPC endpoint used for authoritative contract calls. |
| `STARKNET_CHAIN_ID` | `SN_MAIN` | SNIP-12 authentication domain and public network identifier. |
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
POST /v1/auth/challenges
POST /v1/auth/sessions
```

Authentication uses server-generated SNIP-12 typed data. The API verifies the
signature by calling `is_valid_signature` on the wallet's Starknet account
contract. Challenges expire after a short interval and are consumed atomically
when a session is created, preventing replay.

The public configuration endpoint exposes `maxImageBytes` so the frontend does
not need to hard-code the current upload policy.
