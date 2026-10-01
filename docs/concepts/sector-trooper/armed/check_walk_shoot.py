"""Validate forward shooting gait, aim, grips and preservation in background Blender."""
from pathlib import Path
import ast, hashlib, json, math
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
SOURCE=globals().get('SOURCE','Walk')
TARGET=globals().get('TARGET','Walk_Shoot_Forward')
EXCLUDE=globals().get('EXCLUDE',[TARGET])
BEFORE=globals().get('BEFORE','/tmp/sector-trooper-before-walk-shoot.blend')
AFTER=globals().get('AFTER','/tmp/sector-trooper-walk-shoot-inspection.blend')
REPORT=globals().get('REPORT','walk-shoot-check.json')
WEAPON_MODE=globals().get('WEAPON_MODE','shoot')
tree=ast.parse((HERE.parent/'rig/animate_walk.py').read_text())
helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='action_signature')
exec(compile(ast.Module(body=[helper],type_ignores=[]),'action_signature','exec'))
def snapshot():
    return {a.name:action_signature(a) for a in bpy.data.actions if a.name not in EXCLUDE}
bpy.ops.wm.open_mainfile(filepath=BEFORE)
before=snapshot()
bpy.ops.wm.open_mainfile(filepath=AFTER)
assert snapshot()==before,'An existing action changed'
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig']
rig.animation_data.action=bpy.data.actions['Armed_Idle']
scene.frame_set(1);bpy.context.view_layer.update()
carry_reference=rig.pose.bones['chest'].matrix.inverted()@bpy.data.objects['SectorTrooper_Rifle'].matrix_world
rig.animation_data.action=bpy.data.actions[SOURCE]
gait_period=int(bpy.data.actions[SOURCE]['cycle_frames'])
period=int(bpy.data.actions[TARGET]['cycle_frames'])
feet=[]
for step in range(gait_period*8+1):
    frame=1+step/8
    scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
    feet.append([rig.pose.bones['foot.'+side].matrix.copy() for side in ['L','R']])
rig.animation_data.action=bpy.data.actions[TARGET]
contacts=[];angles=[];foot_errors=[];aim_errors=[];seams=[];carry_errors=[]
for step in range(period*8+1):
    frame=1+step/8
    scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
    for suffix,marker,offset in [('R','ATTACH | Main grip',(0,.085,-.025)),('L','ATTACH | Support hand',(0,.075,-.012))]:
        contacts.append((rig.pose.bones['hand.'+suffix].matrix@Vector(offset)-bpy.data.objects[marker].matrix_world.translation).length)
    lower=rig.pose.bones['forearm.R'];hand=rig.pose.bones['hand.R']
    angles.append((lower.tail-lower.head).angle(hand.tail-hand.head)*180/math.pi)
    if WEAPON_MODE=='shoot':
        direction=bpy.data.objects['SectorTrooper_Rifle'].matrix_world.to_3x3()@Vector((0,-1,0));direction.z=0
        aim_errors.append(direction.normalized().angle(Vector((0,-1,0)))*180/math.pi)
    else:
        relative=rig.pose.bones['chest'].matrix.inverted()@bpy.data.objects['SectorTrooper_Rifle'].matrix_world
        carry_errors.append(max(abs(a-b) for r,s in zip(relative,carry_reference) for a,b in zip(r,s)))
    for side,base in zip(['L','R'],feet[step%(gait_period*8)]):
        mat=rig.pose.bones['foot.'+side].matrix
        foot_errors.append(max(abs(a-b) for r,s in zip(mat,base) for a,b in zip(r,s)))
    if step in [0,period*8]:seams.append([list(row) for b in rig.pose.bones for row in b.matrix])
seam=max(abs(a-b) for r,s in zip(*seams) for a,b in zip(r,s))
report={'action':TARGET,'source_gait':SOURCE,'preserved_actions':list(before),'max_grip_error_m':max(contacts),
        'max_right_wrist_bend_degrees':max(angles),'max_foot_matrix_difference_from_source':max(foot_errors),
        'weapon_mode':WEAPON_MODE,'seam_error':seam,
        'loop_frames':period,'fps':24,'speed_mps':bpy.data.actions[TARGET]['speed_mps'],'strides':period//gait_period,'shots':period//12 if WEAPON_MODE=='shoot' else 0}
if aim_errors:report['max_horizontal_aim_error_degrees']=max(aim_errors)
if carry_errors:report['max_chest_relative_weapon_difference']=max(carry_errors)
print(json.dumps(report))
assert max(contacts)<.001
assert max(angles)<4
assert max(foot_errors)<.001
if aim_errors:assert max(aim_errors)<.2
if carry_errors:assert max(carry_errors)<.001
assert seam<.00001
(HERE/REPORT).write_text(json.dumps(report,indent=2)+'\n')
