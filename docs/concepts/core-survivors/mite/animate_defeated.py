"""Add a one-shot Defeated collapse to Mite without changing existing clips."""
from pathlib import Path
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
GLB = HERE.parents[3] / "apps/web/public/models/hollow-legion/mite.glb"
TAG = "stakewars_mite_defeated_v1"
FPS, END = 24, 30
scene = bpy.data.scenes["MITE | Studio"]
bpy.context.window.scene = scene
rig = bpy.data.objects["Mite"]
mesh = bpy.data.objects["Mite_Armor"]
assert len(rig.data.bones) == 10
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
rig.animation_data_create()
assert rig.animation_data.action is None, "Preserve the active action before baking"
for track in list(rig.animation_data.nla_tracks):
    if track.name == "Defeated":
        assert all(strip.action.get("generator") == TAG for strip in track.strips)
        actions = [strip.action for strip in track.strips]
        rig.animation_data.nla_tracks.remove(track)
        for action in actions:
            if action.users <= 1: bpy.data.actions.remove(action)
    else:
        track.mute = True
rig.data.pose_position = "POSE"
for bone in rig.pose.bones:
    bone.rotation_mode = "QUATERNION"
    bone.matrix_basis = Matrix.Identity(4)

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


# Frame, body underside clearance, pitch, roll, leg spread, front-foot lift.
# Recoil, loss of support, impact, a small rebound, then a permanent splayed hold.
KEYS = [
    (0, .355, 0, 0, 0, 0),
    (3, .380, -.09, -.035, .06, .025),
    (7, .255, .035, .025, .32, .045),
    (11, .018, .16, .065, .85, 0),
    (14, .060, .11, .025, .97, .018),
    (20, .012, .14, .05, 1, 0),
    (24, .012, .14, .05, 1, 0),
    (30, .012, .14, .05, 1, 0),
]
body_group = mesh.vertex_groups["Body"].index
body_vertices = [v.co.copy() for v in mesh.data.vertices
                 if any(g.group == body_group and g.weight > .99 for g in v.groups)]

def pose_at(frame):
    for a, b in zip(KEYS, KEYS[1:]):
        if frame <= b[0]:
            u = max(0, min(1, (frame-a[0])/(b[0]-a[0])))
            u = u*u*(3-2*u)
            clearance,pitch,roll,spread,lift = [x+(y-x)*u for x,y in zip(a[1:],b[1:])]
            break
    rotation = Matrix.Rotation(roll,4,"Y") @ Matrix.Rotation(pitch,4,"X")
    deformation = Matrix.Translation(body_pivot) @ rotation @ Matrix.Translation(-body_pivot)
    deformation.translation.z += clearance - min((deformation@v).z for v in body_vertices)
    root_pose.matrix_basis = Matrix.Identity(4)
    set_pose_matrix(body, deformation@body_rest, root_rest)
    for name, leg in legs.items():
        foot = leg["toe"].copy()
        front = name in {"FL", "FR"}
        foot.x *= 1 + (.24 if front else .30)*spread
        foot.y *= 1 + (.16 if front else .10)*spread
        # A small asymmetry keeps the collapsed silhouette from looking posed.
        foot.y += (.025 if name in {"FL", "RR"} else -.025)*spread
        solve_leg(leg, deformation, foot, GROUND + (lift if front else lift*.3))

for sample in range(END*4+1): pose_at(sample/4)
for frame in range(END+1):
    scene.frame_set(frame)
    pose_at(frame)
    key_pose(frame)
    rig.animation_data.action["generator"] = TAG
track = finish_action("Defeated")
for name,frame in [("Buckle",3),("Impact",11),("Settle",20),("Hold",30)]:
    marker=track.strips[0].action.pose_markers.new(name);marker.frame=frame
rig["defeated_duration_seconds"] = END/FPS
rig["defeated_impact_seconds"] = 11/FPS
rig["defeated_notes"] = "One-shot collapse with four splayed limbs. Hold final pose; no root travel."
for bone in rig.pose.bones: bone.matrix_basis = Matrix.Identity(4)
for t in rig.animation_data.nla_tracks:t.mute=False
scene.render.fps=FPS
scene.frame_set(0)
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True);mesh.select_set(True)
bpy.context.view_layer.objects.active=mesh
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format="GLB",use_selection=True,use_active_scene=True,
    export_apply=True,export_animations=True,export_animation_mode="NLA_TRACKS",export_frame_range=False,
    export_frame_step=1,export_force_sampling=True,export_nla_strips=True,export_skins=True,
    export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
for t in rig.animation_data.nla_tracks:t.mute=t.name!="Defeated"
scene.frame_start,scene.frame_end=0,END
scene.frame_set(END)
scene.camera=bpy.data.objects["CAM · Hero"]
scene.camera.data.ortho_scale=1.85
scene.camera.rotation_euler=(Vector((0,0,.24))-scene.camera.location).to_track_quat("-Z","Y").to_euler()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_distance=2.2
            area.spaces.active.region_3d.view_location=(0,0,.24)
            area.spaces.active.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True);bpy.context.view_layer.objects.active=rig
old=bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"mite.blend"))
finally:bpy.context.preferences.filepaths.save_version=old
stats_path=HERE/"asset-stats.json"
stats=json.loads(stats_path.read_text())
stats["animations"]=[t.name for t in rig.animation_data.nla_tracks]
stats["rigged_bytes"]=GLB.stat().st_size
stats["defeated"]={"duration_seconds":END/FPS,"impact_seconds":11/FPS,"settled_seconds":20/FPS,"root_motion":False,"hold_final_pose":True}
stats_path.write_text(json.dumps(stats,indent=2)+"\n")
print(json.dumps(stats["defeated"]))
