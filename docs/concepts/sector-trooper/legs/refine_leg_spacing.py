"""Apply the approved closer thigh spacing without rebuilding any meshes."""
from pathlib import Path
import ast
import bpy

HERE=Path(__file__).resolve().parent
S=1/384
assert bpy.data.filepath.endswith("/sector-trooper/head/sector-trooper-head.blend")
if bpy.context.mode!="OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
legs=bpy.data.collections["05 | LEGS - editable armor and joints"]
assert legs.get("generator")=="sector_trooper_legs_v1"
parts=[o for o in legs.objects if o.type=="MESH"]
bpy.context.view_layer.update()
other_transforms={o.name:o.matrix_world.copy() for o in bpy.data.objects if o not in parts}
mesh_shapes={o.name:[tuple(v.co) for v in o.data.vertices] for o in parts}
camera_settings={o.name:(o.data.lens,o.data.ortho_scale) for o in bpy.data.objects if o.type=="CAMERA"}
tree=ast.parse((HERE/"build_legs.py").read_text())
definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="set_leg_spacing")
exec(compile(ast.Module(body=[definition],type_ignores=[]),str(HERE/"build_legs.py"),"exec"))
set_leg_spacing(parts,24)
bpy.context.view_layer.update()
assert all(bpy.data.objects[name].matrix_world==matrix for name,matrix in other_transforms.items())
assert all([tuple(v.co) for v in bpy.data.objects[name].data.vertices]==shape for name,shape in mesh_shapes.items())
assert all((bpy.data.objects[name].data.lens,bpy.data.objects[name].data.ortho_scale)==settings
           for name,settings in camera_settings.items())
result={"inward_shift_per_leg_m":24*S,"reduced_pair_spacing_m":48*S,
        "geometry_shapes_unchanged":True,"other_objects_and_cameras_unchanged":True}
