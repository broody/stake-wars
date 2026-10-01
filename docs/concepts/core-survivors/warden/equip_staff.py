"""Attach staff to the right socket and save a bent-arm Guard clip."""
from pathlib import Path
import json,runpy
import bpy
from mathutils import Matrix, Vector
HERE=Path(__file__).resolve().parent;OUT=HERE.parents[3]/'apps/web/public/models/hollow-legion'
rig=bpy.data.objects['Warden'];body=bpy.data.objects['Warden_Armor'];staff=bpy.data.objects['Warden_Staff'];scene=bpy.context.scene
assert not staff.modifiers, 'Run on the fresh standalone staff from the builder'
poses=runpy.run_path(str(HERE/'pose_warden.py'))['set_display_pose'](rig)
wrist=poses['R.Hand'].translation
staff_world=Matrix.Translation((wrist.x+.087,wrist.y-.176,0))
socket=rig.data.bones['R.EquipmentSocket']
# Convert the upright staff into socket-bound rest coordinates.
bind=socket.matrix_local@poses[socket.name].inverted()@staff_world
for vertex in staff.data.vertices:vertex.co=bind@vertex.co
staff.location=(0,0,0);staff.parent=rig
staff.vertex_groups.new(name=socket.name).add(list(range(len(staff.data.vertices))),1,'REPLACE')
mod=staff.modifiers.new('Staff follows right-hand socket','ARMATURE');mod.object=rig
staff['attachment_bone']=socket.name
staff['grip_height_m']=wrist.z
staff['ground_slam_tip_rest']=list(bind@Vector((0,0,.008)))
rig['notes']='T-pose rest skeleton; Guard clip bends right arm into a closed staff grip. Staff is skinned to R.EquipmentSocket for later ground-slam animation.'
rig.animation_data_create()
assert rig.animation_data.action is None and not rig.animation_data.nla_tracks
for frame in [0,48]:
 for pose in rig.pose.bones:
  for prop in ['location','rotation_quaternion','scale']:pose.keyframe_insert(prop,frame=frame,group=pose.name)
action=rig.animation_data.action;action.name='Guard';action.use_fake_user=True;action['generator']='stakewars_warden_guard_v1'
track=rig.animation_data.nla_tracks.new();track.name='Guard';track.strips.new('Guard',0,action);rig.animation_data.action=None;track.mute=True
for pose in rig.pose.bones:pose.matrix_basis=Matrix.Identity(4)
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for o in [rig,body,staff]:o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT/'warden.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
track.mute=False;scene.frame_start=0;scene.frame_end=48;scene.frame_set(0)
scene.camera=bpy.data.objects['CAM · Hero']
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'warden.blend'))
p=HERE/'asset-stats.json';stats=json.loads(p.read_text());stats.update(animations=['Guard'],pose='Bent-arm staff guard; T-pose rest skeleton',rigged_bytes=(OUT/'warden.glb').stat().st_size,equipped_triangles=sum(len(f.vertices)-2 for m in [body,staff] for f in m.data.polygons),staff_attachment=socket.name)
p.write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps(stats),flush=True)
