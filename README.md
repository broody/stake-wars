# StakeWars

StakeWars is a persistent Starknet staking game presented through a
retro-futurist command interface. This repository is a pnpm monorepo containing
the web application and the game API.

## Repository layout

```text
apps/
├── api/   # Go HTTP API
└── web/   # React, TypeScript, and Vite frontend
docs/      # Product and architecture documentation
```

## Tech stack

- **Web:** React, TypeScript, Tailwind CSS, Vite, and React Three Fiber
- **API:** Go
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

## Quality checks

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm test
```
