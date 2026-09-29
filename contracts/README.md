# Stake Wars contracts

The Stake Wars game layer is a Dojo World. It never holds or transfers an
Operator's delegated STRK. It reads each Operator's live delegation and
unpooling state from the official Stake Wars delegation pool. Game capacity is
derived as live delegation minus Sector garrisons. The separate SupplyDrop System may
escrow a role-authorized ERC-20, ERC-721, or ERC-1155 reward for its active
round; that escrow is never sourced from Operator delegation or FORCE.

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
pool as an explicit `OTHER` contract with raw event indexing enabled. Beacon
System models and events are World resources and need no extra configuration.

## Control System

The Control System exposes authoritative `get_operator_status`,
`get_sector_status`, `get_sector_statuses`, `required_stake`, and
`can_manage_image` views. The batched sector-status view reads up to 200 Control
Sectors. Stale Torii models are safe for discovery while security-sensitive
clients confirm effective control onchain. Permissionless reconciliation may
call `sync_operator` or batch up to 50 addresses with `sync_operators`.

Every `capture` and `reinforce` call includes a visible STRK amount.
`capture_many` and `reinforce_many` apply up to 200 per-sector requests
atomically while reading shared Operator and delegation state once. An Operator
may hold any number of Sectors while their garrisons fit within live delegation.

The network deployment presets use 18-decimal STRK base units:

- Sepolia testing: `SEPOLIA_MINIMUM_STAKE = 100000000000000000` (0.1 STRK).
- Mainnet production: `MAINNET_MINIMUM_STAKE = 100000000000000000000` (100
  STRK).

World initialization must pass the applicable preset into
`GameConfig.minimum_stake`; the frontend reads the resulting onchain rule and
must not substitute its own environment-specific minimum.

An occupied Sector is taken over through the same `capture` entrypoint:

- The commitment must be at least the Sector's `required_stake`: 10% more than
  its garrison, rounded up to the next STRK base unit, and never below
  `GameConfig.minimum_stake`.
- Ownership changes in that transaction. The displaced Controller's garrison
  returns to its available FORCE in full, and `SectorTakenOver` records the new
  and previous Controller, the new garrison, and the returned amount.
- A Sector whose recorded Controller has retired, been disqualified, or holds a
  stale generation is neutral and is captured at the minimum stake.
- The Controller cannot take over its own Sector; `reinforce` raises the
  garrison, and therefore the takeover price, instead.

Earlier releases contested Sectors through open Challenges with a response
window, settlement, Sector Sacrifice, and permanently Spent Force. Those
entrypoints, models, and events are gone from this package. The
`OperatorState` Challenge and Spent Force fields and `Sector.active_challenge_id`
remain only because Dojo cannot remove fields from registered models; Available
Force ignores them, so any recorded Spent Force is forgiven.

## Beacon System

The Beacon System runs one open ascending auction at a time for control of the
Beacon billboard, paid in the admin-configured token (STRK). The game admin
calls `initialize_beacon` once with the payment token, proceeds recipient,
reserve, minimum raise in basis points, bidding window, late-bid extension, and
first round ID, which opens that round as pending. `set_beacon_rules` changes
every rule except the payment token; a pending round without bids adopts the
new rules, while a round with bids keeps the rules its bidders accepted.

- `place_beacon_bid(round_id, amount)` requires an `approve` in the same
  multicall. The first bid must meet the reserve and starts the bidding window.
  Each later bid must raise the lead by `min_raise_bps`, rounded up to the next
  base unit, and the current leader cannot outbid itself. A bid in the final
  `extension_seconds` moves the deadline to `extension_seconds` after that bid.
  Bids are rejected while the game is paused.
- Only the leading bid is escrowed. The displaced leader is refunded in the
  same transaction, and both transfers are balance-checked, so fee-on-transfer
  tokens are rejected.
- After the deadline, any account may call `settle_beacon_auction(round_id)`,
  including while the game is paused. It pays the winning bid to the round's
  proceeds recipient and opens the next round atomically, so every settled
  round has a winner and every round below the current one is settled.
- `get_beacon_status` returns the current round and the exact minimum next
  bid, and reports `initialized: false` instead of panicking before setup.
  `get_beacon_auction(round_id)` reads any round.

Winning a round grants only off-chain control of the Beacon's transmission;
the API reads the winner from the settled round.

## SupplyDrop System

The game admin and any number of wallets holding OpenZeppelin's
`SUPPLY_DROP_CREATOR_ROLE` may create a SupplyDrop by approving and fully funding an
ERC-20, ERC-721, or ERC-1155 prize. The Admin System's standard AccessControl
entrypoints grant and revoke creators, while the one-active-SupplyDrop limit
continues to apply globally. After the configured deadline, gameplay continues
and any account may call `lock_supply_drop`. That entrypoint commits to a future
block hash; `settle_supply_drop` becomes callable after the hash is available
through Starknet's block-hash syscall. The resulting Poseidon hash selects one
Sector from the round's snapshotted Sector range.

The wallet controlling the selected Sector at the exact round deadline wins.
Control lazily records the pre-change Sector and Operator state the first time
either changes after expiry, so releases, captures, takeovers, stake
disqualifications, and retirements can continue without redirecting the prize.
A Sector that was neutral or already stale at the deadline has no winner and
rolls the escrow into another full-duration round. A valid selection records
the winner, who then calls `claim_prize` to transfer the exact escrowed prize to
a chosen recipient. This keeps a rejecting token or recipient from blocking
SupplyDrop finalization. The
future-block-hash scheme is transparent pseudo-randomness, not a substitute for
an audited VRF for high-value Mainnet prizes.

`retire` permanently retires an address. An unpool intent made directly through
the official pool is detected by game actions and synchronization and causes the
same retirement. A live delegation reduction below recorded obligations also
retires the address rather than creating reusable backing.

Before a production deployment, supply the Mainnet RPC and deployment keystore
outside version control, initialize the World with the official Stake Wars STRK
delegation-pool address and base-unit rule values, and place World ownership,
namespace ownership, and the game-admin role under the approved multisig.
`initialize` and `set_rules` still accept the legacy `challenge_period_seconds`
from the retired open-Challenge rules; it is stored but has no gameplay effect.
