"""Inspect the new fists in Run and from below, in background Blender only."""
from pathlib import Path
import bpy
from mathutils import Matrix,Vector

assert bpy.app.background
HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
rig=bpy.data.objects['SectorTrooper_Rig']
rig.animation_data.action=bpy.data.actions['Run']
scene.frame_set(1)
scene.render.engine='CYCLES'
scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=900
scene.render.resolution_percentage=100
hand=bpy.data.objects['ARMS | 05 simplified glove right']
ev=hand.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh=ev.to_mesh()
points=[hand.matrix_world@v.co for v in mesh.vertices]
target=sum(points,Vector())/len(points)
ev.to_mesh_clear()
cam=bpy.data.objects.new('Temporary fist inspection camera',bpy.data.cameras.new('Temporary fist camera'))
scene.collection.objects.link(cam)
cam.data.type='ORTHO'
cam.data.ortho_scale=.36
def aim(target,offset):
    cam.location=target+Vector(offset)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
aim(target,(-4,-6,2.5))
scene.camera=cam
scene.render.filepath=str(HERE/'hands-run-closeup.png')
bpy.ops.render.render(write_still=True)

# The underside exposes the thumb and curled fingertips for geometry review.
rig.animation_data.action=None
for b in rig.pose.bones: b.matrix_basis=Matrix.Identity(4)
for obj in scene.objects:
    if obj.type=='MESH' and obj!=hand: obj.hide_render=True
bpy.context.view_layer.update()
points=[hand.matrix_world@v.co for v in hand.data.vertices]
target=sum(points,Vector())/len(points)
aim(target,(-1.8,-2,-2.5))
fill=bpy.data.objects.new('Temporary palm fill',bpy.data.lights.new('Temporary palm fill','AREA'))
scene.collection.objects.link(fill)
fill.data.energy=25
fill.data.shape='DISK'; fill.data.size=.5
fill.location=target+Vector((-.3,-.4,-.5))
fill.rotation_euler=(target-fill.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(HERE/'hands-palm-closeup.png')
bpy.ops.render.render(write_still=True)
