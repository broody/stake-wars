# Sector Trooper — head study

Modeled in the live Blender 5.2.1 session through the official Blender Lab MCP.
The original `sector-trooper-reference.png` and the newer detailed
`sector-trooper-head-detail-reference.png` are preserved unchanged and packed
inside the Blender file. The current head-only outputs remain here; the same
`.blend` file also contains the torso and legs in separate collections. See
`../legs/README.md` for the current figure and updated previews, or
`../torso/README.md` for the earlier bust export.

## Files

- `sector-trooper-head.blend`: editable shell, brow, cheeks, visor, stripe,
  single amber optic, and neck socket; studio lights and five inspection cameras.
- `sector-trooper-head.glb`: head only, with thickness modifiers evaluated;
  1,590 triangles, 16 separate mesh pieces and six materials.
- `head-preview.png`: three-quarter render.
- `head-front.png`: orthographic front.
- `head-side.png`: three-quarter side comparable to the supplied side concept.
- `head-profile.png`: strict orthographic profile for inspecting depth.
- `build_head.py`: construction parameters and exact stripe clipping.
- `refine_head_profile.py`: current crown, flare and cheek profile refinement.
- `finish_head.py`: geometry checks, selected-asset GLB export, and Blender save.
- `finish_head_revision.py`: validates the preserved body, exports the head,
  refreshes preservation signatures, and updates the full-figure GLB and save.
- `render_head.py`: reproducible Cycles previews.
- `head-metadata.json`: measured geometry and export information.

## Reference decisions

The detailed head reference guides the current 268:237 width-to-height ratio.
A narrower upper crown ring, continuous side flare and aligned cheek returns
give the helmet a more uniform silhouette. Broad cheek facets replace the
previous smaller ridges. The stripe is clipped again to the updated crown
triangles. The overhanging brow, V opening and single eye retain their placement.
The eye is on the viewer's left in the front view; the stripe is on the viewer's
right. Neither is mirrored.

The two supplied views are illustrative rather than perfectly consistent
orthographic projections. Front proportions take priority; rear curvature and
hidden interior surfaces are inferred. The additional profile render shows the
actual 3D interpretation. The GLB in this folder is head-only. The combined
authoring file includes the torso and legs; it has no rig or animation yet.

The helmet is approximately 0.698 m wide and 0.617 m high, before the small neck
socket. It uses Blender Z up / -Y forward, exporting to glTF Y up / +Z forward.
The root is at the neck attachment. Overall scale can be adjusted when building
the body.

## Editing and verification

The named armor parts remain separate with non-destructive wall thickness.
Vertex colors provide subtle ivory facet variation without raster textures.
The orange stripe is geometry clipped to the crown faces, with outward normals
for game-renderer backface culling. The source reference collection is hidden
by default; unhide it in the Outliner to view the original sheet.

Through MCP, run the scripts with `runpy.run_path`. `build_head.py` creates a
new scene without clearing existing work. To rebuild this generated head only,
pass `init_globals={"REPLACE_GENERATED_SCENE": True}` in a head-only file.
The full-scene rebuild is blocked once a torso is present; edit the approved
head in place in the combined file. Rebuilding replaces the generated head's
parts, so save manual edits separately first. In the combined file, run
`refine_head_profile.py`, then `finish_head_revision.py`. The refinement is
idempotent and retains the torso, legs, camera framing and lights. Run
`render_head.py` in background Blender for the four PNGs; it temporarily hides
the body for isolated head renders and restores its render visibility afterward.

Validation checks finite vertices, non-degenerate evaluated triangles, one
optic, the triangle budget, a packed source, and a head-only export. The GLB was
also parsed independently to confirm 1,590 triangles, six materials, no raster
textures, no camera/light objects, and no animation or skin data.

The open Lancer session was saved to an external backup before this study; its
tracked files and the game runtime were not changed.
