"""Author a quick backward hustle with toe-first contacts and restrained arms.

The forward-facing body leans slightly backward. Boots reach behind the
body and track forward during support to cancel backward actor translation.
"""
from pathlib import Path
import ast
import hashlib
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
TAG = 'sector_trooper_backward_v1'
FPS, PERIOD = 24, 16
STRIDE, DUTY = .72, .43
START_PHASE = 0.0
FOOT_Y = .12
SPEED = STRIDE/(PERIOD/FPS)
GROUND = -486/384
FOOT_X = .185
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
assert not rig.animation_data.nla_tracks
old = bpy.data.actions.get('Backward')
if old:
    assert old.get('generator') == TAG, 'Preserve the hand-authored Backward action'
    bpy.data.actions.remove(old)

# Load only pure helpers, never the walk generator's top-level mutations.
tree = ast.parse((HERE/'animate_walk.py').read_text())
helper_names = {'action_signature','skeleton_signature','smooth','hermite','roll_matrix','rotate_world'}
helpers = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in helper_names]
assert len(helpers) == len(helper_names)
exec(compile(ast.Module(body=helpers,type_ignores=[]),str(HERE/'animate_walk.py'),'exec'))
preserved_actions = {a.name:action_signature(a) for a in bpy.data.actions}
skeleton_before = skeleton_signature()
BODY = ['01 | HEAD - editable armor parts','04 | TORSO - editable armor parts',
        '05 | LEGS - editable armor and joints','06 | ARMS - editable armor and gloves']
tree = ast.parse((HERE/'build_rig.py').read_text())
helper = next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='geometry_signature')
exec(compile(ast.Module(body=[helper],type_ignores=[]),str(HERE/'build_rig.py'),'exec'))
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
assert geometry_signature() == rig['rest_geometry_signature']
rest = {b.name:b.matrix_local.copy() for b in rig.data.bones}
boots = {}
for suffix,side,sign in [('L','left',1),('R','right',-1)]:
    ankle = rig.data.bones['foot.'+suffix].head_local.copy()
    yaw = Matrix.Rotation(sign*math.radians(8),3,'Z')
    obj = bpy.data.objects['LEGS | '+side+' 09 broad charcoal sole']
    sole = [obj.matrix_world@v.co-ankle for v in obj.data.vertices
            if abs((obj.matrix_world@v.co).z-GROUND)<1e-6]
    local = [yaw.inverted()@p for p in sole]
    boots[suffix] = dict(ankle=ankle,yaw=yaw,sole=sole,x=sign*FOOT_X,
        height=ankle.z-GROUND,
        heel=yaw@Vector((0,max(p.y for p in local),GROUND-ankle.z)),
        toe=yaw@Vector((0,min(p.y for p in local),GROUND-ankle.z)))


def stance(suffix,p):
    boot = boots[suffix]
    # Backpedaling loads the forefoot, settles briefly and releases the heel.
    if p < .13:
        pitch = 24*(1-smooth(p/.13))
        pivot = boot['toe']
    elif p <= .27:
        pitch = 0
        pivot = Vector((0,0,0))
    else:
        pitch = -12*smooth((p-.27)/(DUTY-.27))
        pivot = boot['heel']
    rotation = roll_matrix(boot,pitch)
    base = Vector((boot['x'],FOOT_Y-STRIDE*(p-DUTY/2),GROUND+boot['height']))
    return base+pivot-rotation@pivot,rotation,pivot,pitch


def foot_path(suffix,p):
    p %= 1
    if p <= DUTY:
        return stance(suffix,p)
    u = (p-DUTY)/(1-DUTY)
    boot = boots[suffix]
    start,end = stance(suffix,DUTY)[0],stance(suffix,0)[0]
    tangent = Vector((0,-STRIDE*(1-DUTY),0))
    ankle = hermite(start,end,tangent,tangent,u)
    # Fold the knee during the quick recovery, then reach back toe-first.
    pitch = -12+36*smooth(u)
    rotation = roll_matrix(boot,pitch)
    ankle.z = GROUND-min((rotation@q).z for q in boot['sole'])+.115*math.sin(math.pi*u)**2
    return ankle,rotation,None,pitch


def pose_at(phase):
    phase %= 1
    c = math.tau*phase
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bounce = math.cos(2*c+.14*math.pi)
    delta = Vector((.010*math.sin(c-.1),.008+.004*bounce,-.052+.023*bounce))
    rig.pose.bones['pelvis'].location = rest['pelvis'].to_3x3().inverted()@delta
    rotate_world('pelvis',Matrix.Rotation(math.radians(-2-.5*bounce),3,'X')@
                 Matrix.Rotation(math.radians(.6*math.sin(c)),3,'Y')@
                 Matrix.Rotation(math.radians(4*math.cos(c)),3,'Z'))
    rotate_world('spine',Matrix.Rotation(math.radians(-4),3,'X'))
    rotate_world('chest',Matrix.Rotation(math.radians(-8*math.cos(c-.1)),3,'Z'))
    rotate_world('head',Matrix.Rotation(math.radians(3),3,'X')@
                 Matrix.Rotation(math.radians(3*math.cos(c-.1)),3,'Z'))
    rotate_world('front_guard',Matrix.Rotation(math.radians(-9-3*math.sin(c)**2),3,'X'))
    rotate_world('rear_guard',Matrix.Rotation(math.radians(9+4*math.sin(c)**2),3,'X'))
    for suffix,sign in [('L',1),('R',-1)]:
        drive = sign*math.cos(c-.2)
        rotate_world('upper_arm.'+suffix,Matrix.Rotation(math.radians(-12+6*drive),3,'X')@
                     Matrix.Rotation(sign*math.radians(73),3,'Y'))
        rig.pose.bones['forearm.'+suffix].rotation_euler.z = -sign*math.radians(88-4*drive)
        rig.pose.bones['hand.'+suffix].rotation_euler.z = -sign*math.radians(4)
        p = (phase+(0 if suffix=='L' else .5))%1
        ankle,rotation,pivot,pitch = foot_path(suffix,p)
        name = 'foot_ik.'+suffix
        rig.pose.bones[name].location = rest[name].to_3x3().inverted()@(ankle-rest[name].translation)
        rotate_world(name,rotation)
    bpy.context.view_layer.update()


max_error,max_lift = 0,0
min_margin,min_clearance = 1,1
for sample in range(PERIOD*12):
    phase = sample/(PERIOD*12)
    pose_at(phase)
    for suffix in ['L','R']:
        p = (phase+(0 if suffix=='L' else .5))%1
        ankle,rotation,pivot,pitch = foot_path(suffix,p)
        hip = rig.pose.bones['thigh.'+suffix].head
        length = sum(rig.data.bones[n+'.'+suffix].length for n in ['thigh','shin'])
        margin = length-(ankle-hip).length
        error = (rig.pose.bones['shin.'+suffix].tail-ankle).length
        clearance = min((ankle+rotation@q).z-GROUND for q in boots[suffix]['sole'])
        min_margin,min_clearance = min(min_margin,margin),min(min_clearance,clearance)
        max_error,max_lift = max(max_error,error),max(max_lift,clearance)
        assert margin>.001,('Overextended leg',suffix,phase,margin)
        assert error<.001,('IK error',suffix,phase,error)
        assert clearance>-.00001,('Foot penetrates ground',suffix,phase,clearance)
for sample in range(PERIOD*4+1):
    frame = 1+sample/4
    pose_at((frame-1)/PERIOD)
    for pb in rig.pose.bones:
        if pb.name.startswith(('thigh.','shin.','foot.','pauldron.','kneecap.')):
            continue
        for prop in ['location','rotation_euler']:
            pb.keyframe_insert(prop,frame=frame,group=pb.name)
    action = rig.animation_data.action
    action.name = 'Backward'
    action['generator'] = TAG
action.use_fake_user = True
props = dict(cycle_frames=PERIOD,fps=FPS,speed_mps=SPEED,stride_m=STRIDE,
             stance_fraction=DUTY,in_place=True,movement='Backward: Blender +Y / glTF -Z',
             facing='Blender -Y / glTF +Z')
for name,value in props.items():
    action[name] = value
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = 'LINEAR'
                mod = curve.modifiers.new('CYCLES')
                mod.mode_before = mod.mode_after = 'REPEAT'
assert skeleton_signature()==skeleton_before
assert geometry_signature()==rig['rest_geometry_signature']
assert all(action_signature(bpy.data.actions[n])==s for n,s in preserved_actions.items())
rig['backward_speed_mps'],rig['backward_cycle_seconds'] = SPEED,PERIOD/FPS
rig['backward_notes'] = 'Quick backward hustle. Move local glTF -Z at 1.08 m/s times playback rate; facing stays +Z.'
scene.render.fps = FPS
scene.frame_start,scene.frame_end = 1,PERIOD
scene.frame_set(1)
result = dict(props,animation='Backward',frames=[1,PERIOD+1],playback_frames=[1,PERIOD],
    duration_seconds=PERIOD/FPS,foot_half_width_m=FOOT_X,foot_y_bias_m=FOOT_Y,
    minimum_reach_margin_m=min_margin,minimum_sole_clearance_m=min_clearance,
    maximum_swing_clearance_m=max_lift,max_ik_target_error_m=max_error,
    body_backward_lean_degrees=6,upper_arm_swing_amplitude_degrees=6,
    geometry_skeleton_weights_unchanged=True,preserved_actions=preserved_actions,
    skeleton_signature=skeleton_before)
(HERE/'backward-metadata.json').write_text(json.dumps(result,indent=2)+'\n')
