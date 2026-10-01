"""Validate/export the head and torso, and save the SAME authoring .blend."""
from pathlib import Path
import hashlib
import json
import math
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
head=bpy.data.collections["01 | HEAD - editable armor parts"]
torso=bpy.data.collections["04 | TORSO - editable armor parts"]
assert torso.get("generator")=="sector_trooper_torso_v1"
assert bpy.context.mode=="OBJECT"

values=[]
for obj in sorted(head.objects,key=lambda o:o.name):
    values.append((obj.name,tuple(v for row in obj.matrix_world for v in row)))
    if obj.type=="MESH":
        values.append(([tuple(v.co) for v in obj.data.vertices],
                       [tuple(p.vertices) for p in obj.data.polygons],
                       [m.name for m in obj.data.materials]))
signature=hashlib.sha256(json.dumps(values).encode()).hexdigest()
assert signature==scene["approved_head_signature"],"Approved head geometry changed"

bpy.context.view_layer.update()
dg=bpy.context.evaluated_depsgraph_get()
stats={}
bounds=[]
for collection,label in [(head,"head"),(torso,"torso")]:
    total=0
    for obj in collection.objects:
        if obj.type!="MESH":
            continue
        evaluated=obj.evaluated_get(dg)
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        for vertex in mesh.vertices:
            assert all(math.isfinite(c) for c in vertex.co),obj.name
            bounds.append(obj.matrix_world@vertex.co)
        for tri in mesh.loop_triangles:
            a,b,c=[mesh.vertices[i].co for i in tri.vertices]
            assert (b-a).cross(c-a).length>1e-12,(obj.name,"degenerate triangle")
        total+=len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    stats[label+"_triangles"]=total
assert stats["head_triangles"]==scene.get("head_triangle_count",1598)
assert stats["torso_triangles"]<2500
assert bpy.data.images["sector-trooper-reference.png"].packed_file

stats.update({"combined_triangles":sum(stats.values()),"torso_meshes":sum(o.type=="MESH" for o in torso.objects),
              "materials":len({m.name for c in [head,torso] for o in c.objects if o.type=="MESH" for m in o.data.materials}),
              "validation":"PASS","approved_head_unchanged":True,"approved_head_signature":signature,
              "bounds_min":[min(v[i] for v in bounds) for i in range(3)],
              "bounds_max":[max(v[i] for v in bounds) for i in range(3)],
              "scope":"Head, torso, shoulder caps and lower abdominal plate; no limbs, rig or animations"})
bpy.ops.object.select_all(action="DESELECT")
for collection in [head,torso]:
    for obj in collection.objects:
        obj.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects["SectorTrooper_Torso"]
bpy.ops.export_scene.gltf(
    filepath=str(HERE/"sector-trooper-bust.glb"),export_format="GLB",use_selection=True,
    use_active_scene=True,export_apply=True,export_animations=False,export_skins=False,
    export_yup=True,export_extras=True,export_cameras=False,export_lights=False,
)
stats["glb_bytes"]=(HERE/"sector-trooper-bust.glb").stat().st_size
scene.camera=bpy.data.objects["TROOPER CAM | Bust Hero"]
scene.render.resolution_x,scene.render.resolution_y=1200,1440
scene.cycles.samples=64
scene.render.filepath=str(HERE/"torso-preview.png")
scene["character_triangle_count"]=stats["combined_triangles"]
scene["reference_notes"]="Approved flared helmet with reference-based chest, collar, shoulders and waist. Rear torso inferred."
# Close temporary render windows through the UI, not inside the MCP callback;
# destroying a window while its event handler is active can terminate Blender.
for obj in bpy.data.collections["02 | STUDIO - cameras and lights"].objects:
    obj.hide_set(obj.type!="LIGHT")
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active=bpy.data.objects["SectorTrooper_Torso"]
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type=="VIEW_3D":
            space=area.spaces.active
            space.region_3d.view_perspective="CAMERA"
            space.region_3d.view_camera_zoom=0
            space.overlay.show_overlays=False
            space.shading.type="MATERIAL"
            space.shading.use_scene_lights=True
            space.shading.use_scene_world=True

stats["blend_file"]="../head/sector-trooper-head.blend"
(HERE/"torso-metadata.json").write_text(json.dumps(stats,indent=2)+"\n")
version=bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE.parent/"head/sector-trooper-head.blend"),compress=True)
finally:
    bpy.context.preferences.filepaths.save_version=version
result=stats
