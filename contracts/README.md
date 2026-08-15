# StakeWars contracts

The StakeWars game layer is a Dojo World. It never holds or transfers STRK. It
reads each player's live delegation and unpooling state from the official
StakeWars delegation pool. Game power is derived as live delegation minus point
commitments and active-challenge commitments.

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

Every `capture`, `reinforce`, or `challenge` call includes a user-selected STRK
amount. The Control System accepts it only when the amount remains backed by the
caller's derived Available Power. This lets an Operator spread delegation across
positions without creating an editable reserve or allowing the same delegation
to back more than one commitment.

An occupied point is contested through `challenge` or
`challenge_with_collateral`. A qualifying participant must reach the configured
premium over the current leader's cumulative commitment. Leadership changes
reset the configured challenge period. The current leader cannot self-raise.
After the deadline, `settle_challenge` transfers the point to the leader and
unlocks every losing allocation. Non-incumbent losers are reconciled lazily on
their next action or operator sync, but their commitments stay locked until
then.

Collateral is a move, not duplicated backing:
`challenge_with_collateral(target, source, additional_contribution)` neutralizes
an uncontested source point, adds its complete Capture Power to the challenge,
and optionally adds the selected amount of otherwise Available Power.

`retire` (and the compatibility alias `relinquish_all`) permanently retires an
address. It advances the ownership generation, invalidates all holdings, and
prevents that address from playing again. An unpool intent made directly through
the official pool is detected by game actions and operator synchronization and
causes the same permanent retirement. Any live-delegation reduction below the
address's recorded Point and Challenge Commitments also permanently retires the
address rather than creating a reusable backing gap.

Before any production migration, supply the Mainnet RPC and deployment keystore
outside version control, initialize the World with the official StakeWars STRK
delegation-pool address and base-unit rule values (including the 43,200-second
challenge period), and place both World and
namespace ownership plus the stored game-admin role under the approved multisig.
