# StakeWars

StakeWars is a persistent, non-custodial strategy game built around Starknet
validator delegation. Operators choose how much of their real delegated STRK to
allocate to Control Points and 12-hour challenges without creating a separate
power currency. Challenge commitments are additive, the winner takes the point,
and losing allocations unlock for reuse after settlement.
This repository contains the web application, game API, and Dojo contracts.

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

The web app is available at [http://localhost:3000](http://localhost:3000), and
the API health endpoint is available at
[http://localhost:8080/healthz](http://localhost:8080/healthz).

Run either application independently:

```bash
pnpm dev:web
pnpm dev:api
```

Normal frontend development uses the shared Sepolia World:

```bash
pnpm dev:web
pnpm dev:torii
```

Katana is reserved for isolated contract tests. The repository pins the
compatible Dojo toolchain in `.tool-versions`.

The development frontend checks that the configured StakeWars World is deployed
before showing a green KATANA status in the navigation. Open the game locally at
[http://localhost:3000/?app=game](http://localhost:3000/?app=game).

To run the frontend against the shared Sepolia deployment instead, use:

```bash
pnpm dev:web:sepolia
```

The World is initialized with a minimum capture power, a 10% challenge premium,
a 43,200-second challenge period, and 2,000 Control Points. The Sepolia profile
uses the breaking-change seed `stakewars-sepolia-allocations-v1`; deployed
addresses in `apps/web/.env.sepolia` are updated only after a successful
migration proves the new addresses.

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

## License

StakeWars is licensed under the
[Apache License 2.0](LICENSE). Except where otherwise noted, this license
applies to the source code, smart contracts, documentation, and original game
assets in this repository. Third-party and vendored material remains subject to
its respective license terms.
