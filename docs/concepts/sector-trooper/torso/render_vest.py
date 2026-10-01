"""Render the real vest/waist geometry with head, legs and shoulder hardware hidden.

Render visibility changes are temporary, never written back to the blend file.
Run in a separate background Blender process after finish_vest_revision.py.
"""
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.render.resolution_x,scene.render.resolution_y=1000,1200
scene.render.resolution_percentage=100
hidden={o.name:o.hide_render for o in scene.objects}
outputs=[]
try:
    for obj in scene.objects:
        if obj.name.startswith('HEAD |') and not obj.name.endswith('15 neck socket'):
            obj.hide_render=True
        if obj.name.startswith('LEGS |'):
            obj.hide_render=True
        if obj.name.startswith('TORSO |') and any((' '+n+' ') in obj.name for n in ['11','12','13','14','15']):
            obj.hide_render=True
    for camera,filename in [('Front','vest-front.png'),('Hero','vest-preview.png'),
                            ('Side','vest-side.png'),('Rear','vest-rear.png')]:
        scene.camera=bpy.data.objects['TROOPER CAM | Vest '+camera]
        scene.render.filepath=str(HERE/filename)
        bpy.ops.render.render(write_still=True,scene=scene.name)
        outputs.append(scene.render.filepath)
finally:
    for name,value in hidden.items():
        bpy.data.objects[name].hide_render=value
result={'renders':outputs}
