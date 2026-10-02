"""Start a nonblocking live-MCP render job; query scene['seeker_render_progress']."""
from pathlib import Path
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
scene=bpy.context.scene;rig=bpy.data.objects['Seeker'];camera=bpy.data.objects['CAM · Hero']
assert not bpy.app.is_job_running('RENDER')
folder=Path('/tmp/seeker-charge-frames');folder.mkdir(exist_ok=True)
saved=dict(camera=camera.location.copy(),samples=scene.cycles.samples,x=scene.render.resolution_x,y=scene.render.resolution_y,filepath=scene.render.filepath)
scene.camera=camera;scene.cycles.samples=4;scene.render.resolution_x=640;scene.render.resolution_y=576
floor=bpy.data.objects['Studio floor'].data.materials[0];p=next(n for n in floor.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
checker=floor.node_tree.nodes.new('ShaderNodeTexChecker');checker.inputs['Color1'].default_value=(.15,.17,.19,1);checker.inputs['Color2'].default_value=(.21,.23,.25,1);checker.inputs['Scale'].default_value=1
coords=floor.node_tree.nodes.new('ShaderNodeTexCoord');floor.node_tree.links.new(coords.outputs['Object'],checker.inputs['Vector']);floor.node_tree.links.new(checker.outputs['Color'],p.inputs['Base Color'])
for track in rig.animation_data.nla_tracks:track.mute=track.name!='ChargeAttack'
state={'frame':0}
scene['seeker_render_progress']='0/73'
def render_next():
 frame=state['frame']
 if frame>72:
  camera.location=saved['camera'];scene.cycles.samples=saved['samples'];scene.render.resolution_x=saved['x'];scene.render.resolution_y=saved['y'];scene.render.filepath=saved['filepath']
  floor.node_tree.nodes.remove(checker);floor.node_tree.nodes.remove(coords)
  for track in rig.animation_data.nla_tracks:track.mute=track.name!='Charge'
  scene.frame_start=0;scene.frame_end=5;scene.frame_set(0)
  scene['seeker_render_progress']='complete'
  bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'seeker.blend'))
  return None
 scene.frame_set(min(frame,57),subframe=.6 if frame>=58 else 0)
 bpy.context.view_layer.update()
 root_y=rig.pose.bones['Root'].matrix.translation.y
 camera.location=saved['camera']+Vector((0,root_y,0))
 scene.render.filepath=str(folder/f'{frame:04d}.png')
 bpy.ops.render.render(write_still=True)
 state['frame']+=1;scene['seeker_render_progress']=f"{state['frame']}/73"
 return .05
bpy.app.timers.register(render_next,first_interval=.2)
print('Live Blender charge preview render started.')
