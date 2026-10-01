"""Validate and export the current figure, then save the same authoring file."""
from pathlib import Path
import ast
import hashlib
import json
import math
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
assert not bpy.data.objects.get("SectorTrooper_Rig"), "Use ../rig/finish_rig.py to preserve the skeleton and skin export"
assert bpy.context.mode=="OBJECT"
assert bpy.data.filepath.endswith("/sector-trooper/head/sector-trooper-head.blend")
collections=[bpy.data.collections[name] for name in [
    "01 | HEAD - editable armor parts","04 | TORSO - editable armor parts",
    "05 | LEGS - editable armor and joints"]]
assert collections[2].get("generator")=="sector_trooper_legs_v1"
labels=["head","torso","legs"]
arms=bpy.data.collections.get("06 | ARMS - editable armor and gloves")
if arms:
    assert arms.get("generator")=="sector_trooper_arms_v1"
    collections.append(arms)
    labels.append("arms")
tree=ast.parse((HERE/"build_legs.py").read_text())
definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="upper_signature")
exec(compile(ast.Module(body=[definition],type_ignores=[]),str(HERE/"build_legs.py"),"exec"))
signature=upper_signature()
assert signature==scene["approved_upper_signature"],"Approved upper body changed"
bpy.context.view_layer.update()
dg=bpy.context.evaluated_depsgraph_get()
counts={}
bounds=[]
mesh_count=0
for collection,label in zip(collections,labels):
    total=0
    for obj in collection.objects:
        if obj.type!="MESH":
            continue
        mesh_count+=1
        evaluated=obj.evaluated_get(dg)
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        for vertex in mesh.vertices:
            assert all(math.isfinite(v) for v in vertex.co),obj.name
            bounds.append(obj.matrix_world@vertex.co)
        for tri in mesh.loop_triangles:
            a,b,c=[mesh.vertices[i].co for i in tri.vertices]
            assert (b-a).cross(c-a).length>1e-12,(obj.name,"degenerate triangle")
        total+=len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    counts[label+"_triangles"]=total
assert counts["head_triangles"]==scene.get("head_triangle_count",1598)
assert counts["legs_triangles"]<4000
assert bpy.data.images["sector-trooper-reference.png"].packed_file
ground=min(p.z for p in bounds)
assert abs(ground+486/384)<1e-6,"The soles should define the ground plane"

stats=dict(counts,combined_triangles=sum(counts.values()),mesh_count=mesh_count,
           material_count=len({m.name for c in collections for o in c.objects if o.type=="MESH" for m in o.data.materials}),
           head_and_torso_unchanged=True,approved_upper_signature=signature,
           ground_z_m=ground,height_m=max(p.z for p in bounds)-ground,
           validation="PASS",scope=("Head, torso, shoulders, legs, boots and simplified T-pose arms; no rig or animations"
                                   if arms else "Head, torso, shoulders, legs and boots; arms and rig not built yet"))
bpy.ops.object.select_all(action="DESELECT")
for collection in collections:
    for obj in collection.objects:
        obj.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects["SectorTrooper_Legs"]
bpy.ops.export_scene.gltf(
    filepath=str(HERE/"sector-trooper-model.glb"),export_format="GLB",use_selection=True,
    use_active_scene=True,export_apply=True,export_animations=False,export_skins=False,
    export_yup=True,export_extras=True,export_cameras=False,export_lights=False,
)
stats["glb_bytes"]=(HERE/"sector-trooper-model.glb").stat().st_size
scene.camera=bpy.data.objects["TROOPER CAM | "+globals().get("VIEW_CAMERA","Tpose Hero" if arms else "Figure Hero")]
scene.render.resolution_x,scene.render.resolution_y=globals().get("VIEW_SIZE",(1600,1600) if arms else (1200,1600))
scene.render.resolution_percentage=100
scene.render.filepath=str(HERE/globals().get("VIEW_OUTPUT","figure-preview.png"))
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene["character_triangle_count"]=stats["combined_triangles"]
for obj in bpy.data.collections["02 | STUDIO - cameras and lights"].objects:
    obj.hide_set(obj.type!="LIGHT")
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active=bpy.data.objects["SectorTrooper_Legs"]
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
(HERE/"legs-metadata.json").write_text(json.dumps(stats,indent=2)+"\n")
version=bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE.parent/"head/sector-trooper-head.blend"),compress=True)
finally:
    bpy.context.preferences.filepaths.save_version=version
result=stats
