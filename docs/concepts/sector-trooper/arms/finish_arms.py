"""Validate the arms and preserved body, export the model, save the same file."""
from pathlib import Path
import ast
import hashlib
import json
import math
import runpy
import bpy
import bmesh

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
BODY_COLLECTIONS = ['01 | HEAD - editable armor parts',
                    '04 | TORSO - editable armor parts',
                    '05 | LEGS - editable armor and joints']
tree = ast.parse((HERE/'build_arms.py').read_text())
definition = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'preserved_signature')
exec(compile(ast.Module(body=[definition], type_ignores=[]), str(HERE/'build_arms.py'), 'exec'))
bpy.context.view_layer.update()
assert preserved_signature() == scene['arms_preserved_signature'], 'Body or existing cameras changed'
asset = bpy.data.collections['06 | ARMS - editable armor and gloves']
assert asset.get('generator') == 'sector_trooper_arms_v1'
objects = [o for o in asset.objects if o.type == 'MESH']
assert len(objects) == 10
assert bpy.data.images['sector-trooper-arm-detail-reference.png'].packed_file
dg = bpy.context.evaluated_depsgraph_get()
counts = {}
world = {}
for obj in objects:
    evaluated = obj.evaluated_get(dg)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    assert all(e.is_manifold for e in bm.edges), (obj.name, 'Non-manifold edge')
    assert bm.calc_volume(signed=True) > 0, (obj.name, 'Inverted normals')
    bm.free()
    counts[obj.name] = len(mesh.loop_triangles)
    world[obj.name] = [tuple(obj.matrix_world @ v.co) for v in mesh.vertices]
    evaluated.to_mesh_clear()
    if 'glove' in obj.name:
        assert counts[obj.name] < 400
        assert obj['finger_count'] == 4 and obj['thumb_count'] == 1 and obj['finger_joints'] == 0
assert sum(counts.values()) < 1800
for obj in objects:
    if obj['side'] == 'left':
        partner = obj.name.replace(' left', ' right')
        assert counts[obj.name] == counts[partner]
        for a,b in zip(world[obj.name], world[partner]):
            assert abs(a[0]+b[0]) < 1e-6 and abs(a[1]-b[1]) < 1e-6 and abs(a[2]-b[2]) < 1e-6
stats = runpy.run_path(str(HERE.parent/'legs/finish_legs.py'))['result']
assert stats['head_triangles'] == 1590 and stats['torso_triangles'] == 1868 and stats['legs_triangles'] == 1982
stats.update({'arm_meshes':len(objects), 'per_arm_triangles':sum(counts.values())//2,
              'per_part_triangles':counts, 'existing_body_and_studio_unchanged':True,
              'mirrored_geometry':'PASS', 'closed_evaluated_meshes':'PASS',
              'hand_detail':'Single palm, four curled fingers and an outside tucked thumb',
              'reference':'sector-trooper-arm-detail-reference.png'})
(HERE/'arms-metadata.json').write_text(json.dumps(stats, indent=2)+'\n')
result = stats
