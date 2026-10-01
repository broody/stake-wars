"""Backward hustle with forward aim, recoil and a slight backward body lean."""
from pathlib import Path
import runpy
result=runpy.run_path(str(Path(__file__).with_name('walk_shoot.py')),init_globals={
    'SOURCE':'Backward','TARGET':'Backward_Shoot',
    'CAMERA_PREFIX':'Backward Shooting','TAG':'backward_shoot_v1',
    'BRACE_OFFSET':(0,0,-.01),'PELVIS_NEUTRAL_Z':-.052,'GUN_Z':-.28,'GUN_Y':-.15,
    'SPINE_PITCH':-4,'CHEST_PITCH':1,'HEAD_PITCH':3})['result']
