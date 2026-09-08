"""Render the saved Lancer model from its studio cameras."""
from pathlib import Path
import bpy

out = Path(bpy.data.filepath).parent
scene = bpy.data.scenes["LANCER | Studio"]
bpy.context.window.scene = scene
bpy.data.objects["Lancer"].data.pose_position = "REST"
scene.frame_set(0)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
for camera, filename, width, height in [
    ("Hero", "lancer-preview.png", 1200, 1400),
    ("Front", "lancer-front.png", 1024, 1024),
    ("Side", "lancer-side.png", 1024, 1024),
    ("Top", "lancer-top.png", 1024, 1024),
]:
    scene.camera = bpy.data.objects["CAM · " + camera]
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.filepath = str(out / filename)
    bpy.ops.render.render(write_still=True)
    print("Rendered:", scene.render.filepath, flush=True)
