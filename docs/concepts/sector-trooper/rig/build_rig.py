"""Create an editable armor-aware rig in the current Blender file via MCP.

No automatic heat weights: rigid plates each follow one deform bone. Only the
charcoal undersuit and flex joints blend between adjacent bones. Geometry,
materials, armor thickness and all comparison cameras remain unchanged.
"""
from pathlib import Path
import hashlib
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
S = 1 / 384
TAG = 'sector_trooper_rig_v1'
BODY = ['01 | HEAD - editable armor parts', '04 | TORSO - editable armor parts',
        '05 | LEGS - editable armor and joints', '06 | ARMS - editable armor and gloves']
scene = bpy.context.scene
assert bpy.data.filepath.endswith('/sector-trooper/head/sector-trooper-head.blend')
assert bpy.context.mode == 'OBJECT'
assert not any(o.type == 'ARMATURE' for o in scene.objects), 'Preserve the existing rig before rebuilding'
meshes = [o for name in BODY for o in bpy.data.collections[name].objects if o.type == 'MESH']
assert len(meshes) == 71
assert all(not o.vertex_groups and not any(m.type == 'ARMATURE' for m in o.modifiers) for o in meshes)


def geometry_signature():
    records = []
    for name in BODY + ['02 | STUDIO - cameras and lights']:
        for obj in sorted(bpy.data.collections[name].objects, key=lambda o:o.name):
            row = [obj.name, tuple(v for r in obj.matrix_world for v in r)]
            if obj.type == 'MESH':
                row.extend([[tuple(v.co) for v in obj.data.vertices],
                            [tuple(p.vertices) for p in obj.data.polygons],
                            [m.name for m in obj.data.materials],
                            [[tuple(v.color) for v in a.data] for a in obj.data.color_attributes],
                            [(m.name,m.type,getattr(m,'thickness',None)) for m in obj.modifiers if m.type != 'ARMATURE']])
            elif obj.type == 'CAMERA':
                row.extend([obj.data.lens,obj.data.ortho_scale])
            records.append(row)
    return hashlib.sha256(json.dumps(records).encode()).hexdigest()


bpy.context.view_layer.update()
signature = geometry_signature()
baseline = {}
dg = bpy.context.evaluated_depsgraph_get()
for obj in meshes:
    ev = obj.evaluated_get(dg)
    data = ev.to_mesh()
    baseline[obj.name] = [tuple(obj.matrix_world @ v.co) for v in data.vertices]
    ev.to_mesh_clear()
(HERE/'rest-baseline.json').write_text(json.dumps(baseline, separators=(',',':'))+'\n')

collection = bpy.data.collections.new('07 | RIG - pose controls')
collection['generator'] = TAG
scene.collection.children.link(collection)
armature = bpy.data.armatures.new('SectorTrooper_Skeleton')
rig = bpy.data.objects.new('SectorTrooper_Rig', armature)
collection.objects.link(rig)
rig['generator'] = TAG
rig['rest_geometry_signature'] = signature
rig['instructions'] = 'Pose Mode: move foot_ik controls; knee_pole steers knees. Rotate upper_arm, forearm, hand, chest and head. Root moves the whole rig.'
rig['armor_controls'] = 'front_guard and rear_guard hinge from the belt. Shoulder armor and kneecaps follow their joints automatically.'
rig['preview'] = 'Rig_Check is a posing demonstration, not a gameplay locomotion clip.'
rig.show_in_front = True
armature.display_type = 'OCTAHEDRAL'
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, head, tail, parent=None, deform=True, roll=(0,0,1)):
    b = armature.edit_bones.new(name)
    b.head, b.tail = Vector(head)*S, Vector(tail)*S
    if parent:
        b.parent = armature.edit_bones[parent]
    b.use_deform = deform
    b.use_connect = False
    b.inherit_scale = 'NONE'
    if abs((b.tail-b.head).normalized().dot(Vector(roll))) < .999:
        b.align_roll(Vector(roll))
    return b


bone('root', (0,0,-486), (0,0,-436), deform=False)
bone('pelvis', (0,0,-215), (0,0,-167), 'root')
bone('spine', (0,0,-167), (0,0,-105), 'pelvis')
bone('chest', (0,0,-105), (0,0,-20), 'spine')
bone('neck', (0,0,-20), (0,0,20), 'chest')
bone('head', (0,0,20), (0,0,180), 'neck')
bone('front_guard', (0,-54,-170), (0,-58,-232), 'pelvis', roll=(1,0,0))
bone('rear_guard', (0,55,-173), (0,59,-233), 'pelvis', roll=(1,0,0))
for suffix, sign in [('L',1), ('R',-1)]:
    bone('clavicle.'+suffix, (sign*12,0,-20), (sign*100,0,-44), 'chest')
    bone('upper_arm.'+suffix, (sign*100,0,-44), (sign*215,0,-44), 'clavicle.'+suffix)
    bone('forearm.'+suffix, (sign*215,0,-44), (sign*332,0,-44), 'upper_arm.'+suffix)
    bone('hand.'+suffix, (sign*332,0,-44), (sign*415,0,-44), 'forearm.'+suffix)
    bone('pauldron.'+suffix, (sign*100,0,-44), (sign*150,0,-44), 'clavicle.'+suffix)
    # A 4px internal prebend establishes a reliable IK plane without changing
    # a single vertex in the approved straight modeling pose.
    hip, knee, ankle = (sign*50,0,-215), (sign*62,-4,-317), (sign*74,0,-420)
    bone('thigh.'+suffix, hip, knee, 'pelvis', roll=(0,-1,0))
    bone('shin.'+suffix, knee, ankle, 'thigh.'+suffix, roll=(0,-1,0))
    bone('foot.'+suffix, ankle, (sign*84,-72,-439), 'shin.'+suffix)
    bone('kneecap.'+suffix, knee, Vector(knee)+(Vector(ankle)-Vector(knee))*.3,
         'thigh.'+suffix, roll=(0,-1,0))
    bone('foot_ik.'+suffix, ankle, (sign*84,-72,-439), 'root', deform=False)
    bone('knee_pole.'+suffix, (sign*62,-180,-317), (sign*62,-180,-292), 'root', deform=False)
bpy.ops.object.mode_set(mode='OBJECT')

groups = {name:armature.collections.new(name) for name in ['Body', 'Arms FK', 'Legs IK', 'Armor hinges', 'Deform helpers']}
for pb in rig.pose.bones:
    pb.rotation_mode = 'XYZ'
    pb.lock_scale = (True,True,True)
    pb.lock_location = (True,True,True)
    name = pb.name
    if name in ['root','pelvis'] or name.startswith(('foot_ik.','knee_pole.')):
        pb.lock_location = (False,False,False)
    if name.startswith(('thigh.','shin.','foot.','pauldron.','kneecap.')):
        group = 'Deform helpers'
    elif name.startswith(('foot_ik.','knee_pole.')):
        group = 'Legs IK'
    elif name.startswith(('clavicle.','upper_arm.','forearm.','hand.')):
        group = 'Arms FK'
    elif name in ['front_guard','rear_guard']:
        group = 'Armor hinges'
    else:
        group = 'Body'
    groups[group].assign(pb.bone)
    pb.bone.color.palette = 'THEME04' if name.endswith('.L') else 'THEME03' if name.endswith('.R') else 'THEME09'
groups['Deform helpers'].is_visible = False

for suffix in ['L','R']:
    ik = rig.pose.bones['shin.'+suffix].constraints.new('IK')
    ik.name = 'Foot plant IK'
    ik.target = rig
    ik.subtarget = 'foot_ik.'+suffix
    ik.pole_target = rig
    ik.pole_subtarget = 'knee_pole.'+suffix
    ik.chain_count = 2
    ik.use_tail = True
    ik.use_stretch = False
    ik.iterations = 128
    for segment in ['thigh.','shin.']:
        rig.pose.bones[segment+suffix].ik_stretch = 0
    orient = rig.pose.bones['foot.'+suffix].constraints.new('COPY_ROTATION')
    orient.name = 'Foot orientation'
    orient.target, orient.subtarget = rig, 'foot_ik.'+suffix
    orient.target_space = orient.owner_space = 'POSE'
    for name,target,influence in [('pauldron.','upper_arm.',.72),('kneecap.','shin.',.5)]:
        con = rig.pose.bones[name+suffix].constraints.new('COPY_ROTATION')
        con.name = 'Rigid armor follow'
        con.target, con.subtarget = rig, target+suffix
        con.target_space = con.owner_space = 'LOCAL'
        con.mix_mode = 'BEFORE'
        con.influence = influence
    # Calibrate the pole roll against the authored rest chain, not a guessed
    # left/right sign. The zero-pose skin must stay exactly where it was.
    scores = []
    for angle in [0, math.pi/2, -math.pi/2, math.pi]:
        ik.pole_angle = angle
        bpy.context.view_layer.update()
        score = sum((rig.pose.bones[n+suffix].head-armature.bones[n+suffix].head_local).length_squared for n in ['shin.','foot.'])
        scores.append((score,angle))
    ik.pole_angle = min(scores)[1]


def smooth(value, low, high):
    t = max(0,min(1,(value-low)/(high-low)))
    return t*t*(3-2*t)


def blend(a,b,t):
    return {a:1-t,b:t}


def weights(obj, point):
    x,y,z = point
    n = obj.name
    side = 'L' if ('left' in n) else 'R'
    if n.startswith('HEAD |'):
        return {'neck' if 'neck socket' in n else 'head':1}
    if n.startswith('TORSO |'):
        if 'undersuit' in n:
            if z < -145:
                return blend('pelvis','spine',smooth(z,-180,-145))
            return blend('spine','chest',smooth(z,-145,-85))
        if 'unified armored vest' in n:
            return {'chest':1}
        if 'pelvic belt' in n:
            return {'pelvis':1}
        if 'front groin' in n:
            return {'front_guard':1}
        if 'rear culet' in n:
            return {'rear_guard':1}
        if n.startswith('TORSO | 11'):
            return blend('clavicle.'+side,'upper_arm.'+side,smooth(abs(x),80,111))
        if n.startswith('TORSO | 12'):
            return {'upper_arm.'+side:1}
        if n.startswith(('TORSO | 13','TORSO | 14','TORSO | 15')):
            return {'pauldron.'+side:1}
    if n.startswith('ARMS |'):
        if '01 ' in n:
            return {'upper_arm.'+side:1}
        if '02 ' in n:
            return blend('upper_arm.'+side,'forearm.'+side,smooth(abs(x),207,224))
        if '03 ' in n:
            return {'forearm.'+side:1}
        if '04 ' in n:
            return blend('forearm.'+side,'hand.'+side,smooth(abs(x),322,337))
        return {'hand.'+side:1}
    if n.startswith('LEGS |'):
        part = int(n.split()[3])
        if part == 1:
            return blend('pelvis','thigh.'+side,1-smooth(z,-221,-189))
        if part == 2:
            return {'thigh.'+side:1}
        if part == 3:
            return blend('thigh.'+side,'shin.'+side,1-smooth(z,-341,-301))
        if part in (4,5):
            return {'kneecap.'+side:1}
        if part in (6,7):
            return {'shin.'+side:1}
        if part == 8:
            return blend('shin.'+side,'foot.'+side,1-smooth(z,-429,-408))
        return {'foot.'+side:1}
    raise AssertionError('Unassigned object: '+n)


for obj in meshes:
    for vertex in obj.data.vertices:
        point = (obj.matrix_world @ vertex.co)*384
        values = {name:w for name,w in weights(obj,point).items() if w > 1e-8}
        assert abs(sum(values.values())-1) < 1e-6 and len(values) <= 2
        for name,w in values.items():
            vg = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
            vg.add([vertex.index],w,'REPLACE')
    mod = obj.modifiers.new('Sector Trooper skin','ARMATURE')
    mod.object = rig
    mod.use_vertex_groups = True
    mod.use_bone_envelopes = False
    mod.use_deform_preserve_volume = False
    # Skin after Solidify so hard armor walls remain rigid in all poses.
    obj['rig_binding'] = TAG
for root_name in ['SectorTrooper_Head','SectorTrooper_Torso','SectorTrooper_Legs','SectorTrooper_Arms']:
    obj = bpy.data.objects[root_name]
    matrix = obj.matrix_world.copy()
    obj.parent = rig
    obj.matrix_world = matrix

# Wire-only custom shapes are hidden scene objects, not exportable body meshes.
widgets = bpy.data.collections.new('08 | RIG WIDGETS - hidden')
scene.collection.children.link(widgets)
widgets.hide_render = True
def shape(name, vertices, edges):
    data = bpy.data.meshes.new('WGT '+name)
    data.from_pydata(vertices,edges,[])
    ob = bpy.data.objects.new('WGT '+name,data)
    widgets.objects.link(ob)
    ob.hide_render = True
    ob.hide_set(True)
    return ob
circle = shape('ring',[(math.cos(i*math.tau/24),0,math.sin(i*math.tau/24)) for i in range(24)],[(i,(i+1)%24) for i in range(24)])
diamond = shape('diamond',[(1,0,0),(0,0,1),(-1,0,0),(0,0,-1)],[(i,(i+1)%4) for i in range(4)])
box = shape('foot', [(-1,-.4,0),(1,-.4,0),(1,2,0),(-1,2,0)],[(0,1),(1,2),(2,3),(3,0)])
for pb in rig.pose.bones:
    if pb.name.startswith(('thigh.','shin.','foot.','pauldron.','kneecap.')):
        continue
    pb.custom_shape = box if pb.name.startswith('foot_ik.') else diamond if pb.name.startswith('knee_pole.') else circle
    pb.use_custom_shape_bone_size = False
    size = .06
    if pb.name == 'root': size = .43
    elif pb.name == 'pelvis': size = .24
    elif pb.name in ['chest','spine']: size = .25
    elif pb.name == 'head': size = .40
    elif pb.name.startswith('foot_ik.'): size = .16
    elif pb.name in ['front_guard','rear_guard']: size = .095
    pb.custom_shape_scale_xyz = (size,size,size)
    pb.custom_shape_wire_width = 2
    if pb.name == 'head':
        pb.custom_shape_translation = (0,.33,0)

bpy.context.view_layer.update()
assert geometry_signature() == signature, 'Approved geometry or framing changed'
errors = []
dg = bpy.context.evaluated_depsgraph_get()
for obj in meshes:
    ev = obj.evaluated_get(dg)
    data = ev.to_mesh()
    assert len(data.vertices) == len(baseline[obj.name])
    errors.extend(((obj.matrix_world@v.co)-Vector(p)).length for v,p in zip(data.vertices,baseline[obj.name]))
    ev.to_mesh_clear()
# Blender's IK solver has a small rest tolerance; require sub-0.1mm error.
assert max(errors) < 1e-4, ('Rest pose changed',max(errors))
rig['max_rest_error_m'] = max(errors)
scene['rig_revision'] = 1
result = {'bones':len(armature.bones),'deform_bones':sum(b.use_deform for b in armature.bones),
          'bound_meshes':len(meshes),'max_rest_error_m':max(errors),'geometry_unchanged':True,
          'leg_controls':'Foot IK and knee poles','arm_controls':'FK upper arm, forearm and hand'}
