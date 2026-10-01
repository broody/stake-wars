"""Validate, export the skinned figure and save the same authoring file."""
from pathlib import Path
import ast
import hashlib
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
BODY = ['01 | HEAD - editable armor parts', '04 | TORSO - editable armor parts',
        '05 | LEGS - editable armor and joints', '06 | ARMS - editable armor and gloves']
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
assert rig.get('generator') == 'sector_trooper_rig_v1'
assert bpy.data.filepath.endswith('/sector-trooper/head/sector-trooper-head.blend')
if bpy.context.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
tree = ast.parse((HERE/'build_rig.py').read_text())
definition = next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='geometry_signature')
exec(compile(ast.Module(body=[definition],type_ignores=[]),str(HERE/'build_rig.py'),'exec'))
rig.animation_data_create()
action = rig.animation_data.action
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
assert geometry_signature() == rig['rest_geometry_signature'], 'Authoring geometry or cameras changed'
meshes = [o for name in BODY for o in bpy.data.collections[name].objects if o.type=='MESH']
baseline = json.loads((HERE/'rest-baseline.json').read_text())
assert set(baseline) == {o.name for o in meshes}
counts, errors, rigid = {}, [], []
dg = bpy.context.evaluated_depsgraph_get()
for obj in meshes:
    mods = [m for m in obj.modifiers if m.type=='ARMATURE']
    assert len(mods)==1 and mods[0].object==rig
    assert obj.modifiers[-1] == mods[0]
    for v in obj.data.vertices:
        assert 1 <= len(v.groups) <= 2, (obj.name,'Missing or excessive weights')
        assert abs(sum(g.weight for g in v.groups)-1) < 1e-6
        assert all(rig.data.bones[obj.vertex_groups[g.group].name].use_deform for g in v.groups)
    ev = obj.evaluated_get(dg)
    data = ev.to_mesh()
    data.calc_loop_triangles()
    counts[obj.name] = len(data.loop_triangles)
    assert len(data.vertices)==len(baseline[obj.name])
    for v,p in zip(data.vertices,baseline[obj.name]):
        assert all(math.isfinite(c) for c in v.co)
        errors.append(((obj.matrix_world@v.co)-Vector(p)).length)
    ev.to_mesh_clear()
    if len(obj.vertex_groups)==1:
        rigid.append(obj.name)
assert max(errors) < .0001, ('Rest mesh displaced',max(errors))
assert sum(counts.values()) == 6680
rig['max_rest_error_m'] = max(errors)
rig.animation_data.action = action
locomotion_names = ['Walk','Run','Strafe_Left','Strafe_Right','Backward']
assert action and action.name in ['Rig_Check']+locomotion_names
locomotion = action.name in locomotion_names
period = int(action.get('cycle_frames',120))
sample_frames = list(range(1,period+2)) if locomotion else list(range(1,122,4))

max_ik_error, max_rigid_error, min_sole = 0,0,0
for frame in sample_frames:
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    for suffix in ['L','R']:
        error = (rig.pose.bones['shin.'+suffix].tail-rig.pose.bones['foot_ik.'+suffix].head).length
        max_ik_error = max(max_ik_error,error)
        assert error < .001, (frame,suffix,'Foot IK target error',error)
    dg = bpy.context.evaluated_depsgraph_get()
    for name in rigid:
        obj = bpy.data.objects[name]
        ev = obj.evaluated_get(dg)
        data = ev.to_mesh()
        reference = baseline[name]
        a = obj.matrix_world @ data.vertices[0].co
        p = Vector(reference[0])
        for i in range(0,len(reference),max(1,len(reference)//8)):
            b = obj.matrix_world @ data.vertices[i].co
            err = abs((b-a).length-(Vector(reference[i])-p).length)
            max_rigid_error = max(max_rigid_error,err)
            assert err < .00002,(frame,name,'Rigid armor changed shape',err)
        if 'broad charcoal sole' in name:
            min_sole = min(min_sole,min((obj.matrix_world@v.co).z+486/384 for v in data.vertices))
        ev.to_mesh_clear()
assert min_sole > -.001, ('Boot penetrates ground',min_sole)

scene.frame_set(1)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for name in BODY:
    for obj in bpy.data.collections[name].objects:
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
out = HERE.parent/'legs/sector-trooper-model.glb'
bpy.ops.export_scene.gltf(
    filepath=str(out),export_format='GLB',use_selection=True,use_active_scene=True,
    export_apply=True,export_skins=True,export_def_bones=True,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
    export_bake_animation=True,export_frame_range=False,export_frame_step=1,
    export_anim_slide_to_zero=True,
    export_rest_position_armature=True,export_yup=True,export_extras=True,
    export_cameras=False,export_lights=False,
)
stats = {'validation':'PASS','rig':'SectorTrooper_Rig','bones':len(rig.data.bones),
         'deform_bones':sum(b.use_deform for b in rig.data.bones),'skinned_meshes':len(meshes),
         'triangles':sum(counts.values()),'rigid_parts':len(rigid),'max_weights_per_vertex':2,
         'geometry_and_cameras_unchanged':True,'rest_pose_error_m':max(errors),
         'max_ik_target_error_m':max_ik_error,'max_rigid_shape_error_m':max_rigid_error,
         'minimum_sole_below_ground_m':min_sole,'checked_frames':len(sample_frames),
         'checked_action':action.name,
         'animations':[{'name':'Rig_Check','purpose':'Rig posing demonstration','frames':[1,121],'fps':24}]+
                      [{'name':a.name,'purpose':'In-place locomotion','frames':[1,int(a['cycle_frames'])+1],
                        'fps':int(a['fps']),'speed_mps':a['speed_mps']}
                       for name in locomotion_names if (a:=bpy.data.actions.get(name))],
         'glb_file':'../legs/sector-trooper-model.glb','glb_bytes':out.stat().st_size,
         'blend_file':'../head/sector-trooper-head.blend'}
(HERE/'rig-metadata.json').write_text(json.dumps(stats,indent=2)+'\n')
for path in [HERE.parent/'legs/legs-metadata.json',HERE.parent/'arms/arms-metadata.json']:
    data = json.loads(path.read_text())
    data.update(rigged=True,rig_bones=stats['bones'],glb_bytes=stats['glb_bytes'],
                animations=[a['name'] for a in stats['animations']],
                scope='Complete rigged Sector Trooper with animation clips')
    path.write_text(json.dumps(data,indent=2)+'\n')
scene['character_scope'] = 'Rigged complete Sector Trooper; IK legs, FK arms, rigid armor and simplified hands'
scene['character_triangle_count'] = 6680
scene.camera = bpy.data.objects.get('TROOPER CAM | '+action.name+' Hero') if locomotion else None
if scene.camera is None:
    scene.camera = bpy.data.objects['TROOPER CAM | Tpose Hero']
scene.render.resolution_x = scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.filepath = str(HERE/(action.name.lower()+'-preview.png' if locomotion else 'rig-preview.png'))
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.frame_start,scene.frame_end = (1,period) if locomotion else (1,121)
scene.frame_set(1 if locomotion else 25)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
for bone in rig.pose.bones:
    bone.select = False
rig.data.bones.active = rig.data.bones['pelvis']
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type=='VIEW_3D':
            space = area.spaces.active
            space.region_3d.view_perspective = 'CAMERA'
            space.region_3d.view_camera_zoom = 0
            space.overlay.show_overlays = not locomotion
            space.overlay.show_relationship_lines = False
            space.overlay.show_floor = False
            space.overlay.show_axis_x = space.overlay.show_axis_y = False
            space.shading.type = 'MATERIAL'
            space.shading.use_scene_lights = space.shading.use_scene_world = True
old = bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE.parent/'head/sector-trooper-head.blend'),compress=True)
finally:
    bpy.context.preferences.filepaths.save_version = old
result = stats
