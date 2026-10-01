"""Bake a one-shot bent-over defeat; preserve the mesh and previous clips."""
from pathlib import Path
import json, math
import bpy
from mathutils import Matrix, Vector
HERE = Path(__file__).resolve().parent
GLB = HERE.parents[3] / "apps/web/public/models/hollow-legion/lancer.glb"
TAG = "stakewars_lancer_defeated_v1"
FPS, END = 24, 30
scene = bpy.data.scenes["LANCER | Studio"]
bpy.context.window.scene = scene
rig = bpy.data.objects["Lancer"]
mesh = bpy.data.objects["Lancer_Armor"]
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
assert rig.animation_data.action is None, "Preserve active action before baking"
for track in list(rig.animation_data.nla_tracks):
    if track.name == "Defeated":
        assert all(s.action.get("generator") == TAG for s in track.strips)
        actions = [s.action for s in track.strips]
        rig.animation_data.nla_tracks.remove(track)
        for action in actions:
            if action.users <= 1: bpy.data.actions.remove(action)
    else: track.mute = True
rig.data.pose_position = "POSE"
rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
rest_inverse = {name: matrix.inverted() for name, matrix in rest.items()}
legs = {}
for side in ("R", "L"):
    upper, lower, foot = [rig.data.bones[side + suffix] for suffix in (".UpperLeg", ".LowerLeg", ".Foot")]
    group = mesh.vertex_groups[foot.name].index
    offsets = [v.co - foot.head_local for v in mesh.data.vertices
               if any(g.group == group and g.weight > .99 for g in v.groups)]
    legs[side] = dict(hip=upper.head_local.copy(), knee=lower.head_local.copy(),
                      ankle=foot.head_local.copy(), offsets=offsets,
                      length1=upper.length, length2=lower.length)


def pivot_rotation(pivot, rotation):
    return Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-pivot)


def joint(name, rotation, poses):
    parent = rig.data.bones[name].parent.name
    inherited = poses[parent] @ rest_inverse[parent]
    return inherited @ pivot_rotation(rig.data.bones[name].head_local, rotation) @ rest[name]


def aimed(name, head, tail):
    bone = rig.data.bones[name]
    rotation = (bone.tail_local - bone.head_local).rotation_difference(tail - head)
    matrix = rotation.to_matrix().to_4x4() @ rest[name]
    matrix.translation = head
    return matrix



# Frame, hip drop, torso bend, head droop. A quick loss of support, then settle.
KEYS = [(0,0,0,0),(3,.025,.08,.06),(11,.17,1.22,.22),
        (15,.145,1.06,.18),(21,.16,1.13,.22),(30,.16,1.13,.22)]
def pose_at(frame):
    for a,b in zip(KEYS,KEYS[1:]):
        if frame <= b[0]:
            u=max(0,min(1,(frame-a[0])/(b[0]-a[0]))); u=u*u*(3-2*u)
            drop,lean,nod=[x+(y-x)*u for x,y in zip(a[1:],b[1:])]
            break
    amount=drop/.17
    hips_deformation=Matrix.Translation((0,.075*amount,-drop))
    poses={"Root":rest["Root"].copy(),"Hips":hips_deformation@rest["Hips"]}
    poses["Spine"]=joint("Spine",Matrix.Rotation(lean,4,"X")@Matrix.Rotation(.035*amount,4,"Y"),poses)
    poses["Head"]=joint("Head",Matrix.Rotation(nod,4,"X"),poses)
    for side,sign in (("R",1),("L",-1)):
        # Shoulder compensation lets the cannon and claw hang as the torso folds.
        poses[side+".UpperArm"]=joint(side+".UpperArm",Matrix.Rotation(-lean*.88,4,"X")@Matrix.Rotation(sign*.10*amount,4,"Y"),poses)
        poses[side+".Forearm"]=joint(side+".Forearm",Matrix.Rotation(-.08*amount,4,"X"),poses)
    for name in ("L.Hand","Cannon","Muzzle"):
        poses[name]=joint(name,Matrix.Identity(4),poses)
    for side,leg in legs.items():
        ankle=leg["ankle"].copy()
        hip=hips_deformation@leg["hip"]
        delta=ankle-hip; distance=delta.length
        a,b=leg["length1"],leg["length2"]
        assert abs(a-b)<distance<a+b+.0001
        direction=delta.normalized();pole=Vector((0,-1,0))
        bend=(pole-direction*pole.dot(direction)).normalized()
        along=(a*a-b*b+distance*distance)/(2*distance)
        knee=hip+direction*along+bend*math.sqrt(max(0,a*a-along*along))
        poses[side+".UpperLeg"]=aimed(side+".UpperLeg",hip,knee)
        poses[side+".LowerLeg"]=aimed(side+".LowerLeg",knee,ankle)
        poses[side+".Foot"]=rest[side+".Foot"].copy()
    for pose in rig.pose.bones:
        pose.rotation_mode="XYZ"
        kwargs={}
        if pose.parent:
            kwargs=dict(parent_matrix=poses[pose.parent.name],parent_matrix_local=rest[pose.parent.name])
        pose.matrix_basis=pose.bone.convert_local_to_pose(poses[pose.name],rest[pose.name],invert=True,**kwargs)

for frame in range(END+1):
    scene.frame_set(frame);pose_at(frame)
    for pose in rig.pose.bones:
        for prop in ("location","rotation_euler","scale"):
            pose.keyframe_insert(prop,frame=frame,group=pose.name)
    rig.animation_data.action["generator"]=TAG
action=rig.animation_data.action;action.name="Defeated";action.use_fake_user=True
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:key.interpolation="LINEAR"
track=rig.animation_data.nla_tracks.new();track.name="Defeated"
track.strips.new("Defeated",0,action);rig.animation_data.action=None
for name,frame in [("Buckle",3),("Fold",11),("Settle",21),("Hold",30)]:
    marker=action.pose_markers.new(name);marker.frame=frame
rig["defeated_duration_seconds"]=END/FPS
rig["defeated_notes"]="One-shot forward fold with planted feet, slack cannon and claw. Hold final pose; no root travel."
for pose in rig.pose.bones:pose.matrix_basis=Matrix.Identity(4)
for t in rig.animation_data.nla_tracks:t.mute=False
scene.render.fps=FPS;scene.frame_set(0)
bpy.ops.object.select_all(action="DESELECT");rig.select_set(True);mesh.select_set(True)
bpy.context.view_layer.objects.active=mesh
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format="GLB",use_selection=True,use_active_scene=True,
 export_apply=True,export_animations=True,export_animation_mode="NLA_TRACKS",export_frame_range=False,
 export_frame_step=1,export_force_sampling=True,export_nla_strips=True,export_skins=True,
 export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
for t in rig.animation_data.nla_tracks:t.mute=t.name!="Defeated"
scene.frame_start,scene.frame_end=0,END;scene.frame_set(END)
bpy.ops.object.select_all(action="DESELECT");rig.select_set(True);bpy.context.view_layer.objects.active=rig
old=bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"lancer.blend"))
finally:bpy.context.preferences.filepaths.save_version=old
stats_path=HERE/"asset-stats.json";stats=json.loads(stats_path.read_text())
stats["animations"]=[t.name for t in rig.animation_data.nla_tracks]
stats["rigged_bytes"]=GLB.stat().st_size
stats["defeated"]={"duration_seconds":END/FPS,"settled_seconds":21/FPS,"root_motion":False,"hold_final_pose":True}
stats_path.write_text(json.dumps(stats,indent=2)+"\n")
print(json.dumps(stats["defeated"]))
