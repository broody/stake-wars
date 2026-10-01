"""Reshape only the two glove meshes, retaining topology, skin and actions."""
from pathlib import Path
import ast
import hashlib
import json
import runpy
import bpy
import bmesh
from mathutils import Matrix,Vector

HERE = Path(__file__).resolve().parent
BODY = ['01 | HEAD - editable armor parts','04 | TORSO - editable armor parts',
        '05 | LEGS - editable armor and joints','06 | ARMS - editable armor and gloves']
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
assert bpy.data.filepath.endswith('/sector-trooper/head/sector-trooper-head.blend')
assert rig.get('generator')=='sector_trooper_rig_v1'
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.mode!='OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
action = rig.animation_data.action
frame,subframe = scene.frame_current,scene.frame_subframe
rig.animation_data.action = None
for bone in rig.pose.bones: bone.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

def load_helpers(path,names):
    tree = ast.parse(path.read_text())
    nodes = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
    assert len(nodes)==len(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(path),'exec'),globals())

load_helpers(HERE.parent/'rig/build_rig.py',{'geometry_signature'})
load_helpers(HERE.parent/'rig/animate_walk.py',{'skeleton_signature','action_signature'})
assert geometry_signature()==rig['rest_geometry_signature']
old_signature = rig['rest_geometry_signature']
skeleton_before = skeleton_signature()
actions_before = {name:action_signature(bpy.data.actions[name]) for name in ['Run','Walk','Rig_Check']}
gloves = [bpy.data.objects['ARMS | 05 simplified glove '+side] for side in ['left','right']]
targets = {o.name for o in gloves}

def other_geometry():
    rows=[]
    for obj in sorted(scene.objects,key=lambda o:o.name):
        if obj.name in targets: continue
        row=[obj.name,obj.type,list(v for r in obj.matrix_world for v in r)]
        if obj.type=='MESH':
            row.extend([[list(v.co) for v in obj.data.vertices],
                        [list(p.vertices) for p in obj.data.polygons],
                        [m.name for m in obj.data.materials],
                        [[list(v.color) for v in a.data] for a in obj.data.color_attributes],
                        [(m.name,m.type,getattr(m,'thickness',None)) for m in obj.modifiers]])
        elif obj.type=='CAMERA': row.extend([obj.data.lens,obj.data.ortho_scale])
        rows.append(row)
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()

before = other_geometry()
verts,faces = runpy.run_path(str(HERE/'glove_geometry.py'))['glove_geometry']()
baseline_path = HERE.parent/'rig/rest-baseline.json'
baseline = json.loads(baseline_path.read_text())
new_world = {}
for obj in gloves:
    assert obj.data.users==1 and len(obj.data.vertices)==152 and obj.data.shape_keys is None
    assert [set(p.vertices) for p in obj.data.polygons]==[set(f) for f in faces]
    side = 1 if obj['side']=='left' else -1
    world = [Vector((side*x,y,z))/384 for x,y,z in verts]
    inv = obj.matrix_world.inverted()
    # The first four rings are the approved palm/wrist attachment.
    assert max(((obj.matrix_world@v.co)-p).length for v,p in zip(obj.data.vertices[:32],world[:32]))<1e-6
    for vertex,point in zip(obj.data.vertices,world): vertex.co = inv@point
    obj.data.update()
    obj.data.calc_loop_triangles()
    assert len(obj.data.loop_triangles)==280
    assert all(t.area>1e-10 for t in obj.data.loop_triangles)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    assert all(e.is_manifold for e in bm.edges)
    assert bm.calc_volume(signed=True)>0
    bm.free()
    assert len(obj.vertex_groups)==1 and obj.vertex_groups[0].name=='hand.'+('L' if side==1 else 'R')
    assert all(len(v.groups)==1 and abs(v.groups[0].weight-1)<1e-6 for v in obj.data.vertices)
    obj['hand_pose']='Relaxed fist, thumb outside curled fingers'
    obj['hands_revision']=1
    new_world[obj.name]=[list(obj.matrix_world@v.co) for v in obj.data.vertices]
    baseline[obj.name]=new_world[obj.name]

left,right=[new_world[o.name] for o in gloves]
assert max((Vector((-a[0],a[1],a[2]))-Vector(b)).length for a,b in zip(left,right))<1e-6
bpy.context.view_layer.update()
assert other_geometry()==before
assert skeleton_signature()==skeleton_before
assert all(action_signature(bpy.data.actions[n])==value for n,value in actions_before.items())
rig['rest_geometry_signature']=geometry_signature()
rig['hands_revision']=1
baseline_path.write_text(json.dumps(baseline,separators=(',',':'))+'\n')
root = bpy.data.objects['SectorTrooper_Arms']
root['pose']='T-pose, relaxed fists'
root['hand_detail']='Single palm, four curled fingers and an outside tucked thumb'
stats=json.loads((HERE/'arms-metadata.json').read_text())
stats.update(hand_detail=root['hand_detail'],hands_revision=1)
(HERE/'arms-metadata.json').write_text(json.dumps(stats,indent=2)+'\n')
report={'validation':'PASS','changed_meshes':sorted(targets),'triangles_per_glove':280,
        'vertices_per_glove':152,'geometry_elsewhere_unchanged':True,'topology_unchanged':True,
        'palm_and_wrist_unchanged':True,'skeleton_weights_actions_unchanged':True,
        'previous_geometry_signature':old_signature,'geometry_signature':rig['rest_geometry_signature'],
        'preserved_actions':actions_before,'skeleton_signature':skeleton_before}
(HERE/'hands-check.json').write_text(json.dumps(report,indent=2)+'\n')
rig.animation_data.action=action
scene.frame_set(frame,subframe=subframe)
result=report
