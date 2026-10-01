"""Render the braced firing pose in background Blender."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('render_armed.py')),
              init_globals={'CAMERA_PREFIX':'Shooting','FILE_PREFIX':'idle-shoot'})
