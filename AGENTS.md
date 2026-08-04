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
