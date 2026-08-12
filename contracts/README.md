# StakeWars contracts

The StakeWars game layer is a Dojo World. It never holds or transfers STRK. It
reads each player's active `amount` from the official StakeWars delegation pool
and limits the player's total Control Point allocation to that balance.

## Local commands

```bash
sozo build
sozo test
```

Run these commands from this directory. Local migration uses `dojo_dev.toml`.
The release profile deliberately contains no RPC credentials or deployment
account; production deployment settings must remain outside version control.

The repository `.tool-versions` pins Scarb 2.13.1 because the Dojo 1.8 contract
stack emits Sierra 1.7 for the stable Katana sequencer. From the repository root,
start and migrate the local chain with `pnpm dev:katana` and
`pnpm contracts:deploy:local` in separate terminals.

The upstream Starknet staking implementation is pinned at
`../vendor/starknet-staking` as an ABI reference. It is not linked as a direct
Scarb dependency because its Cairo toolchain is older than this Dojo package.

The Control System exposes authoritative `get_operator_status`,
`get_control_point_status`, and `can_manage_image` views. Stale Torii models are
therefore safe to use for discovery while security-sensitive clients confirm
effective control on-chain. Permissionless reconciliation may call
`sync_operator` or batch up to 50 unique addresses with `sync_operators`; healthy
and previously unseen operators do not cause a model write or event.

Operators may atomically capture or reinforce up to 50 Control Points with
`capture_many` and `reinforce_many`. These entrypoints refresh the caller's live
delegated balance once and persist the caller's final allocation state once,
while retaining one ownership update and event per Control Point. The single
`capture` and `reinforce` entrypoints remain available for one-point actions.

Before any production migration, supply the Mainnet RPC and deployment keystore
outside version control, initialize the World with the official StakeWars STRK
delegation-pool address and base-unit rule values, and place both World and
namespace ownership plus the stored game-admin role under the approved multisig.
