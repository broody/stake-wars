# Product Requirements Document (PRD): StakeWars.com

**Version:** 1.2
**Status:** Draft
**Platform:** Starknet (L2)
**Aesthetic:** Command Terminal / Retro-Futurist

---

## 1. Executive Summary

**StakeWars.com** is a persistent, gamified liquid staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Control Points**) on a 3D spherical map (**The Core**). Staked capital ($STRK) is delegated to official Starknet validators via the native protocol, while the game layer tracks tactical dominance. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic. 

To prevent stagnation and bot-dominance, the game features an **Entropy** mechanic requiring manual, skill-based **Uplinks** to maintain Control Point positions.

---

## 2. Glossary & Nomenclature

*   **The Core:** The global game map; a 3D geodesic sphere consisting of 2,000 unique faces.
*   **Control Point:** A single triangular face on the Core. The primary NFT/territory asset.
*   **Operator:** The user/player.
*   **Signal Strength:** A dynamic percentage (0-100%) representing the health of a Control Point.
*   **Entropy:** The automatic decay mechanism that reduces Signal Strength over time.
*   **Uplink:** The manual action required to reset Entropy and restore Signal Strength.
*   **Command Sequence:** The visual, anti-bot CAPTCHA code required to perform an Uplink.
*   **High Ground:** The winning condition; holding a higher effective stake than a challenger.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Staking & Allocation)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (Official Starknet Staking Contract) handles the actual custody of funds, while the **Game Layer** (StakeWars Smart Contract) tracks the tactical allocation of that capital.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Action:** When an Operator captures a Control Point, they execute a **Multicall Transaction**:
    1.  `Stake()` on the official Starknet Staking Contract (if new funds are added).
    2.  `CaptureControlPoint()` on the StakeWars Game Contract.
*   **State Synchronization:** The Game Contract maintains an internal ledger of the Operator's claimed balance.
    *   *Verification:* Upon any game interaction (Capture, Uplink, Defend), the Game Contract checks the Operator's balance on the Official Staking Contract.
    *   *Desynchronization Penalty:* If the Operator's official staked balance is **lower** than their Game Layer balance (indicating they unstaked externally), a **"Signal Loss"** event triggers. The Operator is immediately disqualified, and the Control Point reverts to neutral.

#### 3.1.2. The High Ground (Displacement Logic)
*   **Rules of Engagement:** To capture an occupied Control Point, a Challenger must verify a Total Staked Amount that is **X% higher** (e.g., +10%) than the incumbent Operator's **Effective Stake**.
*   **Displacement:** If the bid is successful:
    1.  The Challenger becomes the new owner of the Control Point.
    2.  The Incumbent Operator loses control of the Control Point.
    3.  **No Forced Unstaking:** The Incumbent's funds remain in the Official Staking Contract, delegated and earning yield. They simply lose the game territory.

#### 3.1.3. Tactical Redeployment (The "Liquid" Game State)
Since the Official Staking Contract enforces a withdrawal delay, the game treats displaced stake as **"Floating Command Power."**
*   **Scenario:** Operator A is displaced from Control Point 1 (1,000 STRK staked).
*   **State:** Operator A has 0 Control Points, but 1,000 STRK registered in the Game Layer.
*   **Redeploy:** Operator A can instantly target Control Point 2.
    *   They send a `Redeploy()` transaction (Game Layer only).
    *   The system verifies they still have 1,000 STRK in the Official Contract.
    *   They capture Control Point 2 immediately without waiting for unbonding.

#### 3.1.4. Withdrawal
*   **Explicit Unstaking:** The Operator initiates an unstake via the Official Contract (via the game UI or external explorer).
*   **Latency:** Funds are subject to the official Starknet unbonding period (e.g., 7 days), but Game Utility is lost immediately upon the balance drop.

### 3.2. Entropy (The Decay Mechanic)
To ensure user retention and prevent static "whale" dominance, Control Points suffer from signal decay.

*   **Decay Rate:** Signal Strength starts at 100%. It decays at a rate of roughly **10% every 24 hours** (configurable).
*   **Effect of Decay:**
    *   **Defense Penalty:** As Signal drops, the "Effective Stake" decreases.
        *   *Formula:* `Effective Stake = Total Staked $STRK * Signal %`
        *   *Example:* A whale stakes 1,000 STRK. If Signal drops to 50%, a challenger only needs >500 STRK to displace them.

### 3.3. The Manual Uplink (The Anti-Bot Loop)
Operators must perform manual maintenance to restore Signal Strength.

*   **Trigger:** Operator selects a Control Point they own and clicks `> INITIALIZE UPLINK`.
*   **The Visual Challenge (Anti-Bot):**
    *   The UI displays a **Command Sequence**: A randomized 4-character alphanumeric code (e.g., `A-7-X-9`).
    *   **Visual Rendering:** The code is rendered inside a `<canvas>` element with heavy glitch effects, noise, and distortion (diegetic CAPTCHA). It is *not* selectable text.
*   **Verification:**
    *   The Operator types the code into the terminal prompt.
    *   **Backend Validation:** The frontend sends the input to a game server. If the input matches the generated image, the server returns a **Cryptographic Signature**.
    *   **On-Chain Action:** The Operator signs a transaction including this signature. The smart contract verifies the signature and resets Signal Strength to 100%.

### 3.4. The "Overcharge" Bonus (Skill Element)
*   **The Mechanic:** The Command Sequence on the screen pulses colors (White -> Yellow -> Red).
*   **The Window:** The "Yellow" phase lasts for only 1.5 seconds.
*   **The Reward:** If the Uplink is submitted during the Yellow phase, Signal Strength is boosted to **110%** for 12 hours, providing a temporary defensive buff.

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
    *   **Decayed Control Point:** The fill flickers or dims based on Signal Strength.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED CONTROL POINT 402 [10,000 STRK]`
*   **Terminal Input:** A command line at the bottom left for Uplink codes.

### 4.4. Operator Image Uploads
*   **Control Requirement:** Only the wallet currently controlling a Control Point may assign or replace its image. The backend must independently verify wallet signatures and current Control Point ownership; client-supplied owner addresses and Control Point IDs are never trusted by themselves.
*   **Delivery:** Images are uploaded directly from the browser to object storage using a short-lived, object-specific upload authorization issued by the game API. Image bytes must not pass through or be stored on the validator server.
*   **Supported Formats:** WebP, JPEG, and PNG raster images only. SVG and other active or executable formats are prohibited.
*   **Limits:** The initial maximum encoded file size is 2 MB. The frontend should resize and encode images before upload, while the backend must still validate the file signature, MIME type, dimensions, and object size.
*   **Object Naming:** Images use randomized, versioned object keys such as `art/<network>/<control-point-id>/<random-id>.webp`. Replacements receive a new URL to avoid stale CDN caches.
*   **Moderation:** Every image record has a moderation status. The system must support reporting, administrative removal, rate limiting, and deletion of replaced or prohibited content.

---

## 5. Technical Architecture

### 5.1. Smart Contracts (Cairo)
*   **CoreRegistry:** Stores ownership mappings (Control Point ID -> Owner -> Game Balance).
*   **SyncController:** Interfaces with the Official Starknet Staking Contract to verify external balances.
*   **EntropyEngine:** Calculates "Effective Stake" based on timestamps.
*   **Verifier:** Validates the server signature for Manual Uplinks.

### 5.2. Backend API (Fly.io)
*   **Runtime:** A Go API service deployed on Fly.io at `api.stakewars.com`. The initial target is one shared-CPU Machine with 512 MB RAM in the `sjc` region. CPU and memory may be increased if observed load requires it.
*   **Responsibilities:**
    *   Verify wallet challenges and current on-chain Control Point ownership.
    *   Generate visual CAPTCHA challenges and provide time-limited uplink signatures (Server-Signer pattern).
    *   Authorize narrowly scoped, short-lived image uploads to Tigris.
    *   Validate completed uploads before publishing their metadata.
    *   Serve game metadata and apply rate limits per wallet and IP address.
*   **Initial Topology:** Run exactly one active API Machine while SQLite is the system of record. The Machine mounts a persistent Fly Volume at `/data`; normal deploys and restarts must preserve that volume. Do not add a second active API Machine that writes to the same SQLite database.
*   **Storage Boundary:** Uploaded images are never stored on the Machine or Fly Volume. The volume contains only the SQLite database and its related files; image bytes are uploaded directly to Tigris.
*   **Security:** The uplink signer and storage credentials are server-only secrets. Signing keys require restricted access and a documented rotation procedure. Bucket credentials must never be sent to the browser.

### 5.3. Image Storage (Tigris)
*   **Service:** Tigris S3-compatible object storage, provisioned through Fly.io.
*   **Public Bucket:** A dedicated production bucket (proposed name: `stakewars-art`) with public reads and authenticated writes stores approved Control Point images.
*   **Backup Bucket:** A separate private bucket (proposed name: `stakewars-db-backups`) stores encrypted-in-transit Litestream replicas of the SQLite database. It must not allow public reads or share public image-delivery credentials.
*   **Domain:** Public images are served through `assets.stakewars.com` using the bucket's custom-domain support.
*   **Upload Pattern:** The frontend requests authorization from the Fly API and then uploads directly to Tigris. The Fly API never proxies the image body during normal operation.
*   **CORS:** Production writes are allowed only from `https://www.stakewars.com`; explicitly configured local development origins may also be allowed outside production.
*   **Lifecycle:** Database metadata is updated before a superseded object is deleted. Failed or abandoned uploads are removed by a cleanup process.
*   **Portability:** Application code uses the S3-compatible API rather than provider-specific filesystem assumptions.

### 5.4. Application Metadata
*   **Initial Database:** SQLite stores off-chain game, media, and moderation metadata on a persistent Fly Volume at `/data/stakewars.db`. The initial volume size is 1 GB and can be expanded as required.
*   **Database Configuration:** Enable WAL mode, foreign-key enforcement, and a 5-second busy timeout. Keep transactions short and serialize or retry writes where appropriate.
*   **Backup and Recovery:** Litestream continuously replicates SQLite to the private `stakewars-db-backups` Tigris bucket. Fly Volume snapshots are retained as an additional recovery layer, not as the sole database backup. Recovery from the Litestream replica must be documented and tested before production launch.
*   **Minimum Image Record:** `controlPointId`, `network`, `ownerAddress`, `imageUrl`, `objectKey`, `contentHash`, `moderationStatus`, `createdAt`, and `updatedAt`.
*   **Authority:** On-chain contracts remain authoritative for Control Point ownership. The database is an indexed application view and must be reconciled when ownership changes.
*   **Portability:** Database access is isolated behind a repository/data-access layer. Migrations, identifiers, timestamps, and query patterns should remain compatible with a later PostgreSQL migration where practical.
*   **Scaling Path:** SQLite permits vertical scaling of the single Fly Machine but not multiple active writers. Migrate to managed PostgreSQL before operating multiple active API Machines, multi-region writes, zero-downtime failover requiring concurrent writers, write-heavy background workers, or when measured lock contention affects requests.
*   **PostgreSQL Phase:** Once migrated, the API remains stateless with respect to local disk and may scale horizontally across multiple Fly Machines. Tigris continues to store image objects independently of the relational database.

### 5.5. Validator Infrastructure (Rebel Hosting)
*   **Domain:** `validator.stakewars.com`.
*   **Initial Host:** Rebel Hosting KVM VPS with 6 vCPU, 16 GB RAM, 960 GB SSD, one public IP address, and unmetered 200 Mbps connectivity.
*   **Workload:** Pruned Juno full node, Starknet validator attestation service, and validator-specific monitoring only.
*   **Isolation Requirement:** The validator must not host the game API, user uploads, image processing, application database, frontend, or general-purpose background jobs. This prevents untrusted game traffic and disk growth from affecting attestations.
*   **Key Separation:** Only the operational validator key may be present on the server. Staking and rewards keys remain separate from the host.
*   **Operations:** Alert on chain-head lag, failed attestations, CPU steal, memory pressure, disk latency, and disk utilization. The validator must sync and run successfully during an observation period before mainnet stake is activated.

### 5.6. Frontend
*   **Framework:** Vite, React, and TypeScript.
*   **Domain:** `www.stakewars.com`.
*   **3D Engine:** React Three Fiber (Three.js).
*   **Wallet:** Starknet.js / Argent / Braavos integration.
*   **Uploads:** Resize and encode approved images in the browser, obtain a scoped upload authorization from the Fly API, upload directly to Tigris, and notify the API when the upload completes.

### 5.7. Domain and Service Boundaries

| Domain | Service | Responsibility |
| --- | --- | --- |
| `www.stakewars.com` | Frontend hosting | Public game interface |
| `api.stakewars.com` | Fly.io | Authentication, ownership verification, game API, upload authorization, and uplink signatures |
| `assets.stakewars.com` | Tigris | Public delivery of approved Control Point images |
| `validator.stakewars.com` | Rebel Hosting | Juno full node and validator attestation only |

### 5.8. Provisioning Status
*   **Rebel Hosting:** Validator VPS requested; provisioning pending.
*   **Fly.io:** The `stakewars` application is deployed in `sjc` with one shared-CPU Machine, 512 MB RAM, and an encrypted 1 GB `stakewars_data` volume mounted at `/data`. Scheduled Fly Volume snapshots are enabled with five-day retention.
*   **Tigris:** Planned; no production bucket or credentials have been created.
*   **Constraint:** Infrastructure resources are provisioned only as part of an explicitly approved implementation task.

---

## 6. User Stories

1.  **As an Operator:** I want to redeploy my staked funds from a lost Control Point to a new Control Point instantly so I don't have to wait 7 days to keep playing.
2.  **As a Challenger:** I want to scan the Core for "Decayed Control Points" (low Signal Strength) so I can displace whales with less capital.
3.  **As a Strategist:** I want to time my "Uplink" perfectly during the Yellow Phase to get the 110% Overcharge bonus.

---

## 7. Roadmap / Phasing

*   **Phase 1: The Testnet Core**
    *   Basic 3D Sphere.
    *   Sync Protocol integration with Testnet Staking Contract.
    *   Placeholder "Uplink" (button click only).
*   **Phase 2: The Command Update (Mainnet Launch)**
    *   Full "Entropy" mechanic with Visual CAPTCHA.
    *   Yield tracking dashboard.
    *   Fly.io game API and wallet-verified upload authorization.
    *   Single-Machine Go API with SQLite on a Fly Volume and Litestream replication to a private Tigris backup bucket.
    *   Custom image uploads backed by Tigris and served from `assets.stakewars.com`.
    *   Image moderation, reporting, replacement, and cleanup workflows.
*   **Phase 3: The Mesh Expansion**
    *   Migrate SQLite to managed PostgreSQL before enabling multiple active API Machines or multi-region writes.
    *   Horizontally scale the Fly API when measured traffic and reliability requirements justify it.
    *   Introduction of "Mesh Synergy" (Adjacency bonuses).
    *   Launch of secondary token ($RES) for governance or boosts.
