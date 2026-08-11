# StakeWars

StakeWars is a persistent Starknet staking game presented through a
retro-futurist command interface. This repository contains the web application,
game API, and Dojo contracts.

## Repository layout

```text
apps/
├── api/   # Go HTTP API
└── web/   # React, TypeScript, and Vite frontend
contracts/ # Cairo contracts and Dojo World configuration
docs/      # Product and architecture documentation
```

## Tech stack

- **Web:** React, TypeScript, Tailwind CSS, Vite, and React Three Fiber
- **API:** Go
- **Contracts:** Cairo and Dojo
- **Workspace:** pnpm

## Getting started

Install JavaScript dependencies from the repository root:

```bash
pnpm install
```

Run the web app and API together:

```bash
pnpm dev
```

The web app is available at [http://localhost:5000](http://localhost:5000), and
the API health endpoint is available at
[http://localhost:8080/healthz](http://localhost:8080/healthz).

Run either application independently:

```bash
pnpm dev:web
pnpm dev:api
```

Run the local Starknet chain and deploy the Dojo World in separate terminals:

```bash
pnpm dev:katana
pnpm contracts:deploy:local
```

The repository pins the compatible Dojo toolchain in `.tool-versions`. Katana
serves JSON-RPC at `http://127.0.0.1:5050`, and the development frontend checks
that the configured StakeWars World is deployed before showing a green KATANA
status in the navigation. Open the game locally at
[http://localhost:5000/?app=game](http://localhost:5000/?app=game).

The API's runtime variables and authentication endpoints are documented in
[`apps/api/README.md`](apps/api/README.md). The initial image limit is 2 MiB and
is configurable through `MAX_IMAGE_BYTES`.

## Quality checks

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm test
pnpm contracts:build
pnpm contracts:format:check
pnpm contracts:test
```
