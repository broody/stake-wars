# Product Requirements Document (PRD): StakeWars.gg

**Version:** 2.0
**Status:** Draft
**Platform:** Starknet (L2)
**Aesthetic:** Command Terminal / Retro-Futurist

---

## 1. Executive Summary

**StakeWars.gg** is a persistent, gamified staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Control Points**) on a 3D spherical map (**The Core**). STRK is delegated to the StakeWars validator through Starknet's native delegation protocol. Operators explicitly allocate portions of that real delegation to Control Points and challenges without creating a separate power currency. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic.

An Operator captures a neutral Control Point by choosing how much staked STRK to commit. Taking an occupied point starts an open ascending contest: every bid is public, must exceed the current lead, and restarts a configurable response window initially set to 3 hours. Each Operator maintains one cumulative bid and locks only the increment when raising it. Outbidding changes leadership without spending either position; when the contest expires, the winner's bid becomes the new garrison and every losing Operator's highest bid becomes Spent Power. Any eligible Operator may participate, there is no absolute contest-duration cap, and settlement is permissionless once a full response window passes without a higher bid. The current Controller may display a custom image on that face until ownership changes.

---

## 2. Glossary & Nomenclature

*   **The Core:** The global game map; a 3D geodesic sphere consisting of 2,000 unique faces.
*   **Control Point:** A single triangular face on the Core. In the initial release it is a Dojo-native game territory, not a freely transferable NFT.
*   **Operator:** The user/player.
*   **Live Delegation:** An Operator's authoritative delegated STRK balance, read directly from the official delegation pool.
*   **Committed Power:** Internal allocation accounting for the portion of Live Delegation bound to Control Point garrisons or active cumulative bid positions. It cannot simultaneously back another action.
*   **Spent Power:** Staked STRK represented by a final losing Control Point defense or bid and no longer available to back StakeWars gameplay from that Operator address. The underlying STRK remains delegated directly to the validator and continues following the official staking and reward rules.
*   **Ready STRK:** `max(0, Live Delegation - Point Commitments - Active Bid Locks - Spent Power)`. This is derived contract accounting, not a token or user-managed currency. The UI may expose it contextually as the maximum currently usable STRK.
*   **Capture Power:** The Committed Power recorded on a Control Point.
*   **Controller:** The Operator currently holding a Control Point.
*   **Challenge:** An open, ascending contest for an occupied Control Point.
*   **Leading Bid:** The visible highest bid currently locked against a Challenge.
*   **Response Window:** The configurable time allowed for another Operator to submit a higher bid. Every valid new leader resets the full window; there is no overall deadline.
*   **Control Point Sacrifice:** Voluntarily giving up another owned, uncontested Control Point before bidding. The point becomes neutral and its garrison returns to Ready STRK for the same atomic bid transaction; any assets remain attached to the point.
*   **Arbiter:** An unprivileged keeper service that observes indexed onchain state and submits permissionless maintenance transactions, including expired-Challenge settlement, older losing-position resolution, and Operator synchronization. The Arbiter cannot select winners, alter bids, or bypass contract validation.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Delegation-Backed Allocation Accounting)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (the official Starknet staking and delegation pool contracts) handles custody, yield, and authoritative Staking Power, while the **Game Layer** (the StakeWars Dojo World) tracks Control Point ownership and recorded Capture Power.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Action:** A transaction may first approve STRK and enter or add to the StakeWars validator's official delegation pool, then call a game action from the same Starknet account.
*   **Authoritative Balance:** Before every power-sensitive action, the Control System reads the Operator's live `amount` and unpooling state from the official STRK delegation pool. Delegation performed directly through the official contract is therefore recognized without passing through a StakeWars capture call.
*   **Allocation Accounting:** The Game Layer records only the obligations needed to prevent reuse: aggregate Point Commitments, aggregate active cumulative Bid Locks, and aggregate Spent Power. Ready STRK is derived from those obligations and Live Delegation.
*   **No Double Backing:** One unit of Live Delegation can support only one garrison, active bid position, or spent position at a time. An Operator with 3,000 delegated STRK may deploy 1,000 to one Control Point and retain 2,000 Ready STRK, but the same 1,000 cannot back another action.
*   **Explicit Amounts:** Capture, reinforcement, and bid calls specify visible STRK amounts. A first bid locks its exact total; a returning bid locks only the increase over that Operator's prior total.
*   **Desynchronization Penalty:** If Live Delegation falls below recorded obligations, the Operator address is permanently retired and all of its holdings and challenge positions are invalidated. Ownership generations make all affected Control Points neutral without iterating over all 2,000 points.
*   **Arbiter Synchronization:** The Arbiter periodically calls `sync_operators` for known active Operators. This detects unpooling initiated directly through the official staking contract even when the Operator never returns to the StakeWars application. Every normal power-sensitive game action performs the same authoritative check independently.
*   **No Custody:** StakeWars contracts never transfer, escrow, or withdraw an Operator's STRK.

#### 3.1.2. Capture, Reinforcement, and Release
*   **Neutral Capture:** A neutral Control Point may be captured by allocating at least the configured minimum stake and no more than Ready STRK. The initial minimum is 100 STRK.
*   **Reinforcement:** A Controller may allocate a selected positive amount of Ready STRK to one owned, uncontested Control Point. Reinforcement increases both that point's Capture Power and the Operator's aggregate Point Commitments.
*   **Release:** A Controller may voluntarily release an uncontested Control Point. The point becomes neutral, its active image is hidden, and its Capture Power returns to Ready STRK.
*   **Multiple Positions:** An Operator may lead multiple Challenges and manage other uncontested Control Points while sufficient Ready STRK remains.

#### 3.1.3. Open Ascending Challenges
*   **Starting a Challenge:** Any eligible non-Controller may bid strictly more than an occupied, uncontested point's Capture Power. The bid amount and bidder are public.
*   **Opening Risk:** The opening bid places the incumbent's existing garrison and challenger's bid at risk. Neither becomes Spent Power before settlement.
*   **Open Participation:** Any eligible Operator other than the current leader may submit a strictly higher public total. Each Operator has one cumulative position per Challenge.
*   **Incremental Raises:** A returning Operator locks only `New Total Bid - Own Previous Bid`. Example: after bidding 500 STRK, raising to 700 STRK requires only 200 additional Ready STRK. Being outbid changes the visible leader but does not spend or unlock the prior position.
*   **Anti-Sniping Window:** Every valid higher bid resets the full admin-configured response window, initially 3 hours. The current leader cannot bid against itself to extend the clock. There is no absolute duration cap; a contest continues as long as other Operators keep risking higher amounts. A later rule change applies when a subsequent bid calculates its new response window.
*   **No Ties:** A bid equal to the current lead is rejected. The first accepted strictly higher bid becomes leader.
*   **Example:** A has a 500 STRK position and B leads at 600. A may bid 700 by locking 200 additional STRK. B may then bid 800 by locking 200 additional STRK. If the response window expires with B leading, B's 800 becomes the garrison and A's final 700 becomes Spent Power.

#### 3.1.4. Control Point Sacrifice
*   Any bidder may give up one other owned, uncontested Control Point within the same bid transaction.
*   The source point becomes neutral immediately and its image is hidden. Its garrison returns to Ready STRK before the new bid is checked, so backing moves rather than duplicates.
*   Assets or future rewards attached to the source Control Point remain with that point and become available to future Controllers. A defender may therefore abandon one front to fund a response on another.

#### 3.1.5. Settlement and Privacy Boundary
*   After a full response window passes without a higher bid, any account may call `settle_challenge`. The contract derives the result from its current leader; there is no settlement authority or off-chain ranking.
*   A valid leader's exact bid becomes the target Control Point's Capture Power. If the leader has invalidated its staking position before settlement, the point becomes neutral.
*   Every non-winner loses its own highest cumulative bid. Settlement resolves the winner, incumbent, and final runner-up in constant work. Because participation is unbounded, older losing positions are finalized permissionlessly one at a time; until resolved, they remain locked and reduce Ready STRK by the same amount.
*   **Arbiter Maintenance:** The Arbiter monitors expired Challenges, calls `settle_challenge`, and then calls `resolve_challenge_position` for any older unresolved losers. These entrypoints remain permissionless so another account may perform the work if the Arbiter is delayed or offline.
*   StakeWars never transfers, escrows, or slashes STRK. Spent Power is permanent game accounting for the Operator address; the underlying STRK remains directly delegated and reward-bearing under the official pool rules.
*   **Public Deployment:** Operator identities, direct delegation, cumulative bids, incremental additions, bid timing, current leadership, sacrifices, deadlines, and settlement are public onchain.
*   **Shielded Reserve:** A future STRK20 integration may let an Operator keep undeployed STRK in a shielded balance before mobilizing it. Shield and unshield amounts are public legs, and STRK cannot back StakeWars until it is unshielded and directly delegated, so the game must not claim that deployed strength is private.

#### 3.1.6. Withdrawal and Permanent Retirement
*   **Retirement:** Initiating an unpool or withdrawal from the official staking contract permanently retires that address from StakeWars. Its ownership generation is invalidated, its Control Points become neutral, and it may never capture, reinforce, or challenge again.
*   **Direct Official-Contract Actions:** The periodic operator synchronization process and every game action inspect official unpooling state, so initiating an exit outside the StakeWars UI is still detected.
*   **Explicit Game Exit:** `retire` is a permanent retirement action, not a temporary release-all shortcut.
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
    *   **Selected Control Point:** Highlights and displays the Controller, Capture Power, current leader, leading bid, public bid count, response-window deadline, and the connected Operator's contextually relevant Ready STRK.
    *   **Control Tenure Relief:** In Control mode, every occupied Control Point is extruded radially according to how long the current Controller has continuously held it. Height uses one fixed, absolute logarithmic scale for every visitor and session, capped visually at one year so old holdings cannot overwhelm the Core. The exact duration remains visible in the selected Control Point panel. Neutral capture and challenge settlement to a new Controller reset tenure; successful defense and reinforcement do not. Projection mode remains flat.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED CONTROL POINT 402 [10,000 STRK]`
*   **Control Panel:** A concise action panel for Capture, Reinforce, Release, Open Bid, Control Point Sacrifice, permissionless Settlement, and Retire transactions. It clearly warns that a bid is public and the final losing total becomes Spent Power, shows the minimum strictly higher total and incremental lock, and previews any additional direct delegation needed.

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
    *   `GameConfig`: Official STRK delegation pool address, minimum stake, admin-configurable response-window period (initially 3 hours), Control Point limit, and pause state.
    *   `OperatorState`: Operator address, ownership generation, aggregate Point Commitments, aggregate active Bid Locks, aggregate Spent Power, controlled-point count, active-position count, and retirement state.
    *   `ControlPoint`: Control Point ID, Controller address, Controller generation, Capture Power, ownership generation, ownership timestamp, and active challenge ID.
    *   `Challenge`: Challenge ID, target Control Point, incumbent, current leader and generation, leading bid, latest displaced Operator and amount, resettable deadline, bid and participant counts, winner, and settlement timestamp.
    *   `ChallengeParticipant`: Per-Challenge Operator position, cumulative bid, included incumbent garrison, Operator generation, and resolution result.
*   **Control System:** Implements Capture, Reinforce, Release, incremental open ascending bids, deferred losing-bid spending, Control Point Sacrifice, permissionless settlement and position resolution, permanent retirement, and Operator synchronization.
*   **Staking Adapter:** Uses the official delegation pool's read-only `get_pool_member_info_v1` interface and treats its `amount`, `unpool_amount`, and `unpool_time` fields as authoritative delegation and exit state.
*   **Admin System:** Provides narrowly scoped pause and configuration operations protected by Dojo World ownership. Production ownership should be held by a multisig.
*   **Permissions:** Systems receive writer permission only for the specific models they modify. Reads are permissionless.
*   **Events:** Capture, Reinforcement, Release, Challenge Started, Bid Placed, Control Point Sacrificed, Challenge Settled, Challenge Position Resolved, Retirement, and Disqualification events drive Torii, the HUD ticker, and historical views.
*   **Custody Boundary:** The Dojo World never holds or transfers staking assets.

### 5.2. Backend API (Fly.io)
*   **Runtime:** A Go API service deployed on Fly.io at `api.stakewars.gg`. The initial target is one shared-CPU Machine with 512 MB RAM in the `sjc` region. CPU and memory may be increased if observed load requires it.
*   **Responsibilities:**
    *   Verify wallet challenges and current on-chain Control Point ownership.
    *   Run the unprivileged Arbiter loop that settles expired Challenges, resolves remaining losing positions, and synchronizes known active Operators against the official staking contract.
    *   Authorize narrowly scoped, short-lived image uploads to Tigris.
    *   Validate completed uploads before publishing their metadata.
    *   Serve game metadata and apply rate limits per wallet and IP address.
*   **Initial Topology:** Run exactly one active API Machine while SQLite is the system of record. The Machine mounts a persistent Fly Volume at `/data`; normal deploys and restarts must preserve that volume. Do not add a second active API Machine that writes to the same SQLite database.
*   **Storage Boundary:** Uploaded images are never stored on the Machine or Fly Volume. The volume contains only the SQLite database and its related files; image bytes are uploaded directly to Tigris.
*   **Security:** Wallet challenges use short-lived, single-use nonces. Storage credentials are server-only secrets and must never be sent to the browser, logs, repository, or public configuration. The Arbiter has no privileged game role or settlement discretion: every submitted maintenance transaction is independently validated by the Dojo World, and no backend decryption key exists.

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

1.  **As an Operator:** I want every action expressed in STRK while the game tracks allocation, current leads, and spent capacity under the hood.
2.  **As a Challenger:** I want to see the current lead and response window before deciding whether a higher public bid is worth permanently risking.
3.  **As a Controller:** I want to upload an image to the face I control so my victory is visible on the Core.
4.  **As a Challenge Participant:** I want every higher bid to reset the response window so last-block sniping cannot bypass my chance to respond.
5.  **As a Visitor:** I want Control mode to show ownership tenure as stable terrain so I can recognize entrenched positions without opening every Control Point.
6.  **As a Strategist:** I want to sacrifice another Control Point to fund a higher bid without duplicating its backing, accepting that the abandoned territory becomes contestable.
7.  **As an Exiting Operator:** I want the UI to clearly warn that beginning an unstake permanently retires this address from the game.

---

## 7. Roadmap / Phasing

*   **Phase 1: Delegation-Backed Allocation and Open Challenges**
    *   Basic 3D Sphere.
    *   Dojo World with internal delegation-backed allocation, unlimited-participant incremental open ascending challenges, resettable 3-hour response windows with no absolute duration cap, settlement-time losing-bid spending, Control Point sacrifice, permissionless settlement and position resolution, permanent retirement, and synchronization logic.
    *   Mainnet integration with the StakeWars validator's official STRK delegation pool.
    *   Starknet wallet connection and atomic stake-and-action multicalls.
    *   Torii-backed ownership and event updates in the frontend.
    *   Absolute, bounded Control Point tenure relief in Control mode with exact held duration in the HUD.
    *   Fly.io API with wallet-verified, ownership-bound upload authorization.
    *   Single-Machine Go API with SQLite on a Fly Volume, Litestream replication to a private Tigris backup bucket, and a tested recovery procedure before production data is accepted.
    *   Custom image uploads backed by Tigris and served from `assets.stakewars.gg`.
    *   Minimum viable image reporting and administrative removal.
*   **Phase 2: Strategic Reserve Privacy**
    *   Evaluate a wallet-mediated STRK20 flow for shielding undeployed reserves without changing the direct-delegation requirement.
    *   Clearly disclose that shield/unshield legs and all deployed StakeWars bids remain public, and require a reviewed integration plan before implementation.
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
