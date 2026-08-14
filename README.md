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

The web app is available at [http://localhost:3000](http://localhost:3000), and
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
serves JSON-RPC at `http://127.0.0.1:5050` with Cartridge Controller and its
local paymaster enabled.

Cartridge Controller uses its production keychain at `https://x.cartridge.gg`
by default. `VITE_KEYCHAIN_FRAME_URL` is available only when deliberately
testing a different Controller keychain. The wallet chooser also discovers the
Ready browser extension through the Starknet Wallet Standard and links to the
appropriate browser store when it is not installed.

The development frontend checks that the configured StakeWars World is deployed
before showing a green KATANA status in the navigation. Open the game locally at
[http://localhost:3000/?app=game](http://localhost:3000/?app=game).

To run the frontend against the shared Sepolia deployment instead, use:

```bash
pnpm dev:web:sepolia
```

The Sepolia environment uses World
`0x01c1c6206be878c53432c493c4b13825d97379352553799ed83023c23a59af70`
and control system
`0x05ffe84f1e059d8bed2303f9559c3b04c5c9358008b871e3739059ca545544d6`.
It is initialized with a 0.01 STRK minimum allocation, a 10% challenge premium,
and 2,000 control points.

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
