# Stake Wars contracts

The Stake Wars game layer is a Dojo World. It never holds or transfers STRK. It
reads each Operator's live delegation and unpooling state from the official
Stake Wars delegation pool. Game capacity is derived as live delegation minus
Sector garrisons, active cumulative challenge commitments, and
permanently spent game force.

## Local commands

```bash
sozo build
sozo test
```

Run these commands from this directory. Local migration uses `dojo_dev.toml`.
The release profile deliberately contains no RPC credentials or deployment
account; production deployment settings must remain outside version control.

The repository `.tool-versions` pins Scarb 2.13.1 for the Dojo 1.8 contract
stack. Katana is reserved for isolated contract tests. Normal frontend and
Torii development use the shared Sepolia World.

The upstream Starknet staking implementation is pinned at
`../vendor/starknet-staking` as an ABI reference. It is not linked as a direct
Scarb dependency because its Cairo toolchain is older than this Dojo package.

## Torii indexing

Run `pnpm dev:torii` from the repository root to index the shared Sepolia
World. [`torii_sepolia.toml`](torii_sepolia.toml) also registers the staking
pool and active Whisper deployment as explicit `OTHER` contracts with raw
event indexing enabled. The Whisper address and deployment block mirror
`vendor/whisper/deployments/sepolia.json`.

Arbiter history should read keyed `AuctionSettled` events from the configured
Whisper contract and filter them to canonical Stake Wars auction IDs. The
active deployment's event supplies the final logical-bid count, winning bid,
clearing price, and winner commitment. Settlements emitted by previous Whisper
deployments use legacy layouts and are intentionally outside the active
contract's indexed history. The frontend history query is intentionally
separate from this indexer configuration.

## Control System

The Control System exposes authoritative `get_operator_status`,
`get_sector_status`, `get_sector_statuses`,
`get_challenge_status`, `get_challenge_participant_status`, and
`can_manage_image` views. The batched sector-status view reads up to 200 Control
Sectors. Stale Torii models are safe for discovery while security-sensitive
clients confirm effective control onchain. Permissionless reconciliation may
call `sync_operator` or batch up to 50 addresses with `sync_operators`.

Every `capture`, `reinforce`, and `challenge` call includes a visible STRK
amount. `capture_many` and `reinforce_many` apply up to 200 per-sector requests
atomically while reading shared Operator and delegation state once. An Operator
may manage multiple Sectors and lead multiple challenges when their
aggregate commitments fit within live delegation.

The network deployment presets use 18-decimal STRK base units:

- Sepolia testing: `SEPOLIA_MINIMUM_STAKE = 100000000000000000` (0.1 STRK).
- Mainnet production: `MAINNET_MINIMUM_STAKE = 100000000000000000000` (100
  STRK).

World initialization must pass the applicable preset into
`GameConfig.minimum_stake`; the frontend reads the resulting onchain rule and
must not substitute its own environment-specific minimum.

An occupied sector is contested through `challenge` or
`challenge_with_sacrifice`:

- The initiating commitment must exceed the sector's garrison by at least 10%,
  rounded up to the next STRK base unit. The incumbent's garrison and the
  challenger's commitment remain locked and at risk until settlement.
- Any eligible Operator except the current leader may publicly commit at least
  10% more force than the current lead, rounded up to the next STRK base unit. A
  returning participant locks only the difference between the new commitment
  and that Operator's own prior maximum.
- Losing the lead does not spend a position. Each participant's highest
  commitment remains locked so they may continue escalating incrementally.
- Every accepted escalation sets a fresh full response-window deadline. There
  is no absolute challenge-duration cap, and the current leader cannot extend
  the clock by challenging itself.
- After the deadline, any account may call `settle_challenge`. The current
  leader's exact commitment becomes the new garrison and losing participants
  spend their own highest commitments as game force.

Each challenge action is constant-cost. Settlement resolves the winner,
incumbent, and final runner-up without iterating an unbounded participant list.
Any additional losing position remains locked—which has the same Ready STRK
effect as spent force—until any account calls
`resolve_challenge_position(challenge_id, operator)` to move it to the
Operator's Spent Force in O(1).

`challenge_with_sacrifice(target, source, committed_force)` atomically
neutralizes an owned, uncontested source sector before validating the new
commitment. Its garrison returns to the Operator's Ready STRK; it is not
duplicated or automatically spent.

Spent force is permanent accounting for that Operator address. The contracts do
not slash, escrow, or transfer the underlying STRK, which remains in the official
delegation pool under its normal staking and reward rules.

`retire` permanently retires an address. An unpool intent made directly through
the official pool is detected by game actions and synchronization and causes the
same retirement. A live delegation reduction below recorded obligations also
retires the address rather than creating reusable backing.

Before a production deployment, supply the Mainnet RPC and deployment keystore
outside version control, initialize the World with the official Stake Wars STRK
delegation-pool address and base-unit rule values, and place World ownership,
namespace ownership, and the game-admin role under the approved multisig. The
admin may update `challenge_period_seconds`; each subsequent valid lead change
uses the current configured period when it resets the deadline. Sepolia uses
180 seconds (3 minutes) for testing; Mainnet launches with 10,800 seconds (3
hours).
