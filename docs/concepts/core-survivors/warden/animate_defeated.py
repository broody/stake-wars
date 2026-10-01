"""Warden falls to his knees while bracing on the staff; existing clips retained."""
from pathlib import Path
import bpy, math, runpy, json
from mathutils import Matrix, Vector
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[3]/'apps/web/public/models/hollow-legion/warden.glb'
TAG='stakewars_warden_defeated_v1';END=42;FPS=24
scene=bpy.data.scenes['WARDEN | Studio'];bpy.context.window.scene=scene
rig=bpy.data.objects['Warden'];body=bpy.data.objects['Warden_Armor'];staff=bpy.data.objects['Warden_Staff']
if bpy.context.screen and bpy.context.screen.is_animation_playing:bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
assert rig.animation_data.action is None
for track in list(rig.animation_data.nla_tracks):
 if track.name=='Defeated':
  assert all(s.action.get('generator')==TAG for s in track.strips)
  actions=[s.action for s in track.strips];rig.animation_data.nla_tracks.remove(track)
  for action in actions:
   if action.users<=1:bpy.data.actions.remove(action)
 else:track.mute=True
rig.data.pose_position='POSE'
rest={b.name:b.matrix_local.copy() for b in rig.data.bones};inv={n:m.inverted() for n,m in rest.items()}
guard=runpy.run_path(str(HERE/'pose_warden.py'))['set_display_pose'](rig)
tip=guard['R.EquipmentSocket']@inv['R.EquipmentSocket']@Vector(staff['ground_slam_tip_rest'])
verts={}
for v in body.data.vertices:
 n=body.vertex_groups[next(g.group for g in v.groups if g.weight>.99)].name
 verts.setdefault(n,[]).append(v.co.copy())
def pivot(p,r):return Matrix.Translation(p)@r@Matrix.Translation(-p)
def joint(n,r,poses):
 parent=rig.data.bones[n].parent.name
 return poses[parent]@inv[parent]@pivot(rig.data.bones[n].head_local,r)@rest[n]
def aimed(n,h,t):
 b=rig.data.bones[n];m=(b.tail_local-b.head_local).rotation_difference(t-h).to_matrix().to_4x4()@rest[n];m.translation=h;return m
def chain(a,b,head,target,pole,poses):
 l1,l2=rig.data.bones[a].length,rig.data.bones[b].length;delta=target-head;d=delta.length
 assert abs(l1-l2)<d<l1+l2,(a,d,l1+l2)
 direction=delta/d;bend=(pole-direction*pole.dot(direction)).normalized()
 along=(l1*l1-l2*l2+d*d)/(2*d);mid=head+direction*along+bend*math.sqrt(max(0,l1*l1-along*along))
 poses[a]=aimed(a,head,mid);poses[b]=aimed(b,mid,target)
def min_z(n,poses):return min((poses[n]@inv[n]@v).z for v in verts[n])
def apply(poses):
 for bone in rig.pose.bones:
  bone.rotation_mode='QUATERNION'
  kw=dict(parent_matrix=poses[bone.parent.name],parent_matrix_local=rest[bone.parent.name]) if bone.parent else {}
  bone.matrix_basis=bone.bone.convert_local_to_pose(poses[bone.name],rest[bone.name],invert=True,**kw)
# frame, drop, forward bow, head droop, first/second knee, hip roll, hand slide
KEYS=[(0,0,0,0,0,0,0,0),(5,.035,-.10,.16,0,0,-.025,0),
      (10,.16,.08,.23,.20,0,-.065,.04),(18,.58,.20,.30,.78,.32,-.09,.22),
      (26,.85,.28,.43,1,1,0,.42),(30,.80,.24,.37,1,1,0,.40),
      (36,.85,.36,.58,1,1,0,.48),(42,.85,.36,.58,1,1,0,.48)]
def pose_at(frame):
 for a,b in zip(KEYS,KEYS[1:]):
  if frame<=b[0]:
   u=max(0,min(1,(frame-a[0])/(b[0]-a[0])));u=u*u*(3-2*u)
   drop,lean,nod,right,left,roll,slide=[x+(y-x)*u for x,y in zip(a[1:],b[1:])];break
 amount=drop/.85
 def legs_at(actual_drop):
  hipdef=Matrix.Translation((0,.06*amount,-actual_drop))@pivot(rig.data.bones['Hips'].head_local,Matrix.Rotation(roll,4,'Y'))
  poses={'Root':rest['Root'].copy(),'Hips':hipdef@rest['Hips']}
  for side,kneel in [('R',right),('L',left)]:
   n=side+'.Foot';ankle=rig.data.bones[n].head_local.copy();r=Matrix.Rotation(1.20*kneel,4,'X')
   ankle.y+=.56*kneel;ankle.x+=(-1 if side=='R' else 1)*.04*kneel
   ankle.z=.012-min((r@(v-rig.data.bones[n].head_local)).z for v in verts[n])
   if frame==0:ankle=rig.data.bones[n].head_local.copy()
   h=hipdef@rig.data.bones[side+'.UpperLeg'].head_local
   pole=rig.data.bones[side+'.LowerLeg'].head_local-rig.data.bones[side+'.UpperLeg'].head_local
   chain(side+'.UpperLeg',side+'.LowerLeg',h,ankle,pole,poses)
   poses[n]=r@rest[n];poses[n].translation=ankle
  return poses
 poses=legs_at(drop)
 # Stop the kneepads at the floor without stretching the mechanical legs.
 if min(min_z(s+n,poses) for s in ['R','L'] for n in ['.UpperLeg','.LowerLeg'])<.012:
  lo,hi=0,drop
  for _ in range(20):
   mid=(lo+hi)/2;p=legs_at(mid)
   if min(min_z(s+n,p) for s in ['R','L'] for n in ['.UpperLeg','.LowerLeg'])<.012:hi=mid
   else:lo=mid
  poses=legs_at(lo)
 poses['Spine']=joint('Spine',Matrix.Rotation(lean,4,'X'),poses)
 poses['Head']=joint('Head',Matrix.Rotation(nod,4,'X'),poses)
 # The tip stays planted. Closed fingers slide axially down the shaft as his knees buckle.
 staff_rotation=Matrix.Rotation(-.12*amount,4,'Y')@Matrix.Rotation(.055*amount,4,'X')
 weapon=pivot(tip,staff_rotation)
 hand=weapon@Matrix.Translation((0,0,-slide))@guard['R.Hand']
 shoulder=poses['Spine']@inv['Spine']@rig.data.bones['R.UpperArm'].head_local
 chain('R.UpperArm','R.Forearm',shoulder,hand.translation,Vector((-1,.25,-.6)),poses)
 poses['R.Hand']=hand;poses['R.EquipmentSocket']=weapon@guard['R.EquipmentSocket']
 shoulder=poses['Spine']@inv['Spine']@rig.data.bones['L.UpperArm'].head_local
 wrist=shoulder+Vector((.28-.12*amount,-.05-.09*amount,-.79-.025*amount))
 chain('L.UpperArm','L.Forearm',shoulder,wrist,Vector((1,.25,-.6)),poses)
 poses['L.Hand']=aimed('L.Hand',wrist,wrist+Vector((.045,-.035,-.2)))
 poses['L.EquipmentSocket']=joint('L.EquipmentSocket',Matrix.Identity(4),poses)
 for n in ['R.Skirt','L.Skirt','Skirt.Center','R.SkirtSide','L.SkirtSide','R.Cape','L.Cape']:
  cape='Cape' in n;side='Side' in n
  axis='Y' if side else 'X';sign=(1 if n.startswith('R') else -1) if side else (1 if cape else -1)
  angle=(.12 if cape else .1)*amount
  if n in ['R.Skirt','L.Skirt']:
   prefix=n[0];h=poses[prefix+'.UpperLeg'].translation;k=poses[prefix+'.LowerLeg'].translation
   angle=max(angle,-math.atan2(k.y-h.y,h.z-k.z)*amount+.08*amount)
  # Hinge rigid plates around their attachments until their hems clear the floor.
  poses[n]=joint(n,Matrix.Rotation(sign*angle,4,axis),poses)
  if min_z(n,poses)<.016:
   lo,hi=angle,1.55
   for _ in range(20):
    mid=(lo+hi)/2;poses[n]=joint(n,Matrix.Rotation(sign*mid,4,axis),poses)
    if min_z(n,poses)<.016:lo=mid
    else:hi=mid
   poses[n]=joint(n,Matrix.Rotation(sign*hi,4,axis),poses)
  assert min_z(n,poses)>0,(n,frame,min_z(n,poses))
 if frame==0:poses=guard
 apply(poses)
for sample in range(END*4+1):pose_at(sample/4)
for frame in range(END+1):
 scene.frame_set(frame);pose_at(frame)
 for bone in rig.pose.bones:
  for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(prop,frame=frame,group=bone.name)
 rig.animation_data.action['generator']=TAG
action=rig.animation_data.action;action.name='Defeated';action.use_fake_user=True
for layer in action.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for curve in bag.fcurves:
    for key in curve.keyframe_points:key.interpolation='LINEAR'
for name,frame in [('Stagger',5),('Brace',10),('First knee',18),('Both knees',26),('Settled',36),('Hold',42)]:
 marker=action.pose_markers.new(name);marker.frame=frame
track=rig.animation_data.nla_tracks.new();track.name='Defeated';track.strips.new('Defeated',0,action);track.mute=True;rig.animation_data.action=None
# Native glTF morph animation turns the emissive inserts off, keeping all 25 bones and old weights.
# Collapse the tiny overlay faces into their dark recesses; no shader animation dependency.
for obj in [body,staff]:
 if not obj.data.shape_keys:obj.shape_key_add(name='Basis')
 keys=obj.data.shape_keys
 if keys.animation_data:
  for track in list(keys.animation_data.nla_tracks):
   assert track.name=='Defeated';keys.animation_data.nla_tracks.remove(track)
  keys.animation_data.action=None
 key=keys.key_blocks.get('SensorsOff') or obj.shape_key_add(name='SensorsOff')
 for v,d in zip(obj.data.vertices,key.data):d.co=v.co
 for poly in obj.data.polygons:
  if poly.material_index!=1:continue
  center=sum((obj.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
  for i in poly.vertices:key.data[i].co=center
 for frame,value in [(0,0),(4,0),(5,1),(6,0),(9,0),(10,1),(11,0),(18,0),(19,1),(20,0),(27,0),(30,1),(END,1)]:
  key.value=value;key.keyframe_insert('value',frame=frame)
 a=keys.animation_data.action;a.name=obj.name+' · Defeated sensors';a['generator']=TAG
 for layer in a.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for c in bag.fcurves:
     for k in c.keyframe_points:k.interpolation='LINEAR'
 t=keys.animation_data.nla_tracks.new();t.name='Defeated';t.strips.new('Defeated',0,a);t.mute=False;keys.animation_data.action=None;key.value=0
rig['defeated_duration_seconds']=END/FPS
rig['defeated_notes']='One-shot: brace on staff, first knee, both knees, bowed head. Hold final pose. SensorsOff morph flickers then extinguishes. Fixed root.'
for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
scene.render.fps=FPS;scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for obj in [rig,body,staff]:obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_morph=True)
for t in rig.animation_data.nla_tracks:t.mute=t.name!='Defeated'
for obj in [body,staff]:
 for t in obj.data.shape_keys.animation_data.nla_tracks:t.mute=False
scene.frame_start=0;scene.frame_end=END;scene.frame_set(END)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'warden.blend'))
p=HERE/'asset-stats.json';stats=json.loads(p.read_text());stats['animations']=[t.name for t in rig.animation_data.nla_tracks];stats['rigged_bytes']=OUT.stat().st_size
stats['defeated']=dict(duration_seconds=END/FPS,settled_seconds=36/FPS,root_motion=False,hold_final_pose=True,sensors_off_seconds=30/FPS,sensor_morph='SensorsOff')
p.write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps(stats['defeated']),flush=True)
