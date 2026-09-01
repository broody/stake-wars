# STRK20 Privacy Integration Plan — Stake Wars + Whisper sealed bidding

Updated 2026-08-31 by the strk20-privacy-integration skill. Stake Wars' STRK20 scope is exclusively Whisper's private sealed-bidding mechanism for the Beacon billboard.

**Status:** Phases A through C are complete and the Phase D sprint release is
live on Mainnet. Ready Wallet bidding, operator acceptance, force reveal,
settlement, winner disclosure, automatic successor creation, controller-gated
billboard upload, Tigris delivery, 3D rendering, and canonical auction history
have all been exercised end to end. The production Whisper contract is
`0x07e50e2acad557379785d671d6dde25cde4e18714470b6619f764233cc12b509`;
completed rounds 1 and 2 are public in history, and 72-hour round 4 is active.
The public product is `https://stakewars.gg/play`, the API is ready on
`https://api.stakewars.gg`, and the published demo is intentionally left at
5:44 despite the sprint's three-minute guidance. Independent review, durable
operator recovery, and reduced-custody work remain post-sprint hardening.

This plan supersedes the broader gameplay-edict exploration for the first
Beacon release. Winning a recurring Whisper auction grants one off-chain
privilege: control of the image displayed on a floating billboard in front of
the orbiting Beacon. The controller keeps that privilege until a later
qualifying winner is resolved; an idle, resolving, aborted, or no-winner auction
does not create a control gap. It does not alter FORCE, Sector rules, staking,
the Dojo World, or administrative configuration.

## 1 Combined hackathon product boundary

For the STRK20 Private Sprint, **Stake Wars is the registered product and demo
repository, and Whisper is its reusable privacy engine**. The two repositories
form one submission without collapsing their ownership boundaries:

| Whisper — standalone library                                          | Stake Wars — consuming dapp                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cairo Vickrey auction, start-on-bid scheduling, and STRK20 callbacks  | Beacon auction, continuous-controller policy, and billboard UX                               |
| Headless bidder SDK and encrypted reveal capsule                      | Ready Wallet connection, consent, and action submission                                       |
| Vault operator, discovery, acceptance, settlement, winner disclosure, and recovery | Canonical round registry, public read model, automatic controller resolution, artwork authorization, and display |
| Reusable off-chain/ERC-20/ERC-721/ERC-1155 fulfillment primitives     | Stake Wars-specific off-chain controller entitlement                                          |
| Independent releases, security review, deployments, and documentation | Public game deployment, demo, and root `strk20.json` submission evidence                      |

`vendor/whisper` pins the exact Whisper source consumed and reviewed by Stake
Wars. For the sprint build, Vite imports the pinned SDK source through the
`@whisper-sdk` alias; publishing and consuming a tagged `@whisper-trade/sdk`
package is deferred until after the deadline. The Whisper operator remains a
separately deployed service with its own database and secrets rather than being
co-located with the Fly.io Stake Wars API Machine.

The root `strk20.json` is the hackathon manifest. It lists the live Mainnet
Whisper contract, three independently verified successful Mainnet transactions
that touch both that contract and the canonical STRK20 pool, the public product,
and the demo hosted at `assets.stakewars.gg`. The qualifying hashes are the
Ready bids for auctions 1 and 2 plus the auction 1 settlement; all three are
`SUCCEEDED` and `ACCEPTED_ON_L1`.

## 2 Project and dependency snapshot

- Stake Wars uses React 19, Vite, `starknet@10.7.0`, Wallet API
  `0.10.3`, the maintained Starknet Start React stack, and Ready-only wallet
  selection. `apps/web/src/game/contexts/WalletContext.tsx` constructs
  `WalletAccountV6` after a capability-only version check and requests the
  user's shielded STRK balance only when the bidding UI deliberately needs to
  show it.
- `/play` renders a clickable, camera-trackable Beacon through
  `apps/web/src/game/components/3d/OrbitalBeacon.tsx`,
  `BeaconCameraTracker.tsx`, and `BeaconModal.tsx`. The tracking state is
  represented by `?tracking=beacon` in `World.tsx`; the dedicated auction and
  history URLs are `/play/beacon` and `/play/beacon/history`, with Vercel SPA
  rewrites supporting direct navigation.
- The image pipeline provides wallet authentication,
  short-lived direct object-store uploads, file-signature and dimension
  validation, reporting/removal state, and public image delivery. Beacon
  authorization is separate from Sector ownership and revalidates the current
  controller both before issuing upload URLs and before publication.
- `vendor/whisper` currently pins commit
  `fede3b70c1557a31d09b6e7e2bb1a6fbb04121fd`. The Mainnet v0.4 contract was
  deployed from source commit `24974e012546b3d1a7bd154f6dead8f59cfb251b`
  at block `14068037` against the canonical pool. Its class hash and live
  readback have been verified.
- The vendored `@whisper-trade/sdk@0.3.0` source builds the
  standard private `transfer + invoke` bid actions, encrypted reveal capsule,
  and schedule encodings. The Whisper operator exposes public configuration
  and idempotent capsule upload. The Cairo contract exposes `get_auction` and
  `get_result`, and publishes accepted tranche counts and settlement results.
- The Ready initial-bid path and the full low-value operator lifecycle are
  verified on Mainnet. Additive top-up remains outside the sprint UI. Whisper
  remains experimental, 1-of-1 operator-custodial, and unaudited.
- Production Torii indexes the Mainnet Whisper contract as an `OTHER` contract
  from block `14068037`. Direct RPC remains authoritative for current state;
  Torii supplies rebuildable event history. The live API exposes completed
  rounds 1 and 2, while round 4 is the current 72-hour auction.

## 3 Chosen integration route

Use the normal-dapp Wallet API path through Stake Wars' existing
`WalletAccountV6`. The browser imports only Whisper's headless bidder builders,
creates and encrypts the bid opening, uploads the ciphertext capsule, and asks
Ready to execute the returned action array. The bid flow never requests or
receives the user's viewing key, selected notes, or proofs. The UI deliberately
uses the wallet's consent-gated `strk20Balances` call to display only the user's
own shielded STRK balance; capability detection still uses `supportedWalletApi`
and never probes balances.

No new Cairo consumer contract is required for the first billboard because the
prize is entirely off-chain. After `get_result` confirms settlement, the
Whisper operator decrypts only the winning group's authenticated capsule and
publishes its refund recipient; the Go API matches the disclosed group and
winner commitment to the immutable result before activating that address.
Reconsider an on-chain Beacon registry only if the prize later controls
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

Short Sepolia and low-value Mainnet rehearsals used compressed schedules. The
production configuration is now `BEACON_BIDDING_DURATION=72h`,
`BEACON_ACCEPTANCE_DURATION=15m`, and
`BEACON_SETTLEMENT_DURATION=6h`; the first successful bid fixes those resolved
deadlines and later bids do not extend them.

## 5 `/play` and Beacon product shape

Use `Core | Force | Beacon | Operator` as the primary navigation. Clicking the
in-world Beacon keeps camera tracking in `/play` and opens a compact summary in
the existing top-right HUD position. The summary shows only the current phase,
the deadline when one exists, the current controller, and one primary action,
with a link to the dedicated `/beacon` route. The dedicated page owns the
full auction UI.
If the connected wallet is the current controller, both surfaces expose the
implemented image-upload flow. Selection is locked immediately after signing so
the published crop cannot diverge from the authorized preview.

Desktop composition:

```text
+--------------------------------------------------------------------------+
| STAKE//WARS     CORE       FORCE       BEACON       OPERATOR      WALLET |
+--------------------------------------------------------------------------+
|                                                                          |
|                         THE CORE                                         |
|                    o                                                     |
|                 BEACON  [ floating 16:9 transmission plate ]            |
|                                                                          |
|                                              +-------------------------+ |
|                                              | BEACON // BIDDING      | |
|                                              | ROUND 07      01:42:19 | |
|                                              | CONTROLLER  0x04…beef | |
|                                              | [ OPEN AUCTION UI  → ] | |
|                                              +-------------------------+ |
+--------------------------------------------------------------------------+
```

The memorable visual element is the **transmission plate**: a thin 16:9 image
plane floating between the Core and the tetrahedral Beacon, closer to the
Beacon and synchronized to its trajectory, framed by four terminal registration
marks. It remains in the existing monochrome palette and gains no new accent
color. Its front faces the Beacon, its horizontal axis follows the orbit tangent,
and its roll therefore matches the ring instead of the camera. When `SHOW
PROJECTION` is enabled, the Beacon eases out of its free rotation and holds one
tetrahedral face toward the Core and transmission plane; disabling projection
resumes the multi-axis rotation from that orientation. Reduced-motion mode snaps
to the aligned state. The registration brackets remain visible in Control mode,
but the two-sided image surface and its texture load are enabled only by the
existing `SHOW PROJECTION` control. The Beacon-facing artwork is mirrored;
the same flipped texture cancels the reverse geometry when viewed from the Core,
so the Core-facing side reads normally while empty-state utility text remains
legible.

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

The existing `beacon_rounds` table and `GET /v1/beacon` aggregate establish
the canonical current round. Keep direct Whisper RPC as the authority for its
current state and result; Torii is a rebuildable history/enrichment source and
may lag without blocking round cycling. The earlier Sepolia smoke-tested
Whisper auction 1 is protocol evidence, not a canonical Stake Wars round, and
must not be imported into controller or winner history. Mainnet auction 1 is a
separate canonical Stake Wars round.

Keep these durable records:

- `beacon_rounds`: network, monotonically increasing Stake Wars round ID,
  Whisper address and auction ID, expected creator, payment token, metadata
  hash, winner-payload domain, vault, expected schedule/configuration, optional
  resolved controller, activation timestamp, and active artwork ID;
- `beacon_round_outcomes`: one immutable terminal projection per canonical
  round, including terminal status, whether a winner exists, winner commitment,
  winning bid, clearing price, funded bid count, settlement transaction, and
  terminal/projected timestamps; and
- `beacon_cycle_jobs`: one unique successor job per terminal predecessor,
  including expected next round/configuration/metadata hash, state, transaction
  hash, attempts, last error, and timestamps.

Expose these public endpoints:

```text
GET /v1/beacon
GET /v1/beacon/history?limit=<n>&cursor=<opaque>
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

Do not create the first auction as an implicit API-startup side effect. The
initial Mainnet round was bootstrapped explicitly and validated by full
readback before normal reconciliation was enabled. The implemented
`OperatorRoundRestarter` calls a bearer-authenticated coordinator endpoint on
the separately deployed Whisper operator; signing material remains inside that
service and is never imported into the Fly.io API or unrelated worker duties.

Do not put a mutable current auction ID in the Vite environment or require a
frontend deployment for each round.

## 7 Automatic winner resolution

At initial bid creation, generate a cryptographically random ephemeral winner
secret and commit to:

```text
Poseidon(
  "STAKEWARS_BEACON_V1",
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

This phase is implemented in production:

- Beacon-specific authorization and completion endpoints preserve the
  existing Sector `CanManageImage` checks and do not pretend an auction winner
  owns a Sector.
- Tigris/MinIO, typed-data sessions, randomized versioned object keys,
  MIME/signature checks, reporting, removal, and moderation state are reused
  under the separate `beacon/<network>/<round>/<artwork-id>/...` prefix.
- The client prepares a 16:9 display texture and thumbnail no larger than
  `512x288` and `256x144`, preserving the 2 MB encoded-file ceiling and the
  WebP/JPEG/PNG allowlist.
- Winner authority is verified before both upload authorization and
  publication. Replacement supersedes metadata only after the new object is
  valid; the previous object is never deleted first.
- A resolved winner may replace the billboard during their term. The approved
  image remains active until the next **verified winner resolution**; a pending,
  resolving, settled-no-winner, disclosure-pending, or aborted auction leaves the
  previous approved billboard in place.
- The approved texture renders as a child of `OrbitalBeacon`. The empty state is
  a restrained `SIGNAL AVAILABLE` wireframe rather than a broken image or a
  generic loading skeleton.

## 9 Coupled milestone map

A Whisper milestone is complete for this submission only when Stake Wars has
consumed and verified it at the corresponding boundary. Whisper can remain a
standalone product and reach additional library milestones independently, but
those do not advance the Stake Wars hackathon product until the paired
acceptance gate passes.

| Milestone                                  | Whisper deliverable and gate | Stake Wars deliverable and acceptance | Status |
| ------------------------------------------ | ---------------------------- | ------------------------------------- | ------ |
| M0 — foundation and schedule compatibility | Pin the start-on-bid contract/ABI, SDK source, operator, and deployment metadata; preserve the complete indexable event stream | Pin Whisper under `vendor/whisper`; decode the schedule variants; expose pending through terminal lifecycle states; keep controller lookup independent from the newest round | ✅ Complete on Sepolia and Mainnet |
| M1 — wallet bidder                         | Build standard Wallet API `transfer + invoke` actions and an authenticated encrypted capsule | Submit through Ready, show only the user's consented shielded balance, retain non-secret local receipts, distinguish submitted from funded, and handle wallet confirmation/rejection | ✅ Initial-bid path verified on Mainnet; additive top-up remains post-sprint |
| M2 — recurring product                     | Run the separate operator with capsule controls, replay-note rotation, acceptance, settlement, winner disclosure, abort, and recovery paths | Preserve controller continuity, project immutable outcomes, authorize billboard publication, and idempotently create/register one successor | ✅ Short lifecycle and recurrence verified on Mainnet; first 72-hour round is active |
| M3 — Mainnet hackathon release             | Deploy against the canonical Mainnet pool and complete a low-value operator rehearsal | Publish the app, API, image delivery, three verified Mainnet transactions, contract address, public demo, and auction history | ✅ Live 2026-08-31; 5:44 video retained as an accepted deviation from the three-minute guidance |
| M4 — post-sprint hardening                 | Independent Cairo/capsule/operator review, durable recovery, then threshold or otherwise reduced custody when feasible | Incident UX, expanded monitoring and moderation, tested disaster recovery, and a policy for upgrading the pinned Whisper version | Post-sprint |

## 10 Stake Wars delivery phases

### Phase A — read-only Beacon surfaces — ✅ done 2026-08-24

1. Add typed Beacon round/result models and `api.getBeacon()` in
   `apps/web/src/game/services/api.ts`.
2. Replace the static `BeaconModal.tsx` briefing with a compact state-driven
   `/play` summary and a full `/beacon` console for every lifecycle state,
   preserving `?tracking=beacon`, Escape, focus visibility, and camera tracking.
3. Add an `BeaconContext` that polls the aggregate endpoint at a modest
   interval and on transaction refresh. Keep it independent from Sector image
   polling.
4. Keep the in-world transmission plate hidden in Phase A. Surface light status
   details in the top-right Beacon card and full detail on `/beacon`.
5. Implement the Go read model, Whisper RPC decoder, canonical-round database
   migration, and `GET /v1/beacon` endpoint with fixture-backed tests.
6. Verify desktop and mobile layouts on `http://localhost:3000/play`; no bidding,
   winner resolution, upload, deployment, or external transaction is part of Phase A.

### Phase A.1 — start-on-bid compatibility and controller continuity — ✅ done 2026-08-27

1. Pull and pin Whisper commit `24974e012546b3d1a7bd154f6dead8f59cfb251b`,
   then dual-decode the earlier absolute-schedule response and the new
   start-on-bid response without treating zero pending timestamps as dates.
2. Require canonical start-on-bid rounds to use the configured bidding duration,
   validate their resolved duration arithmetic after the first bid, and expose
   the schedule plus nullable timestamps through `GET /v1/beacon`.
3. Resolve the current controller independently from the newest canonical
   round, so pending, resolving, aborted, no-winner, and disclosure-pending rounds do not
   blank or prematurely replace the active controller.
4. Redesign the Beacon surfaces around the `WAITING`, configured auction,
   `RESOLVING`, and `CONTROL` stages using the existing theme and font, with
   details kept secondary.
5. Add and test the periodic worker and idempotent `RoundRestarter` boundary.
   The authorized onchain creator/registration implementation remains Phase C;
   no signer, deployment, or external transaction is part of Phase A.1.
6. Configure local and production Torii launchers to index the active Whisper
   contract as an `OTHER` contract and verify all five settlement-history event
   types against smoke auction 1.

### Phase A.2 — live canonical auction history — ✅ done 2026-08-27

1. Add `beacon_round_outcomes` and `beacon_cycle_jobs` migrations with unique
   predecessor, round, and Whisper-auction constraints. Keep the existing
   canonical round rows as the allowlist for every projection.
2. Add a Torii raw-event client and settlement projector with strict address,
   selector, key, data-length, transaction, pagination, and felt validation.
   Use direct RPC for current state and allow Torii enrichment to retry when it
   is behind.
3. Add cursor-paginated `GET /v1/beacon/history`, returning only canonical
   settled rounds with a winner. Join the resolved controller by round; return
   `winnerAddress: null` while disclosure is pending and never return a
   commitment in its place.
4. Add `api.getBeaconHistory()` and a route-scoped history query refreshed on
   focus and about every 30 seconds. Replace the live page's empty array with
   API data; render `VERIFYING`, `BIDS`, and the winning bid.
5. Test Torii lag, malformed/unrelated events, duplicate projection, cursor
   stability, nullable winner resolution, amount formatting, empty history, and API
   failure. Verify locally against the shared Sepolia Torii index without
   treating smoke auction 1 as a Stake Wars winner.

### Phase B — Ready Wallet private bid submission — ✅ verified on Mainnet 2026-08-30

The mock selector and wallet are gone, and the production bidder uses the
fee-aware one-shot `wallet_strk20InvokeTransaction` path. Mainnet verification
confirmed that Ready resolves both confirmation and rejection, so the UI no
longer relies on the temporary public bid-count fallback.

1. The sprint web build imports the reviewed, pinned Whisper SDK source through
   `@whisper-sdk`; publishing the package remains post-sprint distribution work.
2. `WalletContext` exposes only least-privileged private invocation and an
   intentional, consent-gated own-balance read. It never exposes wallet keys,
   notes, proofs, or the wallet object to feature code.
3. `services/whisperBid.ts` generates the random nonce, salt, refund commitment,
   ephemeral winner commitment, reveal commitment, encrypted capsule, and
   standard `transfer + invoke` actions.
4. Capsule upload occurs before wallet invocation and is not authenticated with
   the bidder's public wallet, avoiding a direct public-wallet-to-bid link.
5. Only a successful wallet transaction starts a pending round. The app polls
   the canonical auction, and the resolved deadline arithmetic is checked
   against the configured duration.
6. Non-secret bid display receipts are encrypted in wallet-, network-, and
   auction-scoped IndexedDB. Salts, winner secrets, viewing keys, notes, proofs,
   and capsules are never stored in the browser.
7. Mainnet auction 1 proved submission, funding, deadline activation,
   replay-protected acceptance, force reveal, and settlement. Additive top-up is
   intentionally not exposed in the sprint UI.

### Phase C — automatic winner resolution, billboard publishing, and recurring operation — ✅ verified on Mainnet 2026-08-30

1. Sector and Beacon uploads share wallet authentication but retain separate
   authorization rules. Controller authority is re-read before both upload
   authorization and publication.
2. The idempotent worker verifies Whisper's winner disclosure against the
   immutable onchain result, resolves the controller monotonically, and keeps
   the prior controller through pending, aborted, no-winner, and
   disclosure-pending states.
3. Winner-only crop, preview, upload, replacement, and 3D projection are live.
   Selection locks after signing, and Tigris objects are delivered through
   `assets.stakewars.gg` only after signature, size, type, and dimension checks.
4. The Fly.io API runs the coordinator duty at startup and on its ticker. It
   projects terminal outcomes, creates one durable successor job, recovers
   submitted transactions, validates full onchain readback, and registers one
   canonical next round.
5. The `OperatorRoundRestarter` delegates creation to the authenticated Whisper
   coordinator, keeping creator and vault signing material outside the API.
6. Mainnet rounds 1 and 2 settled and appear in public history. Their winners
   were resolved, the controller changed without a gap, billboard publication
   succeeded, and automatic successor creation was exercised.
7. The production schedule was restored to 72 hours. Round 4 started from its
   first successful bid and is the current public round; keeping the label as
   round 4 preserves the operational history used for debugging.

### Phase D — Mainnet hackathon release — ✅ live 2026-08-31

1. Whisper v0.4 is deployed against the canonical Mainnet STRK20 pool, with its
   class hash, source commit, vault registration, replay-note setup, and public
   readback recorded in `vendor/whisper/deployments/mainnet.json`.
2. The product is public at `https://stakewars.gg/play`; direct Beacon routes
   work under the `/play` basename, the Go API and supervised Torii are live on
   Fly.io, and artwork plus the demo are served from `assets.stakewars.gg`.
3. The root manifest contains the deployed contract and three independently
   verified Mainnet transactions: two Ready bids and one operator settlement.
4. The low-value lifecycle completed through bid, acceptance, force reveal,
   settlement, winner disclosure, billboard publication, history projection,
   and successor creation.
5. The submitted video is 5:44. The team explicitly accepted the risk of
   exceeding the sprint's three-minute guidance and chose not to recut it.
6. Independent review, durable operator database recovery, key rotation,
   replay-note inventory alerts, incident procedures, and a reduced-custody
   design remain post-sprint. Until those exist, keep auction values low and
   disclose that the 1-of-1 operator can inspect bids early or withhold or
   misdirect refunds; Whisper has no bidder-side reclaim path.

## 11 Verification matrix

- Automated workspace verification on 2026-08-31 passed `pnpm test`,
  `pnpm build`, `pnpm lint`, and `pnpm format:check`; the web suite reported 194
  passing tests and the API suite passed.
- Stake Wars Cairo passed 28/28 tests plus `sozo build` and `scarb fmt --check`.
- Vendored Whisper passed 69/69 Cairo tests, 15/15 SDK tests, and 30/30 operator
  tests; SDK/operator type checks and builds passed.
- All three manifest transactions are `SUCCEEDED` and `ACCEPTED_ON_L1`. Each
  receipt contains events from both the canonical STRK20 pool and the listed
  Whisper contract. The deployed contract returns the expected live class hash.
- `https://stakewars.gg`, `/play`, `/play/beacon`, `/play/staking`, and
  `/play/gallery` return successfully, including direct navigation. The demo
  asset returns `video/mp4` and supports range requests.
- The production API returns healthy and ready, reports `SN_MAIN`, and has image
  uploads enabled. Fly.io has exactly one healthy `sjc` Machine with one shared
  CPU, 512 MB RAM, and the encrypted 1 GB `stakewars_data` volume mounted at
  `/data`.
- Mainnet auction 1 completed the Ready bid, funding, replay-protected operator
  acceptance, force reveal, settlement, winner disclosure, and successor path.
  Public history contains completed rounds 1 and 2, and a winner has published
  live Beacon artwork. The developer separately confirmed the production
  auction-bid flow end to end.
- Round 4 was read from the live API on 2026-08-31 with the 72-hour schedule and
  three submitted tranches. Its public funded count remains authoritative and
  may stay below the submission count until the operator accepts notes.

## 12 Resolved sprint decisions and post-sprint work

No sprint-blocking product or infrastructure decision remains open before the
submission snapshot:

1. Every compatible Ready wallet may bid; Stake Wars Operator status is not an
   eligibility requirement.
2. Mainnet rounds use STRK, a `0.1 STRK` reserve, 32 accepted tranches, a 72-hour
   bidding window, 15-minute acceptance window, and six-hour settlement window.
   Control lasts until a later winner is verified.
3. Browser winner tickets are intentionally absent. Only non-secret bid display
   receipts are stored locally; encrypted capsules remain durable in the
   operator database. The own-balance read is an explicit consented UI feature,
   not capability detection.
4. Controller artwork publishes immediately after controller revalidation and
   technical image validation, with reporting/removal support. A replacement
   becomes active atomically without deleting the previous object first.
5. The Vercel frontend consumes the pinned vendored SDK source. The Whisper
   operator/prover is hosted separately, and Fly.io communicates with its
   authenticated coordinator API without holding the operator's signing keys.
6. The first Mainnet round was bootstrapped explicitly; ordinary API startup is
   idempotent and does not create a duplicate. Automatic recurrence is live.
7. `strk20.json` is populated, the demo and live product are public, and the
   team accepted the 5:44 video-duration deviation.

Post-sprint work is limited to hardening and distribution: publish a reviewed
SDK package, add durable operator backup and recovery tests, improve replay-note
and deadline alerting, document key rotation and incidents, obtain independent
review, and evaluate threshold or otherwise reduced custody.

## 13 Freshness and references

Freshness was rechecked on 2026-08-31. The stable Wallet API remains `0.10.3`,
with `0.10.4-rc.1` in flight. The npm `next` tags are `starknet@10.7.1`,
get-starknet discovery `6.0.4`, and wallet-standard `6.0.5`; Stake Wars pins
`starknet@10.7.0`, wallet-standard `6.0.5`, and types `0.10.3`, and the deployed
flow is compatible. Upstream removed `packages/sub_account_anonymizer` and added
`packages/shadow_account_anonymizer`; neither affects this Wallet API bidder or
backend-controlled operator route. No deadline-time dependency upgrade is
required without a demonstrated compatibility need.

- Wallet API overview: https://strk20-by-example.org/starknet-wallet-api/overview
- Private DeFi composition: https://strk20-by-example.org/starknet-wallet-api/private-defi
- starknet.js wiring: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- Whisper repository: https://github.com/broody/whisper
- Vendored Whisper protocol: `vendor/whisper/docs/PROTOCOL.md`
- STRK20 Private Sprint submission rules: https://github.com/starkience/strk20-hackathon#strk20json
