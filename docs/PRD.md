# Product Requirements Document (PRD): Stake Wars

**Version:** 2.1
**Status:** Draft
**Platform:** Starknet (L2)
**Aesthetic:** Command Terminal / Retro-Futurist

---

## 1. Executive Summary

**Stake Wars** is a persistent, gamified staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Sectors**) on a 3D spherical map (**The Core**). STRK is delegated to the Stake Wars validator through Starknet's native delegation protocol. Inside the game, that delegation becomes **FORCE**, which Operators allocate to Sectors without creating a separate token. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic.

An Operator captures a neutral Sector by choosing how much FORCE, backed by delegated STRK, to commit. Any other Operator may take over an occupied Sector instantly by committing at least 10% more FORCE than it currently holds. Ownership changes in that transaction and the displaced Controller's entire commitment returns to its Available Force; there is no response window, settlement step, or Spent Force. A contested Sector can change hands back and forth for as long as rival Operators keep committing more, so holding a position others want requires more delegated stake than any of them. The current Controller may display a custom image on that face until ownership changes. Admin-sponsored SupplyDrops periodically select one Sector and award an escrowed ERC-20, ERC-721, or ERC-1155 prize to the wallet that controlled it at the round deadline.

---

## 2. Glossary & Nomenclature

*   **The Core:** The global game map; a 3D geodesic sphere consisting of 2,000 unique faces.
*   **Sector:** A single triangular face on the Core. In the initial release it is a Dojo-native game territory, not a freely transferable NFT.
*   **Operator:** The user/player.
*   **Live Delegation:** An Operator's authoritative delegated STRK balance, read directly from the official delegation pool.
*   **Control Force (FORCE):** The game representation of an Operator's Live Delegation. One unit of FORCE corresponds to one unit of delegated STRK; FORCE is accounting terminology, not an ERC-20 or a custodial game asset.
*   **UI Unit Convention:** The interface labels derived gameplay accounting—including Available Force, Capture Force, garrisons, and takeover commitments—in `FORCE`. The interface may label a Sector's Capture Force as its **Defense**. It uses `STRK` only for actual token contexts such as wallet balances, delegation, staking, withdrawals, and rewards. The interface may explain that 1 FORCE is backed by 1 delegated STRK, but it must not present FORCE as a token or imply that FORCE is independently transferable.
*   **Committed Force:** Internal allocation accounting for the portion of Live Delegation bound to Sector garrisons. It cannot simultaneously back another action.
*   **Available Force:** `max(0, Live Delegation - Sector Commitments)`. This is derived contract accounting, not a token or user-managed currency. The UI exposes it as the Operator's currently deployable FORCE.
*   **Capture Force:** The Committed Force recorded on a Sector.
*   **Controller:** The Operator currently holding a Sector.
*   **Takeover:** Capturing an occupied Sector by committing at least its Minimum Takeover Force. Ownership transfers immediately and the displaced Controller's Capture Force returns to its Available Force.
*   **Minimum Takeover Force:** `max(Minimum Stake, Capture Force + ceil(Capture Force / 10))`: at least 10% more than the Sector's current Capture Force, rounded up to the smallest FORCE accounting unit, and never below the network minimum stake.
*   **SupplyDrop:** A time-bounded, sponsor-funded reward round that selects one Sector using committed future-block-hash pseudo-randomness and pays the wallet that controlled it at the round deadline.
*   **SupplyDrop Sponsor:** The game admin or a wallet holding `SUPPLY_DROP_CREATOR_ROLE` that creates a SupplyDrop and escrows its complete token prize before the round begins. Multiple sponsors may be authorized while the initial release still permits only one active SupplyDrop globally.
*   **Keeper:** An unprivileged keeper service that observes indexed onchain state and submits permissionless maintenance transactions, including Operator synchronization, SupplyDrop locking and settlement, and expired Beacon auction settlement. The Keeper cannot select winners, alter commitments, or bypass contract validation.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Delegation-Backed Allocation Accounting)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (the official Starknet staking and delegation pool contracts) handles custody, yield, and authoritative Staking Power, while the **Game Layer** (the Stake Wars Dojo World) represents that delegated STRK as Control Force and tracks Sector ownership and recorded Capture Force.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Staking Flow:** Operators stake STRK through the dedicated Staking interface before taking force-sensitive game actions. Capture, takeover, and reinforcement transactions never approve or stake STRK automatically; when Available Force is insufficient, the client shows the exact deficit and directs the Operator to generate more FORCE first.
*   **Authoritative Balance:** Before every force-sensitive action, the Control System reads the Operator's live `amount` and unpooling state from the official STRK delegation pool. Delegation performed directly through the official contract is therefore recognized without passing through a Stake Wars capture call.
*   **Allocation Accounting:** The Game Layer records only the obligation needed to prevent reuse: aggregate Sector Commitments. Available Force is derived from Sector Commitments and Live Delegation.
*   **No Double Backing:** One unit of Live Delegation can support only one garrison at a time. An Operator with 3,000 delegated STRK has 3,000 FORCE, may deploy 1,000 FORCE to one Sector, and retains 2,000 Available Force; the same 1,000 FORCE cannot back another action.
*   **Explicit Amounts:** Capture, takeover, and reinforcement calls specify visible FORCE amounts. A capture or takeover locks its exact commitment; a reinforcement locks only the added amount.
*   **Desynchronization Penalty:** If Live Delegation falls below recorded obligations, the Operator address is permanently retired and all of its holdings are invalidated. Ownership generations make all affected Sectors neutral without iterating over all 2,000 sectors.
*   **Keeper Synchronization:** The Keeper periodically calls `sync_operators` for known active Operators. This detects unpooling initiated directly through the official staking contract even when the Operator never returns to the Stake Wars application. Every normal force-sensitive game action performs the same authoritative check independently.
*   **No Custody:** Stake Wars contracts never transfer, escrow, or withdraw an Operator's STRK.

#### 3.1.2. Capture, Reinforcement, and Release
*   **Neutral Capture:** A neutral Sector may be captured by allocating at least the network-configured minimum stake and no more than Available Force. The Sepolia testing minimum is **0.1 FORCE** and the Mainnet production minimum is **100 FORCE**, each backed 1:1 by the corresponding delegated STRK amount. These values are stored in base units in each World's `GameConfig` and must not be inferred from the frontend environment.
*   **Reinforcement:** A Controller may allocate a selected positive amount of Available Force to one owned Sector. Reinforcement increases both that sector's Capture Force and the Operator's aggregate Sector Commitments, and therefore raises its Minimum Takeover Force.
*   **Release:** A Controller may voluntarily release a Sector. The sector becomes neutral, its active image is hidden, and its Capture Force returns to Available Force.
*   **Multiple Positions:** An Operator may hold any number of Sectors while sufficient Available Force remains.

#### 3.1.3. Instant Takeover
*   **Takeover:** Any eligible Operator other than the current Controller may take an occupied Sector by committing at least its Minimum Takeover Force and no more than its Available Force. The minimum is 10% more than the current Capture Force, rounded up to the smallest FORCE accounting unit (1:1 with a STRK base unit), and never below the network minimum stake. Commitments below the minimum, including ties and one-base-unit increases, are rejected.
*   **Atomic Transfer:** In the takeover transaction the Sector's Controller, Capture Force, ownership generation, and ownership timestamp change. The displaced Controller's Capture Force is removed from its Sector Commitments and becomes Available Force immediately, and artwork bound to the previous ownership generation is hidden (§3.2).
*   **No Window or Losing Position:** Ownership changes as soon as the transaction is accepted. There is no response window, settlement step, Keeper duty, or Spent Force. A displaced Controller loses the Sector, its SupplyDrop eligibility, and its displayed artwork, but none of its FORCE.
*   **Invalid Controllers:** If the recorded Controller has retired, been disqualified, or holds a stale ownership generation, the Sector is neutral and follows Neutral Capture at the minimum stake.
*   **Back-and-Forth Contests:** A displaced Controller may immediately retake the Sector by committing at least 10% more than the new Capture Force, using its returned FORCE plus any other Available Force. A contested Sector can therefore change hands repeatedly. Each exchange raises the FORCE locked on it, so holding a position other Operators want requires more delegated stake than any of them is willing to commit. The contest ends when one side cannot or chooses not to commit more.
*   **Example:** A holds a Sector with 1,000 FORCE. B takes it with 1,100 FORCE, and A's 1,000 returns to A's Available Force. A retakes it with 1,210 FORCE, which needs 210 FORCE beyond A's returned amount, and B's 1,100 returns to B. B then needs at least 1,331 FORCE to take it back.
*   **Pre-emptive Defense:** A Controller defends only in advance, by reinforcing to raise the Minimum Takeover Force. There is no response after a takeover other than taking the Sector back.

#### 3.1.4. Privacy Boundary
*   Stake Wars never transfers, escrows, or slashes STRK. A takeover changes only game accounting; every Operator's STRK remains directly delegated and reward-bearing under the official pool rules.
*   **Public Deployment:** Operator identities, direct delegation, Sector commitments, takeovers, reinforcements, and releases are public onchain.
*   **Beacon Bids:** Beacon bids are public STRK transfers escrowed by the Beacon System, never delegated or staked STRK, and they do not affect FORCE. Direct delegation, FORCE commitments, takeovers, Sector control, and Beacon bids are all public onchain.

#### 3.1.5. Withdrawal and Permanent Retirement
*   **Retirement:** Initiating an unpool or withdrawal from the official staking contract permanently retires that address from Stake Wars. Its ownership generation is invalidated, its Sectors become neutral, and it may never capture, take over, or reinforce again.
*   **Direct Official-Contract Actions:** The periodic operator synchronization process and every game action inspect official unpooling state, so initiating an exit outside the Stake Wars UI is still detected.
*   **Explicit Game Exit:** `retire` is a permanent retirement action, not a temporary release-all shortcut.
*   **Latency:** Funds remain subject to the official Starknet unbonding period. Retirement applies immediately when the unpool intent is detected; the UI may continue showing the official unlock timestamp.
*   **New Identity:** A player may use another address, but it starts with no history or tenure. Address tenure is expected to influence future gameplay and cannot be transferred from a retired address.

#### 3.1.6. Sector SupplyDrops
*   **Single Active Round:** The initial release permits one active SupplyDrop. Each SupplyDrop has its own ID and isolated state so the design can later be extended to concurrent rounds without changing historical records.
*   **Creator Role:** The Admin System uses OpenZeppelin Cairo AccessControl. The canonical `GameConfig.admin` is the sole effective `DEFAULT_ADMIN_ROLE` holder and may independently grant or revoke `SUPPLY_DROP_CREATOR_ROLE` for any number of wallets. Direct grants, revocations, or renunciation of the default-admin role are forbidden; `transfer_admin` atomically moves it to the new game admin. The SupplyDrop creator UI reads `has_role`, while the game admin remains an implicit authorized creator.
*   **Upfront Escrow:** An authorized sponsor supplies a positive duration and one ERC-20, ERC-721, or ERC-1155 prize. The SupplyDrop System pulls the complete prize from that sponsor into its own contract before activating the round, verifies the resulting balance or ownership, and rejects fee-on-transfer or otherwise non-conforming assets. SupplyDrop escrow never moves an Operator's delegated STRK or FORCE.
*   **Active Top-ups:** The game admin and current `SUPPLY_DROP_CREATOR_ROLE` holders may increase an active SupplyDrop before its current round deadline, including after a no-winner rollover. Each top-up pulls a positive increment from the caller into escrow and verifies the exact received balance. ERC-20 top-ups use the existing token; ERC-1155 top-ups use the existing token and token ID. ERC-721 prizes cannot be increased. Top-ups preserve the original sponsor, deadline, duration, draw history, and ownership cutoff rules. They are rejected while paused, funding, drawing, or settled, and at or after the deadline. The winner claims the accumulated prize. Each successful top-up emits `SupplyDropToppedUp` with the contributor, increment, and new total. Creation and top-up controls live only on the unlisted `/play/drop/create` route. That page reads the current SupplyDrop onchain, offers top-ups to eligible connected wallets while a round is active, and shows creation only when no active round exists; the public SupplyDrop page remains the prize and draw view.
*   **Control Cutoff:** The winning wallet is the wallet that controlled the selected Sector at the round deadline. Gameplay does not pause. Before the first post-deadline change to a Sector or Operator, the Control System lazily records its pre-change state for that SupplyDrop and draw count. Unchanged state is read directly at settlement. The configured staking-pool address and Sector limit are snapshotted when the SupplyDrop is created.
*   **Permissionless Randomness Lock:** After expiry, any account may lock the draw. Locking commits to the block ten blocks in the future, before its hash is known. Settlement becomes available ten blocks after that target block so the Starknet block-hash syscall can read it. The Keeper should submit both transactions, but has no privileged role.
*   **Selection:** The SupplyDrop System domain-separates and Poseidon-hashes the committed block hash with the SupplyDrop ID, draw count, and round deadline, then maps the result into the snapshotted Sector range. It resolves that Sector's Controller from the deadline state. A release, capture, takeover, retirement, or disqualification after the deadline cannot redirect or revoke the prize.
*   **Deadline Takeovers:** Because takeovers are instant, control in the final minutes before a deadline decides eligibility, and Operators with spare Available Force may take lightly defended Sectors just before it. This is accepted for the initial rules; a minimum holding period before the deadline may be considered if it proves unfair in practice.
*   **Rollover:** A selected Sector that was neutral or whose recorded ownership generation was already stale at the deadline has no winner. The prize remains escrowed and the same SupplyDrop immediately begins another full-duration round with a fresh cutoff, incrementing its public draw count.
*   **Payout:** Settlement records the deadline Controller and finalizes the SupplyDrop while normal territory play continues. The winner then calls `claim_prize` to transfer the exact escrowed token amount or token ID to a chosen nonzero recipient. Keeping payout separate prevents a rejecting token or recipient from blocking SupplyDrop finalization; failed claims remain retryable.
*   **Supply Drop staking:** The public feature is named Supply Drop (Drop in navigation). Every round records a required `SupplyDropStakingPolicy` at creation. ERC-20 prizes matching the configured pool's staking token require staking; other prize assets have an explicit non-staking policy. Missing policies are rejected. Creation and top-ups reject staking prizes larger than the pool's u128 amount limit. The frontend reads the policy and settled amount directly onchain, then submits `claim_prize → approve → enter/add delegation → sync_operator` in one wallet multicall. Failure rolls back the claim and transfer. The same pool fixed in the policy is used for staking.
*   **Claim hold:** Claiming a staking-required drop records a `SupplyDropHold` on the winning wallet before transferring the prize, with a target equal to its live delegated balance immediately before claim plus the full prize. The payout recipient cannot redirect that obligation. This is temporary accounting separate from Sector Commitments; it must never trigger insolvency or reset ownership generations. A pending hold blocks another staking-required Drop claim and the winner's captures, takeovers, reinforcements, releases, batch actions, and new image authorizations/completions. Opponents, synchronization, and exits continue normally. Existing Sectors and artwork remain visible and open to takeover.
*   **Hold recovery:** All hold checks read the official pool fixed at claim time; deposits to another pool or existing pre-claim stake do not satisfy the requirement. Partial deposits count toward the target. Once the active balance reaches the target without an exit intent, subsequent gameplay/synchronization clears the stored hold; image permission reads recognize the fulfilled target immediately. The UI exposes the remaining amount and a stake-and-sync recovery action for direct claims. Clearing a hold never reverses permanent retirement. This condition requires staking to resume gameplay, not to receive a direct claim: a winner may keep the payout and abandon the wallet. No minimum staking duration is imposed beyond existing exit rules.
*   **Randomness Boundary:** Future block hashes are suitable only for this transparent MVP incentive. They are not bias-resistant against the Starknet block producer. A production launch with materially valuable prizes requires a contract security review, an economic/manipulation review, and migration to an audited Starknet randomness source or verifiable random function when available.

#### 3.1.7. Migration from Open Challenges
Earlier releases resolved contests for occupied Sectors through open ascending Challenges with a response window, settlement, Sector Sacrifice, and permanently Spent Force. The instant-takeover rules replace them through an in-place Control System upgrade of the existing World; this is not a new World and does not trigger the artwork cutover.

*   **Quiescence:** Before upgrading, pause gameplay, settle every active Challenge, and resolve every remaining losing position so that no Challenge commitment is outstanding.
*   **Spent Force Forgiven:** The upgraded Control System computes Available Force from Live Delegation and Sector Commitments only. Recorded Spent Force is ignored, so affected Operators regain it as Available Force when the upgrade lands. No per-Operator reset transaction is required.
*   **Legacy Storage:** Registered Dojo resources persist and model fields cannot be removed. The `Challenge`, `ChallengeParticipant`, and Challenge counter models and the Challenge events leave the source but remain onchain as history; their writer grants are revoked after migration. The `OperatorState` Challenge and Spent Force fields and `Sector.active_challenge_id` remain in their models but are never read. `GameConfig.challenge_period_seconds` is still accepted by the unchanged admin rules interface but has no gameplay effect.
*   **Removed Entrypoints:** `challenge`, `challenge_with_sacrifice`, `settle_challenge`, `resolve_challenge_position`, `get_challenge_status`, and `get_challenge_participant_status` are removed, and the Keeper stops settling Challenges. Takeovers reuse `capture` and `capture_many` and emit `SectorTakenOver`.
*   **Coordinated Release:** `get_sector_status` and `get_operator_status` drop their Challenge and Spent Force fields, so the API and frontend that decode them ship with the Control System upgrade while gameplay is paused.
*   **Client Cutover:** The frontend replaces the Challenge flow with a single take-over action, and the landing page, FAQ, and in-game copy describe the new rules before gameplay resumes.

### 3.2. Controller Image Loop
Control of a face is the visible reward for taking the High Ground.

*   **Assign:** The current Controller may project one artwork continuously across one or more selected Sectors they own after wallet and ownership verification. A multi-sector artwork is one projection, not a copy of the image on every face.
*   **Placement:** Before publication, the Core enters a live placement step. The Controller may continue orbiting, panning, and zooming the Core while positioning, scaling, and rotating the image. The preview continuously reprojects from the latest camera view onto only the selected surface, and publication captures that final camera and placement transform.
*   **Ownership Binding:** Each targeted face of an approved artwork is associated with the specific Sector ownership generation under which it was uploaded. The artwork, captured projector, placement transform, and target-face list are stored as one logical record.
*   **Displacement:** When control of one targeted face changes, that portion of the previous artwork is hidden immediately while portions on still-valid targets remain visible. It is not inherited by the new Controller and does not reappear if a previous Controller later recaptures the sector.
*   **Storage Boundary:** Image bytes and moderation metadata remain off-chain. The Dojo World remains authoritative for who may display an image.

### 3.3. Initial Product Scope
The first release intentionally excludes passive territory decay, recurring Operator maintenance requirements, CAPTCHA challenges, timing bonuses, secondary game tokens, and freely transferable Sector NFTs. These mechanics may be reconsidered only after observing whether allocation, capture, takeover, image, reinforcement, and SupplyDrop loops are understandable and fun on Mainnet.

---

## 4. Visual Identity & UI Requirements

### 4.1. Aesthetic Direction: "Command Terminal"
*   **Palette:** Strictly Monochrome. Black background (`#000000`), White text (`#FFFFFF`), Grey structural elements (`#333333`). Amber/Red accents only for alerts.
*   **Typography:** Monospaced fonts (e.g., *Space Mono*, *VT323*, or *Courier New*).
*   **VFX:**
    *   CRT Scanlines overlay.
    *   Chromatic aberration on hover states.
    *   "Datamosh" glitch effects when a Sector changes hands.

### 4.2. The Core (3D View)
*   **Interaction:** Rotate, Zoom, Pan.
*   **States:**
    *   **Empty Sector:** Wireframe outline.
    *   **Occupied Sector:** Solid fill (White) or displays the Operator's custom image.
    *   **Selected Sector:** Highlights and displays the Controller, Capture Force (labeled Defense), the Minimum Takeover Force, and the connected Operator's contextually relevant Available Force.
    *   **Control Views:** Control mode offers `FLAT VIEW` and `STAKED VIEW`. Staked View extrudes each occupied Sector radially according to its committed Capture Force so Operators can compare targets before selecting a Sector to take over. Users may switch the fixed height scale between capped absolute and logarithmic mappings; the exact Capture Force remains visible in the selected Sector panel. Projection mode remains flat.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED SECTOR 402 [10,000 FORCE]`
*   **Control Panel:** A concise action panel for Capture, Take Over, Reinforce, Release, and Retire transactions. It shows the Minimum Takeover Force, states that a displaced Controller's FORCE is returned in full, and directs Operators to the Staking interface when more FORCE is needed.
*   **Displacement Notice:** When an Operator loses a Sector to a takeover, its activity feed records the Sector, the new Controller, and the FORCE returned, so the Operator can decide whether to take it back.

### 4.4. Operator Image Uploads
*   **Control Requirement:** Only the wallet currently controlling every selected Sector may publish an artwork across them. The backend must independently verify wallet signatures, current Sector ownership, and ownership generation for every target both before upload and before publication; client-supplied owner addresses and Sector IDs are never trusted by themselves.
*   **Projection Model:** One uploaded image, one captured camera projector, and one placement transform span all selected target triangles. Projection UVs derive from the captured view rather than restarting on each Sector, so adjacent targets form one contiguous canvas.
*   **Delivery:** Images are uploaded directly from the browser to object storage using a short-lived, object-specific upload authorization issued by the game API. Image bytes must not pass through or be stored on the validator server.
*   **Supported Formats:** WebP, JPEG, and PNG raster images only. SVG and other active or executable formats are prohibited.
*   **Limits:** The initial maximum encoded file size is 2 MB. The frontend should resize and encode images before upload, while the backend must still validate the file signature, MIME type, dimensions, and object size.
*   **Render Tiers:** The browser preserves each artwork's source aspect ratio while fitting its longest edge within a 512 px detail image and a 256 px display image. Projection mode records that aspect ratio and packs display images into dynamically sized, paged square atlas cells capped at 4096×4096 for an immediate baseline. Screen-space level of detail automatically overlays the detail source when visible artwork occupies enough physical display pixels, with separate promotion and demotion thresholds to prevent churn while zooming. The renderer keeps at most eight detail textures active, ranks them by projected size, and prioritizes featured, selected, or hovered artwork. This bounded fidelity rule remains the same as the World fills rather than degrading according to total artwork count or device class. Control mode does not load or render artwork textures.
*   **Object Naming:** Images use randomized, versioned object keys such as `art/<network>/<random-artwork-id>/detail.webp`. Replacements receive a new URL to avoid stale CDN caches.
*   **Moderation:** Every image record has a moderation status. The system must support reporting, administrative removal, rate limiting, and deletion of replaced or prohibited content.

---

## 5. Technical Architecture

### 5.1. Smart Contracts (Cairo)
Stake Wars is implemented as a Dojo World on Starknet Mainnet. Dojo models store game state, systems enforce state transitions, and Torii indexes model and event updates for clients.

*   **Models:**
    *   `GameConfig`: Official STRK delegation pool address, minimum stake, Sector limit, and pause state. Its legacy response-window field is unused (§3.1.7).
    *   `OperatorState`: Operator address, ownership generation, aggregate Sector Commitments, controlled-sector count, and retirement state. Its legacy Challenge Commitment, Spent Force, and active-position fields are unused (§3.1.7).
    *   `Sector`: Sector ID, Controller address, Controller generation, Capture Force, ownership generation, and ownership timestamp. Its legacy active challenge ID is unused (§3.1.7).
    *   `Challenge` and `ChallengeParticipant`: Legacy records from the open-Challenge rules, retained unchanged for history and no longer written (§3.1.7).
    *   `SupplyDropCounter`: Monotonic SupplyDrop ID and the single currently active SupplyDrop ID.
    *   `SupplyDrop`: Sponsor, standard token prize, snapshotted staking pool and Sector limit, schedule, draw commitment, last randomness and selected Sector, rollover count, winner, and settlement state.
    *   `SupplyDropSectorSnapshot` and `SupplyDropOperatorSnapshot`: Lazy per-draw cutoff records used only when post-deadline gameplay changes ownership-relevant state before settlement.
*   **Control System:** Implements Capture, instant Takeover, Reinforce, Release, permanent retirement, and Operator synchronization.
*   **SupplyDrop System:** Escrows standard ERC-20, ERC-721, and ERC-1155 prizes; accepts authorized ERC-20 and ERC-1155 top-ups before the active round deadline; accepts only expected safe NFT receipts; locks future-block randomness; resolves the selected Sector's deadline Controller from lazy snapshots; rolls over no-winner draws; finalizes without an external payout call; and lets the recorded winner claim to a chosen recipient.
*   **Staking Adapter:** Uses the official delegation pool's read-only `get_pool_member_info_v1` interface and treats its `amount`, `unpool_amount`, and `unpool_time` fields as authoritative delegation and exit state.
*   **Admin System:** Provides narrowly scoped pause and configuration operations plus OpenZeppelin AccessControl role administration. `GameConfig.admin` holds and transfers `DEFAULT_ADMIN_ROLE`; production ownership should be held by a multisig.
*   **Permissions:** Systems receive writer permission only for the specific models they modify. Reads are permissionless.
*   **Events:** Capture, Takeover (Sector, new Controller and Capture Force, displaced Controller, and returned FORCE), Reinforcement, Release, Retirement, Disqualification, SupplyDrop Created, SupplyDrop Topped Up, SupplyDrop Locked, SupplyDrop Rolled Over, SupplyDrop Settled, and SupplyDrop Claimed events drive Torii, the HUD ticker, and historical views. Historical Challenge events remain indexed.
*   **Custody Boundary:** The Dojo World never holds or transfers an Operator's staking assets. The SupplyDrop System separately escrows only the role-authorized sponsor's reward asset declared for its active round.

### 5.2. Backend API (Fly.io)
*   **Runtime:** A Go API service deployed on Fly.io at `api.stakewars.gg`. The initial target is one shared-CPU Machine with 512 MB RAM in the `sjc` region. CPU and memory may be increased if observed load requires it.
*   **Responsibilities:**
    *   Verify wallet challenges and current on-chain Sector ownership.
    *   Run the unprivileged Keeper loop that synchronizes known active Operators against the official staking contract, locks and settles expired SupplyDrops, and settles expired Beacon auctions.
    *   Authorize narrowly scoped, short-lived image uploads to Tigris.
    *   Validate completed uploads before publishing their metadata.
    *   Serve game metadata and apply rate limits per wallet and IP address.
*   **Initial Topology:** Run exactly one active API Machine while SQLite is the system of record. The Machine mounts a persistent Fly Volume at `/data`; normal deploys and restarts must preserve that volume. Do not add a second active API Machine that writes to the same SQLite database.
*   **Storage Boundary:** Uploaded images are never stored on the Machine or Fly Volume. The volume contains only the SQLite database and its related files; image bytes are uploaded directly to Tigris.
*   **Security:** Wallet challenges use short-lived, single-use nonces. Storage credentials and the dedicated Keeper private key are server-only secrets and must never be sent to the browser, logs, repository, or public configuration. The funded Keeper account has no privileged game role, prize custody, or settlement discretion: every submitted maintenance transaction is independently validated by the Dojo World, and no backend decryption key exists. On startup, the API derives the Keeper public key and verifies it against the configured account contract before enabling maintenance.

### 5.3. Image Storage (Tigris)
*   **Service:** Tigris S3-compatible object storage, provisioned through Fly.io.
*   **Public Bucket:** A dedicated production bucket (proposed name: `stakewars-art`) with public reads and authenticated writes stores approved Sector images.
*   **Backup Bucket:** A separate private bucket (proposed name: `stakewars-db-backups`) stores encrypted-in-transit Litestream replicas of the SQLite database. It must not allow public reads or share public image-delivery credentials.
*   **Domain:** Public images are served through `assets.stakewars.gg` using the bucket's custom-domain support.
*   **Upload Pattern:** The frontend requests authorization from the Fly API and then uploads directly to Tigris. The Fly API never proxies the image body during normal operation.
*   **CORS:** Production writes are allowed only from `https://stakewars.gg` and `https://play.stakewars.gg`; explicitly configured local development origins may also be allowed outside production.
*   **Lifecycle:** Database metadata is updated before a superseded object is deleted. Failed or abandoned uploads are removed by a cleanup process.
*   **Portability:** Application code uses the S3-compatible API rather than provider-specific filesystem assumptions.

### 5.4. Application Metadata
*   **Initial Database:** SQLite stores off-chain game, media, and moderation metadata on a persistent Fly Volume at `/data/stakewars.db`. The initial volume size is 1 GB and can be expanded as required.
*   **Database Configuration:** Enable WAL mode, foreign-key enforcement, and a 5-second busy timeout. Keep transactions short and serialize or retry writes where appropriate.
*   **Backup and Recovery:** Litestream continuously replicates SQLite to the private `stakewars-db-backups` Tigris bucket. Fly Volume snapshots are retained as an additional recovery layer, not as the sole database backup. Recovery from the Litestream replica must be documented and tested before production launch.
*   **Minimum Artwork Record:** `network`, `ownerAddress`, target Sector IDs and ownership generations, captured projector matrix, placement transform, `imageUrl`, `objectKey`, `thumbnailUrl`, `thumbnailObjectKey`, `contentHash`, `moderationStatus`, `createdAt`, and `updatedAt`.
*   **Authority:** On-chain contracts remain authoritative for Sector ownership. The database is an indexed application view and must be reconciled when ownership changes.
*   **Portability:** Database access is isolated behind a repository/data-access layer. Migrations, identifiers, timestamps, and query patterns should remain compatible with a later PostgreSQL migration where practical.
*   **Scaling Path:** SQLite permits vertical scaling of the single Fly Machine but not multiple active writers. Migrate to managed PostgreSQL before operating multiple active API Machines, multi-region writes, zero-downtime failover requiring concurrent writers, write-heavy background workers, or when measured lock contention affects requests.
*   **PostgreSQL Phase:** Once migrated, the API remains stateless with respect to local disk and may scale horizontally across multiple Fly Machines. Tigris continues to store image objects independently of the relational database.

### 5.5. Validator Infrastructure (Rebel Hosting)
*   **Domain:** `validator.stakewars.gg`.
*   **Initial Host:** Rebel Hosting KVM VPS with 6 vCPU, 16 GB RAM, 960 GB SSD, one public IP address, and unmetered 200 Mbps connectivity.
*   **Validator Workload:** Pruned Pathfinder full node, Equilibrium Starknet validator attestation service, and validator-specific monitoring.
*   **Isolation Requirement:** The validator must not host the Stake Wars game API, user uploads, image processing, application database, or frontend. Other workloads require explicit owner approval. The existing `dad-care-facilities.service` personal workload is an approved exception outside the Stake Wars project scope.
*   **Key Separation:** Only the operational validator key may be present on the server. Staking and rewards keys remain separate from the host.
*   **Operations:** Alert on chain-head lag, failed attestations, CPU steal, memory pressure, disk latency, disk utilization, staking-exporter health, validator self-stake, and delegation-pool inventory. Keep node/host operational health and staking economics on separate provisioned Grafana dashboards.

### 5.6. Frontend
*   **Framework:** Vite, React, and TypeScript.
*   **Domains:** `stakewars.gg` for the landing page and `play.stakewars.gg` for the game interface.
*   **3D Engine:** React Three Fiber (Three.js).
*   **Wallet:** Starknet.js / Argent / Braavos integration.
*   **Uploads:** Resize and encode approved images in the browser, obtain a scoped upload authorization from the Fly API, upload directly to Tigris, and notify the API when the upload completes.

### 5.7. Domain and Service Boundaries

| Domain | Service | Responsibility |
| --- | --- | --- |
| `stakewars.gg` | Vercel | Public landing page |
| `play.stakewars.gg` | Vercel | Game interface |
| `api.stakewars.gg` | Fly.io | Authentication, ownership verification, game metadata, and upload authorization |
| `assets.stakewars.gg` | Tigris | Public delivery of approved Sector images |
| `validator.stakewars.gg` | Rebel Hosting | Pathfinder full node and validator attestation |

### 5.8. Provisioning Status
*   **Rebel Hosting:** Validator VPS provisioned. The pinned Pathfinder mainnet node is fully synchronized, its RPC and metrics endpoints are bound to localhost, and private Prometheus/Grafana monitoring is active. The staking address registered 20,000 STRK on Mainnet in transaction `0x23d12461dcc23c0edd17659828312faaabc36087a82a59cf3efbf97351a2a3c`, with delegation commission initialized at 10%. Its active delegation pools are STRK at `0x06ea5688ff1395a4562238880d43500035fb55f2b80546e0e530770378cd1e2e`, WBTC at `0x0954563804e256000bd885f4e350e3d4312fceb74e0cf855b30bb456f16974d`, tBTC at `0x05f02f9d6558f648d513b2b78f4bf6d397add814ac05d57b911513c030a2149f`, SolvBTC at `0x067e406e6a22f5354ce35f266eaa64b87e9eb01d348f622543ae3c0848265d11`, and strkBTC at `0x04a76fde12dd971bf44a2e2b1f45f890d6da92c4e349d786fdf9ff82e35f6c4a`. The pinned Equilibrium v0.5.2 validator attestation service is active and tracking its assigned block over Pathfinder's `/rpc/v0_9` HTTP and `/ws/rpc/v0_9` WebSocket endpoints. Its private metrics target, the separate public-state staking exporter, the operations dashboard, the staking dashboard, and their alert rules are healthy.
*   **Fly.io:** The `stakewars` application is deployed in `sjc` with one shared-CPU Machine, 512 MB RAM, and an encrypted 1 GB `stakewars_data` volume mounted at `/data`. Scheduled Fly Volume snapshots are enabled with five-day retention. `api.stakewars.gg` is configured with an active Fly-managed TLS certificate.
*   **Tigris:** Planned; no production bucket or credentials have been created.
*   **Constraint:** Infrastructure resources are provisioned only as part of an explicitly approved implementation task.

---

## 6. User Stories

1.  **As an Operator:** I want gameplay actions expressed in FORCE while wallet, staking, withdrawal, and reward amounts remain clearly labeled in STRK.
2.  **As a Contender:** I want to take a Sector the moment I commit at least 10% more than its defense, without waiting on a timer or settlement.
3.  **As a Controller:** I want to position one camera-projected artwork across the contiguous surface I control so it reads as a whole rather than repeated tiles.
4.  **As a Displaced Controller:** I want my FORCE returned immediately when my Sector is taken so I can take it back or redeploy elsewhere.
5.  **As a Visitor:** I want Control mode to show ownership tenure as stable terrain so I can recognize entrenched positions without opening every Sector.
6.  **As a Strategist:** I want to reinforce the Sectors I value most so taking them costs rivals more delegated stake.
7.  **As an Exiting Operator:** I want the UI to clearly warn that beginning an unstake permanently retires this address from the game.
8.  **As a Beacon winner:** I want to publish one transmission with a required image and optional description and destination link so visitors can inspect it and follow any provided link from the Core.
9.  **As an Operator:** I want every Sector I control at a SupplyDrop deadline to give me a transparent chance at the advertised escrowed prize, even if it changes hands after the deadline.

---

## 7. Roadmap / Phasing

*   **Phase 1: Delegation-Backed Allocation and Open Challenges**
    *   Basic 3D Sphere.
    *   Dojo World with internal delegation-backed allocation, unlimited-participant incremental open ascending Challenges, resettable network-configured response windows (3 minutes on Sepolia; initially 3 hours on Mainnet) with no absolute duration cap, settlement-time losing-commitment spending, Sector sacrifice, permissionless settlement and position resolution, permanent retirement, and synchronization logic. Open Challenges are replaced in Phase 1.1.
    *   Mainnet integration with the Stake Wars validator's official STRK delegation pool.
    *   Starknet wallet connection and atomic stake-and-action multicalls.
    *   Torii-backed ownership and event updates in the frontend.
    *   Flat and Staked Control views with capped absolute and logarithmic Capture Force relief scales.
    *   Fly.io API with wallet-verified, ownership-bound upload authorization.
    *   Single-Machine Go API with SQLite on a Fly Volume, Litestream replication to a private Tigris backup bucket, and a tested recovery procedure before production data is accepted.
    *   Custom image uploads backed by Tigris and served from `assets.stakewars.gg`.
    *   Minimum viable image reporting and administrative removal.
    *   One role-authorized Sector SupplyDrop at a time with multiple possible creators, ERC-20, ERC-721, or ERC-1155 escrow, permissionless future-block-hash drawing, no-winner rollover, and Keeper maintenance.
*   **Phase 1.1: Instant Takeover**
    *   Upgrade the Control System in place so an occupied Sector changes hands to any Operator committing at least its Minimum Takeover Force, with the displaced Controller's FORCE returned in full (§3.1.3).
    *   Forgive recorded Spent Force, retire Challenge, Sector Sacrifice, settlement, and position-resolution entrypoints, and remove Challenge settlement from the Keeper (§3.1.7).
    *   Replace the in-game Challenge flow with a single take-over action and update the landing page, FAQ, and in-game copy.
*   **Phase 2: Open Beacon Auctions**
    *   Run one canonical open ascending auction at a time in the Dojo World's Beacon System, paid in STRK. The first bid at or above the reserve starts a three-day bidding window. Every later bid is public, must exceed the lead by at least 10% rounded up to the next base unit, and cannot come from the current leader. A bid placed in the final five minutes extends the deadline to five minutes after that bid.
    *   Escrow only the leading bid and refund the displaced leader in the same transaction. After the deadline, any account may settle: settlement sends the winning bid to the admin-configured proceeds recipient, makes the leader the Beacon controller, and opens the next pending round atomically. Every settled round therefore has a winner, and the backend never discovers a winner from an off-chain party.
    *   The current controller and signal remain active until a later round settles. Pending, open, and awaiting-settlement rounds never remove the current controller. Rule changes apply to the current round only while it has no bids.
    *   Give each newly settled controller one immutable transmission containing a required image, an optional plain-text description of at most 280 characters, and an optional absolute HTTP(S) destination link. Clicking the Beacon or its projection opens the sponsored transmission panel in the upper-right Core HUD. After the first successful publication, the controller cannot edit or replace any part of the transmission; a later winner receives a fresh publication slot. The preceding transmission remains active after control changes and is replaced atomically only when the new controller publishes.
    *   The Keeper settles expired rounds; settlement remains permissionless and available while gameplay is paused. The API projects settled rounds into Beacon history and re-verifies control against the chain before authorizing or publishing a transmission.
    *   Preserve every winner from the earlier Whisper sealed-bid rounds in Beacon history and controller continuity; the Beacon System's first round continues their numbering.
*   **Phase 3: The Command Expansion**
    *   Yield tracking dashboard.
    *   Live capture ticker, searchable gallery, and Operator profiles.
    *   Image moderation, reporting, replacement, and cleanup workflows.
    *   Recurring recovery drills, operational dashboards, and product analytics based on observed Mainnet usage.
*   **Phase 4: The Mesh Expansion**
    *   Migrate SQLite to managed PostgreSQL before enabling multiple active API Machines or multi-region writes.
    *   Horizontally scale the Fly API when measured traffic and reliability requirements justify it.
    *   Introduction of "Mesh Synergy" (Adjacency bonuses).
    *   Launch of secondary token ($RES) for governance or boosts.
