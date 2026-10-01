# Sector Trooper — legs and boots

Built in the live Blender scene through Blender Lab MCP, using the supplied
front and side concept and the supplied detailed leg study. The same authoring file is saved at
`../head/sector-trooper-head.blend`. The new collection is
`05 | LEGS - editable armor and joints` under `SectorTrooper_Legs`.

Each leg has a fitted black core, faceted ivory thigh armor, an exposed knee
joint with a dark guard and amber triangle, notched shin armor, an ankle seal,
and a broad boot with a charcoal toe and flat sole. Each boot now has a
separate faceted heel cup, recessed black ankle seam, stepped ivory instep,
thin ivory toe lip, raised charcoal toe bumper, and beveled heel and forefoot
sole sections, following enlarged front and side views of the original.
The thigh axes are more upright, with flatter knee cutouts, gently tapered
calves and longer shin cuffs. The knee triangles use painted gold vertex colors.
The feet turn outward by eight degrees. Following review, each complete leg
sits 24 reference pixels (6.25 cm) farther inward than the initial stance,
closing the thigh gap while keeping the knees and boots aligned.
Armor shells have editable wall-thickness modifiers; joints
and armor pieces remain separate. Hip, knee and ankle pivot coordinates are
stored as object properties for later rigging.

The approved head, torso and thin shoulder shells were preserved and checked
by a geometry, transform, material and wall-thickness signature. Hidden rear
leg surfaces are inferred from the reference. Both arms have since been added
in `../arms/`, and the complete character is now rigged as described in `../rig/`.

## Files and measured geometry

- `sector-trooper-model.glb`: the current head, torso, legs and arms together;
  6,680 triangles, 71 mesh pieces and six shared materials. Legs and boots
  contribute 1,982 triangles. It contains a skin, Walk, Run and Rig_Check animations,
  with no cameras or lights.
- `legs-front.png`, `legs-preview.png`, `legs-side.png`: close lower-body
  inspection renders with the revised profiles and closer stance.
- `sector-trooper-leg-detail-reference.png`: the supplied detailed leg study,
  also packed into the authoring file as a hidden reference.
- `figure-preview.png`, `figure-front.png`, `figure-side.png`, `figure-rear.png`:
  full-height Cycles inspection renders.
- `boot-preview.png`, `boot-front.png`, `boot-side.png`: close inspection
  renders of the right boot. These temporarily hide the far leg and use a low
  fill light to show the small bevels; both changes are limited to rendering.
- `legs-metadata.json`: evaluated counts, bounds and preservation checks.
- The authoring `.blend` retains the packed original reference and the previous
  head and bust inspection cameras, with full-height figure, lower-body and
  close boot cameras. The saved viewport shows the rigged Run animation;
  the lower-body cameras remain available for leg inspection.

The scale remains 384 reference pixels per meter, with the chin at Z=0 and
forward along -Y. Total height is approximately 1.883 m; the flat soles meet
Z=-1.265625 m. A later game export can move the root to ground level.

## Scripts

Run `build_legs.py` through MCP with `runpy.run_path` to add the legs. It refuses
to replace an existing leg collection without `REPLACE_LEGS=True`. Save manual
leg edits separately before rebuilding.

Before rigging, `finish_legs.py` validates finite vertices, triangle areas, budget,
ground height, packed reference and unchanged upper body; export the current
model and saves the same `.blend`. For the current rigged file, use
`../rig/finish_rig.py`; the static finish script refuses to overwrite the skin.
`../arms/finish_arms.py`
adds arm validation before invoking it. The older head and torso finish scripts
export their respective subsets.

Run `render_legs.py` in a separate background Blender process to generate the
four previews while leaving the live editing session available.

`refine_leg_spacing.py` applies the reviewed stance to an existing leg collection
without rebuilding meshes. It shares the builder's spacing helper and stores
the applied inset, so rerunning it does not accumulate an additional shift.

`build_leg_segments.py` contains the thigh, knee and shin profiles shared by
the main builder and `refine_leg_profile.py`. The refinement replaces only
those segments while preserving the applied stance, boots, ankle seals,
upper body and existing camera framing. `render_leg_profile.py` produces the
three lower-body inspection renders in a background process.

`build_boots.py` holds the boot construction shared by the leg generator and
`refine_boots.py`. The latter replaces only boot parts while preserving the
current stance, other geometry, transforms and existing figure cameras.
`render_boots.py` creates the close inspection renders in a background process.

To save with the viewport focused on the boot, run `finish_legs.py` with
`init_globals={"VIEW_CAMERA": "Boot Hero", "VIEW_SIZE": (1200, 1000),
"VIEW_OUTPUT": "boot-preview.png"}`. Its default remains the full figure.
