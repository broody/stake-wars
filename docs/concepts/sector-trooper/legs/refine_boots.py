"""Replace only the boot pieces, preserving approved spacing and other geometry."""
from pathlib import Path
import ast
import hashlib
import json
import random
import runpy
import bpy
import bmesh
from mathutils import Vector

HERE=Path(__file__).resolve().parent
S=1/384
TAG="sector_trooper_legs_v1"
assert bpy.data.filepath.endswith("/sector-trooper/head/sector-trooper-head.blend")
if bpy.context.mode!="OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
asset=bpy.data.collections["05 | LEGS - editable armor and joints"]
root=bpy.data.objects["SectorTrooper_Legs"]
assert asset.get("generator")==TAG
old_names={"LEGS | "+s+" "+n for s in ["right","left"]
           for n in ["09 broad charcoal sole","10 armored boot and toe"]}
targets=[o for o in asset.objects if o.name in old_names or o.get("model_part")=="boot"]
assert len(targets)>=4
excluded={o.name for o in targets}


def unchanged_signature():
    values=[]
    for obj in sorted(bpy.data.objects,key=lambda o:o.name):
        if obj.name in excluded or obj.get("model_part")=="boot" or obj.name.startswith("TROOPER CAM | Boot "):
            continue
        record=[obj.name,tuple(v for row in obj.matrix_world for v in row)]
        if obj.type=="MESH":
            record.extend([[tuple(v.co) for v in obj.data.vertices],
                           [tuple(p.vertices) for p in obj.data.polygons],
                           [m.name for m in obj.data.materials],
                           [[tuple(v.color) for v in a.data] for a in obj.data.color_attributes]])
        elif obj.type=="CAMERA":
            record.extend([obj.data.lens,obj.data.ortho_scale])
        values.append(record)
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


bpy.context.view_layer.update()
before=unchanged_signature()
saved={}
for label in ["right","left"]:
    source=bpy.data.objects["LEGS | "+label+" 09 broad charcoal sole"]
    assert source.parent==root
    saved[label]={"basis":source.matrix_basis.copy(),"inverse":source.matrix_parent_inverse.copy(),
                  "inset":float(source["stance_inset_px"]),
                  "pivots":{k:list(source[k]) for k in ["hip_pivot_px","knee_pivot_px","ankle_pivot_px"]}}
for obj in targets:
    assert len(obj.users_collection)==1
    data=obj.data
    bpy.data.objects.remove(obj,do_unlink=True)
    if not data.users:
        bpy.data.meshes.remove(data)

# Load only geometry helpers; do not execute the whole leg generator.
parts=[]
ivory=bpy.data.materials["TROOPER | warm ivory armor"]
black=bpy.data.materials["TROOPER | charcoal seals"]
tree=ast.parse((HERE/"build_legs.py").read_text())
definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {"rgba","mesh","loft"}]
assert len(definitions)==3
exec(compile(ast.Module(body=definitions,type_ignores=[]),str(HERE/"build_legs.py"),"exec"))
helpers=runpy.run_path(str(HERE/"build_boots.py"),init_globals={
    "mesh":mesh,"loft":loft,"S":S,"ivory":ivory,"black":black,
})
for side,label in [(-1,"right"),(1,"left")]:
    created=helpers["build_boot"](side,label)
    for obj in created:
        obj.parent=root
        obj.matrix_parent_inverse=saved[label]["inverse"]
        obj.matrix_basis=saved[label]["basis"]
        obj["stance_inset_px"]=saved[label]["inset"]
        for key,value in saved[label]["pivots"].items():
            obj[key]=value
helpers["add_boot_cameras"](bpy.data.collections["02 | STUDIO - cameras and lights"],saved["right"]["inset"])
bpy.context.view_layer.update()
assert unchanged_signature()==before,"An object outside the boots changed"
result={"boot_meshes":len(parts),"other_geometry_and_stance_preserved":True,
        "features":["separate heel armor","recessed ankle seam","stepped instep",
                    "beveled sole layers","raised toe bumper","ivory toe lip"]}
