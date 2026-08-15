# Product Requirements Document (PRD): StakeWars.gg

**Version:** 1.8
**Status:** Draft
**Platform:** Starknet (L2)
**Aesthetic:** Command Terminal / Retro-Futurist

---

## 1. Executive Summary

**StakeWars.gg** is a persistent, gamified staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Control Points**) on a 3D spherical map (**The Core**). STRK is delegated to the StakeWars validator through Starknet's native delegation protocol. Operators explicitly allocate portions of that real delegation to Control Points and challenges without creating a separate power currency. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic.

An Operator captures a neutral Control Point by choosing how much Available Power to commit. Taking an occupied point starts a fixed 3-hour sealed Vickrey challenge. Operators submit encrypted maximum bids while the game contract locks their currently Available Power as public bid collateral. After bidding closes, the configured settlement authority decrypts the bids, the highest valid maximum wins, and the winner commits only the Vickrey clearing price while all losing and excess collateral unlocks. The current controller may display a custom image on that face until ownership changes.

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
*   **Challenge:** A sealed contest for an occupied Control Point. The initial duration is 3 hours and is configurable by the game admin.
*   **Sealed Bid:** An encrypted maximum bid stored off-chain and bound to an on-chain commitment. The maximum is not published during bidding.
*   **Bid Collateral:** The public delegation-backed ceiling locked on-chain for a sealed bid. The first implementation locks all Available Power, plus the target point's Capture Power for the incumbent and any sacrificed collateral point.
*   **Reserve Price:** `ceil(Incumbent Capture Power × 11,000 / 10,000)`. A challenger bid below this amount is invalid.
*   **Clearing Price:** The runner-up maximum bid, floored at the Reserve Price for a challenger win and at existing Capture Power for an incumbent defense.
*   **Collateral Sacrifice:** Voluntarily giving up another owned Control Point and moving its existing commitment into an active challenge. The sacrificed point becomes neutral; any assets remain attached to it.
*   **Settlement Authority:** The configured Starknet account or multisig authorized to publish the winner, runner-up bid, and Clearing Price after decrypting the sealed bids.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Delegation-Backed Allocation Accounting)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (the official Starknet staking and delegation pool contracts) handles custody, yield, and authoritative Staking Power, while the **Game Layer** (the StakeWars Dojo World) tracks Control Point ownership and recorded Capture Power.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Action:** A transaction may first approve STRK and enter or add to the StakeWars validator's official delegation pool, then call a game action from the same Starknet account.
*   **Authoritative Balance:** Before every power-sensitive action, the Control System reads the Operator's live `amount` and unpooling state from the official STRK delegation pool. Delegation performed directly through the official contract is therefore recognized without passing through a StakeWars capture call.
*   **Allocation Accounting:** The Game Layer records only obligations needed to prevent reuse: aggregate Point Commitments and the active Bid Collateral lock. Available Power is derived from those obligations and Live Delegation; it is not a freely editable reserve or secondary token.
*   **No Double Backing:** One unit of Live Delegation can support only one Point Commitment or Challenge Commitment at a time. An Operator with 3,000 delegated STRK may allocate 1,000 to one Control Point and retain 2,000 Available Power for other actions, but the same 1,000 cannot back a second point or challenge.
*   **Explicit Amounts:** Capture and reinforcement calls specify the amount to commit. A sealed bid specifies a private maximum in its encrypted envelope; the contract locks all Available Power as a temporary public ceiling and verifies that the eventual Clearing Price does not exceed it.
*   **Desynchronization Penalty:** If Live Delegation falls below recorded obligations, the Operator address is permanently retired and all of its holdings and challenge positions are invalidated. Ownership generations make all affected Control Points neutral without iterating over all 2,000 points.
*   **No Custody:** StakeWars contracts never transfer, escrow, or withdraw an Operator's STRK.

#### 3.1.2. Capture, Reinforcement, and Release
*   **Neutral Capture:** A neutral Control Point may be captured by allocating at least the configured minimum stake and no more than Available Power. The initial minimum is 100 STRK.
*   **Reinforcement:** A Controller may allocate a selected positive amount of Available Power to one owned, uncontested Control Point. Reinforcement increases both that point's Capture Power and the Operator's aggregate Point Commitments.
*   **Release:** A Controller may voluntarily release an uncontested Control Point. The point becomes neutral, its active image is hidden, and its Capture Power returns to Available Power.
*   **Multiple Positions:** An Operator may spread Live Delegation across multiple Control Points, provided total Point Commitments and Challenge Commitments never exceed Live Delegation.

#### 3.1.3. Sealed Vickrey Challenges
*   **Starting a Challenge:** An eligible Challenger targets an occupied, uncontested Control Point, enters a private maximum bid, encrypts it to the current auction key, stores the ciphertext with the API, and submits its commitment on-chain. The Challenger must have enough Bid Collateral to cover the 10%-premium Reserve Price.
*   **Incumbent Position:** The point's existing Capture Power is the incumbent's default bid and remains a Point Commitment. The incumbent may submit one sealed maximum defense during the bidding period; all additional Available Power is then locked as Bid Collateral.
*   **Open Participation:** Any eligible Operator may submit one sealed bid. One Operator address may participate in only one active challenge at a time, and one Control Point may have only one active challenge.
*   **Fixed Timer:** The first valid challenger opens one bidding window using the admin-configured duration, initially 3 hours. Later bids do not reveal leadership and do not reset the deadline. Changing the configured duration affects only challenges opened after the change.
*   **Winner and Ties:** The highest valid maximum wins. The incumbent wins an exact tie; otherwise the earliest on-chain submission wins an exact tie.
*   **Vickrey Price:** A challenger winner commits `max(Reserve Price, runner-up maximum)`. An incumbent winner commits `max(previous Capture Power, runner-up maximum)`. The winning maximum remains private; the runner-up bid and resulting Clearing Price become public at settlement.
*   **Example:** A controls a point with 1,000 STRK. B seals a maximum of 2,000 and C seals 1,500. B wins but commits only 1,500. If C had not bid, B would commit the 1,100 Reserve Price.

#### 3.1.4. Collateral Sacrifice
*   An Operator may give up one other owned, uncontested Control Point and move that point's entire Capture Power into the Bid Collateral for a sealed bid.
*   The source point becomes neutral immediately and its image is hidden. Its commitment moves rather than duplicates, so total obligations remain backed by the same Live Delegation.
*   Assets or future rewards attached to the source Control Point remain with that point and become available to future Controllers. This makes collateral sacrifice a strategic, potentially costly choice.

#### 3.1.5. Settlement and Allocation Unlocking
*   Only the configured Settlement Authority may publish a result after the fixed deadline. The authority decrypts every available envelope, verifies its commitment and public Bid Collateral ceiling, applies the reserve and tie rules, and submits the winner, runner-up bid, and Clearing Price.
*   The winner's Clearing Price becomes the target Control Point's new Capture Power. Any winning collateral above that price unlocks immediately.
*   Every losing Bid Collateral lock unlocks after settlement and returns to Available Power. If the incumbent loses, the target point's prior Point Commitment also unlocks.
*   StakeWars never transfers, escrows, or slashes STRK. Challenge allocations are accounting locks over delegation and may not back another action until settlement is reconciled.
*   Non-winning participants may reconcile lazily on their next action, provided their collateral remains locked and cannot be reused before reconciliation.
*   **Initial Trust Boundary:** The first deployment is a 1-of-1 decryption and settlement authority. It hides bids from other players and public chain observers but can technically decrypt early or misreport a result. The authority address can later be a threshold-controlled multisig without changing the auction models. A proof-verified settlement route remains a future hardening step.
*   **Privacy Boundary:** The encrypted maximum bid, its nonce, and the winner's maximum remain private protocol inputs. Bidder addresses, submission timing, commitments, public Bid Collateral, delegation changes, the runner-up bid, and the Clearing Price are public. A just-in-time delegation top-up may therefore reveal or strongly suggest a bidder's maximum even though the plaintext bid is never published.

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
    *   **Selected Control Point:** Highlights and displays the Controller, Capture Power, sealed-position count, auction deadline, Reserve Price, and the connected Operator's Live Delegation, commitments, and Available Power. No current leader or maximum bid is shown.
    *   **Control Tenure Relief:** In Control mode, every occupied Control Point is extruded radially according to how long the current Controller has continuously held it. Height uses one fixed, absolute logarithmic scale for every visitor and session, capped visually at one year so old holdings cannot overwhelm the Core. The exact duration remains visible in the selected Control Point panel. Neutral capture and challenge settlement to a new Controller reset tenure; successful defense and reinforcement do not. Projection mode remains flat.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED CONTROL POINT 402 [10,000 STRK]`
*   **Control Panel:** A concise action panel for Capture, Reinforce, Release, Submit Sealed Bid, Collateral Sacrifice, and Retire transactions. Sealed bidding asks for a private maximum, shows the public collateral ceiling and Reserve Price, and previews any additional delegation needed before submission. Settlement is automatic from the player's perspective.

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
    *   `GameConfig`: Official STRK delegation pool address, settlement-authority address, minimum stake, 10% challenge premium, admin-configurable challenge period (initially 3 hours), Control Point limit, and pause state.
    *   `OperatorState`: Operator address, ownership generation, aggregate Point Commitments, active Challenge Commitment, controlled-point count, active challenge ID, and retirement state.
    *   `ControlPoint`: Control Point ID, Controller address, Controller generation, Capture Power, ownership generation, ownership timestamp, and active challenge ID.
    *   `Challenge`: Challenge ID, target Control Point, incumbent, fixed deadline, participant count, winner, runner-up bid, Clearing Price, and settlement timestamp.
    *   `ChallengeParticipant`: Challenge ID, Operator, public locked collateral, target Point Commitment included in that collateral, opaque bid commitment, generation, submission state, and resolution state.
*   **Control System:** Implements Capture, Reinforce, Release, sealed-bid submission, Collateral Sacrifice, settlement-authority validation, allocation unlocking, permanent retirement, and Operator synchronization.
*   **Staking Adapter:** Uses the official delegation pool's read-only `get_pool_member_info_v1` interface and treats its `amount`, `unpool_amount`, and `unpool_time` fields as authoritative delegation and exit state.
*   **Admin System:** Provides narrowly scoped pause and configuration operations protected by Dojo World ownership. Production ownership should be held by a multisig.
*   **Permissions:** Systems receive writer permission only for the specific models they modify. Reads are permissionless.
*   **Events:** Capture, Reinforcement, Release, Challenge Started, Sealed Bid Submitted, Collateral Sacrificed, Challenge Settled, Retirement, and Disqualification events drive Torii, the HUD ticker, and historical views. Bid events expose collateral and commitments, never plaintext maximum bids.
*   **Custody Boundary:** The Dojo World never holds or transfers staking assets.

### 5.2. Backend API (Fly.io)
*   **Runtime:** A Go API service deployed on Fly.io at `api.stakewars.gg`. The initial target is one shared-CPU Machine with 512 MB RAM in the `sjc` region. CPU and memory may be increased if observed load requires it.
*   **Responsibilities:**
    *   Verify wallet challenges and current on-chain Control Point ownership.
    *   Publish the active RSA-OAEP auction public key and store encrypted bid envelopes keyed by their on-chain commitment.
    *   After a deadline, decrypt and validate envelopes, rank valid bids deterministically, and submit the settlement-authority transaction without requiring any participant to return.
    *   Authorize narrowly scoped, short-lived image uploads to Tigris.
    *   Validate completed uploads before publishing their metadata.
    *   Serve game metadata and apply rate limits per wallet and IP address.
*   **Initial Topology:** Run exactly one active API Machine while SQLite is the system of record. The Machine mounts a persistent Fly Volume at `/data`; normal deploys and restarts must preserve that volume. Do not add a second active API Machine that writes to the same SQLite database.
*   **Storage Boundary:** Uploaded images are never stored on the Machine or Fly Volume. The volume contains only the SQLite database and its related files; image bytes are uploaded directly to Tigris.
*   **Security:** Wallet challenges use short-lived, single-use nonces. Storage credentials and auction private-key shares are server-only secrets and must never be sent to the browser, logs, repository, or public configuration. Auction ciphertexts and bid commitments are safe to expose; plaintext maximums are not.

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
2.  **As a Challenger:** I want to submit one private maximum bid, know the public Reserve Price and collateral lock, and leave settlement unattended.
3.  **As a Controller:** I want to upload an image to the face I control so my victory is visible on the Core.
4.  **As a Challenge Participant:** I want losing collateral and any winning excess above the Clearing Price to unlock after settlement.
5.  **As a Visitor:** I want Control mode to show ownership tenure as stable terrain so I can recognize entrenched positions without opening every Control Point.
6.  **As a Strategist:** I want to sacrifice another Control Point as collateral without duplicating its backing, accepting that its assets become contestable.
7.  **As an Exiting Operator:** I want the UI to clearly warn that beginning an unstake permanently retires this address from the game.

---

## 7. Roadmap / Phasing

*   **Phase 1: Delegation-Backed Allocation and Sealed Challenges**
    *   Basic 3D Sphere.
    *   Dojo World with explicit delegation-backed allocation, configurable-duration multi-party sealed Vickrey challenges (initially 3 hours), a 10%-premium Reserve Price, collateral sacrifice, authority-gated settlement, allocation unlocking, permanent retirement, and synchronization logic.
    *   Mainnet integration with the StakeWars validator's official STRK delegation pool.
    *   Starknet wallet connection and atomic stake-and-action multicalls.
    *   Torii-backed ownership and event updates in the frontend.
    *   Absolute, bounded Control Point tenure relief in Control mode with exact held duration in the HUD.
    *   Fly.io API with wallet-verified, ownership-bound upload authorization.
    *   Single-Machine Go API with SQLite on a Fly Volume, Litestream replication to a private Tigris backup bucket, and a tested recovery procedure before production data is accepted.
    *   Custom image uploads backed by Tigris and served from `assets.stakewars.gg`.
    *   Minimum viable image reporting and administrative removal.
*   **Phase 2: Threshold and Proof Hardening**
    *   Replace the 1-of-1 auction key with a threshold-controlled settlement authority and documented key rotation and recovery ceremonies.
    *   Add proof-verified ranking and settlement when Starknet's application proving path can verify the auction computation without revealing winning maximums.
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
