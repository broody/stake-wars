"""Replace only the shoulder armor and painted marks in the live authoring file."""
from pathlib import Path
import ast
import hashlib
import json
import math
import random

import bpy
import bmesh
from mathutils import Vector

HERE=Path(__file__).resolve().parent
assert bpy.data.filepath.endswith("/sector-trooper/head/sector-trooper-head.blend")
if bpy.context.mode!="OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()

names={"TORSO | "+number+" "+side+" "+suffix
       for side in ("right","left")
       for number,suffix in [("13","shoulder cap"),("14","triangular shoulder inset"),("15","sector emblem")]}
assert all(name in bpy.data.objects for name in names)
root=bpy.data.objects["SectorTrooper_Torso"]
asset=bpy.data.collections["04 | TORSO - editable armor parts"]
assert asset.get("generator")=="sector_trooper_torso_v1"


def preserved_signature():
    records=[]
    for obj in sorted(bpy.data.objects,key=lambda o:o.name):
        if obj.name in names:
            continue
        record=[obj.name,tuple(v for row in obj.matrix_world for v in row)]
        if obj.type=="MESH":
            record.extend([[tuple(v.co) for v in obj.data.vertices],
                           [tuple(p.vertices) for p in obj.data.polygons],
                           [m.name for m in obj.data.materials],
                           [[tuple(v.color) for v in attr.data] for attr in obj.data.color_attributes]])
        elif obj.type=="CAMERA":
            record.extend([obj.data.type,obj.data.lens,obj.data.ortho_scale])
        records.append(record)
    return hashlib.sha256(json.dumps(records).encode()).hexdigest()


before=preserved_signature()
transforms={name:bpy.data.objects[name].matrix_basis.copy() for name in names}
for name in names:
    obj=bpy.data.objects[name]
    assert obj.parent==root and len(obj.users_collection)==1
    data=obj.data
    bpy.data.objects.remove(obj,do_unlink=True)
    if not data.users:
        bpy.data.meshes.remove(data)

# Execute helper definitions only; the builder's body would replace the torso.
tree=ast.parse((HERE/"build_torso.py").read_text())
helper_names={"rgba","mesh","project_badge","build_shoulder_cap"}
definitions=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in helper_names]
assert len(definitions)==len(helper_names)
env=dict(globals(),S=1/384,TAG="sector_trooper_torso_v1",asset=asset,parts=[],
         ivory=bpy.data.materials["TROOPER | warm ivory armor"],
         black=bpy.data.materials["TROOPER | charcoal seals"])
exec(compile(ast.Module(body=definitions,type_ignores=[]),str(HERE/"build_torso.py"),"exec"),env)
for side,label in [(-1,"right"),(1,"left")]:
    env["build_shoulder_cap"](side,label)
for obj in env["parts"]:
    obj.parent=root
    obj.matrix_basis=transforms[obj.name]
bpy.context.view_layer.update()
assert {obj.name for obj in env["parts"]}==names
assert preserved_signature()==before,"An object outside the shoulder armor changed"

result={"replaced_objects":sorted(names),"other_geometry_and_cameras_unchanged":True,
        "wall_thickness_m":3/384,"construction":"Open curved shoulder shells"}
