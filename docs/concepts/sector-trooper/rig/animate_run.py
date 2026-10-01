"""Add a separate in-place Run clip using the existing IK/FK controls.

Short support periods are separated by true flight phases. Rigid boots roll
through contact, recover under bent knees and land without support-foot slide.
The mesh, skin, rest skeleton, Walk and Rig_Check remain unchanged.
"""
from pathlib import Path
import ast
import hashlib
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
TAG = 'sector_trooper_run_v1'
FPS, PERIOD = 24, 18
STRIDE, DUTY = 1.32, .32
START_PHASE = .94
SPEED = STRIDE/(PERIOD/FPS)
GROUND = -486/384
FOOT_X = .172
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
old = bpy.data.actions.get('Run')
if old:
    assert old.get('generator') == TAG, 'Preserve the hand-authored Run action'
    bpy.data.actions.remove(old)

# Load only pure helpers, never the walk generator's top-level mutations.
tree = ast.parse((HERE/'animate_walk.py').read_text())
helper_names = {'action_signature','skeleton_signature','smooth','hermite','roll_matrix','rotate_world'}
helpers = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in helper_names]
assert len(helpers) == len(helper_names)
exec(compile(ast.Module(body=helpers,type_ignores=[]),str(HERE/'animate_walk.py'),'exec'))
preserved_actions = {name:action_signature(bpy.data.actions[name]) for name in ['Walk','Rig_Check']}
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
    if p < .055:
        pitch = -16*(1-smooth(p/.055))
        pivot = boot['heel']
    elif p <= .14:
        pitch = 0
        pivot = Vector((0,0,0))
    else:
        pitch = 47*smooth((p-.14)/(DUTY-.14))
        pivot = boot['toe']
    rotation = roll_matrix(boot,pitch)
    base = Vector((boot['x'],STRIDE*(p-DUTY/2),GROUND+boot['height']))
    return base+pivot-rotation@pivot,rotation,pivot,pitch


def foot_path(suffix,p):
    p %= 1
    if p <= DUTY:
        return stance(suffix,p)
    u = (p-DUTY)/(1-DUTY)
    boot = boots[suffix]
    start,end = stance(suffix,DUTY)[0],stance(suffix,0)[0]
    tangent = Vector((0,STRIDE*(1-DUTY),0))
    ankle = hermite(start,end,tangent,tangent,u)
    # Drive the recovery leg behind the hips through the airborne apex before
    # sweeping it forward. The early rearward arc opens the hip and knee;
    # the later reach draws back into contact at the planted-foot velocity.
    reach_keys = [(0,0,0),(.18,.24,0),(.30,.22,-.5),(.48,0,0),
                  (.72,-.14,0),(.88,-.13,.25),(1,0,0)]
    for (a,ya,da),(b,yb,db) in zip(reach_keys,reach_keys[1:]):
        if u <= b:
            ankle.y += hermite(ya,yb,da*(b-a),db*(b-a),(u-a)/(b-a))
            break
    if u < .24:
        pitch = 47+23*smooth(u/.24)
    elif u < .82:
        pitch = 70+(-24-70)*smooth((u-.24)/.58)
    else:
        pitch = -24+8*smooth((u-.82)/.18)
    rotation = roll_matrix(boot,pitch)
    # Pick up the heel early and fold it behind the thigh, then bring the
    # leading knee through before the foot lowers into the next contact.
    lift_keys = [(0,0,0),(.20,.14,.65),(.43,.235,0),(.72,.205,-.40),(.88,.11,-1.1),(1,0,0)]
    for (a,za,da),(b,zb,db) in zip(lift_keys,lift_keys[1:]):
        if u <= b:
            lift = hermite(za,zb,da*(b-a),db*(b-a),(u-a)/(b-a))
            break
    # Use the actual rotated sole, so heel recovery cannot drive the toe
    # through the floor. Zero lift/slope at both ends matches the support path.
    ankle.z = GROUND-min((rotation@q).z for q in boot['sole'])+lift
    return ankle,rotation,None,pitch


def pose_at(phase):
    phase %= 1
    cycle = math.tau*phase
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    # Keep the body centered over the stride. The vest's motion comes mainly
    # from axial counter-rotation against the pelvis, with a small weight shift.
    yaw = math.radians(-7)*math.cos(cycle)
    roll = math.radians(.9)*math.sin(cycle)
    sway = math.sin(cycle-.20)
    bounce = math.cos(2*cycle-1.76*math.pi)
    delta = Vector((.009*math.sin(cycle-.12),-.075+.010*bounce,-.032+.040*bounce))
    rig.pose.bones['pelvis'].location = rest['pelvis'].to_3x3().inverted()@delta
    rotate_world('pelvis',Matrix.Rotation(math.radians(5+1.5*bounce),3,'X')@
                 Matrix.Rotation(roll,3,'Y')@Matrix.Rotation(yaw,3,'Z'))
    rotate_world('spine',Matrix.Rotation(math.radians(8+1.5*math.sin(2*cycle-.8)),3,'X')@
                 Matrix.Rotation(math.radians(.6)*sway,3,'Y'))
    rotate_world('chest',Matrix.Rotation(math.radians(22)*math.cos(cycle-.10),3,'Z')@
                 Matrix.Rotation(math.radians(2+1.2*math.sin(2*cycle-1.1)),3,'X')@
                 Matrix.Rotation(math.radians(.2)*math.sin(cycle-.35),3,'Y'))
    # Keep some follow-through in the helmet while stabilizing its gaze.
    rotate_world('head',Matrix.Rotation(math.radians(-11)*math.cos(cycle-.15),3,'Z')@
                 Matrix.Rotation(math.radians(-5-1.5*math.sin(2*cycle-.8)),3,'X')@
                 Matrix.Rotation(math.radians(-1)*math.sin(cycle-.26),3,'Y'))
    plate = math.cos(cycle-.20)**2
    rotate_world('front_guard',Matrix.Rotation(math.radians(-11-17*plate),3,'X'))
    rotate_world('rear_guard',Matrix.Rotation(math.radians(8+8*plate),3,'X'))
    for suffix,sign in [('L',1),('R',-1)]:
        drive = sign*math.cos(cycle-.12)
        swing = math.radians(8+40*drive)
        rotate_world('upper_arm.'+suffix,Matrix.Rotation(swing,3,'X')@
                     Matrix.Rotation(sign*math.radians(78),3,'Y'))
        bend = 78-27*drive
        rig.pose.bones['forearm.'+suffix].rotation_euler.z = -sign*math.radians(bend)
        rig.pose.bones['hand.'+suffix].rotation_euler.z = -sign*math.radians(4)
        p = (phase+(0 if suffix=='L' else .5))%1
        ankle,rotation,pivot,pitch = foot_path(suffix,p)
        name = 'foot_ik.'+suffix
        rig.pose.bones[name].location = rest[name].to_3x3().inverted()@(ankle-rest[name].translation)
        rotate_world(name,rotation)
    bpy.context.view_layer.update()


max_ik_error,max_lift = 0,0
min_margin,min_clearance = 1,1
flights = 0
for sample in range(PERIOD*12):
    phase = sample/(PERIOD*12)
    pose_at(phase)
    airborne = []
    for suffix in ['L','R']:
        p = (phase+(0 if suffix=='L' else .5))%1
        ankle,rotation,pivot,pitch = foot_path(suffix,p)
        hip = rig.pose.bones['thigh.'+suffix].head
        length = rig.data.bones['thigh.'+suffix].length+rig.data.bones['shin.'+suffix].length
        margin = length-(ankle-hip).length
        min_margin = min(min_margin,margin)
        assert margin>.0005,(suffix,phase,'Overextended leg',margin)
        error = (rig.pose.bones['shin.'+suffix].tail-ankle).length
        max_ik_error = max(max_ik_error,error)
        assert error<.001,(suffix,phase,'IK target error',error)
        clearance = min((ankle+rotation@q).z-GROUND for q in boots[suffix]['sole'])
        min_clearance,max_lift = min(min_clearance,clearance),max(max_lift,clearance)
        assert clearance>-.00001,(phase,suffix,'Toe through ground',clearance)
        airborne.append(p>DUTY)
    flights += all(airborne)
assert abs(flights/(PERIOD*12)-(1-2*DUTY)) < .02

for sample in range(PERIOD*4+1):
    frame = 1+sample/4
    pose_at((sample/4)/PERIOD+START_PHASE)
    for pb in rig.pose.bones:
        if pb.name.startswith(('thigh.','shin.','foot.','pauldron.','kneecap.')):
            continue
        for prop in ['location','rotation_euler']:
            pb.keyframe_insert(prop,frame=frame,group=pb.name)
    action = rig.animation_data.action
    action.name = 'Run'
    action['generator'] = TAG
action.use_fake_user = True
for name,value in dict(cycle_frames=PERIOD,fps=FPS,speed_mps=SPEED,stride_m=STRIDE,
                       stance_fraction=DUTY,in_place=True,forward='Blender -Y; glTF +Z').items():
    action[name] = value
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = 'LINEAR'
                mod = curve.modifiers.new('CYCLES')
                mod.mode_before = mod.mode_after = 'REPEAT'
assert skeleton_signature() == skeleton_before
assert geometry_signature() == rig['rest_geometry_signature']
assert all(action_signature(bpy.data.actions[n])==s for n,s in preserved_actions.items())
rig['run_speed_mps'],rig['run_cycle_seconds'],rig['run_stride_m'] = SPEED,PERIOD/FPS,STRIDE
rig['run_notes'] = f'In-place Run: move the actor forward at {SPEED:.2f} m/s at 1x playback. Match movement speed to clip rate.'
scene.render.fps = FPS
scene.frame_start,scene.frame_end = 1,PERIOD
scene.frame_set(1)
stats = dict(animation='Run',frames=[1,PERIOD+1],playback_frames=[1,PERIOD],fps=FPS,
    duration_seconds=PERIOD/FPS,speed_mps=SPEED,stride_m=STRIDE,stance_fraction=DUTY,
    steps_per_minute=2*FPS/PERIOD*60,in_place=True,foot_half_width_m=FOOT_X,
    start_phase=START_PHASE,toe_roll_start=.14,heel_contact_degrees=-16,toe_off_degrees=47,
    flight_fraction=flights/(PERIOD*12),max_ik_target_error_m=max_ik_error,
    minimum_reach_margin_m=min_margin,minimum_sole_clearance_m=min_clearance,
    maximum_swing_clearance_m=max_lift,dense_samples=PERIOD*12,
    geometry_skeleton_weights_unchanged=True,preserved_actions=preserved_actions,
    skeleton_signature=skeleton_before,
    reference='sector-trooper-run-reference.png',
    rearward_swing_extension_m=.24,
    body_motion={'pelvis_lateral_amplitude_m':.009,'pelvis_vertical_amplitude_m':.040,
                 'pelvis_forward_offset_m':.075,'pelvis_height_offset_m':-.032,
                 'pelvis_twist_degrees':7,'pelvis_roll_degrees':.9,
                 'spine_side_bend_degrees':.6,'chest_local_counter_twist_degrees':22,
                 'arm_swing_amplitude_degrees':40,'arm_back_bias_degrees':8,
                 'elbow_flexion_range_degrees':[51,105]})
(HERE/'run-metadata.json').write_text(json.dumps(stats,indent=2)+'\n')
result = stats
