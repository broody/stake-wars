"""Render the right boot close up; hide the far leg only for inspection renders."""
from pathlib import Path
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.render.resolution_x,scene.render.resolution_y=1200,1000
scene.render.resolution_percentage=100
hidden={o:o.hide_render for o in bpy.data.collections["05 | LEGS - editable armor and joints"].objects
        if o.get("side")=="left"}
# A temporary low studio fill makes the small bevels readable in the close-up.
# It is removed before full-figure renders and never saved in the authoring file.
fill_data=bpy.data.lights.new("BOOT INSPECTION | temporary fill","AREA")
fill_data.energy=35
fill_data.shape="DISK"
fill_data.size=2.5
fill=bpy.data.objects.new(fill_data.name,fill_data)
scene.collection.objects.link(fill)
fill.location=(-1.8,-2.5,-.6)
fill.rotation_euler=(Vector((-.224,-.08,-1.16))-fill.location).to_track_quat('-Z','Y').to_euler()
try:
    for obj in hidden:
        obj.hide_render=True
    for camera,filename in [("Boot Hero","boot-preview.png"),("Boot Front","boot-front.png"),
                            ("Boot Side","boot-side.png")]:
        scene.camera=bpy.data.objects["TROOPER CAM | "+camera]
        scene.render.filepath=str(HERE/filename)
        bpy.ops.render.render(write_still=True,scene=scene.name)
finally:
    for obj,previous in hidden.items():
        obj.hide_render=previous
    bpy.data.objects.remove(fill,do_unlink=True)
    bpy.data.lights.remove(fill_data)
scene.camera=bpy.data.objects["TROOPER CAM | Boot Hero"]
scene.render.filepath=str(HERE/"boot-preview.png")
