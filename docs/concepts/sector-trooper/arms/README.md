# Sector Trooper — arms

Both arms were built through Blender Lab MCP in the existing authoring file,
`../head/sector-trooper-head.blend`, using the supplied front/top arm study.
The approved head, vest, shoulder pads, pelvic armor, legs and boots are unchanged.

Each arm has a short charcoal upper arm, exposed elbow, one tapered ivory
forearm guard, wrist seal and simple dark glove. Each glove forms a relaxed fist,
with four fingers curled toward the palm and the thumb tucked across their
outside. The faceted shapes omit knuckle plates and small decorative details.
The rest pose is a T-pose with closed hands. The arms are bound to the complete
rig described in `../rig/`; each hand moves as a unit with no finger bones.

The forearm guards retain an editable 2.5-reference-pixel wall thickness.
The new collection is `06 | ARMS - editable armor and gloves`, parented to
`SectorTrooper_Arms`. Existing shoulder pads remain in the torso collection.

## Geometry and files

- Both arms: 1,240 triangles, 10 mesh objects; 620 triangles per arm.
- Each glove: 280 triangles, one mesh object containing palm and simple digits.
- Full character: 6,680 triangles, 71 mesh objects, six shared materials.
- `../legs/sector-trooper-model.glb`: current complete skinned figure with the
  Walk, Run and Rig_Check clips, without cameras or lights. Height remains 1.883 m.
- `arms-front.png`, `arms-top.png`, `arms-preview.png`: isolated arm renders.
- `hands-run-closeup.png`, `hands-palm-closeup.png`: fist inspection views.
- `hands-check.json`: hand-only geometry, topology, weights and animation checks.
- `../legs/figure-*.png`: full-body views using wider T-pose cameras.
- `sector-trooper-arm-detail-reference.png`: original supplied arm study,
  also packed into the authoring file as a hidden reference.
- `arms-metadata.json`: measured counts and preservation checks.

## Scripts

`glove_geometry.py` supplies the relaxed fist geometry to the arm builder.
`refine_hands.py` updates the existing two gloves through MCP, preserving their
palm/wrist vertices, topology, materials, skin weights and all animation keys.
It updates only the two hand entries in the rig's rest baseline and refreshes
the approved geometry signature after checking that the rest of the scene is
unchanged. Use `../rig/finish_rig.py` afterward to export and save.

`render_hands.py` renders closeups in a background process. The palm inspection
uses temporary visibility and lighting changes only in that process.

Run `build_arms.py` via MCP to add arms. It requires `REPLACE_ARMS=True` before
replacing an existing arm collection; preserve manual edits before rebuilding.
It changes only this collection and creates dedicated inspection cameras,
leaving all previous body geometry and comparison cameras unchanged.

Before rigging, `finish_arms.py` verifies the body preservation signature, mirrored arm
geometry, closed evaluated meshes and triangle budget. It invokes
`../legs/finish_legs.py` to export the complete figure and save the same `.blend`.
For the current rigged file, use `../rig/finish_rig.py` instead. The saved viewport
now shows the Run action using its dedicated preview camera.

Run `render_arms.py` in a background Blender process for the three detail views.
It temporarily hides the rest of the figure and restores all render visibility
afterward. Run `../legs/render_legs.py` for the four full-body renders.
