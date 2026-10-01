"""Author a three-second knees-first collapse onto the stomach, retaining all existing saber clips.
Run in background Blender against revisions/pre-staged-death/sector-trooper-saber.blend.
"""
from pathlib import Path
import math, json
import bpy
from mathutils import Vector, Matrix
HERE=Path(__file__).resolve().parent
assert bpy.app.background
scene=bpy.context.scene; rig=bpy.data.objects['SectorTrooper_Rig']
anchor=bpy.data.objects['SectorTrooper_Saber']
for track in rig.animation_data.nla_tracks: track.mute=True
for action in bpy.data.actions: action.use_fake_user=True
objects=[o for o in scene.objects if o.type=='MESH' and (o.get('rig_binding')=='sector_trooper_rig_v1' or o.name.startswith('SABER |'))]
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
def time(f):
    scene.frame_set(int(f),subframe=f%1); bpy.context.view_layer.update()
def curves(a):
    return [f for l in a.layers for s in l.strips for bag in s.channelbags for f in bag.fcurves]
def pose():
    return {b.name:(b.location.copy(),b.rotation_euler.copy(),b.scale.copy()) for b in rig.pose.bones}
def restore(p):
    for name,(loc,rot,scale) in p.items():
        b=rig.pose.bones[name];b.location=loc;b.rotation_euler=rot;b.scale=scale
    bpy.context.view_layer.update()
rig.animation_data.action=bpy.data.actions['Saber_Death'];time(25)
prone_matrices={b.name:b.matrix.copy() for b in rig.pose.bones}
rig.animation_data.action=bpy.data.actions['Saber_Idle']; time(1)
idle={b.name:(b.location.copy(),b.rotation_euler.copy(),b.scale.copy()) for b in rig.pose.bones}
idle_matrices={b.name:b.matrix.copy() for b in rig.pose.bones}
constraints=[c for b in rig.pose.bones for c in b.constraints]
# Locomotion retains its authored IK; death uses explicitly solved limb poses.
for action in list(bpy.data.actions):
    if action.name == 'Saber_Death':continue
    rig.animation_data.action=action
    end=action.frame_range[1]
    for c in constraints:
        c.influence=1
        for frame in [1,end]:c.keyframe_insert('influence',frame=frame)
rig.animation_data.action=None
for c in constraints:c.influence=0
ordered=sorted(rig.pose.bones,key=lambda b:len(b.parent_recursive))
def from_matrices(matrices):
    for b in ordered:
        b.matrix=matrices[b.name];bpy.context.view_layer.update()
    return pose()
prone=from_matrices(prone_matrices)
idle=from_matrices(idle_matrices)
feet={s:rig.pose.bones['foot.'+s].matrix.copy() for s in ['L','R']}
def segment(name,head,tail):
    rot=rest[name].to_3x3().col[1].rotation_difference((tail-head).normalized()).to_matrix()@rest[name].to_3x3()
    mat=rot.to_4x4(); mat.translation=head; rig.pose.bones[name].matrix=mat
    bpy.context.view_layer.update()
def limb(upper,lower,end,pole):
    head=rig.pose.bones[upper].head.copy()
    a=rig.data.bones[upper].length; b=rig.data.bones[lower].length
    axis=end-head; d=axis.length; axis.normalize()
    d=min(a+b-.001,max(abs(a-b)+.001,d));end=head+axis*d
    bend=(pole-axis*pole.dot(axis)).normalized()
    along=(a*a-b*b+d*d)/(2*d)
    joint=head+axis*along+bend*math.sqrt(max(0,a*a-along*along))
    segment(upper,head,joint);segment(lower,joint,end)
    return end
# Re-solve the prone legs with IK disabled so joints stay connected.
restore(prone)
for side,sign in [('L',1),('R',-1)]:
    end=limb('thigh.'+side,'shin.'+side,Vector((sign*.23,.19,-1.09)),Vector((0,-1,-.2)))
    foot=Matrix.Rotation(math.radians(85),4,'X')@feet[side]
    foot.translation=end;rig.pose.bones['foot.'+side].matrix=foot
    bpy.context.view_layer.update()
prone=pose()
# Knees-down pose: fold the shins behind the pelvis, keeping the torso upright.
restore(idle)
rig.pose.bones['pelvis'].location+=rest['pelvis'].to_3x3().inverted()@Vector((0,0,-.39))
rig.pose.bones['spine'].rotation_euler.x+=math.radians(8)
rig.pose.bones['chest'].rotation_euler.x+=math.radians(7)
rig.pose.bones['head'].rotation_euler.x+=math.radians(12)
bpy.context.view_layer.update()
for side,sign in [('L',1),('R',-1)]:
    ankle=Vector((sign*.21,.24,-1.09))
    end=limb('thigh.'+side,'shin.'+side,ankle,Vector((0,-1,-.6)))
    foot=Matrix.Rotation(math.radians(150),4,'X')@feet[side]
    foot.translation=end;rig.pose.bones['foot.'+side].matrix=foot
    bpy.context.view_layer.update()
    hand=rig.pose.bones['hand.'+side].matrix.copy()
    end=limb('upper_arm.'+side,'forearm.'+side,Vector((sign*.43,-.13,-.88)),Vector((sign,0,-1)))
    hand.translation=end;rig.pose.bones['hand.'+side].matrix=hand
    bpy.context.view_layer.update()
kneel=pose()
rig.animation_data.action=None
old=bpy.data.actions.get('Saber_Death')
if old:bpy.data.actions.remove(old)
a=bpy.data.actions.new('Saber_Death');a.use_fake_user=True
rig.animation_data.action=a
for c in constraints:
    c.influence=0
    for frame in [1,73]:c.keyframe_insert('influence',frame=frame)
a['duration_seconds']=3.0;a['loop']=False;a['generator']='saber_death_staged_v3'
a['knees_seconds']=.85;a['fall_start_seconds']=1.3;a['impact_seconds']=2.35
previous={}
def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
def blend_pose(start,end,u):
    for name,(loc,rot,scale) in start.items():
        b=rig.pose.bones[name];el,er,es=end[name]
        b.location=loc.lerp(el,u);b.rotation_euler=rot.to_quaternion().slerp(er.to_quaternion(),u).to_euler(b.rotation_mode);b.scale=scale.lerp(es,u)
    bpy.context.view_layer.update()
for step in range(289):
    f=1+step/4;t=step/96;time(f)
    if t < .85:
        blend_pose(idle,kneel,smooth(t/.85))
    elif t < 1.3:
        restore(kneel)
        rig.pose.bones['head'].rotation_euler.x+=math.radians(5*math.sin(math.pi*(t-.85)/.45))
    elif t < 2.35:
        # Slow loss of balance accelerates into the ground impact.
        u=(t-1.3)/1.05
        blend_pose(kneel,prone,u*u)
    else:
        restore(prone)
        # Small impact recoil dissipates before the camera settles overhead.
        u=max(0,min(1,(t-2.35)/.45))
        bounce=.025*math.sin(math.pi*u)*(1-u)
        rig.pose.bones['root'].location+=rest['root'].to_3x3().inverted()@Vector((0,0,bounce))
    bpy.context.view_layer.update()
    # Ground the full evaluated body (including helmet and saber), avoiding clipping.
    dg=bpy.context.evaluated_depsgraph_get()
    minimum=1e9
    for obj in objects:
        ev=obj.evaluated_get(dg);mesh=ev.to_mesh()
        minimum=min(minimum,min((ev.matrix_world@v.co).z for v in mesh.vertices))
        ev.to_mesh_clear()
    if minimum < -1.265625:
        rig.pose.bones['root'].location+=rest['root'].to_3x3().inverted()@Vector((0,0,-1.265625-minimum))
        bpy.context.view_layer.update()
    for b in rig.pose.bones:
        if b.name in previous:b.rotation_euler.make_compatible(previous[b.name])
        previous[b.name]=b.rotation_euler.copy()
        for prop in ['location','rotation_euler','scale']:b.keyframe_insert(prop,frame=f,group=b.name)
for c in curves(a):
    for k in c.keyframe_points:k.interpolation='LINEAR'
scene.render.fps=24;scene.frame_start=1;scene.frame_end=73;time(73)
scene.camera=bpy.data.objects['SABER CAM | Hero']
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'sector-trooper-saber.blend'))
# Render a final-pose inspection image before exporting in a disposable process.
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.cycles.samples=12;scene.cycles.use_denoising=True
for frame,label in [(21,'knees'),(45,'falling'),(73,'prone')]:
    time(frame);scene.render.filepath='/tmp/saber-staged-'+label+'.png';bpy.ops.render.render(write_still=True)
keep=['Saber_Idle','Saber_Run','Saber_Swing','Saber_Backhand','Saber_Run_Swing','Saber_Run_Backhand','Saber_Death']
rig.animation_data.action=None
for action in list(bpy.data.actions):
    if action.name not in keep:bpy.data.actions.remove(action)
for action in bpy.data.actions:
    for c in curves(action):
        for k in c.keyframe_points:
            k.co.x=1+(k.co.x-1)*4;k.handle_left.x=1+(k.handle_left.x-1)*4;k.handle_right.x=1+(k.handle_right.x-1)*4
        c.update()
scene.render.fps=96;rig.animation_data.action=bpy.data.actions['Saber_Idle'];time(1)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects+[rig,anchor]:obj.hide_set(False);obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(HERE/'sector-trooper-saber.glb'),export_format='GLB',use_selection=True,
 export_skins=True,export_def_bones=False,export_animations=True,export_animation_mode='ACTIONS',
 export_force_sampling=True,export_bake_animation=True,export_frame_range=False,export_frame_step=1,
 export_anim_slide_to_zero=True,export_rest_position_armature=True,export_yup=True,export_extras=True,
 export_cameras=False,export_lights=False)
print('DEATH_COMPLETE',keep)

import runpy
runpy.run_path(str(HERE/'merge_death_export.py'),run_name='__main__')
