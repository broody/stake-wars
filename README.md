# Stake Wars

Stake Wars is a persistent, non-custodial strategy game that turns Starknet
validator delegation into a battle for territory. Players deploy their
delegated STRK as FORCE to capture and defend Sectors on the Core, challenge
rivals, and decide how much strength to reveal—all without creating a separate
game token or moving custody away from Starknet's staking system.

Stake Wars' STRK20 integration is focused exclusively on
[Whisper](https://github.com/broody/whisper), a standalone library for private
Vickrey auctions. Whisper provides the sealed-bidding mechanics used to assign
control of the Beacon billboard without publishing bids before settlement. The
current controller remains until a later qualifying winner is confirmed; the
next three-day auction starts with its first sealed bid. Normal Stake Wars
delegation and territory gameplay remain public.

For the STRK20 Private Sprint, the two projects are one submission with a clear
boundary: Whisper owns the reusable Cairo contract, headless TypeScript SDK,
encrypted bid capsule, and vault operator; Stake Wars is the dapp, product UX,
canonical-round registry, winner claim, and billboard fulfillment layer. The
Whisper repository is pinned here as [`vendor/whisper`](vendor/whisper), while
remaining usable by applications other than Stake Wars.

This repository contains the web application, game API, and Dojo contracts.

## Repository layout

```text
apps/
├── api/   # Go HTTP API
└── web/   # React, TypeScript, and Vite frontend
contracts/ # Cairo contracts and Dojo World configuration
docs/      # Product and architecture documentation
vendor/    # Pinned third-party and companion repositories, including Whisper
```

Clone the pinned vendor repositories with:

```bash
git submodule update --init --recursive
```

The coupled Whisper/Stake Wars delivery gates and hackathon evidence checklist
are tracked in [`STRK20_INTEGRATION_PLAN.md`](STRK20_INTEGRATION_PLAN.md).

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

The shared Sepolia World uses a 0.1 STRK minimum capture force, a 180-second
response window, and 2,000 Sectors. Mainnet launches with a 100 STRK
minimum and a 10,800-second response window. The game admin may change the
response window through the on-chain rules configuration. Every accepted lead
change uses the then-current window, with no absolute contest-duration cap.
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
