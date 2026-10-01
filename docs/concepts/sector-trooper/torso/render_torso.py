"""Render the head and torso from the saved bust inspection cameras."""
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.render.resolution_x,scene.render.resolution_y=1200,1440
scene.render.resolution_percentage=100
outputs=[]
for camera,filename in [("Bust Hero","torso-preview.png"),("Bust Front","torso-front.png"),
                        ("Bust Side","torso-side.png"),("Bust Rear","torso-rear.png")]:
    scene.camera=bpy.data.objects["TROOPER CAM | "+camera]
    scene.render.filepath=str(HERE/filename)
    bpy.ops.render.render(write_still=True,scene=scene.name)
    outputs.append(scene.render.filepath)
scene.camera=bpy.data.objects["TROOPER CAM | Bust Hero"]
scene.render.filepath=str(HERE/"torso-preview.png")
result={"renders":outputs}
