"""Validate, export and save the head with a usable Blender viewport."""
from pathlib import Path
import json
import math

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
assert scene.get("generator") == "sector_trooper_head_v1"
asset = bpy.data.collections["01 | HEAD - editable armor parts"]
meshes = [o for o in asset.objects if o.type == "MESH"]
assert len(meshes) == 16
assert bpy.context.mode == "OBJECT"
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
triangles = 0
bounds = []
for obj in meshes:
    evaluated = obj.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    data.calc_loop_triangles()
    triangles += len(data.loop_triangles)
    for v in data.vertices:
        assert all(math.isfinite(c) for c in v.co), obj.name
        bounds.append(obj.matrix_world @ v.co)
    for tri in data.loop_triangles:
        a,b,c = [data.vertices[i].co for i in tri.vertices]
        assert (b-a).cross(c-a).length > 1e-12, (obj.name, "degenerate triangle")
    evaluated.to_mesh_clear()
assert triangles < 2500, triangles
assert sum(o.name.endswith("amber optic lens") for o in meshes) == 1
assert all(o.type not in {"ARMATURE", "CAMERA", "LIGHT"} for o in asset.objects)
assert bpy.data.images["sector-trooper-reference.png"].packed_file is not None

bpy.ops.object.select_all(action="DESELECT")
for obj in asset.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects["SectorTrooper_Head"]
bpy.ops.export_scene.gltf(
    filepath=str(HERE / "sector-trooper-head.glb"), export_format="GLB",
    use_selection=True, use_active_scene=True, export_apply=True,
    export_animations=False, export_skins=False, export_yup=True,
    export_extras=True, export_cameras=False, export_lights=False,
)

scene.camera = bpy.data.objects["TROOPER CAM | Hero"]
scene.render.resolution_x = scene.render.resolution_y = 1200
scene.cycles.samples = 64
scene.render.filepath = str(HERE / "head-preview.png")
for obj in bpy.data.collections["02 | STUDIO - cameras and lights"].objects:
    obj.hide_set(obj.type != "LIGHT")
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = bpy.data.objects["SectorTrooper_Head"]
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.region_3d.view_perspective = "CAMERA"
            space.region_3d.view_camera_zoom = 8
            space.overlay.show_overlays = False
            space.shading.type = "MATERIAL"
            space.shading.use_scene_lights = True
            space.shading.use_scene_world = True
scene["head_triangle_count"] = triangles
scene["reference_notes"] = "Front silhouette and amber accents matched to supplied concept. Rear is inferred."
stats = json.loads((HERE / "head-metadata.json").read_text())
stats.update({"triangles":triangles,"validation":"PASS",
              "bounds_min":[min(v[i] for v in bounds) for i in range(3)],
              "bounds_max":[max(v[i] for v in bounds) for i in range(3)],
              "glb_bytes":(HERE / "sector-trooper-head.glb").stat().st_size})
stats['helmet_width_m']=stats['bounds_max'][0]-stats['bounds_min'][0]
if scene.get('head_profile_revision')==2:
    assert bpy.data.images['sector-trooper-head-detail-reference.png'].packed_file
    stats.update({'reference':'sector-trooper-head-detail-reference.png',
                  'profile_revision':2,'body_preserved_during_refinement':True,
                  'notes':['Single amber eye and offset stripe are intentional',
                           'Continuous side flare and aligned cheek returns follow the detailed head study',
                           'Hidden rear surfaces are inferred']})
(HERE / "head-metadata.json").write_text(json.dumps(stats,indent=2)+"\n")
# Keep preview iterations out of the asset folder; the preceding Lancer state
# was backed up separately before creating this scene.
old_save_version = bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "sector-trooper-head.blend"), compress=True)
finally:
    bpy.context.preferences.filepaths.save_version = old_save_version
result = stats
