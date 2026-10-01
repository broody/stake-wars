"""Add reference-proportioned legs beneath the approved Sector Trooper bust.

Run in the live authoring file through Blender Lab MCP. Replacing these legs
requires REPLACE_LEGS=True; the head, torso and existing cameras are preserved.
Coordinates use reference pixels: 384 px/m, -Y forward, chin Z=0.
"""
from pathlib import Path
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
COLLECTION="05 | LEGS - editable armor and joints"
scene=bpy.context.scene
assert bpy.context.mode=="OBJECT"
assert bpy.data.filepath.endswith("/sector-trooper/head/sector-trooper-head.blend")


def upper_signature():
    records=[]
    for name in ["01 | HEAD - editable armor parts","04 | TORSO - editable armor parts"]:
        for obj in sorted(bpy.data.collections[name].objects,key=lambda o:o.name):
            record=[obj.name,tuple(v for row in obj.matrix_world for v in row)]
            if obj.type=="MESH":
                record.extend([[tuple(v.co) for v in obj.data.vertices],
                               [tuple(p.vertices) for p in obj.data.polygons],
                               [m.name for m in obj.data.materials],
                               [[tuple(v.color) for v in a.data] for a in obj.data.color_attributes],
                               [(m.name,m.type,getattr(m,"thickness",None)) for m in obj.modifiers]])
            records.append(record)
    return hashlib.sha256(json.dumps(records).encode()).hexdigest()


approved_upper=upper_signature()
previous=bpy.data.collections.get(COLLECTION)
if previous:
    assert globals().get("REPLACE_LEGS",False),"Legs exist; preserve manual edits before replacing them."
    assert previous.get("generator")==TAG
    for obj in list(previous.objects):
        assert len(obj.users_collection)==1
        data=obj.data
        bpy.data.objects.remove(obj,do_unlink=True)
        if isinstance(data,bpy.types.Mesh) and not data.users:
            bpy.data.meshes.remove(data)
    bpy.data.collections.remove(previous)
asset=bpy.data.collections.new(COLLECTION)
asset["generator"]=TAG
scene.collection.children.link(asset)
ivory=bpy.data.materials["TROOPER | warm ivory armor"]
black=bpy.data.materials["TROOPER | charcoal seals"]
amber=bpy.data.materials["TROOPER | amber painted stripe"]
parts=[]


def rgba(value):
    rgb=[int(value[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)


def mesh(name,vertices,faces,mat=ivory,thickness=0,seed=0):
    data=bpy.data.meshes.new("TROOPER LEGS | "+name)
    data.from_pydata([tuple(c*S for c in v) for v in vertices],[],faces)
    data.update()
    bm=bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(mat)
    if mat==ivory:
        attr=data.color_attributes.new(name="ArmorTone",type="FLOAT_COLOR",domain="CORNER")
        rng=random.Random(360+seed)
        palette=["D1C9BD","CEC6BA","CBC3B7","CFC7BB","D3CCBF","CDC5B9"]
        for poly in data.polygons:
            color=rgba(rng.choice(palette))
            for i in poly.loop_indices:
                attr.data[i].color=color
    obj=bpy.data.objects.new("LEGS | "+name,data)
    obj["generator"]=TAG
    asset.objects.link(obj)
    if thickness:
        mod=obj.modifiers.new("Armor wall thickness","SOLIDIFY")
        mod.thickness=thickness*S
        mod.offset=-1
        mod.use_even_offset=True
    parts.append(obj)
    return obj


def loft(name,rows,mat=ivory,caps=False,thickness=0,seed=0):
    n=len(rows[0])
    vertices=[v for row in rows for v in row]
    faces=[]
    for j in range(len(rows)-1):
        for i in range(n):
            a=j*n+i
            b=j*n+(i+1)%n
            c,d=b+n,a+n
            pair=[(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)]
            # Orient both triangles outward before Solidify creates the inner wall.
            center=(Vector(rows[j][i])+Vector(rows[j][(i+1)%n])+
                    Vector(rows[j+1][i])+Vector(rows[j+1][(i+1)%n]))/4
            axis=sum((Vector(v) for v in rows[j]+rows[j+1]),Vector())/(2*n)
            radial=Vector((center.x-axis.x,center.y-axis.y,0))
            for f in pair:
                p,q,r=[Vector(vertices[k]) for k in f]
                faces.append(tuple(reversed(f)) if (q-p).cross(r-p).dot(radial)<0 else f)
    if caps:
        faces.extend([tuple(range(n-1,-1,-1)),tuple(range((len(rows)-1)*n,len(rows)*n))])
    obj=mesh(name,vertices,faces,mat,thickness,seed)
    if not caps:
        # mesh's generic normal recalculation may reverse an open surface;
        # restore the known outward winding while retaining its corner colors.
        bm=bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        for i,face in enumerate(bm.faces):
            p,q,r=[Vector(vertices[k]) for k in faces[i]]
            if face.normal.dot((q-p).cross(r-p))<0:
                face.normal_flip()
        bm.to_mesh(obj.data)
        bm.free()
    return obj


ANGLES=[math.radians(a) for a in [0,30,60,90,130,180,230,270,300,330]]
def ring(side,cx,z,width,front,back,z_offset=None):
    result=[]
    for a in ANGLES:
        sn,cs=math.sin(a),math.cos(a)
        result.append((side*(cx+width*sn),-(front if cs>=0 else back)*cs,
                       z+(z_offset(sn,cs) if z_offset else 0)))
    return result


def shield(name,side,outline,ridge,mat=black,depth=3):
    """Convex faceted front plate with a restrained raised center."""
    verts=[(side*x,y,z) for x,y,z in outline]+[(side*ridge[0],ridge[1],ridge[2])]
    c=len(verts)-1
    obj=mesh(name,verts,[(i,(i+1)%c,c) for i in range(c)],mat,depth,seed=4)
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    for face in bm.faces:
        if face.normal.y>0:
            face.normal_flip()
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def set_leg_spacing(objects,inset_px=24):
    """Move each complete leg inward, preserving armor shape and joint alignment."""
    for obj in objects:
        side=-1 if obj["side"]=="right" else 1
        previous=float(obj.get("stance_inset_px",0))
        delta=inset_px-previous
        obj.location.x-=side*delta*S
        for key in ["hip_pivot_px","knee_pivot_px","ankle_pivot_px"]:
            pivot=list(obj[key])
            pivot[0]-=side*delta
            obj[key]=pivot
        obj["stance_inset_px"]=inset_px


boot_helpers=runpy.run_path(str(HERE/"build_boots.py"),init_globals={
    "mesh":mesh,"loft":loft,"S":S,"ivory":ivory,"black":black,
})
segment_helpers=runpy.run_path(str(HERE/"build_leg_segments.py"),init_globals={
    "mesh":mesh,"loft":loft,"ring":ring,"shield":shield,"rgba":rgba,
    "S":S,"ivory":ivory,"black":black,
})

for side,label in [(-1,"right"),(1,"left")]:
    first=len(parts)
    segment_helpers["build_segments"](side,label)
    loft(label+" 08 ankle seal",[
        ring(side,98,-402,21,23,22),ring(side,98,-417,25,25,24),
        ring(side,98,-433,22,24,24),
    ],black,caps=True)

    boot_helpers["build_boot"](side,label)
    for obj in parts[first:]:
        obj["side"]=label
        obj["hip_pivot_px"]=[side*74,0,-215]
        obj["knee_pivot_px"]=[side*86,0,-317]
        obj["ankle_pivot_px"]=[side*98,0,-420]

set_leg_spacing(parts)

root=bpy.data.objects.new("SectorTrooper_Legs",None)
asset.objects.link(root)
root["generator"]=TAG
root["scope"]="Both legs, knee accents and boots; modeling pose, no rig or animations"
root["ground_z_m"]=-486*S
root.empty_display_size=.06
for obj in parts:
    obj.parent=root

# Add full-height inspection views without changing the approved bust cameras.
stage=bpy.data.collections["02 | STUDIO - cameras and lights"]
def camera(name,location,target,scale):
    full="TROOPER CAM | "+name
    obj=bpy.data.objects.get(full)
    if not obj:
        obj=bpy.data.objects.new(full,bpy.data.cameras.new(full))
        stage.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.data.type="ORTHO"
    obj.data.ortho_scale=scale
    return obj

target=(0,0,-124.5*S)
hero=camera("Figure Hero",(-4,-6,.65),target,2.18)
camera("Figure Front",(0,-6,target[2]),target,2.18)
camera("Figure Side",(-6,0,target[2]),target,2.18)
camera("Figure Rear",(0,6,target[2]),target,2.18)
boot_helpers["add_boot_cameras"](stage)
segment_helpers["add_leg_detail_cameras"](stage)
scene.camera=hero
scene.render.resolution_x,scene.render.resolution_y=1200,1600
scene.render.resolution_percentage=100
scene.render.filepath=str(HERE/"figure-preview.png")
bpy.context.view_layer.update()
assert upper_signature()==approved_upper,"Approved head or torso changed"
scene["approved_upper_signature"]=approved_upper
scene["character_scope"]="Approved head and torso with reference-based legs and boots"
result={"leg_meshes":len(parts),"head_and_torso_unchanged":True,
        "ground_z_m":-486*S,"height_m":(237+486)*S,
        "scope":"Legs and boots added; arms and rig still to follow"}
