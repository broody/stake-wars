# STRK20 Privacy Integration Plan — Stake Wars + Whisper sealed bidding

Updated 2026-08-24 by the strk20-privacy-integration skill. Stake Wars' STRK20 scope is exclusively Whisper's private sealed-bidding mechanism for the Arbiter billboard.

**Status:** Phase A completed on 2026-08-24. Whisper is linked at
`vendor/whisper` as a pinned Git submodule. Later phases remain proposed and
require separate developer approval; this planning update does not approve
Phase B, a deployment, or a transaction.

This plan supersedes the broader gameplay-edict exploration for the first
Arbiter release. Winning a recurring Whisper auction grants one bounded,
off-chain privilege: control of the image displayed on a floating billboard in
front of the orbiting Arbiter. It does not alter FORCE, Sector rules, staking,
the Dojo World, or administrative configuration.

## 1 Combined hackathon product boundary

For the STRK20 Private Sprint, **Stake Wars is the registered product and demo
repository, and Whisper is its reusable privacy engine**. The two repositories
form one submission without collapsing their ownership boundaries:

| Whisper — standalone library                                          | Stake Wars — consuming dapp                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cairo Vickrey auction and STRK20 callbacks                            | Arbiter auction and billboard UX                                                              |
| Headless bidder SDK and encrypted reveal capsule                      | Ready Wallet connection, consent, and action submission                                       |
| Vault operator, discovery, acceptance, settlement, and recovery       | Canonical round registry, public read model, winner claim, artwork authorization, and display |
| Reusable off-chain/ERC-20/ERC-721/ERC-1155 fulfillment primitives     | Stake Wars-specific off-chain controller entitlement                                          |
| Independent releases, security review, deployments, and documentation | Public game deployment, demo, and root `strk20.json` submission evidence                      |

`vendor/whisper` pins the exact Whisper source reviewed by Stake Wars. It is the
source and cross-repository verification boundary, not an implicit production
package release or co-location of the Whisper operator on the Stake Wars API
Machine. Production frontend code should consume an exact tagged
`@whisper-trade/sdk` release built from that pinned source, and the operator
must remain a separately deployed service with its own database and secrets.

The root `strk20.json` is the single hackathon manifest. It may list the current
Whisper Sepolia contract as progress evidence, but `transactions` remain empty
until at least three successful **Mainnet** transactions touching the live
STRK20 pool have been executed with explicit approval and independently
verified. Sepolia hashes must not be presented as qualifying Mainnet evidence.

## 2 Project and dependency snapshot

- Stake Wars already uses React 19, Vite, `starknet@10.7.0`, Wallet API
  `0.10.3`, the maintained Starknet Start React stack, and Ready-only wallet
  selection. `apps/web/src/game/contexts/WalletContext.tsx` already constructs
  `WalletAccountV6` after a capability-only version check.
- `/play` already renders a clickable, camera-trackable Arbiter through
  `apps/web/src/game/components/3d/OrbitalArbiter.tsx`,
  `ArbiterCameraTracker.tsx`, and `ArbiterModal.tsx`. The tracking state is
  represented by `?tracking=arbiter` in `World.tsx`.
- The existing image pipeline already provides wallet authentication,
  short-lived direct object-store uploads, file-signature and dimension
  validation, moderation state, and public image delivery. Its authorization is
  currently tied specifically to Sector ownership and must not be reused
  without a separate Arbiter-winner verifier.
- `vendor/whisper` pins Whisper commit
  `ce6426d5ce00f1b1a64d67a02a15d0cc65e2fffb`, whose active experimental
  Sepolia v0.4 contract is recorded in
  `vendor/whisper/deployments/sepolia.json`. Updating the gitlink is an explicit
  compatibility decision and requires both repositories' checks.
- Whisper's `@whisper-trade/sdk@0.3.0` builds the standard private
  `transfer + invoke` bid actions and encrypted reveal capsule. The Whisper
  operator exposes public configuration and idempotent capsule upload. The
  Cairo contract exposes `get_auction` and `get_result`, and publishes accepted
  tranche counts and settlement results.
- Whisper has completed a full Sepolia lifecycle using official SDK action
  semantics, but the interactive Ready handoff and additive top-up flow remain
  unverified. Whisper is experimental, custodial, and unaudited.

## 3 Chosen integration route

Use the normal-dapp Wallet API path through Stake Wars' existing
`WalletAccountV6`. The browser imports only Whisper's headless bidder builders,
creates and encrypts the bid opening, uploads the ciphertext capsule, and asks
Ready to execute the returned action array. The bid flow never requests or
receives the user's viewing key, selected notes, proofs, or private balances.

No new Cairo consumer contract is required for the first billboard because the
prize is entirely off-chain. The Go API can verify the canonical Whisper result
and an authenticated winner-commitment opening before authorizing the existing
object-storage flow. Reconsider an on-chain Arbiter registry only if the prize
later controls on-chain gameplay.

## 4 Privacy boundary

| Hidden before settlement                                                                         | Public before settlement                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Bid amount, bidder wallet relationship, refund destination, bid salt, and billboard claim secret | Auction token, reserve, deadlines, capacity, group/tranche handles, submission count, funded-tranche count, commitments, and timing |

| Still private after settlement                                                                                                     | Newly public after settlement                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Viewing keys, notes, proofs, private refund/change/proceeds recipients, and the wallet-to-bid relationship until the winner claims | Every accepted tranche amount and salt, aggregate winning bid, second-highest bid, clearing price, winner commitment, and settlement time |

Whisper's 1-of-1 operator can decrypt bid capsules and controls the escrow vault;
the auction is sealed from the public and competing bidders, not from that
operator. Claiming the billboard intentionally discloses the winning wallet to
Stake Wars and, once displayed as the controller, to the public. A public
STRK20 deposit immediately before bidding creates timing and amount-correlation
risk; the UI should direct bidders to use already-mature private notes.

## 5 `/play` and Arbiter product shape

Use `Core | Force | Arbiter | Operator` as the primary navigation. Clicking the
in-world Arbiter keeps camera tracking in `/play` and opens a compact summary in
the existing top-right HUD position. The summary shows only the current phase,
deadline, reserve/funding counters, and current controller, with a link to the
dedicated `/play/arbiter` route. The dedicated page owns the full auction UI.
If the connected wallet is the current controller, both surfaces may expose an
image-upload affordance; upload behavior remains out of scope until its phase.

Desktop composition:

```text
+--------------------------------------------------------------------------+
| STAKE//WARS     CORE       FORCE       ARBITER       OPERATOR      WALLET |
+--------------------------------------------------------------------------+
|                                                                          |
|                         THE CORE                                         |
|                    o                                                     |
|                 ARBITER  [ floating 16:9 transmission plate ]            |
|                                                                          |
|                                              +-------------------------+ |
|                                              | ARBITER // BIDDING      | |
|                                              | ROUND 07      01:42:19 | |
|                                              | CONTROLLER  0x04…beef | |
|                                              | [ OPEN AUCTION UI  → ] | |
|                                              +-------------------------+ |
+--------------------------------------------------------------------------+
```

The memorable visual element is the **transmission plate**: a thin 16:9 image
plane floating just ahead of the tetrahedral Arbiter, framed by four terminal
registration marks. It remains in the existing monochrome palette and gains no
new accent color. It should face the camera enough to remain legible while
retaining a stable spatial offset from the Arbiter. Motion is limited to the
existing orbit plus one brief synchronization pulse when a new approved image
becomes active, with reduced-motion support.

The console has explicit lifecycle states:

1. **No round:** current billboard, `NO AUCTION SCHEDULED`, and no transaction
   affordance.
2. **Bidding:** countdown, reserve, payment token, submission count,
   funded-tranche count, capacity, bid input, and `PLACE SEALED BID`. Never show
   a leading bidder, current highest amount, or guessed bidder count.
3. **Acceptance grace:** bidding disabled; submitted notes may still become
   funded before `force_reveal_after`.
4. **Settling:** reveal window open; show deterministic settlement pending and
   the abort deadline. Do not claim a winner before `get_result` succeeds.
5. **Settled, unclaimed:** winning bid, second-highest bid, clearing price,
   settlement time, and `WINNER UNCLAIMED`.
6. **Settled, claimed:** public controller address, clearing price, active
   billboard preview, and the next scheduled round. The authenticated winner
   also sees `UPLOAD IMAGE` or `REPLACE IMAGE`.
7. **Aborted/recovery:** explain that no billboard changed and that private
   refunds still depend on the current operator recovery process.

## 6 Canonical round read model

Whisper permits anyone to create auctions and does not define a canonical
Stake Wars round. The frontend must therefore not select an auction merely by
ID or by taking the latest `AuctionCreated` event.

Add an `arbiter_rounds` table to the API database containing at minimum:

- network, Stake Wars round ID, Whisper address, auction ID, expected creator;
- expected payment token, metadata hash, winner-payload domain, and vault;
- billboard start/expiry policy and created/updated timestamps; and
- optional claimed controller, claim timestamp, and active artwork ID.

Expose one public aggregate endpoint:

```text
GET /v1/arbiter
```

It returns the canonical current round, validated Whisper auction state, result
when settled, public claim/controller state, and approved billboard metadata.
The API must read Whisper by RPC and reject configuration mismatches rather than
trusting database fields alone. It must never expose capsule plaintext,
operator-only state, IP-derived bidder analytics, or speculative winner data.

For the first Sepolia round, registering the canonical auction can be an
explicit operator/admin procedure. A recurring scheduler and automatic auction
creation are a later operational phase; do not put a mutable current auction ID
in the Vite environment or require a frontend deployment for every round.

## 7 Winner claim design

At initial bid creation, generate a cryptographically random claim secret and
commit to:

```text
Poseidon(
  "STAKEWARS_ARBITER_V1",
  chain_id,
  whisper_address,
  auction_id,
  connected_wallet_address,
  claim_secret
)
```

Use the result as Whisper's application-defined `winner_commitment` and set a
fixed Stake Wars `winner_payload_domain` in the canonical auction. Store the
claim ticket locally under the exact network, Whisper address, auction ID, and
group handle; never log it or send it with analytics. The UI must warn that
clearing browser data before claim can make the billboard prize unclaimable;
an export/recovery design should be decided before meaningful-value auctions.

After settlement, the connected wallet authenticates through Stake Wars'
existing typed-data session and submits the claim secret. The API recomputes
the commitment using the authenticated wallet address, verifies it against the
canonical on-chain `get_result`, atomically records the first valid claim, and
never returns the secret. This prevents address-dictionary attacks during
bidding while making the controller public only after voluntary claim.

## 8 Billboard storage and rendering

- Add Arbiter-specific authorization and completion endpoints; do not weaken
  the existing Sector `CanManageImage` checks or pretend an auction winner owns
  a Sector.
- Reuse Tigris/MinIO, typed-data sessions, randomized versioned object keys,
  MIME/signature checks, reporting, removal, and moderation status. Use a
  separate key prefix such as `arbiter/<network>/<round>/<artwork-id>/...`.
- Prepare one 16:9 display texture and thumbnail, initially no larger than
  `512x288` and `256x144`. Preserve the existing 2 MB encoded-file ceiling and
  WebP/JPEG/PNG allowlist.
- Verify winner authority both before issuing upload URLs and before
  publication. Replacement supersedes metadata only after the new object is
  valid; never delete the previous object first.
- A claimed winner may replace the billboard during their term. The approved
  image remains active until the next **successful** auction settlement; an
  empty or aborted auction leaves the previous approved billboard in place.
- Render the approved texture as a child of `OrbitalArbiter`. The empty state is
  a restrained `SIGNAL AVAILABLE` wireframe rather than a broken image or a
  generic loading skeleton.

## 9 Coupled milestone map

A Whisper milestone is complete for this submission only when Stake Wars has
consumed and verified it at the corresponding boundary. Whisper can remain a
standalone product and reach additional library milestones independently, but
those do not advance the Stake Wars hackathon product until the paired
acceptance gate passes.

| Milestone                       | Whisper deliverable and gate                                                                                                                           | Stake Wars deliverable and acceptance                                                                                                                                                               | Status                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| M0 — integration foundation     | Pin the v0.4 contract/ABI, SDK, operator, public Sepolia deployment metadata, and successful private bid lifecycle                                     | Pin Whisper under `vendor/whisper`; strictly decode the ABI; expose the canonical read-only Arbiter round and lifecycle UI                                                                          | Whisper complete; Stake Wars Phase A complete    |
| M1 — wallet bidder              | Pass live Sepolia Ready tests for initial bid and additive top-up; publish a reviewed SDK tag from the pinned source with browser-compatible packaging | Pin that SDK release; submit least-privileged `transfer + invoke` actions; store claim tickets locally; show submitted versus funded state                                                          | Pending; gates Phase B                           |
| M2 — end-to-end Sepolia product | Run a separately deployed operator with capsule controls, replay-note inventory, settlement, abort, and recovery monitoring                            | Register a canonical off-chain round; bid from `/play/arbiter`; settle; claim the winner commitment; publish and render the billboard                                                               | Pending; gates Phase C and is the demo rehearsal |
| M3 — Mainnet hackathon release  | Complete the approved security gate, deploy against the canonical Mainnet pool, and run a low-value operator rehearsal                                 | Deploy the public product, complete a real auction/claim/display flow, add at least three independently verified Mainnet pool transactions to root `strk20.json`, and publish the three-minute demo | Pending; requires explicit Mainnet approval      |
| M4 — post-sprint hardening      | Independent Cairo/capsule/operator review, durable recovery, then threshold or otherwise reduced custody when feasible                                 | Recurring round operations, incident UX, monitoring, moderation, and a policy for upgrading the pinned Whisper version                                                                              | Post-sprint                                      |

## 10 Stake Wars delivery phases

### Phase A — read-only Arbiter surfaces — ✅ done 2026-08-24

1. Add typed Arbiter round/result models and `api.getArbiter()` in
   `apps/web/src/game/services/api.ts`.
2. Replace the static `ArbiterModal.tsx` briefing with a compact state-driven
   `/play` summary and a full `/play/arbiter` console for every lifecycle state,
   preserving `?tracking=arbiter`, Escape, focus visibility, and camera tracking.
3. Add an `ArbiterContext` that polls the aggregate endpoint at a modest
   interval and on transaction refresh. Keep it independent from Sector image
   polling.
4. Keep the in-world transmission plate hidden in Phase A. Surface light status
   details in the top-right Arbiter card and full detail on `/play/arbiter`.
5. Implement the Go read model, Whisper RPC decoder, canonical-round database
   migration, and `GET /v1/arbiter` endpoint with fixture-backed tests.
6. Verify desktop and mobile layouts on `http://localhost:3000/play`; no bidding,
   claim, upload, deployment, or external transaction is part of Phase A.

### Phase B — Ready Wallet private bid submission

1. Establish a deployable SDK dependency. Publish a tagged, reviewed
   `@whisper-trade/sdk` release from the exact `vendor/whisper` commit and pin it
   exactly. Keep the vendor gitlink for review and verification; do not use a
   local `link:` dependency for the Vercel application.
2. Before publishing, confirm browser support for the SDK's ES2024 output,
   reconsider its Node `>=24` package engine for a browser-consumed package,
   and align its `starknet@10.7.1` dependency with Stake Wars' `10.7.0` pin or
   expose a compatible peer dependency to avoid duplicate Starknet runtimes.
3. Expose a least-privileged WalletContext action that submits a supplied
   `STRK20_ACTION[]` with `WalletAccountV6.strk20InvokeTransaction`; do not
   expose the wallet object or add a balance-read prompt.
4. Add bid preparation in a focused `services/whisper.ts`: random nonce, salt,
   refund commitment, claim ticket, reveal commitment, encrypted capsule, and
   standard Whisper actions.
5. Upload the encrypted capsule before invoking the wallet. Configure the
   Whisper operator for the Stake Wars origin, strict body limits, rate limits,
   and minimal logs. Do not authenticate capsule upload with the bidder's
   public wallet, because that would directly link the wallet to the sealed bid.
6. Track the returned group/bid handles locally and poll public `get_bid` state
   until the tranche is funded or the acceptance window closes. A submitted
   transaction is not yet an accepted bid.
7. Keep additive top-ups out of the first UI until the interactive Ready initial
   bid and top-up paths have both passed live Sepolia testing.

### Phase C — claim and billboard publishing

1. Refactor the existing frontend wallet-session helper so Sector and Arbiter
   uploads share authentication without sharing authorization rules.
2. Add authenticated claim, upload-authorization, upload-completion, list, and
   removal/reporting paths for Arbiter artwork.
3. Re-read the canonical Whisper result and claim status at authorization and
   completion; test replay, wrong wallet, wrong secret, superseded round,
   concurrent claim, replaced image, removed image, and storage failure cases.
4. Add winner-only crop/preview/upload controls inside the Arbiter Console and
   refresh the 3D texture only after the API publishes the approved record.
5. Manually verify a complete Sepolia round using Ready before enabling any
   Mainnet auction or meaningful bid amount.

### Phase D — Mainnet hackathon release, recurring operations, and hardening

1. Define round cadence, reserve, capacity, bidding/grace/settlement windows,
   proceeds recipient, no-sale behavior, and who is authorized to register the
   canonical next round.
2. Add explicit round creation/registration tooling and monitoring for capsule
   backlog, note acceptance, replay-note inventory, relayer fees, settlement,
   abort deadline, claim, image moderation, and stale billboard state.
3. Add durable operator database backup/recovery, key rotation, incident
   procedures, capsule upload abuse controls, and a low-value rehearsal.
4. Obtain independent Cairo, capsule-format, and operator-custody review before
   Mainnet or meaningful funds. Whisper currently has no bidder-side reclaim
   path and its operator can inspect bids early or withhold/misdirect refunds.
5. After explicit Mainnet approval, run the combined low-value lifecycle and
   independently verify every qualifying pool transaction before adding at
   least three hashes to the root `strk20.json`.
6. Publish a three-minute demo showing Whisper's reusable mechanics through the
   Stake Wars bidder, settlement, claim, and billboard flow; keep the public
   demo URL rooted in Stake Wars.

## 11 Verification matrix

- Web: disconnected, unsupported wallet, bidding, grace, settling, settled with
  and without winner, unclaimed winner, claimed non-winner, claimed winner,
  aborted, API unavailable, billboard unavailable, and reduced-motion tests.
- API: canonical auction validation, felt/address normalization, ABI decoding,
  chain time rather than browser time, settlement result validation, claim
  atomicity, authorization at both upload stages, MIME/signature/dimension
  checks, moderation, and expiry/supersession tests.
- Whisper: verify the `vendor/whisper` gitlink matches the intended reviewed
  commit, then run contract, SDK, operator, docs, deployment JSON, and
  whitespace checks from the submodule before pinning a release.
- Stake Wars: run `pnpm --filter @stakewars/web test`, build, lint, format check,
  `pnpm --filter @stakewars/api test`, API build, and `git diff --check`.
- Manual Sepolia: use the shared Sepolia Stake Wars environment, Ready Wallet,
  already-mature private STRK notes, the configured Whisper operator, and the
  real `/play` view. Verify the capsule arrives, the tranche becomes funded,
  settlement publishes the correct result, only the winner can claim, and only
  the claimed winner can publish the visible billboard.

## 12 Decisions still required before Phase B

1. Confirm whether every Ready wallet may bid or bidding requires an active
   Stake Wars Operator.
2. Choose initial round cadence, billboard term, reserve, maximum accepted
   tranches, and proceeds destination.
3. Decide whether a lost claim ticket permanently forfeits the billboard or
   whether an operator-assisted recovery mechanism is acceptable.
4. Decide when a new image becomes public: immediately after technical
   validation, only after moderation approval, or immediately with a report and
   removal path.
5. Confirm package distribution for `@whisper-trade/sdk` and production hosting
   for the Whisper operator. The current public Sepolia prover/discovery setup
   has no published production availability commitment.

## 13 Freshness and references

Freshness was rechecked on 2026-08-24. Stake Wars' current wallet packages are
already at or above the required STRK20-capable versions. The stable Wallet API
remains `0.10.3`; a `0.10.4` release candidate is in flight. The get-starknet
`next` tags have moved, but no dependency upgrade is required for the Whisper
integration without a demonstrated compatibility need.

- Wallet API overview: https://strk20-by-example.org/starknet-wallet-api/overview
- Private DeFi composition: https://strk20-by-example.org/starknet-wallet-api/private-defi
- starknet.js wiring: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- Whisper repository: https://github.com/broody/whisper
- Vendored Whisper protocol: `vendor/whisper/docs/PROTOCOL.md`
- STRK20 Private Sprint submission rules: https://github.com/starkience/strk20-hackathon#strk20json
