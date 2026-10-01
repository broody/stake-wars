"""Render the authored one-shot and its held pose without changing the project."""
from pathlib import Path
import tempfile, subprocess
import bpy
out=Path(bpy.data.filepath).parent
frames=Path(tempfile.mkdtemp(prefix='bulwark-defeated-'))
scene=bpy.context.scene
scene.camera=bpy.data.objects['CAM · Hero']
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12
scene.cycles.use_denoising=True
scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
rig=bpy.data.objects['Bulwark'];rig.data.pose_position='POSE'
for t in rig.animation_data.nla_tracks:t.mute=t.name!='Defeated'
scene.frame_set(30);scene.render.filepath=str(out/'bulwark-defeated-pose.png');bpy.ops.render.render(write_still=True)
for i,frame in enumerate([0]*6+list(range(31))+[30]*11):
    scene.frame_set(frame);scene.render.filepath=str(frames/f'{i:03d}.png')
    bpy.ops.render.render(write_still=True)
subprocess.run(['ffmpeg','-v','error','-y','-framerate','24','-i',str(frames/'%03d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'bulwark-defeated.mp4')],check=True)
