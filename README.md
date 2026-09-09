# Stake Wars

Stake Wars is a persistent, non-custodial strategy game that turns Starknet
validator delegation into a battle for territory. Players deploy their
delegated STRK as FORCE to capture and defend Sectors on the Core, challenge
rivals, and decide how much strength to reveal—all without creating a separate
game token or moving custody away from Starknet's staking system.

This repository contains the web application, game API, and Dojo contracts.

## Whisper: private Beacon auctions

The Beacon billboard is allocated through
[Whisper](https://github.com/broody/whisper), a standalone library for private
Vickrey auctions and the sole focus of Stake Wars' STRK20 integration. Bids
remain hidden from the public until settlement. The current controller remains
until a later qualifying winner is confirmed, and the next three-day auction
starts with its first sealed bid. Delegation and territory gameplay remain
public.

For the STRK20 Private Sprint, the two projects are one submission with a clear
boundary: Whisper owns the reusable Cairo contract, headless TypeScript SDK,
encrypted bid capsule, and vault operator; Stake Wars is the dapp, product UX,
canonical-round registry, winner claim, and billboard fulfillment layer. The
Whisper repository is pinned here as [`vendor/whisper`](vendor/whisper), while
remaining usable by other applications. Shared delivery gates and hackathon
evidence are tracked in
[`STRK20_INTEGRATION_PLAN.md`](STRK20_INTEGRATION_PLAN.md).

Whisper currently relies on a trusted auctioneer: a single operator controls
the auction vault and can decrypt bids before bidding closes. The privacy pool
enforces note ownership and value conservation, and Whisper verifies the
Vickrey result, but bidders still trust the operator to preserve bid secrecy
and correctly settle or refund their escrow.

To address this limitation, we explored two complementary primitives for
contract-enforced escrow and delayed bid disclosure:

- **[Controlled notes for the privacy pool](https://github.com/broody/starknet-privacy/pull/2):**
  A proposed extension that lets a smart contract govern funded private
  deposits. Creating a controlled note immediately debits private funds;
  spending it requires authorization from its bound controller, enforced by
  the pool. For Whisper, this could let an auction contract enforce escrow,
  settlement, and refund rules over private value instead of entrusting those
  funds to the auctioneer.
- **[Verifiable delay functions (VDFs)](https://github.com/broody/vdf):**
  An exploration of Wesolowski VDF verification and RSW timelock decryption in
  Cairo, intended to make bids decryptable after a computational delay without
  a trusted auctioneer holding the reveal key. The intended flow proves the
  computation offchain and verifies its proof onchain;
  the delay is computational, not an exact wall-clock deadline.

These are research directions toward removing the trusted auctioneer from
Whisper's sealed-bid design. They do not yet change its deployed trust model:
controlled notes remain a draft proposal, and the VDF prototype still needs
proof generation and verification for its optimized implementation, plus
onchain integration.

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

Open [http://localhost:3000/play](http://localhost:3000/play). This uses
`apps/web/.env.mainnet` and a localhost proxy for the production API, Torii,
RPC, Whisper operator, and artwork. Wallet actions use Mainnet. Build output is
temporary and removed on exit; press Ctrl+C to stop, then rerun the command to
include code changes. Update the public Mainnet settings after production
deployments change the configured addresses.

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
