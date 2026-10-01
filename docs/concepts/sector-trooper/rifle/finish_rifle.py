"""Validate, save and export the current rifle through Blender MCP."""
from pathlib import Path
import json
import math
import bpy
import bmesh
from bpy_extras.object_utils import world_to_camera_view

HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
assert scene.get('generator')=='sector_rifle_concept01_mcp'
assert len(bpy.data.scenes)==1
assert bpy.context.mode=='OBJECT'
asset=bpy.data.collections['01 | RIFLE - editable parts']
root=bpy.data.objects['SectorTrooper_Rifle']
# Weld numerical slivers created where tiny chamfers reach thin panel caps.
for obj in asset.objects:
    if obj.type!='MESH' or not obj.name.startswith(('RIFLE | 10 status','RIFLE | 25 sight')):
        continue
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-8)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free()
bpy.context.view_layer.update()
dg=bpy.context.evaluated_depsgraph_get()
counts={};bounds=[]
for obj in asset.objects:
    if obj.type!='MESH':continue
    ev=obj.evaluated_get(dg);me=ev.to_mesh();me.calc_loop_triangles()
    bm=bmesh.new();bm.from_mesh(me)
    assert all(e.is_manifold for e in bm.edges),(obj.name,'Non-manifold evaluated mesh')
    for tri in me.loop_triangles:
        a,b,c=[me.vertices[i].co for i in tri.vertices]
        assert (b-a).cross(c-a).length>1e-12,(obj.name,'Degenerate triangle')
    bm.free()
    for v in me.vertices:
        assert all(math.isfinite(c) for c in v.co),obj.name
        bounds.append(obj.matrix_world@v.co)
    counts[obj.name]=len(me.loop_triangles)
    ev.to_mesh_clear()
assert len(counts)==43
assert sum(counts.values())<3500
assert bpy.data.images['rifle-reference.png'].packed_file
assert abs(root.scale.x-.9)<1e-6
framing={}
for name in ['Hero','Side','Top']:
    cam=bpy.data.objects['RIFLE CAM | '+name]
    pts=[world_to_camera_view(scene,cam,v) for v in bounds]
    rect=[min(p.x for p in pts),max(p.x for p in pts),min(p.y for p in pts),max(p.y for p in pts)]
    assert min(rect[0],rect[2])>.03 and max(rect[1],rect[3])<.97,(name,rect)
    framing[name]=rect
bpy.ops.object.select_all(action='DESELECT')
for obj in asset.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(HERE/'sector-trooper-rifle.glb'),
    export_format='GLB',use_selection=True,use_active_scene=True,
    export_apply=True,export_skins=False,export_animations=False,
    export_extras=True,export_cameras=False,export_lights=False)
scene.camera=bpy.data.objects['RIFLE CAM | Hero']
scene.render.filepath=str(HERE/'rifle-preview.png')
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True);bpy.context.view_layer.objects.active=root
for obj in bpy.data.collections['02 | STUDIO - cameras and lights'].objects:
    obj.hide_set(obj.type!='LIGHT')
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_perspective='CAMERA'
            space.region_3d.view_camera_zoom=12
            space.overlay.show_overlays=False
            space.shading.type='MATERIAL'
            space.shading.use_scene_lights=True
            space.shading.use_scene_world=True
old=bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'sector-trooper-rifle.blend'),compress=True)
finally:
    bpy.context.preferences.filepaths.save_version=old
dimensions=[max(v[i] for v in bounds)-min(v[i] for v in bounds) for i in range(3)]
result={'validation':'PASS','built_via':'Blender Lab MCP live session',
    'source':'rifle-reference.png','mesh_parts':len(counts),'triangles':sum(counts.values()),
    'materials':len({m.name for o in asset.objects if o.type=='MESH' for m in o.data.materials}),
    'width_m':dimensions[0],'length_m':dimensions[1],'height_m':dimensions[2],
    'width_scale':float(root.scale.x),'user_adjustment':'10 percent reduction across width',
    'forward':'Blender -Y; glTF +Z','up':'Blender +Z; glTF +Y',
    'root_origin':'Main grip center','packed_reference':True,
    'closed_evaluated_meshes':True,'no_degenerate_triangles':True,
    'per_part_triangles':counts,'camera_framing':framing,
    'glb_bytes':(HERE/'sector-trooper-rifle.glb').stat().st_size}
(HERE/'rifle-metadata.json').write_text(json.dumps(result,indent=2)+'\n')
