"""Add dedicated walk cameras, preserving existing comparison framing."""
import bpy
from mathutils import Vector

scene = bpy.context.scene
collection = bpy.data.collections.get('09 | WALK PREVIEW - cameras')
if not collection:
    collection = bpy.data.collections.new('09 | WALK PREVIEW - cameras')
    scene.collection.children.link(collection)
for label,offset in [('Hero',(-4,-6,1.0)),('Side',(-6,0,0)),('Front',(0,-6,0))]:
    name = 'TROOPER CAM | Walk '+label
    cam = bpy.data.objects.get(name)
    if not cam:
        cam = bpy.data.objects.new(name,bpy.data.cameras.new(name))
        collection.objects.link(cam)
    target = Vector((0,0,-.36))
    cam.location = target+Vector(offset)
    cam.rotation_euler = (target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.16
    cam.hide_set(True)
scene.camera = bpy.data.objects['TROOPER CAM | Walk Hero']
result = {'cameras':[o.name for o in collection.objects]}
