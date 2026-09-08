"""Render a gait loop or a single LeapAttack; select with -- --clip NAME."""
from pathlib import Path
import argparse
import shutil
import subprocess
import sys
import tempfile

import bpy

ffmpeg = shutil.which("ffmpeg")
if ffmpeg is None:
    raise RuntimeError("Install FFmpeg and add it to PATH before rendering an animation preview.")

out = Path(bpy.data.filepath).parent
parser = argparse.ArgumentParser()
parser.add_argument("--clip", choices=["Walk", "Run", "LeapAttack"], default="Walk")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
clip = args.clip
is_leap = clip == "LeapAttack"
slug = "leap-attack" if is_leap else clip.lower()
frames = Path(tempfile.mkdtemp(prefix=f"mite-{slug}-frames-"))
scene = bpy.data.scenes["MITE | Studio"]
bpy.context.window.scene = scene
rig = bpy.data.objects["Mite"]
rig.data.pose_position = "POSE"
for track in rig.animation_data.nla_tracks:
    track.mute = track.name != clip
active = rig.animation_data.nla_tracks[clip]
period = round(active.strips[0].action.frame_range[1] - active.strips[0].action.frame_range[0])
scene.camera = bpy.data.objects["CAM · LeapAttack" if is_leap else "CAM · Hero"]
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 960, 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
print(clip + " frames:", frames, flush=True)
frame_count = period + 1 if is_leap else period
for frame in range(frame_count):
    scene.frame_set(frame)
    scene.render.filepath = str(frames / f"{slug}-{frame:03d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"{clip} preview: {frame + 1}/{frame_count}", flush=True)
encode = [ffmpeg, "-v", "error", "-y", "-framerate", "24",
          "-i", str(frames / (slug + "-%03d.png"))]
if is_leap:
    # Brief holds frame the single attack; the preview does not teleport back.
    encode += ["-vf", "tpad=start_mode=clone:start=6:stop_mode=clone:stop=11"]
encode += ["-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", str(frames / "cycle.mp4")]
subprocess.run(encode, check=True)
subprocess.run([ffmpeg, "-v", "error", "-y", "-stream_loop", "0" if is_leap else str(96 // period - 1),
                "-i", str(frames / "cycle.mp4"), "-c", "copy", "-movflags", "+faststart",
                str(out / f"mite-{slug}.mp4")], check=True)
print("Saved:", out / f"mite-{slug}.mp4", flush=True)
