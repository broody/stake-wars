"""Validate backward shooting against the original backward gait."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('check_walk_shoot.py')),init_globals={
    'SOURCE':'Backward','TARGET':'Backward_Shoot',
    'BEFORE':'/tmp/sector-trooper-before-backward-shoot.blend',
    'AFTER':'/tmp/sector-trooper-backward-shoot-inspection.blend',
    'REPORT':'backward-shoot-check.json'})
