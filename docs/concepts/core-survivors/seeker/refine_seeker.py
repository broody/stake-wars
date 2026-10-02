"""Live Blender MCP finishing pass; safe to rerun on the Seeker only."""
from pathlib import Path
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
obj=bpy.data.objects['Seeker_Armor'];rig=bpy.data.objects['Seeker']
assert scene.name=='SEEKER | Studio'
if not obj.get('finish_v1'):
 # Dark graphite like the approved legion. Retain subtle facet variation.
 attr=obj.data.color_attributes['ArmorTone']
 for face in obj.data.polygons:
  if face.material_index==0:
   for index in face.loop_indices:
    c=attr.data[index].color
    attr.data[index].color=(c[0]*.58,c[1]*.58,c[2]*.58,1)
 # Bring the inset throat well and emitter just in front of the sloped shield.
 neck=rig.data.bones['Neck'];group=obj.vertex_groups['Neck'].index
 for v in obj.data.vertices:
  if any(g.group==group for g in v.groups) and v.co.y < -1.04 and .63 < v.co.z < .94:
   v.co.y-=.035
 obj['finish_v1']=True
if not obj.get('sensor_depth_v1'):
 group=obj.vertex_groups['Neck'].index
 for face in obj.data.polygons:
  if face.material_index==1:
   for index in face.vertices:
    v=obj.data.vertices[index]
    if any(g.group==group for g in v.groups): v.co.y-=.018
 obj['sensor_depth_v1']=True
obj.data.update()
# Leave a clean hero view, with the armature accessible in the Outliner.
bpy.ops.object.select_all(action='DESELECT')
rig.show_in_front=False
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   space=area.spaces.active;space.shading.type='MATERIAL';space.overlay.show_overlays=False
   space.region_3d.view_distance=5.5;space.region_3d.view_location=(0,-.15,.9)
   space.region_3d.view_rotation=bpy.data.objects['CAM · Hero'].rotation_euler.to_quaternion()
scene.camera=bpy.data.objects['CAM · Hero']
obj.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(HERE/'seeker.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_extras=True,export_cameras=False,export_lights=False)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'seeker.blend'))
print('Seeker refined and exported through live Blender MCP.')
