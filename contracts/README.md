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

Every `capture` or `reinforce` call includes a user-selected STRK amount. Sealed
challenge calls contain only an opaque bid commitment and lock all currently
Available Power as public bid collateral. The private maximum is encrypted to
the auction key and may not exceed that public collateral ceiling.

An occupied point is contested through `submit_sealed_bid` or
`submit_sealed_bid_with_collateral`. The first bid opens one fixed challenge
period; later bids neither reveal a leader nor reset the deadline. The configured
settlement authority publishes the winner, runner-up bid, and Vickrey clearing
price. The winner commits only that price, while losing and excess collateral
unlock. Non-winning participants may reconcile lazily on their next action or
operator sync, but their collateral stays locked until then.

Collateral is a move, not duplicated backing:
`submit_sealed_bid_with_collateral(target, source, commitment)` neutralizes an
uncontested source point and moves its complete Capture Power into the sealed
bid's collateral ceiling.

`retire` (and the compatibility alias `relinquish_all`) permanently retires an
address. It advances the ownership generation, invalidates all holdings, and
prevents that address from playing again. An unpool intent made directly through
the official pool is detected by game actions and operator synchronization and
causes the same permanent retirement. Any live-delegation reduction below the
address's recorded Point and Challenge Commitments also permanently retires the
address rather than creating a reusable backing gap.

Before any production migration, supply the Mainnet RPC and deployment keystore
outside version control, initialize the World with the official StakeWars STRK
delegation-pool address, settlement-authority address, and base-unit rule values
(including the initial 10,800-second challenge period), and place both World and
namespace ownership plus the stored game-admin role under the approved multisig.
The admin may later update `challenge_period_seconds` through `set_rules`; an
existing challenge keeps the deadline captured when it opened.
