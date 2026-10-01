"""Bake a sliding, root-motion ShieldThrust without changing meshes or locomotion."""
from pathlib import Path
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[3] / 'apps/web/public/models/hollow-legion'
NAME, TAG, FPS, END = 'ShieldThrust', 'stakewars_bulwark_shield_thrust_v2', 24, 42
TRAVEL = 1.2
DRIVE_START, DRIVE_END = 13, 22
scene = bpy.data.scenes['BULWARK | Studio']
rig = bpy.data.objects['Bulwark']
body = bpy.data.objects['Bulwark_Armor']
shield = bpy.data.objects['Bulwark_Shield']
assert len(rig.data.bones) == 18
bpy.context.window.scene = scene
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
rig.animation_data_create()
assert rig.animation_data.action is None, 'Preserve any active hand-authored action first'
for track in list(rig.animation_data.nla_tracks):
    if track.name == NAME:
        assert all(s.action.get('generator') in (TAG, 'stakewars_bulwark_shield_thrust_v1') for s in track.strips)
        actions = [s.action for s in track.strips]
        rig.animation_data.nla_tracks.remove(track)
        for action in actions:
            if action.users <= 1:
                bpy.data.actions.remove(action)
    else:
        track.mute = True
rig.data.pose_position = 'POSE'
scene.render.fps = FPS
rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
inv = {name: mat.inverted() for name, mat in rest.items()}


def pivot(point, rotation):
    return Matrix.Translation(point) @ rotation @ Matrix.Translation(-point)


def joint(name, rotation, poses):
    parent = rig.data.bones[name].parent.name
    return poses[parent] @ inv[parent] @ pivot(rig.data.bones[name].head_local, rotation) @ rest[name]


def aimed(name, head, tail):
    bone = rig.data.bones[name]
    rotation = (bone.tail_local - bone.head_local).rotation_difference(tail - head)
    result = rotation.to_matrix().to_4x4() @ rest[name]
    result.translation = head
    return result


def solve_chain(upper, lower, head, target, pole, poses):
    a, b = rig.data.bones[upper].length, rig.data.bones[lower].length
    delta = target - head
    d = delta.length
    assert abs(a-b)+.001 < d < a+b-.001, (upper, d, a+b)
    direction = delta.normalized()
    bend = (pole - direction * pole.dot(direction)).normalized()
    along = (a*a-b*b+d*d)/(2*d)
    elbow = head + along * direction + math.sqrt(max(0, a*a-along*along)) * bend
    poses[upper] = aimed(upper, head, elbow)
    poses[lower] = aimed(lower, elbow, target)


# Frame, hip Y, hip Z offset, torso pitch, torso yaw, shield wrist X/Y/Z.
# The fast 13–18 extension contrasts with a long visible anticipation/recovery.
KEYS = [
    (0,  0.00, -.100,  .02,  .00, .80, -.35, 1.00),
    (5,  .025, -.130, -.02, -.04, .80, -.28, 1.08),
    (12, .070, -.160, -.08, -.10, .82, -.18, 1.10),
    (13, .070, -.160, -.08, -.10, .82, -.18, 1.10),
    (18,-.180, -.175,  .22,  .09, .65, -.82, 1.10),
    (20,-.165, -.175,  .20,  .08, .66, -.80, 1.10),
    (25,-.100, -.160,  .13,  .03, .70, -.62, 1.04),
    (34,-.015, -.120,  .04,  .00, .78, -.38, 1.00),
    (42, .000, -.100,  .02,  .00, .80, -.35, 1.00),
]
# Keep the shield's broad face aimed forward independently of elbow bend.
hand_base = Vector((1,0,0)).rotation_difference(Vector((.30,-.08,-.95)).normalized()).to_matrix().to_4x4()
feet = {}
foot_offsets = {}
for side in ('R','L'):
    foot = rig.data.bones[side+'.Foot']
    group = body.vertex_groups[foot.name].index
    offsets = [v.co-foot.head_local for v in body.data.vertices
               if any(g.group==group and g.weight>.99 for g in v.groups)]
    ankle = foot.head_local.copy()
    ankle.x += -.035 if side=='R' else .035
    ankle.y += .12 if side=='R' else -.17
    ankle.z = .006-min(v.z for v in offsets)
    feet[side] = ankle
    foot_offsets[side] = offsets


def drive_at(frame):
    u = max(0.0, min(1.0, (frame-DRIVE_START)/(DRIVE_END-DRIVE_START)))
    # Quintic easing: accelerate from the loaded stance, brake into the landing.
    return u, TRAVEL * (10*u**3 - 15*u**4 + 6*u**5)


def pose_at(frame):
    for start, end in zip(KEYS, KEYS[1:]):
        if frame <= end[0]:
            u = max(0,min(1,(frame-start[0])/(end[0]-start[0])))
            u = u*u*(3-2*u)
            hy,hz,pitch,yaw,wx,wy,wz = [a+(b-a)*u for a,b in zip(start[1:],end[1:])]
            break
    hips = Matrix.Translation((0,hy,hz))
    poses = {'Root':rest['Root'].copy(), 'Hips':hips@rest['Hips']}
    poses['Spine'] = joint('Spine',Matrix.Rotation(pitch,4,'X')@Matrix.Rotation(yaw,4,'Z'),poses)
    poses['Head'] = joint('Head',Matrix.Rotation(-pitch*.55,4,'X')@Matrix.Rotation(-yaw*.55,4,'Z'),poses)
    shoulder = poses['Spine']@inv['Spine']@rig.data.bones['L.UpperArm'].head_local
    # Keep the grip left of center; a shorter arm extension preserves reach.
    extension = max(0.0, min(1.0, (-wy - .35) / .47))
    wrist = Vector((max(.32, wx - .48), wy + .12 * extension, wz))
    solve_chain('L.UpperArm','L.Forearm',shoulder,wrist,Vector((1,0,.1)),poses)
    poses['L.Hand'] = hand_base@rest['L.Hand']
    poses['L.Hand'].translation = wrist
    poses['L.EquipmentSocket'] = joint('L.EquipmentSocket',Matrix.Identity(4),poses)
    # Free arm braces beside the body, counterbalancing the shield drive.
    base = Vector((-1,0,0)).rotation_difference(Vector((-.38,-.15,-.91)).normalized()).to_matrix().to_4x4()
    swing = -.12-pitch*.45
    poses['R.UpperArm'] = joint('R.UpperArm',Matrix.Rotation(swing,4,'X')@base,poses)
    bend = base.inverted()@Matrix.Rotation(-.40,4,'X')@base
    poses['R.Forearm'] = joint('R.Forearm',bend,poses)
    poses['R.Hand'] = joint('R.Hand',Matrix.Identity(4),poses)
    poses['R.EquipmentSocket'] = joint('R.EquipmentSocket',Matrix.Identity(4),poses)
    drive_phase, distance = drive_at(frame)
    skid = math.sin(math.pi*drive_phase)
    for side in ('R','L'):
        hip = hips@rig.data.bones[side+'.UpperLeg'].head_local
        ankle = feet[side].copy()
        # Rear foot trails on its toe; the lead foot reaches ahead and skims.
        ankle.y += (.14 if side == 'R' else -.10) * skid
        pitch_foot = (.22 if side == 'R' else -.10) * skid
        lift = (.012 if side == 'R' else .055) * skid*skid
        foot_rotation = Matrix.Rotation(pitch_foot,4,'X')
        ankle.z = .006 + lift - min((foot_rotation@v).z for v in foot_offsets[side])
        solve_chain(side+'.UpperLeg',side+'.LowerLeg',hip,ankle,Vector((0,-1,0)),poses)
        poses[side+'.Foot'] = foot_rotation@rest[side+'.Foot']
        poses[side+'.Foot'].translation = ankle
    # Apply the same translation to the full solved pose, including Root.
    # End displacement is retained: this is a one-shot, not a looping attack.
    root_translation = Matrix.Translation((0,-distance,0))
    poses = {name:root_translation@matrix for name,matrix in poses.items()}
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        kw = dict(parent_matrix=poses[bone.parent.name],parent_matrix_local=rest[bone.parent.name]) if bone.parent else {}
        bone.matrix_basis = bone.bone.convert_local_to_pose(poses[bone.name],rest[bone.name],invert=True,**kw)


# Preflight chain reach over fractional frames before creating animation data.
for sample in range(END*4+1):
    pose_at(sample/4)
for frame in range(END+1):
    scene.frame_set(frame)
    pose_at(frame)
    for bone in rig.pose.bones:
        for prop in ('location','rotation_quaternion','scale'):
            bone.keyframe_insert(prop,frame=frame,group=bone.name)
    rig.animation_data.action['generator'] = TAG
action = rig.animation_data.action
action.name = NAME
action.use_fake_user = True
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = 'LINEAR'
for name,frame in [('Windup',0),('Drive',13),('Impact',18),('Landed',22),('Recovery',23),('Ready',42)]:
    marker = action.pose_markers.new(name)
    marker.frame = frame
track = rig.animation_data.nla_tracks.new()
track.name = NAME
track.strips.new(NAME,0,action)
track.mute = True
rig.animation_data.action = None
rig['shield_thrust_duration_seconds'] = END/FPS
rig['shield_thrust_impact_seconds'] = 18/FPS
rig['shield_thrust_active_start_seconds'] = 16/FPS
rig['shield_thrust_active_end_seconds'] = 20/FPS
rig['shield_thrust_distance_m'] = TRAVEL
rig['shield_thrust_drive_start_seconds'] = DRIVE_START/FPS
rig['shield_thrust_drive_end_seconds'] = DRIVE_END/FPS
rig['shield_thrust_notes'] = 'One-shot +Z root-motion slide, 1.2 m authored distance. Retain landing displacement; consume Root into actor movement, then rebase before locomotion. Damage/AI not wired.'
for bone in rig.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
scene.frame_set(0)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in (rig,body,shield): obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(filepath=str(OUT/'bulwark.glb'),export_format='GLB',use_selection=True,
    use_active_scene=True,export_apply=True,export_animations=True,export_frame_range=False,
    export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_skins=True,
    export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
for track in rig.animation_data.nla_tracks:
    track.mute = track.name != NAME
scene.frame_start,scene.frame_end = 0,END
scene.frame_set(18)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'bulwark.blend'))
stats_path = HERE/'asset-stats.json'
stats = json.loads(stats_path.read_text())
stats['animations'] = [track.name for track in rig.animation_data.nla_tracks]
stats['rigged_bytes'] = (OUT/'bulwark.glb').stat().st_size
stats['shield_thrust'] = dict(duration_seconds=END/FPS,impact_frame=18,impact_seconds=18/FPS,
    active_window_seconds=[16/FPS,20/FPS],recovery_seconds=[23/FPS,END/FPS],root_motion=True,
    distance_m=TRAVEL,drive_window_seconds=[DRIVE_START/FPS,DRIVE_END/FPS],
    retained_end_displacement=True,planted_feet=False,gameplay_integrated=False)
stats_path.write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps(stats['shield_thrust']),flush=True)
