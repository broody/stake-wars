"""Compare the three actual faction meshes under one set of studio lights."""
from pathlib import Path
import bpy
import runpy
from mathutils import Vector

here=Path(__file__).resolve().parent
scene=bpy.context.scene
runpy.run_path(str(here/'pose_bulwark.py'))['set_display_pose'](bpy.data.objects['Bulwark'])
bpy.data.objects['Bulwark'].location.x=1.25
for name,x in [('Mite',-1.55),('Lancer',-.25)]:
    with bpy.data.libraries.load(str(here.parent/name.lower()/(name.lower()+'.blend')),link=False) as (source,target):
        target.objects=[n for n in source.objects if n in [name,name+'_Armor']]
    for obj in target.objects:
        scene.collection.objects.link(obj)
        if obj.type=='ARMATURE':
            obj.animation_data_clear()
            obj.data.pose_position='REST'
            obj.location.x=x
        obj.hide_set(False)
camera=bpy.data.objects['CAM · Hero']
camera.location=(-3.4,-9,3.3)
camera.rotation_euler=(Vector((0,0,.95))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=5.4
scene.camera=camera
scene.render.resolution_x,scene.render.resolution_y=1800,1000
scene.cycles.samples=48
scene.render.filepath=str(here/'hollow-legion-lineup.png')
bpy.ops.render.render(write_still=True)
