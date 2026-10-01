"""Render Warden clip previews without modifying the saved project."""
from pathlib import Path
import bpy, subprocess, sys
from mathutils import Vector
here=Path(__file__).resolve().parent
scene=bpy.context.scene;rig=bpy.data.objects['Warden'];camera=bpy.data.objects['CAM · Hero']
for obj in [bpy.data.objects['Warden_Armor'],bpy.data.objects['Warden_Staff']]:
 if obj.data.shape_keys:
  for track in obj.data.shape_keys.animation_data.nla_tracks:track.mute=True
  obj.data.shape_keys.key_blocks['SensorsOff'].value=0
scene.camera=camera;camera.location=(-4,-7,3.7)
camera.rotation_euler=(Vector((-.1,0,2.13))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=5.1
scene.render.resolution_x=640;scene.render.resolution_y=768;scene.render.resolution_percentage=100
scene.cycles.samples=8;scene.render.fps=24
formats=[v.identifier for v in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
assert 'PNG' in formats;scene.render.image_settings.file_format='PNG'
for name,slug,count in [('Walk','walk',40),('Run','run',24),('StaffSlam','staff-slam',49)]:
 for track in rig.animation_data.nla_tracks:track.mute=track.name!=name
 frames=Path('/tmp/warden-animation')/slug;frames.mkdir(parents=True,exist_ok=True)
 for frame in ([8] if name=='Walk' else [5] if name=='Run' else [18,26]) if '--poses' in sys.argv else range(count):
  scene.frame_set(frame);scene.render.filepath=str(frames/f'{frame:03}.png');bpy.ops.render.render(write_still=True)
  if (name,frame) in [('Walk',8),('Run',5),('StaffSlam',18),('StaffSlam',26)]:
   import shutil
   shutil.copy2(scene.render.filepath,here/f'warden-{slug}-{frame:02}.png')
 if '--poses' in sys.argv:continue
 subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','24','-i',str(frames/'%03d.png'),'-vf','tpad=stop_mode=clone:stop_duration=0.65' if name=='StaffSlam' else 'null','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(here/f'warden-{slug}.mp4')],check=True)
 if name!='StaffSlam':
  cycle=frames/'cycle.mp4'
  import shutil
  shutil.copy2(here/f'warden-{slug}.mp4',cycle)
  subprocess.run(['ffmpeg','-y','-loglevel','error','-stream_loop','2','-i',str(cycle),'-c','copy','-movflags','+faststart',str(here/f'warden-{slug}.mp4')],check=True)
 print('Finished '+name,flush=True)
print('WARDEN ANIMATION RENDERS COMPLETE',flush=True)
