"""Forward walking fire: original grounded footwork plus an aiming/recoil layer.

84 frames combine three 28-frame strides and seven 12-frame firing cycles.
The preview is in place, at the original walk's 0.72 m/s intended actor speed.
"""
from pathlib import Path
import ast, math
import bpy
from mathutils import Matrix, Vector
HERE=Path(__file__).resolve().parent
SOURCE=globals().get('SOURCE','Walk')
TARGET=globals().get('TARGET','Walk_Shoot_Forward')
CAMERA_PREFIX=globals().get('CAMERA_PREFIX','Walk Shooting')
TAG=globals().get('TAG','walk_shoot_v1')
BRACE_OFFSET=globals().get('BRACE_OFFSET',(0,-.02,-.035))
PELVIS_NEUTRAL_Z=globals().get('PELVIS_NEUTRAL_Z',-.021)
GUN_Z=globals().get('GUN_Z',-.275)
GUN_Y=globals().get('GUN_Y',-.18)
SPINE_PITCH=globals().get('SPINE_PITCH',8)
CHEST_PITCH=globals().get('CHEST_PITCH',5)
HEAD_PITCH=globals().get('HEAD_PITCH',-10)
scene=bpy.context.scene
rig=bpy.data.objects['SectorTrooper_Rig']
rifle=bpy.data.objects['SectorTrooper_Rifle']
assert bpy.data.filepath.endswith('/head/sector-trooper-head.blend')
if bpy.context.screen.is_animation_playing:bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
assert 'weapon' in rig.data.bones
rig.animation_data.action=bpy.data.actions['Armed_Idle']
scene.frame_set(1);bpy.context.view_layer.update()
socket_to_rifle=rig.pose.bones['weapon'].matrix.inverted()@rifle.matrix_world
rifle_scale=Matrix.Diagonal((.9,1,1,1))
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
tree=ast.parse((HERE/'armed_idle.py').read_text())
names={'set_segment','arm','hand_frame'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'armed_arm_helpers','exec'))

# Sample the approved gait before creating the new action.
source=bpy.data.actions[SOURCE]
gait_period=int(source['cycle_frames'])
period=math.lcm(gait_period,12)
rig.animation_data.action=source
walk=[]
for step in range(gait_period*4):
    frame=1+step/4
    scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
    walk.append({pb.name:(pb.location.copy(),pb.rotation_euler.copy(),pb.scale.copy()) for pb in rig.pose.bones})
rig.animation_data.action=None
name=TARGET
old=bpy.data.actions.get(name)
if old:
    assert old.get('generator')==TAG
    bpy.data.actions.remove(old)
action=bpy.data.actions.new(name);action.use_fake_user=True
action['generator']=TAG;action['cycle_frames']=period
action['gait_cycle_frames']=gait_period;action['fps']=24
for field in ['speed_mps','stride_m','stance_fraction','in_place','direction_x','movement']:
    if field in source:action[field]=source[field]
action['source_gait']=SOURCE
action['forward']='Blender -Y; glTF +Z'
action['shot_frames']=','.join(str(f) for f in range(1,period+1,12))
rig.animation_data.action=action
hand_R=hand_frame((.2,-.9,.15),(-1,0,0))
hand_L=hand_frame((-.7,-.7,.1),(0,0,-1))
errors=[]
previous_rotations={}
for step in range(period*4+1):
    frame=1+step/4
    scene.frame_set(int(frame),subframe=frame%1)
    for pb in rig.pose.bones:
        pb.location,pb.rotation_euler,pb.scale=walk[step%(gait_period*4)][pb.name]
    t=(frame-1)%12
    if t<=1.5:
        u=t/1.5;kick=u*u*(3-2*u)
    elif t<9:
        u=(t-1.5)/7.5;kick=1-u*u*(3-2*u)
    else:kick=0
    pelvis=rig.pose.bones['pelvis']
    pelvis_delta=rest['pelvis'].to_3x3()@pelvis.location
    pelvis.location+=rest['pelvis'].to_3x3().inverted()@Vector(BRACE_OFFSET)
    pelvis.rotation_euler.y+=math.radians(-12)
    side_lean=rig.pose.bones['spine'].rotation_euler.z*.5
    rig.pose.bones['spine'].rotation_euler=(math.radians(SPINE_PITCH),math.radians(-12),side_lean)
    rig.pose.bones['chest'].rotation_euler=(math.radians(CHEST_PITCH-1.6*kick),math.radians(-23),0)
    rig.pose.bones['head'].rotation_euler=(math.radians(HEAD_PITCH),math.radians(40),0)
    bpy.context.view_layer.update()
    gun_rotation=Matrix.Rotation(math.radians(-3.2*kick),3,'X')
    gun=gun_rotation.to_4x4()
    gun.translation=Vector((-.20+.25*pelvis_delta.x,GUN_Y+.030*kick,
                            GUN_Z+.35*(pelvis_delta.z-PELVIS_NEUTRAL_Z)+.007*kick))
    main=gun.translation.copy();support=gun@Vector((0,-.4176,.0112))
    if frame==1:
        for _ in range(24):
            wrist_R=main-hand_R@Vector((0,.085,-.025))
            arm('R',wrist_R,hand_R)
            lower=rig.pose.bones['forearm.R']
            hand_R=hand_frame((lower.tail-lower.head).normalized(),(-1,0,0))
    hr=gun_rotation@hand_R;hl=gun_rotation@hand_L
    for _ in range(5):
        wrist_R=main-hr@Vector((0,.085,-.025))
        arm('R',wrist_R,hr)
        lower=rig.pose.bones['forearm.R']
        aligned=hand_frame((lower.tail-lower.head).normalized(),(gun_rotation@hand_R).col[2])
        hr=hr.to_quaternion().slerp(aligned.to_quaternion(),.5).to_matrix()
    wrist_R=main-hr@Vector((0,.085,-.025))
    wrist_L=support-hl@Vector((0,.075,-.012))
    for suffix,wrist,rotation in [('R',wrist_R,hr),('L',wrist_L,hl)]:
        arm(suffix,wrist,rotation)
        lower=rig.pose.bones['forearm.'+suffix]
        mat=hand_frame((lower.tail-lower.head).normalized(),rotation.col[2]).to_4x4()
        mat.translation=lower.head.copy();lower.matrix=mat
        bpy.context.view_layer.update()
        mat=rotation.to_4x4();mat.translation=wrist
        rig.pose.bones['hand.'+suffix].matrix=mat
        bpy.context.view_layer.update()
    rig.pose.bones['weapon'].matrix=gun@rifle_scale@socket_to_rifle.inverted()
    bpy.context.view_layer.update()
    for pb in rig.pose.bones:
        if pb.name in previous_rotations:pb.rotation_euler.make_compatible(previous_rotations[pb.name])
        previous_rotations[pb.name]=pb.rotation_euler.copy()
        for channel in ['location','rotation_euler','scale']:
            pb.keyframe_insert(channel,frame=frame,group=pb.name)
    errors.append(max((rig.pose.bones['forearm.'+s].tail-w).length for s,w in [('R',wrist_R),('L',wrist_L)]))
# Dense sampled interpolation avoids independent curve overshoot separating hands
# from the prop, particularly when a shot falls between two foot-contact poses.
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:key.interpolation='LINEAR'
action['samples_per_frame']=4
scene.frame_start,scene.frame_end=1,period;scene.render.fps=24
collection=bpy.data.collections['13 | ARMED - rifle and preview']
for label,offset in [('Hero',(-4,-6,1.1)),('Front',(0,-6,.2)),('Side',(-6,0,.2))]:
    name='TROOPER CAM | '+CAMERA_PREFIX+' '+label
    cam=bpy.data.objects.get(name)
    if not cam:
        cam=bpy.data.objects.new(name,bpy.data.cameras.new(name));collection.objects.link(cam)
    target=Vector((0,-.18,-.32));cam.location=target+Vector(offset)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=2.5
scene.camera=bpy.data.objects['TROOPER CAM | '+CAMERA_PREFIX+' Hero']
scene.frame_set(1);bpy.context.view_layer.update()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active;space.use_local_camera=False;space.camera=scene.camera
        space.region_3d.view_perspective='CAMERA';space.region_3d.view_camera_zoom=12
        space.region_3d.view_camera_offset=(0,0)
        space.overlay.show_overlays=False;space.show_region_ui=False
result={'action':action.name,'frames':[1,period],'max_wrist_error':max(errors),'speed_mps':action['speed_mps']}
