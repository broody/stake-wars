"""Add Run cameras with the same framing as the Walk comparison cameras."""
import bpy

scene = bpy.context.scene
collection = bpy.data.collections.get('10 | RUN PREVIEW - cameras')
if not collection:
    collection = bpy.data.collections.new('10 | RUN PREVIEW - cameras')
    scene.collection.children.link(collection)
for label in ['Hero','Side','Front']:
    name = 'TROOPER CAM | Run '+label
    if name not in bpy.data.objects:
        source = bpy.data.objects['TROOPER CAM | Walk '+label]
        camera = source.copy()
        camera.data = source.data.copy()
        camera.name = name
        camera.data.name = name
        collection.objects.link(camera)
        camera.hide_set(True)
scene.camera = bpy.data.objects['TROOPER CAM | Run Hero']
result = {'cameras':[o.name for o in collection.objects]}
