"""Export the always-armed player in disposable background Blender.

Temporarily retime 24 fps authoring to 96 fps so integer glTF baking preserves
the approved quarter-frame sampling. Never save this retimed scene.
"""
from pathlib import Path
import json
import bpy
assert bpy.app.background,'Export retiming must not touch the interactive scene'
HERE=Path(__file__).resolve().parent
CLIPS=['Armed_Idle','Idle_Shoot','Run_Carry_Forward','Walk_Shoot_Forward',
       'Strafe_Carry_Left','Strafe_Shoot_Left','Strafe_Carry_Right','Strafe_Shoot_Right',
       'Backward_Carry','Backward_Shoot']
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig']
if bpy.context.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
body=[o for o in scene.objects if o.type=='MESH' and o.get('rig_binding')=='sector_trooper_rig_v1']
rifle=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('RIFLE |')]
assert len(body)==71 and len(rifle)==43,(len(body),len(rifle))
objects=body+rifle
expected={}
metadata=[]
for name in CLIPS:
    action=bpy.data.actions[name];rig.animation_data.action=action
    duration=float(action['cycle_frames'])/24
    metadata.append({'name':name,'duration':duration,'source_gait':action.get('source_gait'),
                     'speed_mps':action.get('speed_mps',0),'cycle_frames':action['cycle_frames']})
    expected[name]={}
    for phase in [0,.125,.25,.5,.875,1]:
        frame=1+phase*action['cycle_frames']
        scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
        dg=bpy.context.evaluated_depsgraph_get()
        expected[name][str((frame-1)/24)]={}
        for obj in objects:
            ev=obj.evaluated_get(dg);mesh=ev.to_mesh()
            expected[name][str((frame-1)/24)][obj.name]=[list(obj.matrix_world@v.co) for v in mesh.vertices]
            ev.to_mesh_clear()
Path('/tmp/sector-trooper-game-export-reference.json').write_text(json.dumps(expected,separators=(',',':')))
rig.animation_data.action=None
for action in list(bpy.data.actions):
    if action.name not in CLIPS:bpy.data.actions.remove(action)
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.co.x=1+(key.co.x-1)*4
                        key.handle_left.x=1+(key.handle_left.x-1)*4
                        key.handle_right.x=1+(key.handle_right.x-1)*4
                    curve.update()
scene.render.fps=96;scene.render.fps_base=1
scene.frame_start=1;scene.frame_end=337
rig.animation_data.action=bpy.data.actions['Armed_Idle'];scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects+[rig,bpy.data.objects['SectorTrooper_Rifle']]+[o for o in scene.objects if o.name.startswith('ATTACH |')]:
    obj.hide_set(False);obj.select_set(True)
bpy.context.view_layer.objects.active=rig
out=HERE/'sector-trooper-armed.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,use_active_scene=True,
    export_apply=True,export_skins=True,export_def_bones=False,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
    export_bake_animation=True,export_frame_range=False,export_frame_step=1,
    export_anim_slide_to_zero=True,export_rest_position_armature=True,
    export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
(HERE/'game-export.json').write_text(json.dumps({'file':out.name,'bytes':out.stat().st_size,
    'sampling_fps':96,'clips':metadata,'body_meshes':len(body),'rifle_meshes':len(rifle),
    'weapon_socket':'weapon','source_file':'../head/sector-trooper-head.blend'},indent=2)+'\n')
print(json.dumps({'exported':str(out),'bytes':out.stat().st_size,'clips':CLIPS}))
