# Hollow Legion assets

`mite.glb` and `mite-instanced.glb` are original procedural Blender interpretations of the user-provided Stake Wars / Hollow Legion Mite concept.

The isolated modeling reference was made with the built-in image generation tool. The mesh, mechanical rig, solid PBR materials, vertex colors, and movement/attack animations were authored in Blender through Blender Lab MCP; no third-party models or textures are included.

Editable project, renders, source scripts, exact reference prompt, and validation notes: [`docs/concepts/core-survivors/mite`](../../../../../docs/concepts/core-survivors/mite/README.md).

Both exports have **394 triangles and two material primitives**, reduced from the first model's 4,972 triangles and five primitives. The graphite armor and simple joints share vertex colors; the red visor remains emissive. No textures are required.

- `mite-instanced.glb` — 31,584 bytes; static rest pose, no skin or animation. Intended for two shared instanced batches when rendering large swarms.
- `mite.glb` — 106,308 bytes; the same geometry with ten bones, a two-second `Idle`, one-second `Walk`, half-second `Run`, 1.25-second `LeapAttack`, and 1.25-second `Defeated`. Walk and Run play in place: at normal playback speed, translate the actor forward at 0.30 m/s or 1.008 m/s respectively. LeapAttack carries Root motion 1.2 metres forward (+Z), with a 0.18-metre vertical arc and an approximately 34-degree nose-first attack pitch; play once and retain its landing displacement.

glTF is Y-up and the Mite faces +Z. The URL preview uses the rigged export for GPU-instanced Run playback; see [enemy swarm controls](../../../../../docs/local-previews/enemy-swarms.md). Core Survivors plays `Defeated` once for Mites, Skitters, and Volt Mites: collision and combat participation end immediately, the fallen pose holds briefly, and the translucent remains fade out and are removed after 1.8 seconds. The local `?survive=1&survivePreview=mite-defeat` drill repeats the animation.

## Lancer

`lancer.glb` and `lancer-instanced.glb` interpret the Lancer from the same user-provided Hollow Legion concept. The isolated reference was created with the built-in image generation tool. The procedural Blender mesh uses broad flat facets, vertex colors, two materials, and no textures or third-party models.

- `lancer.glb` — 722 triangles, 17 bones, Idle (2 s), Walk (1.333 s), Run (0.667 s), Defeated (1.25 s), and a Muzzle attachment bone; 154,932 bytes.
- `lancer-instanced.glb` — the same geometry in a static pose, without skin or animation; 57,428 bytes.

Lancer is approximately 1.918 m tall and faces +Z in glTF. The integrated cannon replaces its right hand, and its enlarged left claw improves readability. Walk and Run play in place at authored travel speeds of 0.70 m/s and 2.70 m/s. The URL preview uses GPU-instanced Run playback; Core Survivors also plays the bent-over Defeated clip on death for Lancers and Captains, removes collision immediately, and fades the remains away after 1.8 seconds.

Editable Blender project, actual renders, generated reference, exact prompt, source scripts, and validation: [`docs/concepts/core-survivors/lancer`](../../../../../docs/concepts/core-survivors/lancer/README.md).

## Bulwark

`bulwark.glb` is the original procedural Blender interpretation of the user-provided Bulwark concept, matching Mite and Lancer's faceted armor, vertex colors, and emissive red sensors. No third-party models or textures are included.

The export has 892 triangles (808 body, 84 shield), 18 bones, and four skinned material primitives sharing two materials. The shield follows the left-hand equipment socket. glTF is Y-up, facing +Z. Walk (1.667 s, authored travel speed 0.375 m/s) and Run (1 s, 1.316 m/s) are in place. Core Survivors uses Walk at scale 0.25 and adjusts cadence to movement speed. ShieldThrust is a 1.75-second one-shot attack with 1.2 m of forward Root motion, impact at 0.75 s, and retained landing displacement. The game samples this movement into its simulation and strips it from GPU poses. Chasing Bulwarks play the attack; formation units keep walking.

The editable Blender project, procedural scripts, references, renders, and validation notes are in `docs/concepts/core-survivors/bulwark` in the main authoring checkout; this worktree includes the runtime GLB.

Bulwark also includes `Defeated` (1.25 s): sixteen rigid chunks tumble apart, including a detached shield, then hold the debris pose. Core Survivors immediately removes its collision and damage on death, then fades the debris out by 1.8 seconds. The mesh and earlier clips are preserved; the rig permits independent bone translations for the breakup.


## Warden

`warden.glb` is the original authored Warden asset from the shared Blender work: 1,203 equipped triangles, 25 rigid bones, four primitives sharing two materials, and no textures. It includes Guard, Walk (1.667 s), Run (1 s), StaffSlam (2 s, impact 26/24 s), and Defeated (1.75 s). Defeated also carries SensorsOff morph tracks that extinguish its red inserts at 1.25 s. No third-party meshes or textures are included.

Core Survivors uses the authored model at scale 0.30, with movement-driven playback, a locked staff-slam warning/damage area, and a harmless kneeling corpse that fades out at 2.5 s. Walk, run, slam, and death preserve the closed staff grip. The original source project and reproducible authoring scripts are in the primary checkout's `docs/concepts/core-survivors/warden` directory.
