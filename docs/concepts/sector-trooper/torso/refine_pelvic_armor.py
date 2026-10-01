"""Suspend separate front and rear armor plates from a fitted waist belt.

The assembly contains a belt with four keepers, a front groin guard and a rear
culet. The hips and underside stay open: no rigid wraparound or crotch bridge.
The approved vest, head, shoulders and legs are preserved.
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
names=['TORSO | 07 pelvic belt and keepers','TORSO | 08 front groin armor','TORSO | 09 rear culet armor']
old_names={'TORSO | '+s for s in ['07 waist belt','08 lower abdominal armor',
    '09 right belt block','09 left belt block','10 right rear belt block','10 left rear belt block',
    '07 belt-linked pelvic armor']}
targets=old_names|set(names)


def preserved_signature():
    records=[]
    for obj in sorted(bpy.data.objects,key=lambda o:o.name):
        if obj.name in targets or obj.type=='EMPTY' or obj.name.startswith('TROOPER CAM | Pelvis '):
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
assert any(n in bpy.data.objects for n in targets)
tree=ast.parse((HERE/'build_torso.py').read_text())
helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='rgba')
exec(compile(ast.Module(body=[helper],type_ignores=[]),str(HERE/'build_torso.py'),'exec'))


def prepare(name,vertices,faces,indices,orientation):
    data=bpy.data.meshes.new('TROOPER '+name)
    data.from_pydata([tuple(v*S for v in p) for p in vertices],[],faces)
    assert not data.validate(),'Generated mesh required repair'
    for p,index in zip(data.polygons,indices):
        p.material_index=index
    bm=bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    face=(max if orientation>0 else min)(bm.faces,key=lambda f:f.calc_center_median().y)
    if face.normal.y*orientation<0:
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    visited=set()
    stack=[next(iter(bm.verts))]
    while stack:
        v=stack.pop()
        if v in visited:
            continue
        visited.add(v)
        stack.extend(e.other_vert(v) for e in v.link_edges)
    assert len(visited)==len(bm.verts),'Each belt or plate must be a connected component'
    assert all(e.is_manifold or e.is_boundary for e in bm.edges)
    bm.to_mesh(data)
    bm.free()
    data.materials.append(bpy.data.materials['TROOPER | warm ivory armor'])
    data.materials.append(bpy.data.materials['TROOPER | charcoal seals'])
    colors=data.color_attributes.new(name='ArmorTone',type='FLOAT_COLOR',domain='CORNER')
    rng=random.Random(527+len(vertices))
    palette=['D0C8BC','CEC6BA','CCC4B8','CFC7BB','D1C9BD']
    for p in data.polygons:
        tone=rgba(rng.choice(palette))
        for i in p.loop_indices:
            colors.data[i].color=tone
    return data


def loft(rows,closed=False):
    n=len(rows[0])
    faces=[]
    for row in range(len(rows)-1):
        for i in range(n if closed else n-1):
            a,b=row*n+i,row*n+(i+1)%n
            c,d=b+n,a+n
            faces.extend([(a,b,c),(a,c,d)] if (row+i)%2 else [(a,b,d),(b,c,d)])
    return [p for row in rows for p in row],faces


# A fitted continuous belt is the connection between the two independent plates.
keepers={3,8,15,20}
keeper_vertices={i for k in keepers for i in (k,(k+1)%24)}
belt=[]
for row,(z,width,front_depth,back_depth) in enumerate([
        (-153,70.5,49.5,50.5),(-156,71.5,50.5,51.5),
        (-164,74,52.5,54.5),(-173,76.5,54.5,56.5),(-176,77,55,57)]):
    ring=[]
    for i in range(24):
        a=math.tau*i/24
        sn,cs=math.sin(a),math.cos(a)
        raised=2.4 if row in (1,2,3) and i in keeper_vertices else 0
        x=(width+raised)*math.copysign(abs(sn)**.8,sn)
        y=-(front_depth if cs>=0 else back_depth)*math.copysign(abs(cs)**.72,cs)
        y+=(-raised if cs>=0 else raised)*abs(cs)
        ring.append((x,y,z))
    belt.append(ring)
v,f=loft(belt,True)
indices=[0 if i in keepers else 1 for row in range(4) for i in range(24) for tri in range(2)]
prepared=[prepare(names[0],v,f,indices,-1)]

# A separate shield hangs over the front of the belt. Its broad upper lip seats
# against the belt face; the tapered bottom ends above the open crotch.
front=[(-43,-52,-168),(0,-56,-168),(43,-52,-168),(48,-59,-187),
       (19,-56,-230),(0,-57,-232),(-19,-56,-230),(-48,-59,-187),(0,-67,-198)]
faces=[(i,(i+1)%8,8) for i in range(8)]
prepared.append(prepare(names[1],front,faces,[0]*len(faces),-1))

# The culet is one curved rear armor plate, suspended below the same belt.
# Its sides stop behind the hip joints and never connect to the front guard.
rear_top=[(x*1.012,y+2.6,-171) for x,y,z in belt[3][8:17]]
rear_mid=[(78,37,-197),(68,53,-204),(50,64,-207),(25,68,-208),(0,64,-206),
          (-25,68,-208),(-50,64,-207),(-68,53,-204),(-78,37,-197)]
rear_hem=[(75,36,-208),(64,48,-222),(48,55,-228),(24,56,-234),(0,55,-234),
          (-24,56,-234),(-48,55,-228),(-64,48,-222),(-75,36,-208)]
v,f=loft([rear_top,rear_mid,rear_hem])
prepared.append(prepare(names[2],v,f,[0]*len(f),1))

for old_name in targets:
    obj=bpy.data.objects.get(old_name)
    if obj:
        assert len(obj.users_collection)==1 and obj.data.users==1
        assert obj.parent==root or obj.parent.name=='SectorTrooper_PelvicArmor'
        old=obj.data
        bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.meshes.remove(old)
assembly=bpy.data.objects.get('SectorTrooper_PelvicArmor')
if not assembly:
    assembly=bpy.data.objects.new('SectorTrooper_PelvicArmor',None)
    asset.objects.link(assembly)
assembly.parent=root
assembly.empty_display_size=.04
assembly['construction']='Separate front and rear armor plates held together by a waist belt'
assembly['rigid_hip_connections']=False
assembly['crotch_bridge']=False
for i,(name,data) in enumerate(zip(names,prepared)):
    obj=bpy.data.objects.new(name,data)
    asset.objects.link(obj)
    obj.parent=assembly
    obj['generator']='sector_trooper_torso_v1'
    obj['pelvis_revision']=3
    obj['assembly']='belt-suspended pelvic armor'
    obj['component']=['belt and four keepers','front groin plate','rear buttocks plate'][i]
    modifier=obj.modifiers.new('Armor wall thickness','SOLIDIFY')
    modifier.thickness=2.5*S
    modifier.offset=-1
    modifier.use_even_offset=True
    modifier.material_offset_rim=1
bpy.context.view_layer.update()
assert preserved_signature()==before,'An object outside the pelvic armor changed'

stage=bpy.data.collections['02 | STUDIO - cameras and lights']
for label,offset,scale in [('Front',(0,-6,0),.7),('Side',(-6,0,0),.7),
                            ('Hero',(-4,-6,1.4),.72),('Rear',(0,6,0),.7),
                            ('Rear Hero',(-4,6,1.6),.72)]:
    camera_name='TROOPER CAM | Pelvis '+label
    cam=bpy.data.objects.get(camera_name)
    if not cam:
        cam=bpy.data.objects.new(camera_name,bpy.data.cameras.new(camera_name))
        stage.objects.link(cam)
    target=Vector((0,0,-193*S))
    cam.location=target+Vector(offset)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'
    cam.data.ortho_scale=scale
scene['pelvis_revision']=3
scene['pelvis_preserved_signature']=before
result={'assembly_components':3,'armor_plates':2,'belt_keepers':4,
        'hip_connections':'belt only','crotch_bridge':False,
        'head_vest_shoulders_legs_unchanged':True}
