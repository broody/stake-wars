"""Validate the current Run using shared contact, flight and seam checks."""
from pathlib import Path
import runpy

result = runpy.run_path(str(Path(__file__).resolve().with_name('check_walk.py')),
                       init_globals={'CLIP':'Run'})['result']
