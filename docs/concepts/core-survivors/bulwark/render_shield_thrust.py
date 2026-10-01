"""Render the authored ShieldThrust from the hero and shield-side angles."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import bpy
from mathutils import Vector

out = Path(bpy.data.filepath).parent
frames = Path(tempfile.mkdtemp(prefix='bulwark-shield-thrust-'))
ffmpeg = shutil.which('ffmpeg')
assert ffmpeg
scene = bpy.data.scenes['BULWARK | Studio']
bpy.context.window.scene = scene
rig = bpy.data.objects['Bulwark']
rig.data.pose_position = 'POSE'
for track in rig.animation_data.nla_tracks:
    track.mute = track.name != 'ShieldThrust'
try:
    scene.render.engine = 'CYCLES'
except TypeError:
    raise RuntimeError('The existing Bulwark studio requires Cycles')
scene.cycles.samples = 10
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
for angle in ('hero','side'):
    camera = bpy.data.objects['CAM · Hero' if angle=='hero' else 'CAM · Side']
    scene.camera = camera
    target = Vector((.1,-.95,.92))
    camera.location = (-3.5,-6,2.8) if angle=='hero' else (5,-1.5,2.25)
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale = 4.15
    for frame in range(43):
        scene.frame_set(frame)
        scene.render.filepath = str(frames/f'{angle}-{frame:03}.png')
        bpy.ops.render.render(write_still=True)
        print(f'{angle}: {frame+1}/43',flush=True)
    # Hold the start and landing to show retained displacement in one continuous take.
    subprocess.run([ffmpeg,'-v','error','-y','-framerate','24','-i',str(frames/f'{angle}-%03d.png'),
        '-vf','tpad=start_mode=clone:start_duration=0.25:stop_mode=clone:stop_duration=0.75','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',
        str(frames/f'{angle}.mp4')],check=True)
subprocess.run([ffmpeg,'-v','error','-y','-i',str(frames/'hero.mp4'),'-i',str(frames/'side.mp4'),
    '-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-c:v','libx264','-crf','18',
    '-pix_fmt','yuv420p',str(frames/'pair.mp4')],check=True)
subprocess.run([ffmpeg,'-v','error','-y','-i',str(frames/'pair.mp4'),
    '-c','copy','-movflags','+faststart',str(out/'bulwark-shield-thrust.mp4')],check=True)
shutil.copy2(frames/'hero-018.png',out/'bulwark-shield-thrust-impact.png')
subprocess.run([ffmpeg,'-v','error','-y','-i',str(frames/'hero-012.png'),'-i',str(frames/'hero-018.png'),
    '-i',str(frames/'hero-030.png'),'-filter_complex','[0:v][1:v][2:v]hstack=inputs=3[v]',
    '-map','[v]','-frames:v','1',str(out/'bulwark-shield-thrust-poses.png')],check=True)
print('ShieldThrust preview saved:',out,flush=True)
shutil.rmtree(frames)
