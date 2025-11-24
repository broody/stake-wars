# Product Requirements Document (PRD): StakeWars.gg

**Version:** 1.0  
**Status:** Draft  
**Platform:** Starknet (L2)  
**Aesthetic:** Command Terminal / Retro-Futurist  

---

## 1. Executive Summary

**StakeWars.gg** is a persistent, gamified liquid staking interface built on Starknet. It transforms the passive act of network validation into a competitive "King of the Hill" strategy game.

Players, known as **Operators**, compete to capture territories (**Shards**) on a 3D spherical map (**The Lattice**). Staked capital ($STRK) is delegated to official Starknet validators via the native protocol, while the game layer tracks tactical dominance. The experience is wrapped in a stark, monochrome "Command Terminal" aesthetic. 

To prevent stagnation and bot-dominance, the game features an **Entropy** mechanic requiring manual, skill-based **Uplinks** to maintain staking positions.

---

## 2. Glossary & Nomenclature

*   **The Lattice:** The global game map; a 3D geodesic sphere consisting of 2,000 unique faces.
*   **Shard:** A single triangular face on the Lattice. The primary NFT/territory asset.
*   **Operator:** The user/player.
*   **Signal Strength:** A dynamic percentage (0-100%) representing the health of a Shard.
*   **Entropy:** The automatic decay mechanism that reduces Signal Strength over time.
*   **Uplink:** The manual action required to reset Entropy and restore Signal Strength.
*   **Command Sequence:** The visual, anti-bot CAPTCHA code required to perform an Uplink.
*   **High Ground:** The winning condition; holding a higher effective stake than a challenger.

---

## 3. Core Gameplay Mechanics

### 3.1. Territory Control (Staking & Allocation)
The protocol utilizes a **"Dual-Layer" architecture**. The **Consensus Layer** (Official Starknet Staking Contract) handles the actual custody of funds, while the **Game Layer** (StakeWars Smart Contract) tracks the tactical allocation of that capital.

#### 3.1.1. The Sync Protocol (Official Contract Integration)
*   **Action:** When an Operator captures a Shard, they execute a **Multicall Transaction**:
    1.  `Stake()` on the official Starknet Staking Contract (if new funds are added).
    2.  `CaptureShard()` on the StakeWars Game Contract.
*   **State Synchronization:** The Game Contract maintains an internal ledger of the Operator's claimed balance.
    *   *Verification:* Upon any game interaction (Capture, Uplink, Defend), the Game Contract checks the Operator’s balance on the Official Staking Contract.
    *   *Desynchronization Penalty:* If the Operator’s official staked balance is **lower** than their Game Layer balance (indicating they unstaked externally), a **"Signal Loss"** event triggers. The Operator is immediately disqualified, and the Shard reverts to neutral.

#### 3.1.2. The High Ground (Displacement Logic)
*   **Rules of Engagement:** To capture an occupied Shard, a Challenger must verify a Total Staked Amount that is **X% higher** (e.g., +10%) than the incumbent Operator's **Effective Stake**.
*   **Displacement:** If the bid is successful:
    1.  The Challenger becomes the new owner of the Shard.
    2.  The Incumbent Operator loses control of the Shard.
    3.  **No Forced Unstaking:** The Incumbent's funds remain in the Official Staking Contract, delegated and earning yield. They simply lose the game territory.

#### 3.1.3. Tactical Redeployment (The "Liquid" Game State)
Since the Official Staking Contract enforces a withdrawal delay, the game treats displaced stake as **"Floating Command Power."**
*   **Scenario:** Operator A is displaced from Shard 1 (1,000 STRK staked).
*   **State:** Operator A has 0 Shards, but 1,000 STRK registered in the Game Layer.
*   **Redeploy:** Operator A can instantly target Shard 2.
    *   They send a `Redeploy()` transaction (Game Layer only).
    *   The system verifies they still have 1,000 STRK in the Official Contract.
    *   They capture Shard 2 immediately without waiting for unbonding.

#### 3.1.4. Withdrawal
*   **Explicit Unstaking:** The Operator initiates an unstake via the Official Contract (via the game UI or external explorer).
*   **Latency:** Funds are subject to the official Starknet unbonding period (e.g., 7 days), but Game Utility is lost immediately upon the balance drop.

### 3.2. Entropy (The Decay Mechanic)
To ensure user retention and prevent static "whale" dominance, Shards suffer from signal decay.

*   **Decay Rate:** Signal Strength starts at 100%. It decays at a rate of roughly **10% every 24 hours** (configurable).
*   **Effect of Decay:**
    *   **Defense Penalty:** As Signal drops, the "Effective Stake" decreases.
        *   *Formula:* `Effective Stake = Total Staked $STRK * Signal %`
        *   *Example:* A whale stakes 1,000 STRK. If Signal drops to 50%, a challenger only needs >500 STRK to displace them.

### 3.3. The Manual Uplink (The Anti-Bot Loop)
Operators must perform manual maintenance to restore Signal Strength.

*   **Trigger:** Operator selects a Shard they own and clicks `> INITIALIZE UPLINK`.
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
    *   "Datamosh" glitch effects when a Shard changes hands.

### 4.2. The Lattice (3D View)
*   **Interaction:** Rotate, Zoom, Pan.
*   **States:**
    *   **Empty Shard:** Wireframe outline.
    *   **Occupied Shard:** Solid fill (White) or displays the Operator’s custom image.
    *   **Decayed Shard:** The fill flickers or dims based on Signal Strength.
*   **Parallax Background:** Pixel-art starfield that moves slowly in reverse of the camera rotation.

### 4.3. The HUD (Heads Up Display)
*   **Ticker:** Scrolling marquee at the bottom displaying live events: `> OPERATOR 0x4a... CAPTURED SHARD 402 [10,000 STRK]`
*   **Terminal Input:** A command line at the bottom left for Uplink codes.

---

## 5. Technical Architecture

### 5.1. Smart Contracts (Cairo)
*   **LatticeRegistry:** Stores ownership mappings (Shard ID -> Owner -> Game Balance).
*   **SyncController:** Interfaces with the Official Starknet Staking Contract to verify external balances.
*   **EntropyEngine:** Calculates "Effective Stake" based on timestamps.
*   **Verifier:** Validates the server signature for Manual Uplinks.

### 5.2. Backend (Game Server)
*   **Role:** Generates visual CAPTCHA images and provides signatures (Server-Signer pattern).
*   **Tech:** Node.js or Python (FastAPI).
*   **Security:** Rate limiting to prevent API spam; admin private key rotation.

### 5.3. Frontend
*   **Framework:** Next.js (React).
*   **3D Engine:** React Three Fiber (Three.js).
*   **Wallet:** Starknet.js / Argent / Braavos integration.

---

## 6. User Stories

1.  **As an Operator:** I want to redeploy my staked funds from a lost Shard to a new Shard instantly so I don't have to wait 7 days to keep playing.
2.  **As a Challenger:** I want to scan the Lattice for "Decayed Shards" (low Signal Strength) so I can displace whales with less capital.
3.  **As a Strategist:** I want to time my "Uplink" perfectly during the Yellow Phase to get the 110% Overcharge bonus.

---

## 7. Roadmap / Phasing

*   **Phase 1: The Testnet Lattice**
    *   Basic 3D Sphere.
    *   Sync Protocol integration with Testnet Staking Contract.
    *   Placeholder "Uplink" (button click only).
*   **Phase 2: The Command Update (Mainnet Launch)**
    *   Full "Entropy" mechanic with Visual CAPTCHA.
    *   Yield tracking dashboard.
    *   Custom image uploads.
*   **Phase 3: The Mesh Expansion**
    *   Introduction of "Mesh Synergy" (Adjacency bonuses).
    *   Launch of secondary token ($RES) for governance or boosts.