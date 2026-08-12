# StakeWars Agent Guide

These instructions apply to the entire repository.

## Repository layout

- `apps/web` is the React/Vite frontend. Vercel owns its deployment and its
  configured project root is `apps/web`. Do not deploy the frontend to Fly.io.
- `apps/api` is the Go API deployed to Fly.io.
- `docs/PRD.md` is the source of truth for product and infrastructure
  requirements.

Use pnpm from the repository root for workspace commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm format:check
pnpm lint
```

Do not commit, push, deploy, create infrastructure, or change external project
settings unless the user explicitly requests that action.

## Local frontend runtime

Always run the web application locally against the shared Sepolia deployment:

```bash
pnpm dev:web
pnpm dev:web:sepolia
```

Both commands load the Sepolia environment; `pnpm dev` also runs the web app
against Sepolia. Open the game at `http://localhost:5000/?app=game`.

Katana is reserved for isolated contract testing only. Start Katana or migrate a
local Dojo World only when a contract test specifically requires it or the user
explicitly requests it. Do not initialize, maintain, or depend on a local Katana
World for normal frontend or API development, demos, previews, or verification.

Run Torii locally against the shared Sepolia World with:

```bash
pnpm dev:torii
```

The local index is rebuildable and stored under `contracts/.torii/sepolia`.
Always use this launcher rather than invoking `torii` directly. It enables
debug logging, mirrors all Torii output to the terminal, and keeps a timestamped
log under `contracts/.torii/logs/` for later triage. That directory is ignored
by Git with the rest of `contracts/.torii`.

## Fly.io production backend

The production Fly resources already exist:

- Organization: `personal`
- App: `stakewars`
- Region: `sjc`
- Process group: `app`
- Machine count: exactly one
- Machine size: one shared CPU and 512 MB RAM
- Volume: `stakewars_data`, encrypted, 1 GB, mounted at `/data`
- SQLite path: `/data/stakewars.db`
- Health endpoint: `https://stakewars.fly.dev/healthz`

The deployment configuration is in `apps/api/fly.toml`. Build context is
`apps/api`, so run Fly deployment commands from that directory.

## Validator monitoring VPS

The validator's Prometheus and Grafana stack runs on the remote VPS accessed
through the local `~/bin/rebel` wrapper. It is not managed by the application
deployment in this repository.

- Run `~/bin/rebel` for an interactive SSH session.
- Run `~/bin/rebel dashboard` to open an SSH tunnel and the private Grafana
  dashboard, and `~/bin/rebel dashboard stop` to close the tunnel.
- Monitoring configuration lives at `/opt/starknet-monitoring` on the VPS.
- Pathfinder and validator Compose configuration lives at
  `/opt/starknet/compose.yaml`. The `validator-attestation` service is behind
  the `validator` Compose profile and uses the Equilibrium v0.5.2 image pinned
  by digest. Equilibrium v0.5.2 requires Pathfinder's `/rpc/v0_9` HTTP endpoint
  and `/ws/rpc/v0_9` WebSocket endpoint. Keep Pathfinder's
  `--rpc.websocket.enabled` option active; do not point this service at
  `/rpc/v0_10`.
- The operational-key environment file is
  `/etc/starknet-validator/validator.env` with root-only permissions. Never
  print, download, copy into the repository, or expose its populated value.
- Validator metrics are bound to `127.0.0.1:9102`; Prometheus alert rules live
  at `/opt/starknet-monitoring/rules/validator-alerts.yml`.
- Public on-chain staking state is exported by the hardened
  `stakewars-staking-exporter.service` on `127.0.0.1:9103`. Its source is
  `/opt/starknet-monitoring/exporters/staking_exporter.py`; it has no access to
  validator signing keys. Its alert rules live at
  `/opt/starknet-monitoring/rules/staking-alerts.yml`.
- The provisioned operations and staking dashboard sources are respectively
  `/opt/starknet-monitoring/grafana/dashboards/stakewars-overview.json` and
  `/opt/starknet-monitoring/grafana/dashboards/stakewars-staking.json`.

Grafana loads that dashboard file every 30 seconds and UI updates are disabled,
so make persistent dashboard changes in the provisioned JSON. Validate JSON and
PromQL before replacing the remote file, and do not expose Grafana or Prometheus
directly to the public internet.

The VPS also runs the user-approved `dad-care-facilities.service` personal
workload on port 43177. It is outside the StakeWars project scope; do not modify,
stop, or treat it as validator configuration drift unless the user explicitly
requests work on it.

### Deployment guardrails

- Keep exactly one active API Machine while SQLite is the system of record.
  Never enable HA, add a spare Machine, or scale above one without first
  migrating the application to PostgreSQL.
- Normal deployments must use `fly deploy --ha=false`.
- Do not run `fly launch`, `fly apps create`, or `fly volumes create` during a
  normal deployment. The app and volume already exist.
- Do not destroy, recreate, detach, or rename `stakewars_data`. Treat the volume
  as production data even when the database is currently empty.
- Keep the volume mounted at `/data` and keep `auto_stop_machines = "off"`.
- Do not change the region, CPU, memory, process count, IP allocation, or custom
  domains unless the user explicitly approves that infrastructure change.
- Do not provision Tigris buckets or change Fly secrets unless explicitly
  requested. Never print secret values or store them in tracked files.
- Uploaded image bytes belong in Tigris, not on the Machine or Fly Volume. The
  volume is reserved for SQLite and its related files.
- Torii 1.8.0 currently runs beside the Go API in the same supervised container
  and uses `/data/torii` for its separate, rebuildable SQLite index. Keep its
  HTTP, gRPC, SQL, and relay listeners private; only `/torii/graphql` and
  `/torii/health` are exposed through the API gateway.
- Keep Torii debug logging enabled. Local logs are persisted under
  `contracts/.torii/logs/`; production logs go to stdout for Fly log capture.
- Keep the current Torii resource limits while the Machine has 512 MB RAM. If
  memory pressure or index lag becomes material, move Torii to a separate
  Machine; do not add a second active API Machine while the API uses SQLite.

### Pre-deployment checks

From the repository root:

```bash
pnpm --filter @stakewars/api test
pnpm --filter @stakewars/api build
fly config validate --config apps/api/fly.toml
git diff --check
```

Review `git status` and the API diff before deploying. A deployment should use
the intended working-tree code; it does not require a commit unless the user
also asks for one.

### Deploy

```bash
cd apps/api
fly deploy --ha=false
```

Do not use `--ha` or `fly scale count` as part of a routine deployment.

### Post-deployment verification

Run these from the repository root:

```bash
fly status --app stakewars
fly checks list --app stakewars
fly machine list --app stakewars
fly volumes list --app stakewars
curl --fail --silent --show-error https://stakewars.fly.dev/healthz
```

The deployment is healthy only when all of the following are true:

- Exactly one Machine is started in `sjc`.
- The Machine has one shared CPU and 512 MB RAM.
- The HTTP health check is passing.
- `stakewars_data` is attached to that Machine at `/data`.
- The public health endpoint returns `{"status":"ok"}`.

If deployment verification fails, inspect status and logs before making another
state change:

```bash
fly status --app stakewars
fly logs --app stakewars
```

Do not delete or recreate the Machine or volume as a first response to a failed
deployment.

## Database and storage constraints

When SQLite is implemented, enable WAL mode, foreign keys, and a five-second
busy timeout. Keep transactions short and writes serialized or retried. Before
production data is stored, add Litestream replication to the separate private
Tigris backup bucket described in the PRD and test recovery.

Fly Volume snapshots are an additional recovery layer, not the sole database
backup. Migrating to multiple active API Machines requires migrating SQLite to
managed PostgreSQL first.
