"""Roundtrip every exported armed clip against the source world-space geometry."""
from pathlib import Path
import json
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree
assert bpy.app.background
HERE=Path(__file__).resolve().parent
expected=json.loads(Path('/tmp/sector-trooper-game-export-reference.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=96
bpy.ops.import_scene.gltf(filepath=str(HERE/'sector-trooper-armed.glb'))
scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
for track in rig.animation_data.nla_tracks:track.mute=True
results={}
for name,samples in expected.items():
    action=bpy.data.actions.get(name);assert action,('Missing action',name)
    rig.animation_data.action=action
    if rig.animation_data.action_slot is None:rig.animation_data.action_slot=action.slots[0]
    start=float(action.frame_range[0]);maximum=0
    for time,meshes in samples.items():
        frame=start+float(time)*96
        scene.frame_set(round(frame));bpy.context.view_layer.update()
        dg=bpy.context.evaluated_depsgraph_get()
        for name_mesh,points in meshes.items():
            obj=bpy.data.objects.get(name_mesh);assert obj,('Missing mesh',name_mesh)
            tree=KDTree(len(points))
            for i,p in enumerate(points):tree.insert(Vector(p),i)
            tree.balance()
            ev=obj.evaluated_get(dg);mesh=ev.to_mesh()
            error=max(tree.find(obj.matrix_world@v.co)[2] for v in mesh.vertices)
            ev.to_mesh_clear();maximum=max(maximum,error)
            assert error<.0005,(name,time,name_mesh,'Export geometry mismatch',error)
    results[name]=maximum
(HERE/'game-export-check.json').write_text(json.dumps({'validation':'PASS',
    'maximum_world_vertex_error_m':max(results.values()),'per_clip_error_m':results},indent=2)+'\n')
print(json.dumps(results))
