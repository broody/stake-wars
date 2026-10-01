"""Add the Sector Trooper torso to the approved head's live Blender scene.

Run with Blender MCP using runpy.run_path. The head is never rebuilt or moved.
Reference coordinates: 384 px/m, Z=0 at the chin, -Y forward. Only a previously
generated torso may be replaced, and only with REPLACE_TORSO=True.
"""
from pathlib import Path
import hashlib
import json
import math
import random

import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
S = 1 / 384
TAG = "sector_trooper_torso_v1"
COLLECTION = "04 | TORSO - editable armor parts"
scene = bpy.context.scene
assert bpy.context.mode == "OBJECT"
assert bpy.data.filepath.endswith("/sector-trooper/head/sector-trooper-head.blend")
head = bpy.data.collections["01 | HEAD - editable armor parts"]


def head_signature():
    values = []
    for obj in sorted(head.objects, key=lambda o: o.name):
        values.append((obj.name, tuple(v for row in obj.matrix_world for v in row)))
        if obj.type == "MESH":
            values.append(([tuple(v.co) for v in obj.data.vertices],
                           [tuple(p.vertices) for p in obj.data.polygons],
                           [m.name for m in obj.data.materials]))
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


approved_head = head_signature()
previous = bpy.data.collections.get(COLLECTION)
if previous:
    assert globals().get("REPLACE_TORSO", False), "Torso exists; save manual edits before rebuilding."
    assert previous.get("generator") == TAG
    assert all(len(o.users_collection) == 1 for o in previous.objects)
    for obj in list(previous.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if isinstance(data, bpy.types.Mesh) and not data.users:
            bpy.data.meshes.remove(data)
    bpy.data.collections.remove(previous)
asset = bpy.data.collections.new(COLLECTION)
asset["generator"] = TAG
scene.collection.children.link(asset)
parts = []
ivory = bpy.data.materials["TROOPER | warm ivory armor"]
black = bpy.data.materials["TROOPER | charcoal seals"]
signal = bpy.data.materials["TROOPER | warm amber optic"]


def rgba(value):
    rgb = [int(value[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)


def mesh(name, verts, faces, mat=ivory, thickness=0, seed=0):
    data = bpy.data.meshes.new("TROOPER TORSO | " + name)
    data.from_pydata([tuple(c*S for c in v) for v in verts], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(mat)
    if mat == ivory:
        attr = data.color_attributes.new(name="ArmorTone", type="FLOAT_COLOR", domain="CORNER")
        rng = random.Random(210 + seed)
        palette = ["D1C9BD", "CEC6BA", "CBC3B7", "CFC7BB", "D3CCBF", "CDC5B9"]
        for poly in data.polygons:
            color = rgba(rng.choice(palette))
            for i in poly.loop_indices:
                attr.data[i].color = color
    obj = bpy.data.objects.new("TORSO | " + name, data)
    obj["generator"] = TAG
    asset.objects.link(obj)
    if thickness:
        mod = obj.modifiers.new("Armor wall thickness", "SOLIDIFY")
        mod.thickness = thickness*S
        mod.offset = -1
        mod.use_even_offset = True
    parts.append(obj)
    return obj


def loft(name, rows, mat=black, caps=True, thickness=0, seed=0, cap_centers=None):
    n = len(rows[0])
    verts = [v for row in rows for v in row]
    faces = []
    for j in range(len(rows)-1):
        for i in range(n):
            a,b = j*n+i,j*n+(i+1)%n
            c,d = b+n,a+n
            faces.extend([(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)])
    if caps and cap_centers:
        first,last=len(verts),len(verts)+1
        verts.extend(cap_centers)
        offset=(len(rows)-1)*n
        faces.extend((first,(i+1)%n,i) for i in range(n))
        faces.extend((last,offset+i,offset+(i+1)%n) for i in range(n))
    elif caps:
        faces += [tuple(range(n-1,-1,-1)), tuple(range((len(rows)-1)*n,len(rows)*n))]
    return mesh(name,verts,faces,mat,thickness,seed)


def body_ring(width, front, back, z, count=12):
    row=[]
    for i in range(count):
        a=math.tau*i/count
        sn,cs=math.sin(a),math.cos(a)
        row.append((width*math.copysign(abs(sn)**.8,sn),
                    -(front if cs>=0 else back)*math.copysign(abs(cs)**.72,cs),z))
    return row


# A continuous undersuit gives the armor a readable volume and closes the waist.
loft("01 fitted charcoal undersuit", [body_ring(*row) for row in [
    (45,38,39,-18),(78,54,58,-46),(79,57,60,-90),
    (68,46,48,-136),(67,47,48,-167),(79,48,47,-195),
    (48,35,36,-229),(34,27,28,-236),
]])

# Collar slopes down at the front around the existing black neck socket.
collar_inner,collar_outer=[],[]
for i in range(16):
    a=math.tau*i/16
    sn,cs=math.sin(a),math.cos(a)
    collar_inner.append((45*sn,-42*cs,-10-16*max(cs,0)+2*max(-cs,0)))
    collar_outer.append((78*sn,-66*cs,-40+36*abs(sn)+16*max(-cs,0)))
loft("02 sloping armored collar",[collar_inner,collar_outer],ivory,False,3,2)

# Fill the clavicle area down to the chest's straight upper edge. This keeps
# the collar seated in one continuous cuirass instead of a detached V band.
clavicle_top,clavicle_bottom=[],[]
for j in range(-4,5):
    a=math.pi*j/8
    sn,cs=math.sin(a),math.cos(a)
    clavicle_top.append((78*sn,-66*cs,-40+36*abs(sn)))
    clavicle_bottom.append((73*sn,-76+14*abs(sn),-44+abs(sn)))
cv=clavicle_top+clavicle_bottom
cf=[]
for j in range(8):
    cf.extend([(j,j+1,j+10),(j,j+10,j+9)])
mesh("02b continuous clavicle armor",cv,cf,ivory,3,22)

# Broad chest planes meet in the same low central point as the front concept.
chest_vertices=[
    (-73,-62,-43),(0,-76,-44),(73,-62,-43),
    (80,-56,-88),(59,-67,-110),(17,-71,-137),
    (0,-74,-138),(-17,-71,-137),(-59,-67,-110),(-80,-56,-88),
    (-54,-76,-65),(54,-76,-65),(0,-85,-121),
]
chest_faces=[(0,1,10),(1,11,10),(1,2,11),(2,3,11),(3,4,11),
             (11,4,12),(11,12,10),(10,12,8),(10,8,9),(0,10,9),
             (8,12,7),(7,12,6),(6,12,5),(5,12,4)]
mesh("03 faceted chest shield",chest_vertices,chest_faces,ivory,4,3)

# Small lower side plates leave the flexible abdominal area exposed.
for side,label in [(-1,"right"),(1,"left")]:
    mesh("04 "+label+" floating rib plate",[
        (side*77,-49,-85),(side*63,-62,-100),(side*56,-57,-119),
        (side*73,-46,-132),(side*85,-34,-113),(side*81,-29,-91),
        (side*77,-50,-109),
    ],[(0,1,6),(1,2,6),(2,3,6),(3,4,6),(4,5,6),(5,0,6)],ivory,3,4)
    mesh("05 "+label+" side cuirass",[
        (side*77,-35,-35),(side*78,34,-33),(side*80,49,-63),
        (side*73,44,-103),(side*61,20,-128),(side*70,-18,-121),
        (side*78,-35,-85),(side*84,9,-72),
    ],[(0,1,7),(1,2,7),(2,3,7),(3,4,7),(4,5,7),(5,6,7),(6,0,7)],ivory,3,5)

# The rear uses a restrained matching shell; surfaces hidden by the concept
# are an inferred continuation, without adding a backpack or decorative vents.
back=[(-51,50,-25),(0,60,-22),(51,50,-25),(74,52,-54),
      (71,55,-93),(45,53,-123),(0,58,-134),(-45,53,-123),
      (-71,55,-93),(-74,52,-54),(-40,69,-65),(40,69,-65),(0,74,-87)]
mesh("06 rear armor shell",back,
     [(0,1,10),(1,11,10),(1,2,11),(2,3,11),(3,4,11),(4,5,12),
      (4,12,11),(5,6,12),(6,7,12),(7,8,12),(8,10,12),(8,9,10),
      (9,0,10),(10,11,12)],ivory,4,6)

# Dark belt with isolated ivory side blocks; the center continues into the
# low abdominal plate shown below the waist in the reference.
loft("07 waist belt",[body_ring(72,50,51,-155),body_ring(75,51,52,-177)],black)
mesh("08 lower abdominal armor",[
    (-42,-55,-165),(42,-55,-165),(48,-59,-184),(19,-56,-230),
    (-19,-56,-230),(-48,-59,-184),(-23,-65,-195),(23,-65,-195),(0,-69,-198),
],[(0,1,7),(0,7,6),(0,6,5),(1,2,7),(2,3,7),(7,3,8),
   (8,3,4),(8,4,6),(6,4,5),(6,7,8)],ivory,3,8)
for side,label in [(-1,"right"),(1,"left")]:
    mesh("09 "+label+" belt block",[
        (side*65,-45,-154),(side*82,-31,-150),(side*86,-30,-176),(side*65,-46,-180),
    ],[(0,1,2),(0,2,3)],ivory,7,9)
    mesh("10 "+label+" rear belt block",[
        (side*53,44,-155),(side*75,28,-152),(side*77,28,-176),(side*53,44,-178),
    ],[(0,1,2),(0,2,3)],ivory,5,10)


def shoulder_ring(side,x,r,z=-44,count=12):
    return [(side*x,r*math.sin(math.tau*i/count),z+r*math.cos(math.tau*i/count)) for i in range(count)]


def project_badge(name,obj,patches,mat,offset):
    """Clip painted marks to every cap facet instead of bridging over ridges."""
    vertices,faces=[],[]
    obj.data.calc_loop_triangles()
    for patch in patches:
        signed_area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(patch,patch[1:]+patch[:1]))
        orientation=1 if signed_area>0 else -1
        for tri in obj.data.loop_triangles:
            if tri.normal.y>-.2:
                continue
            poly=[obj.data.vertices[i].co.copy()/S for i in tri.vertices]
            for a,b in zip(patch,patch[1:]+patch[:1]):
                if not poly:
                    break
                def distance(p):
                    return orientation*((b[0]-a[0])*(p.z-a[1])-(b[1]-a[1])*(p.x-a[0]))
                clipped=[]
                for p,q in zip(poly,poly[1:]+poly[:1]):
                    dp,dq=distance(p),distance(q)
                    if dp>=0:
                        clipped.append(p)
                    if (dp>=0)!=(dq>=0):
                        clipped.append(p.lerp(q,dp/(dp-dq)))
                poly=clipped
            if len(poly)<3:
                continue
            start=len(vertices)
            vertices.extend((p.x,p.y-offset,p.z) for p in poly)
            for i in range(1,len(poly)-1):
                if (poly[i]-poly[0]).cross(poly[i+1]-poly[0]).length>1e-6:
                    faces.append((start,start+i,start+i+1))
    assert faces,name
    result=mesh(name,vertices,faces,mat,seed=15)
    bm=bmesh.new()
    bm.from_mesh(result.data)
    for face in bm.faces:
        if face.normal.y>0:
            face.normal_flip()
    bm.to_mesh(result.data)
    bm.free()
    return result


def build_shoulder_cap(side,label):
    """A thin open pauldron following the shoulder, with painted sector marks."""
    # Each station is an arch around the arm axis. The flared middle preserves
    # the front silhouette; open ends expose a narrow armor edge in profile.
    stations=[(96,36,-40,72),(118,50,-40,96),(153,53,-40,94),
              (178,44,-44,80),(188,34,-44,65)]
    vertices=[]
    segments=8
    for x,radius,center_z,extent in stations:
        for i in range(segments+1):
            angle=math.radians(-extent+2*extent*i/segments)
            vertices.append((side*x,-radius*math.sin(angle),
                             center_z+radius*math.cos(angle)))
    faces=[]
    for j in range(len(stations)-1):
        for i in range(segments):
            a=j*(segments+1)+i
            b=a+1
            c=b+segments+1
            d=a+segments+1
            faces.extend([(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)])
    pad=mesh("13 "+label+" shoulder cap",vertices,faces,ivory,thickness=3,seed=13)
    bm=bmesh.new()
    bm.from_mesh(pad.data)
    for face in bm.faces:
        center=face.calc_center_median()
        radial=Vector((0,center.y,center.z+42*S))
        if face.normal.dot(radial)<0:
            face.normal_flip()
    bm.to_mesh(pad.data)
    bm.free()
    pad.data.update()
    pad["construction"]="Open curved shell; 3 reference-pixel armor wall"
    bpy.context.view_layer.update()
    badge=[(side*132,3),(side*161,2),(side*153,-19)]
    center=tuple(sum(p[i] for p in badge)/3 for i in range(2))
    project_badge("14 "+label+" triangular shoulder inset",pad,[badge],black,.25)
    # Thin tetrahedral sector mark: three outer edges and spokes to its center.
    strokes=[]
    for a,b in [(badge[0],badge[1]),(badge[1],badge[2]),(badge[2],badge[0])]+[(p,center) for p in badge]:
        av,bv=Vector(a),Vector(b)
        delta=(bv-av).normalized()
        normal=Vector((-delta.y,delta.x))*.34
        strokes.append([av+normal,bv+normal,bv-normal,av-normal])
    project_badge("15 "+label+" sector emblem",pad,strokes,ivory,.42)


for side,label in [(-1,"right"),(1,"left")]:
    loft("11 "+label+" shoulder socket",[
        shoulder_ring(side,80,24),shoulder_ring(side,101,35),
        shoulder_ring(side,158,35),shoulder_ring(side,177,29),
    ])
    # A small recessed annular connector provides the future arm attachment.
    loft("12 "+label+" arm attachment rim",[
        shoulder_ring(side,170,28),shoulder_ring(side,181,28),
        shoulder_ring(side,183,23),shoulder_ring(side,176,23),
    ],caps=False)
    build_shoulder_cap(side,label)

root=bpy.data.objects.new("SectorTrooper_Torso",None)
root["generator"]=TAG
root["scope"]="Chest, back, abdomen, waist and shoulder caps; arms and legs to follow"
root.empty_display_size=.07
asset.objects.link(root)
for obj in parts:
    obj.parent=root
root["left_arm_socket_px"]=[183,0,-44]
root["right_arm_socket_px"]=[-183,0,-44]

# New cameras leave the saved head-only inspection cameras intact.
stage=bpy.data.collections["02 | STUDIO - cameras and lights"]
def camera(name,location,target,scale):
    full="TROOPER CAM | "+name
    obj=bpy.data.objects.get(full)
    if not obj:
        data=bpy.data.cameras.new(full)
        obj=bpy.data.objects.new(full,data)
        stage.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.data.type="ORTHO"
    obj.data.ortho_scale=scale
    return obj

hero=camera("Bust Hero",(-4,-6,1.02),(0,0,-.005),1.48)
camera("Bust Front",(0,-6,-.005),(0,0,-.005),1.48)
camera("Bust Side",(-6,0,-.005),(0,0,-.005),1.48)
camera("Bust Rear",(0,6,-.005),(0,0,-.005),1.48)
scene.camera=hero
scene.render.resolution_x,scene.render.resolution_y=1200,1440
scene.render.resolution_percentage=100
scene.cycles.samples=48
scene.render.filepath=str(HERE/"torso-preview.png")
scene["character_scope"]="Approved flared head with torso and shoulder caps"
bpy.context.view_layer.update()
assert head_signature()==approved_head,"Approved head was changed"
scene["approved_head_signature"]=approved_head

result={"torso_meshes":len(parts),"approved_head_unchanged":True,"file":bpy.data.filepath,
        "arm_socket_centers_m":[[-183*S,0,-44*S],[183*S,0,-44*S]],
        "scope":"Torso and shoulder caps, with lower abdominal armor"}
(HERE/"torso-metadata.json").write_text(json.dumps(result,indent=2)+"\n")
