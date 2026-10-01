"""Overlay single-saber attacks on the original uninterrupted running stride.
Use the saved pre-running-attacks blend in a disposable background process.
"""
from pathlib import Path
import math,json
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
assert bpy.app.background
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig']
anchor=bpy.data.objects['SectorTrooper_Saber']
for track in rig.animation_data.nla_tracks:track.mute=True
for a in bpy.data.actions:a.use_fake_user=True
objects=[o for o in scene.objects if o.type=='MESH' and (o.get('rig_binding')=='sector_trooper_rig_v1' or o.name.startswith('SABER |'))]

def time(f):
    scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()

def pose():
    return {b.name:(b.location.copy(),b.rotation_euler.copy(),b.scale.copy()) for b in rig.pose.bones}

def restore(p):
    for name,(loc,rot,scale) in p.items():
        b=rig.pose.bones[name];b.location=loc;b.rotation_euler=rot;b.scale=scale
    bpy.context.view_layer.update()

def curves(action):
    return [f for l in action.layers for s in l.strips for bag in s.channelbags for f in bag.fcurves]

rig.animation_data.action=bpy.data.actions['Saber_Idle'];time(1);idle=pose()
base=[];feet=[]
rig.animation_data.action=bpy.data.actions['Saber_Run']
for step in range(73):
    time(1+step/4);base.append(pose())
    feet.append([rig.pose.bones['foot.'+s].matrix.copy() for s in ['L','R']])
upper=['chest','neck','head','clavicle.R','upper_arm.R','forearm.R','hand.R','weapon']
left=['clavicle.L','upper_arm.L','forearm.L','hand.L']
foot_error=0
for source,target in [('Saber_Swing','Saber_Run_Swing'),('Saber_Backhand','Saber_Run_Backhand')]:
    samples=[]
    rig.animation_data.action=bpy.data.actions[source]
    for step in range(73):
        f=1+step/4
        # Keep wind-up and strike timing. Recover over four frames instead of eight.
        attack_frame=f if f<=15 else 15+(f-15)*2
        time(attack_frame);samples.append(pose())
    old=bpy.data.actions.get(target)
    if old:bpy.data.actions.remove(old)
    action=bpy.data.actions.new(target);action.use_fake_user=True
    action['cycle_frames']=18;action['speed_mps']=1.76;action['stride_m']=1.32
    action['in_place']=True;action['source_gait']='Saber_Run';action['source_attack']=source
    action['impact_frame']=9;action['impact_seconds']=8/24
    action['active_start_seconds']=6/24;action['active_end_seconds']=11/24
    action['generator']='saber_running_attacks_v1'
    rig.animation_data.action=action;previous={}
    for step in range(73):
        f=1+step/4;time(f);restore(base[step])
        for name in upper:
            b=rig.pose.bones[name];bl,br,bs=base[step][name];al,ar,ass=samples[step][name];il,ir,iss=idle[name]
            b.location=bl+(al-il)
            q=br.to_quaternion()@ir.to_quaternion().inverted()@ar.to_quaternion()
            b.rotation_euler=q.to_euler(b.rotation_mode)
        # Tuck the free hand while the blade crosses that side, then resume its pump.
        u=min(1,(f-1)/3,(19-f)/4);u=max(0,u);weight=u*u*(3-2*u)
        for name in left:
            b=rig.pose.bones[name];bl,br,bs=base[step][name];al,ar,ass=samples[step][name]
            b.location=bl.lerp(al,weight)
            b.rotation_euler=br.to_quaternion().slerp(ar.to_quaternion(),weight).to_euler(b.rotation_mode)
        bpy.context.view_layer.update()
        for i,s in enumerate(['L','R']):
            a=rig.pose.bones['foot.'+s].matrix;b=feet[step][i]
            foot_error=max(foot_error,max(abs(a[j][k]-b[j][k]) for j in range(4) for k in range(4)))
        for b in rig.pose.bones:
            if b.name in previous:b.rotation_euler.make_compatible(previous[b.name])
            previous[b.name]=b.rotation_euler.copy()
            for prop in ['location','rotation_euler','scale']:b.keyframe_insert(prop,frame=f,group=b.name)
    for c in curves(action):
        for k in c.keyframe_points:k.interpolation='LINEAR'
assert foot_error<1e-5,foot_error
# Compare evaluated full-mesh endpoints, attachment, stationary roots and export samples.
expected={};stats={}
for name in ['Saber_Idle','Saber_Run','Saber_Swing','Saber_Backhand','Saber_Run_Swing','Saber_Run_Backhand']:
    action=bpy.data.actions[name];rig.animation_data.action=action
    period=action['cycle_frames'];samples={};ends=[];root=[]
    for phase in [0,.125,.25,.375,.5,.75,.875,1]:
        f=1+period*phase;time(f);dg=bpy.context.evaluated_depsgraph_get()
        points={}
        for o in objects:
            ev=o.evaluated_get(dg);m=ev.to_mesh()
            points[o.name]=[list(ev.matrix_world@v.co) for v in m.vertices];ev.to_mesh_clear()
        samples[str((f-1)/24)]=points
        root.append(rig.pose.bones['root'].matrix.translation.copy())
        if phase in (0,1):ends.append(points)
    seam=max((Vector(a)-Vector(b)).length for n in ends[0] for a,b in zip(ends[0][n],ends[1][n]))
    assert seam<1e-5,(name,seam)
    assert max((p-root[0]).length for p in root)<1e-6
    expected[name]=samples
    stats[name]={'duration_seconds':period/24,'endpoint_error_m':seam}
Path('/tmp/saber-animation-reference.json').write_text(json.dumps(expected,separators=(',',':')))
rig.animation_data.action=bpy.data.actions['Saber_Run_Swing'];time(1)
scene.frame_start=1;scene.frame_end=18;scene.render.fps=24
scene.camera=bpy.data.objects['SABER CAM | Hero']
# Wider frame keeps the complete slash in view.
for name in ['Hero','Front','Side']:bpy.data.objects['SABER CAM | '+name].data.ortho_scale=3.1
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'sector-trooper-saber.blend'))
(HERE/'animation-stats.json').write_text(json.dumps({'clips':stats,'run_speed_mps':1.76,'running_attack_foot_transform_error':foot_error,'swing_impact_seconds':8/24,'swing_active_seconds':[6/24,11/24]},indent=2)+'\n')
# Export at 96 Hz to retain the quarter-frame authored keys and sampled IK.
rig.animation_data.action=None
for a in list(bpy.data.actions):
    if a.name not in expected:bpy.data.actions.remove(a)
for a in bpy.data.actions:
    for c in curves(a):
        for k in c.keyframe_points:
            k.co.x=1+(k.co.x-1)*4;k.handle_left.x=1+(k.handle_left.x-1)*4;k.handle_right.x=1+(k.handle_right.x-1)*4
        c.update()
scene.render.fps=96
rig.animation_data.action=bpy.data.actions['Saber_Idle'];time(1)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects+[rig,anchor]:obj.hide_set(False);obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(HERE/'sector-trooper-saber.glb'),export_format='GLB',use_selection=True,
 export_skins=True,export_def_bones=False,export_animations=True,export_animation_mode='ACTIONS',
 export_force_sampling=True,export_bake_animation=True,export_frame_range=False,export_frame_step=1,
 export_anim_slide_to_zero=True,export_rest_position_armature=True,export_yup=True,export_extras=True,
 export_cameras=False,export_lights=False)
print('ANIMATION_COMPLETE',json.dumps(stats))
