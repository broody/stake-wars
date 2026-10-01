# Sector Trooper — Rifle Concept 01

Modeled from the supplied rifle sheet in a new Blender 5.2.1 file using the
live Blender Lab MCP connection. The upper side view controls the silhouette;
depth is inferred from the lower three-quarter view.

The user requested a slightly thinner rifle during modeling. The complete
asset has a 0.90 X scale on `SectorTrooper_Rifle`, reducing its width by 10%.
This remains editable on the root. Current dimensions are approximately
0.979 m long, 0.0965 m wide, and 0.285 m high.

## Files and editing

- `sector-trooper-rifle.blend`: standalone rifle with 43 named editable mesh
  pieces, seven materials, three attachment markers, studio cameras and lights.
- `sector-trooper-rifle.glb`: 2,228 evaluated triangles, including the muzzle
  pockets. No cameras, lights, source images, animation, skin or cutter objects.
- `rifle-reference.png`: unchanged user-supplied concept, also packed into the
  Blender file in the hidden reference collection.
- `rifle-preview.png`, `rifle-side.png`, `rifle-top.png`: renders of the actual
  model at 1600 x 900.
- `rifle-metadata.json`: geometry, dimensions and framing checks.

The main parts remain separate: stock, receiver, foreguard, grip, trigger guard,
power cell, sight, muzzle, painted stripe and small accents. Foreguard windows
and muzzle opening are recessed geometry. Two hidden Boolean cutters in
`04 | CONSTRUCTION - editable pocket cutters` keep the muzzle side pockets
adjustable. Include this collection if appending the editable rifle to another
Blender file; the GLB already contains the evaluated result.

`SectorTrooper_Rifle` is centered on the main grip and parents the geometry,
markers and cutters. The rifle points along Blender -Y, with Z up; the GLB
uses +Z forward and Y up. `ATTACH | Main grip`, `ATTACH | Support hand`, and
`ATTACH | Muzzle` are alignment markers. The prop has not been attached to the
character rig.

The model uses matte ivory facets, charcoal surfaces, an amber paint band and
an emissive status light. Facet variation uses the `ArmorTone` vertex-color
attribute. This is an exterior game prop.

## Reproduction and verification

Use `runpy.run_path` through Blender MCP:

1. `build_rifle.py` builds a new scene and refuses to overwrite an existing
   rifle file. Preserve any manual edits before rebuilding.
2. Open the newly written rifle file.
3. `refine_rifle.py` adds the muzzle pockets and the requested width reduction.
4. `finish_rifle.py` validates, exports and saves a normal standalone file.
5. `render_rifle.py` renders the inspection views.

All evaluated meshes are closed and manifold, vertices are finite, triangles
are non-degenerate, and the three inspection cameras include the entire rifle.
The original character file and game runtime were not edited. The Blender
startup session was preserved in an external backup before the new rifle work.
