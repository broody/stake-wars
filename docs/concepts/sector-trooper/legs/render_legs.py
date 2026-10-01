"""Render full-height inspection views from a background Blender process."""
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=64
scene.cycles.use_denoising=True
arms=bpy.data.collections.get("06 | ARMS - editable armor and gloves")
scene.render.resolution_x,scene.render.resolution_y=(1600,1600) if arms else (1200,1600)
scene.render.resolution_percentage=100
outputs=[]
for camera,filename in [("Figure Hero","figure-preview.png"),("Figure Front","figure-front.png"),
                        ("Figure Side","figure-side.png"),("Figure Rear","figure-rear.png")]:
    scene.camera=bpy.data.objects["TROOPER CAM | "+(camera.replace("Figure ","Tpose ") if arms else camera)]
    scene.render.filepath=str(HERE/filename)
    bpy.ops.render.render(write_still=True,scene=scene.name)
    outputs.append(scene.render.filepath)
scene.camera=bpy.data.objects["TROOPER CAM | "+("Tpose Hero" if arms else "Figure Hero")]
scene.render.filepath=str(HERE/"figure-preview.png")
result={"renders":outputs}
