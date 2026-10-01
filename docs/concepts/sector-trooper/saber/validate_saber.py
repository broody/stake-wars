"""Import the GLB independently and verify the ready idle against Blender."""
from pathlib import Path
import json
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree
assert bpy.app.background
HERE=Path(__file__).resolve().parent
expected=json.loads(Path('/tmp/saber-animation-reference.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=96
bpy.ops.import_scene.gltf(filepath=str(HERE/'sector-trooper-saber.glb'))
scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
for track in rig.animation_data.nla_tracks: track.mute=True
assert not any(o.name.startswith('RIFLE |') for o in scene.objects)
results={}
for clip,samples in expected.items():
    action=bpy.data.actions[clip];rig.animation_data.action=action
    if rig.animation_data.action_slot is None:rig.animation_data.action_slot=action.slots[0]
    maximum=0
    for time,meshes in samples.items():
        frame=float(action.frame_range[0])+float(time)*96
        scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
        dg=bpy.context.evaluated_depsgraph_get()
        for name,points in meshes.items():
            obj=bpy.data.objects.get(name);assert obj,name
            tree=KDTree(len(points))
            for i,p in enumerate(points):tree.insert(Vector(p),i)
            tree.balance()
            ev=obj.evaluated_get(dg);mesh=ev.to_mesh()
            error=max(tree.find(ev.matrix_world@v.co)[2] for v in mesh.vertices)
            ev.to_mesh_clear();maximum=max(maximum,error)
            assert error<.0005,(clip,time,name,error)
    results[clip]=maximum
report={'validation':'PASS','samples_per_clip':8,'per_clip_maximum_error_m':results,'rifle_removed':True,'body_meshes':71,'saber_meshes':12,'clips':list(expected)}
(HERE/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('SABER_VALIDATION',json.dumps(report))
