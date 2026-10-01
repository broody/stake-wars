"""Render the Warden's actual Defeated clip and sensor morphs."""
from pathlib import Path
import bpy,subprocess,sys,shutil
from mathutils import Vector
here=Path(__file__).resolve().parent
scene=bpy.context.scene;rig=bpy.data.objects['Warden']
for t in rig.animation_data.nla_tracks:t.mute=t.name!='Defeated'
for name in ['Warden_Armor','Warden_Staff']:
 for t in bpy.data.objects[name].data.shape_keys.animation_data.nla_tracks:t.mute=t.name!='Defeated'
camera=bpy.data.objects['CAM · Hero'];scene.camera=camera
camera.location=(-4,-7,3.6);camera.rotation_euler=(Vector((-.2,0,1.85))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=4.8
scene.render.resolution_x=640;scene.render.resolution_y=768;scene.render.resolution_percentage=100
scene.cycles.samples=12;scene.render.fps=24
assert 'PNG' in [i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
scene.render.image_settings.file_format='PNG'
frames=Path('/tmp/warden-defeated');frames.mkdir(exist_ok=True)
for frame in [42]+list(range(42)) if '--poses' not in sys.argv else [0,18,42]:
 scene.frame_set(frame);scene.render.filepath=str(frames/f'{frame:03}.png');bpy.ops.render.render(write_still=True)
 if frame in [18,42]:shutil.copy2(scene.render.filepath,here/f'warden-defeated-{frame:02}.png')
if '--poses' not in sys.argv:
 subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','24','-i',str(frames/'%03d.png'),'-vf','tpad=start_mode=clone:start_duration=0.25:stop_mode=clone:stop_duration=1','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(here/'warden-defeated.mp4')],check=True)
print('WARDEN DEFEATED RENDER COMPLETE',flush=True)
