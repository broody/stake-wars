"""Validate the three nonfiring carry gaits against their original movements."""
from pathlib import Path
import runpy
targets={'Strafe_Left':'Strafe_Carry_Left','Strafe_Right':'Strafe_Carry_Right','Backward':'Backward_Carry'}
for source,target in targets.items():
    runpy.run_path(str(Path(__file__).with_name('check_walk_shoot.py')),init_globals={
        'SOURCE':source,'TARGET':target,'EXCLUDE':list(targets.values()),'WEAPON_MODE':'carry',
        'BEFORE':'/tmp/sector-trooper-before-carry-locomotion.blend',
        'AFTER':'/tmp/sector-trooper-carry-locomotion-inspection.blend',
        'REPORT':target.lower().replace('_','-')+'-check.json'})
