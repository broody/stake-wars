"""Render the current, saved Seeker from the live MCP session."""
import bpy
from pathlib import Path
HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
assert scene.name=='SEEKER | Studio'
for name in ['Hero','Side','Top','Front']:
 scene.camera=bpy.data.objects['CAM · '+name]
 scene.render.filepath=str(HERE/('seeker-'+('preview' if name=='Hero' else name.lower())+'.png'))
 bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['CAM · Hero']
print('Seeker views rendered through live Blender MCP.')
