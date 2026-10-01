"""Render backward firing from the hero and side cameras in background Blender."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('render_armed.py')),
              init_globals={'CAMERA_PREFIX':'Backward Shooting','FILE_PREFIX':'backward-shoot'})
