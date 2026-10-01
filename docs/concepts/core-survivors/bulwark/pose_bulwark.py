"""A neutral standing display pose; the rig's rest pose remains a T-pose."""
from mathutils import Quaternion, Vector


def set_display_pose(rig, enabled=True):
    if rig.animation_data:
        rig.animation_data.action = None
        for track in rig.animation_data.nla_tracks:
            track.mute = True
    rig.data.pose_position = 'POSE' if enabled else 'REST'
    for pose in rig.pose.bones:
        pose.rotation_mode = 'QUATERNION'
        pose.rotation_quaternion = Quaternion()
        pose.location = (0, 0, 0)
        pose.scale = (1, 1, 1)
    if enabled:
        for side, sx in [('R', -1), ('L', 1)]:
            pose = rig.pose.bones[side + '.UpperArm']
            basis = pose.bone.matrix_local.to_quaternion()
            delta = Vector((sx, 0, 0)).rotation_difference(Vector((sx * .30, -.08, -.95)).normalized())
            pose.rotation_quaternion = basis.inverted() @ delta @ basis
