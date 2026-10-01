"""Inspect the complete lower body against the supplied detailed leg study."""
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.render.resolution_x,scene.render.resolution_y=1000,1200
scene.render.resolution_percentage=100
for camera,filename in [("Lower Body Front","legs-front.png"),("Lower Body Hero","legs-preview.png"),
                        ("Lower Body Side","legs-side.png")]:
    scene.camera=bpy.data.objects["TROOPER CAM | "+camera]
    scene.render.filepath=str(HERE/filename)
    bpy.ops.render.render(write_still=True,scene=scene.name)
scene.camera=bpy.data.objects["TROOPER CAM | Lower Body Front"]
scene.render.filepath=str(HERE/"legs-front.png")
