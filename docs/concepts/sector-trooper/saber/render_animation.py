"""Render the authored run and swing with repeatable frame timing."""
from pathlib import Path
import subprocess,os
import bpy
HERE=Path(__file__).resolve().parent
assert bpy.app.background
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig']
scene.render.resolution_x=scene.render.resolution_y=640
scene.render.resolution_percentage=100;scene.cycles.samples=16
scene.cycles.use_denoising=True;scene.render.use_persistent_data=True
for action,slug,period in [('Saber_Run','run',18),('Saber_Swing','swing',22),('Saber_Backhand','backhand',22),('Saber_Run_Swing','run-swing',18),('Saber_Run_Backhand','run-backhand',18)]:
    if os.environ.get('SABER_RENDER_ONLY') and slug not in os.environ['SABER_RENDER_ONLY'].split(','):continue
    rig.animation_data.action=bpy.data.actions[action]
    scene.camera=bpy.data.objects['SABER CAM | Hero']
    frames=Path('/tmp/saber-'+slug+'-frames');frames.mkdir(exist_ok=True)
    for frame in range(1,period+1):
        scene.frame_set(frame);scene.render.filepath=str(frames/('%03d.png'%frame))
        bpy.ops.render.render(write_still=True)
    cycle=Path('/tmp/saber-'+slug+'-cycle.mp4')
    subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','24','-i',str(frames/'%03d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(cycle)],check=True)
    subprocess.run(['ffmpeg','-y','-loglevel','error','-stream_loop','3','-i',str(cycle),'-c','copy','-movflags','+faststart',str(HERE/('saber-'+slug+'.mp4'))],check=True)
    scene.frame_set(4 if slug=='run' else 9)
    scene.render.filepath=str(HERE/('saber-'+slug+'-pose.png'));bpy.ops.render.render(write_still=True)
    scene.camera=bpy.data.objects['SABER CAM | Side']
    scene.render.filepath=str(HERE/('saber-'+slug+'-side.png'));bpy.ops.render.render(write_still=True)
print('SABER_RENDERS_COMPLETE')
