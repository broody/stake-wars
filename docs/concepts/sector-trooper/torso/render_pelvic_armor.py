"""Inspect the belt-suspended plates with the actual waist and thighs visible."""
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.render.resolution_x,scene.render.resolution_y=1200,1000
scene.render.resolution_percentage=100
outputs=[]
for camera,filename in [('Front','pelvis-front.png'),('Side','pelvis-side.png'),
                        ('Rear Hero','pelvis-rear-preview.png'),('Rear','pelvis-rear.png'),('Hero','pelvis-preview.png')]:
    scene.camera=bpy.data.objects['TROOPER CAM | Pelvis '+camera]
    scene.render.filepath=str(HERE/filename)
    bpy.ops.render.render(write_still=True,scene=scene.name)
    outputs.append(scene.render.filepath)
result={'renders':outputs}
