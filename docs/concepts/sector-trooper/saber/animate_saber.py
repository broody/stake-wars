"""Add Saber_Run and Saber_Swing to the separately backed-up saber character.
Run in background Blender against revisions/pre-animation/sector-trooper-saber.blend.
"""
from pathlib import Path
import math,json
import bpy
from mathutils import Matrix,Vector
HERE=Path(__file__).resolve().parent
assert bpy.app.background
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig']
anchor=bpy.data.objects['SectorTrooper_Saber']
for track in rig.animation_data.nla_tracks:track.mute=True
for a in bpy.data.actions:a.use_fake_user=True
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
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

def new(name,period):
    old=bpy.data.actions.get(name)
    if old:bpy.data.actions.remove(old)
    a=bpy.data.actions.new(name);a.use_fake_user=True;a['cycle_frames']=period
    a['generator']='saber_animations_v1';a['in_place']=True
    rig.animation_data.action=a
    return a
previous={}
def key(f):
    for b in rig.pose.bones:
        if b.name in previous:b.rotation_euler.make_compatible(previous[b.name])
        previous[b.name]=b.rotation_euler.copy()
        for prop in ['location','rotation_euler','scale']:b.keyframe_insert(prop,frame=f,group=b.name)

def linear(a):
    for c in curves(a):
        for k in c.keyframe_points:k.interpolation='LINEAR'

rig.animation_data.action=bpy.data.actions['Saber_Idle'];time(1)
idle=pose()
idle_hand=rig.pose.bones['hand.R'].matrix.copy()
idle_weapon=rig.matrix_world.inverted()@anchor.matrix_world
hand_to_weapon=idle_hand.inverted()@idle_weapon
idle_axis=idle_weapon.to_3x3().col[2].normalized()
# Retain the source Run's precise IK, torso and free-arm motion.
source=bpy.data.actions['Run'];rig.animation_data.action=source
base=[];source_feet=[]
for step in range(72):
    time(1+step/4);base.append(pose())
    source_feet.append([rig.pose.bones['foot.'+s].matrix.copy() for s in ['L','R']])
run=new('Saber_Run',18);run['speed_mps']=1.76;run['source_gait']='Run'
run['stride_m']=1.32
previous={};foot_error=0
for step in range(73):
    f=1+step/4;time(f);restore(base[step%72])
    phase=2*math.pi*step/72
    for name in ['clavicle.R','upper_arm.R','forearm.R','hand.R','weapon']:
        b=rig.pose.bones[name];b.location,b.rotation_euler,b.scale=idle[name]
    # Modest arm pump keeps the blade beside the helmet; left arm drives the stride.
    rig.pose.bones['upper_arm.R'].rotation_euler.x+=math.radians(5*math.sin(phase))
    rig.pose.bones['forearm.R'].rotation_euler.z+=math.radians(3*math.sin(phase+.4))
    bpy.context.view_layer.update()
    for i,s in enumerate(['L','R']):
        a=rig.pose.bones['foot.'+s].matrix;b=source_feet[step%72][i]
        foot_error=max(foot_error,max(abs(a[j][k]-b[j][k]) for j in range(4) for k in range(4)))
    key(f)
linear(run)
assert foot_error<1e-5,foot_error

# Solve the sword arm to an explicit wrist path, preserving segment lengths.
def segment(name,head,tail):
    rot=rest[name].to_3x3().col[1].rotation_difference((tail-head).normalized()).to_matrix()@rest[name].to_3x3()
    mat=rot.to_4x4();mat.translation=head;rig.pose.bones[name].matrix=mat
    bpy.context.view_layer.update()

def sword_arm(wrist,rotation):
    shoulder=rig.pose.bones['upper_arm.R'].head.copy()
    a=rig.data.bones['upper_arm.R'].length;b=rig.data.bones['forearm.R'].length
    axis=wrist-shoulder;d=axis.length;axis.normalize()
    assert abs(a-b)<d<a+b,('unreachable wrist',d,a+b)
    pole=Vector((-.8,.15,-1));bend=(pole-axis*pole.dot(axis)).normalized()
    along=(a*a-b*b+d*d)/(2*d)
    elbow=shoulder+axis*along+bend*math.sqrt(max(0,a*a-along*along))
    segment('upper_arm.R',shoulder,elbow);segment('forearm.R',elbow,wrist)
    mat=rotation.to_4x4();mat.translation=wrist;rig.pose.bones['hand.R'].matrix=mat
    bpy.context.view_layer.update()

# Frame, wrist, weapon direction, torso twist, crouch. Impact frame 9 = 0.333 s.
knots=[
 (1,tuple(idle_hand.translation),tuple(idle_axis),0,0),
 (5,(-.46,-.22,-.30),(-.72,.08,.69),-12,-.012),
 (7,(-.47,-.32,-.28),(-.83,-.5,.23),-8,-.02),
 (9,(-.29,-.47,-.34),(-.1,-.97,-.22),10,-.035),
 (12,(.00,-.43,-.39),(.91,-.33,-.25),22,-.022),
 (15,(.00,-.38,-.40),(.9,-.22,-.15),19,-.012),
 (23,tuple(idle_hand.translation),tuple(idle_axis),0,0)]
forehand=knots
backhand=[
 (1,tuple(idle_hand.translation),tuple(idle_axis),0,0),
 (5,(.00,-.43,-.28),(.78,-.15,.61),20,-.012),
 (7,(.00,-.43,-.30),(.86,-.46,.2),15,-.02),
 (9,(-.29,-.47,-.34),(0,-.97,-.22),-4,-.035),
 (12,(-.48,-.33,-.45),(-.91,-.35,-.15),-18,-.022),
 (15,(-.48,-.30,-.44),(-.88,-.32,-.12),-15,-.012),
 (23,tuple(idle_hand.translation),tuple(idle_axis),0,0)]
for clip_name,knots in [('Saber_Swing',forehand),('Saber_Backhand',backhand)]:
    quats=[]
    for _,_,axis,_,_ in knots:
        weapon_rot=idle_axis.rotation_difference(Vector(axis).normalized()).to_matrix()@idle_weapon.to_3x3()
        quats.append((weapon_rot@hand_to_weapon.to_3x3().inverted()).to_quaternion())
    swing=new(clip_name,22);swing['impact_frame']=9;swing['impact_seconds']=8/24
    swing['active_start_seconds']=6/24;swing['active_end_seconds']=11/24
    previous={}
    for step in range(89):
        f=1+step/4;time(f);restore(idle)
        i=next((j for j in range(len(knots)-1) if f<=knots[j+1][0]),len(knots)-2)
        a,b=knots[i],knots[i+1];u=(f-a[0])/(b[0]-a[0]);u=u*u*(3-2*u)
        wrist=Vector(a[1]).lerp(Vector(b[1]),u)
        twist=a[3]+(b[3]-a[3])*u;dip=a[4]+(b[4]-a[4])*u
        rig.pose.bones['chest'].rotation_euler.y+=math.radians(twist)
        rig.pose.bones['pelvis'].location+=rest['pelvis'].to_3x3().inverted()@Vector((0,0,dip))
        rig.pose.bones['head'].rotation_euler.y-=math.radians(twist*.55)
        rig.pose.bones['upper_arm.L'].rotation_euler.x+=math.radians(-twist*.25)
        bpy.context.view_layer.update()
        if step not in (0,88):sword_arm(wrist,quats[i].slerp(quats[i+1],u).to_matrix())
        key(f)
    linear(swing)
# Compare evaluated full-mesh endpoints, attachment, stationary roots and export samples.
expected={};stats={}
for name in ['Saber_Idle','Saber_Run','Saber_Swing','Saber_Backhand']:
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
rig.animation_data.action=bpy.data.actions['Saber_Swing'];time(1)
scene.frame_start=1;scene.frame_end=23;scene.render.fps=24
scene.camera=bpy.data.objects['SABER CAM | Hero']
# Wider frame keeps the complete slash in view.
for name in ['Hero','Front','Side']:bpy.data.objects['SABER CAM | '+name].data.ortho_scale=3.1
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'sector-trooper-saber.blend'))
(HERE/'animation-stats.json').write_text(json.dumps({'clips':stats,'run_speed_mps':1.76,'source_run_foot_transform_error':foot_error,'swing_impact_seconds':8/24,'swing_active_seconds':[6/24,11/24]},indent=2)+'\n')
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
