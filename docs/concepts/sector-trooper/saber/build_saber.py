"""Build a separate saber/ready-idle variant from the canonical rifle trooper.
Run with background Blender against ../head/sector-trooper-head.blend.
The source character and rifle files are never saved or changed.
"""
from pathlib import Path
import json, math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
assert bpy.app.background
assert Path(bpy.data.filepath).name == 'sector-trooper-head.blend'
body = [o for o in scene.objects if o.type == 'MESH' and o.get('rig_binding') == 'sector_trooper_rig_v1']
assert len(body) == 71
original_actions = {a.name for a in bpy.data.actions}
for a in bpy.data.actions: a.use_fake_user = True
rig.animation_data.action = None
for track in rig.animation_data.nla_tracks: track.mute = True
# Remove only the weapon from this new variant; the original remains in its source file.
for o in list(bpy.data.objects):
    if o.name.startswith(('RIFLE |', 'RIFLE CUTTER |', 'ATTACH |')) or o.name == 'SectorTrooper_Rifle':
        bpy.data.objects.remove(o, do_unlink=True)
rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}

def segment(name, head, tail):
    rotation = rest[name].to_3x3().col[1].rotation_difference((tail-head).normalized()).to_matrix() @ rest[name].to_3x3()
    mat = rotation.to_4x4(); mat.translation = head
    rig.pose.bones[name].matrix = mat
    bpy.context.view_layer.update()

def arm(side, wrist):
    upper, lower = 'upper_arm.'+side, 'forearm.'+side
    shoulder = rig.pose.bones[upper].head.copy()
    a, b = rig.data.bones[upper].length, rig.data.bones[lower].length
    axis = wrist-shoulder; distance = axis.length; axis.normalize()
    assert abs(a-b) < distance < a+b
    pole = Vector((-.7 if side == 'R' else .7, .15, -1))
    bend = (pole-axis*pole.dot(axis)).normalized()
    along = (a*a-b*b+distance*distance)/(2*distance)
    elbow = shoulder + axis*along + bend*math.sqrt(max(0,a*a-along*along))
    segment(upper, shoulder, elbow)
    segment(lower, elbow, wrist)
    # Straight wrist, with the back of the glove turned outward.
    y = (wrist-elbow).normalized()
    z = Vector((-1 if side == 'R' else 1, 0, 0)); z = (z-y*z.dot(y)).normalized()
    x = y.cross(z).normalized()
    mat = Matrix((x,y,z)).transposed().to_4x4(); mat.translation = wrist
    if side == 'R': mat = mat @ Matrix.Rotation(math.radians(16),4,'Y')
    rig.pose.bones['hand.'+side].matrix = mat
    bpy.context.view_layer.update()

action = bpy.data.actions.new('Saber_Idle'); action.use_fake_user = True
rig.animation_data.action = action
scene.render.fps = 24
for frame in range(1,74):
    scene.frame_set(frame)
    for b in rig.pose.bones: b.matrix_basis = Matrix.Identity(4)
    breath = math.sin(2*math.pi*(frame-1)/72)
    rig.pose.bones['pelvis'].location = rest['pelvis'].to_3x3().inverted() @ Vector((0,0,-.025))
    rig.pose.bones['chest'].location = rest['chest'].to_3x3().inverted() @ Vector((0,-.001*breath,.003*breath))
    rig.pose.bones['chest'].rotation_euler.x = math.radians(3+.5*breath)
    bpy.context.view_layer.update()
    arm('R',Vector((-.48,-.32,-.46+.003*breath)))
    arm('L',Vector((.42,-.13,-.59+.002*breath)))
    for b in rig.pose.bones:
        b.keyframe_insert('location',frame=frame,group=b.name)
        b.keyframe_insert('rotation_euler',frame=frame,group=b.name)
        b.keyframe_insert('scale',frame=frame,group=b.name)
action['cycle_frames'] = 72
action['description'] = 'One-handed saber ready stance; three-second breathing loop'
scene.frame_set(1)
collection = bpy.data.collections.new('14 | SABER - weapon and preview'); scene.collection.children.link(collection)

def material(name, color, metallic=0, roughness=.4, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1)
    bsdf=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=metallic
    bsdf.inputs['Roughness'].default_value=roughness
    bsdf.inputs['Emission Color'].default_value=(*color,1)
    bsdf.inputs['Emission Strength'].default_value=emission
    return m
ivory=material('SABER | warm ivory casing',(.66,.63,.54),.12,.38)
dark=material('SABER | graphite grip',(.025,.032,.036),.3,.52)
metal=material('SABER | brushed alloy',(.22,.27,.29),.8,.25)
cyan=material('SABER | cyan energy',(.018,.72,1),.0,.25,4)
core=material('SABER | white hot edge',(.58,.94,1),.0,.25,7)
# Weapon local Z is its blade axis; origin is the closed hand's grip centre.
anchor=bpy.data.objects.new('SectorTrooper_Saber',None); collection.objects.link(anchor)
hand=rig.pose.bones['hand.R'].matrix.copy()
center=hand @ Vector((0,.085,-.025))
axis=(-hand.to_3x3().col[0]).normalized()
rotation=Vector((0,0,1)).rotation_difference(axis).to_matrix().to_4x4()
rotation.translation=center
anchor.matrix_world=rig.matrix_world@rotation
world=anchor.matrix_world.copy()
anchor.parent=rig; anchor.parent_type='BONE'; anchor.parent_bone='weapon'
bpy.context.view_layer.update(); anchor.matrix_world=world
parts=[]

def lathe(name, profile, mat, sides=8, bright=False):
    verts=[(r*math.cos(2*math.pi*i/sides),r*math.sin(2*math.pi*i/sides),z) for z,r in profile for i in range(sides)]
    faces=[tuple(range(sides-1,-1,-1))]
    for j in range(len(profile)-1):
        for i in range(sides): faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
    faces.append(tuple(range((len(profile)-1)*sides,len(profile)*sides)))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); collection.objects.link(obj); obj.parent=anchor
    mesh.materials.append(mat)
    if bright:
        mesh.materials.append(core)
        for p in mesh.polygons:
            if p.index%8 in (4,5): p.material_index=1
    parts.append(obj); return obj
lathe('SABER | ribbed grip',[(-.115,.025),(-.1,.031),(.066,.031),(.077,.028)],dark)
for i in range(5):
    z=-.084+i*.03
    lathe('SABER | grip ring %02d'%i,[(z-.003,.032),(z,.034),(z+.003,.032)],metal)
lathe('SABER | ivory pommel',[(-.14,.022),(-.133,.038),(-.111,.038),(-.10,.031)],ivory)
lathe('SABER | ivory emitter housing',[(.068,.031),(.079,.045),(.13,.045),(.15,.038)],ivory)
lathe('SABER | emitter rim',[(.139,.039),(.147,.046),(.166,.046),(.171,.037)],metal)
lathe('SABER | ignition ring',[(.09,.0455),(.099,.0455)],cyan)
lathe('SABER | emitter well',[(.164,.031),(.179,.031)],dark)
lathe('SABER | energy blade',[(.174,.017),(.194,.023),(1.075,.023),(1.107,.018),(1.12,.005)],cyan,bright=True)
anchor['attachment']='weapon socket beneath hand.R'
anchor['blade_length_m']=.946
anchor['variant']='saber'
# Framing preserves the source studio and adds dedicated, reproducible views.
for label,offset in [('Hero',(-4,-6,1.4)),('Front',(0,-6,.3)),('Side',(-6,0,.3))]:
    name='SABER CAM | '+label
    cam=bpy.data.objects.new(name,bpy.data.cameras.new(name)); collection.objects.link(cam)
    target=Vector((-.08,-.12,-.26)); cam.location=target+Vector(offset)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'; cam.data.ortho_scale=2.6
scene.camera=bpy.data.objects['SABER CAM | Hero']
scene.frame_start=1; scene.frame_end=72
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.shading.type='MATERIAL'
assert original_actions.issubset({a.name for a in bpy.data.actions})
# Validate the loop against evaluated body and saber vertices, including hand attachment.
def points(frame):
    scene.frame_set(frame); bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); values=[]
    for o in body+parts:
        ev=o.evaluated_get(dg); mesh=ev.to_mesh()
        values.extend(ev.matrix_world@v.co for v in mesh.vertices); ev.to_mesh_clear()
    return values
first=points(1); last=points(73)
seam=max((a-b).length for a,b in zip(first,last))
assert seam < 1e-5,seam
scene.frame_set(1)
scene.render.resolution_x=1100; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.cycles.samples=32; scene.cycles.use_denoising=True
expected={}
for frame in [1,10,19,37,55,73]:
    scene.frame_set(frame); bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); expected[str((frame-1)/24)]={}
    for obj in body+parts:
        ev=obj.evaluated_get(dg); mesh=ev.to_mesh()
        expected[str((frame-1)/24)][obj.name]=[list(ev.matrix_world@v.co) for v in mesh.vertices]
        ev.to_mesh_clear()
Path('/tmp/sector-trooper-saber-reference.json').write_text(json.dumps(expected))
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'sector-trooper-saber.blend'))
metadata={'body_meshes':len(body),'saber_meshes':len(parts),'preserved_actions':sorted(original_actions),'new_action':action.name,'duration_seconds':3,'loop_seam_m':seam,'blade_length_m':.946,'source':'../head/sector-trooper-head.blend'}
(HERE/'asset-stats.json').write_text(json.dumps(metadata,indent=2)+'\n')
# Export just this variant and its ready stance; retained rifle actions are authoring references.
rig.animation_data.action=None
for a in list(bpy.data.actions):
    if a!=action: bpy.data.actions.remove(a)
rig.animation_data.action=action
bpy.ops.object.select_all(action='DESELECT')
for obj in body+parts+[rig,anchor]: obj.hide_set(False); obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(HERE/'sector-trooper-saber.glb'),export_format='GLB',use_selection=True,
    export_skins=True,export_def_bones=False,export_animations=True,export_animation_mode='ACTIONS',
    export_force_sampling=True,export_bake_animation=True,export_frame_range=False,
    export_anim_slide_to_zero=True,export_rest_position_armature=True,export_yup=True,export_extras=True,
    export_cameras=False,export_lights=False)
for label in ['Hero','Front','Side']:
    scene.camera=bpy.data.objects['SABER CAM | '+label]
    scene.render.filepath=str(HERE/('saber-'+label.lower()+'.png'))
    bpy.ops.render.render(write_still=True)
print('SABER_COMPLETE',json.dumps(metadata))
