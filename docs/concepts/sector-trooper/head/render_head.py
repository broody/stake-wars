"""Render saved head study cameras. Run in Blender, including through MCP."""
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
scene = bpy.data.scenes["SECTOR TROOPER | Head study"]
scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
outputs = []
body=[c for name in ['04 | TORSO - editable armor parts','05 | LEGS - editable armor and joints']
      if (c:=bpy.data.collections.get(name))]
hidden={c.name:c.hide_render for c in body}
try:
    for c in body:
        c.hide_render=True
    for camera, filename in [("Front","head-front.png"), ("Reference side","head-side.png"),
                             ("Hero","head-preview.png"), ("Side","head-profile.png")]:
        scene.camera = bpy.data.objects["TROOPER CAM | " + camera]
        scene.render.filepath = str(HERE / filename)
        bpy.ops.render.render(write_still=True, scene=scene.name)
        outputs.append(scene.render.filepath)
finally:
    for c in body:
        c.hide_render=hidden[c.name]
scene.camera = bpy.data.objects["TROOPER CAM | Hero"]
scene.render.filepath = str(HERE / "head-preview.png")
result = {"renders":outputs}
