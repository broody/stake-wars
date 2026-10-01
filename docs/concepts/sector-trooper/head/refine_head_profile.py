"""Fit the existing helmet to the detailed head reference without touching the body.

Run through Blender MCP. Parameters are reference pixels, with the chin at Z=0.
Mesh datablocks are replaced in place; object names, parents and modifiers stay.
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
asset=bpy.data.collections['01 | HEAD - editable armor parts']
ivory=bpy.data.materials['TROOPER | warm ivory armor']
black=bpy.data.materials['TROOPER | charcoal seals']
orange=bpy.data.materials['TROOPER | amber painted stripe']


def body_signature():
    values=[]
    for obj in sorted(bpy.data.objects,key=lambda o:o.name):
        if obj.name.startswith('HEAD |') or obj.type=='EMPTY':
            continue
        record=[obj.name,tuple(v for row in obj.matrix_world for v in row)]
        if obj.type=='MESH':
            record.extend([[tuple(v.co) for v in obj.data.vertices],
                           [tuple(p.vertices) for p in obj.data.polygons],
                           [m.name for m in obj.data.materials],
                           [[tuple(v.color) for v in a.data] for a in obj.data.color_attributes],
                           [(m.name,m.type,getattr(m,'thickness',None)) for m in obj.modifiers]])
        elif obj.type=='CAMERA':
            record.extend([obj.data.lens,obj.data.ortho_scale])
        values.append(record)
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


bpy.context.view_layer.update()
before=body_signature()
tree=ast.parse((HERE/'build_head.py').read_text())
helpers=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'rgba','ring_point','clip'}]
exec(compile(ast.Module(body=helpers,type_ignores=[]),str(HERE/'build_head.py'),'exec'))
changed=[]


def replace(name,vertices,faces,mat,seed=0,radial_center=None):
    obj=bpy.data.objects['HEAD | '+name]
    assert obj in asset.objects.values() and obj.data.users==1
    data=bpy.data.meshes.new('TROOPER | '+name+' refined')
    data.from_pydata([tuple(v*S for v in p) for p in vertices],[],faces)
    assert not data.validate(),'Generated mesh required repair: '+name
    bm=bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if radial_center is not None:
        center=Vector(radial_center)*S
        for face in bm.faces:
            if face.normal.dot(face.calc_center_median()-center)<0:
                face.normal_flip()
    elif name.startswith(('07','08')):
        for face in bm.faces:
            if face.normal.y>0:
                face.normal_flip()
    bm.to_mesh(data)
    bm.free()
    data.materials.append(mat)
    if mat==ivory:
        colors=data.color_attributes.new(name='ArmorTone',type='FLOAT_COLOR',domain='CORNER')
        palette=['D0C8BC','CEC6BA','CCC4B8','CFC7BB','D1C9BD']
        rng=random.Random(108+seed)
        for p in data.polygons:
            tone=rgba(rng.choice(palette))
            for i in p.loop_indices:
                colors.data[i].color=tone
    old=obj.data
    obj.data=data
    bpy.data.meshes.remove(old)
    data.name='TROOPER | '+name
    obj['head_profile_revision']=2
    changed.append(obj.name)
    return obj


def loft(name,rows,mat=ivory,closed=False,seed=0):
    n=len(rows[0])
    faces=[]
    for j in range(len(rows)-1):
        for i in range(n if closed else n-1):
            a,b=j*n+i,j*n+(i+1)%n
            c,d=b+n,a+n
            faces.extend([(a,b,d),(b,c,d)] if (i+j)%2 else [(a,b,c),(a,c,d)])
    return replace(name,[p for row in rows for p in row],faces,mat,seed,(0,0,110))


# The narrower upper ring follows the traced crown shoulder, avoiding a broad
# flat roof. The forehead and apex retain the reference heights.
angles=list(range(-180,180,15))
crown_rows=[[ring_point(a,w,f,b,z) for a in angles]
            for w,f,b,z in [(98,96,106,190),(56,59,72,224),(35,33,51,232)]]
crown=loft('01 crown',crown_rows,closed=True,seed=1)
top=replace('02 crown top',crown_rows[-1]+[(0,4,237)],
            [(i,(i+1)%24,24) for i in range(24)],ivory,2,(0,0,110))
front_angles=list(range(-60,61,15))
brow=loft('03 overhanging brow',[[ring_point(a,w,f,b,z) for a in front_angles]
          for w,f,b,z in [(98,96,106,190),(106,106,116,173),(116,113,123,126)]],seed=3)

# A continuous, gently flared bell rather than a second, kicked-out skirt.
# The middle ring lies on the same slope as the lower panel.
rear_angles=list(range(60,301,15))
rear_rows=[]
for row,(width,front,back,z) in enumerate([(98,96,106,190),(116,94,117,124),(134,91,128,56)]):
    points=[]
    for i,a in enumerate(rear_angles):
        shift=(7 if i==0 else -7 if i==len(rear_angles)-1 else 0)*row/2
        x,y,zz=ring_point(a+shift,width,front,back,z)
        if row==2:
            zz-=12*abs(math.cos(math.radians(a)))
        points.append((x,y,zz))
    rear_rows.append(points)
loft('04 flared side and rear shell',rear_rows,seed=4)
loft('05 dark inner helmet',[[ring_point(a,w,f,b,z) for a in angles]
     for w,f,b,z in [(96,84,103,188),(110,92,113,121),(128,75,123,44),(107,60,106,25)]],black,True)

# Broad planar cheeks meet the skirt along a narrow temple seam. The lower
# return is level with the side rim instead of hanging down as a separate fin.
cheek_vertices=[(0,-113,54),(22,-117,84),(104,-101,105),
                (113,-89,40),(22,-108,0),(0,-111,0),
                (73,-105,72)]
cheek_faces=[(0,1,6),(1,2,6),(2,3,6),(3,4,6),(4,5,6),(5,0,6)]
for side,label in [(-1,'right'),(1,'left')]:
    replace('07 '+label+' cheek and chin',[(side*x,y,z) for x,y,z in cheek_vertices],cheek_faces,ivory,7)
    replace('08 '+label+' cheek return',[(side*104,-101,105),(side*113,-89,40),
             (side*119,-50,40),(side*110,-54,103)],[(0,1,2),(0,2,3)],ivory,8)

# Refit the painted stripe to the exact updated triangles.
vertices,faces=[],[]
for obj in [crown,top,brow]:
    obj.data.calc_loop_triangles()
    for tri in obj.data.loop_triangles:
        poly=[obj.data.vertices[i].co.copy()/S for i in tri.vertices]
        for axis,boundary,greater in [(0,35,True),(0,57,False),(1,32,False),(2,143,True)]:
            if poly:
                poly=clip(poly,axis,boundary,greater)
        if len(poly)<3:
            continue
        normal=tri.normal.copy()
        if normal.dot(sum(poly,Vector())/len(poly)-Vector((0,0,120)))<0:
            normal.negate()
        start=len(vertices)
        vertices.extend([tuple(v+normal*.16) for v in poly])
        faces.extend([(start,start+i,start+i+1) for i in range(1,len(poly)-1)])
faces=[f for f in faces if (Vector(vertices[f[1]])-Vector(vertices[f[0]])).cross(
       Vector(vertices[f[2]])-Vector(vertices[f[0]])).length>1e-6]
replace('11 offset amber crown stripe',vertices,faces,orange,radial_center=(0,0,120))

bpy.context.view_layer.update()
assert body_signature()==before,'Body, camera or lighting changed during the head edit'
img=bpy.data.images.load(str(HERE/'sector-trooper-head-detail-reference.png'),check_existing=True)
img.pack()
img.use_fake_user=True
reference=bpy.data.objects.get('REFERENCE | detailed head study')
if not reference:
    reference=bpy.data.objects.new('REFERENCE | detailed head study',None)
    bpy.data.collections['03 | REFERENCE - original concept'].objects.link(reference)
reference.empty_display_type='IMAGE'
reference.data=img
reference.empty_display_size=1.4
reference.location=(1.7,0,.4)
reference.rotation_euler=(math.pi/2,0,0)
reference.hide_render=True
reference.hide_set(True)
scene['head_profile_revision']=2
scene['head_revision_preserved_body_signature']=before
scene['head_profile_notes']='Uniform flare and aligned cheek returns from detailed head reference'
result={'updated_meshes':len(changed),'body_cameras_lights_unchanged':True,
        'previous_skirt_width_px':308,'skirt_width_px':268,'reference_packed':True}
