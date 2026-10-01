"""Render the forward walking fire pose in background Blender."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('render_armed.py')),
              init_globals={'CAMERA_PREFIX':'Walk Shooting','FILE_PREFIX':'walk-shoot'})
