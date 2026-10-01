"""Author Armed_Idle in the existing trooper through Blender MCP.

Analytic two-bone arm posing is baked to FK; existing actions stay untouched.
The standalone rifle remains the source asset. Run in the character file.
"""
from pathlib import Path
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
assert bpy.data.filepath.endswith('/head/sector-trooper-head.blend')
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
if rig.animation_data.action: rig.animation_data.action.use_fake_user = True
rig.animation_data.action = None

collection = bpy.data.collections.get('13 | ARMED - rifle and preview')
if not collection:
    collection = bpy.data.collections.new('13 | ARMED - rifle and preview')
    scene.collection.children.link(collection)
rifle = bpy.data.objects.get('SectorTrooper_Rifle')
if not rifle:
    with bpy.data.libraries.load(str(HERE.parent/'rifle/sector-trooper-rifle.blend'),link=False) as (src,dst):
        dst.objects = [n for n in src.objects if n == 'SectorTrooper_Rifle' or n.startswith(('RIFLE |','RIFLE CUTTER |','ATTACH |'))]
    for obj in dst.objects:
        if obj: collection.objects.link(obj)
    rifle = bpy.data.objects['SectorTrooper_Rifle']

old = bpy.data.actions.get('Armed_Idle')
if old:
    assert old.get('generator') == 'armed_idle_v1'
    bpy.data.actions.remove(old)
action = bpy.data.actions.new('Armed_Idle')
action.use_fake_user = True
action['generator'] = 'armed_idle_v1'
action['cycle_frames'] = 72
action['pose_description'] = 'Relaxed rifle carry across the chest; forward aiming is a separate firing stance'
rig.animation_data.action = action
rest = {b.name:b.matrix_local.copy() for b in rig.data.bones}
rifle.parent = None
rifle.matrix_parent_inverse = Matrix.Identity(4)
rifle_rotation = Matrix.Rotation(math.radians(68),3,'Z') @ Matrix.Rotation(math.radians(-28),3,'X')
rifle_scale = Matrix.Diagonal((.9,1,1))
grip_base = Vector((-.24,-.30,-.39))
rifle_base = (rifle_rotation @ rifle_scale).to_4x4()
rifle_base.translation = grip_base

def set_segment(name, head, tail):
    rotation = (rest[name].to_3x3().col[1]).rotation_difference((tail-head).normalized()).to_matrix() @ rest[name].to_3x3()
    mat = rotation.to_4x4(); mat.translation = head
    rig.pose.bones[name].matrix = mat
    bpy.context.view_layer.update()

def arm(suffix, wrist, hand_rotation):
    upper, lower = 'upper_arm.'+suffix, 'forearm.'+suffix
    shoulder = rig.pose.bones[upper].head.copy()
    a, b = rig.data.bones[upper].length, rig.data.bones[lower].length
    d = (wrist-shoulder).length
    assert abs(a-b) < d < a+b, (suffix,d,a+b)
    axis = (wrist-shoulder).normalized()
    pole = Vector((-.7 if suffix=='R' else .7,.15,-1))
    bend = (pole-axis*pole.dot(axis)).normalized()
    along = (a*a-b*b+d*d)/(2*d)
    elbow = shoulder+axis*along+bend*math.sqrt(max(0,a*a-along*along))
    set_segment(upper,shoulder,elbow)
    set_segment(lower,elbow,wrist)
    mat = hand_rotation.to_4x4(); mat.translation = wrist
    rig.pose.bones['hand.'+suffix].matrix = mat
    bpy.context.view_layer.update()

# Orient palm length upward around the pistol grip, and forward under the foreguard.
# Use explicit orthonormal frames: hand bone Y is wrist-to-knuckles.
def hand_frame(direction, palm_back):
    y = Vector(direction).normalized()
    z = Vector(palm_back); z = (z-y*z.dot(y)).normalized()
    x = y.cross(z).normalized()
    return Matrix((x,y,z)).transposed()
hand_R = hand_frame((.35,-.93,.03),rifle_rotation@Vector((-1,0,0)))
hand_L = rifle_rotation @ hand_frame((-.7,-.7,.1),(0,0,-1))
errors = []
for frame in range(1,74):
    scene.frame_set(frame)
    for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    breath = math.sin(2*math.pi*(frame-1)/72)
    rig.pose.bones['pelvis'].location = rest['pelvis'].to_3x3().inverted() @ Vector((0,0,-.018))
    rig.pose.bones['chest'].location = rest['chest'].to_3x3().inverted() @ Vector((0,-.0015*breath,.003*breath))
    rig.pose.bones['chest'].rotation_euler.x = math.radians(2+.55*breath)
    bpy.context.view_layer.update()
    rifle.matrix_world = rifle_base.copy()
    rifle.location.z += .004*breath
    bpy.context.view_layer.update()
    main = bpy.data.objects['ATTACH | Main grip'].matrix_world.translation
    support = bpy.data.objects['ATTACH | Support hand'].matrix_world.translation
    # Palm centre lies 9 cm along the hand bone from the wrist.
    # Solve the wrist orientation with the elbow: the hand continues the forearm,
    # while the palm stays seated at the grip rather than folding upwards.
    for _ in range(16 if frame==1 else 0):
        wrist_R = main-hand_R@Vector((0,.085,-.025))
        arm('R',wrist_R,hand_R)
        direction=(rig.pose.bones['forearm.R'].tail-rig.pose.bones['forearm.R'].head).normalized()
        hand_R=hand_frame(direction,rifle_rotation@Vector((-1,0,0)))
    wrist_R = main-hand_R@Vector((0,.085,-.025))
    wrist_L = support-hand_L@Vector((0,.075,-.012))
    arm('R',wrist_R,hand_R)
    lower=rig.pose.bones['forearm.R']
    mat=hand_frame((lower.tail-lower.head).normalized(),hand_R.col[2]).to_4x4();mat.translation=lower.head.copy()
    lower.matrix=mat
    bpy.context.view_layer.update()
    mat=hand_R.to_4x4();mat.translation=wrist_R
    rig.pose.bones['hand.R'].matrix=mat
    bpy.context.view_layer.update()
    arm('L',wrist_L,hand_L)
    for pb in rig.pose.bones:
        pb.keyframe_insert('location',frame=frame,group=pb.name)
        pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name)
        pb.keyframe_insert('scale',frame=frame,group=pb.name)
    errors.append(max((rig.pose.bones['forearm.'+s].tail-w).length for s,w in [('R',wrist_R),('L',wrist_L)]))

scene.frame_set(1)
bpy.context.view_layer.update()
rifle.matrix_world = rifle_base
world = rifle.matrix_world.copy()
rifle.parent = rig
rifle.parent_type = 'BONE'
rifle.parent_bone = 'weapon' if 'weapon' in rig.data.bones else 'hand.R'
bpy.context.view_layer.update()
rifle.matrix_world = world
bpy.context.view_layer.update()
rifle['attachment'] = 'Right hand; main grip and support hand fitted in Armed_Idle'
rifle['equipped_scale'] = 1.0
scene.frame_start,scene.frame_end = 1,72
scene.render.fps = 24
for label,offset in [('Hero',(-4,-6,1.1)),('Front',(0,-6,.2)),('Side',(-6,0,.2))]:
    name = 'TROOPER CAM | Armed '+label
    cam = bpy.data.objects.get(name)
    if not cam:
        cam = bpy.data.objects.new(name,bpy.data.cameras.new(name))
        collection.objects.link(cam)
    target = Vector((0,-.16,-.33))
    cam.location = target+Vector(offset)
    cam.rotation_euler = (target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.5
scene.camera = bpy.data.objects['TROOPER CAM | Armed Hero']
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.overlay.show_overlays = False
            area.spaces.active.shading.type = 'MATERIAL'
scene.frame_set(1)
bpy.context.view_layer.update()
result = {'action':action.name,'frames':[1,72],'max_wrist_error':max(errors),'rifle':rifle.name}
