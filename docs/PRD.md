# Product Requirements Document (PRD): Stake Wars

**Version:** 2.0
**Status:** Draft
**Platform:** Starknet (L2)
**Aesthetic:** Command Terminal / Retro-Futurist

---

## 1. Executive Summary

**Stake Wars** is a persistent, gamified staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Sectors**) on a 3D spherical map (**The Core**). STRK is delegated to the Stake Wars validator through Starknet's native delegation protocol. Inside the game, that delegation becomes **FORCE**, which Operators allocate to Sectors and Challenges without creating a separate token. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic.

An Operator captures a neutral Sector by choosing how much FORCE, backed by delegated STRK, to commit. Taking an occupied sector initiates an open ascending Challenge: every force commitment is public, must exceed the current lead by at least 10%, and restarts a configurable response window set to 3 minutes on Sepolia for testing and initially 3 hours on Mainnet. Each Operator maintains one cumulative commitment and locks only the increment when escalating it. Losing the lead does not spend either position; when the Challenge expires, the winner's commitment becomes the new garrison and every losing Operator's highest commitment becomes Spent Force. Any eligible Operator may participate, there is no absolute Challenge-duration cap, and settlement is permissionless once a full response window passes without an escalation. The current Controller may display a custom image on that face until ownership changes. Admin-sponsored Jackpots periodically select one Sector and award an escrowed ERC-20, ERC-721, or ERC-1155 prize to the wallet that controlled it at the round deadline.

---

## 2. Glossary & Nomenclature

*   **The Core:** The global game map; a 3D geodesic sphere consisting of 2,000 unique faces.
*   **Sector:** A single triangular face on the Core. In the initial release it is a Dojo-native game territory, not a freely transferable NFT.
*   **Operator:** The user/player.
*   **Live Delegation:** An Operator's authoritative delegated STRK balance, read directly from the official delegation pool.
*   **Control Force (FORCE):** The game representation of an Operator's Live Delegation. One unit of FORCE corresponds to one unit of delegated STRK; FORCE is accounting terminology, not an ERC-20 or a custodial game asset.
*   **UI Unit Convention:** The interface labels derived gameplay accounting—including Available Force, Capture Force, garrisons, and Challenge commitments—in `FORCE`. It uses `STRK` only for actual token contexts such as wallet balances, delegation, staking, withdrawals, and rewards. The interface may explain that 1 FORCE is backed by 1 delegated STRK, but it must not present FORCE as a token or imply that FORCE is independently transferable.
*   **Committed Force:** Internal allocation accounting for the portion of Live Delegation bound to Sector garrisons or active cumulative Challenge positions. It cannot simultaneously back another action.
*   **Spent Force:** Staked STRK represented by a final losing Sector defense or Challenge commitment and no longer available to back Stake Wars gameplay from that Operator address. The underlying STRK remains delegated directly to the validator and continues following the official staking and reward rules.
*   **Available Force:** `max(0, Live Delegation - Sector Commitments - Active Challenge Commitments - Spent Force)`. This is derived contract accounting, not a token or user-managed currency. The UI exposes it as the Operator's currently deployable FORCE.
*   **Capture Force:** The Committed Force recorded on a Sector.
*   **Controller:** The Operator currently holding a Sector.
*   **Challenge:** An open, ascending contest for an occupied Sector.
*   **Leading Force:** The visible highest cumulative force commitment currently locked against a Challenge.
*   **Response Window:** The configurable time allowed for another Operator to commit enough force to take the lead. Every valid new leader resets the full window; there is no overall deadline.
*   **Sector Sacrifice:** Voluntarily giving up another owned, uncontested Sector while initiating or escalating a Challenge. The sector becomes neutral and its garrison returns to Available Force for the same atomic Challenge transaction; any assets remain attached to the sector.
*   **Jackpot:** A time-bounded, sponsor-funded reward round that selects one Sector using committed future-block-hash pseudo-randomness and pays the wallet that controlled it at the round deadline.
*   **Jackpot Sponsor:** The game admin that creates a Jackpot and escrows its complete token prize before the round begins. The initial release supports only this admin sponsor and one active Jackpot at a time.
*   **Keeper:** An unprivileged keeper service that observes indexed onchain state and submits permissionless maintenance transactions, including expired-Challenge settlement, older losing-position resolution, Operator synchronization, and Jackpot locking and settlement. The Keeper cannot select winners, alter commitments, or bypass contract validation.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Delegation-Backed Allocation Accounting)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (the official Starknet staking and delegation pool contracts) handles custody, yield, and authoritative Staking Power, while the **Game Layer** (the Stake Wars Dojo World) represents that delegated STRK as Control Force and tracks Sector ownership and recorded Capture Force.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Staking Flow:** Operators stake STRK through the dedicated Staking interface before taking force-sensitive game actions. Capture, reinforcement, and Challenge transactions never approve or stake STRK automatically; when Available Force is insufficient, the client shows the exact deficit and directs the Operator to generate more FORCE first.
*   **Authoritative Balance:** Before every force-sensitive action, the Control System reads the Operator's live `amount` and unpooling state from the official STRK delegation pool. Delegation performed directly through the official contract is therefore recognized without passing through a Stake Wars capture call.
*   **Allocation Accounting:** The Game Layer records only the obligations needed to prevent reuse: aggregate Sector Commitments, aggregate active cumulative Challenge Commitments, and aggregate Spent Force. Available Force is derived from those obligations and Live Delegation.
*   **No Double Backing:** One unit of Live Delegation can support only one garrison, active Challenge position, or spent position at a time. An Operator with 3,000 delegated STRK has 3,000 FORCE, may deploy 1,000 FORCE to one Sector, and retains 2,000 Available Force; the same 1,000 FORCE cannot back another action.
*   **Explicit Amounts:** Capture, reinforcement, and Challenge calls specify visible FORCE amounts. An initiating Challenge locks its exact commitment; a returning participant locks only the increase over that Operator's prior commitment.
*   **Desynchronization Penalty:** If Live Delegation falls below recorded obligations, the Operator address is permanently retired and all of its holdings and challenge positions are invalidated. Ownership generations make all affected Sectors neutral without iterating over all 2,000 sectors.
*   **Keeper Synchronization:** The Keeper periodically calls `sync_operators` for known active Operators. This detects unpooling initiated directly through the official staking contract even when the Operator never returns to the Stake Wars application. Every normal force-sensitive game action performs the same authoritative check independently.
*   **No Custody:** Stake Wars contracts never transfer, escrow, or withdraw an Operator's STRK.

#### 3.1.2. Capture, Reinforcement, and Release
*   **Neutral Capture:** A neutral Sector may be captured by allocating at least the network-configured minimum stake and no more than Available Force. The Sepolia testing minimum is **0.1 FORCE** and the Mainnet production minimum is **100 FORCE**, each backed 1:1 by the corresponding delegated STRK amount. These values are stored in base units in each World's `GameConfig` and must not be inferred from the frontend environment.
*   **Reinforcement:** A Controller may allocate a selected positive amount of Available Force to one owned, uncontested Sector. Reinforcement increases both that sector's Capture Force and the Operator's aggregate Sector Commitments.
*   **Release:** A Controller may voluntarily release an uncontested Sector. The sector becomes neutral, its active image is hidden, and its Capture Force returns to Available Force.
*   **Multiple Positions:** An Operator may lead multiple Challenges and manage other uncontested Sectors while sufficient Available Force remains.

#### 3.1.3. Open Ascending Challenges
*   **Initiating a Challenge:** Any eligible non-Controller may commit at least 10% more force than an occupied, uncontested sector's Capture Force. The minimum escalation is rounded up to the smallest FORCE accounting unit, corresponding 1:1 to a STRK base unit. The commitment and challenger are public.
*   **Opening Risk:** Initiating a Challenge places the incumbent's existing garrison and challenger's commitment at risk. Neither becomes Spent Force before settlement.
*   **Open Participation:** Any eligible Operator other than the current leader may submit a public total at least 10% above the current lead, rounded up to the smallest FORCE accounting unit. Each Operator has one cumulative position per Challenge.
*   **Incremental Escalation:** A returning Operator locks only `New Commitment - Own Previous Commitment`. Example: after committing 500 FORCE, escalating to 700 FORCE requires only 200 additional Available Force. Losing the lead changes the visible leader but does not spend or unlock the prior position.
*   **Anti-Sniping Window:** Every valid lead change resets the full admin-configured response window: **3 minutes on Sepolia** for rapid testing and initially **3 hours on Mainnet**. The current leader cannot challenge itself to extend the clock. There is no absolute duration cap; a Challenge continues as long as other Operators keep risking higher amounts. A later rule change applies when a subsequent lead change calculates its new response window.
*   **Minimum Escalation:** Commitments below the 10% minimum—including ties and one-base-unit increases—are rejected. The first accepted qualifying commitment becomes leader.
*   **Example:** A has a 500 FORCE position and B leads at 600 FORCE. A may commit 700 FORCE by locking 200 additional FORCE. B may then commit 800 FORCE by locking 200 additional FORCE. If the response window expires with B leading, B's 800 FORCE becomes the garrison and A's final 700 FORCE becomes Spent Force.

#### 3.1.4. Sector Sacrifice
*   Any participant may give up one other owned, uncontested Sector within the same Challenge transaction.
*   The source sector becomes neutral immediately and its image is hidden. Its garrison returns to Available Force before the new commitment is checked, so backing moves rather than duplicates.
*   Assets or future rewards attached to the source Sector remain with that sector and become available to future Controllers. A defender may therefore abandon one front to fund a response on another.

#### 3.1.5. Settlement and Privacy Boundary
*   After a full response window passes without a lead change, any account may call `settle_challenge`. The contract derives the result from its current leader; there is no settlement authority or off-chain ranking.
*   A valid leader's exact commitment becomes the target Sector's Capture Force. If the leader has invalidated its staking position before settlement, the sector becomes neutral.
*   Every non-winner loses its own highest cumulative commitment. Settlement resolves the winner, incumbent, and final runner-up in constant work. Because participation is unbounded, older losing positions are finalized permissionlessly one at a time; until resolved, they remain locked and reduce Available Force by the same amount.
*   **Keeper Maintenance:** The Keeper monitors expired Challenges, calls `settle_challenge`, and then calls `resolve_challenge_position` for any older unresolved losers. These entrypoints remain permissionless so another account may perform the work if the Keeper is delayed or offline.
*   Stake Wars never transfers, escrows, or slashes STRK. Spent Force is permanent game accounting for the Operator address; the underlying STRK remains directly delegated and reward-bearing under the official pool rules.
*   **Public Deployment:** Operator identities, direct delegation, cumulative commitments, incremental additions, Challenge timing, current leadership, sacrifices, deadlines, and settlement are public onchain.
*   **STRK20 Scope:** Stake Wars uses STRK20 only through Whisper's sealed-bid auction flow. Direct delegation, FORCE commitments, Challenge activity, and Sector control remain public onchain.

#### 3.1.6. Withdrawal and Permanent Retirement
*   **Retirement:** Initiating an unpool or withdrawal from the official staking contract permanently retires that address from Stake Wars. Its ownership generation is invalidated, its Sectors become neutral, and it may never capture, reinforce, or challenge again.
*   **Direct Official-Contract Actions:** The periodic operator synchronization process and every game action inspect official unpooling state, so initiating an exit outside the Stake Wars UI is still detected.
*   **Explicit Game Exit:** `retire` is a permanent retirement action, not a temporary release-all shortcut.
*   **Latency:** Funds remain subject to the official Starknet unbonding period. Retirement applies immediately when the unpool intent is detected; the UI may continue showing the official unlock timestamp.
*   **New Identity:** A player may use another address, but it starts with no history or tenure. Address tenure is expected to influence future gameplay and cannot be transferred from a retired address.

#### 3.1.7. Sector Jackpots
*   **Single Active Round:** The initial release permits one active Jackpot. Each Jackpot has its own ID and isolated state so the design can later be extended to concurrent rounds without changing historical records.
*   **Upfront Escrow:** The game admin supplies a positive duration and one ERC-20, ERC-721, or ERC-1155 prize. The Jackpot System pulls the complete prize into its own contract before activating the round, verifies the resulting balance or ownership, and rejects fee-on-transfer or otherwise non-conforming assets. Jackpot escrow never moves an Operator's delegated STRK or FORCE.
*   **Control Cutoff:** The winning wallet is the wallet that controlled the selected Sector at the round deadline. Gameplay does not pause. Before the first post-deadline change to a Sector or Operator, the Control System lazily records its pre-change state for that Jackpot and draw count. Unchanged state is read directly at settlement. The configured staking-pool address and Sector limit are snapshotted when the Jackpot is created.
*   **Permissionless Randomness Lock:** After expiry, any account may lock the draw. Locking commits to the block ten blocks in the future, before its hash is known. Settlement becomes available ten blocks after that target block so the Starknet block-hash syscall can read it. The Keeper should submit both transactions, but has no privileged role.
*   **Selection:** The Jackpot System domain-separates and Poseidon-hashes the committed block hash with the Jackpot ID, draw count, and round deadline, then maps the result into the snapshotted Sector range. It resolves that Sector's Controller from the deadline state. If a Challenge was active at the deadline, the incumbent Controller wins regardless of how or when that Challenge later settles. A release, capture, retirement, or disqualification after the deadline cannot redirect or revoke the prize.
*   **Rollover:** A selected Sector that was neutral or whose recorded ownership generation was already stale at the deadline has no winner. The prize remains escrowed and the same Jackpot immediately begins another full-duration round with a fresh cutoff, incrementing its public draw count.
*   **Payout:** Settlement records the deadline Controller and finalizes the Jackpot while normal territory play continues. The winner then calls `claim_prize` to transfer the exact escrowed token amount or token ID to a chosen nonzero recipient. Keeping payout separate prevents a rejecting token or recipient from blocking Jackpot finalization; failed claims remain retryable.
*   **Randomness Boundary:** Future block hashes are suitable only for this transparent MVP incentive. They are not bias-resistant against the Starknet block producer. A production launch with materially valuable prizes requires a contract security review, an economic/manipulation review, and migration to an audited Starknet randomness source or verifiable random function when available.

### 3.2. Controller Image Loop
Control of a face is the visible reward for taking the High Ground.

*   **Assign:** The current Controller may project one artwork continuously across one or more selected Sectors they own after wallet and ownership verification. A multi-sector artwork is one projection, not a copy of the image on every face.
*   **Placement:** Before publication, the Core enters a live placement step. The Controller may continue orbiting, panning, and zooming the Core while positioning, scaling, and rotating the image. The preview continuously reprojects from the latest camera view onto only the selected surface, and publication captures that final camera and placement transform.
*   **Ownership Binding:** Each targeted face of an approved artwork is associated with the specific Sector ownership generation under which it was uploaded. The artwork, captured projector, placement transform, and target-face list are stored as one logical record.
*   **Displacement:** When control of one targeted face changes, that portion of the previous artwork is hidden immediately while portions on still-valid targets remain visible. It is not inherited by the new Controller and does not reappear if a previous Controller later recaptures the sector.
*   **Storage Boundary:** Image bytes and moderation metadata remain off-chain. The Dojo World remains authoritative for who may display an image.

### 3.3. Initial Product Scope
The first release intentionally excludes passive territory decay, recurring Operator maintenance requirements, CAPTCHA challenges, timing bonuses, secondary game tokens, and freely transferable Sector NFTs. These mechanics may be reconsidered only after observing whether allocation, capture, challenge, settlement, image, reinforcement, and Jackpot loops are understandable and fun on Mainnet.

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
    *   **Selected Sector:** Highlights and displays the Controller, Capture Force, current leader, Leading Force, lead-change count, response-window deadline, and the connected Operator's contextually relevant Available Force.
    *   **Control Views:** Control mode offers `FLAT VIEW` and `STAKED VIEW`. Staked View extrudes each occupied Sector radially according to its committed Capture Force so Operators can compare targets before selecting a Sector to challenge. Users may switch the fixed height scale between capped absolute and logarithmic mappings; the exact Capture Force remains visible in the selected Sector panel. Projection mode remains flat.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED SECTOR 402 [10,000 FORCE]`
*   **Control Panel:** A concise action panel for Capture, Reinforce, Release, Initiate Challenge, Escalate Challenge, Sector Sacrifice, permissionless Settlement, and Retire transactions. It clearly communicates that Challenge commitments are public and the final losing total becomes Spent Force, shows the minimum qualifying commitment and incremental lock, and directs Operators to the Staking interface when more FORCE is needed.

### 4.4. Operator Image Uploads
*   **Control Requirement:** Only the wallet currently controlling every selected Sector may publish an artwork across them. The backend must independently verify wallet signatures, current Sector ownership, and ownership generation for every target both before upload and before publication; client-supplied owner addresses and Sector IDs are never trusted by themselves.
*   **Projection Model:** One uploaded image, one captured camera projector, and one placement transform span all selected target triangles. Projection UVs derive from the captured view rather than restarting on each Sector, so adjacent targets form one contiguous canvas.
*   **Delivery:** Images are uploaded directly from the browser to object storage using a short-lived, object-specific upload authorization issued by the game API. Image bytes must not pass through or be stored on the validator server.
*   **Supported Formats:** WebP, JPEG, and PNG raster images only. SVG and other active or executable formats are prohibited.
*   **Limits:** The initial maximum encoded file size is 2 MB. The frontend should resize and encode images before upload, while the backend must still validate the file signature, MIME type, dimensions, and object size.
*   **Render Tiers:** The browser prepares one 512×512 detail image and one 256×256 display image per artwork from the same centered square crop. Projection mode packs display images into dynamically sized, paged atlases capped at 4096×4096 for an immediate baseline. Screen-space level of detail automatically overlays the 512×512 source when visible artwork occupies enough physical display pixels, with separate promotion and demotion thresholds to prevent churn while zooming. The renderer keeps at most eight detail textures active, ranks them by projected size, and prioritizes featured, selected, or hovered artwork. This bounded fidelity rule remains the same as the World fills rather than degrading according to total artwork count or device class. Control mode does not load or render artwork textures.
*   **Object Naming:** Images use randomized, versioned object keys such as `art/<network>/<random-artwork-id>/detail.webp`. Replacements receive a new URL to avoid stale CDN caches.
*   **Moderation:** Every image record has a moderation status. The system must support reporting, administrative removal, rate limiting, and deletion of replaced or prohibited content.

---

## 5. Technical Architecture

### 5.1. Smart Contracts (Cairo)
Stake Wars is implemented as a Dojo World on Starknet Mainnet. Dojo models store game state, systems enforce state transitions, and Torii indexes model and event updates for clients.

*   **Models:**
    *   `GameConfig`: Official STRK delegation pool address, minimum stake, admin-configurable response-window period (3 minutes on Sepolia; initially 3 hours on Mainnet), Sector limit, and pause state.
    *   `OperatorState`: Operator address, ownership generation, aggregate Sector Commitments, aggregate active Challenge Commitments, aggregate Spent Force, controlled-sector count, active-position count, and retirement state.
    *   `Sector`: Sector ID, Controller address, Controller generation, Capture Force, ownership generation, ownership timestamp, and active challenge ID.
    *   `Challenge`: Challenge ID, target Sector, incumbent, current leader and generation, Leading Force, latest displaced Operator and amount, resettable deadline, lead-change and participant counts, winner, and settlement timestamp.
    *   `ChallengeParticipant`: Per-Challenge Operator position, cumulative committed force, included incumbent garrison, Operator generation, and resolution result.
    *   `JackpotCounter`: Monotonic Jackpot ID and the single currently active Jackpot ID.
    *   `Jackpot`: Sponsor, standard token prize, snapshotted staking pool and Sector limit, schedule, draw commitment, last randomness and selected Sector, rollover count, winner, and settlement state.
    *   `JackpotSectorSnapshot` and `JackpotOperatorSnapshot`: Lazy per-draw cutoff records used only when post-deadline gameplay changes ownership-relevant state before settlement.
*   **Control System:** Implements Capture, Reinforce, Release, incremental open ascending Challenges, deferred losing-commitment spending, Sector Sacrifice, permissionless settlement and position resolution, permanent retirement, and Operator synchronization.
*   **Jackpot System:** Escrows standard ERC-20, ERC-721, and ERC-1155 prizes; accepts only expected safe NFT receipts; locks future-block randomness; resolves the selected Sector's deadline Controller from lazy snapshots; rolls over no-winner draws; finalizes without an external payout call; and lets the recorded winner claim to a chosen recipient.
*   **Staking Adapter:** Uses the official delegation pool's read-only `get_pool_member_info_v1` interface and treats its `amount`, `unpool_amount`, and `unpool_time` fields as authoritative delegation and exit state.
*   **Admin System:** Provides narrowly scoped pause and configuration operations protected by Dojo World ownership. Production ownership should be held by a multisig.
*   **Permissions:** Systems receive writer permission only for the specific models they modify. Reads are permissionless.
*   **Events:** Capture, Reinforcement, Release, Challenge Initiated, Challenge Escalated, Sector Sacrificed, Challenge Settled, Challenge Position Resolved, Retirement, Disqualification, Jackpot Created, Jackpot Locked, Jackpot Rolled Over, Jackpot Settled, and Jackpot Claimed events drive Torii, the HUD ticker, and historical views.
*   **Custody Boundary:** The Dojo World never holds or transfers an Operator's staking assets. The Jackpot System separately escrows only the admin-sponsored reward asset declared for its active round.

### 5.2. Backend API (Fly.io)
*   **Runtime:** A Go API service deployed on Fly.io at `api.stakewars.gg`. The initial target is one shared-CPU Machine with 512 MB RAM in the `sjc` region. CPU and memory may be increased if observed load requires it.
*   **Responsibilities:**
    *   Verify wallet challenges and current on-chain Sector ownership.
    *   Run the unprivileged Keeper loop that settles expired Challenges, resolves remaining losing positions, synchronizes known active Operators against the official staking contract, and locks and settles expired Jackpots.
    *   Authorize narrowly scoped, short-lived image uploads to Tigris.
    *   Validate completed uploads before publishing their metadata.
    *   Serve game metadata and apply rate limits per wallet and IP address.
*   **Initial Topology:** Run exactly one active API Machine while SQLite is the system of record. The Machine mounts a persistent Fly Volume at `/data`; normal deploys and restarts must preserve that volume. Do not add a second active API Machine that writes to the same SQLite database.
*   **Storage Boundary:** Uploaded images are never stored on the Machine or Fly Volume. The volume contains only the SQLite database and its related files; image bytes are uploaded directly to Tigris.
*   **Security:** Wallet challenges use short-lived, single-use nonces. Storage credentials are server-only secrets and must never be sent to the browser, logs, repository, or public configuration. The Keeper has no privileged game role or settlement discretion: every submitted maintenance transaction is independently validated by the Dojo World, and no backend decryption key exists.

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
2.  **As a Challenger:** I want to see the current lead and response window before deciding whether a higher public commitment is worth permanently risking.
3.  **As a Controller:** I want to position one camera-projected artwork across the contiguous surface I control so it reads as a whole rather than repeated tiles.
4.  **As a Challenge Participant:** I want every lead change to reset the response window so last-block sniping cannot bypass my chance to respond.
5.  **As a Visitor:** I want Control mode to show ownership tenure as stable terrain so I can recognize entrenched positions without opening every Sector.
6.  **As a Strategist:** I want to sacrifice another Sector to fund a higher Challenge commitment without duplicating its backing, accepting that the abandoned territory becomes contestable.
7.  **As an Exiting Operator:** I want the UI to clearly warn that beginning an unstake permanently retires this address from the game.
8.  **As a Beacon winner:** I want to publish one transmission with an image, description, and destination link so visitors can inspect and follow it from the Core.
9.  **As an Operator:** I want every Sector I control at a Jackpot deadline to give me a transparent chance at the advertised escrowed prize, even if its Challenge settles later.

---

## 7. Roadmap / Phasing

*   **Phase 1: Delegation-Backed Allocation and Open Challenges**
    *   Basic 3D Sphere.
    *   Dojo World with internal delegation-backed allocation, unlimited-participant incremental open ascending Challenges, resettable network-configured response windows (3 minutes on Sepolia; initially 3 hours on Mainnet) with no absolute duration cap, settlement-time losing-commitment spending, Sector sacrifice, permissionless settlement and position resolution, permanent retirement, and synchronization logic.
    *   Mainnet integration with the Stake Wars validator's official STRK delegation pool.
    *   Starknet wallet connection and atomic stake-and-action multicalls.
    *   Torii-backed ownership and event updates in the frontend.
    *   Flat and Staked Control views with capped absolute and logarithmic Capture Force relief scales.
    *   Fly.io API with wallet-verified, ownership-bound upload authorization.
    *   Single-Machine Go API with SQLite on a Fly Volume, Litestream replication to a private Tigris backup bucket, and a tested recovery procedure before production data is accepted.
    *   Custom image uploads backed by Tigris and served from `assets.stakewars.gg`.
    *   Minimum viable image reporting and administrative removal.
    *   One admin-sponsored Sector Jackpot at a time with ERC-20, ERC-721, or ERC-1155 escrow, permissionless future-block-hash drawing, no-winner rollover, and Keeper maintenance.
*   **Phase 2: Whisper-Powered Beacon Auctions**
    *   Consume Whisper as a pinned, standalone companion library for private STRK20 Vickrey auctions; Whisper owns the reusable contract, SDK, encrypted capsule, vault operator, and post-settlement winner disclosure, while Stake Wars owns the game UX, canonical round, automatic controller resolution, and billboard fulfillment.
    *   Keep one canonical start-on-bid auction available. The first sealed bid starts a three-day bidding window; until another qualifying winner is confirmed and automatically resolved, the current Beacon controller and signal remain active. Settled no-winner and aborted rounds do not remove the current controller.
    *   Give each newly confirmed controller one immutable transmission containing an image, a plain-text description of at most 280 characters, and an absolute HTTP(S) destination link. Clicking the Beacon or its projection opens the sponsored transmission panel in the upper-right Core HUD. After the first successful publication, the controller cannot edit or replace any part of the transmission; a later winner receives a fresh publication slot.
    *   Run auction cycling as an idempotent duty of the backend Beacon worker. After a terminal round, it creates and registers the next pending auction without changing controller state; the authorized onchain transaction builder remains isolated from the worker's other permissionless maintenance duties.
    *   Gate Stake Wars bidding, winner resolution, and Mainnet launch milestones on the corresponding Whisper wallet, operator, deployment, and recovery milestones recorded in `STRK20_INTEGRATION_PLAN.md`.
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
