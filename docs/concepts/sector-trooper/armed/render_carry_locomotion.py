"""Render each chest-carry movement in background Blender."""
from pathlib import Path
import bpy,runpy
for clip in ['Strafe_Carry_Left','Strafe_Carry_Right','Backward_Carry']:
    bpy.data.objects['SectorTrooper_Rig'].animation_data.action=bpy.data.actions[clip]
    runpy.run_path(str(Path(__file__).with_name('render_armed.py')),
                  init_globals={'CAMERA_PREFIX':clip,'FILE_PREFIX':clip.lower().replace('_','-')})
