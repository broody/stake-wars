"""Author one directional firing strafe through the shared locomotion authoring code.

Run with SIDE='Left' or SIDE='Right' in init_globals via Blender MCP.
"""
from pathlib import Path
import runpy
SIDE=globals().get('SIDE','Left')
assert SIDE in ['Left','Right']
result=runpy.run_path(str(Path(__file__).with_name('walk_shoot.py')),init_globals={
    'SOURCE':'Strafe_'+SIDE,'TARGET':'Strafe_Shoot_'+SIDE,
    'CAMERA_PREFIX':'Strafe Shooting '+SIDE,'TAG':'strafe_shoot_v1',
    'BRACE_OFFSET':(0,0,-.01),'PELVIS_NEUTRAL_Z':-.07,'GUN_Z':-.29})['result']
