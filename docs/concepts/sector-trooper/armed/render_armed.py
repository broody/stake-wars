"""Render the equipped idle in a separate background Blender process."""
from pathlib import Path
import bpy
HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1100
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.frame_set(1)
camera_prefix=globals().get('CAMERA_PREFIX','Armed')
file_prefix=globals().get('FILE_PREFIX','armed-idle')
for view,name in [('Hero',file_prefix+'.png'),('Side',file_prefix+'-side.png')]:
    scene.camera=bpy.data.objects['TROOPER CAM | '+camera_prefix+' '+view]
    scene.render.filepath=str(HERE/name)
    bpy.ops.render.render(write_still=True)
