"""Render saved Mite views in a background Blender process."""
from pathlib import Path
import bpy

out = Path(bpy.data.filepath).parent
scene = bpy.data.scenes["MITE | Studio"]
bpy.context.window.scene = scene
scene.frame_set(1)
bpy.data.objects["Mite"].data.pose_position = "REST"
scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.cycles.device = "CPU"
print("Rendering Mite on CPU", flush=True)

for camera, filename, width, height in [
    ("CAM · Hero", "mite-preview.png", 1600, 1200),
    ("CAM · Top", "mite-top.png", 1024, 1024),
    ("CAM · Front", "mite-front.png", 1024, 1024),
]:
    scene.camera = bpy.data.objects[camera]
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.filepath = str(out / filename)
    bpy.ops.render.render(write_still=True)
    print("Rendered:", scene.render.filepath, flush=True)
