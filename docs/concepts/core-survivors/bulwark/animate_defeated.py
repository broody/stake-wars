"""Bake rigid armor breakup to Defeated using the existing 18-bone rig.

Independent bone transforms detach existing weighted chunks without changing
geometry, skinning, prior clips, or requiring runtime physics.
"""
from pathlib import Path
import json, math
import bpy
from mathutils import Matrix, Vector, Quaternion, Euler
HERE=Path(__file__).resolve().parent
GLB=HERE.parents[3]/"apps/web/public/models/hollow-legion/bulwark.glb"
TAG="stakewars_bulwark_defeated_v1"
FPS,END=24,30
scene=bpy.data.scenes['BULWARK | Studio'];bpy.context.window.scene=scene
rig=bpy.data.objects['Bulwark']
meshes=[bpy.data.objects[n] for n in ['Bulwark_Armor','Bulwark_Shield']]
if bpy.context.screen and bpy.context.screen.is_animation_playing:bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
assert rig.animation_data.action is None, 'Preserve active action first'
for track in list(rig.animation_data.nla_tracks):
 if track.name=='Defeated':
  assert all(s.action.get('generator')==TAG for s in track.strips)
  actions=[s.action for s in track.strips];rig.animation_data.nla_tracks.remove(track)
  for action in actions:
   if action.users<=1:bpy.data.actions.remove(action)
 else:track.mute=track.name!='Walk'
# Connected edit bones ignore translation, so allow independent chunk motion.
# Keep every head/tail, parent, inverse bind, and all existing action keys intact.
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for bone in rig.data.edit_bones:bone.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
rig.data.pose_position='POSE';scene.frame_set(0);bpy.context.view_layer.update()
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
start={b.name:b.matrix.copy() for b in rig.pose.bones}
for track in rig.animation_data.nla_tracks:track.mute=True
# End centers on the floor, followed by world-space tumble Euler angles.
# Keep the broad torso and shield apart, surrounded by clearly detached limbs.
layout={
 'Spine':(-.10,.05, -1.35,.08,-.18),
 'Hips':(.10,.85, 1.2,.15,.25),
 'Head':(-.25,-1.08, -1.45,.3,-.55),
 'L.EquipmentSocket':(1.50,-.65, -1.50,.12,.20),
 'L.UpperArm':(.98,.38, 1.2,.35,.85),
 'L.Forearm':(1.52,.80, 1.4,-.4,-.9),
 'L.Hand':(1.05,1.35, 1.2,.5,.5),
 'R.UpperArm':(-1.10,.25, 1.4,-.15,-.65),
 'R.Forearm':(-1.60,-.40, 1.4,.4,.65),
 'R.Hand':(-1.4,-1.05, 1.0,-.4,-.6),
 'L.UpperLeg':(.68,1.35, 1.5,.3,.5),
 'L.LowerLeg':(.70,-1.40, 1.4,.2,-.4),
 'L.Foot':(.48,-.58, .2,.45,.6),
 'R.UpperLeg':(-.65,1.35, 1.4,-.2,-.5),
 'R.LowerLeg':(-.80,-.65, 1.3,-.3,.45),
 'R.Foot':(-.67,.72, .2,-.4,-.7),
}
vertices={name:[] for name in layout}
for mesh in meshes:
 for v in mesh.data.vertices:
  weights=[g for g in v.groups if g.weight>.00001]
  assert len(weights)==1 and weights[0].weight>.999
  name=mesh.vertex_groups[weights[0].group].name
  assert name in layout,name
  vertices[name].append(start[name]@rest[name].inverted()@v.co)
pieces={}
for i,(name,points) in enumerate(vertices.items()):
 center=sum(points,Vector())/len(points)
 x,y,rx,ry,rz=layout[name]
 pieces[name]=dict(center=center,offsets=[p-center for p in points],
  floor=min(p.z for p in points),end=Vector((x,y,0)),
  rotation=Euler((rx,ry,rz),'XYZ').to_quaternion(),
  release=1 if name=='L.EquipmentSocket' else 2+i%3,
  landing=16+i%5)

def pose_at(frame):
 poses={'Root':rest['Root'].copy()}
 for name,p in pieces.items():
  u=max(0,min(1,(frame-p['release'])/(p['landing']-p['release'])))
  spin=u*u*(3-2*u)
  rotation=Quaternion().slerp(p['rotation'],spin)
  rotation_matrix=rotation.to_matrix().to_4x4()
  center=p['center'].lerp(p['end'],1-(1-u)**2)
  bounce_u=max(0,min(1,(frame-p['landing'])/(25-p['landing'])))
  bounce=.075*math.sin(math.pi*bounce_u)**2 if frame>p['landing'] else 0
  floor=p['floor']*(1-u*u)+.012*u*u+.12*math.sin(math.pi*u)+bounce
  center.z=floor-min((rotation@v).z for v in p['offsets'])
  deformation=Matrix.Translation(center)@rotation_matrix@Matrix.Translation(-p['center'])
  poses[name]=deformation@start[name]
 # The unused right equipment socket follows its detached hand.
 poses['R.EquipmentSocket']=poses['R.Hand']@rest['R.Hand'].inverted()@rest['R.EquipmentSocket']
 for pose in rig.pose.bones:
  pose.rotation_mode='QUATERNION'
  kwargs=dict(parent_matrix=poses[pose.parent.name],parent_matrix_local=rest[pose.parent.name]) if pose.parent else {}
  pose.matrix_basis=pose.bone.convert_local_to_pose(poses[pose.name],rest[pose.name],invert=True,**kwargs)
for frame in range(END+1):
 scene.frame_set(frame);pose_at(frame)
 for pose in rig.pose.bones:
  for prop in ('location','rotation_quaternion','scale'):pose.keyframe_insert(prop,frame=frame,group=pose.name)
 rig.animation_data.action['generator']=TAG
action=rig.animation_data.action;action.name='Defeated';action.use_fake_user=True
for layer in action.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for curve in bag.fcurves:
    for key in curve.keyframe_points:key.interpolation='LINEAR'
for name,frame in [('Release',2),('Scatter',10),('Land',20),('Settle',25),('Hold',30)]:
 marker=action.pose_markers.new(name);marker.frame=frame
track=rig.animation_data.nla_tracks.new();track.name='Defeated';track.strips.new('Defeated',0,action)
rig.animation_data.action=None
rig['defeated_duration_seconds']=END/FPS
rig['defeated_notes']='Sixteen independently tumbling rigid chunks, including detached shield. No root travel; hold final debris pose.'
for pose in rig.pose.bones:pose.matrix_basis=Matrix.Identity(4)
for t in rig.animation_data.nla_tracks:t.mute=False
scene.render.fps=FPS;scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for o in [rig,*meshes]:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,use_active_scene=True,
 export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,
 export_frame_step=1,export_force_sampling=True,export_nla_strips=True,export_skins=True,
 export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
for t in rig.animation_data.nla_tracks:t.mute=t.name!='Defeated'
scene.frame_start,scene.frame_end=0,END;scene.frame_set(END)
scene.camera=bpy.data.objects['CAM · Hero']
scene.camera.location=(-3.8,-6,4.8)
scene.camera.rotation_euler=(Vector((0,0,.65))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=4.7
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_distance=5.5
   area.spaces.active.region_3d.view_location=(0,0,.4)
   area.spaces.active.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
old=bpy.context.preferences.filepaths.save_version
try:
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'bulwark.blend'))
finally:bpy.context.preferences.filepaths.save_version=old
p=HERE/'asset-stats.json';stats=json.loads(p.read_text())
stats['animations']=[t.name for t in rig.animation_data.nla_tracks];stats['rigged_bytes']=GLB.stat().st_size
stats['defeated']=dict(duration_seconds=END/FPS,settled_seconds=25/FPS,pieces=len(pieces),root_motion=False,hold_final_pose=True)
p.write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps(stats['defeated']))
