"""Bake in-place Walk/Run and a planted StaffSlam, retaining the equipped rig."""
from pathlib import Path
import json, math, runpy
import bpy
from mathutils import Matrix, Vector
HERE=Path(__file__).resolve().parent;OUT=HERE.parents[3]/'apps/web/public/models/hollow-legion/warden.glb'
TAG='stakewars_warden_animation_v1';FPS=24
scene=bpy.data.scenes['WARDEN | Studio'];bpy.context.window.scene=scene
rig=bpy.data.objects['Warden'];body=bpy.data.objects['Warden_Armor'];staff=bpy.data.objects['Warden_Staff']
if bpy.context.screen and bpy.context.screen.is_animation_playing:bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
assert rig.animation_data.action is None
for t in list(rig.animation_data.nla_tracks):
 if t.name in ['Walk','Run','StaffSlam']:
  assert all(s.action.get('generator')==TAG for s in t.strips)
  actions=[s.action for s in t.strips];rig.animation_data.nla_tracks.remove(t)
  for a in actions:
   if a.users<=1:bpy.data.actions.remove(a)
 else:t.mute=True
rig.data.pose_position='POSE'
rest={b.name:b.matrix_local.copy() for b in rig.data.bones};inv={n:m.inverted() for n,m in rest.items()}
guard=runpy.run_path(str(HERE/'pose_warden.py'))['set_display_pose'](rig)
tip_rest=Vector(staff['ground_slam_tip_rest'])
tip_guard=guard['R.EquipmentSocket']@inv['R.EquipmentSocket']@tip_rest
vertices={}
for v in body.data.vertices:
 name=body.vertex_groups[next(g.group for g in v.groups if g.weight>.99)].name
 vertices.setdefault(name,[]).append(v.co.copy())
legs={}
for side in ['R','L']:
 a,b,f=[rig.data.bones[side+n] for n in ['.UpperLeg','.LowerLeg','.Foot']]
 legs[side]=dict(hip=a.head_local.copy(),ankle=f.head_local.copy(),offsets=[v-f.head_local for v in vertices[f.name]])
GAITS={'Walk':dict(period=40,duty=.64,stride=.64,lift=.115,drop=.095,bob=.014,lean=.035,staff_lift=.12),
       'Run':dict(period=24,duty=.40,stride=.86,lift=.24,drop=.195,bob=.026,lean=.13,staff_lift=.26)}
def pivot(p,r):return Matrix.Translation(p)@r@Matrix.Translation(-p)
def joint(name,r,poses):
 parent=rig.data.bones[name].parent.name
 return poses[parent]@inv[parent]@pivot(rig.data.bones[name].head_local,r)@rest[name]
def aimed(name,h,t):
 b=rig.data.bones[name];q=(b.tail_local-b.head_local).rotation_difference(t-h)
 m=q.to_matrix().to_4x4()@rest[name];m.translation=h;return m
def chain(upper,lower,head,target,pole,poses):
 a,b=rig.data.bones[upper].length,rig.data.bones[lower].length
 delta=target-head;d=delta.length
 assert abs(a-b)<d<a+b,(upper,d,a+b)
 direction=delta.normalized();bend=(pole-direction*pole.dot(direction)).normalized()
 along=(a*a-b*b+d*d)/(2*d);mid=head+direction*along+bend*math.sqrt(max(0,a*a-along*along))
 poses[upper]=aimed(upper,head,mid);poses[lower]=aimed(lower,mid,target)
def apply(poses):
 for bone in rig.pose.bones:
  bone.rotation_mode='QUATERNION'
  kw=dict(parent_matrix=poses[bone.parent.name],parent_matrix_local=rest[bone.parent.name]) if bone.parent else {}
  bone.matrix_basis=bone.bone.convert_local_to_pose(poses[bone.name],rest[bone.name],invert=True,**kw)
def panels(poses,phase,strength,leg_clearance=False):
 # Plate tails lag the legs; cape gently trails. Lift a panel only if its actual hem would clip.
 for name in ['R.Skirt','L.Skirt','R.SkirtSide','L.SkirtSide','Skirt.Center','R.Cape','L.Cape']:
  side=-1 if name.startswith('R') else 1
  wave=math.sin(phase+(0 if side==1 else math.pi)-.55)
  cape='Cape' in name
  pitch=strength*((-.025 if cape else 0)+(.09 if cape else .16)*wave)
  if leg_clearance and name in ['R.Skirt','L.Skirt']:
   # Hinge the front armor ahead of the advancing thigh instead of letting the knee pierce it.
   prefix=name[0];h=poses[prefix+'.UpperLeg'].translation;k=poses[prefix+'.LowerLeg'].translation
   pitch=min(pitch,(math.atan2(k.y-h.y,h.z-k.z)-.10)*leg_clearance)
  roll=side*strength*(.055 if cape else .085)
  poses[name]=joint(name,Matrix.Rotation(pitch,4,'X')@Matrix.Rotation(roll,4,'Y'),poses)
  deformed=[poses[name]@inv[name]@v for v in vertices[name]]
  poses[name].translation.z+=max(0,.035-min(v.z for v in deformed))
def arms(poses,tip,tilt,left_swing=0,brace=0):
 # Move the gripped weapon as a rigid body; solve the right arm to the resulting wrist.
 hand=Matrix.Translation(tip)@Matrix.Rotation(tilt,4,'X')@Matrix.Translation(-tip_guard)@guard['R.Hand']
 shoulder=poses['Spine']@inv['Spine']@rig.data.bones['R.UpperArm'].head_local
 chain('R.UpperArm','R.Forearm',shoulder,hand.translation,Vector((-1,.25,-.6)),poses)
 poses['R.Hand']=hand;poses['R.EquipmentSocket']=joint('R.EquipmentSocket',Matrix.Identity(4),poses)
 shoulder=poses['Spine']@inv['Spine']@rig.data.bones['L.UpperArm'].head_local
 wrist=Vector((.74+.18*brace,-.05+left_swing,1.52+.22*brace))
 chain('L.UpperArm','L.Forearm',shoulder,wrist,Vector((1,.25,-.6)),poses)
 poses['L.Hand']=aimed('L.Hand',wrist,wrist+Vector((.045,-.035,-.2)))
 poses['L.EquipmentSocket']=joint('L.EquipmentSocket',Matrix.Identity(4),poses)
def feet(poses,hips,targets,rest_pole=False):
 for side,(ankle,rotation) in targets.items():
  hip=hips@legs[side]['hip']
  pole=rig.data.bones[side+'.LowerLeg'].head_local-legs[side]['hip'] if rest_pole else Vector((0,-1,0))
  chain(side+'.UpperLeg',side+'.LowerLeg',hip,ankle,pole,poses)
  poses[side+'.Foot']=rotation@rest[side+'.Foot'];poses[side+'.Foot'].translation=ankle

def gait_pose(phase,g):
 cycle=math.tau*phase;running=g['period']==24
 offset=Vector((.014*math.sin(cycle),-.025 if running else 0,-g['drop']+g['bob']*math.cos(2*cycle)))
 hips=Matrix.Translation(offset)@pivot(rig.data.bones['Hips'].head_local,Matrix.Rotation(.028*math.sin(cycle),4,'Z'))
 poses={'Root':rest['Root'].copy(),'Hips':hips@rest['Hips']}
 poses['Spine']=joint('Spine',Matrix.Rotation(g['lean'],4,'X')@Matrix.Rotation(-.04*math.sin(cycle),4,'Z'),poses)
 poses['Head']=joint('Head',Matrix.Rotation(-g['lean']*.6,4,'X'),poses)
 targets={}
 for side,leg in legs.items():
  p=(phase+(0 if side=='R' else .5))%1;duty=g['duty'];stride=g['stride']
  if p<=duty:y=stride*(p/duty-.5);lift=0;pitch=0
  else:
   u=(p-duty)/(1-duty);smooth=u*u*(3-2*u);tangent=stride*(1-duty)/duty
   y=stride*(.5-smooth)+tangent*(2*u**3-3*u*u+u)
   lift=g['lift']*math.sin(math.pi*u)**2;pitch=-.16*math.sin(math.pi*u)
  rotation=Matrix.Rotation(pitch,4,'X');ankle=leg['ankle'].copy();ankle.y+=y
  ankle.z=.008+lift-min((rotation@v).z for v in leg['offsets'])
  targets[side]=(ankle,rotation)
 feet(poses,hips,targets)
 tip=tip_guard+Vector((offset.x,.035*math.cos(cycle),g['staff_lift']+.025*math.cos(2*cycle)))
 arms(poses,tip,-.13 if running else -.045,(.19 if running else .13)*math.cos(cycle),.18 if running else 0)
 panels(poses,cycle,1 if running else .5,leg_clearance=True);apply(poses)
# Frame, hip drop, torso pitch, staff lift, staff forward shift, free-arm brace.
SLAM=[(0,0,0,0,0,0),(8,.09,-.05,.22,-.015,.22),(18,0,-.055,.64,0,.55),
      (22,0,-.055,.64,0,.55),(26,.18,.14,0,-.08,1),(28,.16,.12,.035,-.075,.9),
      (34,.14,.09,0,-.08,.7),(48,0,0,0,0,0)]
def slam_pose(frame):
 for a,b in zip(SLAM,SLAM[1:]):
  if frame<=b[0]:
   u=max(0,min(1,(frame-a[0])/(b[0]-a[0])));u=u*u*(3-2*u)
   drop,pitch,lift,forward,brace=[x+(y-x)*u for x,y in zip(a[1:],b[1:])];break
 hips=Matrix.Translation((0,0,-drop));poses={'Root':rest['Root'].copy(),'Hips':hips@rest['Hips']}
 poses['Spine']=joint('Spine',Matrix.Rotation(pitch,4,'X'),poses)
 poses['Head']=joint('Head',Matrix.Rotation(-pitch*.6,4,'X'),poses)
 targets={s:(l['ankle'].copy(),Matrix.Identity(4)) for s,l in legs.items()};feet(poses,hips,targets,rest_pole=True)
 arms(poses,tip_guard+Vector((0,forward,lift)),0,0,brace)
 panels(poses,frame*.18,brace*.6,leg_clearance=min(1,brace*3));apply(poses)
for name,g in GAITS.items():
 for sample in range(g['period']*4):gait_pose(sample/(g['period']*4),g)
for sample in range(48*4+1):slam_pose(sample/4)
for name,period,func in [('Walk',40,lambda f:gait_pose((f%40)/40,GAITS['Walk'])),('Run',24,lambda f:gait_pose((f%24)/24,GAITS['Run'])),('StaffSlam',48,slam_pose)]:
 for frame in range(period+1):
  scene.frame_set(frame);func(frame)
  for bone in rig.pose.bones:
   for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(prop,frame=frame,group=bone.name)
  rig.animation_data.action['generator']=TAG
 action=rig.animation_data.action;action.name=name;action.use_fake_user=True
 for layer in action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR'
 if name=='StaffSlam':
  for label,frame in [('Lift',8),('Raised',18),('Strike',22),('Impact',26),('Recovery',34),('Guard',48)]:
   marker=action.pose_markers.new(label);marker.frame=frame
 track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);track.mute=True;rig.animation_data.action=None
for name,g in GAITS.items():
 rig[name.lower()+'_speed_mps']=g['stride']/(g['duty']*g['period']/FPS)
rig['staff_slam_impact_seconds']=26/FPS;rig['staff_slam_notes']='One-shot planted staff slam: raise, hold, drive down at frame 26, recover. Fixed root; impact at shaft base.'
for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
scene.render.fps=FPS;scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for obj in [rig,body,staff]:obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
for t in rig.animation_data.nla_tracks:t.mute=t.name!='StaffSlam'
scene.frame_start=0;scene.frame_end=48;scene.frame_set(18)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'warden.blend'))
p=HERE/'asset-stats.json';stats=json.loads(p.read_text());stats['animations']=[t.name for t in rig.animation_data.nla_tracks];stats['rigged_bytes']=OUT.stat().st_size
stats['locomotion']={n:dict(duration_seconds=g['period']/FPS,speed_mps=rig[n.lower()+'_speed_mps'],stride_m=g['stride'],stance_fraction=g['duty'],foot_lift_m=g['lift']) for n,g in GAITS.items()}
stats['staff_slam']=dict(duration_seconds=2,impact_seconds=26/FPS,raised_seconds=18/FPS,root_motion=False)
p.write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps(stats),flush=True)
