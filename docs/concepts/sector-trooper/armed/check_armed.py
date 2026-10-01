"""Check the armed preview in a disposable background Blender process."""
from pathlib import Path
import ast, hashlib, json
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
tree=ast.parse((HERE.parent/'rig/animate_walk.py').read_text())
helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='action_signature')
exec(compile(ast.Module(body=[helper],type_ignores=[]),'action_signature','exec'))
def snapshot():
    rig=bpy.data.objects['SectorTrooper_Rig']
    return {
        'actions':{a.name:action_signature(a) for a in bpy.data.actions if a.name!='Armed_Idle'},
        'bones':[(b.name,list(b.head_local),list(b.tail_local),b.parent.name if b.parent else None) for b in rig.data.bones],
        'meshes':{o.name:([[list(v.co),[(g.group,g.weight) for g in v.groups]] for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])
                  for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('HEAD |','TORSO |','LEGS |','ARMS |'))}}
bpy.ops.wm.open_mainfile(filepath='/tmp/sector-trooper-before-armed-idle.blend')
before=snapshot()
bpy.ops.wm.open_mainfile(filepath='/tmp/sector-trooper-armed-inspection.blend')
assert snapshot()==before, 'Existing actions, skeleton or character meshes changed'
scene=bpy.context.scene
rig=bpy.data.objects['SectorTrooper_Rig']
rig.animation_data.action=bpy.data.actions['Armed_Idle']
errors=[]
poses=[]
wrist_angles=[]
feet=[]
chest_heights=[]
for frame in range(1,74):
    scene.frame_set(frame);bpy.context.view_layer.update()
    for suffix,marker,offset in [('R','ATTACH | Main grip',(0,.085,-.025)),('L','ATTACH | Support hand',(0,.075,-.012))]:
        hand=rig.pose.bones['hand.'+suffix].matrix@Vector(offset)
        errors.append((hand-bpy.data.objects[marker].matrix_world.translation).length)
    lower=rig.pose.bones['forearm.R'];hand=rig.pose.bones['hand.R']
    wrist_angles.append((lower.tail-lower.head).angle(hand.tail-hand.head))
    feet.append([rig.pose.bones['foot.'+s].matrix.copy() for s in ['L','R']])
    chest_heights.append(rig.pose.bones['chest'].tail.z)
    if frame in [1,73]: poses.append([list(row) for b in rig.pose.bones for row in b.matrix])
assert max(errors)<.00001
seam=max(abs(a-b) for r,s in zip(*poses) for a,b in zip(r,s))
assert seam<.00001
foot_drift=max(abs(a-b) for pose in feet for mat,base in zip(pose,feet[0]) for r,s in zip(mat,base) for a,b in zip(r,s))
assert foot_drift<.00001
assert max(wrist_angles)<.04
report={'preserved_actions':list(before['actions']), 'unchanged_skeleton_and_character_meshes':True,
        'max_hand_contact_error_m':max(errors),'loop_seam_error':seam,'fps':24,'loop_frames':72,
        'pose':'Relaxed two-handed chest carry, muzzle across the body', 'rifle_parent_bone':'hand.R',
        'max_right_wrist_bend_degrees':max(wrist_angles)*180/3.141592653589793,
        'foot_matrix_drift':foot_drift,'chest_breath_height_range_m':max(chest_heights)-min(chest_heights)}
(HERE/'armed-idle-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
