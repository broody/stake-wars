# Sector Trooper — torso study

Built through Blender Lab MCP beneath the approved flared helmet. The torso is
saved in the same authoring file: `../head/sector-trooper-head.blend`. It lives
in the separate `04 | TORSO - editable armor parts` collection.

The collar, chest, side armor and back are now one welded vest shell, following
`sector-trooper-vest-detail-reference.png`. It has shared edges around the neck,
two circular arm openings, a broad faceted chest and a continuous lower hem.
The shell has an editable 3-reference-pixel wall; its evaluated geometry is
manifold. The charcoal undersuit and thin curved shoulder shells with triangular
sector emblems are preserved. The shoulder
armor has an editable 3-reference-pixel wall (7.8 mm at the study scale), with
open ends and underside instead of a filled block. Shoulder sockets provide
attachment points for the next arm modeling stage. Legs and boots have since
been added in another collection; see `../legs/README.md` for the current
figure export and previews. Arms, rig and animations are not built yet.

The front groin guard and rear culet are separate armor plates suspended from
a continuous charcoal belt with four raised ivory keepers. The rear plate
covers the buttocks with broad facets and a subtle central crease. The hips
and underside are open; there are no rigid side connections or crotch bridge.
The three pieces are grouped under `SectorTrooper_PelvicArmor`. Both plates
clear the existing thigh armor in the current modeling pose. The rear design
continues the supplied armor language.

The front silhouette follows the supplied concept's proportions, using its
existing coordinate system (384 pixels/m, Z up, -Y forward, chin at Z=0). Rear
torso details are inferred from the visible armor language. The approved head
geometry and transforms were checked by hash before and after construction.
The vest refinement additionally checks that the legs, shoulder hardware,
waist, original cameras and lighting remain unchanged.

## Outputs

- `sector-trooper-bust.glb`: head and torso, 3,458 triangles total; 1,590 in the
  head and 1,868 in the torso. Thirty-one mesh pieces share the existing six
  materials, with no raster textures. This is an editable study export, not a
  batched or rigged gameplay asset.
- `torso-preview.png`, `torso-front.png`, `torso-side.png`, `torso-rear.png`:
  Cycles renders from the new bust cameras.
- `vest-preview.png`, `vest-front.png`, `vest-side.png`, `vest-rear.png`:
  close torso renders. The helmet, legs and shoulder hardware are temporarily
  hidden for inspecting the vest; these visibility changes are not saved.
- `pelvis-front.png`, `pelvis-preview.png`, `pelvis-side.png`, `pelvis-rear.png`,
  `pelvis-rear-preview.png`: close views of the belt-suspended front and rear plates,
  with the actual waist and thighs visible for checking the fit.
- `sector-trooper-vest-detail-reference.png`: the supplied front/side vest study,
  preserved unchanged and packed into the authoring file.
- `torso-metadata.json`: measured counts, geometry validation, and the approved
  head signature.

## Scripts

Run the scripts in Blender through MCP using `runpy.run_path`:

1. `build_torso.py` adds the torso to the current approved head scene. To replace
   an existing generated torso, pass `init_globals={"REPLACE_TORSO": True}`.
   Save any manual torso edits before doing this.
2. `finish_torso.py` verifies finite vertices, non-degenerate evaluated
   triangles, the triangle budget, packed reference, and unchanged head;
   exports the selected head and torso; and saves the same `.blend` file.
3. `render_torso.py` renders the four bust views.

For the current connected vest, run `refine_unified_vest.py`, then
`finish_vest_revision.py`. The refinement replaces only the eight former vest
plates (or the previous unified vest on a repeat run). It verifies one connected
surface with exactly four boundary loops: neck, two arms and waist. The finish
script verifies that the thickness modifier closes those boundaries, validates
the untouched parts, exports the bust and full figure, and saves the same file.
Run `render_vest.py` in background Blender for the isolated detail views.

For the pelvic armor, run `refine_pelvic_armor.py`, then
`finish_pelvic_revision.py`. The refinement replaces only the former belt,
front guard and belt blocks (or the previous pelvic assembly on a repeat run).
It builds three separate mesh components: belt, front plate and rear plate.
The finish script checks each component's closed thickness walls, no overlap
with either thigh armor mesh in the current pose, and preservation of the vest,
head, shoulders and legs. It exports the bust and full figure and saves the same
file, focused on the front pelvis inspection camera. `render_pelvic_armor.py`
renders five close views in a background Blender process. The assembly is
616 evaluated triangles: 480 in the belt, 32 in the front plate and 104 in the rear.

`refine_shoulder_pads.py` replaces only the two shoulder shells and their
projected emblems, using the builder's shared geometry helpers. It verifies
that other meshes, transforms and camera settings remain unchanged. Run
`finish_torso.py` afterwards to validate, export and save the revision.

The clipped shoulder graphics follow the actual front-cap triangles and have
outward-facing normals for game-renderer backface culling. The unified vest,
pelvic plates and shoulder shells retain editable wall-thickness modifiers.
The pelvic assembly is parented to `SectorTrooper_Torso`, alongside the other
torso elements; the existing head root is unchanged.

The original head-only GLB and preview images remain available in `../head`.
The full-scene head generator refuses to rebuild a scene containing this torso.
