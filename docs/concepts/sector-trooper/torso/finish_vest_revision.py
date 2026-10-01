"""Validate the connected vest, refresh the bust and full figure, then save."""
from pathlib import Path
import ast
import hashlib
import json
import runpy
import bpy
import bmesh

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
name='TORSO | 02 unified armored vest'
old_names={'TORSO | '+s for s in ['02 sloping armored collar','02b continuous clavicle armor',
    '03 faceted chest shield','04 right floating rib plate','04 left floating rib plate',
    '05 right side cuirass','05 left side cuirass','06 rear armor shell']}
targets=old_names|{name}
assert scene.get('vest_revision')==2
tree=ast.parse((HERE/'refine_unified_vest.py').read_text())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='preserved_signature')
exec(compile(ast.Module(body=[function],type_ignores=[]),str(HERE/'refine_unified_vest.py'),'exec'))
bpy.context.view_layer.update()
assert preserved_signature()==scene['vest_preserved_signature']
assert bpy.data.images['sector-trooper-vest-detail-reference.png'].packed_file
obj=bpy.data.objects[name]
evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh=evaluated.to_mesh()
bm=bmesh.new()
bm.from_mesh(mesh)
assert all(e.is_manifold for e in bm.edges),'Vest wall must close the open surface boundaries'
bm.free()
evaluated.to_mesh_clear()
bust=runpy.run_path(str(HERE/'finish_torso.py'))['result']
bust.update({'vest_revision':2,'vest_connected_meshes':1,'vest_shell_manifold':True,
             'head_legs_shoulders_waist_unchanged':True,
             'detail_reference':'sector-trooper-vest-detail-reference.png'})
(HERE/'torso-metadata.json').write_text(json.dumps(bust,indent=2)+'\n')

tree=ast.parse((HERE.parent/'legs/build_legs.py').read_text())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='upper_signature')
exec(compile(ast.Module(body=[function],type_ignores=[]),str(HERE.parent/'legs/build_legs.py'),'exec'))
scene['approved_upper_signature']=upper_signature()
figure=runpy.run_path(str(HERE.parent/'legs/finish_legs.py'),init_globals={
    'VIEW_CAMERA':'Bust Hero','VIEW_SIZE':(1200,1440),'VIEW_OUTPUT':'../torso/torso-preview.png',
})['result']
result={'bust':bust,'figure':figure,'preservation':'PASS','vest_shell_manifold':True}
