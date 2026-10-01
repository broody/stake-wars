"""Render the actual Bulwark mesh from all four studio cameras."""
from pathlib import Path
import bpy
import runpy

out=Path(bpy.data.filepath).parent
scene=bpy.data.scenes['BULWARK | Studio']
bpy.context.window.scene=scene
rig=bpy.data.objects['Bulwark']
set_display_pose=runpy.run_path(str(out/'pose_bulwark.py'))['set_display_pose']
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=32
scene.cycles.use_denoising=True
for camera,filename,width,height in [
    ('Hero','bulwark-preview.png',1200,1200),
    ('Front','bulwark-front.png',1400,1000),
    ('Side','bulwark-side.png',1000,1000),
    ('Top','bulwark-top.png',1400,1000),
    ('Shield','bulwark-shield.png',1000,1200),
]:
    set_display_pose(rig, camera in ['Hero','Shield'])
    bpy.data.objects['Bulwark_Armor'].hide_render=camera=='Shield'
    scene.camera=bpy.data.objects['CAM · '+camera]
    scene.render.resolution_x,scene.render.resolution_y=width,height
    scene.render.filepath=str(out/filename)
    bpy.ops.render.render(write_still=True)
    print('Rendered:',scene.render.filepath,flush=True)
