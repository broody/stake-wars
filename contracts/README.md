# StakeWars contracts

The StakeWars game layer is a Dojo World. It never holds or transfers STRK. It
reads each player's live delegation and unpooling state from the official
StakeWars delegation pool. Game power is derived as live delegation minus point
commitments, active-challenge commitments, and permanent forfeited power.

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
`get_control_point_status`, `get_control_point_statuses`,
`get_challenge_status`, and `can_manage_image` views. The batched point-status
view reads up to 200 Control Points. Stale Torii models are safe for discovery
while security-sensitive clients confirm effective control on-chain.
Permissionless reconciliation may call `sync_operator` or batch up to 50
addresses with `sync_operators`.

Every `capture`, `reinforce`, or `challenge` contribution automatically commits
all power currently available to the caller. There are no user-selected
allocation amounts and no batch capture/reinforcement entrypoints: once an
action commits the available balance, it cannot back another point.

An occupied point is contested through `challenge` or
`challenge_with_collateral`. A qualifying participant must reach the configured
premium over the current leader's cumulative commitment. Leadership changes
reset the configured challenge period. The current leader cannot self-raise.
After the deadline, `settle_challenge` transfers the point to the leader and
turns every losing commitment into permanent forfeited power. Non-incumbent
losers are reconciled lazily on their next action or operator sync, but their
commitments stay locked until then.

Collateral is a move, not duplicated backing:
`challenge_with_collateral(target, source)` neutralizes an uncontested source
point and adds its complete Capture Power to the same challenge transaction.

`retire` (and the compatibility alias `relinquish_all`) permanently retires an
address. It advances the ownership generation, invalidates all holdings, and
prevents that address from playing again. An unpool intent made directly through
the official pool is detected by game actions and operator synchronization and
causes the same permanent retirement.

Before any production migration, supply the Mainnet RPC and deployment keystore
outside version control, initialize the World with the official StakeWars STRK
delegation-pool address and base-unit rule values (including the 43,200-second
challenge period), and place both World and
namespace ownership plus the stored game-admin role under the approved multisig.
