"""Dense blade/body intersection check on the saved animation source."""
from pathlib import Path
import json
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
assert bpy.app.background
scene=bpy.context.scene;rig=bpy.data.objects['SectorTrooper_Rig'];weapon=bpy.data.objects['SectorTrooper_Saber']
body=[o for o in scene.objects if o.type=='MESH' and o.get('rig_binding')=='sector_trooper_rig_v1']
results={};hits=[]
for name in ['Saber_Idle','Saber_Run','Saber_Swing','Saber_Backhand','Saber_Run_Swing','Saber_Run_Backhand']:
    a=bpy.data.actions[name];rig.animation_data.action=a
    samples=int(a['cycle_frames']*4)+1
    for step in range(samples):
        f=1+step/4;scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
        dg=bpy.context.evaluated_depsgraph_get()
        origin=weapon.matrix_world@Vector((0,0,.19));tip=weapon.matrix_world@Vector((0,0,1.12));direction=(tip-origin).normalized()
        for obj in body:
            ev=obj.evaluated_get(dg);mesh=ev.to_mesh()
            verts=[ev.matrix_world@v.co for v in mesh.vertices]
            tree=BVHTree.FromPolygons(verts,[tuple(p.vertices) for p in mesh.polygons])
            location,_,_,_=tree.ray_cast(origin,direction,(tip-origin).length)
            if location is not None:hits.append([name,f,obj.name])
            ev.to_mesh_clear()
    results[name]=samples
report={'validation':'PASS' if not hits else 'FAIL','samples_per_clip':results,'blade_centerline_body_intersections':hits}
Path(__file__).with_name('clearance-check.json').write_text(json.dumps(report,indent=2)+'\n')
print('CLEARANCE_CHECK',json.dumps(report))
assert not hits,hits[:10]
