# STRK20 Privacy Integration Plan — Stake Wars shielded balance

Generated 2026-08-19 by the strk20-privacy-integration skill. This plan is intentionally limited to a consented shielded STRK balance read in the existing staking UI; it does not make staking private.

## 1. Project snapshot

- Stack: React 19 + Vite frontend in `apps/web`; `starknet@10.7.0`; `@starknetfoundation/starknet-start-react@^2.0.1`; `@starknet-io/get-starknet-modal@6.0.1`; Dojo/Cairo contracts; Go API. The app runs locally against the shared Sepolia deployment.
- Wallet connection: `apps/web/src/game/contexts/WalletContext.tsx:16-29` and `apps/web/src/game/components/ui/WalletButton.tsx:27-164`. The wallet menu currently admits Ready/Argent only.
- Provider and transaction layer: `apps/web/src/game/providers/StarknetProvider.tsx:8-23`; staking sends remain in `apps/web/src/game/contexts/YieldContext.tsx` and are out of scope for this balance-only change.
- UI surface: `apps/web/src/game/pages/Staking.tsx:372-409` renders Live Position with active stake, available force, committed force, and spent force.
- Token: `apps/web/.env.sepolia` already configures the canonical STRK token address through `config.strkTokenAddress`.
- Privacy goal: remove committed and spent force from Live Position, then display the connected wallet's consented shielded STRK balance there using the `[STRK]` unit convention. Do not add shield, transfer, unshield, or private-staking actions.
- Environment and wallet: Sepolia first; Ready is the app's current supported wallet.

## 2. Chosen route: Privacy Wallet API through starknet.js `WalletAccountV6`

This is a normal dapp relying on the user's wallet, so the balance read must go through the connected privacy-enabled wallet. The app will call `WalletAccountV6.strk20Balances([config.strkTokenAddress])`; the wallet owns the private state and asks the user for balance-read consent.

**The rule this follows:** Stake Wars never touches a viewing key, encrypted notes, or proofs. It receives only the balance value the user explicitly authorizes the wallet to disclose.

## 3. What this delivers — hidden vs visible

| Private / not disclosed to Stake Wars | Disclosed or public |
|---|---|
| Viewing key, notes, nullifiers, private transfer history, and balances for tokens the app did not request | The shielded STRK aggregate balance is disclosed to the frontend after wallet consent |
| Sender, receiver, amount, and token type of transfers inside the pool remain private onchain | Deposit and withdrawal amounts, the fact that an address interacted with the pool, and interaction timing remain public onchain |

The read itself creates no transaction. The frontend must not log, persist, analyze, or send the returned shielded balance to the API.

## 4. Prerequisites and version gate

Freshness was checked on 2026-08-20. The current relevant releases/dist-tags are:

- `starknet@10.7.0` (`WalletAccountV6`; STRK20 support requires at least 10.4.0)
- `@starknet-io/get-starknet-modal@6.0.1`
- `@starknet-io/get-starknet-core@6.0.1`
- `@starknet-io/get-starknet-wallet-standard@6.0.5`
- `@starknet-io/types-js@0.10.3` (stable Wallet API spec 0.10.3)
- `@starknetfoundation/starknet-start-react@2.0.1`
- Test wallet: current Ready extension on Sepolia

The maintained Starknet Foundation package line uses get-starknet v6 and removes Stake Wars' former direct v5 compatibility dependency. Stake Wars retains its focused `WalletAccountV6` adapter for the consented STRK20 read so this dependency migration does not change the privacy interaction or normal transaction paths.

Capability detection must use `walletV6.supportedWalletApi(wallet)` (or `supportedSpecs`) and require Wallet API `>=0.10.3`. It must not call `strk20Balances` as a feature probe because balance reads trigger consent.

## 5. Phase 1 — wallet-mediated shielded balance read ✅ done 2026-08-19

1. Update the wallet packages in `apps/web/package.json` and `pnpm-lock.yaml` to the exact compatible v6 versions above; keep the existing public staking flow working.
2. In `apps/web/src/game/contexts/WalletContext.tsx`, retain the connected wallet object, create/recreate a `WalletAccountV6` for the configured RPC when wallet/account/network changes, and expose privacy capability plus an explicit `readShieldedStrkBalance()` action.
3. Implement the action with `strk20Balances([config.strkTokenAddress])`, normalize token addresses with `BigInt(a) === BigInt(b)`, parse the returned smallest-unit balance as `bigint`, and discard it on disconnect, account change, or network change.
4. Treat unsupported API versions distinctly from rejected consent and operational wallet errors. Do not query on page load merely to detect support.
5. Add focused unit tests for supported/unsupported wallets, approved/rejected reads, missing STRK entries, address normalization, and stale account responses.
6. Verify existing connect, stake, claim, unstake, capture, and typed-data signing flows still build and test after the wallet-stack change.

## 6. Phase 2 — Live Position UI ✅ included in the Phase 1 wallet checkpoint 2026-08-19

1. In `apps/web/src/game/pages/Staking.tsx:378-405`, remove the COMMITTED and SPENT metrics.
2. Add a SHIELDED metric whose displayed unit is `[STRK]`; do not label public wallet STRK or active stake with brackets.
3. Before consent, show a deliberate `READ [STRK]` affordance instead of triggering a balance prompt on page load. After consent, show the formatted balance and allow a manual refresh.
4. For a wallet without Wallet API 0.10.3 support, show `UNAVAILABLE` without requesting balance data. For rejected consent, keep the value hidden and allow retry without treating rejection as a staking failure.
5. Keep the remaining FORCE explanation accurate after removing committed/spent language.
6. Add component coverage for disconnected, unsupported, consent-pending, disclosed, rejected, and error states.

## 7. Out of scope / future entry criteria

- Shield, private transfer, and unshield buttons are not part of this request.
- Staking shielded STRK is not implied by displaying `[STRK]`. A private staking path would be a separate design using the protocol's current shadow-account or audited helper route, with explicit privacy-leak analysis and contract review.
- Xverse can be added to the wallet selector only after a separate product decision and manual verification of its current dapp-facing Wallet API behavior.

## 8. Testing and phase handoff

- Headless: `pnpm --filter @stakewars/web test`, `pnpm --filter @stakewars/web build`, `pnpm --filter @stakewars/web lint`, `pnpm --filter @stakewars/web format:check`, and `git diff --check`.
- Manual on `http://localhost:3000/play` using `pnpm dev:web`: connect Ready on Sepolia; verify capability detection causes no consent prompt; click `READ [STRK]`; approve and compare the displayed balance with Ready; reject once and verify retry; switch account/network and verify the disclosed balance is cleared.
- Regression: submit no transaction during the balance read; ensure normal public staking still uses public STRK and is unaffected by the `[STRK]` value.

Execution stops after this phase for the wallet-backed manual check before any broader privacy feature is considered.

## 9. Privacy and security notes

- Request only the STRK token balance, not an empty token array (which requests all shielded token balances).
- Never read or store viewing keys, notes, or proofs.
- Never log, persist, or send the disclosed balance to the Stake Wars API or analytics.
- Deposit screening is enforced onchain by the protocol; this read-only feature does not deposit.
- Selective disclosure exists for legitimate regulatory requests; it is not automatic compliance or regulator endorsement, and Stake Wars owns its legal/compliance decisions.

## 10. Open items to re-verify at execution

- `WalletAccountV6.strk20Balances(tokens)` and the `STRK20_BALANCE_ENTRY.balance` field were confirmed against `starknet@10.7.0` and the stable Wallet API 0.10.3 schema.
- Manual checkpoint pending: confirm Ready's Sepolia balance-read consent behavior and exact rejection text.
- Maintenance completed 2026-08-20: adopted the maintained `@starknetfoundation/starknet-start-react` package and removed the temporary direct wallet-standard v5 compatibility dependency. Re-evaluate the native STRK20 hooks separately before changing the existing explicit-consent adapter.
- Re-check package dist-tags before future STRK20 work because get-starknet v6 packages are still moving independently.

## 11. Links

- Wallet API overview: https://strk20-by-example.org/starknet-wallet-api/overview
- React route: https://strk20-by-example.org/starknet-wallet-api/starknet-start-hook
- starknet.js / `WalletAccountV6`: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- Current WalletAccount guide: https://starknet-js.com/docs/next/guides/account/walletAccount/#with-get-starknet-v6
- Wallet API spec v0.10.3: https://github.com/starkware-libs/starknet-specs/releases/tag/v0.10.3
- Wallet test dapp: https://starknet-wallet-account.vercel.app/

---

## 12. Workstream B — Whisper-powered Arbiter billboard

**Status:** Phase A completed on 2026-08-24. Later phases remain proposed and
require separate developer approval.

This workstream supersedes the broader gameplay-edict exploration for the first
Arbiter release. Winning a recurring Whisper auction grants one bounded,
off-chain privilege: control of the image displayed on a floating billboard in
front of the orbiting Arbiter. It does not alter FORCE, Sector rules, staking,
the Dojo World, or administrative configuration.

### 12.1 Project and dependency snapshot

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
- Whisper's `@whisper-trade/sdk@0.3.0` builds the standard private
  `transfer + invoke` bid actions and encrypted reveal capsule. The Whisper
  operator exposes public configuration and idempotent capsule upload. The
  Cairo contract exposes `get_auction` and `get_result`, and publishes accepted
  tranche counts and settlement results.
- Whisper has completed a full Sepolia lifecycle using official SDK action
  semantics, but the interactive Ready handoff and additive top-up flow remain
  unverified. Whisper is experimental, custodial, and unaudited.

### 12.2 Chosen integration route

Use the normal-dapp Wallet API path through Stake Wars' existing
`WalletAccountV6`. The browser imports only Whisper's headless bidder builders,
creates and encrypts the bid opening, uploads the ciphertext capsule, and asks
Ready to execute the returned action array. The browser and Stake Wars API
never receive the user's viewing key, selected notes, proof, or private balance
without a separate explicit balance-read consent.

No new Cairo consumer contract is required for the first billboard because the
prize is entirely off-chain. The Go API can verify the canonical Whisper result
and an authenticated winner-commitment opening before authorizing the existing
object-storage flow. Reconsider an on-chain Arbiter registry only if the prize
later controls on-chain gameplay.

### 12.3 Privacy boundary

| Hidden before settlement | Public before settlement |
|---|---|
| Bid amount, bidder wallet relationship, refund destination, bid salt, and billboard claim secret | Auction token, reserve, deadlines, capacity, group/tranche handles, submission count, funded-tranche count, commitments, and timing |

| Still private after settlement | Newly public after settlement |
|---|---|
| Viewing keys, notes, proofs, private refund/change/proceeds recipients, and the wallet-to-bid relationship until the winner claims | Every accepted tranche amount and salt, aggregate winning bid, second-highest bid, clearing price, winner commitment, and settlement time |

Whisper's 1-of-1 operator can decrypt bid capsules and controls the escrow vault;
the auction is sealed from the public and competing bidders, not from that
operator. Claiming the billboard intentionally discloses the winning wallet to
Stake Wars and, once displayed as the controller, to the public. Shielding STRK
immediately before bidding creates public timing and amount-correlation risk;
the UI should direct bidders to use an already-mature shielded balance.

### 12.4 `/play` and Arbiter product shape

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

### 12.5 Canonical round read model

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

### 12.6 Winner claim design

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

### 12.7 Billboard storage and rendering

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

### 12.8 Delivery phases

#### Phase A — read-only Arbiter surfaces — ✅ done 2026-08-24

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

#### Phase B — Ready Wallet private bid submission

1. Establish a deployable SDK dependency. Recommended: publish a tagged,
   reviewed `@whisper-trade/sdk` release and pin it exactly. Do not use
   `link:../whisper/sdk` because Vercel's `apps/web` build cannot rely on a
   sibling repository.
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

#### Phase C — claim and billboard publishing

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

#### Phase D — recurring operations and hardening

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

### 12.9 Verification matrix

- Web: disconnected, unsupported wallet, bidding, grace, settling, settled with
  and without winner, unclaimed winner, claimed non-winner, claimed winner,
  aborted, API unavailable, billboard unavailable, and reduced-motion tests.
- API: canonical auction validation, felt/address normalization, ABI decoding,
  chain time rather than browser time, settlement result validation, claim
  atomicity, authorization at both upload stages, MIME/signature/dimension
  checks, moderation, and expiry/supersession tests.
- Whisper: run contract, SDK, operator, docs, deployment JSON, and whitespace
  checks from the Whisper repository before pinning a release.
- Stake Wars: run `pnpm --filter @stakewars/web test`, build, lint, format check,
  `pnpm --filter @stakewars/api test`, API build, and `git diff --check`.
- Manual Sepolia: use the shared Sepolia Stake Wars environment, Ready Wallet,
  an already-mature shielded STRK balance, the configured Whisper operator, and
  the real `/play` view. Verify the capsule arrives, the tranche becomes funded,
  settlement publishes the correct result, only the winner can claim, and only
  the claimed winner can publish the visible billboard.

### 12.10 Decisions still required before Phase B

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

### 12.11 Freshness and references

Freshness was rechecked on 2026-08-24. Stake Wars' current wallet packages are
already at or above the required STRK20-capable versions. The stable Wallet API
remains `0.10.3`; a `0.10.4` release candidate is in flight. The get-starknet
`next` tags have moved since the original balance plan, but no dependency
upgrade is required for this workstream without a demonstrated compatibility
need.

- Wallet API overview: https://strk20-by-example.org/starknet-wallet-api/overview
- Private DeFi composition: https://strk20-by-example.org/starknet-wallet-api/private-defi
- starknet.js wiring: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- Whisper repository: https://github.com/broody/whisper
- Whisper protocol: `/Users/broody/development/whisper/docs/PROTOCOL.md`
