"""Render both side-step loops in a disposable Blender process."""
from pathlib import Path
import os
import bpy

assert bpy.app.background
HERE = Path(__file__).resolve().parent
OUT = Path('/tmp/sector-trooper-strafe-frames')
OUT.mkdir(parents=True,exist_ok=True)
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.use_persistent_data = True
scene.render.resolution_x = scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
stills_only = os.environ.get('STRAFE_STILLS_ONLY')=='1'
for clip in ['Strafe_Left','Strafe_Right']:
    rig.animation_data.action = bpy.data.actions[clip]
    period = int(rig.animation_data.action['cycle_frames'])
    scene.camera = bpy.data.objects['TROOPER CAM | '+clip+' Front']
    for frame in ([1,4,8,11] if stills_only else range(1,period+1)):
        scene.frame_set(frame)
        scene.render.filepath = str(OUT/(clip.lower()+'-%04d.png'%frame))
        bpy.ops.render.render(write_still=True)
    if not stills_only:
        scene.camera = bpy.data.objects['TROOPER CAM | '+clip+' Hero']
        scene.frame_set(6)
        scene.render.filepath = str(HERE/(clip.lower()+'-preview.png'))
        bpy.ops.render.render(write_still=True)
result = {'frames':str(OUT),'fps':24,'cycle_frames':period}
