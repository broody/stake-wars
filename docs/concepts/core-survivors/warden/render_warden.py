"""Render hero display pose and front/side/back/top T-pose model checks."""
from pathlib import Path
import runpy
import bpy
from mathutils import Matrix
here=Path(bpy.data.filepath).parent
scene=bpy.context.scene;rig=bpy.data.objects['Warden'];staff=bpy.data.objects['Warden_Staff']
scene.cycles.samples=20;scene.render.resolution_x=scene.render.resolution_y=1000
scene.render.resolution_percentage=100
for track in rig.animation_data.nla_tracks:track.mute=track.name!='Guard'
for obj in [bpy.data.objects['Warden_Armor'],bpy.data.objects['Warden_Staff']]:
 if obj.data.shape_keys:
  for track in obj.data.shape_keys.animation_data.nla_tracks:track.mute=True
  obj.data.shape_keys.key_blocks['SensorsOff'].value=0
scene.frame_set(0)
scene.camera=bpy.data.objects['CAM · Hero']
scene.render.filepath=str(here/'warden-preview.png');bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['CAM · Front']
scene.render.filepath=str(here/'warden-guard-front.png');bpy.ops.render.render(write_still=True)
from mathutils import Vector
camera=bpy.data.objects['CAM · Hero'];saved_location=camera.location.copy();saved_rotation=camera.rotation_euler.copy();saved_scale=camera.data.ortho_scale
camera.location=(-2.2,-4,2.65);target=Vector((-.78,-.63,2.01));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.8
scene.camera=camera;scene.render.filepath=str(here/'warden-staff-grip.png');bpy.ops.render.render(write_still=True)
camera.location=saved_location;camera.rotation_euler=saved_rotation;camera.data.ortho_scale=saved_scale
for track in rig.animation_data.nla_tracks:track.mute=True
for pose in rig.pose.bones:pose.matrix_basis=Matrix.Identity(4)
staff.hide_render=True
for name in ['Front','Side','Back','Top']:
 scene.camera=bpy.data.objects['CAM · '+name]
 scene.render.filepath=str(here/('warden-'+name.lower()+'.png'));bpy.ops.render.render(write_still=True)
print('Warden hero and T-pose views rendered',flush=True)
