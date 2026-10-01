"""Build the Hollow Legion Warden in a fresh background Blender.

blender --background --factory-startup --python build_warden.py
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
TAG = "stakewars_warden_v1"
assert bpy.app.background and not bpy.data.filepath, "Build in a fresh background process."
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene.name = "WARDEN | Studio"
scene["generator"] = TAG
scene.unit_settings.system = "METRIC"


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


asset = collection("01 · WARDEN — model & rig")
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
    p = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
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


armor = material("WARDEN · vertex-colored graphite", "303336", metal=.25, roughness=.65, vertex_color=True)
signal = material("WARDEN · scarlet sensors", "C21109", .1, .4, emission=1.1)
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



# Tall, narrow commander: ivory mask, split crown, pointed mantle and plate skirt.
beam('Torso · inverted wedge',(0,.02,1.63),(0,.02,2.38),
     [(.34,.27),(.57,.37),(.72,.39),(.57,.29)],'Spine',6,levels=[0,.35,.85,1])
beam('Waist · recessed core',(0,0,1.48),(0,0,1.75),[(.29,.24),(.32,.26)],'Hips',6,colors=['202528'])
plate('Pelvis · pointed belt',[(-.21,1.68),(0,1.58),(.21,1.68),(.16,1.42),(0,1.34),(-.16,1.42)],-.20,-.09,'Hips',ridge=.05)
plate('Chest · broad collar',[(-.35,2.35),(.35,2.35),(.26,2.18),(-.26,2.18)],-.225,-.12,'Spine',colors=['44484A','353A3D','2D3235'],ridge=.035)
# Actual open triangular rim over a dark inset, not a painted decal.
outer=[(-.29,2.20),(.29,2.20),(0,1.69)];inner=[(-.175,2.145),(.175,2.145),(0,1.82)]
verts=[(x,y,z) for profile,y in [(outer,-.23),(inner,-.27),(inner,-.24)] for x,z in profile]
faces=[(i,(i+1)%3,(i+1)%3+3,i+3) for i in range(3)]+[(i+3,(i+1)%3+3,(i+1)%3+6,i+6) for i in range(3)]
mesh('Chest · triangular armor frame',verts,faces,'Spine',['43484B','363B3E','272D30'])
mesh('Chest · sensor recess',[(x,-.241,z) for x,z in inner],[(0,1,2)],'Spine',['111618'])
mesh('Chest · crimson core',[(-.105,-.251,2.113),(.105,-.251,2.113),(0,-.251,1.915)],[(0,1,2)],'Spine',glowing=True)
for sx in [-1,1]:
 plate('Collar · raised prong',[(sx*.23,2.27),(sx*.34,2.32),(sx*.34,2.59),(sx*.26,2.59)],-.115,.08,'Spine',ridge=.025)
 plate('Mantle · pointed pauldron',[(sx*.35,2.41),(sx*.98,2.47),(sx*.45,2.18)],-.13,.20,'Spine',['43484B','303538','383D40'],ridge=.11)
# Narrow faceted ivory spear-mask with a recessed vertical slit.
beam('Neck',(0,0,2.34),(0,0,2.65),[(.19,.19),(.17,.17)],'Head',6,colors=['202628'])
plate('Head · dark helmet',[(-.16,2.79),(0,3.02),(.16,2.79),(.11,2.50),(0,2.45),(-.11,2.50)],-.035,.19,'Head',ridge=.05)
plate('Head · ivory mask',[(-.145,2.79),(0,3.04),(.145,2.79),(.084,2.56),(0,2.46),(-.084,2.56)],-.185,-.045,'Head',['B8B3A6','99968C','D0C8B7','AAA697'],ridge=.055)
mesh('Head · dark face slit',[(-.027,-.247,2.80),(.027,-.247,2.80),(.013,-.224,2.58),(-.013,-.224,2.58)],[(0,1,2,3)],'Head',['13191B'])
mesh('Head · red vertical eye',[(-.014,-.250,2.775),(.014,-.250,2.775),(.008,-.233,2.636),(-.008,-.233,2.636)],[(0,1,2,3)],'Head',glowing=True)
for sx in [-1,1]:
 # Two separate angular hooks leave an unmistakable diamond-shaped negative space.
 outer=[(sx*.09,3.61),(sx*.43,3.13),(sx*.16,2.92)]
 inner=[(sx*.11,3.35),(sx*.28,3.13),(sx*.075,3.00)]
 verts=[(x,y,z) for y in [-.005,.16] for x,z in outer+inner]
 faces=[(0,1,4,3),(1,2,5,4),(6,9,10,7),(7,10,11,8)]
 outline=[0,1,2,5,4,3]
 faces += [(outline[i],outline[(i+1)%6],outline[(i+1)%6]+6,outline[i]+6) for i in range(6)]
 mesh('Crown · open angular horn',verts,faces,'Head',['3E4447','262C2F','4B5052'])
# Rigid articulated skirt panels, flaring toward the floor.
for side,sx in [('R',-1),('L',1)]:
 name=side+'.Skirt'
 profile=[(sx*.20,1.65),(sx*.39,1.69),(sx*.83,.34),(sx*.30,.18)]
 plate(side+' skirt · long front plate',profile,-.25,-.13,name,['353A3D','2C3134','414649'],ridge=.04)
 plate(side+' skirt · pale hem',[(sx*.31,.185),(sx*.83,.345),(sx*.775,.49)],-.257,-.249,name,pale,ridge=.001)
 # Side panels taper back and sit clear of the front split.
 obj=plate(side+' skirt · side plate',[(sx*.40,1.63),(sx*.49,1.57),(sx*.92,.43),(sx*.79,.34)],-.07,.17,side+'.SkirtSide',dark,ridge=.04)
plate('Skirt · central pointed tabard',[(-.15,1.50),(.15,1.50),(.205,.16),(-.205,.16)],-.29,-.205,'Skirt.Center',['34393C','292F32','3F4447'],ridge=.03)
mesh('Skirt · ivory triangular insignia',[(-.085,-.325,.29),(.085,-.325,.29),(0,-.325,.44)],[(0,1,2)],'Skirt.Center',pale)
# Split rigid cape: broad planar facets, no cloth wrinkles.
for side,sx in [('R',-1),('L',1)]:
 pts=[(sx*.10,.20,2.37),(sx*.43,.20,2.31),(sx*1.00,.55,.39),(sx*.14,.67,.22),(sx*.28,.46,1.22)]
 verts=pts+[(x,y+.032,z) for x,y,z in pts]
 faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(5,9,6),(6,9,7),(7,9,8),(8,9,5)]+[(i,(i+1)%4,(i+1)%4+5,i+5) for i in range(4)]
 mesh(side+' cape · split armored drape',verts,faces,side+'.Cape',['181E21','22282B','292F32','202629'])
plate('Back · spine carapace',[(-.25,2.39),(.25,2.39),(.20,1.86),(0,1.72),(-.20,1.86)],.21,.31,'Spine',dark,ridge=-.07)
leg_points={};arm_points={}
for side,sx in [('R',-1),('L',1)]:
 hip=Vector((sx*.22,0,1.52));knee=Vector((sx*.26,-.02,.86));ankle=Vector((sx*.29,.025,.17));leg_points[side]=(hip,knee,ankle)
 upper,lower,foot=side+'.UpperLeg',side+'.LowerLeg',side+'.Foot'
 cylinder(side+' hip hinge',hip,(1,0,0),.075,.16,'Hips',['242A2D'])
 beam(side+' thigh',hip.lerp(knee,.09),hip.lerp(knee,.9),[(.22,.24),(.18,.19)],upper,6)
 cylinder(side+' knee',knee,(1,0,0),.082,.21,lower)
 beam(side+' shin',knee.lerp(ankle,.1),knee.lerp(ankle,.92),[(.20,.22),(.16,.17)],lower,6)
 x=ankle.x
 mesh(side+' angular boot',[(x-.13,-.29,.008),(x+.13,-.29,.008),(x+.12,.14,.008),(x-.12,.14,.008),(x-.105,-.255,.10),(x+.105,-.255,.10),(x+.10,.07,.24),(x-.10,.07,.24)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],foot,['343A3D','444A4D','2A3033'])
 shoulder=Vector((sx*.46,0,2.31));elbow=Vector((sx*.91,0,2.31));wrist=Vector((sx*1.32,0,2.31));arm_points[side]=(shoulder,elbow,wrist)
 upper,lower,hand=side+'.UpperArm',side+'.Forearm',side+'.Hand'
 cylinder(side+' shoulder',shoulder,(0,1,0),.105,.22,upper,['262C2F'])
 beam(side+' upper arm',shoulder.lerp(elbow,.2),shoulder.lerp(elbow,.85),[(.19,.19),(.17,.18)],upper,6)
 cylinder(side+' elbow',elbow,(0,1,0),.063,.20,lower)
 beam(side+' faceted forearm',elbow.lerp(wrist,.13),elbow.lerp(wrist,.90),[(.20,.22),(.25,.24),(.15,.16)],lower,6,levels=[0,.2,1])
 cylinder(side+' wrist',wrist,(1,0,0),.047,.075,hand)
 beam(side+' palm',(sx*1.36,0,2.31),(sx*1.46,0,2.31),[(.16,.16),(.16,.14)],hand,6)
 for j,dy in enumerate([-.065,0,.065]):
  if side=='R':
   # Closed C-shaped fingers surround the vertical staff in the guard pose.
   beam(side+' curled finger '+str(j),(-1.455,dy,2.32),(-1.545,dy,2.383),[(.045,.043),(.040,.041)],hand,4)
   beam(side+' curled fingertip '+str(j),(-1.545,dy,2.383),(-1.506,dy,2.449),[(.040,.041),(.028,.030)],hand,4)
  else:
   beam(side+' finger '+str(j),(sx*1.455,dy,2.32),(sx*1.565,dy,2.30),[(.045,.043),(.040,.041)],hand,4)
   beam(side+' fingertip '+str(j),(sx*1.565,dy,2.30),(sx*1.64,dy,2.275),[(.040,.041),(.028,.030)],hand,4)
 if side=='R':
  beam('R opposing thumb',(-1.40,-.075,2.38),(-1.46,-.075,2.45),[(.050,.047),(.042,.040)],hand,4)
  beam('R thumb tip',(-1.46,-.075,2.45),(-1.525,-.065,2.45),[(.042,.040),(.035,.034)],hand,4)
 else:
  beam(side+' opposing thumb',(sx*1.40,-.075,2.29),(sx*1.47,-.14,2.255),[(.050,.047),(.042,.040)],hand,4)
# Rest skeleton is T-shaped; all weighted parts use one rigid bone each.
arm_data=bpy.data.armatures.new('WARDEN · mechanical skeleton');rig=bpy.data.objects.new('Warden',arm_data);asset.objects.link(rig)
rig['generator']=TAG;rig['asset']='Hollow Legion / 05 Warden';rig['front_axis']='-Y Blender / +Z glTF'
rig['notes']='T-pose rest rig; independently articulated skirt and cape. Staff is a separate asset; attach at R.EquipmentSocket.'
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
 b=arm_data.edit_bones.new(name);b.head,b.tail=head,tail
 if parent:b.parent=arm_data.edit_bones[parent]
 return b
bone('Root',(0,0,0),(0,0,.2));bone('Hips',(0,0,1.52),(0,0,1.72),'Root');bone('Spine',(0,0,1.72),(0,0,2.39),'Hips');bone('Head',(0,0,2.39),(0,0,2.95),'Spine')
for side,(hip,knee,ankle) in leg_points.items():
 bone(side+'.UpperLeg',hip,knee,'Hips');bone(side+'.LowerLeg',knee,ankle,side+'.UpperLeg');bone(side+'.Foot',ankle,(ankle.x,-.24,.07),side+'.LowerLeg')
for side,(shoulder,elbow,wrist) in arm_points.items():
 sx=1 if side=='L' else -1
 bone(side+'.UpperArm',shoulder,elbow,'Spine');bone(side+'.Forearm',elbow,wrist,side+'.UpperArm');bone(side+'.Hand',wrist,(sx*1.55,0,2.31),side+'.Forearm');bone(side+'.EquipmentSocket',(sx*1.46,-.02,2.31),(sx*1.46,-.14,2.31),side+'.Hand')
 bone(side+'.Skirt',(sx*.27,-.17,1.60),(sx*.50,-.17,.25),'Hips');bone(side+'.SkirtSide',(sx*.43,.08,1.60),(sx*.80,.08,.38),'Hips');bone(side+'.Cape',(sx*.22,.24,2.34),(sx*.45,.55,.3),'Spine')
bone('Skirt.Center',(0,-.23,1.52),(0,-.23,.18),'Hips')
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();model=bpy.context.object;model.name='Warden_Armor';model.parent=rig
mod=model.modifiers.new('Rigid mechanical articulation','ARMATURE');mod.object=rig
rig.show_in_front=True;rig.display_type='WIRE'
# Separate equipment with origin at the base of its vertical shaft.
parts.clear()
cylinder('Staff · hex shaft',(0,0,1.44),(0,0,1),.035,2.84,'Staff',['404548','303639','515659'])
for z in [.18,1.40,2.68,2.78]:cylinder('Staff · collar',(0,0,z),(0,0,1),.057,.075,'Staff',pale if z==1.40 else dark)
beam('Staff · ground spike',(0,0,.008),(0,0,.14),[(.008,.008),(.067,.067)],'Staff',6)
beam('Staff · head socket',(0,0,2.72),(0,0,3.03),[(.14,.15),(.21,.19)],'Staff',6)
plate('Staff · asymmetric blade',[(-.24,3.10),(.21,3.76),(.19,2.88)],-.06,.06,'Staff',['63686A','3F4548','303639'],ridge=.065)
outer=[(-.085,3.11),(.145,3.44),(.136,3.005)];inner=[(-.025,3.125),(.109,3.33),(.106,3.065)]
verts=[(x,y,z) for profile,y in [(outer,-.125),(inner,-.128),(inner,-.119)] for x,z in profile]
faces=[(i,(i+1)%3,(i+1)%3+3,i+3) for i in range(3)]+[(i+3,(i+1)%3+3,(i+1)%3+6,i+6) for i in range(3)]
mesh('Staff · hollow triangular inset',verts,faces,'Staff',['252B2E','303639'])
mesh('Staff · sensor well',[(x,-.12,z) for x,z in inner],[(0,1,2)],'Staff',['111619'])
mesh('Staff · crimson marker',[(.045,-.13,3.13),(.095,-.13,3.215),(.092,-.13,3.11)],[(0,1,2)],'Staff',glowing=True)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();staff=bpy.context.object;staff.name='Warden_Staff'
for g in list(staff.vertex_groups):staff.vertex_groups.remove(g)
# Pack the user concept and generated reference without showing them in renders.
for filename in ['warden-original-concept.png','warden-t-pose-reference.png']:
 img=bpy.data.images.load(str(HERE/filename));img.pack();img.filepath='//'+filename
 ref=bpy.data.objects.new('REFERENCE · '+filename,None);references.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=img;ref.empty_display_size=4
 ref.location=(0,.8,1.8);ref.rotation_euler=(math.pi/2,0,0)
references.hide_viewport=True
floor_mat=material('Studio · neutral grey','B8B8B2',0,.9)
data=bpy.data.meshes.new('Studio ground')
data.from_pydata([(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[],[(0,1,2,3)])
floor=bpy.data.objects.new('Studio ground',data)
stage.objects.link(floor)
data.materials.append(floor_mat)
world=bpy.data.worlds.new('WARDEN · soft studio')
world.use_nodes=True
next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Color'].default_value=(.45,.48,.52,1)
next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Strength'].default_value=.25
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
    ('Hero',(-4,-7,3.6),(-.1,0,1.85),4.35),
    ('Front',(0,-6,1.85),(0,0,1.85),4.25),
    ('Side',(-6,0,1.85),(0,0,1.85),4.25),
    ('Back',(0,6,1.85),(0,0,1.85),4.25),
    ('Top',(0,0,7),(0,0,0),4.25),
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
scene.render.resolution_x,scene.render.resolution_y=1000,1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.filepath=str(HERE/'warden-preview.png')
scene.render.fps=24
for obj in stage.objects:
    obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.shading.type='MATERIAL'
            space.overlay.show_extras=False
            space.region_3d.view_distance=7.5
            space.region_3d.view_location=(-.35,0,1.8)
            space.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()


OUT.mkdir(parents=True,exist_ok=True)
def export(name,objects,skins):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_animations=False,export_skins=skins,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
export('warden.glb',[model,rig],True)
static=bpy.data.objects.new('Warden_Static',model.data.copy());asset.objects.link(static)
export('warden-instanced.glb',[static],False);data=static.data;bpy.data.objects.remove(static,do_unlink=True);bpy.data.meshes.remove(data)
export('warden-staff.glb',[staff],False)
staff.location=(-2.25,0,0)
bpy.context.view_layer.update()
bounds=[Vector(v) for v in model.bound_box]
stats=dict(triangles=sum(len(f.vertices)-2 for f in model.data.polygons),staff_triangles=sum(len(f.vertices)-2 for f in staff.data.polygons),materials=2,bones=len(rig.data.bones),animations=[],pose='T-pose',height_m=max(v.z for v in bounds)-min(v.z for v in bounds),front_axis='+Z in glTF',rigged_bytes=(OUT/'warden.glb').stat().st_size,staff_bytes=(OUT/'warden-staff.glb').stat().st_size,static_bytes=(OUT/'warden-instanced.glb').stat().st_size)
(HERE/'asset-stats.json').write_text(json.dumps(stats,indent=2)+'\n')
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'warden.blend'))
print(json.dumps(stats,indent=2),flush=True)

import runpy
runpy.run_path(str(HERE/'equip_staff.py'))

runpy.run_path(str(HERE/'animate_warden.py'))

runpy.run_path(str(HERE/'animate_defeated.py'))
