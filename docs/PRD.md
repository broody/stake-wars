# Product Requirements Document (PRD): StakeWars.gg

**Version:** 1.7
**Status:** Draft
**Platform:** Starknet (L2)
**Aesthetic:** Command Terminal / Retro-Futurist

---

## 1. Executive Summary

**StakeWars.gg** is a persistent, gamified staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Control Points**) on a 3D spherical map (**The Core**). STRK is delegated to the StakeWars validator through Starknet's native delegation protocol. Operators explicitly allocate portions of that real delegation to Control Points and challenges without creating a separate power currency. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic.

An Operator captures a neutral Control Point by choosing how much Available Power to commit. Taking an occupied point starts a 12-hour public challenge in which any eligible Operator may take the lead by reaching at least 10% more committed STRK than the current leader. Commitments are cumulative, leadership changes reset the timer, and settlement awards the Control Point to the winner while every losing allocation unlocks for reuse. The current controller may display a custom image on that face until ownership changes.

---

## 2. Glossary & Nomenclature

*   **The Core:** The global game map; a 3D geodesic sphere consisting of 2,000 unique faces.
*   **Control Point:** A single triangular face on the Core. In the initial release it is a Dojo-native game territory, not a freely transferable NFT.
*   **Operator:** The user/player.
*   **Live Delegation:** An Operator's authoritative delegated STRK balance, read directly from the official delegation pool.
*   **Committed Power:** The portion of Live Delegation an Operator has explicitly bound to owned Control Points or an active challenge. It cannot simultaneously back another action.
*   **Available Power:** `max(0, Live Delegation - Point Commitments - Challenge Commitments)`. It is a derived limit, not a separate balance or token. Operators choose how much of it to commit to each action.
*   **Capture Power:** The Committed Power recorded on a Control Point.
*   **Controller:** The Operator currently holding a Control Point.
*   **Challenge:** A 12-hour contest for an occupied Control Point.
*   **Leader:** The challenge participant with the highest qualifying cumulative commitment. A new leader must reach at least 10% more than the previous Leader.
*   **Collateral Sacrifice:** Voluntarily giving up another owned Control Point and moving its existing commitment into an active challenge. The sacrificed point becomes neutral; any assets remain attached to it.
*   **High Ground:** The rule requiring a new Leader's cumulative commitment to be at least 10% greater than the current Leader's commitment.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Delegation-Backed Allocation Accounting)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (the official Starknet staking and delegation pool contracts) handles custody, yield, and authoritative Staking Power, while the **Game Layer** (the StakeWars Dojo World) tracks Control Point ownership and recorded Capture Power.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Action:** A transaction may first approve STRK and enter or add to the StakeWars validator's official delegation pool, then call a game action from the same Starknet account.
*   **Authoritative Balance:** Before every power-sensitive action, the Control System reads the Operator's live `amount` and unpooling state from the official STRK delegation pool. Delegation performed directly through the official contract is therefore recognized without passing through a StakeWars capture call.
*   **Allocation Accounting:** The Game Layer records only obligations needed to prevent reuse: aggregate Point Commitments and the active Challenge Commitment. Available Power is derived from those obligations and Live Delegation; it is not a freely editable reserve or secondary token.
*   **No Double Backing:** One unit of Live Delegation can support only one Point Commitment or Challenge Commitment at a time. An Operator with 3,000 delegated STRK may allocate 1,000 to one Control Point and retain 2,000 Available Power for other actions, but the same 1,000 cannot back a second point or challenge.
*   **Explicit Amounts:** Each capture, reinforcement, or challenge call specifies the amount of Available Power to commit. The contract verifies that the selected amount remains backed by Live Delegation at execution time.
*   **Desynchronization Penalty:** If Live Delegation falls below recorded obligations, the Operator address is permanently retired and all of its holdings and challenge positions are invalidated. Ownership generations make all affected Control Points neutral without iterating over all 2,000 points.
*   **No Custody:** StakeWars contracts never transfer, escrow, or withdraw an Operator's STRK.

#### 3.1.2. Capture, Reinforcement, and Release
*   **Neutral Capture:** A neutral Control Point may be captured by allocating at least the configured minimum stake and no more than Available Power. The initial minimum is 100 STRK.
*   **Reinforcement:** A Controller may allocate a selected positive amount of Available Power to one owned, uncontested Control Point. Reinforcement increases both that point's Capture Power and the Operator's aggregate Point Commitments.
*   **Release:** A Controller may voluntarily release an uncontested Control Point. The point becomes neutral, its active image is hidden, and its Capture Power returns to Available Power.
*   **Multiple Positions:** An Operator may spread Live Delegation across multiple Control Points, provided total Point Commitments and Challenge Commitments never exceed Live Delegation.

#### 3.1.3. Challenges and the High Ground
*   **Starting a Challenge:** An eligible Challenger targets an occupied, uncontested Control Point and selects a contribution from Available Power. The initial commitment must be at least 10% greater than the incumbent's Capture Power.
*   **Incumbent Position:** The point's existing Capture Power automatically becomes the incumbent's opening commitment. It remains a Point Commitment until settlement; any later defense is added as a Challenge Commitment.
*   **Open Participation:** Any eligible Operator may join the active challenge. One Operator address may participate in only one active challenge at a time, and one Control Point may have only one active challenge.
*   **Additive Commitments:** Contributions accumulate for the life of the challenge. An outbid participant keeps their committed position and may regain the lead by adding newly delegated STRK or sacrificing another Control Point.
*   **Minimum Raise:** A participant becomes Leader only when their cumulative commitment reaches `ceil(Current Leader Commitment × 11,000 / 10,000)`. Wider intermediate arithmetic and upward rounding prevent fractional or overflow advantages.
*   **Timer:** The Leader has the High Ground for 12 hours. Every valid leadership change resets the full 12-hour deadline. The current Leader cannot add power merely to extend their own deadline.
*   **Example:** A controls a point with 1,000 STRK. B challenges with 2,000 STRK. A adds 1,200 STRK, bringing A's cumulative defense to 2,200 and taking the lead. B then needs only `ceil(2,200 × 1.10) - 2,000 = 420` additional STRK because B's original 2,000 remains committed.

#### 3.1.4. Collateral Sacrifice
*   An Operator may give up one other owned, uncontested Control Point and move that point's entire Capture Power into their active challenge contribution, optionally adding a selected amount of Available Power in the same action.
*   The source point becomes neutral immediately and its image is hidden. Its commitment moves rather than duplicates, so total obligations remain backed by the same Live Delegation.
*   Assets or future rewards attached to the source Control Point remain with that point and become available to future Controllers. This makes collateral sacrifice a strategic, potentially costly choice.

#### 3.1.5. Settlement and Allocation Unlocking
*   Anyone may settle a challenge after its current deadline. The current Leader becomes the new Controller and their cumulative commitment becomes the target point's Capture Power.
*   If the Leader has retired or reduced delegation below their obligations before settlement, their position is invalid. The valid incumbent wins by default; if the incumbent is also invalid, the point becomes neutral. Non-leading challengers never inherit the win because the protocol does not maintain a hidden second-place ordering.
*   The winner's cumulative commitment becomes the target Control Point's new Capture Power.
*   Every losing Challenge Commitment unlocks after settlement and returns to Available Power. If the incumbent loses, the target point's prior Point Commitment also unlocks.
*   StakeWars never transfers, escrows, or slashes STRK. Challenge allocations are accounting locks over delegation and may not back another action until settlement is reconciled.
*   Challenge outcomes may be reconciled lazily on each participant's next action, provided allocations remain locked and cannot be reused before reconciliation.

#### 3.1.6. Withdrawal and Permanent Retirement
*   **Retirement:** Initiating an unpool or withdrawal from the official staking contract permanently retires that address from StakeWars. Its ownership generation is invalidated, its Control Points become neutral, and it may never capture, reinforce, or challenge again.
*   **Direct Official-Contract Actions:** The periodic operator synchronization process and every game action inspect official unpooling state, so initiating an exit outside the StakeWars UI is still detected.
*   **Explicit Game Exit:** `relinquish_all` is a permanent retirement action, not a temporary release-all shortcut.
*   **Latency:** Funds remain subject to the official Starknet unbonding period. Retirement applies immediately when the unpool intent is detected; the UI may continue showing the official unlock timestamp.
*   **New Identity:** A player may use another address, but it starts with no history or tenure. Address tenure is expected to influence future gameplay and cannot be transferred from a retired address.

### 3.2. Controller Image Loop
Control of a face is the visible reward for taking the High Ground.

*   **Assign:** The current Controller may assign or replace the image shown on their Control Point after wallet and ownership verification.
*   **Ownership Binding:** An approved image is associated with the specific Control Point ownership generation under which it was uploaded.
*   **Displacement:** When control changes, the previous image is hidden immediately. It is not inherited by the new Controller and does not reappear if a previous Controller later recaptures the point.
*   **Storage Boundary:** Image bytes and moderation metadata remain off-chain. The Dojo World remains authoritative for who may display an image.

### 3.3. Initial Product Scope
The first release intentionally excludes passive territory decay, recurring maintenance actions, CAPTCHA challenges, timing bonuses, secondary game tokens, and freely transferable Control Point NFTs. These mechanics may be reconsidered only after observing whether allocation, capture, challenge, settlement, image, and reinforcement loops are understandable and fun on Mainnet.

---

## 4. Visual Identity & UI Requirements

### 4.1. Aesthetic Direction: "Command Terminal"
*   **Palette:** Strictly Monochrome. Black background (`#000000`), White text (`#FFFFFF`), Grey structural elements (`#333333`). Amber/Red accents only for alerts.
*   **Typography:** Monospaced fonts (e.g., *Space Mono*, *VT323*, or *Courier New*).
*   **VFX:**
    *   CRT Scanlines overlay.
    *   Chromatic aberration on hover states.
    *   "Datamosh" glitch effects when a Control Point changes hands.

### 4.2. The Core (3D View)
*   **Interaction:** Rotate, Zoom, Pan.
*   **States:**
    *   **Empty Control Point:** Wireframe outline.
    *   **Occupied Control Point:** Solid fill (White) or displays the Operator's custom image.
    *   **Selected Control Point:** Highlights and displays the Controller, Capture Power, challenge status, current Leader, challenge deadline, next minimum lead, and the connected Operator's Live Delegation, commitments, and Available Power.
    *   **Control Tenure Relief:** In Control mode, every occupied Control Point is extruded radially according to how long the current Controller has continuously held it. Height uses one fixed, absolute logarithmic scale for every visitor and session, capped visually at one year so old holdings cannot overwhelm the Core. The exact duration remains visible in the selected Control Point panel. Neutral capture and challenge settlement to a new Controller reset tenure; successful defense and reinforcement do not. Projection mode remains flat.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED CONTROL POINT 402 [10,000 STRK]`
*   **Control Panel:** A concise action panel for Capture, Reinforce, Release, Start Challenge, Join/Raise, Collateral Sacrifice, Settle, and Retire transactions. Capture, reinforcement, and challenge actions ask for a STRK allocation, show Available Power, and preview any additional delegation needed before submission.

### 4.4. Operator Image Uploads
*   **Control Requirement:** Only the wallet currently controlling a Control Point may assign or replace its image. The backend must independently verify wallet signatures, current Control Point ownership, and ownership generation; client-supplied owner addresses and Control Point IDs are never trusted by themselves.
*   **Delivery:** Images are uploaded directly from the browser to object storage using a short-lived, object-specific upload authorization issued by the game API. Image bytes must not pass through or be stored on the validator server.
*   **Supported Formats:** WebP, JPEG, and PNG raster images only. SVG and other active or executable formats are prohibited.
*   **Limits:** The initial maximum encoded file size is 2 MB. The frontend should resize and encode images before upload, while the backend must still validate the file signature, MIME type, dimensions, and object size.
*   **Object Naming:** Images use randomized, versioned object keys such as `art/<network>/<control-point-id>/<random-id>.webp`. Replacements receive a new URL to avoid stale CDN caches.
*   **Moderation:** Every image record has a moderation status. The system must support reporting, administrative removal, rate limiting, and deletion of replaced or prohibited content.

---

## 5. Technical Architecture

### 5.1. Smart Contracts (Cairo)
StakeWars is implemented as a Dojo World on Starknet Mainnet. Dojo models store game state, systems enforce state transitions, and Torii indexes model and event updates for clients.

*   **Models:**
    *   `GameConfig`: Official STRK delegation pool address, minimum stake, 10% challenge premium, 12-hour challenge period, Control Point limit, and pause state.
    *   `OperatorState`: Operator address, ownership generation, aggregate Point Commitments, active Challenge Commitment, controlled-point count, active challenge ID, and retirement state.
    *   `ControlPoint`: Control Point ID, Controller address, Controller generation, Capture Power, ownership generation, ownership timestamp, and active challenge ID.
    *   `Challenge`: Challenge ID, target Control Point, incumbent, current Leader and commitment, deadline, participant count, and settlement result.
    *   `ChallengeParticipant`: Challenge ID, Operator, cumulative commitment, the portion already represented by the target Point Commitment, and resolution state.
*   **Control System:** Implements Capture, Reinforce, Release, challenge start/join/raise, Collateral Sacrifice, settlement, permanent retirement, and Operator synchronization.
*   **Staking Adapter:** Uses the official delegation pool's read-only `get_pool_member_info_v1` interface and treats its `amount`, `unpool_amount`, and `unpool_time` fields as authoritative delegation and exit state.
*   **Admin System:** Provides narrowly scoped pause and configuration operations protected by Dojo World ownership. Production ownership should be held by a multisig.
*   **Permissions:** Systems receive writer permission only for the specific models they modify. Reads are permissionless.
*   **Events:** Capture, Reinforcement, Release, Challenge Started, Leadership Changed, Collateral Sacrificed, Challenge Settled, Retirement, and Disqualification events drive Torii, the HUD ticker, and historical views.
*   **Custody Boundary:** The Dojo World never holds or transfers staking assets.

### 5.2. Backend API (Fly.io)
*   **Runtime:** A Go API service deployed on Fly.io at `api.stakewars.gg`. The initial target is one shared-CPU Machine with 512 MB RAM in the `sjc` region. CPU and memory may be increased if observed load requires it.
*   **Responsibilities:**
    *   Verify wallet challenges and current on-chain Control Point ownership.
    *   Authorize narrowly scoped, short-lived image uploads to Tigris.
    *   Validate completed uploads before publishing their metadata.
    *   Serve game metadata and apply rate limits per wallet and IP address.
*   **Initial Topology:** Run exactly one active API Machine while SQLite is the system of record. The Machine mounts a persistent Fly Volume at `/data`; normal deploys and restarts must preserve that volume. Do not add a second active API Machine that writes to the same SQLite database.
*   **Storage Boundary:** Uploaded images are never stored on the Machine or Fly Volume. The volume contains only the SQLite database and its related files; image bytes are uploaded directly to Tigris.
*   **Security:** Wallet challenges use short-lived, single-use nonces. Storage credentials are server-only secrets, and bucket credentials must never be sent to the browser.

### 5.3. Image Storage (Tigris)
*   **Service:** Tigris S3-compatible object storage, provisioned through Fly.io.
*   **Public Bucket:** A dedicated production bucket (proposed name: `stakewars-art`) with public reads and authenticated writes stores approved Control Point images.
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
*   **Minimum Image Record:** `controlPointId`, `network`, `ownerAddress`, `ownershipGeneration`, `imageUrl`, `objectKey`, `contentHash`, `moderationStatus`, `createdAt`, and `updatedAt`.
*   **Authority:** On-chain contracts remain authoritative for Control Point ownership. The database is an indexed application view and must be reconciled when ownership changes.
*   **Portability:** Database access is isolated behind a repository/data-access layer. Migrations, identifiers, timestamps, and query patterns should remain compatible with a later PostgreSQL migration where practical.
*   **Scaling Path:** SQLite permits vertical scaling of the single Fly Machine but not multiple active writers. Migrate to managed PostgreSQL before operating multiple active API Machines, multi-region writes, zero-downtime failover requiring concurrent writers, write-heavy background workers, or when measured lock contention affects requests.
*   **PostgreSQL Phase:** Once migrated, the API remains stateless with respect to local disk and may scale horizontally across multiple Fly Machines. Tigris continues to store image objects independently of the relational database.

### 5.5. Validator Infrastructure (Rebel Hosting)
*   **Domain:** `validator.stakewars.gg`.
*   **Initial Host:** Rebel Hosting KVM VPS with 6 vCPU, 16 GB RAM, 960 GB SSD, one public IP address, and unmetered 200 Mbps connectivity.
*   **Validator Workload:** Pruned Pathfinder full node, Equilibrium Starknet validator attestation service, and validator-specific monitoring.
*   **Isolation Requirement:** The validator must not host the StakeWars game API, user uploads, image processing, application database, or frontend. Other workloads require explicit owner approval. The existing `dad-care-facilities.service` personal workload is an approved exception outside the StakeWars project scope.
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
| `assets.stakewars.gg` | Tigris | Public delivery of approved Control Point images |
| `validator.stakewars.gg` | Rebel Hosting | Pathfinder full node and validator attestation |

### 5.8. Provisioning Status
*   **Rebel Hosting:** Validator VPS provisioned. The pinned Pathfinder mainnet node is fully synchronized, its RPC and metrics endpoints are bound to localhost, and private Prometheus/Grafana monitoring is active. The staking address registered 20,000 STRK on Mainnet in transaction `0x23d12461dcc23c0edd17659828312faaabc36087a82a59cf3efbf97351a2a3c`, with delegation commission initialized at 10%. Its active delegation pools are STRK at `0x06ea5688ff1395a4562238880d43500035fb55f2b80546e0e530770378cd1e2e`, WBTC at `0x0954563804e256000bd885f4e350e3d4312fceb74e0cf855b30bb456f16974d`, tBTC at `0x05f02f9d6558f648d513b2b78f4bf6d397add814ac05d57b911513c030a2149f`, SolvBTC at `0x067e406e6a22f5354ce35f266eaa64b87e9eb01d348f622543ae3c0848265d11`, and strkBTC at `0x04a76fde12dd971bf44a2e2b1f45f890d6da92c4e349d786fdf9ff82e35f6c4a`. The pinned Equilibrium v0.5.2 validator attestation service is active and tracking its assigned block over Pathfinder's `/rpc/v0_9` HTTP and `/ws/rpc/v0_9` WebSocket endpoints. Its private metrics target, the separate public-state staking exporter, the operations dashboard, the staking dashboard, and their alert rules are healthy.
*   **Fly.io:** The `stakewars` application is deployed in `sjc` with one shared-CPU Machine, 512 MB RAM, and an encrypted 1 GB `stakewars_data` volume mounted at `/data`. Scheduled Fly Volume snapshots are enabled with five-day retention. `api.stakewars.gg` is configured with an active Fly-managed TLS certificate.
*   **Tigris:** Planned; no production bucket or credentials have been created.
*   **Constraint:** Infrastructure resources are provisioned only as part of an explicitly approved implementation task.

---

## 6. User Stories

1.  **As an Operator:** I want to choose how much of my real delegated STRK to allocate while the game derives Available Power automatically, so I can spread risk without managing a separate currency.
2.  **As a Challenger:** I want to see the exact additional delegation or collateral required to take the lead and when the challenge can settle.
3.  **As a Controller:** I want to upload an image to the face I control so my victory is visible on the Core.
4.  **As a Challenge Participant:** I want prior contributions to count toward my next qualifying raise and losing allocations to unlock after settlement.
5.  **As a Visitor:** I want Control mode to show ownership tenure as stable terrain so I can recognize entrenched positions without opening every Control Point.
6.  **As a Strategist:** I want to sacrifice another Control Point as collateral without duplicating its backing, accepting that its assets become contestable.
7.  **As an Exiting Operator:** I want the UI to clearly warn that beginning an unstake permanently retires this address from the game.

---

## 7. Roadmap / Phasing

*   **Phase 1: Delegation-Backed Allocation**
    *   Basic 3D Sphere.
    *   Dojo World with explicit delegation-backed allocation, 12-hour multi-party challenges, additive 10% High Ground raises, collateral sacrifice, allocation unlocking at settlement, permanent retirement, and synchronization logic.
    *   Mainnet integration with the StakeWars validator's official STRK delegation pool.
    *   Starknet wallet connection and atomic stake-and-action multicalls.
    *   Torii-backed ownership and event updates in the frontend.
    *   Absolute, bounded Control Point tenure relief in Control mode with exact held duration in the HUD.
    *   Fly.io API with wallet-verified, ownership-bound upload authorization.
    *   Single-Machine Go API with SQLite on a Fly Volume, Litestream replication to a private Tigris backup bucket, and a tested recovery procedure before production data is accepted.
    *   Custom image uploads backed by Tigris and served from `assets.stakewars.gg`.
    *   Minimum viable image reporting and administrative removal.
*   **Phase 2: Sealed Vickrey Challenges**
    *   Replace the public additive challenge bidding flow with private maximum bids and Vickrey-style settlement, after its encryption, forced-opening, payment, and failure assumptions are specified and tested independently.
    *   Preserve explicit delegation-backed allocation and prevent bid commitments from backing another action while a sealed challenge is active.
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
