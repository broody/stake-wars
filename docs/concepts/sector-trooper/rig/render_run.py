"""Render actual Run poses from hero/side cameras in background Blender."""
from pathlib import Path
import os
import bpy

assert bpy.app.background, 'Use a separate render process'
HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get('RUN_RENDER_DIR','/tmp/sector-trooper-run-frames'))
OUT.mkdir(parents=True,exist_ok=True)
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
rig.animation_data.action = bpy.data.actions['Run']
period = int(rig.animation_data.action['cycle_frames'])
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.use_persistent_data = True
scene.render.resolution_x = scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
for label in ['Hero','Side']:
    scene.camera = bpy.data.objects['TROOPER CAM | Run '+label]
    for frame in range(1,period+1):
        scene.frame_set(frame)
        scene.render.filepath = str(OUT/(label.lower()+'-%04d.png'%frame))
        bpy.ops.render.render(write_still=True)
scene.camera = bpy.data.objects['TROOPER CAM | Run Hero']
scene.cycles.samples = 48
scene.render.resolution_x = scene.render.resolution_y = 1200
scene.frame_set(1)
scene.render.filepath = str(HERE/'run-preview.png')
bpy.ops.render.render(write_still=True)
result = {'frames':str(OUT),'fps':24,'cycle_frames':period,'views':['Hero','Side']}
