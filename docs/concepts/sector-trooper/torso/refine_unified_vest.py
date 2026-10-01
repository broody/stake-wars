"""Replace the overlapping upper torso plates with a welded armor shell.

The collar, chest, back and both armhole surrounds share actual vertices.
The waist, undersuit, shoulder caps, sockets, head and legs are preserved.
Run through Blender MCP after saving a backup of the combined authoring file.
"""
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
S=1/384
scene=bpy.context.scene
assert bpy.data.filepath.endswith('/sector-trooper/head/sector-trooper-head.blend')
if bpy.context.mode!='OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
asset=bpy.data.collections['04 | TORSO - editable armor parts']
root=bpy.data.objects['SectorTrooper_Torso']
name='TORSO | 02 unified armored vest'
old_names={'TORSO | '+suffix for suffix in [
    '02 sloping armored collar','02b continuous clavicle armor','03 faceted chest shield',
    '04 right floating rib plate','04 left floating rib plate',
    '05 right side cuirass','05 left side cuirass','06 rear armor shell']}
targets=old_names|{name}


def preserved_signature():
    records=[]
    for obj in sorted(bpy.data.objects,key=lambda o:o.name):
        if obj.name in targets or obj.type=='EMPTY' or obj.name.startswith('TROOPER CAM | Vest '):
            continue
        row=[obj.name,tuple(v for r in obj.matrix_world for v in r)]
        if obj.type=='MESH':
            row.extend([[tuple(v.co) for v in obj.data.vertices],
                        [tuple(p.vertices) for p in obj.data.polygons],
                        [m.name for m in obj.data.materials],
                        [[tuple(v.color) for v in a.data] for a in obj.data.color_attributes],
                        [(m.name,m.type,getattr(m,'thickness',None)) for m in obj.modifiers]])
        elif obj.type=='CAMERA':
            row.extend([obj.data.lens,obj.data.ortho_scale])
        records.append(row)
    return hashlib.sha256(json.dumps(records).encode()).hexdigest()


bpy.context.view_layer.update()
before=preserved_signature()
assert name in bpy.data.objects or all(n in bpy.data.objects for n in old_names)
vertices,faces=[],[]
lookup={}


def vertex(point):
    key=tuple(round(v,6) for v in point)
    if key not in lookup:
        lookup[key]=len(vertices)
        vertices.append(key)
    return lookup[key]


def triangle(*points):
    face=tuple(vertex(p) for p in points)
    assert len(set(face))==3
    faces.append(face)


def quad(a,b,c,d):
    triangle(a,b,c)
    triangle(a,c,d)


# Side perimeter: upper shoulder bridge, chest edge, scalloped lower hem,
# back edge. Both circular arm openings remain clear of the arm sockets.
perimeter=[(75,0,0),(72,-37,-9),(70,-62,-35),(78,-68,-82),
           (77,-51,-130),(79,-25,-121),(80,0,-119),(78,25,-121),
           (72,47,-124),(77,58,-79),(67,52,-29),(70,31,-8)]
outside={}
for side in [-1,1]:
    outer=[(side*x,y,z) for x,y,z in perimeter]
    hole=[(side*86,-36*math.sin(math.tau*i/12),-44+36*math.cos(math.tau*i/12))
          for i in range(12)]
    outside[side]=outer
    for i in range(12):
        j=(i+1)%12
        quad(outer[i],outer[j],hole[j],hole[i])

left,right=outside[-1],outside[1]
front=(0,-70,-43)
back=(0,62,-30)
collar_outer=[front,right[2],right[1],right[0],right[11],right[10],
              back,left[10],left[11],left[0],left[1],left[2]]
neck_angles=[0,45,65,90,115,135,180,225,245,270,295,315]
collar_inner=[]
for angle in neck_angles:
    a=math.radians(angle)
    sn,cs=math.sin(a),math.cos(a)
    collar_inner.append((45*sn,-43*cs,-10-16*max(cs,0)+2*max(-cs,0)))
for i in range(12):
    j=(i+1)%12
    quad(collar_outer[i],collar_outer[j],collar_inner[j],collar_inner[i])

# A broad shallow chest shield. The lower wings are part of its boundary,
# joined along the same edges as the underarm armor rather than floating tabs.
ridge=(0,-79,-120)
chin=(0,-71,-138)
for side in [-1,1]:
    o=outside[side]
    low=(side*55,-67,-109)
    toe=(side*17,-70,-136)
    wing_inner=(side*58,-59,-119)
    triangle(front,o[2],ridge)
    triangle(o[2],o[3],ridge)
    triangle(o[3],low,ridge)
    triangle(low,toe,ridge)
    triangle(toe,chin,ridge)
    triangle(o[3],o[4],low)
    triangle(o[4],wing_inner,low)

rear_boundary=[left[10],back,right[10],right[9],right[8],(0,63,-126),left[8],left[9]]
rear_ridge=(0,70,-76)
for i,p in enumerate(rear_boundary):
    triangle(p,rear_boundary[(i+1)%len(rear_boundary)],rear_ridge)

data=bpy.data.meshes.new('TROOPER TORSO | unified vest')
data.from_pydata([tuple(v*S for v in p) for p in vertices],[],faces)
assert not data.validate(),'Generated topology required repair'
bm=bmesh.new()
bm.from_mesh(data)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
# Choose the chest normal to orient the whole connected open shell outward.
front_face=min(bm.faces,key=lambda f:f.calc_center_median().y)
if front_face.normal.y>0:
    bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
visited=set()
stack=[next(iter(bm.verts))]
while stack:
    v=stack.pop()
    if v in visited:
        continue
    visited.add(v)
    stack.extend(e.other_vert(v) for e in v.link_edges)
assert len(visited)==len(bm.verts),'Vest must be one connected surface'
assert all(e.is_manifold or e.is_boundary for e in bm.edges),'Unexpected internal open seam'
boundary=[e for e in bm.edges if e.is_boundary]
assert all(sum(e.is_boundary for e in v.link_edges) in (0,2) for v in bm.verts)
unseen=set(boundary)
loops=0
while unseen:
    loops+=1
    stack=[unseen.pop()]
    while stack:
        e=stack.pop()
        for v in e.verts:
            for other in v.link_edges:
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
assert loops==4,('Expected neck, two arms and waist openings',loops)
bm.to_mesh(data)
bm.free()

ivory=bpy.data.materials['TROOPER | warm ivory armor']
data.materials.append(ivory)
tree=ast.parse((HERE/'build_torso.py').read_text())
helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='rgba')
exec(compile(ast.Module(body=[helper],type_ignores=[]),str(HERE/'build_torso.py'),'exec'))
colors=data.color_attributes.new(name='ArmorTone',type='FLOAT_COLOR',domain='CORNER')
rng=random.Random(418)
palette=['D0C8BC','CEC6BA','CCC4B8','CFC7BB','D1C9BD']
for poly in data.polygons:
    tone=rgba(rng.choice(palette))
    for i in poly.loop_indices:
        colors.data[i].color=tone

for old_name in targets:
    obj=bpy.data.objects.get(old_name)
    if not obj:
        continue
    assert obj.parent==root and len(obj.users_collection)==1 and obj.data.users==1
    old=obj.data
    bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.meshes.remove(old)
obj=bpy.data.objects.new(name,data)
asset.objects.link(obj)
obj.parent=root
obj['generator']='sector_trooper_torso_v1'
obj['vest_revision']=2
obj['construction']='One welded shell: neck, chest, armhole surrounds and back'
obj['boundary_loops']=4
modifier=obj.modifiers.new('Armor wall thickness','SOLIDIFY')
modifier.thickness=3*S
modifier.offset=-1
modifier.use_even_offset=True
bpy.context.view_layer.update()
assert preserved_signature()==before,'An object outside the vest changed'

source=bpy.data.images.load(str(HERE/'sector-trooper-vest-detail-reference.png'),check_existing=True)
source.pack()
source.use_fake_user=True
ref=bpy.data.objects.get('REFERENCE | detailed vest study')
if not ref:
    ref=bpy.data.objects.new('REFERENCE | detailed vest study',None)
    bpy.data.collections['03 | REFERENCE - original concept'].objects.link(ref)
ref.empty_display_type='IMAGE'
ref.data=source
ref.empty_display_size=1.3
ref.location=(1.6,0,-.3)
ref.rotation_euler=(math.pi/2,0,0)
ref.hide_render=True
ref.hide_set(True)

stage=bpy.data.collections['02 | STUDIO - cameras and lights']
for label,offset,scale in [('Front',(0,-6,0),.88),('Side',(-6,0,0),.88),
                            ('Hero',(-4,-6,1.3),.9),('Rear',(0,6,0),.88)]:
    camera_name='TROOPER CAM | Vest '+label
    cam=bpy.data.objects.get(camera_name)
    if not cam:
        cam=bpy.data.objects.new(camera_name,bpy.data.cameras.new(camera_name))
        stage.objects.link(cam)
    target=Vector((0,0,-110*S))
    cam.location=target+Vector(offset)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'
    cam.data.ortho_scale=scale
scene['vest_revision']=2
scene['vest_preserved_signature']=before
result={'connected_meshes':1,'boundary_loops':loops,'base_triangles':len(faces),
        'head_legs_shoulders_waist_unchanged':True,'reference_packed':True}
