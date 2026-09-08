"""Bake movement and a forward LeapAttack onto Mite's existing ten-bone rig.

Run inside Blender after build_mite.py, or against the saved Mite project.
The exported animation uses ordinary bone transforms, with no runtime IK.
"""
from pathlib import Path
import json
import math

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
GLB = HERE.parents[3] / "apps/web/public/models/hollow-legion/mite.glb"
scene = bpy.data.scenes["MITE | Studio"]
bpy.context.window.scene = scene
rig = bpy.data.objects["Mite"]
mesh = bpy.data.objects["Mite_Armor"]
if bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
rig.data.pose_position = "POSE"
rig.animation_data_create()
rig.animation_data.action = None
for track in list(rig.animation_data.nla_tracks):
    if track.name in {"Idle", "Walk", "Run", "LeapAttack"}:
        rig.animation_data.nla_tracks.remove(track)
    else:
        track.mute = True
for pose in rig.pose.bones:
    pose.rotation_mode = "QUATERNION"
    pose.matrix_basis = Matrix.Identity(4)

FPS = 24
PERIOD = 24
DUTY = .6
STRIDE = .40  # Armature units during stance; rig scale converts to meters.
LIFT = .19
RUN_PERIOD = 12
RUN_DUTY = .5
RUN_STRIDE = .56
RUN_LIFT = .23
LEAP_END = 30
LEAP_TAKEOFF = 8
LEAP_LAND = 18
LEAP_DISTANCE = 1.2 / rig.scale.y
LEAP_ROOT_HEIGHT_M = .18
LEAP_HEIGHT = LEAP_ROOT_HEIGHT_M / rig.scale.z
GROUND = .008
root_pose = rig.pose.bones["Root"]
root_rest = root_pose.bone.matrix_local.copy()
body = rig.pose.bones["Body"]
body_rest = body.bone.matrix_local.copy()
body_pivot = body.bone.head_local.copy()
legs = {}
for name in ("FL", "FR", "RL", "RR"):
    upper = rig.pose.bones[name + ".Upper"]
    lower = rig.pose.bones[name + ".Lower"]
    hip, knee, toe = (upper.bone.head_local.copy(), lower.bone.head_local.copy(), lower.bone.tail_local.copy())
    group_index = mesh.vertex_groups[lower.name].index
    tip_indices = [v.index for v in mesh.data.vertices
                   if (v.co - toe).length < .065 and any(g.group == group_index and g.weight > .99 for g in v.groups)]
    assert len(tip_indices) == 6, (name, tip_indices)
    legs[name] = dict(upper=upper, lower=lower, hip=hip, knee=knee, toe=toe,
                      length1=(knee - hip).length, length2=(toe - knee).length,
                      tips=tip_indices, tip_offsets=[mesh.data.vertices[i].co - toe for i in tip_indices])


def set_pose_matrix(pose, desired, parent_matrix):
    pose.matrix_basis = pose.bone.convert_local_to_pose(
        desired, pose.bone.matrix_local,
        parent_matrix=parent_matrix, parent_matrix_local=pose.parent.bone.matrix_local,
        invert=True)


def bone_matrix(rest, rest_direction, direction, head):
    rotation = rest_direction.normalized().rotation_difference(direction.normalized())
    out = rotation.to_matrix().to_4x4() @ rest
    out.translation = head
    return out, rotation


def solve_leg(leg, deformation, foot, clearance):
    """Two rigid links bend toward the original raised knee, without stretching."""
    hip = deformation @ leg["hip"]
    pole = deformation @ leg["knee"] - hip
    l1, l2 = leg["length1"], leg["length2"]
    foot = foot.copy()
    for _ in range(8):
        delta = foot - hip
        distance = delta.length
        assert abs(l1 - l2) + .001 < distance < l1 + l2 - .001, (distance, l1 + l2)
        direction = delta.normalized()
        bend = (pole - direction * pole.dot(direction)).normalized()
        along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance)
        knee = hip + direction * along + bend * math.sqrt(max(0, l1 * l1 - along * along))
        lower_matrix, lower_rotation = bone_matrix(leg["lower"].bone.matrix_local,
                                                   leg["toe"] - leg["knee"], foot - knee, knee)
        # Compensate for the actual blade tip, not just the bone endpoint.
        lowest_tip_offset = min((lower_rotation @ p).z for p in leg["tip_offsets"])
        corrected_z = clearance - lowest_tip_offset
        if abs(foot.z - corrected_z) < 1e-7:
            break
        foot.z = corrected_z
    upper_matrix, _ = bone_matrix(leg["upper"].bone.matrix_local,
                                  leg["knee"] - leg["hip"], knee - hip, hip)
    set_pose_matrix(leg["upper"], upper_matrix, deformation @ body_rest)
    set_pose_matrix(leg["lower"], lower_matrix, upper_matrix)


def key_pose(frame):
    for pose in rig.pose.bones:
        pose.keyframe_insert("location", frame=frame, group=pose.name)
        pose.keyframe_insert("rotation_quaternion", frame=frame, group=pose.name)


def finish_action(name):
    action = rig.animation_data.action
    action.name = name
    action.use_fake_user = True
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "LINEAR"
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    track.mute = True
    rig.animation_data.action = None
    return track


# Keep Idle as an alternate clip, now with planted feet during the body bob.
for frame in range(49):
    phase = frame / 48
    deformation = Matrix.Translation((0, 0, .012 * math.sin(math.tau * phase)))
    set_pose_matrix(body, deformation @ body_rest, rig.pose.bones["Root"].bone.matrix_local)
    for leg in legs.values():
        solve_leg(leg, deformation, leg["toe"], GROUND)
    key_pose(frame)
idle_track = finish_action("Idle")

# Walk is an in-place clip. Forward translation belongs to the game actor.
for frame in range(PERIOD + 1):
    phase = (frame % PERIOD) / PERIOD
    offset = Vector((.009 * math.sin(math.tau * phase), 0, -.004 + .012 * math.cos(2 * math.tau * phase)))
    rotation = (Matrix.Rotation(.016 * math.sin(math.tau * phase), 4, "Y") @
                Matrix.Rotation(.008 * math.sin(2 * math.tau * phase), 4, "X"))
    deformation = Matrix.Translation(body_pivot + offset) @ rotation @ Matrix.Translation(-body_pivot)
    set_pose_matrix(body, deformation @ body_rest, rig.pose.bones["Root"].bone.matrix_local)
    for name, leg in legs.items():
        p = (phase + (0 if name in {"FL", "RR"} else .5)) % 1
        foot = leg["toe"].copy()
        foot.y *= .92
        if p < DUTY:
            foot.y += STRIDE * (p / DUTY - .5)
            lift = 0
        else:
            swing = (p - DUTY) / (1 - DUTY)
            ease = swing * swing * (3 - 2 * swing)
            foot.y += STRIDE * (.5 - ease)
            lift = LIFT * math.sin(math.pi * swing) ** 1.5
        solve_leg(leg, deformation, foot, GROUND + lift)
    key_pose(frame)
walk_track = finish_action("Walk")

# Run doubles the cadence, lengthens the stride, and lowers the body into a
# forward lean. A narrower stance lets the rear legs reach without stretching.
for frame in range(RUN_PERIOD + 1):
    phase = (frame % RUN_PERIOD) / RUN_PERIOD
    offset = Vector((.012 * math.sin(math.tau * phase), -.025,
                     -.055 + .024 * math.cos(2 * math.tau * phase)))
    rotation = (Matrix.Rotation(.023 * math.sin(math.tau * phase), 4, "Y") @
                Matrix.Rotation(.09 + .014 * math.sin(2 * math.tau * phase), 4, "X"))
    deformation = Matrix.Translation(body_pivot + offset) @ rotation @ Matrix.Translation(-body_pivot)
    set_pose_matrix(body, deformation @ body_rest, rig.pose.bones["Root"].bone.matrix_local)
    for name, leg in legs.items():
        p = (phase + (0 if name in {"FL", "RR"} else .5)) % 1
        foot = leg["toe"].copy()
        foot.x *= .96
        foot.y *= .86
        if p < RUN_DUTY:
            foot.y += RUN_STRIDE * (p / RUN_DUTY - .5)
            lift = 0
        else:
            swing = (p - RUN_DUTY) / (1 - RUN_DUTY)
            ease = swing * swing * (3 - 2 * swing)
            foot.y += RUN_STRIDE * (.5 - ease)
            lift = RUN_LIFT * math.sin(math.pi * swing) ** 1.5
        solve_leg(leg, deformation, foot, GROUND + lift)
    key_pose(frame)
run_track = finish_action("Run")


def smooth(value):
    value = min(1, max(0, value))
    return value * value * (3 - 2 * value)


# A one-shot attack with true root motion. End at the destination; do not
# animate a return to the launch position as part of the attack.
for frame in range(LEAP_END + 1):
    flight = min(1, max(0, (frame - LEAP_TAKEOFF) / (LEAP_LAND - LEAP_TAKEOFF)))
    root_offset = Vector((0, -LEAP_DISTANCE * flight, 4 * LEAP_HEIGHT * flight * (1 - flight)))
    root_matrix = Matrix.Translation(root_offset) @ root_rest
    root_pose.matrix_basis = root_rest.inverted() @ root_matrix
    tuck = strike = 0
    if frame <= 5:
        windup = smooth(frame / 5)
        body_z, pitch, body_y = -.20 * windup, -.03 * windup, .03 * windup
    elif frame <= LEAP_TAKEOFF:
        spring = smooth((frame - 5) / (LEAP_TAKEOFF - 5))
        body_z, pitch, body_y = -.20 + .23 * spring, -.03 + .15 * spring, .03 * (1 - spring)
    elif frame < LEAP_LAND:
        tuck = smooth(flight / .22) * (1 - smooth((flight - .58) / .42))
        strike = smooth((flight - .15) / .25) * (1 - smooth((flight - .85) / .15))
        body_z, body_y = .03 * (1 - flight), 0
        # Pitch the carapace and visor toward the target, peaking near 34 degrees.
        pitch = .12 + .48 * smooth(flight / .65) - .38 * smooth((flight - .65) / .35)
    elif frame <= 23:
        impact = smooth((frame - LEAP_LAND) / 3)
        body_z, pitch, body_y = -.17 * impact, .22 + .08 * impact, 0
    else:
        recover = smooth((frame - 23) / (LEAP_END - 23))
        body_z, pitch, body_y = -.17 * (1 - recover), .30 * (1 - recover), 0
    local_deformation = (Matrix.Translation(body_pivot + Vector((0, body_y, body_z))) @
                         Matrix.Rotation(pitch, 4, "X") @ Matrix.Translation(-body_pivot))
    deformation = Matrix.Translation(root_offset) @ local_deformation
    set_pose_matrix(body, deformation @ body_rest, root_matrix)
    for name, leg in legs.items():
        foot = leg["toe"].copy()
        front = name in {"FL", "FR"}
        foot.x *= 1 - (.08 if front else .27) * tuck
        foot.y *= 1 - (.08 if front else .33) * tuck
        if front:
            foot.y -= .24 * strike
        lift = (.14 if front else .27) * tuck + (.04 * strike if front else 0)
        foot += root_offset
        solve_leg(leg, deformation, foot, root_offset.z + GROUND + lift)
    key_pose(frame)
leap_track = finish_action("LeapAttack")
root_pose.matrix_basis = Matrix.Identity(4)

scene.render.fps = FPS
scene.frame_start, scene.frame_end = 0, LEAP_END
for marker in list(scene.timeline_markers):
    if marker.name.startswith(("Walk:", "Run:", "Leap:")):
        scene.timeline_markers.remove(marker)
for frame, name in [(0, "Leap: wind-up"), (LEAP_TAKEOFF, "Leap: take-off"),
                    ((LEAP_TAKEOFF + LEAP_LAND) // 2, "Leap: apex"),
                    (LEAP_LAND, "Leap: impact"), (LEAP_END, "Leap: recovered")]:
    scene.timeline_markers.new(name, frame=frame)

rig["walk_speed_mps"] = STRIDE * rig.scale.y / (DUTY * PERIOD / FPS)
rig["walk_duration_seconds"] = PERIOD / FPS
rig["run_speed_mps"] = RUN_STRIDE * rig.scale.y / (RUN_DUTY * RUN_PERIOD / FPS)
rig["run_duration_seconds"] = RUN_PERIOD / FPS
rig["run_notes"] = "In-place fast diagonal scuttle; forward lean, longer stride, narrower stance."
rig["walk_notes"] = "In-place diagonal scuttle, baked two-link IK; no runtime constraints."
rig["leap_distance_m"] = 1.2
rig["leap_root_height_m"] = LEAP_ROOT_HEIGHT_M
rig["leap_attack_pitch_degrees"] = math.degrees(.60)
rig["leap_duration_seconds"] = LEAP_END / FPS
rig["leap_takeoff_seconds"] = LEAP_TAKEOFF / FPS
rig["leap_impact_seconds"] = LEAP_LAND / FPS
rig["leap_notes"] = "Low, nose-first attack lunge: 1.2 m forward (+Z in glTF), 0.18 m root arc. Play once and retain the destination."
rig["notes"] = "394 triangles, two materials, ten bones; Idle, Walk, Run, and LeapAttack."

# NLA export gathers unmuted tracks, isolating each into its own named clip.
idle_track.mute = False
walk_track.mute = False
run_track.mute = False
leap_track.mute = False
scene.frame_set(0)
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True, use_active_scene=True,
                          export_apply=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_frame_range=False, export_frame_step=1, export_force_sampling=True,
                          export_nla_strips=True, export_skins=True, export_yup=True, export_extras=True,
                          export_cameras=False, export_lights=False)
# Verify real skinned blade geometry and the cycle seam, including half frames.
validation = {}
for active, period, duty, minimum_lift in [(walk_track, PERIOD, DUTY, .075), (run_track, RUN_PERIOD, RUN_DUTY, .095)]:
    for track in rig.animation_data.nla_tracks:
        track.mute = track != active
    min_clearance = math.inf
    max_clearance = {name: 0 for name in legs}
    stance_error = 0
    matrices = []
    for i in range(period * 2 + 1):
        frame = i / 2
        scene.frame_set(int(frame), subframe=frame % 1)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = mesh.evaluated_get(depsgraph)
        for name, leg in legs.items():
            tip_z = min((evaluated.matrix_world @ evaluated.data.vertices[j].co).z for j in leg["tips"])
            min_clearance = min(min_clearance, tip_z)
            max_clearance[name] = max(max_clearance[name], tip_z)
            phase = ((frame / period) + (0 if name in {"FL", "RR"} else .5)) % 1
            if .06 < phase < duty - .06:
                stance_error = max(stance_error, abs(tip_z - GROUND * rig.scale.z))
        if i in (0, period * 2):
            matrices.append([p.matrix.copy() for p in rig.pose.bones])
    seam_error = max(abs(a[r][c] - b[r][c]) for a, b in zip(*matrices) for r in range(4) for c in range(4))
    assert min_clearance > -.0005, (active.name, min_clearance)
    assert stance_error < .001, (active.name, stance_error)
    assert min(max_clearance.values()) > minimum_lift, (active.name, max_clearance)
    assert seam_error < .00001, (active.name, seam_error)
    validation[active.name] = dict(min_foot_clearance_m=min_clearance, max_foot_lift_m=max_clearance,
                                   max_stance_height_error_m=stance_error, loop_seam_matrix_error=seam_error)

# The attack must travel forward, clear the ground, and recover at its endpoint.
for track in rig.animation_data.nla_tracks:
    track.mute = track != leap_track
leap_floor = math.inf
apex_feet = []
endpoints = []
for i in range(LEAP_END * 2 + 1):
    frame = i / 2
    scene.frame_set(int(frame), subframe=frame % 1)
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    floor = min((evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices)
    leap_floor = min(leap_floor, floor)
    if frame == (LEAP_TAKEOFF + LEAP_LAND) / 2:
        apex_feet = [min((evaluated.matrix_world @ evaluated.data.vertices[j].co).z
                         for j in leg["tips"]) for leg in legs.values()]
    if frame in (0, LEAP_END):
        endpoints.append([rig.matrix_world @ p.matrix.translation for p in rig.pose.bones])
root_delta = endpoints[1][0] - endpoints[0][0]
recovery_error = max((end - start - root_delta).length for start, end in zip(*endpoints))
assert leap_floor > 0, leap_floor
assert min(apex_feet) > .22, apex_feet
assert (root_delta - Vector((0, -1.2, 0))).length < .00001, root_delta
assert recovery_error < .00001, recovery_error
validation["LeapAttack"] = dict(min_mesh_clearance_m=leap_floor, apex_foot_heights_m=apex_feet,
                                root_delta_blender_m=list(root_delta), recovery_position_error_m=recovery_error)

# Frame the entire leap in the saved viewport and in a dedicated render camera.
camera = bpy.data.objects.get("CAM · LeapAttack")
if camera is None:
    camera = bpy.data.objects.new("CAM · LeapAttack", bpy.data.cameras.new("CAM · LeapAttack"))
    bpy.data.collections["02 · Studio — cameras & lights"].objects.link(camera)
    camera["generator"] = rig.get("generator")
camera.data.type, camera.data.ortho_scale = "ORTHO", 2.6
camera.location = (3.2, -3.0, 1.45)
camera.rotation_euler = (Vector((0, -.6, .30)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.hide_set(True)
scene.camera = camera
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_distance = 3.0
            area.spaces.active.region_3d.view_location = (0, -.6, .30)
            area.spaces.active.region_3d.view_rotation = camera.rotation_euler.to_quaternion()

scene.frame_set(0)
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
scene.render.filepath = str(HERE / "mite-leap-attack.mp4")
save_versions = bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "mite.blend"))
finally:
    bpy.context.preferences.filepaths.save_version = save_versions

result = dict(animations=["Idle", "Walk", "Run", "LeapAttack"], walk_duration_seconds=PERIOD / FPS,
              walk_speed_mps=rig["walk_speed_mps"], walk_frames=[0, PERIOD - 1],
              run_duration_seconds=RUN_PERIOD / FPS, run_speed_mps=rig["run_speed_mps"],
              run_frames=[0, RUN_PERIOD - 1], rigged_bytes=GLB.stat().st_size,
              leap_duration_seconds=LEAP_END / FPS, leap_distance_m=1.2, leap_root_height_m=LEAP_ROOT_HEIGHT_M,
              leap_attack_pitch_degrees=math.degrees(.60),
              leap_takeoff_seconds=LEAP_TAKEOFF / FPS, leap_impact_seconds=LEAP_LAND / FPS,
              leap_frames=[0, LEAP_END],
              gait_validation=validation)
stats_path = HERE / "asset-stats.json"
stats = json.loads(stats_path.read_text())
for key in ("min_foot_clearance_m", "max_foot_lift_m", "max_stance_height_error_m", "loop_seam_matrix_error"):
    stats.pop(key, None)
stats.update(result)
stats_path.write_text(json.dumps(stats, indent=2) + "\n")
print(json.dumps(result, indent=2))
