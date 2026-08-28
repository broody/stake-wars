# STRK20 Privacy Integration Plan — Stake Wars + Whisper sealed bidding

Updated 2026-08-27 by the strk20-privacy-integration skill. Stake Wars' STRK20 scope is exclusively Whisper's private sealed-bidding mechanism for the Arbiter billboard.

**Status:** Phase A completed on 2026-08-24, its start-on-bid compatibility
extension completed on 2026-08-26, and active Whisper raw-event indexing was
verified locally on 2026-08-27. Live canonical history was implemented on
2026-08-27. Whisper is linked at `vendor/whisper` as a pinned Git submodule.
Ready Wallet bidding, five-minute settlement, recurring round creation, and
automatic winner resolution were implemented and exercised on Sepolia on
2026-08-27. Billboard upload authorization and the full 72-hour rehearsal
remain proposed; no Mainnet transaction is approved by this plan.

This plan supersedes the broader gameplay-edict exploration for the first
Arbiter release. Winning a recurring Whisper auction grants one off-chain
privilege: control of the image displayed on a floating billboard in front of
the orbiting Arbiter. The controller keeps that privilege until a later
qualifying winner is resolved; an idle, resolving, aborted, or no-winner auction
does not create a control gap. It does not alter FORCE, Sector rules, staking,
the Dojo World, or administrative configuration.

## 1 Combined hackathon product boundary

For the STRK20 Private Sprint, **Stake Wars is the registered product and demo
repository, and Whisper is its reusable privacy engine**. The two repositories
form one submission without collapsing their ownership boundaries:

| Whisper — standalone library                                          | Stake Wars — consuming dapp                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cairo Vickrey auction, start-on-bid scheduling, and STRK20 callbacks  | Arbiter auction, continuous-controller policy, and billboard UX                               |
| Headless bidder SDK and encrypted reveal capsule                      | Ready Wallet connection, consent, and action submission                                       |
| Vault operator, discovery, acceptance, settlement, winner disclosure, and recovery | Canonical round registry, public read model, automatic controller resolution, artwork authorization, and display |
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
  represented by `?tracking=arbiter` in `World.tsx`; the dedicated auction and
  history routes are `/arbiter` and `/arbiter/history`.
- The existing image pipeline already provides wallet authentication,
  short-lived direct object-store uploads, file-signature and dimension
  validation, moderation state, and public image delivery. Its authorization is
  currently tied specifically to Sector ownership and must not be reused
  without a separate Arbiter-winner verifier.
- `vendor/whisper` pins Whisper commit
  `24974e012546b3d1a7bd154f6dead8f59cfb251b`. The active experimental Sepolia
  v0.4 deployment is `0x02ca43bf2b1e68ae9f39a43e36fce239097444985b4b774b06d0f628a4d678c4`
  from block `14134212`; its deployed source commit is `dd8b61a`, which includes
  start-on-bid scheduling and the complete indexable event history. Auction 1
  smoke-tested the full absolute-schedule lifecycle and all five expected
  history events. A separate live first-bid smoke remains required to prove
  `AuctionStarted` and the configured resolved deadline on this deployment.
- Whisper's still-unreleased `@whisper-trade/sdk@0.3.0` source builds the
  standard private `transfer + invoke` bid actions, encrypted reveal capsule,
  and schedule encodings. The Whisper operator exposes public configuration
  and idempotent capsule upload. The Cairo contract exposes `get_auction` and
  `get_result`, and publishes accepted tranche counts and settlement results.
- Whisper has completed a full Sepolia lifecycle using official SDK action
  semantics, but the interactive Ready handoff and additive top-up flow remain
  unverified. Whisper is experimental, custodial, and unaudited.
- `contracts/torii_sepolia.toml` and the production Torii launcher register the
  active Whisper deployment as an `OTHER` contract with raw events enabled.
  Local Torii 1.8.15 indexed and matched `AuctionCreated`, `BidSubmitted`,
  `BidFunded`, `BidRevealed`, and `AuctionSettled` for smoke auction 1. The
  production configuration is committed but has not been deployed or
  backfilled as part of this plan.

## 3 Chosen integration route

Use the normal-dapp Wallet API path through Stake Wars' existing
`WalletAccountV6`. The browser imports only Whisper's headless bidder builders,
creates and encrypts the bid opening, uploads the ciphertext capsule, and asks
Ready to execute the returned action array. The bid flow never requests or
receives the user's viewing key, selected notes, proofs, or private balances.

No new Cairo consumer contract is required for the first billboard because the
prize is entirely off-chain. After `get_result` confirms settlement, the
Whisper operator decrypts only the winning group's authenticated capsule and
publishes its refund recipient; the Go API matches the disclosed group and
winner commitment to the immutable result before activating that address.
Reconsider an on-chain Arbiter registry only if the prize later controls
on-chain gameplay.

## 4 Privacy boundary

| Hidden before settlement                                                                         | Public before settlement                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bid amount, bidder wallet relationship, refund destination, bid salt, and ephemeral winner secret | Auction token, reserve, schedule kind and durations, resolved deadlines, capacity, group/tranche handles, submission count, funded-tranche count, commitments, and timing |

| Still private after settlement                                                                                                     | Newly public after settlement                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Viewing keys, notes, proofs, losing refund recipients, and losing wallet-to-bid relationships | Every accepted tranche amount and salt, aggregate winning bid, second-highest bid, clearing price, winner commitment, settlement time, and the verified winning address |

Whisper's 1-of-1 operator can decrypt bid capsules and controls the escrow vault;
the auction is sealed from the public and competing bidders, not from that
operator. Automatic winner resolution intentionally discloses only the winning
wallet to Stake Wars and the public after settlement. A public
STRK20 deposit immediately before bidding creates timing and amount-correlation
risk; the UI should direct bidders to use already-mature private notes. For a
pending auction, the first successful private bid also publicly fixes the
configured deadline through `AuctionStarted`; later bids do not extend it.

For the first canonical Sepolia rehearsal rounds, set
`ARBITER_BIDDING_DURATION=5m`. This is a temporary test override: the default
and production target remain 72 hours, and the override must be removed before
the M2 full-duration rehearsal or any Mainnet auction.

## 5 `/play` and Arbiter product shape

Use `Core | Force | Arbiter | Operator` as the primary navigation. Clicking the
in-world Arbiter keeps camera tracking in `/play` and opens a compact summary in
the existing top-right HUD position. The summary shows only the current phase,
the deadline when one exists, the current controller, and one primary action,
with a link to the dedicated `/arbiter` route. The dedicated page owns the
full auction UI.
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
2. **Pending:** current controller remains visible; show `STARTS ON BID`, the
   configured duration, and `PLACE SEALED BID`, but no fabricated deadline.
3. **Bidding:** show the resolved countdown and bid action. Keep reserve,
   payment token, submission/funding counts, and capacity in progressive
   disclosure. Never show a leading bidder, current highest amount, or guessed
   bidder count.
4. **Resolving:** collapse acceptance grace and settlement into one simple
   user-facing state while retaining their distinct deadlines in details and
   API data. Do not announce a winner before `get_result` succeeds.
5. **Settled, no winner:** keep the current controller and billboard active
   while the worker prepares the next pending round.
6. **Settled, verifying winner:** keep the prior controller active briefly;
   show the result and `VERIFYING` while the worker validates the operator's
   post-settlement disclosure.
7. **Winner resolved:** hand control to the verified winning address, show the active
   billboard preview, and expose `UPLOAD IMAGE` or `REPLACE IMAGE` to that
   wallet while the next pending round remains available.
8. **Aborted/recovery:** explain that control did not change and that private
   refunds still depend on the current operator recovery process.

## 6 Canonical rounds, history, and coordinator

Whisper permits anyone to create auctions and does not define a canonical
Stake Wars round. The frontend must therefore not select an auction merely by
ID or by taking the latest `AuctionCreated` event.

The existing `arbiter_rounds` table and `GET /v1/arbiter` aggregate establish
the canonical current round. Keep direct Whisper RPC as the authority for its
current state and result; Torii is a rebuildable history/enrichment source and
may lag without blocking round cycling. The smoke-tested Whisper auction 1 is
protocol evidence, not a canonical Stake Wars round, and must not be imported
into controller or winner history.

Keep these durable records:

- `arbiter_rounds`: network, monotonically increasing Stake Wars round ID,
  Whisper address and auction ID, expected creator, payment token, metadata
  hash, winner-payload domain, vault, expected schedule/configuration, optional
  resolved controller, activation timestamp, and active artwork ID;
- `arbiter_round_outcomes`: one immutable terminal projection per canonical
  round, including terminal status, whether a winner exists, winner commitment,
  winning bid, clearing price, funded bid count, settlement transaction, and
  terminal/projected timestamps; and
- `arbiter_cycle_jobs`: one unique successor job per terminal predecessor,
  including expected next round/configuration/metadata hash, state, transaction
  hash, attempts, last error, and timestamps.

Expose these public endpoints:

```text
GET /v1/arbiter
GET /v1/arbiter/history?limit=<n>&cursor=<opaque>
```

The current endpoint returns the canonical round, validated on-chain state and
result, public controller state, and approved billboard metadata. History
returns only canonical settled rounds that have a winner, newest first. Its
`winnerAddress` remains nullable and renders as `VERIFYING` until the worker
validates the operator disclosure; it must never substitute the public winner
commitment for an address.
Use `AuctionSettled.winning_bid` for the winning bid and
`funded_bid_count` for the `BIDS` column. That count represents funded logical
bid groups, not provably unique wallets, so the UI must not label it
`BIDDERS`.

The Torii reader must validate the raw event's emitting Whisper address,
selector, auction ID in event keys, exact data shape, and transaction hash. It
queries keyed selectors with pagination and enriches the direct-RPC terminal
projection asynchronously. The coordinator proceeds when RPC proves a terminal
state; a history row becomes public after the matching settlement event has
been indexed so the UI never fabricates a count or transaction.

Run an idempotent coordinator duty immediately at API startup and then on a
configurable ticker (20 seconds by default), with only one reconciliation
active at a time. Reconcile all incomplete outcomes/jobs, not only the newest
database row, and apply this state machine:

1. A pending start-on-bid round with no successful bid stays pending forever;
   do not create empty timed rounds.
2. Bidding, acceptance, and settlement-in-progress states do nothing.
3. Settled with a winner, settled without a winner, and aborted are all
   terminal and each schedules exactly one next pending round. Creating the
   successor does not wait for winner disclosure to finish.
4. On a terminal state, upsert the immutable outcome and uniquely keyed cycle
   job. Derive the successor's metadata hash deterministically from the
   predecessor and next Stake Wars round.
5. Before submission, search chain/Torii for a matching successor event and
   validate its creator and complete configuration. If exactly one exists,
   register it; if more than one exists, fail closed and alert.
6. If none exists, the isolated `RoundRestarter` submits `create_auction`,
   persists its transaction hash, waits for acceptance/finality, reads the
   exact auction back from RPC, and atomically inserts the canonical successor.
   Deterministic event recovery covers a crash after submission but before the
   transaction hash is stored.

Database uniqueness on the predecessor job, Stake Wars round ID, and Whisper
auction identity is the final duplicate guard. Transient RPC/Torii/receipt
errors are logged, measured, and retried on the next tick; they must not stop
the API worker loop. Invalid static configuration fails startup. A per-duty
timeout prevents the other periodic duties from being starved.

Do not create the first auction as an implicit API-startup side effect. An
explicit bootstrap/admin command creates or registers the initial canonical
pending auction, validates its full readback, and then enables normal
reconciliation. `RoundRestarter` is the only component allowed to access the
authorized creator through a secret-provider boundary. The production image
currently has no Node runtime, so implement a narrow Go `RoundSubmitter` adapter
or a separately deployed signing service; do not import Whisper operator keys
or expose raw signing material to unrelated worker duties.

Do not put a mutable current auction ID in the Vite environment or require a
frontend deployment for each round.

## 7 Automatic winner resolution

At initial bid creation, generate a cryptographically random ephemeral winner
secret and commit to:

```text
Poseidon(
  "STAKEWARS_ARBITER_V1",
  chain_id,
  whisper_address,
  auction_id,
  connected_wallet_address,
  winner_secret
)
```

Use the result as Whisper's application-defined `winner_commitment` and set a
fixed Stake Wars `winner_payload_domain` in the canonical auction. The secret
is used only while preparing the bid and is discarded; the browser stores no
claim ticket, winner secret, encrypted capsule, note, or proof.

The encrypted Whisper capsule already binds `refund_recipient` to the public
bid's `refund_commitment`. Once `get_result` is available, the operator selects
the winning group, decrypts its capsule, revalidates the reveal and refund
commitments, and exposes only the winning address through the authenticated
`GET /v1/auctions/<auction-id>/winner`. Before settlement that endpoint returns
no address, and losing addresses are never published.

The Stake Wars worker matches the disclosed auction ID, winner group, and
winner commitment against its RPC-verified immutable outcome, normalizes the
address, and atomically activates it at the settlement timestamp. Controller
selection remains monotonic by Stake Wars round ID, so retries or delayed
processing cannot roll control backward. The winning wallet later proves
control through the existing typed-data session when authorizing artwork; it
does not submit a separate claim or retain browser recovery material.

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
- A resolved winner may replace the billboard during their term. The approved
  image remains active until the next **verified winner resolution**; a pending,
  resolving, settled-no-winner, disclosure-pending, or aborted auction leaves the
  previous approved billboard in place.
- Render the approved texture as a child of `OrbitalArbiter`. The empty state is
  a restrained `SIGNAL AVAILABLE` wireframe rather than a broken image or a
  generic loading skeleton.

## 9 Coupled milestone map

A Whisper milestone is complete for this submission only when Stake Wars has
consumed and verified it at the corresponding boundary. Whisper can remain a
standalone product and reach additional library milestones independently, but
those do not advance the Stake Wars hackathon product until the paired
acceptance gate passes.

| Milestone                                  | Whisper deliverable and gate                                                                                                                                                                                             | Stake Wars deliverable and acceptance                                                                                                                                                                                                                                            | Status                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| M0 — foundation and schedule compatibility | Pin the start-on-bid contract/ABI, SDK source, operator, and current public Sepolia metadata; keep the existing absolute-schedule smoke evidence distinct from new schedule support                                      | Pin Whisper under `vendor/whisper`; dual-decode the legacy and start-on-bid ABI; validate the configured duration (five minutes for initial Sepolia rehearsals, 72 hours by default); expose pending through terminal lifecycle states; keep controller lookup independent from the newest round                                               | Complete: canonical Sepolia auction 2 is pending and its creation event is indexed |
| M1 — wallet bidder                         | Publish a reviewed SDK tag from the pinned source and pass a live Sepolia Ready test where the first private bid emits `AuctionStarted`; prove the resolved deadline matches the configured five-minute rehearsal window and later bids/top-ups do not move it | Pin that SDK release; submit least-privileged `transfer + invoke` actions; keep winner material out of browser storage; distinguish submitted from funded; recover transaction state by polling when the relayed transaction is slow | Complete for the five-minute Ready path; published SDK packaging and additive top-up remain |
| M2 — recurring Sepolia product             | Run the separate operator with capsule controls, replay-note inventory, settlement, post-settlement winner disclosure, abort, recovery monitoring, and a full canonical three-day round | Start from a pending canonical round; bid from `/arbiter`; preserve the prior controller through bidding/resolution; settle, automatically resolve, publish, and render; then have the idempotent worker create and register exactly one next pending round | Five-minute settlement, next-round cycle, and automatic winner-resolution code are complete; billboard publishing and full-duration rehearsal remain |
| M3 — Mainnet hackathon release             | Complete the approved security gate, deploy against the canonical Mainnet pool, and run a low-value operator rehearsal | Deploy the public product, complete a real auction/resolution/display/cycle flow, add at least three independently verified Mainnet pool transactions to root `strk20.json`, and publish the three-minute demo | Pending; requires explicit Mainnet approval |
| M4 — post-sprint hardening                 | Independent Cairo/capsule/operator review, durable recovery, then threshold or otherwise reduced custody when feasible                                                                                                   | Incident UX, expanded monitoring and moderation, tested disaster recovery, and a policy for upgrading the pinned Whisper version                                                                                                                                                 | Post-sprint                                                            |

## 10 Stake Wars delivery phases

### Phase A — read-only Arbiter surfaces — ✅ done 2026-08-24

1. Add typed Arbiter round/result models and `api.getArbiter()` in
   `apps/web/src/game/services/api.ts`.
2. Replace the static `ArbiterModal.tsx` briefing with a compact state-driven
   `/play` summary and a full `/arbiter` console for every lifecycle state,
   preserving `?tracking=arbiter`, Escape, focus visibility, and camera tracking.
3. Add an `ArbiterContext` that polls the aggregate endpoint at a modest
   interval and on transaction refresh. Keep it independent from Sector image
   polling.
4. Keep the in-world transmission plate hidden in Phase A. Surface light status
   details in the top-right Arbiter card and full detail on `/arbiter`.
5. Implement the Go read model, Whisper RPC decoder, canonical-round database
   migration, and `GET /v1/arbiter` endpoint with fixture-backed tests.
6. Verify desktop and mobile layouts on `http://localhost:3000/play`; no bidding,
   winner resolution, upload, deployment, or external transaction is part of Phase A.

### Phase A.1 — start-on-bid compatibility and controller continuity — ✅ done 2026-08-27

1. Pull and pin Whisper commit `24974e012546b3d1a7bd154f6dead8f59cfb251b`,
   then dual-decode the earlier absolute-schedule response and the new
   start-on-bid response without treating zero pending timestamps as dates.
2. Require canonical start-on-bid rounds to use the configured bidding duration,
   validate their resolved duration arithmetic after the first bid, and expose
   the schedule plus nullable timestamps through `GET /v1/arbiter`.
3. Resolve the current controller independently from the newest canonical
   round, so pending, resolving, aborted, no-winner, and disclosure-pending rounds do not
   blank or prematurely replace the active controller.
4. Redesign the Arbiter surfaces around the `WAITING`, configured auction,
   `RESOLVING`, and `CONTROL` stages using the existing theme and font, with
   details kept secondary.
5. Add and test the periodic worker and idempotent `RoundRestarter` boundary.
   The authorized onchain creator/registration implementation remains Phase C;
   no signer, deployment, or external transaction is part of Phase A.1.
6. Configure local and production Torii launchers to index the active Whisper
   contract as an `OTHER` contract and verify all five settlement-history event
   types against smoke auction 1.

### Phase A.2 — live canonical auction history — ✅ done 2026-08-27

1. Add `arbiter_round_outcomes` and `arbiter_cycle_jobs` migrations with unique
   predecessor, round, and Whisper-auction constraints. Keep the existing
   canonical round rows as the allowlist for every projection.
2. Add a Torii raw-event client and settlement projector with strict address,
   selector, key, data-length, transaction, pagination, and felt validation.
   Use direct RPC for current state and allow Torii enrichment to retry when it
   is behind.
3. Add cursor-paginated `GET /v1/arbiter/history`, returning only canonical
   settled rounds with a winner. Join the resolved controller by round; return
   `winnerAddress: null` while disclosure is pending and never return a
   commitment in its place.
4. Add `api.getArbiterHistory()` and a route-scoped history query refreshed on
   focus and about every 30 seconds. Replace the live page's empty array with
   API data; render `VERIFYING`, `BIDS`, and the winning bid.
5. Test Torii lag, malformed/unrelated events, duplicate projection, cursor
   stability, nullable winner resolution, amount formatting, empty history, and API
   failure. Verify locally against the shared Sepolia Torii index without
   treating smoke auction 1 as a Stake Wars winner.

### Phase B — Ready Wallet private bid submission — 🟡 ready for manual test 2026-08-27

The mock selector and mock wallet have been removed, live auction reads refresh
every five seconds, and the Ready submission adapter is implemented. The local
stack now points at the ready Whisper operator, canonical Sepolia auction 2 is
registered as a pending five-minute start-on-bid round, and Torii has indexed
its creation event. Ready 5.33.9's separate prepare-and-submit path loses the
cached paymaster fee target before the second confirmation and fails with
`MISSING_FEE_TRANSFER_TO`, so the adapter uses the wallet's fee-aware one-shot
`wallet_strk20InvokeTransaction` path. Because that Ready version can leave its
request open after broadcasting, the UI temporarily treats an increase from
the round's pre-submit bid count as successful submission. This fallback is
appropriate only while auction traffic is low because a concurrent bidder can
produce the same public signal. The remaining Phase B gate is confirmation that
the submitted tranche becomes funded and fixes the expected deadlines.

1. Establish a deployable SDK dependency. Publish a tagged, reviewed
   `@whisper-trade/sdk` release from the exact `vendor/whisper` commit and pin it
   exactly. Keep the vendor gitlink for review and verification; do not use a
   local `link:` dependency for the Vercel application.
   For the initial local Sepolia rehearsal only, the web adapter may import the
   exact pinned source under `vendor/whisper/sdk`; replace it with the published
   package before deployment.
2. Before publishing, confirm browser support for the SDK's ES2024 output,
   reconsider its Node `>=24` package engine for a browser-consumed package,
   and align its `starknet@10.7.1` dependency with Stake Wars' `10.7.0` pin or
   expose a compatible peer dependency to avoid duplicate Starknet runtimes.
3. Expose a least-privileged WalletContext action that submits a supplied
   `STRK20_ACTION[]` with `wallet_strk20InvokeTransaction`; do not expose the
   wallet object or add a balance-read prompt. Until Ready reliably resolves
   that request after broadcast, allow the Arbiter page's low-volume test flow
   to confirm submission from a round-scoped bid-count increase.
4. Add bid preparation in `services/whisperBid.ts`: random nonce, salt, refund
   commitment, ephemeral winner commitment, reveal commitment, encrypted capsule, and
   standard Whisper actions.
5. Upload the encrypted capsule before invoking the wallet. Configure the
   Whisper operator for the Stake Wars origin, strict body limits, rate limits,
   and minimal logs. Do not authenticate capsule upload with the bidder's
   public wallet, because that would directly link the wallet to the sealed bid.
6. For a pending round, treat only a successful wallet transaction as the
   schedule trigger. Poll `get_auction` until it reports `started_at`, verify
   `bidding_deadline = started_at + configured duration` (five minutes for the
   initial Sepolia rehearsal), and ensure later bids or additive top-ups do not
   move any resolved deadline. A rejected or reverted first bid must leave the
   auction pending.
7. Track the returned group/bid handles locally and poll public `get_bid` state
   until the tranche is funded or the acceptance window closes. A submitted
   transaction is not yet an accepted bid.
8. Keep additive top-ups out of the first UI until the interactive Ready initial
   bid and top-up paths have both passed live Sepolia testing.

### Phase C — automatic winner resolution, billboard publishing, and recurring Sepolia operation

1. Refactor the existing frontend wallet-session helper so Sector and Arbiter
   uploads share authentication without sharing authorization rules.
2. Consume Whisper's post-settlement winner disclosure in an idempotent worker
   duty, verify it against the immutable result, and add upload-authorization,
   upload-completion, list, and removal/reporting paths for Arbiter artwork.
3. Re-read the canonical Whisper result and resolved controller at authorization
   and completion; test disclosure mismatch, wrong wallet, superseded round,
   concurrent resolution, replaced image, removed image, and storage failure cases.
4. Add winner-only crop/preview/upload controls inside the Arbiter Console and
   refresh the 3D texture only after the API publishes the approved record.
5. Wire the existing Arbiter worker into API startup with an immediate pass and
   a configurable ticker defaulting to 20 seconds. Give duties timeouts,
   serialize reconciliation, keep the loop alive after transient failures, and
   fail startup only for invalid static configuration.
6. Project terminal results and create exactly one durable cycle job after
   settled-with-winner, settled-without-winner, or aborted. Leave a bidless
   pending start-on-bid round open indefinitely and ignore every non-terminal
   active phase.
7. Implement `RoundRestarter` behind an isolated authorized Go
   `RoundSubmitter` or separate signing service. Limit raw creator-key access to
   that boundary and never share Whisper operator signing material.
8. Derive deterministic successor metadata, recover an already-submitted
   successor from chain/Torii, and validate its creator and complete
   configuration before registration. Persist the transaction hash, wait for
   acceptance/finality, read the auction back from RPC, and atomically register
   it. Fail closed if multiple matching successors exist.
9. Create every successor with the approved payment token, reserve, capacity,
   vault, off-chain fulfillment, winner domain, configured start-on-bid window,
   and reviewed acceptance/settlement durations. Use an explicit bootstrap
   command for the first canonical round; ordinary API startup must never
   create it implicitly.
10. Preserve the current controller and artwork until a later winner disclosure
    is verified. Enforce monotonically increasing controller round IDs so
    delayed processing cannot replace a newer controller.
11. First verify a complete five-minute Sepolia rehearsal round using Ready,
    including first-bid activation, settlement, automatic resolution, display, crash recovery
    at every coordinator boundary, and creation of exactly one next pending
    round before enabling any meaningful bid amount. Then restore 72 hours and
    complete one full-duration M2 rehearsal before enabling any Mainnet auction.

### Phase D — Mainnet hackathon release and hardening

1. Confirm reserve, capacity, acceptance/settlement durations, proceeds
   recipient, no-sale behavior, and the account authorized to create and
   register the canonical next round. Bidding remains fixed at three days from
   the first successful bid and control lasts until the next verified winner resolution.
2. Add explicit round creation/registration tooling and monitoring for capsule
   backlog, note acceptance, replay-note inventory, relayer fees, settlement,
   abort deadline, winner disclosure, image moderation, and stale billboard state.
3. Add durable operator database backup/recovery, key rotation, incident
   procedures, capsule upload abuse controls, and a low-value rehearsal.
4. Obtain independent Cairo, capsule-format, and operator-custody review before
   Mainnet or meaningful funds. Whisper currently has no bidder-side reclaim
   path and its operator can inspect bids early or withhold/misdirect refunds.
5. After explicit Mainnet approval, run the combined low-value lifecycle and
   independently verify every qualifying pool transaction before adding at
   least three hashes to the root `strk20.json`.
6. Publish a three-minute demo showing Whisper's reusable mechanics through the
   Stake Wars bidder, settlement, winner-resolution, and billboard flow; keep the public
   demo URL rooted in Stake Wars.

## 11 Verification matrix

- Web: disconnected, unsupported wallet, pending without a deadline, first-bid
  activation, bidding, grace, settling, settled with and without winner,
  disclosure pending, resolved winner, no-winner, aborted, API
  unavailable, billboard unavailable, and reduced-motion tests.
- API: canonical auction validation, felt/address normalization, ABI decoding,
  legacy/new status mapping, pending zero timestamps, exact schedule arithmetic,
  chain time rather than browser time, Torii event validation and lag, cursor
  stability, controller continuity and monotonic resolution ordering, settlement
  result validation, disclosure atomicity, authorization at both upload stages,
  MIME/signature/dimension checks, moderation, and supersession tests.
- Worker: ignore non-terminal rounds and leave bidless pending rounds open;
  create one successor after settled-with-winner, settled-without-winner, or
  aborted; retry safely across onchain discovery, submission, receipt
  confirmation, readback, and database registration; retain the controller for
  abort, no-winner, and disclosure-pending outcomes; recover after a crash at every
  persisted boundary.
- Whisper: verify the `vendor/whisper` gitlink matches the intended reviewed
  commit, then run contract, SDK, operator, docs, deployment JSON, and
  whitespace checks from the submodule before pinning a release.
- Stake Wars: run `pnpm --filter @stakewars/web test`, build, lint, format check,
  `pnpm --filter @stakewars/api test`, API build, and `git diff --check`.
- Manual Sepolia: use the shared Sepolia Stake Wars environment, Ready Wallet,
  already-mature private STRK notes, the configured Whisper operator, and the
  real `/arbiter` view. Verify the first bid starts—not merely submits to—the
  configured auction (five minutes for the initial rehearsal), the capsule
  arrives, the tranche becomes funded, settlement
  publishes the correct result, the operator discloses only the verified
  winner, only that wallet can publish the visible billboard, the old
  controller remains until resolution, and exactly one next pending round is registered.

## 12 Decisions still required before transaction-capable phases

1. Every compatible Ready wallet may bid; Stake Wars Operator status is not a
   bidder eligibility requirement. ✅ decided 2026-08-27
2. Choose the reserve, maximum accepted tranches, acceptance duration,
   settlement duration, and proceeds destination. The initial Sepolia test
   override is five minutes; the production target remains three days and the
   controller term ends only on a later verified winner resolution.
3. Browser winner tickets are intentionally absent. ✅ decided 2026-08-27;
   encrypted capsules remain durable only in the operator database.
4. Decide when a new image becomes public: immediately after technical
   validation, only after moderation approval, or immediately with a report and
   removal path.
5. Confirm package distribution for `@whisper-trade/sdk` and production hosting
   for the Whisper operator. The package is still unpublished and no reachable
   capsule-operator URL is configured; pinned-source imports are local
   rehearsal-only. The current public Sepolia prover/discovery setup has no
   published production availability commitment.
6. Assign the authorized round-creator account and its secret-provider boundary.
   The backend Arbiter worker owns orchestration, but its other permissionless
   duties must not gain access to raw signing material.
7. Choose the narrow transaction adapter: native Go account signing in the API
   or a separately deployed signer. The existing production API image does not
   include Node, and this choice must be made before `RoundRestarter` can submit
   a successor.
8. Approve the explicit initial canonical-round bootstrap configuration and
   transaction. The existing smoke-tested auction is not a Stake Wars round,
   and normal API startup will not create one automatically.
9. Update Whisper's own `STRK20_INTEGRATION_PLAN.md` upstream to record the
   start-on-bid schedule phase before publishing the SDK or deploying the new
   class; do not patch the vendored copy independently.

## 13 Freshness and references

Freshness was rechecked again on 2026-08-27. Stake Wars' current wallet packages are
already at or above the required STRK20-capable versions. The stable Wallet API
remains `0.10.3`; a `0.10.4` release candidate is in flight. The get-starknet
`next` tags have moved to discovery `6.0.4` and wallet-standard `6.0.5`; Stake
Wars already pins wallet-standard `6.0.5`, and no dependency upgrade is required
for the Whisper integration without a demonstrated compatibility need. The
freshness checker also found upstream sub-account package movement, which does
not affect this Wallet API bidder plus backend-owned SDK route.

- Wallet API overview: https://strk20-by-example.org/starknet-wallet-api/overview
- Private DeFi composition: https://strk20-by-example.org/starknet-wallet-api/private-defi
- starknet.js wiring: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- Whisper repository: https://github.com/broody/whisper
- Vendored Whisper protocol: `vendor/whisper/docs/PROTOCOL.md`
- STRK20 Private Sprint submission rules: https://github.com/starkience/strk20-hackathon#strk20json
