# Stake Wars

Stake Wars is a persistent, non-custodial strategy game that turns Starknet
validator delegation into a battle for territory. Players deploy their
delegated STRK as FORCE to capture and defend Sectors on the Core, take them
from rivals, and decide how much strength to reveal—all without creating a
separate game token or moving custody away from Starknet's staking system.

This repository contains the web application, game API, and Dojo contracts.

## The Beacon: open auctions for the signal

The Beacon billboard is allocated through an open ascending auction run by the
Dojo Beacon System. The first bid at or above the reserve starts a three-day
clock. Every bid is public and must beat the lead by at least 10%; the Beacon
System escrows only the leading bid and refunds the displaced leader in the
same transaction. A bid in the final five minutes extends the deadline to five
minutes after that bid. After the deadline, anyone can settle the round: the
winning bid goes to the configured proceeds recipient, the winner takes control
of the Beacon, and the next round opens in the same transaction. The current
controller keeps control until a later round settles.

The Beacon previously ran on Whisper, a private sealed-bid auction built for
the STRK20 Private Sprint. Its hackathon record remains in
[`STRK20_INTEGRATION_PLAN.md`](STRK20_INTEGRATION_PLAN.md) and
[`strk20.json`](strk20.json); rounds 1 through 6 from that era remain in Beacon
history.

## Repository layout

```text
apps/
├── api/   # Go HTTP API
└── web/   # React, TypeScript, and Vite frontend
contracts/ # Cairo contracts and Dojo World configuration
docs/      # Product and architecture documentation
vendor/    # Pinned third-party reference repositories
```

Clone the pinned vendor repositories with:

```bash
git submodule update --init --recursive
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

The development frontend checks that the configured Stake Wars World is deployed
before showing a green KATANA status in the navigation. Open the game locally at
[http://localhost:3000/play](http://localhost:3000/play).

To run the frontend against the shared Sepolia deployment instead, use:

```bash
pnpm dev:web:sepolia
```

For collateral captures, build the current checkout and serve it locally with
production Mainnet data:

```bash
pnpm dev:web:prod
```

Open [http://localhost:5000/play](http://localhost:5000/play) (set `PORT` to
use another port). This uses
`apps/web/.env.mainnet` and a localhost proxy for the production API, Torii,
RPC, and artwork. Wallet actions use Mainnet. Build output is
temporary and removed on exit; press Ctrl+C to stop, then rerun the command to
include code changes. Update the public Mainnet settings after production
deployments change the configured addresses.

The shared Sepolia World uses a 0.1 STRK minimum capture force and 2,000
Sectors; the game admin sets the Mainnet minimum through the on-chain rules
configuration. An occupied Sector changes hands instantly to any Operator who
commits at least 10% more FORCE than its garrison, and the displaced Controller's
FORCE is returned in full.
Deployed addresses in `apps/web/.env.sepolia` are updated only after a successful
deployment proves the new addresses.

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

Stake Wars is licensed under the
[Apache License 2.0](LICENSE). Except where otherwise noted, this license
applies to the source code, smart contracts, documentation, and original game
assets in this repository. Third-party and vendored material remains subject to
its respective license terms.
