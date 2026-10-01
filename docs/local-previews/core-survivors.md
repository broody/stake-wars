# Core Survivors preview

A single-player survival run on the Core, following the [Core Survivors concept](../concepts/core-survivors/README.md). The Vanguard holds out against the Hollow Legion while weapons fire on their own; the score is how long you last. Gameplay is ported from the Last Ronin prototype (`~/development/last-ronin`), with its numbers converted from pixels to world units on the Core.

Open `/play?survive=1`. Without the parameter the Core is unchanged and the mode's code is not loaded.

```bash
pnpm dev:web
```

Then visit `http://localhost:3000/play?survive=1`.

## Controls

- Move with WASD or the arrow keys, or drag anywhere to use a virtual joystick.
- Pick an upgrade with 1, 2 or 3, or click it; R rerolls (twice per run).
- P or Escape pauses. Leaving removes the parameter and returns the Core.

The camera follows the Vanguard from above. Screen-up is carried along as the Vanguard moves, so the view never spins, even when crossing a pole.

## Content

| Weapon         | Pairs with | Evolution     |
| -------------- | ---------- | ------------- |
| Arc Blade      | FORCE      | Eclipse       |
| Bolt Caster    | Overclock  | Railstorm     |
| Orbit Shards   | Thrusters  | Shard Halo    |
| Orbital Strike | Amplifier  | Chain Barrage |
| Sector Charge  | Plating    | Meltdown      |
| Stake Pulse    | Nanorepair | Bastion       |

Tractor Beam is the seventh system and has no pair. A weapon at level 5 with its paired system evolves from a level-up offer or from a Supply Drop, which Lancer Captains and the Warden drop.

The Hollow Legion: Mites and faster Skitters swarm; Volt Mites explode and set off chain reactions; Lancers keep their distance and fire slow bolts without a pre-shot warning; Bulwarks are slow and heavy and also march in lines; Seekers stop, mark a path and charge along it; Lancer Captains fire volleys and drop Supply Drops; the Warden slams its staff into a marked frontal area, fires rings of bolts and summons Mites.

Scripted events arrive on a timeline: a Skitter swarm at 0:40, a Bulwark line at 1:20, a Captain at 1:50, Seekers at 2:20 and the Warden at 3:30, then heavier versions until 6:30, when the cycle repeats every 2.5 minutes. Enemy health compounds after 8 minutes, so every run ends.

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

Rare Wardens use independent skinned clones with isolated materials and animation mixers rather than the crowd atlas. This preserves smooth clip transitions and the exported sensor morph animation. Walk plays at its authored 0.60 m/s times scale while closing within 1.8 world units; farther away, Run follows the existing chase speed. Animation rates follow measured movement, including slow effects. Stationary Wardens use Guard. Pausing freezes animation with simulation time.

The old frontal sweep is replaced by StaffSlam. Inside 1.6 units, Warden locks its facing and plants its feet for the two-second clip. A forward 120-degree warning cone originates at the modeled staff tip, with radius 1.2. Impact at frame 26/24 seconds deals the existing 20 base damage once, respecting armor and invulnerability. The remaining clip is recovery. Contact damage, bolt rings, and Mite summons remain; committed slams resist knockback. Warning origin, damage origin, animation timing, and tip position are checked against the exported GLB. Multiple Wardens can show warnings simultaneously.

On death, Warden immediately leaves combat and targeting, cancels its warning/attack, and drops its usual reward once. The same rendered actor crossfades into the 1.75-second kneeling collapse. The red inserts flicker and shut off through the exported SensorsOff morph tracks. The body is translucent, holds its settled pose, fades from 1.95 seconds, and is removed at 2.5 seconds. Other units retain their existing 1.8-second corpse lifetime.

Development-only previews:

- `/play?survive=1&survivePreview=warden`: one Warden, no player weapons or ambient waves; dodge slams and bolt rings. Retreat to see Run and approach to see Walk. Summons are suppressed in this focused drill.
- `/play?survive=1&survivePreview=warden-defeat`: the blade defeats a Warden every few seconds to inspect the collapse, sensor shutoff, and fade. Remains cannot block movement.

`wardenAttack.test.ts` covers impact timing, aim locking, dodging, contact/invulnerability, interrupted attacks, rewards, longer corpse lifetime, timestep variation, movement speeds, bolt rings, and summons. `wardenAnimation.test.ts` verifies the GLB clips, staff impact position, forward warning geometry, both gaits, pause behavior, sensor morph playback, final hold/fade, and isolation between living and dead copies.

## Single-saber Sector Trooper

The player uses the Sector Trooper model with independent locomotion and upper-body
attacks. Its compact saber sends out a cyan slash with an outer edge matching actual
reach; range upgrades extend the same collision/visual envelope. Slashes hit after
an animated wind-up and leave a short fading mark at the hit position. The current
level-two upgrade chains two cuts with one saber; dual wielding is deferred.

Local drills: `?survive=1&survivePreview=saber` for base reach and
`?survive=1&survivePreview=saber-range` for blade level 4 plus 1.5× Area.
Both use durable, stationary targets and increased preview-only player health.
Ordinary `?survive=1` uses normal gameplay stats. The seven-clip GLB is in
`public/models/sector-trooper/sector-trooper-saber.glb`.

Saber attacks select the nearest enemy in any direction at wind-up, including
pursuers behind the player. That direction stays committed through impact and is
transported over the Core as the player moves. The torso aims independently of
the running legs. The crescent starts at 90°, widens to 120° at blade level 3 and 150° at
level 4. Its ellipse has a half-width of 80% of its reach; Area and reach upgrades grow both damage and the visible edge together.
The second cut keeps the same frame and covers the opposite side.

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
one saber in the right. Its separate arm layer follows the latest volley, with recoil
and a muzzle flash, during standing, running and saber attacks. Local preview:
`?survive=1&survivePreview=saber-gun`. Weapon damage, spread, speed and cooldowns
are unchanged. The gun remains attached during death; restarting removes it until
the upgrade is acquired again.
