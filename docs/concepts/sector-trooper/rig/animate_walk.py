"""Author a grounded in-place walk through the existing Blender rig controls.

Each planted foot tracks backwards at the actor's intended forward speed.
Heel and toe pivots account for the actual boot geometry; the swing path joins
the support path with matching velocities. No mesh or rest-bone changes.
"""
from pathlib import Path
import ast
import hashlib
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
TAG = 'sector_trooper_walk_v1'
FPS, PERIOD = 24, 28
STRIDE, DUTY = .84, .62
SPEED = STRIDE / (PERIOD/FPS)
GROUND = -486/384
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
assert rig.get('generator') == 'sector_trooper_rig_v1'
assert bpy.data.filepath.endswith('/sector-trooper/head/sector-trooper-head.blend')
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
rig.animation_data_create()
if rig.animation_data.action:
    rig.animation_data.action.use_fake_user = True
rig.animation_data.action = None
old = bpy.data.actions.get('Walk')
if old:
    assert old.get('generator') == TAG, 'Preserve the hand-authored Walk action'
    bpy.data.actions.remove(old)
assert not rig.animation_data.nla_tracks, 'Inspect existing NLA blending before animation'


def action_signature(action):
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    curves.append((curve.data_path,curve.array_index,
                                   [(tuple(k.co),k.interpolation,tuple(k.handle_left),tuple(k.handle_right)) for k in curve.keyframe_points]))
    return hashlib.sha256(json.dumps(curves).encode()).hexdigest()


def skeleton_signature():
    bones = [(b.name,b.parent.name if b.parent else None,list(b.head_local),list(b.tail_local),
              [list(row) for row in b.matrix_local],b.use_deform) for b in rig.data.bones]
    weights = [(o.name,[(g.name,g.index) for g in o.vertex_groups],
                [[(g.group,g.weight) for g in v.groups] for v in o.data.vertices])
               for o in bpy.data.objects if o.get('rig_binding')=='sector_trooper_rig_v1']
    return hashlib.sha256(json.dumps([bones,weights]).encode()).hexdigest()


rig_check_signature = action_signature(bpy.data.actions['Rig_Check'])
skeleton_before = skeleton_signature()
BODY = ['01 | HEAD - editable armor parts', '04 | TORSO - editable armor parts',
        '05 | LEGS - editable armor and joints', '06 | ARMS - editable armor and gloves']
tree = ast.parse((HERE/'build_rig.py').read_text())
fn = next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='geometry_signature')
exec(compile(ast.Module(body=[fn],type_ignores=[]),str(HERE/'build_rig.py'),'exec'))
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
assert geometry_signature() == rig['rest_geometry_signature']
rest = {b.name:b.matrix_local.copy() for b in rig.data.bones}
boots = {}
for suffix,side,sign in [('L','left',1),('R','right',-1)]:
    ankle = rig.data.bones['foot.'+suffix].head_local.copy()
    yaw = Matrix.Rotation(sign*math.radians(8),3,'Z')
    # Flat sole extrema are measured in the foot's unturned frame.
    obj = bpy.data.objects['LEGS | '+side+' 09 broad charcoal sole']
    sole = [obj.matrix_world@v.co-ankle for v in obj.data.vertices
            if abs((obj.matrix_world@v.co).z-GROUND)<1e-6]
    unturned = [yaw.inverted()@p for p in sole]
    heel = yaw @ Vector((0,max(p.y for p in unturned),GROUND-ankle.z))
    toe = yaw @ Vector((0,min(p.y for p in unturned),GROUND-ankle.z))
    boots[suffix] = dict(ankle=ankle,yaw=yaw,heel=heel,toe=toe,sole=sole,
                         x=sign*.175,height=ankle.z-GROUND)


def smooth(t):
    t = max(0,min(1,t))
    return t*t*t*(10+t*(-15+6*t))


def hermite(a,b,da,db,u):
    return a*(2*u**3-3*u*u+1) + b*(-2*u**3+3*u*u) + da*(u**3-2*u*u+u) + db*(u**3-u*u)


def roll_matrix(boot,degrees):
    return boot['yaw'] @ Matrix.Rotation(math.radians(degrees),3,'X') @ boot['yaw'].inverted()


def stance(suffix,p):
    boot = boots[suffix]
    if p < .10:
        pitch = -12*(1-smooth(p/.10))
        pivot = boot['heel']
    elif p <= .42:
        pitch = 0
        pivot = Vector((0,0,0))
    else:
        pitch = 25*smooth((p-.42)/(DUTY-.42))
        pivot = boot['toe']
    rotation = roll_matrix(boot,pitch)
    base = Vector((boot['x'], STRIDE*(p-DUTY/2), GROUND+boot['height']))
    return base + pivot - rotation@pivot, rotation, pivot, pitch


def foot_path(suffix,p):
    p %= 1
    if p <= DUTY:
        return stance(suffix,p)
    u = (p-DUTY)/(1-DUTY)
    boot = boots[suffix]
    start = stance(suffix,DUTY)[0]
    end = stance(suffix,0)[0]
    tangent = Vector((0,STRIDE*(1-DUTY),0))
    ankle = hermite(start,end,tangent,tangent,u)
    ankle.z += .025*math.sin(math.pi*u)**2
    # Early swing clears the toe; late swing presents the heel for landing.
    if u < .38:
        pitch = 25 + (1-25)*smooth(u/.38)
    elif u < .74:
        pitch = 1 + (-8-1)*smooth((u-.38)/.36)
    else:
        pitch = -8 + (-12+8)*smooth((u-.74)/.26)
    return ankle,roll_matrix(boot,pitch),None,pitch


def rotate_world(name,rotation):
    basis = rest[name].to_3x3()
    rig.pose.bones[name].rotation_euler = (basis.inverted()@rotation@basis).to_euler('XYZ')


def pose_at(phase):
    phase %= 1
    cycle = math.tau*phase
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    yaw = math.radians(-3)*math.cos(cycle)
    roll = math.radians(1.2)*math.sin(cycle)
    pelvis_delta = Vector((.018*math.sin(cycle),-.012,
                           -.021+.018*math.cos(2*cycle-1.2*math.pi)))
    rig.pose.bones['pelvis'].location = rest['pelvis'].to_3x3().inverted()@pelvis_delta
    rotate_world('pelvis',Matrix.Rotation(roll,3,'Y')@Matrix.Rotation(yaw,3,'Z'))
    rotate_world('spine',Matrix.Rotation(math.radians(1.5),3,'X'))
    rotate_world('chest',Matrix.Rotation(math.radians(5)*math.cos(cycle),3,'Z')@
                 Matrix.Rotation(-.7*roll,3,'Y'))
    rotate_world('head',Matrix.Rotation(math.radians(-1.6)*math.cos(cycle),3,'Z')@
                 Matrix.Rotation(math.radians(-.7),3,'X'))
    # Belt plates clear the thighs, with a small delayed response each step.
    plate = math.cos(cycle-.20)**2
    rotate_world('front_guard',Matrix.Rotation(math.radians(-7-11*plate),3,'X'))
    rotate_world('rear_guard',Matrix.Rotation(math.radians(4+6*plate),3,'X'))
    for suffix,sign in [('L',1),('R',-1)]:
        # Same-side arm swings backward as that leg reaches forward.
        swing = math.radians(15)*sign*math.cos(cycle-.12)
        rotation = Matrix.Rotation(swing,3,'X')@Matrix.Rotation(sign*math.radians(80),3,'Y')
        rotate_world('upper_arm.'+suffix,rotation)
        bend = 17 + 5*math.sin(cycle+(.0 if suffix=='L' else math.pi)-.4)
        rig.pose.bones['forearm.'+suffix].rotation_euler.z = -sign*math.radians(bend)
        rig.pose.bones['hand.'+suffix].rotation_euler.z = sign*math.radians(2)*math.sin(cycle-.4)
        p = (phase+(0 if suffix=='L' else .5))%1
        ankle,rotation,pivot,pitch = foot_path(suffix,p)
        name = 'foot_ik.'+suffix
        rig.pose.bones[name].location = rest[name].to_3x3().inverted()@(ankle-rest[name].translation)
        rotate_world(name,rotation)
    bpy.context.view_layer.update()


# Inspect densely before writing keys: exact support geometry and limb reach.
max_target_error = 0
min_clearance = 1
min_reach_margin = 1
max_clearance = 0
for sample in range(PERIOD*8):
    phase = sample/(PERIOD*8)
    pose_at(phase)
    for suffix in ['L','R']:
        p = (phase+(0 if suffix=='L' else .5))%1
        ankle,rotation,pivot,pitch = foot_path(suffix,p)
        hip = rig.pose.bones['thigh.'+suffix].head
        length = rig.data.bones['thigh.'+suffix].length+rig.data.bones['shin.'+suffix].length
        margin = length-(ankle-hip).length
        min_reach_margin = min(min_reach_margin,margin)
        assert margin>.0005, (suffix,phase,'Overextended leg',margin)
        error = (rig.pose.bones['shin.'+suffix].tail-ankle).length
        max_target_error = max(max_target_error,error)
        assert error<.001,(phase,suffix,'IK target error',error)
        clearance = min((ankle+rotation@q).z-GROUND for q in boots[suffix]['sole'])
        min_clearance = min(min_clearance,clearance)
        max_clearance = max(max_clearance,clearance)
        assert clearance>-.00001,(phase,suffix,'Foot through floor',clearance)

# Half-frame control keys retain the small heel/toe phases without Bezier
# overshoot; the exported animation samples the solved bones every frame.
for sample in range(PERIOD*2+1):
    frame = 1+sample/2
    pose_at((sample/2)/PERIOD)
    for pb in rig.pose.bones:
        if pb.name.startswith(('thigh.','shin.','foot.','pauldron.','kneecap.')):
            continue
        for prop in ['location','rotation_euler']:
            pb.keyframe_insert(prop,frame=frame,group=pb.name)
    action = rig.animation_data.action
    action.name = 'Walk'
    action['generator'] = TAG
action.use_fake_user = True
for key,value in {'cycle_frames':PERIOD,'fps':FPS,'speed_mps':SPEED,'stride_m':STRIDE,
                  'stance_fraction':DUTY,'in_place':True,'forward':'Blender -Y; glTF +Z'}.items():
    action[key] = value
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = 'LINEAR'
                mod = curve.modifiers.new('CYCLES')
                mod.mode_before = mod.mode_after = 'REPEAT'
assert skeleton_signature()==skeleton_before
assert action_signature(bpy.data.actions['Rig_Check'])==rig_check_signature
assert geometry_signature()==rig['rest_geometry_signature']
rig['walk_speed_mps'] = SPEED
rig['walk_cycle_seconds'] = PERIOD/FPS
rig['walk_stride_m'] = STRIDE
rig['walk_notes'] = 'In-place gait. Translate actor forward at 0.72 m/s at 1x playback; scale movement and clip rate together.'
scene.render.fps = FPS
scene.frame_start,scene.frame_end = 1,PERIOD
scene.frame_set(1)
stats = {'animation':'Walk','frames':[1,PERIOD+1],'playback_frames':[1,PERIOD],
         'fps':FPS,'duration_seconds':PERIOD/FPS,'speed_mps':SPEED,'stride_m':STRIDE,
         'stance_fraction':DUTY,'steps_per_minute':2*FPS/PERIOD*60,'in_place':True,
         'heel_contact_degrees':-12,'toe_off_degrees':25,
         'max_ik_target_error_m':max_target_error,'minimum_reach_margin_m':min_reach_margin,
         'minimum_sole_clearance_m':min_clearance,'maximum_swing_clearance_m':max_clearance,
         'dense_samples':PERIOD*8,'geometry_skeleton_weights_unchanged':True,
         'rig_check_preserved':True,'skeleton_signature':skeleton_before,
         'rig_check_signature':rig_check_signature}
(HERE/'walk-metadata.json').write_text(json.dumps(stats,indent=2)+'\n')
result = stats
