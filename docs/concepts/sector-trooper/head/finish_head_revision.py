"""Validate a scoped head revision and refresh both head and full-figure exports."""
from pathlib import Path
import ast
import hashlib
import json
import runpy
import bpy

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
assert scene.get('head_profile_revision')==2
tree=ast.parse((HERE/'refine_head_profile.py').read_text())
definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='body_signature')
exec(compile(ast.Module(body=[definition],type_ignores=[]),str(HERE/'refine_head_profile.py'),'exec'))
bpy.context.view_layer.update()
assert body_signature()==scene['head_revision_preserved_body_signature']
head_stats=runpy.run_path(str(HERE/'finish_head.py'))['result']

# Refresh preservation baselines only after the scoped head edit has proved
# that the torso, legs, camera framing and lights remain intact.
tree=ast.parse((HERE.parent/'legs/build_legs.py').read_text())
definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='upper_signature')
exec(compile(ast.Module(body=[definition],type_ignores=[]),str(HERE.parent/'legs/build_legs.py'),'exec'))
scene['approved_upper_signature']=upper_signature()
values=[]
for obj in sorted(bpy.data.collections['01 | HEAD - editable armor parts'].objects,key=lambda o:o.name):
    values.append((obj.name,tuple(v for row in obj.matrix_world for v in row)))
    if obj.type=='MESH':
        values.append(([tuple(v.co) for v in obj.data.vertices],
                       [tuple(p.vertices) for p in obj.data.polygons],
                       [m.name for m in obj.data.materials]))
scene['approved_head_signature']=hashlib.sha256(json.dumps(values).encode()).hexdigest()
figure_stats=runpy.run_path(str(HERE.parent/'legs/finish_legs.py'),init_globals={
    'VIEW_CAMERA':'Hero','VIEW_SIZE':(1200,1200),'VIEW_OUTPUT':'../head/head-preview.png',
})['result']
result={'head':head_stats,'figure':figure_stats,'torso_and_legs_unchanged':True}
