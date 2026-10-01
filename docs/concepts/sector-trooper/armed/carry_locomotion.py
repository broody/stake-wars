"""Author a nonfiring chest-carry gait using Armed_Idle's approved attachment.

Pass SOURCE='Run', 'Walk', 'Strafe_Left', 'Strafe_Right' or 'Backward' through Blender MCP.
The rifle and both hands follow the chest rather than aiming independently.
"""
from pathlib import Path
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
SOURCE=globals().get('SOURCE','Strafe_Left')
TARGETS={'Run':'Run_Carry_Forward','Walk':'Walk_Carry_Forward','Strafe_Left':'Strafe_Carry_Left','Strafe_Right':'Strafe_Carry_Right','Backward':'Backward_Carry'}
assert SOURCE in TARGETS
TARGET=TARGETS[SOURCE]
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig'];rifle=bpy.data.objects['SectorTrooper_Rifle']
assert bpy.data.filepath.endswith('/head/sector-trooper-head.blend')
if bpy.context.screen.is_animation_playing:bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
rig.animation_data.action=bpy.data.actions['Armed_Idle']
scene.frame_set(1);bpy.context.view_layer.update()
idle_chest=rig.pose.bones['chest'].matrix.copy()
idle_gun=rifle.matrix_world.copy()
idle_arms={pb.name:(pb.location.copy(),pb.rotation_euler.copy(),pb.scale.copy())
           for pb in rig.pose.bones if pb.name.startswith(('clavicle.','upper_arm.','forearm.','hand.'))}
socket_to_rifle=rig.pose.bones['weapon'].matrix.inverted()@rifle.matrix_world
source=bpy.data.actions[SOURCE];period=int(source['cycle_frames'])
rig.animation_data.action=source
base=[]
for step in range(period*4):
    f=1+step/4;scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
    base.append({pb.name:(pb.location.copy(),pb.rotation_euler.copy(),pb.scale.copy()) for pb in rig.pose.bones})
rig.animation_data.action=None
old=bpy.data.actions.get(TARGET)
if old:
    assert old.get('generator')=='carry_locomotion_v1'
    bpy.data.actions.remove(old)
action=bpy.data.actions.new(TARGET);action.use_fake_user=True
action['generator']='carry_locomotion_v1';action['cycle_frames']=period
action['gait_cycle_frames']=period;action['fps']=24;action['samples_per_frame']=4
action['source_gait']=SOURCE;action['weapon_state']='chest_carry';action['firing']=False
for field in ['speed_mps','stride_m','stance_fraction','in_place','direction_x','movement','facing']:
    if field in source:action[field]=source[field]
rig.animation_data.action=action
previous={};errors=[]
for step in range(period*4+1):
    f=1+step/4;scene.frame_set(int(f),subframe=f%1)
    for pb in rig.pose.bones:pb.location,pb.rotation_euler,pb.scale=base[step%(period*4)][pb.name]
    # All arm bones descend from the chest. Reuse the idle's local pose directly
    # so wrist alignment and forearm roll stay identical throughout the gait.
    for name,transforms in idle_arms.items():
        pb=rig.pose.bones[name];pb.location,pb.rotation_euler,pb.scale=transforms
    bpy.context.view_layer.update()
    chest_delta=rig.pose.bones['chest'].matrix@idle_chest.inverted()
    gun=chest_delta@idle_gun
    rig.pose.bones['weapon'].matrix=gun@socket_to_rifle.inverted()
    bpy.context.view_layer.update()
    errors.append(max((rig.pose.bones['forearm.'+s].tail-rig.pose.bones['hand.'+s].head).length for s in ['R','L']))
    for pb in rig.pose.bones:
        if pb.name in previous:pb.rotation_euler.make_compatible(previous[pb.name])
        previous[pb.name]=pb.rotation_euler.copy()
        for channel in ['location','rotation_euler','scale']:pb.keyframe_insert(channel,frame=f,group=pb.name)
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_start,scene.frame_end=1,period;scene.render.fps=24
collection=bpy.data.collections['13 | ARMED - rifle and preview']
for label,offset in [('Hero',(-4,-6,1.1)),('Front',(0,-6,.2)),('Side',(-6,0,.2))]:
    name='TROOPER CAM | '+TARGET+' '+label
    cam=bpy.data.objects.get(name)
    if not cam:
        cam=bpy.data.objects.new(name,bpy.data.cameras.new(name));collection.objects.link(cam)
    target=Vector((0,-.16,-.33));cam.location=target+Vector(offset)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=2.5
scene.camera=bpy.data.objects['TROOPER CAM | '+TARGET+' Hero']
scene.frame_set(1);bpy.context.view_layer.update()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active;space.use_local_camera=False;space.camera=scene.camera
        space.region_3d.view_perspective='CAMERA';space.region_3d.view_camera_zoom=12
        space.region_3d.view_camera_offset=(0,0);space.overlay.show_overlays=False;space.show_region_ui=False
result={'action':TARGET,'frames':[1,period],'max_wrist_error':max(errors),'speed_mps':action['speed_mps']}
