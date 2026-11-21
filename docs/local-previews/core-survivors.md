# Core Survivors preview

A single-player survival run on the Core, following the [Core Survivors concept](../concepts/core-survivors/README.md). The Vanguard holds out against the Hollow Legion while weapons fire on their own; the score is the number of enemies destroyed. Gameplay is ported from the Last Ronin prototype (`~/development/last-ronin`), with its numbers converted from pixels to world units on the Core.

Open `/play/survivors` and choose **Play**. Guests can play immediately and connect a Starknet wallet on the results screen to submit their score. Local development drills can be opened directly with the preview URLs below.

For the optional Bulwark interception, open `/play?survive=1&survivePreview=kite-wall` in local development. After four minutes, retreating in good health with a crowd behind you can bring the next Bulwark line forward. Find the gap or turn around its flank.

```bash
pnpm dev:web
```

Then visit `http://localhost:3000/play?survive=1`. Inspect the XP shards, field gear and Supply Drops at [/play/items](/play/items). **Full field** shows all three XP tiers at the 320-shard limit.

## Controls

- Move with WASD, the arrow keys, or a one-finger or left-button drag.
- Scroll or pinch to zoom. Right-drag or drag with two fingers to orbit your character. **Reset camera** restores the default follow view for the current screen.
- Pick an upgrade with 1, 2 or 3, or click it; R rerolls (twice per run).
- P or Escape pauses. Leaving removes the parameter and returns the Core.

The 3.85-second opening tracks the falling shell and sweeps behind the Vanguard at gameplay distance as it opens. Movement or **Skip intro** goes straight to play. With reduced motion enabled, the run opens in the follow view. Survival time and combat begin after the opening.

The camera follows the Vanguard from above. The orbit pivots at the torso. Movement follows the camera angle, and the view stays upright as the Vanguard crosses a pole.

## Content

| Weapon         | Pairs with   | Evolution     |
| -------------- | ------------ | ------------- |
| Arc Blade      | FORCE        | Eclipse       |
| Bolt Caster    | Overclock    | Railstorm     |
| Orbit Shards   | Thrusters    | Shard Halo    |
| Orbital Strike | Amplifier    | Chain Barrage |
| Sector Charge  | Tractor Beam | Meltdown      |
| Stake Pulse    | Nanorepair   | Bastion       |
| Crescent Wave  | Amplifier    | Meridian      |
| Rebuke         | Aegis        | Rampart       |

Crescent Wave, Rebuke and Aegis are Vanguard upgrades. Both the Vanguard and Sector Trooper can equip Bolt Caster in their left hand. A weapon at level 5 with its paired system evolves from a level-up offer or from a Supply Drop, which Lancer Captains and the Warden drop.

The Hollow Legion: Mites and faster Skitters swarm; Volt Mites explode and set off chain reactions; Lancers keep their distance and fire slow bolts without a pre-shot warning; Bulwarks are slow and heavy and also march in lines; Seekers stop, mark a path and charge along it; Lancer Captains fire volleys and drop Supply Drops; the Warden slams its staff into a marked frontal area, fires rings of bolts and summons Mites.

Scripted events arrive on a timeline: a Skitter swarm at 0:40, a Bulwark line at 1:20, a Captain at 1:50, Seekers at 2:20 and the Warden at 3:30, then heavier versions until 6:30, when the cycle repeats every 2.5 minutes. Enemy health compounds once the late-game crowd builds up.

Ordinary breaches release at most one lone Seeker every two seconds, with up to three alive at once. The scripted pack waves have their own schedule.

Each Seeker pack wave adds a lane: three packs the first time, then four, up to eight (`SEEKER_LANES`). The first four lanes run side by side and the rest cross them at right angles. Seekers always draw their aim lines on the ground, even while the other enemies' ground warnings are off (`telegraphed` in `renderFrame.ts`). A pack is eight Seekers in one staggered file (`SEEKER_PACK`): the player can't walk through a waiting column, and a charging Seeker shoves the player across its lane, all to the side the player is already on, instead of passing through.

Every living enemy is solid (`bodyBlock` in `sim.ts`). The player can't walk through one, and one that walks into the player pushes them back, so a closing ring or a crowd at your back holds you in place; touching one still hurts on the usual 0.6 s invulnerability cadence. Remains of defeated enemies never block, and neither does an enemy still rising out of a breach or a Volt Mite mid-leap. Two scripted formations become walls: a Bulwark line sweeps a player who stands in its path ahead of it until they get around it or cut through, and the Encircle ring blocks most straight walks out of it.

Scripted encounters run on the Legion clock at 1.15× real time. The first Warden arrives at 3:03 and the second at 5:39. Ambient spawn rate, crowd size and non-boss health grow gently until 5:13, then accelerate toward the late-game curve. With fewer enemies dropping XP early, each level costs `round((6 + 1.6 × level²) / 1.75)` XP. The natural Vanguard run targets an eight-minute median. [Design and simulation results](../concepts/core-survivors/hero-classes.md).

## Checking a balance change

Run these commands from the repository root that contains Core Survivors. The simulator drives the same 30 Hz combat loop as the browser. By default it plays Vanguard, accepts real upgrades, and records health, kills, level and weapon damage until defeat or a 15-minute cap.

For an Arc Blade change, save a baseline before editing the weapon. Run the second command after the edit.

```bash
pnpm sim:balance --builds natural --focus blade --json /tmp/blade-before.json
pnpm sim:balance --builds natural --focus blade --compare /tmp/blade-before.json --json /tmp/blade-after.json
```

Both commands play the same 24 seeds. `--focus` picks the named weapon and its evolution partner when offered. The coverage line shows how many runs reached each rank. Compare damage share, first evolution, levels, kills, and time survived. The report pairs each seed and identifies the largest change in survival. To replay seed 7 headlessly, add `--seed 7 --runs 1` to the comparison command. The saved results include each seed’s loadout, cause of death and minute-by-minute progress.

- **Opening and build variety.** Use `--builds natural` without a focus to see what happens under ordinary upgrade choices. Repeat with `--policy random` for a less selective player. Each choice policy needs its own baseline.
- **Late-game interactions.** Use `--builds mid,kit,max` to give the bot preset loadouts from the start. Include `--heroes trooper,vanguard` to cover both heroes. The Vanguard kit exercises its class weapons. Optional `--mode pressure` uses virtual health and continues through defeat to measure late-wave damage and potential healing. Older JSON reports use this mode.
- **Automated checks.** `pnpm sim:balance --builds natural --runs 8 --cap 180 --check` checks the opening. `pnpm sim:balance --builds natural --cap 600 --check` also checks that median defeat falls between 7:30 and 8:30 for the Vanguard using ordinary greedy picks. `pnpm sim:balance --check` includes the preset builds. A missed or unmeasurable target exits nonzero. Before/after deltas are reported separately and have no automatic tolerance.
- **Human playtests.** Use them for steering, camera and attack readability, or to investigate changes the bots flag. The bot uses a fixed landscape view on a flat Core. Its survival times describe the tested strategy and seed set.

## Assets

Mites, Skitters and Volt Mites share the rigged Mite, at different scales and tints; Lancers and Captains share the rigged Lancer. Mites and Lancers use GPU-instanced Run playback from the [enemy swarm preview](enemy-swarms.md). Bulwark now uses its authored shield-equipped model and GPU-instanced Walk playback (892 triangles, 18 bones, four material primitives sharing two materials). It is scaled to 0.25, with a 0.24 collision radius; marching columns are 0.6 units apart and rows 0.36 units apart to fit its shield. The 7.4-unit formation has 13 columns in three rows (39 Bulwarks). Locomotion playback follows actor speed / (0.375 × scale), including the faster marching line. Chasing Bulwarks use ShieldThrust with timed damage; marching formations keep contact damage and walking. The Vanguard and Seeker remain flat-shaded placeholders. Warden uses its authored, shield-free staff model and all five clips.

## Code

- `src/game/survivors/sim.ts` — the run: deterministic for a seed and inputs, at a fixed 30 Hz, with no rendering. Actors are unit normals and move along great circles.
- `src/game/survivors/content.ts` — weapons, systems, enemies and the event script.
- `src/game/survivors/session.ts` — one run shared by the scene and the HUD, input, and the `?survive` parameter. Development builds expose `window.__coreSurvivors` for tuning.
- `src/game/components/3d/CoreSurvivors.tsx`, `CoreSurvivorsParts.tsx` — the chase camera and instanced renderers, interpolated between ticks.
- `src/game/components/ui/CoreSurvivorsHud.tsx` — HUD, joystick and dialogs, built from `src/ui`.

`src/game/survivors/sim.test.ts` plays scripted and bot-driven runs: determinism, surface math, level-ups, evolutions, every weapon, a Bulwark line, the Warden and a player who stands still.

Balance is a first pass carried over from the prototype. Target-device frame rate has not been measured; the development machine's headless software renderer is not representative.


## Bulwark shield thrust

Chasing Bulwarks close to 1.30 world units, lock the shield's aim, then wind up for 13/24 seconds. A blunt orange strip fills along the exact active shield footprint on the sphere; the red visor, chest light, and shield marker pulse together, accelerating through three pulses toward launch and growing brighter. The lights return to their normal glow once the slide begins. The strip flashes briefly at launch, and two fading skid trails show the slide. The enemy recovers at its landing position until the 1.75-second clip ends, then waits 3–3.5 seconds before attacking again. Bulwarks resume approaching immediately after recovery, including during cooldown, until they reach contact range.

Motion and shield bounds are baked from `bulwark.glb` by `node scripts/bake-bulwark-attack.mjs` into `src/game/survivors/bulwarkAttackData.json`. The simulation retargets the sampled root curve from 1.2 to 2.4 model metres (0.60 world units at scale 0.25) along a great circle. Rendering removes that root translation and blends GPU-instanced Walk/ShieldThrust poses, preventing double movement and end-of-attack snap-back. One-shot sampling includes its endpoint and does not wrap.

The active window is 16/24–20/24 seconds. A swept rectangle includes shield movement and player movement, split at authored keyframes to prevent tunneling. One successful hit deals the Bulwark's 10 base damage with the existing run scaling/armor/invulnerability rules, plus 0.12 world units of forward knockback. All Bulwarks also deal contact damage while touching the player, including during windup, recovery, and cooldown. Contact and shield hits share the normal 0.6-second player invulnerability window, preventing stacked damage in the same tick. Committed attacks resist crowd separation and knockback, but death cancels the attack and warning. Marching formations keep walking and retain their existing contact damage.

For a focused local drill, open `/play?survive=1&survivePreview=bulwark` on the current dev server. It spawns one Bulwark, disables player weapons and ambient waves, and lets you test sidestepping. This parameter is ignored in production. Reload for a fresh drill; omit `survivePreview` for a normal run.

Tests cover aim locking, anticipation/recovery safety, one-hit damage, dodging, invulnerability, death cancellation, formation behavior, displacement across timestep sizes, swept collision, warning coverage, and correspondence between the GLB, gameplay samples, and root-stripped GPU poses.

The centered shield carry bends the left elbow across the torso in Walk, Run, and ShieldThrust. Its marker stays left of center. Attack samples and warning bounds have been rebaked from the updated GLB.

Gameplay retargets Bulwark root travel to twice the authored distance: 0.60 world units at scale 0.25. Timing and the local shield pose are unchanged; collision bounds, the warning lane, and skid trails use the same retargeted samples.

Regular spawn unlocks: Mites at the start, Skitters at 0:45, Lancers at 1:45, individual charging Bulwarks at 2:30, Volt Mites at 4:15, and Seekers at 5:15. The first Warden and subsequent scripted events move 30 seconds later to preserve encounter spacing: Warden 3:30, encircle 4:05, two Bulwark lines 4:40, Seeker packs 5:10, Captains 5:40, heavy encircle 6:05, Warden 6:30. The recurring 2:30 wave cycle begins from 6:30.

During the drive window, a Bulwark sweeps its torso and shield across nearby units and displaces them sideways out of the lane without dealing friendly damage. Displacement is reduced by unit mass. Wardens and other committed Bulwark thrusts resist displacement. Swept collision includes unit movement and samples between animation keys, including longer simulation steps; the spatial grid is refreshed after a shove.


## Warden model and animations

Warden now loads `warden.glb`: 1,203 triangles, 25 bones, four material primitives, with Guard, Walk, Run, StaffSlam, and Defeated. Its model scale is 0.30 (body height about 1.08 world units), retaining the 0.30 collision radius. Its first spawn remains at 3:30.

Rare Wardens use independent skinned clones with isolated materials and animation mixers rather than the crowd atlas. This preserves smooth clip transitions and the exported sensor morph animation. Approach speed blends smoothly from the authored walk at 1.4 world units to full pursuit at 2.2. Walk and Run preserve stride phase on a gait change. Animation rates follow measured movement, including slow effects. Stationary Wardens use Guard. Pausing freezes animation with simulation time.

The old frontal sweep is replaced by StaffSlam. Inside 1.6 units, Warden locks its facing and plants its feet for the two-second clip. A forward 120-degree warning cone originates at the modeled staff tip, with radius 1.2. Impact at frame 26/24 seconds flashes the same spherical sector and deals 20 base damage once to players whose feet are inside. The remaining clip is recovery. The Warden suspends body-contact damage during its committed slam. Its bolt rings, Mite summons and slam knockback resistance are preserved. Warning origin, damage origin, animation timing, and tip position are checked against the exported GLB. Multiple Wardens can show warnings simultaneously.

On death, Warden immediately leaves combat and targeting, cancels its warning/attack, and drops its usual reward once. The same rendered actor crossfades into the 1.75-second kneeling collapse. The red inserts flicker and shut off through the exported SensorsOff morph tracks. The body is translucent, holds its settled pose, fades from 1.95 seconds, and is removed at 2.5 seconds. Other units retain their existing 1.8-second corpse lifetime.

Development-only previews:

- `/play?survive=1&survivePreview=orbital-strike` starts with Orbital Strike facing a cluster of stationary Mites. Use **Orbital Strike level** to switch between levels 1–5. The tile under the hit rises first and highest. Nearby tiles move less as the ripple travels outward. The same selector is available at `/play/actions?action=orbital-strike`, where you can pause and step through a single impact.
- `/play?survive=1&survivePreview=warden`: one Warden, no player weapons or ambient waves; dodge slams and bolt rings. Retreat to see Run and approach to see Walk. Summons are suppressed in this focused drill.
- `/play?survive=1&survivePreview=warden-defeat`: the blade defeats a Warden every few seconds to inspect the collapse, sensor shutoff, and fade. Remains cannot block movement.

`wardenAttack.test.ts` covers impact timing, aim locking, dodging, contact/invulnerability, interrupted attacks, rewards, longer corpse lifetime, timestep variation, movement speeds, bolt rings, and summons. `wardenAnimation.test.ts` verifies the GLB clips, staff impact position, forward warning geometry, both gaits, pause behavior, sensor morph playback, final hold/fade, and isolation between living and dead copies.

## Single-saber Sector Trooper

The player uses the Sector Trooper model with independent locomotion and upper-body
attacks. Its compact saber sends out a cyan slash with an outer edge matching actual
reach; range upgrades extend the same collision/visual envelope. Slashes hit after
an animated wind-up and leave a short fading mark at the hit position. At level two,
the single cut grows from 90° to 95° and deals 18 damage, up from 16.

Local drills: `?survive=1&survivePreview=saber` for base reach and
`?survive=1&survivePreview=saber-range` for blade level 4 plus 1.5× Area.
Both use durable, stationary targets and increased preview-only player health.
Ordinary `?survive=1` uses normal gameplay stats. The seven-clip GLB is in
`public/models/sector-trooper/sector-trooper-saber.glb`.

Saber attacks select the nearest enemy in any direction at wind-up, including
pursuers behind the player. That direction stays committed through impact and is
transported over the Core as the player moves. The torso aims independently of
the running legs. The crescent starts at 90° and widens 5° per rank to 110° at rank five.
Each swing makes a single cut. Its ellipse has a half-width of 80% of its reach.
Area and reach upgrades extend the hit area and the visible edge together.

Player defeat: `?survive=1&survivePreview=saber-death` is a local fatal-contact
drill. The authored three-second Saber_Death clip plays while a 3.5-second spiral zoom
settles directly above the prone trooper, with his head turned to the side. That view holds for one second before results
appear (4.5 seconds after defeat). Combat and the survival clock stay frozen,
and the final pose and camera hold behind the dialog.

On player defeat, enemy models within 0.5 world units plus their body radius switch to 20% opacity,
so overlapping units cannot hide the trooper during the fall or overhead close-up.
Distant enemies remain fully visible, including instances sharing the same batch. Restarting
restores living enemies to full opacity; enemy corpses retain their own fade.


The Bolt Caster weapon upgrade equips a compact gun in the left hand while retaining
one saber in the right. The Vanguard tracks the next target with his shoulders,
plants a boot to pivot for rear shots, and backpedals when firing against his
direction of travel. Railstorm keeps firing through the turn. Scrub the pivot in
`/play/actions?action=bolt-caster` or try it in a run with
`?survive=1&survivePreview=saber-gun`. The first rank fires one bolt. Ranks three and four double tap every fifth and fourth volley respectively. Rank five mixes one double tap and one triple tap into each nine-volley cycle. Each tap fires four simulation ticks (0.133 seconds) after the previous one and sweeps across the current aim. Railstorm adds piercing.
The gun stays attached on defeat. A new run starts with the saber alone.
