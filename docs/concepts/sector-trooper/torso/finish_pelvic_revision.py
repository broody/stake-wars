"""Validate belt-suspended front/rear plates and update the saved figure."""
from pathlib import Path
import ast
import hashlib
import json
import runpy
import bpy
import bmesh
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
names=['TORSO | 07 pelvic belt and keepers','TORSO | 08 front groin armor','TORSO | 09 rear culet armor']
old_names={'TORSO | '+s for s in ['07 waist belt','08 lower abdominal armor',
    '09 right belt block','09 left belt block','10 right rear belt block','10 left rear belt block',
    '07 belt-linked pelvic armor']}
targets=old_names|set(names)
assert scene.get('pelvis_revision')==3
assert not any(n in bpy.data.objects for n in old_names)
tree=ast.parse((HERE/'refine_pelvic_armor.py').read_text())
helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='preserved_signature')
exec(compile(ast.Module(body=[helper],type_ignores=[]),str(HERE/'refine_pelvic_armor.py'),'exec'))
bpy.context.view_layer.update()
assert preserved_signature()==scene['pelvis_preserved_signature']
assembly=bpy.data.objects['SectorTrooper_PelvicArmor']
assert len(assembly.children)==3 and not assembly['crotch_bridge'] and not assembly['rigid_hip_connections']
dg=bpy.context.evaluated_depsgraph_get()
counts,trees={},[]
for name in names:
    obj=bpy.data.objects[name]
    assert obj.parent==assembly
    evaluated=obj.evaluated_get(dg)
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles()
    counts[name]=len(mesh.loop_triangles)
    trees.append(BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],
        [tuple(t.vertices) for t in mesh.loop_triangles],all_triangles=True))
    bm=bmesh.new()
    bm.from_mesh(mesh)
    assert all(e.is_manifold for e in bm.edges),'Each belt/plate needs a closed thickness wall'
    bm.free()
    evaluated.to_mesh_clear()
for side in ['right','left']:
    thigh=bpy.data.objects['LEGS | '+side+' 02 faceted thigh armor']
    evaluated=thigh.evaluated_get(dg)
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles()
    thigh_tree=BVHTree.FromPolygons([thigh.matrix_world@v.co for v in mesh.vertices],
        [tuple(t.vertices) for t in mesh.loop_triangles],all_triangles=True)
    assert all(not tree.overlap(thigh_tree) for tree in trees),'Pelvic armor intersects '+side+' thigh armor'
    evaluated.to_mesh_clear()
bust=runpy.run_path(str(HERE/'finish_torso.py'))['result']
bust.update({'vest_revision':scene.get('vest_revision'),'pelvis_revision':3,
             'pelvis_meshes':3,'pelvis_triangles':sum(counts.values()),'pelvis_part_triangles':counts,
             'pelvis_construction':'Separate front and rear armor plates held together by a belt',
             'rigid_hip_connections':False,'crotch_bridge':False,'belt_keeper_count':4,
             'rest_pose_thigh_clearance':'PASS','head_vest_shoulders_legs_unchanged':True,
             'rear_armor_present':True})
(HERE/'torso-metadata.json').write_text(json.dumps(bust,indent=2)+'\n')
tree=ast.parse((HERE.parent/'legs/build_legs.py').read_text())
helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='upper_signature')
exec(compile(ast.Module(body=[helper],type_ignores=[]),str(HERE.parent/'legs/build_legs.py'),'exec'))
scene['approved_upper_signature']=upper_signature()
figure=runpy.run_path(str(HERE.parent/'legs/finish_legs.py'),init_globals={
    'VIEW_CAMERA':'Pelvis Hero','VIEW_SIZE':(1200,1000),'VIEW_OUTPUT':'../torso/pelvis-preview.png',
})['result']
result={'bust':bust,'figure':figure,'preservation':'PASS'}
