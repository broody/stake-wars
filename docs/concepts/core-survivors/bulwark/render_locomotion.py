"""Render the saved Walk and Run loops, then make a comparison video."""
from pathlib import Path
import shutil
import subprocess
import tempfile

import bpy

out = Path(bpy.data.filepath).parent
ffmpeg = shutil.which("ffmpeg")
assert ffmpeg, "FFmpeg is required for animation previews"
frames = Path(tempfile.mkdtemp(prefix="bulwark-locomotion-"))
scene = bpy.data.scenes["BULWARK | Studio"]
bpy.context.window.scene = scene
rig = bpy.data.objects["Bulwark"]
rig.data.pose_position = "POSE"
scene.camera = bpy.data.objects["CAM · Hero"]
scene.camera.data.ortho_scale = 3.05  # Include the shield throughout the running cycle.
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 10
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 640, 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
for clip in ("Walk", "Run"):
    slug = clip.lower()
    for track in rig.animation_data.nla_tracks:
        track.mute = track.name != clip
    track = rig.animation_data.nla_tracks[clip]
    period = round(track.strips[0].action.frame_range[1])
    for frame in range(period):
        scene.frame_set(frame)
        scene.render.filepath = str(frames / f"{slug}-{frame:03d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"{clip}: {frame + 1}/{period}", flush=True)
    cycle = frames / f"{slug}-cycle.mp4"
    subprocess.run([ffmpeg, "-v", "error", "-y", "-framerate", "24",
        "-i", str(frames / f"{slug}-%03d.png"), "-c:v", "libx264", "-crf", "18",
        "-pix_fmt", "yuv420p", str(cycle)], check=True)
    subprocess.run([ffmpeg, "-v", "error", "-y", "-stream_loop", "-1",
        "-i", str(cycle), "-t", "5", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(out / f"bulwark-{slug}.mp4")], check=True)
    shutil.copy2(frames / f"{slug}-{period // 4:03d}.png", out / f"bulwark-{slug}-pose.png")
# Walk on the left, Run on the right; works without optional FFmpeg font filters.
comparison = "[0:v][1:v]hstack=inputs=2[v]"
subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(out / "bulwark-walk.mp4"),
    "-i", str(out / "bulwark-run.mp4"), "-filter_complex", comparison, "-map", "[v]",
    "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    str(out / "bulwark-locomotion.mp4")], check=True)
print("Saved Walk, Run, and comparison videos to", out, flush=True)

shutil.rmtree(frames)
