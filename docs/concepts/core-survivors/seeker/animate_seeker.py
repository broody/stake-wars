"""Author Seeker clips in the live Blender MCP session; preserve mesh and rest rig."""
from pathlib import Path
import bpy, math, json
from mathutils import Matrix, Vector
HERE=Path(__file__).resolve().parent
TAG='seeker_animation_v1';FPS=24
scene=bpy.data.scenes['SEEKER | Studio'];bpy.context.window.scene=scene
rig=bpy.data.objects['Seeker'];model=bpy.data.objects['Seeker_Armor']
if bpy.context.screen and bpy.context.screen.is_animation_playing:bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
backup=HERE/'revisions/pre-animation/seeker.blend';backup.parent.mkdir(parents=True,exist_ok=True)
if not backup.exists():bpy.ops.wm.save_as_mainfile(filepath=str(backup),copy=True)
rig.animation_data_create()
if rig.animation_data.action:
 assert rig.animation_data.action.get('generator')==TAG,'Preserve unrecognized active action.'
 rig.animation_data.action=None
for track in list(rig.animation_data.nla_tracks):
 assert all(s.action.get('generator')==TAG for s in track.strips),'Preserve unrecognized animation.'
 rig.animation_data.nla_tracks.remove(track)
for action in list(bpy.data.actions):
 if action.get('generator')==TAG:bpy.data.actions.remove(action)
rest={b.name:b.matrix_local.copy() for b in rig.data.bones};inv={n:m.inverted() for n,m in rest.items()}
points={n:[] for n in rest}
for v in model.data.vertices:
 group=max(v.groups,key=lambda g:g.weight);points[model.vertex_groups[group.group].name].append(v.co.copy())
legs={}
for front in [True,False]:
 for side in ['L','R']:
  tag=('Front' if front else 'Rear')+side
  legs[tag]={'front':front,'sign':1 if side=='L' else -1,'hip':rig.data.bones[tag+'Upper'].head_local.copy(),'ankle':rig.data.bones[tag+'Foot'].head_local.copy()}

def smooth(v):
 v=max(0,min(1,v));return v*v*(3-2*v)
def pivot(p,r):return Matrix.Translation(p)@r@Matrix.Translation(-p)
def joint(name,rotation,poses):
 parent=rig.data.bones[name].parent.name
 return poses[parent]@inv[parent]@pivot(rig.data.bones[name].head_local,rotation)@rest[name]
def aimed(name,a,b):
 bone=rig.data.bones[name];q=(bone.tail_local-bone.head_local).rotation_difference(b-a)
 m=q.to_matrix().to_4x4()@rest[name];m.translation=a;return m
reach_warnings=[]
def chain(upper,lower,a,b,pole,poses):
 l1=rig.data.bones[upper].length;l2=rig.data.bones[lower].length
 delta=b-a;distance=delta.length
 if distance>=l1+l2-.0001 or distance<=abs(l1-l2)+.0001:
  reach_warnings.append((upper,round(distance,5),round(l1+l2,5)))
  distance=max(abs(l1-l2)+.0001,min(distance,l1+l2-.0001));b=a+delta.normalized()*distance
 axis=(b-a).normalized();bend=(pole-axis*pole.dot(axis)).normalized()
 along=(l1*l1-l2*l2+distance*distance)/(2*distance)
 knee=a+axis*along+bend*math.sqrt(max(0,l1*l1-along*along))
 poses[upper]=aimed(upper,a,knee);poses[lower]=aimed(lower,knee,b)
 return b

def body_pose(drop=0,shift=0,pitch=0,roll=0,fin=0,head=0,spread=.25):
 transform=Matrix.Translation((0,shift,drop))@pivot(rest['Body'].translation,Matrix.Rotation(pitch,4,'X')@Matrix.Rotation(roll,4,'Y'))
 poses={'Root':rest['Root'].copy(),'Body':transform@rest['Body']}
 poses['Neck']=joint('Neck',Matrix.Rotation(head*.4,4,'X'),poses)
 poses['Head']=joint('Head',Matrix.Rotation(head*.6,4,'X'),poses)
 # Sweep the paired fins outward at rest, inward along the chassis for a charge.
 for side,sign in [('L',1),('R',-1)]:
  poses['Fin'+side]=joint('Fin'+side,Matrix.Rotation(fin,4,'X')@Matrix.Rotation(-sign*spread,4,'Z'),poses)
 return poses

def solve_feet(poses,targets):
 transform=poses['Body']@inv['Body']
 for tag,leg in legs.items():
  ankle=targets[tag];hip=transform@leg['hip'];pole=Vector((leg['sign']*.40,1,.05))
  if leg['front']:
   chain(tag+'Upper',tag+'Lower',hip,ankle,pole,poses)
  else:
   offset=Vector((-.06*leg['sign'],.15,.21))
   hock=ankle+offset
   limit=rig.data.bones[tag+'Upper'].length+rig.data.bones[tag+'Lower'].length-.025
   if (hock-hip).length>limit:
    # Flex the third joint on long strides rather than stretching the rear leg.
    delta=hip-ankle;distance=delta.length;axis=delta.normalized();length=offset.length
    along=(distance*distance+length*length-limit*limit)/(2*distance)
    assert abs(along)<length,(tag,'rear leg cannot reach')
    pole=(offset-axis*offset.dot(axis)).normalized()
    hock=ankle+axis*along+pole*math.sqrt(length*length-along*along)
   hock=chain(tag+'Upper',tag+'Lower',hip,hock,pole,poses)
   poses[tag+'Hock']=aimed(tag+'Hock',hock,ankle)
  poses[tag+'Foot']=rest[tag+'Foot'].copy();poses[tag+'Foot'].translation=ankle
 return poses

def idle(phase=0):
 p=body_pose(drop=-.012+.008*math.cos(math.tau*phase),fin=.009*math.sin(math.tau*phase),head=.008*math.sin(math.tau*phase))
 return solve_feet(p,{tag:l['ankle'].copy() for tag,l in legs.items()})

GAITS={'Walk':dict(duration=1.2,duty=.70,stride=.40,lift=.115,drop=-.09,bob=.018,pitch=.015),
       'Run':dict(duration=.65,duty=.48,stride=.62,lift=.22,drop=-.17,bob=.035,pitch=.045),
       'Charge':dict(duration=.25,duty=1/3,stride=1.0,lift=.25,drop=-.27,bob=.048,pitch=.075)}
def gait(phase,name):
 g=GAITS[name];cycle=math.tau*phase
 p=body_pose(drop=g['drop']+g['bob']*math.cos(cycle*(1 if name=='Charge' else 2)),pitch=g['pitch']+.015*math.sin(cycle),roll=.018*math.sin(cycle),fin=(-.15 if name=='Charge' else -.035)+.014*math.sin(cycle-.4),head=-g['pitch']*.5,spread=-.16 if name=='Charge' else .25+.012*math.sin(cycle))
 targets={}
 for tag,l in legs.items():
  if name=='Walk':off={'RearL':0,'FrontL':.25,'RearR':.5,'FrontR':.75}[tag]
  elif name=='Run':off=0 if tag in ['FrontL','RearR'] else .5
  else:off=(0 if l['front'] else .5)+(0 if l['sign']==1 else .06)
  phase_leg=(phase+off)%1;duty=g['duty'];stride=g['stride']
  if phase_leg<=duty:
   y=stride*(phase_leg/duty-.5);lift=0
  else:
   u=(phase_leg-duty)/(1-duty)
   # Cubic Hermite return has the same paw velocity at takeoff and landing.
   tangent=stride*(1-duty)/duty
   y=stride*(.5-smooth(u))+tangent*(2*u**3-3*u*u+u)
   lift=g['lift']*math.sin(math.pi*u)**2
  target=l['ankle'].copy();target.x*=.96
  target.y=(-.77 if l['front'] else .74)+y;target.z+=lift
  targets[tag]=target
 return solve_feet(p,targets)

def blend(a,b,t):
 if t<=0:return a
 if t>=1:return b
 result={}
 for bone in rig.data.bones:
  n=bone.name
  def local(poses):
   args={'parent_matrix':poses[bone.parent.name],'parent_matrix_local':rest[bone.parent.name]} if bone.parent else {}
   return bone.convert_local_to_pose(poses[n],rest[n],invert=True,**args)
  ap,aq,asc=local(a).decompose();bp,bq,bsc=local(b).decompose()
  basis=Matrix.LocRotScale(ap.lerp(bp,t),aq.slerp(bq,t),asc.lerp(bsc,t))
  args={'parent_matrix':result[bone.parent.name],'parent_matrix_local':rest[bone.parent.name]} if bone.parent else {}
  result[n]=bone.convert_local_to_pose(basis,rest[n],**args)
 return result

def windup(t):
 u=smooth(t/.68);pulse=.008*math.sin(t*math.tau*12)*smooth((t-.55)/.25)
 p=body_pose(drop=-.004-.24*u+pulse,shift=.095*u,pitch=.06*u,fin=.16*u,head=.16*u,spread=.25-.41*u)
 targets={tag:l['ankle'].copy() for tag,l in legs.items()}
 for tag,l in legs.items():targets[tag].y-=.10*u if not l['front'] else 0
 p=solve_feet(p,targets)
 # The final fraction preloads the exact first drive pose without a phase jump.
 return blend(p,gait(0,'Charge'),smooth((t-.68)/.12))

def recover(t):return blend(gait(0,'Charge'),idle(0),smooth(t/.6))

def defeated(t):
 buckle=smooth(t/.45);roll=smooth((t-.25)/.75);settle=smooth((t-.9)/.55)
 # Forelegs buckle first; the body rolls onto its side and the fins fold with it.
 p=body_pose(drop=-.40*buckle-.15*roll,shift=-.10*buckle,pitch=.14*buckle*(1-roll),roll=-1.55*roll,fin=-.32*roll,head=.18*buckle+.15*roll)
 for tag,l in legs.items():
  a=smooth(t/.35) if l['front'] else smooth((t-.18)/.42)
  p[tag+'Upper']=joint(tag+'Upper',Matrix.Rotation((-.3 if l['front'] else .2)*a,4,'X')@Matrix.Rotation(l['sign']*.95*roll,4,'Y'),p)
  p[tag+'Lower']=joint(tag+'Lower',Matrix.Rotation(-.4*a,4,'X')@Matrix.Rotation(-l['sign']*.2*roll,4,'Y'),p)
  if not l['front']:p[tag+'Hock']=joint(tag+'Hock',Matrix.Rotation(.3*a,4,'X'),p)
  p[tag+'Foot']=joint(tag+'Foot',Matrix.Rotation(.12*a,4,'X'),p)
 for side,sign in [('L',1),('R',-1)]:p['Fin'+side]=joint('Fin'+side,Matrix.Rotation(-.32*roll,4,'X')@Matrix.Rotation(sign*(-.25*(1-roll)+.35*roll),4,'Z'),p)
 # Settle as one connected rigid-weighted skeleton; no part may pass through floor.
 low=min((p[n]@inv[n]@v).z for n,vs in points.items() for v in vs)
 correction=max(0,-low)+.008*roll+.018*math.sin(math.pi*settle)**2
 if correction:
  lift=Matrix.Translation((.1*roll,0,correction))
  p={n:lift@m for n,m in p.items()}
 return p

WINDUP=.8;DRIVE=1.0;RECOVER=.6;DISTANCE=12.0

def attack(t):
 if t<WINDUP:p=windup(t);distance=0
 elif t<WINDUP+DRIVE:
  age=t-WINDUP
  # Four bounds with stance speed matched to the twelve-metre charge.
  p=gait((age/.25)%1,'Charge');distance=DISTANCE*age/DRIVE
 else:p=recover(t-WINDUP-DRIVE);distance=DISTANCE
 shift=Matrix.Translation((0,-distance,0));return {n:shift@m for n,m in p.items()}

def apply(poses):
 # A small collision margin catches extremities through the export's subframes.
 low=min((poses[n]@inv[n]@v).z for n,vs in points.items() for v in vs)
 if low<.01:
  lift=Matrix.Translation((0,0,.01-low));poses={n:lift@m for n,m in poses.items()}
 for bone in rig.pose.bones:
  bone.rotation_mode='QUATERNION'
  args={'parent_matrix':poses[bone.parent.name],'parent_matrix_local':rest[bone.parent.name]} if bone.parent else {}
  basis=bone.bone.convert_local_to_pose(poses[bone.name],rest[bone.name],invert=True,**args)
  pos,rotation,scale=basis.decompose()
  # Quaternion signs must remain continuous for exported linear interpolation.
  if bone.rotation_quaternion.dot(rotation)<0:rotation.negate()
  bone.location=pos;bone.rotation_quaternion=rotation;bone.scale=scale

specs=[('Idle',2,lambda t:idle(t/2)),('Walk',1.2,lambda t:gait(t/1.2,'Walk')),('Run',.65,lambda t:gait(t/.65,'Run')),('ChargeWindup',.8,windup),('Charge',.25,lambda t:gait(t/.25,'Charge')),('ChargeRecover',.6,recover),('ChargeAttack',2.4,attack),('Defeated',1.8,defeated)]
scene.render.fps=FPS
for name,duration,sample in specs:
 rig.animation_data.action=None
 for track in rig.animation_data.nla_tracks:track.mute=True
 for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
 # 120 Hz authoring catches short contacts and preserves exact 0.8 / 0.6 timings.
 steps=round(duration*120)
 for i in range(steps+1):
  t=duration*i/steps;frame=t*FPS;scene.frame_set(int(frame),subframe=frame%1)
  apply(sample(t))
  for bone in rig.pose.bones:
   for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(prop,frame=frame,group=bone.name)
 action=rig.animation_data.action;action.name=name;action.use_fake_user=True;action['generator']=TAG;action['duration_seconds']=duration
 action['loop']=name in ['Idle','Walk','Run','Charge']
 for layer in action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR'
 for label,time in ({'Crouch':.35,'Launch':.8,'Brake':1.8,'Ready':2.4} if name=='ChargeAttack' else {'Buckle':.35,'Fall':.8,'Settle':1.45,'Hold':1.8} if name=='Defeated' else {}).items():
  marker=action.pose_markers.new(label);marker.frame=round(time*FPS)
 track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);track.mute=True;rig.animation_data.action=None
assert not reach_warnings, str(reach_warnings[:8])+' total='+str(len(reach_warnings))
rig['status']='Animated: Idle, Walk, Run, ChargeWindup, Charge, ChargeRecover, ChargeAttack, Defeated'
rig['fin_rest_spread_radians']=.25;rig['fin_charge_spread_radians']=-.16
rig['charge_windup_seconds']=.8;rig['charge_recovery_seconds']=.6;rig['charge_distance_m']=DISTANCE
for n,g in GAITS.items():rig[n.lower()+'_speed_mps']=g['stride']/(g['duty']*g['duration'])
# Export at 120 fps, preserving authored subframes and exact timing in every GLB.
for track in rig.animation_data.nla_tracks:
 strip=track.strips[0];action=strip.action
 for layer in action.layers:
  for st in layer.strips:
   for bag in st.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.co.x*=5;key.handle_left.x*=5;key.handle_right.x*=5
 strip.action_frame_end=action['duration_seconds']*120;strip.frame_end=action['duration_seconds']*120
scene.render.fps=120
for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);model.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(HERE/'seeker.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_extras=True,export_cameras=False,export_lights=False)
# Restore the editable animation timeline to 24 fps.
for track in rig.animation_data.nla_tracks:
 strip=track.strips[0];action=strip.action
 for layer in action.layers:
  for st in layer.strips:
   for bag in st.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.co.x/=5;key.handle_left.x/=5;key.handle_right.x/=5
 strip.action_frame_end=action['duration_seconds']*24;strip.frame_end=action['duration_seconds']*24
 track.mute=track.name!='Run'
scene.render.fps=24;scene.frame_start=0;scene.frame_end=15;scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'seeker.blend'))
stats=json.loads((HERE/'asset-stats.json').read_text());stats['animations']={name:duration for name,duration,_ in specs};stats['glb_bytes']=(HERE/'seeker.glb').stat().st_size
stats['gaits']={n:{**g,'speed_mps':rig[n.lower()+'_speed_mps']} for n,g in GAITS.items()};stats['charge_attack']={'windup':.8,'drive':1,'recover':.6,'root_distance_m':12,'recommended_game_scale':.25}
(HERE/'asset-stats.json').write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps(stats),flush=True)
