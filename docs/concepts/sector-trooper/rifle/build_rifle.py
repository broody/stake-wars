"""Build the approved Rifle Concept 01 through the live Blender MCP session.

Upper image silhouette is the proportion reference; depth follows its lower
three-quarter view. All construction coordinates below are reference pixels.
"""
from pathlib import Path
import math
import random
import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
TAG = 'sector_rifle_concept01_mcp'
S = 1 / 1250
ORIGIN_X, ORIGIN_Y = 508, 355
assert bpy.context.mode == 'OBJECT'
assert bpy.data.scenes.get('SECTOR TROOPER | Rifle Concept 01') is None
assert not (HERE / 'sector-trooper-rifle.blend').exists(), 'Protect existing manual work.'
scene = bpy.data.scenes.new('SECTOR TROOPER | Rifle Concept 01')
scene['generator'] = TAG
scene['reference_scale'] = '1250 reference pixels per meter; depth inferred from three-quarter view'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
bpy.context.window.scene = scene


def collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


asset = collection('01 | RIFLE - editable parts')
studio = collection('02 | STUDIO - cameras and lights')
refs = collection('03 | REFERENCE - approved concept')
refs.hide_render = True
root = bpy.data.objects.new('SectorTrooper_Rifle', None)
asset.objects.link(root)
root.empty_display_size = .045
root['origin'] = 'Main grip center'
root['forward_axis'] = '-Y'
root['up_axis'] = '+Z'
parts = []


def rgba(h):
    c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)


def material(name, color, roughness=.7, emission=0, facets=False):
    mat = bpy.data.materials.new('RIFLE | '+name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = .03
    bsdf.inputs['Specular IOR Level'].default_value = .22
    if facets:
        attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'ArmorTone'
        mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = rgba(color)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


ivory = material('warm ivory casing', 'CEC6B8', facets=True)
black = material('charcoal body', '242522', .8)
recess = material('dark recesses', '0E100F', .9)
rubber = material('grip rubber', '171A18', .88)
amber = material('amber stripe', 'F6A21B', .66)
optic = material('amber status light', 'FFC329', .4, 2)
line_mat = material('emblem divisions', 'B9B7AE', .8)


def point(v):
    x, depth, y = v
    return (depth*S, -(x-ORIGIN_X)*S, (ORIGIN_Y-y)*S)


def mesh(name, verts, faces, mat, bevel=0, tones=False, world=False):
    data = bpy.data.meshes.new('RIFLE GEO | '+name)
    data.from_pydata(verts if world else [point(v) for v in verts], [], faces)
    assert not data.validate(), name
    obj = bpy.data.objects.new('RIFLE | '+name, data)
    asset.objects.link(obj)
    obj.parent = root
    data.materials.append(mat)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    if bevel:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('Low-poly edge chamfers', 'BEVEL')
        mod.width = bevel*S
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    if mat == ivory:
        attr = data.color_attributes.new(name='ArmorTone', type='FLOAT_COLOR', domain='CORNER')
        rng = random.Random(419+len(parts))
        palette = ['CEC6B8', 'CCC4B6', 'D0C8BA', 'D1C9BB', 'CBC3B5']
        for face in data.polygons:
            color = rgba(rng.choice(palette) if tones else palette[0])
            for index in face.loop_indices:
                attr.data[index].color = color
    for face in data.polygons:
        face.use_smooth = False
    obj['part'] = name
    obj['generator'] = TAG
    parts.append(obj)
    return obj


def prism(name, outline, width, mat, depth=0, bevel=0, tones=False):
    n = len(outline)
    verts = [(x,depth-width/2,y) for x,y in outline]+[(x,depth+width/2,y) for x,y in outline]
    faces = [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,bevel,tones)


def loft(name, sections, mat, tones=False):
    # Sections: x, full width in depth, full height, center y.
    profile = [(-.65,-1),(.65,-1),(1,-.65),(1,.65),
               (.65,1),(-.65,1),(-1,.65),(-1,-.65)]
    verts = [(x,a*w/2,y+b*h/2) for x,w,h,y in sections for a,b in profile]
    faces = [tuple(range(7,-1,-1)),tuple(range((len(sections)-1)*8,len(sections)*8))]
    for j in range(len(sections)-1):
        for i in range(8):
            a=j*8+i; b=j*8+(i+1)%8
            faces.append((a,b,b+8,a+8))
    return mesh(name,verts,faces,mat,tones=tones)


# Stock: deep shoulder plate and diagonal cutout, connected by a narrow spine.
prism('01 buttpad',[(157,169),(175,142),(204,140),(199,351),(176,366),(163,346)],
      90,rubber,bevel=7)
prism('02 tapered ivory stock',[(205,145),(333,158),(359,178),(338,224),
      (267,247),(222,346),(196,358)],82,ivory,bevel=8,tones=True)
loft('03 stock connector',[(338,60,53,203),(416,60,53,203)],black)
prism('04 stock connector cover',[(414,171),(488,170),(512,198),(489,253),
      (449,256),(409,226)],80,ivory,bevel=6,tones=True)

# Receiver body and its asymmetric downward front section.
receiver_outline=[(499,155),(530,118),(551,119),(581,136),(891,135),(927,158),
    (900,236),(789,236),(789,278),(760,306),(698,304),(674,275),
    (551,274),(527,251),(511,207)]
prism('05 receiver dark chassis',[(483,161),(883,151),(926,180),(904,278),
    (791,293),(699,310),(539,285),(500,250)],100,black,bevel=5)
receiver=prism('06 faceted receiver shell',receiver_outline,122,ivory,bevel=7,tones=True)

# Side emblems are separate editable geometry.
for sign,side in [(-1,'left'),(1,'right')]:
    prism('07 triangular insignia '+side,[(652,181),(679,227),(626,228)],
          .8,recess,depth=sign*61.1)
    for i,(a,b) in enumerate([((652,182),(651,210)),((651,210),(678,226)),((651,210),(627,227))]):
        dx,dy=b[0]-a[0],b[1]-a[1]
        d=math.hypot(dx,dy); nx,ny=-dy/d*.6,dx/d*.6
        prism('08 insignia division '+side+' '+str(i+1),
              [(a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny),
               (b[0]-nx,b[1]-ny),(a[0]-nx,a[1]-ny)],
              .4,line_mat,depth=sign*61.7)
    prism('09 status light housing '+side,[(790,240),(862,239),(864,278),(792,280)],
          11,recess,depth=sign*47,bevel=3)
    prism('10 status amber lens '+side,[(809,248),(848,248),(848,263),(809,263)],
          2,optic,depth=sign*53,bevel=1.2)

# Paint band clipped to the evaluated shell faces; follows every chamfer.
def clip(poly, axis, boundary, greater):
    result=[]
    for i,a in enumerate(poly):
        b=poly[(i+1)%len(poly)]
        ia=a[axis]>=boundary if greater else a[axis]<=boundary
        ib=b[axis]>=boundary if greater else b[axis]<=boundary
        if ia: result.append(a)
        if ia != ib:
            t=(boundary-a[axis])/(b[axis]-a[axis])
            result.append(a+(b-a)*t)
    return result


stripe_verts=[];stripe_faces=[]
for face in receiver.data.polygons:
    poly=[receiver.data.vertices[i].co.copy() for i in face.vertices]
    poly=clip(poly,1,-(875-ORIGIN_X)*S,True)
    if poly: poly=clip(poly,1,-(843-ORIGIN_X)*S,False)
    if len(poly)<3: continue
    # Thin closed paint prisms retain backface-culling-safe outer surfaces.
    if (poly[1]-poly[0]).cross(poly[2]-poly[0]).length<1e-12: continue
    normal=face.normal
    start=len(stripe_verts); n=len(poly)
    stripe_verts += [tuple(p+normal*.035*S) for p in poly]
    stripe_verts += [tuple(p+normal*.45*S) for p in poly]
    stripe_faces += [tuple(start+i for i in range(n-1,-1,-1)),
                     tuple(start+n+i for i in range(n))]
    stripe_faces += [(start+i,start+(i+1)%n,start+(i+1)%n+n,start+i+n) for i in range(n)]
mesh('11 amber receiver band',stripe_verts,stripe_faces,amber,world=True)

# Foreguard: a real recessed window, with an ivory ring and dark inset core.
outer=[(929,162),(1143,159),(1177,188),(1178,274),(1153,303),(946,307),(919,279),(900,233)]
inner=[(943,206),(1091,210),(1108,214),(1090,231),(1076,243),(946,250),(933,240),(923,225)]
ridge=[(ox+(ix-ox)*.23,oy+(iy-oy)*.23) for (ox,oy),(ix,iy) in zip(outer,inner)]
verts=[];faces=[]
for sign in [-1,1]:
    for outline,depth in [(outer,49),(ridge,67),(inner,67),(inner,45)]:
        verts += [(x,sign*depth,y) for x,y in outline]
for base in [0,32]:
    for row in range(3):
        for i in range(8):
            a=base+row*8+i;b=base+row*8+(i+1)%8
            faces.append((a,b,b+8,a+8))
for i in range(8):
    j=(i+1)%8
    faces.append((i,j,j+32,i+32))
    faces.append((24+i,24+j,56+j,56+i))
mesh('12 recessed foreguard shell',verts,faces,ivory,tones=True)
center_x=sum(p[0] for p in inner)/8;center_y=sum(p[1] for p in inner)/8
insert=[(center_x+(x-center_x)*1.02,center_y+(y-center_y)*1.02) for x,y in inner]
prism('13 foreguard inset core',insert,89,recess,bevel=1)
prism('14 underside hand rest',[(943,307),(1105,290),(1138,310),(1113,334),
      (972,357),(952,338)],91,black,bevel=7)
prism('15 hand-rest rubber pad',[(976,326),(1105,308),(1113,322),(984,344)],
      94,rubber,bevel=2)

# Pistol grip, trigger guard, and removable power cell: silhouette pieces only.
prism('16 pistol grip',[(511,261),(576,282),(535,333),(496,435),
      (439,411),(431,388),(483,305)],65,rubber,bevel=6)
prism('17 ivory grip heel',[(431,379),(447,403),(534,433),(524,451),
      (443,427),(424,393)],78,ivory,bevel=4,tones=True)
prism('18 trigger guard',[(574,277),(589,282),(571,318),(583,336),
      (655,339),(681,310),(686,282),(700,288),(692,321),(665,353),
      (577,351),(557,329),(559,306)],38,black,bevel=2.5)
prism('19 trigger tab',[(590,280),(606,282),(593,315),(603,332),
      (590,330),(578,316)],17,ivory,bevel=1)
prism('20 power cell',[(699,294),(805,292),(838,394),(728,427)],
      79,black,bevel=5)
prism('21 ivory power-cell foot',[(720,415),(832,382),(846,414),
      (739,454),(724,443)],93,ivory,bevel=5,tones=True)
for sign,side in [(-1,'left'),(1,'right')]:
    prism('22 cell side seam '+side,[(778,308),(786,306),(810,392),(802,394)],
          1.2,recess,depth=sign*39.6)

# Compact unlit sight: sloped housing with a dark recessed side facet.
prism('23 sight foot',[(550,136),(685,134),(689,147),(560,151)],54,black,bevel=3)
prism('24 low sight housing',[(556,117),(566,96),(663,97),(697,133),(581,140)],
      69,black,bevel=3)
for sign,side in [(-1,'left'),(1,'right')]:
    prism('25 sight recess '+side,[(584,109),(652,109),(674,129),(602,129)],
          1,recess,depth=sign*34.2,bevel=1)
loft('26 upper foreguard spine',[(912,53,10,159),(1145,53,10,159)],black)

# Barrel shroud, angular front sight and hollow faceted muzzle.
loft('27 barrel',[(1155,59,61,227),(1268,59,61,227)],black)
loft('28 front collar',[(1177,88,93,226),(1203,88,93,226),(1230,73,76,226)],black)
prism('29 forward sight',[(1165,178),(1185,139),(1210,138),(1230,163),
      (1230,186),(1190,188)],58,black,bevel=3)
loft('30 muzzle neck',[(1230,52,58,227),(1275,52,58,227)],recess)
sections=[(1265,48,57),(1290,61,57),(1367,55,42),(1381,43,33)]
profile=[(-.65,-1),(.65,-1),(1,-.62),(1,.62),(.65,1),(-.65,1),(-1,.62),(-1,-.62)]
verts=[(x,a*w,224+b*h) for x,w,h in sections for a,b in profile]
# Inner front lip and a dark-ended recessed opening.
verts += [(1381,a*23,224+b*21) for a,b in profile]
verts += [(1330,a*23,224+b*21) for a,b in profile]
faces=[tuple(range(7,-1,-1))]
for j in range(5):
    for i in range(8):
        a=j*8+i;b=j*8+(i+1)%8
        faces.append((a,b,b+8,a+8))
faces.append(tuple(range(40,48)))
muzzle=mesh('31 hollow faceted muzzle',verts,faces,black)
muzzle.data.materials.append(recess)
for p in muzzle.data.polygons:
    if all(muzzle.data.vertices[i].co.y<-(1328-ORIGIN_X)*S for i in p.vertices):
        # Darken the inner wall and bottom; leave the outer bevel charcoal.
        if all(abs(muzzle.data.vertices[i].co.x)<24*S for i in p.vertices):
            p.material_index=1
for sign,side in [(-1,'left'),(1,'right')]:
    prism('32 muzzle side recess '+side,[(1299,206),(1358,205),(1358,219),
        (1318,231),(1291,229)],1.2,recess,depth=sign*54.5)


def empty(name, pos, purpose):
    obj=bpy.data.objects.new(name,None);asset.objects.link(obj)
    obj.parent=root;obj.location=point(pos);obj.empty_display_size=.025
    obj['purpose']=purpose
    return obj


empty('ATTACH | Main grip',(508,0,355),'Grip-centered origin for hand placement')
empty('ATTACH | Support hand',(1030,0,341),'Support palm under the foreguard')
empty('ATTACH | Muzzle',(1381,0,224),'Muzzle effect marker; forward -Y')

# Packed source, hidden by default, plus orthographic matching camera.
source=bpy.data.images.load(str(HERE/'rifle-reference.png'),check_existing=True)
source.pack()
ref=bpy.data.objects.new('REFERENCE | Rifle Concept 01',None)
refs.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=source
ref.empty_display_size=1536*S
ref.color[3]=.5
ref.location=(.22,-(768-ORIGIN_X)*S,(ORIGIN_Y-512)*S)
ref.rotation_euler=(math.pi/2,0,-math.pi/2)
refs.hide_viewport=True


def aim(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


target=point((768,0,275))
def camera(name,pos,scale):
    data=bpy.data.cameras.new('RIFLE CAM | '+name);data.type='ORTHO';data.ortho_scale=scale
    obj=bpy.data.objects.new(data.name,data);studio.objects.link(obj)
    obj.location=pos;aim(obj,target)
    return obj


hero=camera('Hero',(-1.8,-1.15,.78),1.22)
side=camera('Side',(-2,target[1],target[2]),1.23)
top=camera('Top',(0,target[1],2),1.23)
top.rotation_euler=(0,0,-math.pi/2)
camera('Muzzle',(-1,-2,.55),1.13)
for name,pos,energy,size in [('Key',(-1,-.1,1.7),100,2),
                            ('Fill',(1,-.5,.9),55,2.2),
                            ('Rim',(.4,1,1.4),150,1.8)]:
    data=bpy.data.lights.new('RIFLE LIGHT | '+name,'AREA')
    data.energy=energy;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(data.name,data);studio.objects.link(obj)
    obj.location=pos;aim(obj,target)
world=bpy.data.worlds.new('RIFLE | Dark studio');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.027,.029,.03,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.world=world
scene.camera=hero
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='Khronos PBR Neutral'
scene.render.filepath=str(HERE/'rifle-preview.png')
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True);bpy.context.view_layer.objects.active=root
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type=='CONSOLE':area.type='VIEW_3D'
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.overlay.show_overlays=False
            space.shading.type='MATERIAL'
            space.shading.use_scene_lights=True;space.shading.use_scene_world=True
            space.region_3d.view_perspective='CAMERA';space.region_3d.view_camera_zoom=12
bpy.data.libraries.write(str(HERE/'sector-trooper-rifle.blend'),{scene},compress=True)
result={'scene':scene.name,'file':str(HERE/'sector-trooper-rifle.blend'),
        'parts':len(parts),'packed_reference':bool(source.packed_file),
        'built_via':'live Blender MCP'}
