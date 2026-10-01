"""Validate both firing strafes in a disposable background Blender process."""
from pathlib import Path
import runpy
for side in ['Left','Right']:
    runpy.run_path(str(Path(__file__).with_name('check_walk_shoot.py')),init_globals={
        'SOURCE':'Strafe_'+side,'TARGET':'Strafe_Shoot_'+side,
        'EXCLUDE':['Strafe_Shoot_Left','Strafe_Shoot_Right'],
        'BEFORE':'/tmp/sector-trooper-before-strafe-shoot.blend',
        'AFTER':'/tmp/sector-trooper-strafe-shoot-inspection.blend',
        'REPORT':'strafe-shoot-'+side.lower()+'-check.json'})
