"""Validate both armed poses and preserved authoring data in background Blender."""
from pathlib import Path
import hashlib, json, math
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
def snapshot():
    actions={}
    for a in bpy.data.actions:
        if a.name=='Idle_Shoot':continue
        curves=[]
        for layer in a.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for c in bag.fcurves:
                        if 'pose.bones["weapon"]' in c.data_path:continue
                        curves.append((c.data_path,c.array_index,[(list(k.co),k.interpolation,list(k.handle_left),list(k.handle_right)) for k in c.keyframe_points]))
        actions[a.name]=hashlib.sha256(json.dumps(curves).encode()).hexdigest()
    rig=bpy.data.objects['SectorTrooper_Rig']
    return {'actions':actions,'bones':[(b.name,list(b.head_local),list(b.tail_local)) for b in rig.data.bones if b.name!='weapon']}
bpy.ops.wm.open_mainfile(filepath='/tmp/sector-trooper-before-shoot-idle.blend')
before=snapshot()
bpy.ops.wm.open_mainfile(filepath='/tmp/sector-trooper-shoot-inspection.blend')
assert before==snapshot(), 'Existing animation curves or original bones changed'
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig']
report={'preserved_actions':list(before['actions']), 'weapon_socket':'weapon', 'clips':{}}
for name,period in [('Armed_Idle',72),('Idle_Shoot',24)]:
    rig.animation_data.action=bpy.data.actions[name]
    contacts=[];feet=[];angles=[];seams=[];aim_errors=[]
    for step in range(period*4+1):
        frame=1+step/4
        scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
        for suffix,marker,offset in [('R','ATTACH | Main grip',(0,.085,-.025)),('L','ATTACH | Support hand',(0,.075,-.012))]:
            contacts.append((rig.pose.bones['hand.'+suffix].matrix@Vector(offset)-bpy.data.objects[marker].matrix_world.translation).length)
        lower=rig.pose.bones['forearm.R'];hand=rig.pose.bones['hand.R']
        angles.append((lower.tail-lower.head).angle(hand.tail-hand.head)*180/math.pi)
        if name=='Idle_Shoot':
            direction=bpy.data.objects['SectorTrooper_Rifle'].matrix_world.to_3x3()@Vector((0,-1,0))
            direction.z=0
            aim_errors.append(direction.normalized().angle(Vector((0,-1,0)))*180/math.pi)
        feet.append([list(row) for side in ['L','R'] for row in rig.pose.bones['foot.'+side].matrix])
        if step in [0,period*4]:seams.append([list(row) for b in rig.pose.bones for row in b.matrix])
    seam=max(abs(a-b) for r,s in zip(*seams) for a,b in zip(r,s))
    drift=max(abs(a-b) for pose in feet for r,s in zip(pose,feet[0]) for a,b in zip(r,s))
    assert max(contacts)<.001,(name,'grip error',max(contacts))
    assert max(angles)<4,(name,'wrist bend',max(angles))
    assert seam<.00001,(name,'seam',seam)
    assert drift<.00001,(name,'feet',drift)
    if aim_errors:assert max(aim_errors)<.2,('Forward aim drift',max(aim_errors))
    report['clips'][name]={'max_grip_error_m':max(contacts),'max_right_wrist_bend_degrees':max(angles),'foot_drift':drift,'seam_error':seam}
    if aim_errors:report['clips'][name]['max_horizontal_aim_error_degrees']=max(aim_errors)
(HERE/'idle-shoot-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
