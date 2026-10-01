"""Update thigh/shin profiles while retaining the boots, ankle seals and upper body."""
from pathlib import Path
import ast
import hashlib
import json
import math
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
suffixes=["01 hip and thigh undersuit","02 faceted thigh armor","03 knee joint",
          "04 charcoal knee guard","05 amber knee inlay","06 lower leg undersuit","07 notched shin armor"]
names={"LEGS | "+s+" "+n for s in ["right","left"] for n in suffixes}
assert all(name in bpy.data.objects for name in names)


def preserved_signature():
    values=[]
    for obj in sorted(bpy.data.objects,key=lambda o:o.name):
        if obj.name in names or obj.name.startswith("TROOPER CAM | Lower Body "):
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
before=preserved_signature()
saved={name:{"basis":bpy.data.objects[name].matrix_basis.copy(),
             "inverse":bpy.data.objects[name].matrix_parent_inverse.copy(),
             "inset":float(bpy.data.objects[name]["stance_inset_px"])} for name in names}
for name in names:
    obj=bpy.data.objects[name]
    assert obj.parent==root and len(obj.users_collection)==1
    data=obj.data
    bpy.data.objects.remove(obj,do_unlink=True)
    if not data.users:
        bpy.data.meshes.remove(data)

parts=[]
ivory=bpy.data.materials["TROOPER | warm ivory armor"]
black=bpy.data.materials["TROOPER | charcoal seals"]
ANGLES=[math.radians(a) for a in [0,30,60,90,130,180,230,270,300,330]]
tree=ast.parse((HERE/"build_legs.py").read_text())
helpers={"rgba","mesh","loft","ring","shield"}
definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in helpers]
assert len(definitions)==len(helpers)
exec(compile(ast.Module(body=definitions,type_ignores=[]),str(HERE/"build_legs.py"),"exec"))
module=runpy.run_path(str(HERE/"build_leg_segments.py"),init_globals={
    "mesh":mesh,"loft":loft,"ring":ring,"shield":shield,"rgba":rgba,
    "S":S,"ivory":ivory,"black":black,
})
for side,label in [(-1,"right"),(1,"left")]:
    for obj in module["build_segments"](side,label):
        obj.parent=root
        obj.matrix_parent_inverse=saved[obj.name]["inverse"]
        obj.matrix_basis=saved[obj.name]["basis"]
        obj["stance_inset_px"]=saved[obj.name]["inset"]
for obj in asset.objects:
    if obj.type!="MESH":
        continue
    side=-1 if obj["side"]=="right" else 1
    inset=float(obj["stance_inset_px"])
    for key,x,z in [("hip_pivot_px",74,-215),("knee_pivot_px",86,-317),("ankle_pivot_px",98,-420)]:
        obj[key]=[side*(x-inset),0,z]
module["add_leg_detail_cameras"](bpy.data.collections["02 | STUDIO - cameras and lights"])
bpy.context.view_layer.update()
assert preserved_signature()==before,"An object outside the intended leg segments changed"

reference=HERE/"sector-trooper-leg-detail-reference.png"
img=bpy.data.images.load(str(reference),check_existing=True)
img.pack()
img.use_fake_user=True
ref=bpy.data.objects.get("REFERENCE | detailed leg study")
if not ref:
    ref=bpy.data.objects.new("REFERENCE | detailed leg study",None)
    bpy.data.collections["03 | REFERENCE - original concept"].objects.link(ref)
ref.empty_display_type="IMAGE"
ref.data=img
ref.empty_display_size=1.2
ref.rotation_euler=bpy.data.objects["REFERENCE | exact supplied front and side concept"].rotation_euler
ref.location=(1.5,0,-.8)
ref.hide_render=True
ref.hide_set(True)
bpy.context.scene["leg_profile_revision"]=2
result={"updated_meshes":len(parts),"boots_ankles_and_upper_body_unchanged":True,
        "thigh_splay_degrees_before":round(math.degrees(math.atan2(27,82)),1),
        "thigh_splay_degrees_after":round(math.degrees(math.atan2(12,83)),1),
        "details":["straighter thigh line","flat knee clearances","shaped calf and ankle cuff","warm gold knee paint"],
        "reference_packed":True}
