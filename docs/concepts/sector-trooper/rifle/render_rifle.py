"""Render the actual rifle geometry through Blender MCP."""
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
assert scene.get('generator')=='sector_rifle_concept01_mcp'
before_camera=scene.camera
before_path=scene.render.filepath
views=globals().get('RIFLE_VIEWS',[('Hero','rifle-preview.png'),('Side','rifle-side.png'),('Top','rifle-top.png')])
paths=[]
try:
    for name,filename in views:
        scene.camera=bpy.data.objects['RIFLE CAM | '+name]
        scene.render.filepath=str(HERE/filename)
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
finally:
    scene.camera=before_camera
    scene.render.filepath=before_path
result={'renders':paths}
