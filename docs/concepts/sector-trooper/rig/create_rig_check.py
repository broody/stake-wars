"""Create a five-second editable control animation for checking the rig."""
from pathlib import Path
import bpy
import runpy

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
assert rig.get('generator') == 'sector_trooper_rig_v1'
rig.animation_data_create()
old = rig.animation_data.action
if old:
    assert old.name == 'Rig_Check' and old.get('generator') == 'sector_trooper_rig_v1'
    rig.animation_data.action = None
    bpy.data.actions.remove(old)
poses = runpy.run_path(str(HERE/'pose_rig.py'))
sequence = [(1,'Rest'),(25,'Ready'),(49,'Crouch'),(73,'Step'),(97,'Reach'),(121,'Rest')]
for frame,label in sequence:
    poses['pose'](label)
    for pb in rig.pose.bones:
        for prop in ['location','rotation_euler']:
            pb.keyframe_insert(prop,frame=frame,group=pb.name)
    action = rig.animation_data.action
    action.name = 'Rig_Check'
    action['generator'] = 'sector_trooper_rig_v1'
    action['purpose'] = 'Rig posing demonstration, not gameplay locomotion'
action.use_fake_user = True
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = 'BEZIER'
                    key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'
for marker in list(scene.timeline_markers):
    if marker.name.startswith('RIG |'):
        scene.timeline_markers.remove(marker)
for frame,label in sequence:
    scene.timeline_markers.new('RIG | '+label,frame=frame)
scene.render.fps = 24
scene.frame_start,scene.frame_end = 1,121
scene.frame_set(25)
result = {'action':action.name,'frames':[1,121],'poses':sequence}
