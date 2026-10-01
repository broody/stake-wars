"""Render inspection poses from the saved rig in a background process."""
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
bpy.data.objects['SectorTrooper_Rig'].animation_data.action = bpy.data.actions['Rig_Check']
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.camera = bpy.data.objects['TROOPER CAM | Tpose Hero']
outputs = []
for frame,name in [(25,'rig-preview.png'),(49,'rig-crouch.png'),(73,'rig-step.png'),(97,'rig-reach.png')]:
    scene.frame_set(frame)
    scene.render.filepath = str(HERE/name)
    bpy.ops.render.render(write_still=True)
    outputs.append(scene.render.filepath)
scene.frame_set(25)
result = {'renders':outputs}
