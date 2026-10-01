"""Render arm details in a separate background process, restoring visibility."""
from pathlib import Path
import bpy
from mathutils import Matrix

assert bpy.app.background, 'Render details in a separate Blender process'
HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
rig = bpy.data.objects.get('SectorTrooper_Rig')
action = rig.animation_data.action if rig and rig.animation_data else None
if rig:
    rig.animation_data.action = None
    for b in rig.pose.bones: b.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
visible = {o:o.hide_render for o in scene.objects}
try:
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        keep = (obj.name.startswith('ARMS | ') and obj.get('side') == 'left') or (
            obj.name.startswith(('TORSO | 11', 'TORSO | 12', 'TORSO | 13', 'TORSO | 14', 'TORSO | 15'))
            and 'left' in obj.name) or not obj.name.startswith(('HEAD |', 'TORSO |', 'LEGS |', 'ARMS |'))
        obj.hide_render = visible[obj] or not keep
    # Head pieces have individual names; collection membership is authoritative.
    for collection in ['01 | HEAD - editable armor parts', '05 | LEGS - editable armor and joints']:
        for obj in bpy.data.collections[collection].objects:
            obj.hide_render = True
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1400,650
    scene.render.resolution_percentage = 100
    outputs = []
    for label, name in [('Front','arms-front.png'), ('Top','arms-top.png'), ('Hero','arms-preview.png')]:
        scene.camera = bpy.data.objects['TROOPER CAM | Arm '+label]
        scene.render.filepath = str(HERE/name)
        bpy.ops.render.render(write_still=True)
        outputs.append(scene.render.filepath)
finally:
    for obj, hidden in visible.items():
        obj.hide_render = hidden
    if rig:
        rig.animation_data.action = action
        scene.frame_set(scene.frame_current)
result = {'renders':outputs}
