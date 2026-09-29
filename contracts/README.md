# Stake Wars contracts

The Stake Wars game layer is a Dojo World. It never holds or transfers an
Operator's delegated STRK. It reads each Operator's live delegation and
unpooling state from the official Stake Wars delegation pool. Game capacity is
derived as live delegation minus Sector garrisons, active cumulative challenge
commitments, and permanently spent game force. The separate SupplyDrop System may
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
An active Challenge does not displace that Controller: if the Challenge settles
after the deadline, the incumbent still receives the SupplyDrop. Control lazily
records the pre-change Sector and Operator state the first time either changes
after expiry, so releases, captures, Challenge settlements, stake
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
namespace ownership, and the game-admin role under the approved multisig. The
admin may update `challenge_period_seconds`; each subsequent valid lead change
uses the current configured period when it resets the deadline. Sepolia uses
180 seconds (3 minutes) for testing; Mainnet launches with 10,800 seconds (3
hours).
