# Fresh SupplyDrop cutover

Status: the Mainnet refund, fresh contract deployment, API deployment and
frontend cutover are complete and verified. No new prize has been funded.

## Confirmed recovery

- Network: Starknet Mainnet (`SN_MAIN`).
- World: `0x6e2d33ac9878de85acc676347f6bd97a860376fe33438eb7445317a6b1d71cc`.
- Retired Jackpot: `0x1f1e5cd0fd73934c6ff69df96dbb6d0be22937e46d65edf360bed2256cb0f5b`.
- Refunded asset: exactly 10,000 STRK (18 decimals).
- Original sponsor and refund recipient:
  `0x6a4bc059bf193b15bfc064179828c985622de5ad319eb849b12c63916cea730`.
- Recovery class:
  `0x392bf85f0bf0dae1892041f4ef36904990785dfa1634a27bfc03750adef1a23`.
- Upgrade and refund transaction:
  `0x74ca45f447b96dac2f154c419d8cd49fb64798761ec953473990705e4b4b371`.
- Receipt: `ACCEPTED_ON_L2`, `SUCCEEDED`, block **14,586,877**.

The transaction upgraded only the old Jackpot system to a restricted recovery
class and refunded round #1 atomically. Preconditions included the game admin,
exact sponsor and token, exact escrow/prize amount, round #1 being the only round,
an active round before expiry, no locked draw and no winner or claim. The
recipient cannot be supplied by the caller. State is cancelled before the
transfer and token balance changes are checked exactly.

At verification block 14,586,900, old escrow was zero, the sponsor's balance had
increased by exactly 10,000 STRK, and the old active counter was zero. The round
is cancelled (status 5) and its previous draw history remains. GameConfig was
unchanged. The old funding, top-up, locking, settlement and claim entrypoints are
absent from the recovery class. World owners retain the protocol's normal system
upgrade authority.

The deployed recovery source, eight focused tests, before/after public state and
receipt are preserved in [supplydrop-recovery](supplydrop-recovery/). These are
historical deployment evidence, outside the active game package.

## Fresh implementation

The new `stakewars-supply_drop` system has new selectors, a
`SUPPLY_DROP_CREATOR_ROLE`, a new randomness domain and new SupplyDrop round,
counter, sector-snapshot and operator-snapshot models. IDs start from 1 on the
first creation. No old rounds, snapshots or creator memberships are imported.
The existing World, Operators, Sectors, Challenges, staking delegation, artwork
and game rules are preserved.

Control switches its deadline snapshots to the new models. Every drop must have
a nonzero staking-pool policy; missing policies fail onchain and in the frontend.
Explicit non-staking policies still support other ERC-20 tokens and NFT prizes.
No Jackpot API, selector, environment-variable alias or payout fallback exists in
the active source. The old onchain resource remains as cancelled history.

## Confirmed fresh contract deployment

The new SupplyDrop system is
`0xb47dd48f3d3c995c33ef408366a81dd8c90a0a3fb75fd7fc5df94f0092e587`,
with class
`0x30cd46cd2d38b43c059c6bb5cfd6947ff2c0fb429a294a79d0d44d2103a2bef`.
The World address is unchanged. Control was upgraded at its existing address.

Dojo rejects changes to an existing model's key names, including the proposed
`jackpot_id` rename on the empty policy resource. That registration attempt
failed during estimation and did not change the World. The final implementation
uses new `SupplyDropStakingPolicy` and `SupplyDropClaimHoldCreated` resources.
All 13 SupplyDrop resources are new; only Control is an in-place system upgrade.
There is no storage migration or old-field alias.

Sozo's batch declaration also stopped on a fee-balance error after 12 accepted
declarations. Canonical class checks identified the two missing models, which
were declared individually with explicit, validated fee bounds. The schema
correction required three additional class declarations; the superseded class
definitions remain unused. No uncertain transaction was automatically resubmitted.

Five successful migration transactions at blocks 14,588,014 through 14,588,033
registered the resources, granted permissions and initialized the fresh system.
See [migration receipts](supplydrop-migration-receipts.json),
[final class definitions](supplydrop-final-resources.json), and
[final inspection](supplydrop-inspect-after.json).

Thirteen obsolete writer permissions were then revoked in two successful
transactions at blocks 14,588,113 and 14,588,118. This removed the retired
Jackpot's grants and Control's old snapshot grants. See
[revocation receipts](supplydrop-revocation-receipts.json) and
[verified permissions](supplydrop-obsolete-writers.json).

At final contract verification block 14,588,150:

- All 14 intended class hashes matched the compiled source.
- All 36 configured writer grants were present after obsolete grants were removed.
- The new counter was zero and both old and new escrow balances were zero.
- The new active-round getter reported no active drop; missing policies reverted.
- No Jackpot selectors were exposed by the new system.
- GameConfig was unchanged; neutral Sector 1999 still required 10 STRK, with a
  10,800-second challenge period, 2,000-Sector limit and the same staking pool.
- The admin remained authorized for fresh creation. Old creator memberships were
  not copied into the new role.

The admin received the requested 450 STRK top-up. Its balance fell from
505.454873919047029120 STRK immediately before fresh declarations to
234.038864615034231584 STRK after final cleanup: **271.416009304012797536 STRK**
for declarations, migration and permission cleanup. Unused funds remain in that
account. Recovery fees were paid before this measurement. Public state is in
[supplydrop-verified.json](supplydrop-verified.json). The private RPC tunnel was
closed after verification.

## Application cutover

The Mainnet preset and production configuration use the verified new address.
Fly uses only `SUPPLY_DROP_SYSTEM_ADDRESS`, `SUPPLY_DROP_KEEPER_ACCOUNT_ADDRESS`
and `SUPPLY_DROP_KEEPER_PRIVATE_KEY`, with the existing keeper signer verified
against its onchain public key. Vercel uses `VITE_SUPPLY_DROP_SYSTEM_ADDRESS`.
The corresponding old Jackpot variables have been removed.

The API was deployed with `fly deploy --ha=false` to the existing Machine
`873ed2c03e03d8` in `sjc`, one shared CPU and 512 MB RAM, still attached to the
same `stakewars_data` volume `vol_rnzpnz0emp9zn6pr`. Its image is
`registry.fly.io/stakewars:deployment-01M224NHKBQA5308PG6VDX95FH`.
Health and readiness returned HTTP 200, config reported `SN_MAIN` with image
uploads enabled, stats and Torii health succeeded, and the new model queries
returned empty collections with the correct production CORS origin. Torii was
advancing through block 14,588,299 after restart. No index or artwork reset was
needed. See [API verification](supplydrop-api-verification.json).

Vercel production deployment `dpl_DGwuVBaNRvTKWSPVPGXaHLY6gvu3` is ready at
[stakewars.gg](https://stakewars.gg), built from this implementation. Browser verification
confirmed the landing's no-active-drop state, `/play/drop` with no active or past
drops, and `/play/drop/create` displaying the verified new contract address.
The wallet-disconnected creator form stayed disabled; no funding transaction was
submitted. The served bundles contained the new selectors and model queries,
and no old Jackpot address, query or configuration reference. See
[web verification](supplydrop-web-verification.json).

Shared Sepolia has not been migrated by this work. Its tracked SupplyDrop address
is deliberately blank rather than pointing at the old Jackpot. Local previews
continue using Sepolia for other features; testing SupplyDrop there requires a
separately approved Sepolia migration.

## Validation

- Recovery package: 8 tests passed; deployed refund verified on Mainnet.
- Fresh contracts: 82 tests cover payouts, authorization, token behavior,
  post-deadline snapshots, holds, failed staking rollback and missing policies.
- Web: 308 tests passed with `NODE_OPTIONS=--no-experimental-webstorage` on Node 26;
  production build, lint and formatting passed.
- API: tests, build, Go vet and formatting passed; Fly config validation passed.
