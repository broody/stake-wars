# Product Requirements Document (PRD): StakeWars.gg

**Version:** 1.3
**Status:** Draft
**Platform:** Starknet (L2)
**Aesthetic:** Command Terminal / Retro-Futurist

---

## 1. Executive Summary

**StakeWars.gg** is a persistent, gamified staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Control Points**) on a 3D spherical map (**The Core**). STRK is delegated to the StakeWars validator through Starknet's native delegation protocol, while the game layer tracks how much of each Operator's delegated balance is allocated to each Control Point. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic.

The initial product has one rule: an Operator captures a neutral Control Point with the minimum stake or displaces its controller by allocating at least 10% more STRK. The current controller may display a custom image on that face until another Operator takes the High Ground.

---

## 2. Glossary & Nomenclature

*   **The Core:** The global game map; a 3D geodesic sphere consisting of 2,000 unique faces.
*   **Control Point:** A single triangular face on the Core. In the initial release it is a Dojo-native game territory, not a freely transferable NFT.
*   **Operator:** The user/player.
*   **Allocated Stake:** The portion of an Operator's live delegated STRK balance assigned to a Control Point.
*   **Floating Command Power:** Delegated STRK that is not currently allocated to a Control Point and can be deployed immediately.
*   **Controller:** The Operator currently holding a Control Point.
*   **High Ground:** The displacement rule requiring a Challenger to allocate at least 10% more STRK than the current Controller.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Staking & Allocation)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (the official Starknet staking and delegation pool contracts) handles custody and yield, while the **Game Layer** (the StakeWars Dojo World) tracks tactical allocation and Control Point ownership.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Action:** When an Operator adds stake and captures a Control Point, their Starknet account executes one atomic **Multicall Transaction**:
    1.  Approve STRK and enter or add to the StakeWars validator's official delegation pool, if additional funds are required.
    2.  Call `capture()` on the StakeWars Control System.
*   **State Synchronization:** The Game Layer maintains an internal ledger of each Operator's total allocated balance.
    *   *Verification:* Before an allocation increases or ownership changes, the Control System reads the Operator's live `amount` from the official STRK delegation pool.
    *   *Allocation Invariant:* An Operator's total allocated stake must never exceed their live delegated amount.
    *   *Desynchronization Penalty:* If an Operator reduces their official delegated amount below their Game Layer allocation, the Operator is disqualified and all Control Points associated with that ownership generation become neutral. This can be applied lazily without iterating over all 2,000 points.
*   **No Custody:** StakeWars contracts never transfer, escrow, or withdraw an Operator's STRK.

#### 3.1.2. The High Ground (Displacement Logic)
*   **Neutral Capture:** A neutral Control Point may be captured by allocating at least the configured minimum stake. The initial minimum is 100 STRK.
*   **Rules of Engagement:** To capture an occupied Control Point, a Challenger must allocate at least 10% more STRK than the Controller's current allocation.
    *   *Formula:* `Minimum Challenge = ceil(Controller Allocation × 11,000 / 10,000)`.
    *   *Example:* A Control Point held with 1,000 STRK requires at least 1,100 STRK to capture.
    *   *Rounding:* The calculation rounds upward and uses wider intermediate arithmetic so fractional requirements and integer overflow cannot benefit the Challenger.
    *   *No Standing Bids:* StakeWars is not an auction or order book. Only the current Controller's allocation matters; displaced allocations become Floating Command Power instead of remaining as competing bids.
*   **Displacement:** If the bid is successful:
    1.  The Challenger becomes the new Controller of the Control Point.
    2.  The incumbent Operator loses control and their image is no longer displayed.
    3.  **No Forced Unstaking:** The Incumbent's funds remain in the Official Staking Contract, delegated and earning yield. They simply lose the game territory.

#### 3.1.3. Tactical Redeployment (The "Liquid" Game State)
Since the Official Staking Contract enforces a withdrawal delay, the game treats displaced stake as **"Floating Command Power."**
*   **Scenario:** Operator A is displaced from Control Point 1 (1,000 STRK staked).
*   **State:** Operator A has 0 Control Points, but 1,000 STRK registered in the Game Layer.
*   **Redeploy:** Operator A can instantly target Control Point 2.
    *   They send a `Redeploy()` transaction (Game Layer only).
    *   The system verifies they still have 1,000 STRK in the Official Contract.
    *   They capture Control Point 2 immediately without waiting for unbonding.

#### 3.1.4. Reinforcement and Release
*   **Reinforcement:** A Controller may increase a Control Point's allocation at any time, provided their total allocation remains within their live delegated balance.
*   **Release:** A Controller may voluntarily release a Control Point. The point becomes neutral, its active image is hidden, and the released allocation becomes Floating Command Power.

#### 3.1.5. Withdrawal
*   **Explicit Unstaking:** The Operator initiates an unstake via the Official Contract (via the game UI or external explorer).
*   **Latency:** Funds are subject to the official Starknet unbonding period (e.g., 7 days), but Game Utility is lost immediately upon the balance drop.

### 3.2. Controller Image Loop
Control of a face is the visible reward for taking the High Ground.

*   **Assign:** The current Controller may assign or replace the image shown on their Control Point after wallet and ownership verification.
*   **Ownership Binding:** An approved image is associated with the specific Control Point ownership generation under which it was uploaded.
*   **Displacement:** When control changes, the previous image is hidden immediately. It is not inherited by the new Controller and does not reappear if a previous Controller later recaptures the point.
*   **Storage Boundary:** Image bytes and moderation metadata remain off-chain. The Dojo World remains authoritative for who may display an image.

### 3.3. Initial Product Scope
The first release intentionally excludes passive territory decay, recurring maintenance actions, CAPTCHA challenges, timing bonuses, secondary game tokens, and freely transferable Control Point NFTs. These mechanics may be reconsidered only after observing whether the stake, capture, image, displacement, and redeployment loop is understandable and fun on Mainnet.

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
    *   **Selected Control Point:** Highlights and displays the Controller, current allocation, minimum challenge, and connected Operator's available stake.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED CONTROL POINT 402 [10,000 STRK]`
*   **Control Panel:** A concise action panel for Capture, Reinforce, Release, and Redeploy transactions.

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
    *   `GameConfig`: Official STRK delegation pool address, minimum stake, 10% challenge premium, Control Point limit, and pause state.
    *   `OperatorState`: Operator address, total allocated stake, ownership generation, and controlled-point count.
    *   `ControlPoint`: Control Point ID, Controller address, Controller generation, and allocated stake.
*   **Control System:** Implements Capture, Reinforce, Release, Redeploy, and Operator synchronization.
*   **Staking Adapter:** Uses the official delegation pool's read-only `get_pool_member_info_v1` interface and treats its `amount` field as the Operator's available source of game power.
*   **Admin System:** Provides narrowly scoped pause and configuration operations protected by Dojo World ownership. Production ownership should be held by a multisig.
*   **Permissions:** Systems receive writer permission only for the specific models they modify. Reads are permissionless.
*   **Events:** Capture, Displacement, Reinforcement, Release, Redeployment, and Disqualification events drive Torii, the HUD ticker, and historical views.
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

1.  **As an Operator:** I want to allocate my delegated STRK across Control Points without transferring custody to the game.
2.  **As a Challenger:** I want to see the exact minimum stake required to capture an occupied Control Point.
3.  **As a Controller:** I want to upload an image to the face I control so my victory is visible on the Core.
4.  **As a Displaced Operator:** I want to redeploy my delegated STRK immediately so I can keep playing without waiting for unstaking.

---

## 7. Roadmap / Phasing

*   **Phase 1: The Mainnet Core MVP**
    *   Basic 3D Sphere.
    *   Dojo World with Capture, 10% High Ground displacement, Reinforce, Release, Redeploy, and synchronization logic.
    *   Mainnet integration with the StakeWars validator's official STRK delegation pool.
    *   Starknet wallet connection and atomic stake-and-capture multicalls.
    *   Torii-backed ownership and event updates in the frontend.
    *   Fly.io API with wallet-verified, ownership-bound upload authorization.
    *   Single-Machine Go API with SQLite on a Fly Volume, Litestream replication to a private Tigris backup bucket, and a tested recovery procedure before production data is accepted.
    *   Custom image uploads backed by Tigris and served from `assets.stakewars.gg`.
    *   Minimum viable image reporting and administrative removal.
*   **Phase 2: The Command Expansion**
    *   Yield tracking dashboard.
    *   Live capture ticker, searchable gallery, and Operator profiles.
    *   Image moderation, reporting, replacement, and cleanup workflows.
    *   Recurring recovery drills, operational dashboards, and product analytics based on observed Mainnet usage.
*   **Phase 3: The Mesh Expansion**
    *   Migrate SQLite to managed PostgreSQL before enabling multiple active API Machines or multi-region writes.
    *   Horizontally scale the Fly API when measured traffic and reliability requirements justify it.
    *   Introduction of "Mesh Synergy" (Adjacency bonuses).
    *   Launch of secondary token ($RES) for governance or boosts.
