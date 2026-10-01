"""Render both firing strafes from the hero and side cameras in background Blender."""
from pathlib import Path
import bpy,runpy
for side in ['Left','Right']:
    bpy.data.objects['SectorTrooper_Rig'].animation_data.action=bpy.data.actions['Strafe_Shoot_'+side]
    runpy.run_path(str(Path(__file__).with_name('render_armed.py')),
                  init_globals={'CAMERA_PREFIX':'Strafe Shooting '+side,'FILE_PREFIX':'strafe-shoot-'+side.lower()})
