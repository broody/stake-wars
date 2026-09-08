# Lancer — Hollow Legion / 02

A low-poly interpretation of the narrow ranged sentinel from the supplied Hollow Legion concept sheet. The slanted wedge helmet, small scarlet face sensor, pale shoulder/knee plates, long legs, and oversized right-arm cannon preserve its identity. Large flat facets and simple joint shapes keep the silhouette readable without modeled bevels or small mechanical details.

![Lancer Blender render](lancer-preview.png)

## Files

- `lancer.blend` — separate Blender 5.2 authoring project, with the model, rig, studio, and packed reference.
- `../../../../apps/web/public/models/hollow-legion/lancer.glb` — rigged export with Idle; 104,860 bytes.
- `../../../../apps/web/public/models/hollow-legion/lancer-instanced.glb` — static alternative for shared instanced batches; 57,428 bytes.
- `lancer-reference.png` — isolated modeling reference created with the built-in image generation tool, based on the original sheet.
- [reference-prompt.md](reference-prompt.md) — exact generation prompt and method. The extra views interpret the original character; they are not precise original blueprints.
- `lancer-preview.png`, `lancer-front.png`, `lancer-side.png`, `lancer-top.png` — actual renders of the mesh.
- `build_lancer.py`, `render_lancer.py` — reproducible Blender construction and rendering scripts.
- `validate_lancer.mjs`, `validation.json`, `asset-stats.json` — game-loader checks and measured asset data.

## Model and rig

| Property         | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| Triangles        | 722                                                        |
| Materials        | 2: vertex-colored armor and emissive red sensors           |
| Blender meshes   | One rigid-skinned mesh                                     |
| glTF primitives  | Two material primitives                                    |
| Rig              | 17 bones, including a Muzzle attachment bone               |
| Rest dimensions  | Approximately 0.894 m wide × 0.493 m deep × 1.918 m high   |
| Ground clearance | 2 mm under the feet                                        |
| Orientation      | Blender Z-up/front −Y; glTF Y-up/front +Z                  |
| Animation        | Idle, 2 seconds, with planted feet                         |
| Textures         | None; the reference image is only in the authoring project |

The skeleton contains Root, Hips, Spine, Head, upper/lower/foot bones for both legs, upper/forearm bones for both arms, the left hand, Cannon, and Muzzle. Each rigid component has one full-weight bone assignment. The cannon replaces the right hand. The left hand has two simple pincer fingers sharing the hand bone.

`Muzzle` is located at the end of the cannon, at approximately (−0.385, 0.560, 0.300) in the glTF rest pose. Its local bone direction follows the barrel. It is available as a future projectile/effect attachment; no projectile or firing logic is implemented.

## Preview and edit

The active scene is `LANCER | Studio`. Press Spacebar over the viewport to preview Idle. Frames 0–47 form the loop; frame 48 is the matching exported closing key. Select `Lancer` and enter Pose Mode to edit the limbs, head, or cannon. The packed reference is in the hidden `03 · References — packed image` collection.

This first pass contains the model, complete mechanical rig, and subtle idle. Walking, running, aiming/firing animations, collisions, and gameplay integration have not been added yet.

Use the rigged GLB for animation. The static GLB has no bones or clips and can share an armor `InstancedMesh` and a sensor `InstancedMesh` across many Lancers. Actual animated swarm rendering and target-device frame rate still require gameplay integration and benchmarking.

## Rebuild and validate

Use Blender 5.2 and install the repository's Node dependencies with `pnpm install` before running the Three.js validation script. The commands below show Blender's macOS application path; use your Blender executable on other platforms.

The builder deliberately runs in a fresh background Blender process, so it does not clear the currently open authoring project. From the repository root on this Mac:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python docs/concepts/core-survivors/lancer/build_lancer.py

/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  docs/concepts/core-survivors/lancer/lancer.blend \
  --python-exit-code 1 \
  --python docs/concepts/core-survivors/lancer/render_lancer.py

node docs/concepts/core-survivors/lancer/validate_lancer.mjs
```

Both GLBs were loaded using the repository's Three.js `GLTFLoader`. Checks confirm 722 triangles, two materials, matching physical bounds, vertex colors, emissive sensors, valid coordinates, the 17-bone rig and muzzle socket, a matching Idle loop seam, and feet that remain planted throughout the idle. The static export has no skin or animations and its geometry can be used in instanced batches. Hero, front, side, and top views were visually inspected.
