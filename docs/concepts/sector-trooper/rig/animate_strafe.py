"""Author mirrored, forward-facing lateral shuffle loops on the existing rig.

Feet step apart and follow without crossing. During support, lateral root
motion at speed_mps exactly cancels the backwards travel of the contact point.
Only the two generated actions and their descriptive properties are changed.
"""
from pathlib import Path
import ast
import hashlib
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
TAG = 'sector_trooper_strafe_v1'
FPS, PERIOD = 24, 14
STRIDE, DUTY, HALF_WIDTH = .54, .42, .265
SPEED = STRIDE/(PERIOD/FPS)
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
assert not rig.animation_data.nla_tracks
tree = ast.parse((HERE/'animate_walk.py').read_text())
names = {'action_signature','skeleton_signature','smooth','hermite','rotate_world'}
helpers = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
exec(compile(ast.Module(body=helpers,type_ignores=[]),str(HERE/'animate_walk.py'),'exec'))
preserved = {a.name:action_signature(a) for a in bpy.data.actions
             if a.name not in ['Strafe_Left','Strafe_Right']}
skeleton_before = skeleton_signature()
BODY = ['01 | HEAD - editable armor parts','04 | TORSO - editable armor parts',
        '05 | LEGS - editable armor and joints','06 | ARMS - editable armor and gloves']
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
    obj = bpy.data.objects['LEGS | '+side+' 09 broad charcoal sole']
    points = [obj.matrix_world@v.co-ankle for v in obj.data.vertices]
    sole = [p for p in points if abs(p.z+ankle.z-GROUND)<1e-6]
    boots[suffix] = dict(ankle=ankle,sole=sole,points=points,sign=sign,
                        height=ankle.z-GROUND)


def stance(suffix,p,direction):
    boot = boots[suffix]
    if p < .10:
        bank = -10*(1-smooth(p/.10))
    elif p <= .22:
        bank = 0
    else:
        bank = 18*smooth((p-.22)/(DUTY-.22))
    bank *= direction
    rotation = Matrix.Rotation(math.radians(bank),3,'Y')
    pivot = (max if bank>=0 else min)(boot['sole'],key=lambda v:v.x)
    base = Vector((boot['sign']*HALF_WIDTH-direction*STRIDE*(p-DUTY/2),
                   -.018 if boot['sign']==direction else .018,
                   GROUND+boot['height']))
    return base+pivot-rotation@pivot,rotation,pivot


def foot_path(suffix,p,direction):
    p %= 1
    if p <= DUTY:
        return stance(suffix,p,direction)
    u = (p-DUTY)/(1-DUTY)
    boot = boots[suffix]
    start,end = stance(suffix,DUTY,direction)[0],stance(suffix,0,direction)[0]
    tangent = Vector((-direction*STRIDE*(1-DUTY),0,0))
    ankle = hermite(start,end,tangent,tangent,u)
    bank = direction*(18-28*smooth(u))
    pitch = -16*math.sin(math.pi*u)**2
    rotation = Matrix.Rotation(math.radians(bank),3,'Y')@Matrix.Rotation(math.radians(pitch),3,'X')
    ankle.z = GROUND-min((rotation@q).z for q in boot['sole'])+.135*math.sin(math.pi*u)**2
    # The lead boot reaches slightly forward; the following boot stays behind
    # it, preserving the forward-facing stance and clearance during recovery.
    ankle.y -= .065*math.sin(math.pi*u)**2
    return ankle,rotation,None


def foot_phase(suffix,phase,direction):
    lead = 'L' if direction==1 else 'R'
    return (phase+(0 if suffix==lead else .5))%1


def pose_at(phase,direction):
    phase %= 1
    c = math.tau*phase
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    # Soft knees and a small movement-side lean; chest and helmet keep facing
    # the target instead of turning sideways into a forward run.
    bounce = math.cos(2*c+.16*math.pi)
    delta = Vector((direction*(.016+.014*math.sin(c-.2)),-.060,
                    -.070+.026*bounce))
    rig.pose.bones['pelvis'].location = rest['pelvis'].to_3x3().inverted()@delta
    rotate_world('pelvis',Matrix.Rotation(math.radians(3+bounce),3,'X')@
                 Matrix.Rotation(math.radians(direction*(1+math.sin(c))),3,'Y')@
                 Matrix.Rotation(math.radians(direction*5*math.cos(c)),3,'Z'))
    rotate_world('spine',Matrix.Rotation(math.radians(7+bounce),3,'X')@
                 Matrix.Rotation(math.radians(direction*(4+math.sin(c-.3))),3,'Y'))
    rotate_world('chest',Matrix.Rotation(math.radians(-direction*10*math.cos(c-.1)),3,'Z'))
    rotate_world('head',Matrix.Rotation(math.radians(direction*4*math.cos(c-.1)),3,'Z')@
                 Matrix.Rotation(math.radians(-5),3,'X')@
                 Matrix.Rotation(math.radians(-direction*2),3,'Y'))
    rotate_world('front_guard',Matrix.Rotation(math.radians(-11-3*math.sin(c)**2),3,'X'))
    rotate_world('rear_guard',Matrix.Rotation(math.radians(7+2*math.sin(c)**2),3,'X'))
    for suffix,sign in [('L',1),('R',-1)]:
        lead = sign==direction
        drive = (1 if lead else -1)*math.cos(c-.25)
        rotate_world('upper_arm.'+suffix,
                     Matrix.Rotation(math.radians(-12+6*drive),3,'X')@
                     Matrix.Rotation(math.radians(sign*(73+1.2*math.sin(c))),3,'Y'))
        rig.pose.bones['forearm.'+suffix].rotation_euler.z = -sign*math.radians(88-4*drive)
        rig.pose.bones['hand.'+suffix].rotation_euler.z = -sign*math.radians(4)
        p = foot_phase(suffix,phase,direction)
        ankle,rotation,pivot = foot_path(suffix,p,direction)
        name = 'foot_ik.'+suffix
        rig.pose.bones[name].location = rest[name].to_3x3().inverted()@(ankle-rest[name].translation)
        rotate_world(name,rotation)
        # Follow lateral foot movement with the knee poles, retaining forward
        # knee bend and avoiding a sudden inward swivel on the following leg.
        name = 'knee_pole.'+suffix
        pole = rest[name].translation.copy()
        pole.x = .55*ankle.x+.45*rig.data.bones['thigh.'+suffix].head_local.x
        rig.pose.bones[name].location = rest[name].to_3x3().inverted()@(pole-rest[name].translation)
    bpy.context.view_layer.update()


reports = {}
for clip,direction in [('Strafe_Left',1),('Strafe_Right',-1)]:
    rig.animation_data.action = None
    old = bpy.data.actions.get(clip)
    if old:
        assert old.get('generator')==TAG, 'Preserve a manually authored action'
        bpy.data.actions.remove(old)
    min_margin,min_gap,min_clearance,max_error = 1,1,1,0
    for sample in range(PERIOD*12):
        phase = sample/(PERIOD*12)
        pose_at(phase,direction)
        extents = {}
        for suffix in ['L','R']:
            ankle,rotation,pivot = foot_path(suffix,foot_phase(suffix,phase,direction),direction)
            hip = rig.pose.bones['thigh.'+suffix].head
            length = sum(rig.data.bones[n+'.'+suffix].length for n in ['thigh','shin'])
            margin = length-(ankle-hip).length
            error = (rig.pose.bones['shin.'+suffix].tail-ankle).length
            clearance = min((ankle+rotation@q).z-GROUND for q in boots[suffix]['sole'])
            min_margin,min_clearance,max_error = min(min_margin,margin),min(min_clearance,clearance),max(max_error,error)
            assert margin>.001,(clip,phase,'Leg overextended',margin)
            assert error<.001,(clip,phase,'IK misses target',error)
            assert clearance>-.00001,(clip,phase,'Foot through floor',clearance)
            points = [ankle+rotation@q for q in boots[suffix]['points']]
            extents[suffix] = (min(p.x for p in points),max(p.x for p in points))
        gap = extents['L'][0]-extents['R'][1]
        min_gap = min(min_gap,gap)
        assert gap>.008,(clip,phase,'Boots collide or cross',gap)
    for sample in range(PERIOD*4+1):
        frame = 1+sample/4
        pose_at((frame-1)/PERIOD,direction)
        for pb in rig.pose.bones:
            if pb.name.startswith(('thigh.','shin.','foot.','pauldron.','kneecap.')):
                continue
            for prop in ['location','rotation_euler']:
                pb.keyframe_insert(prop,frame=frame,group=pb.name)
        action = rig.animation_data.action
        action.name = clip
        action['generator'] = TAG
    action.use_fake_user = True
    props = dict(cycle_frames=PERIOD,fps=FPS,speed_mps=SPEED,stride_m=STRIDE,
                 stance_fraction=DUTY,in_place=True,direction_x=direction,
                 movement=f'Local {"+X (left)" if direction==1 else "-X (right)"}; facing Blender -Y / glTF +Z')
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
    reports[clip] = dict(props,frames=[1,PERIOD+1],playback_frames=[1,PERIOD],
        duration_seconds=PERIOD/FPS,foot_half_width_m=HALF_WIDTH,
        minimum_reach_margin_m=min_margin,minimum_boot_gap_m=min_gap,
        minimum_sole_clearance_m=min_clearance,max_ik_target_error_m=max_error)
assert skeleton_signature()==skeleton_before
assert geometry_signature()==rig['rest_geometry_signature']
assert all(action_signature(bpy.data.actions[n])==s for n,s in preserved.items())
rig['strafe_speed_mps'],rig['strafe_cycle_seconds'] = SPEED,PERIOD/FPS
rig['strafe_notes'] = 'In place: Left moves local +X, Right local -X. Facing glTF +Z. Match actor speed to clip rate.'
rig.animation_data.action = bpy.data.actions['Strafe_Left']
scene.render.fps = FPS
scene.frame_start,scene.frame_end = 1,PERIOD
scene.frame_set(1)
result = dict(animations=reports,geometry_skeleton_weights_unchanged=True,
              preserved_actions=preserved,skeleton_signature=skeleton_before)
(HERE/'strafe-metadata.json').write_text(json.dumps(result,indent=2)+'\n')
