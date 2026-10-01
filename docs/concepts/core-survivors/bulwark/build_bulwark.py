"""Build the shield-equipped Hollow Legion Bulwark in a fresh background Blender.

blender --background --factory-startup --python build_bulwark.py
The live Mite project is never cleared or modified by this script.
"""
from pathlib import Path
import json
import math

import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUT = ROOT / "apps/web/public/models/hollow-legion"
TAG = "stakewars_bulwark_v3"
assert bpy.app.background and not bpy.data.filepath, "Build in a fresh background process."
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene.name = "BULWARK | Studio"
scene["generator"] = TAG
scene.unit_settings.system = "METRIC"


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


asset = collection("01 · BULWARK — model & rig")
stage = collection("02 · Studio — cameras & lights")
references = collection("03 · References — packed image")
references.hide_render = True
parts = []


def rgba(hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels) + (1,)


def material(name, color, metal=.25, roughness=.65, vertex_color=False, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba(color)
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = rgba(color)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = roughness
    if vertex_color:
        v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        v.layer_name = "ArmorTone"
        mat.node_tree.links.new(v.outputs["Color"], p.inputs["Base Color"])
    if emission:
        p.inputs["Emission Color"].default_value = rgba(color)
        p.inputs["Emission Strength"].default_value = emission
    return mat


armor = material("BULWARK · vertex-colored graphite", "303336", metal=.25, roughness=.65, vertex_color=True)
signal = material("BULWARK · scarlet sensors", "C21109", .1, .4, emission=1.1)
dark = ["303336", "393C3F", "272B2E", "35383A"]
pale = ["86837C", "959188", "74746F", "89867F"]


def mesh(name, verts, faces, bone="Spine", colors=None, glowing=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(armor)
    data.materials.append(signal)
    attr = data.color_attributes.new(name="ArmorTone", type="FLOAT_COLOR", domain="CORNER")
    palette = colors or dark
    for face in data.polygons:
        face.material_index = int(glowing)
        face.use_smooth = False
        color = rgba(palette[face.index % len(palette)])
        for index in face.loop_indices:
            attr.data[index].color = (1, 1, 1, 1) if glowing else color
    obj = bpy.data.objects.new(name, data)
    obj["generator"] = TAG
    asset.objects.link(obj)
    obj.vertex_groups.new(name=bone).add(list(range(len(verts))), 1, "REPLACE")
    parts.append(obj)
    return obj


def beam(name, start, end, sizes, bone, sides=4, colors=None, end_cap=True, levels=None):
    a, b = Vector(start), Vector(end)
    delta = b - a
    q = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    levels = levels or [i / (len(sizes) - 1) for i in range(len(sizes))]
    verts, faces = [], []
    for t, (width, depth) in zip(levels, sizes):
        w, d = width / 2, depth / 2
        ring = [(-w, -d), (w, -d), (w, d), (-w, d)] if sides == 4 else [
            (-w * .65, -d), (w * .65, -d), (w, 0), (w * .65, d), (-w * .65, d), (-w, 0)]
        verts += [tuple(a + q @ Vector((x, y, t * delta.length))) for x, y in ring]
    faces.append(tuple(reversed(range(sides))))
    for ring in range(len(sizes) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((ring * sides + i, ring * sides + j, (ring + 1) * sides + j, (ring + 1) * sides + i))
    if end_cap:
        faces.append(tuple((len(sizes) - 1) * sides + i for i in range(sides)))
    return mesh(name, verts, faces, bone, colors)


def cylinder(name, center, axis, radius, depth, bone, colors=None):
    count = 6
    c = Vector(center)
    q = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized())
    verts = [tuple(c + q @ Vector((radius * math.cos(i * math.tau / count),
                                  radius * math.sin(i * math.tau / count), z)))
             for z in (-depth / 2, depth / 2) for i in range(count)]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return mesh(name, verts, faces, bone, colors or ["44494B", "3C4143", "292D30"])


def plate(name, profile, front, back, bone, colors=None, ridge=.008):
    n = len(profile)
    verts = [(x, front, z) for x, z in profile] + [(x, back, z) for x, z in profile]
    verts.append((sum(x for x, _ in profile) / n, front - ridge, sum(z for _, z in profile) / n))
    faces = [(i, (i + 1) % n, n * 2) for i in range(n)]
    faces.append(tuple(reversed(range(n, n * 2))))
    faces += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    return mesh(name, verts, faces, bone, colors)


# Shared faction language: broad wedge facets, six-sided hinges, restrained pale
# plates. No repeated edge bevels or small knuckle/toe assemblies.
beam('Torso · sloped slab', (0,.025,1.05), (0,.025,1.715),
     [(.66,.40),(.96,.51),(1.03,.49),(.84,.36)], 'Spine',6,
     levels=[0,.28,.87,1],colors=['303437','373A3D','292D30','404346'])
plate('Back · inverted carapace',[(-.37,1.61),(.37,1.61),(.31,1.16),(0,1.065),(-.31,1.16)],
      .26,.34,'Spine',['303437','292D30','373A3D'],ridge=-.025)
beam('Waist · recessed core',(0,0,.93),(0,0,1.13),[(.36,.28),(.39,.29)],
     'Hips',6,colors=['1D2225'])
plate('Pelvis · angular apron',[(-.22,1.035),(.22,1.035),(.17,.865),(0,.825),(-.17,.865)],
      -.225,-.12,'Hips',dark,ridge=.018)

plate('Chest · faceted breastplate',[(-.34,1.575),(.34,1.575),(.255,1.17),(0,1.075),(-.255,1.17)],
      -.27,-.205,'Spine',['373A3D','303437','292D30','34383A'],ridge=.022)
triangle=[(-.155,1.455),(.155,1.455),(0,1.20)]
inner=[(-.123,1.435),(.123,1.435),(0,1.237)]
verts=[(x,y,z) for profile,y in [(triangle,-.307),(inner,-.308),(inner,-.296)] for x,z in profile]
faces=[(i,(i+1)%3,(i+1)%3+3,i+3) for i in range(3)]
faces += [(i+3,(i+1)%3+3,(i+1)%3+6,i+6) for i in range(3)]
mesh('Chest · inset rim',verts,faces,'Spine',['3A3E40','292D30','404446'])
mesh('Chest · dark sensor well',[(x,-.297,z) for x,z in inner],[(0,1,2)],'Spine',['0E1215'])
mesh('Chest · scarlet sensor',[(-.026,-.30,1.391),(.026,-.30,1.391),(0,-.30,1.345)],
     [(0,1,2)],'Spine',glowing=True)

# A single slanted helmet shell replaces the stack of beveled blocks.
profile=[(-.235,1.70),(-.10,1.89),(.20,1.84),(.20,1.60),(-.11,1.57)]
verts=[(sx*.19,y,z) for sx in (-1,1) for y,z in profile]
faces=[tuple(reversed(range(5))),tuple(range(5,10))]
faces += [(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)]
mesh('Head · sloped visor helmet',verts,faces,'Head',
     ['303538','35393C','464A4D','292E31','252A2D','303538'])


def visor_y(z):
    return -.235+(1.70-z)*(.125/.13)-.003


mesh('Head · recessed dark face',[(x,visor_y(z),z) for x,z in
     [(-.163,1.69),(.163,1.69),(.122,1.588),(-.122,1.588)]],[(0,1,2,3)],'Head',['0E1215'])
mesh('Head · narrow scarlet visor',[(x,visor_y(z)-.002,z) for x,z in
     [(-.137,1.677),(.137,1.677),(.128,1.654),(-.128,1.654)]],[(0,1,2,3)],'Head',glowing=True)

leg_points={}
arm_points={}
for side,sx in [('R',-1),('L',1)]:
    hip=Vector((sx*.285,0,.955))
    knee=Vector((sx*.31,-.025,.57))
    ankle=Vector((sx*.325,.027,.15))
    leg_points[side]=(hip,knee,ankle)
    upper,lower,foot=side+'.UpperLeg',side+'.LowerLeg',side+'.Foot'
    cylinder(side+' hip hinge',hip,(1,0,0),.082,.20,'Hips',['24292C'])
    beam(side+' tapered thigh',hip.lerp(knee,.08),hip.lerp(knee,.83),
         [(.285,.30),(.305,.31),(.23,.245)],upper,6,levels=[0,.16,1])
    cylinder(side+' knee hinge',knee,(1,0,0),.088,.285,lower,['343A3D','292E31'])
    x=knee.x
    p=[(x+dx,z) for dx,z in [(-.086,.663),(.082,.663),(.12,.603),(.082,.493),(-.084,.493),(-.12,.585)]]
    plate(side+' faceted pale kneecap',p,-.164,-.066,lower,pale,ridge=.025)
    beam(side+' armored shin',knee.lerp(ankle,.13),knee.lerp(ankle,.94),
         [(.265,.275),(.29,.29),(.22,.23)],lower,6,levels=[0,.15,1])
    cylinder(side+' ankle hinge',ankle,(1,0,0),.054,.18,foot,['272D30'])
    x=ankle.x
    mesh(side+' angular boot',[(x-.14,-.25,.012),(x+.14,-.25,.012),(x+.14,.145,.012),(x-.14,.145,.012),
                              (x-.115,-.235,.093),(x+.115,-.235,.093),(x+.12,.068,.21),(x-.12,.068,.21)],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],foot,
         ['282D30','484D50','34393C','303538'])

    shoulder=Vector((sx*.565,0,1.60))
    elbow=Vector((sx*.925,0,1.60))
    wrist=Vector((sx*1.305,0,1.60))
    arm_points[side]=(shoulder,elbow,wrist)
    upper,lower,hand=side+'.UpperArm',side+'.Forearm',side+'.Hand'
    cylinder(side+' shoulder hinge',shoulder,(0,1,0),.115,.29,upper,['24292C','3D4245'])
    p=[(sx*x,z) for x,z in [(.47,1.73),(.65,1.795),(.80,1.69),(.765,1.51),(.56,1.48),(.47,1.57)]]
    plate(side+' angular pale pauldron',p,-.18,.15,upper,pale,ridge=.034)
    beam(side+' upper arm',shoulder.lerp(elbow,.39),shoulder.lerp(elbow,.87),
         [(.18,.20),(.17,.185)],upper)
    cylinder(side+' elbow hinge',elbow,(0,1,0),.074,.20,lower,['343A3D','292E31'])
    beam(side+' wedge gauntlet',elbow.lerp(wrist,.12),elbow.lerp(wrist,.91),
         [(.24,.275),(.31,.32),(.21,.23)],lower,6,levels=[0,.23,1])
    cylinder(side+' wrist hinge',wrist,(1,0,0),.052,.085,hand,['24292C'])
    beam(side+' armored palm',(sx*1.325,0,1.60),(sx*1.43,0,1.60),
         [(.205,.20),(.19,.20)],hand,6)
    # Two broad mechanical fingers echo Lancer's pincer but form a compact fist.
    for finger,dz in [('upper',.06),('lower',-.06)]:
        beam(side+' '+finger+' grasping finger',(sx*1.415,-.012,1.60+dz),
             (sx*1.54,-.047,1.60+dz*.65),[(.083,.185),(.067,.135)],hand,
             colors=['33393C','42494C','2C3235'])

# Compact rigid mechanical rig, ready for later locomotion and weapon additions.
arm_data=bpy.data.armatures.new('BULWARK · mechanical skeleton')
rig=bpy.data.objects.new('Bulwark',arm_data)
asset.objects.link(rig)
rig['generator']=TAG
rig['asset']='Hollow Legion / 03 Bulwark'
rig['front_axis']='-Y in Blender; +Z in glTF'
rig['notes']='T-pose rest rig; separate shield attached to L.EquipmentSocket. Right hand reserved for later equipment.'
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')


def bone(name,head,tail,parent=None,connected=False,deform=True):
    b=arm_data.edit_bones.new(name)
    b.head,b.tail=head,tail
    b.use_deform=deform
    if parent:
        b.parent=arm_data.edit_bones[parent]
        b.use_connect=connected
    return b


bone('Root',(0,0,0),(0,0,.18))
bone('Hips',(0,0,.955),(0,0,1.10),'Root')
bone('Spine',(0,0,1.10),(0,0,1.60),'Hips',True)
bone('Head',(0,0,1.60),(0,0,1.89),'Spine',True)
for side,(hip,knee,ankle) in leg_points.items():
    bone(side+'.UpperLeg',hip,knee,'Hips')
    bone(side+'.LowerLeg',knee,ankle,side+'.UpperLeg',True)
    bone(side+'.Foot',ankle,(ankle.x,-.28,.06),side+'.LowerLeg',True)
for side,(shoulder,elbow,wrist) in arm_points.items():
    sx=1 if side=='L' else -1
    bone(side+'.UpperArm',shoulder,elbow,'Spine')
    bone(side+'.Forearm',elbow,wrist,side+'.UpperArm',True)
    bone(side+'.Hand',wrist,(sx*1.55,0,1.60),side+'.Forearm',True)
    bone(side+'.EquipmentSocket',(sx*1.46,-.03,1.60),(sx*1.46,-.14,1.60),side+'.Hand',deform=False)
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
model=bpy.context.object
model.name='Bulwark_Armor'
model.data.name='Bulwark · rigid-skinned armor'
model.parent=rig
deform=model.modifiers.new('Mechanical articulation','ARMATURE')
deform.object=rig
rig.display_type='WIRE'
rig.show_in_front=True
for pose in rig.pose.bones:
    pose.rotation_mode='XYZ'

import runpy
shield=runpy.run_path(str(HERE/'build_shield.py'))['build_shield'](rig,mesh)
models=[model,shield]

# All three supplied references are packed into the authoring file.
for label,filename,position,rotation,size in [
    ('Front','bulwark-t-pose-reference.png',(0,.55,.955),(math.pi/2,0,0),3.23),
    ('Side','bulwark-t-pose-side.png',(.85,0,.955),(math.pi/2,0,math.pi/2),3.08),
    ('Top','bulwark-t-pose-top.png',(0,0,-.05),(0,0,0),3.23),
]:
    image=bpy.data.images.load(str(HERE/filename))
    image.pack()
    image.filepath='//'+filename
    ref=bpy.data.objects.new('REFERENCE · '+label,None)
    references.objects.link(ref)
    ref.empty_display_type='IMAGE'
    ref.data=image
    ref.empty_display_size=size
    ref.empty_image_depth='BACK'
    ref.color=(1,1,1,.5)
    ref.location,ref.rotation_euler=position,rotation
references.hide_viewport=True

floor_mat=material('Studio · neutral grey','B8B8B2',0,.9)
data=bpy.data.meshes.new('Studio ground')
data.from_pydata([(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[],[(0,1,2,3)])
floor=bpy.data.objects.new('Studio ground',data)
stage.objects.link(floor)
data.materials.append(floor_mat)
world=bpy.data.worlds.new('BULWARK · soft studio')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.45,.48,.52,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.25
scene.world=world


def aim(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


for name,pos,power,size,color in [
    ('Key',(-3,-4,5),450,4,(1,.94,.86)),
    ('Fill',(3,-1,3),230,3,(.85,.91,1)),
    ('Rim',(.5,3,4),500,3,(1,1,.97)),
]:
    data=bpy.data.lights.new(name,'AREA')
    data.energy,data.shape,data.size,data.color=power,'DISK',size,color
    obj=bpy.data.objects.new(name,data)
    stage.objects.link(obj)
    obj.location=pos
    aim(obj,(0,0,1))
for name,pos,target,scale in [
    ('Hero',(-3.5,-6,2.8),(0,0,.97),2.65),
    ('Front',(.15,-5,1.08),(.15,0,1.08),4.5),
    ('Side',(-5,0,1.08),(0,0,1.08),2.55),
    ('Top',(0,0,5),(0,0,0),4.5),
    ('Shield',(.91,-5,.875),(.91,0,.875),1.8),
]:
    data=bpy.data.cameras.new('CAM · '+name)
    data.type,data.ortho_scale='ORTHO',scale
    obj=bpy.data.objects.new('CAM · '+name,data)
    stage.objects.link(obj)
    obj.location=pos
    aim(obj,target)
scene.camera=bpy.data.objects['CAM · Hero']
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x,scene.render.resolution_y=1400,1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.filepath=str(HERE/'bulwark-preview.png')
scene.render.fps=24
for obj in stage.objects:
    obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.shading.type='MATERIAL'
            space.overlay.show_extras=False
            space.region_3d.view_distance=4.2
            space.region_3d.view_location=(0,0,.95)
            space.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()

OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
model.select_set(True)
shield.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active=model
bpy.ops.export_scene.gltf(filepath=str(OUT/'bulwark.glb'),export_format='GLB',use_selection=True,
                          use_active_scene=True,export_apply=True,export_animations=False,
                          export_skins=True,export_yup=True,export_extras=True,
                          export_cameras=False,export_lights=False)
bpy.ops.object.select_all(action='DESELECT')
static_parts=[]
static_meshes=[]
for source in models:
    data=source.data.copy()
    obj=bpy.data.objects.new('Bulwark_Instanced',data)
    asset.objects.link(obj)
    obj.select_set(True)
    static_parts.append(obj)
    static_meshes.append(data)
bpy.context.view_layer.objects.active=static_parts[0]
bpy.ops.object.join()
static=bpy.context.object
bpy.ops.export_scene.gltf(filepath=str(OUT/'bulwark-instanced.glb'),export_format='GLB',use_selection=True,
                          use_active_scene=True,export_apply=True,export_animations=False,
                          export_skins=False,export_yup=True,export_extras=True,
                          export_cameras=False,export_lights=False)
bpy.data.objects.remove(static,do_unlink=True)
for data in static_meshes:
    if data.users==0:
        bpy.data.meshes.remove(data)
rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.context.preferences.filepaths.save_version=0
bpy.context.view_layer.update()
bounds=[obj.matrix_world@Vector(v) for obj in models for v in obj.bound_box]
result=dict(revision=3,style='Hollow Legion faceted armor',
            triangles=sum(len(f.vertices)-2 for obj in models for f in obj.data.polygons),
            body_triangles=sum(len(f.vertices)-2 for f in model.data.polygons),
            shield_triangles=sum(len(f.vertices)-2 for f in shield.data.polygons),materials=2,
            bones=len(arm_data.bones),dimensions_m=[max(p[i] for p in bounds)-min(p[i] for p in bounds) for i in range(3)],
            animations=[],pose='T-pose',equipment=['Shield'],rigged_bytes=(OUT/'bulwark.glb').stat().st_size,
            instanced_bytes=(OUT/'bulwark-instanced.glb').stat().st_size,
            front_axis='+Z in glTF',sockets=['L.EquipmentSocket','R.EquipmentSocket'])
(HERE/'asset-stats.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2),flush=True)

# Store a readable standing pose in the editor; exports and reference cameras use rest.
import runpy
runpy.run_path(str(HERE/'pose_bulwark.py'))['set_display_pose'](rig)
scene.render.resolution_x=1200
scene.render.resolution_y=1200
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'bulwark.blend'))
runpy.run_path(str(HERE/'animate_bulwark.py'))
runpy.run_path(str(HERE/'animate_shield_thrust.py'))
runpy.run_path(str(HERE/'animate_defeated.py'))
