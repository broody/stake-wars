"""Add strafe cameras while retaining the established comparison framing."""
import bpy

scene = bpy.context.scene
collection = bpy.data.collections.get('11 | STRAFE PREVIEW - cameras')
if not collection:
    collection = bpy.data.collections.new('11 | STRAFE PREVIEW - cameras')
    scene.collection.children.link(collection)
for clip in ['Strafe_Left','Strafe_Right']:
    for label in ['Hero','Front']:
        name = 'TROOPER CAM | '+clip+' '+label
        if name not in bpy.data.objects:
            source = bpy.data.objects['TROOPER CAM | Run '+label]
            camera = source.copy()
            camera.data = source.data.copy()
            camera.name = camera.data.name = name
            collection.objects.link(camera)
            camera.hide_set(True)
scene.camera = bpy.data.objects['TROOPER CAM | Strafe_Left Hero']
result = {'cameras':[o.name for o in collection.objects]}
