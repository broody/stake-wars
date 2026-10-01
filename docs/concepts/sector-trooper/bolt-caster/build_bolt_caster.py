"""One-handed Bolt Caster, derived from the approved Sector Trooper rifle.
Run with Blender --background --python; does not modify the rifle or trooper.
"""
from pathlib import Path
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(HERE.parent / 'rifle/sector-trooper-rifle.glb'))
parts = []
for obj in list(bpy.data.objects):
    if obj.type != 'MESH':
        continue
    # Remove shoulder stock and the support-hand rest for the off-hand variant.
    if any(obj.name.startswith('RIFLE | '+n) for n in ['01 ', '02 ', '03 ', '04 ', '14 ', '15 ']):
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    transform = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world.identity()
    for vertex in obj.data.vertices:
        p = transform @ vertex.co
        vertex.co = (p.x * 1.15, p.y * .68, p.z)
    obj.name = obj.name.replace('RIFLE |', 'BOLT CASTER |')
    parts.append(obj)
for obj in list(bpy.data.objects):
    if obj not in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
root = bpy.data.objects.new('SectorTrooper_BoltCaster', None)
bpy.context.collection.objects.link(root)
for obj in parts:
    obj.parent = root
muzzle = bpy.data.objects.new('BoltCaster_Muzzle', None)
bpy.context.collection.objects.link(muzzle)
muzzle.parent = root
muzzle.location = (0, -(1381-508)/1250*.68, (355-224)/1250)
root['grip'] = 'Origin; Blender -Y forward / Z up. glTF +Z forward / Y up.'
root['source'] = 'Approved rifle, stockless with shortened barrel and receiver.'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'sector-trooper-bolt-caster.blend'))
bpy.ops.export_scene.gltf(filepath=str(HERE / 'sector-trooper-bolt-caster.glb'), export_format='GLB', export_animations=False, export_cameras=False, export_lights=False)
print('BOLT_CASTER',len(parts),'parts')
