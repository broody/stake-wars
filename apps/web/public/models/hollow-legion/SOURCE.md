# Hollow Legion assets

`mite.glb` and `mite-instanced.glb` are original procedural Blender interpretations of the user-provided Stake Wars / Hollow Legion Mite concept.

The isolated modeling reference was made with the built-in image generation tool. The mesh, mechanical rig, solid PBR materials, vertex colors, and movement/attack animations were authored in Blender through Blender Lab MCP; no third-party models or textures are included.

Editable project, renders, source scripts, exact reference prompt, and validation notes: [`docs/concepts/core-survivors/mite`](../../../../../docs/concepts/core-survivors/mite/README.md).

Both exports have **394 triangles and two material primitives**, reduced from the first model's 4,972 triangles and five primitives. The graphite armor and simple joints share vertex colors; the red visor remains emissive. No textures are required.

- `mite-instanced.glb` — 31,584 bytes; static rest pose, no skin or animation. Intended for two shared instanced batches when rendering large swarms.
- `mite.glb` — 95,112 bytes; the same geometry with ten bones, a two-second `Idle`, one-second `Walk`, half-second `Run`, and 1.25-second `LeapAttack`. Walk and Run play in place: at normal playback speed, translate the actor forward at 0.30 m/s or 1.008 m/s respectively. LeapAttack carries Root motion 1.2 metres forward (+Z), with a 0.18-metre vertical arc and an approximately 34-degree nose-first attack pitch; play once and retain its landing displacement.

glTF is Y-up and the Mite faces +Z. The URL preview uses the rigged export for GPU-instanced Run playback; see [enemy swarm controls](../../../../../docs/local-previews/enemy-swarms.md). Combat integration remains future work.

## Lancer

`lancer.glb` and `lancer-instanced.glb` interpret the Lancer from the same user-provided Hollow Legion concept. The isolated reference was created with the built-in image generation tool. The procedural Blender mesh uses broad flat facets, vertex colors, two materials, and no textures or third-party models.

- `lancer.glb` — 722 triangles, 17 bones, Idle (2 s), Walk (1.333 s), Run (0.667 s), and a Muzzle attachment bone; 137,340 bytes.
- `lancer-instanced.glb` — the same geometry in a static pose, without skin or animation; 57,428 bytes.

Lancer is approximately 1.918 m tall and faces +Z in glTF. The integrated cannon replaces its right hand, and its enlarged left claw improves readability. Walk and Run play in place at authored travel speeds of 0.70 m/s and 2.70 m/s. The URL preview uses GPU-instanced Run playback; firing animations and projectile logic remain future work.

Editable Blender project, actual renders, generated reference, exact prompt, source scripts, and validation: [`docs/concepts/core-survivors/lancer`](../../../../../docs/concepts/core-survivors/lancer/README.md).
