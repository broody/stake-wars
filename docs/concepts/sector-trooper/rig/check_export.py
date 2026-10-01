"""Check the glTF skin and sampled animation against Blender world geometry.

Run ONLY in a separate background Blender process with the authoring file as
input. The empty scene below belongs exclusively to that disposable process.
"""
from pathlib import Path
import json
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

assert bpy.app.background, 'Export roundtrip must never replace the live scene'
HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
source_rig = bpy.data.objects['SectorTrooper_Rig']
names = [o.name for o in scene.objects if o.type=='MESH' and o.get('rig_binding')=='sector_trooper_rig_v1']
expected = {}
checks = {'Rig_Check':[1,49,73,97]}
if bpy.data.actions.get('Walk'):
    checks['Walk'] = [1,5,8,12,15,22,29]
if bpy.data.actions.get('Run'):
    checks['Run'] = [1,3,5,8,10,13,17,19]
for clip in ['Strafe_Left','Strafe_Right']:
    if bpy.data.actions.get(clip):
        checks[clip] = [1,3,5,7,8,10,12,14,15]
if bpy.data.actions.get('Backward'):
    checks['Backward'] = [1,3,5,7,9,11,13,16,17]
for clip,frames in checks.items():
    source_rig.animation_data.action = bpy.data.actions[clip]
    expected[clip] = {}
    for frame in frames:
        scene.frame_set(frame)
        dg = bpy.context.evaluated_depsgraph_get()
        expected[clip][frame] = {}
        for name in names:
            obj = bpy.data.objects[name]
            ev = obj.evaluated_get(dg)
            mesh = ev.to_mesh()
            expected[clip][frame][name] = [tuple(obj.matrix_world@v.co) for v in mesh.vertices]
            ev.to_mesh_clear()
out = HERE.parent/'legs/sector-trooper-model.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 24
bpy.ops.import_scene.gltf(filepath=str(out))
scene = bpy.context.scene
rigs = [o for o in scene.objects if o.type=='ARMATURE']
assert len(rigs)==1
rig = rigs[0]
for track in rig.animation_data.nla_tracks:
    track.mute = True
maximum = 0
per_frame = {}
for clip,frames in expected.items():
    action = bpy.data.actions.get(clip)
    assert action, ('Missing exported clip',clip)
    rig.animation_data.action = action
    if rig.animation_data.action_slot is None:
        rig.animation_data.action_slot = action.slots[0]
    start = float(action.frame_range[0])
    per_frame[clip] = {}
    for authored,reference in frames.items():
        scene.frame_set(round(start+authored-1))
        dg = bpy.context.evaluated_depsgraph_get()
        frame_max = 0
        for name,points in reference.items():
            obj = bpy.data.objects.get(name)
            assert obj and obj.type=='MESH', name
            tree = KDTree(len(points))
            for i,p in enumerate(points):
                tree.insert(Vector(p),i)
            tree.balance()
            ev = obj.evaluated_get(dg)
            mesh = ev.to_mesh()
            error = max(tree.find(obj.matrix_world@v.co)[2] for v in mesh.vertices)
            frame_max = max(frame_max,error)
            ev.to_mesh_clear()
            assert error < .0002,(clip,authored,name,'glTF deformation mismatch',error)
        maximum = max(maximum,frame_max)
        per_frame[clip][authored] = frame_max
result = {'validation':'PASS','skinned_meshes':len(names),'sampled_frames':checks,
          'imported_actions':list(expected),
          'max_world_vertex_error_m':maximum,'per_frame_error_m':per_frame}
(HERE/'export-check.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
