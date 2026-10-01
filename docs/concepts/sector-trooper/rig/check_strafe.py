"""Check both lateral run clips from evaluated animation, including subframes."""
from pathlib import Path
import json
import math
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
metadata = json.loads((HERE/'strafe-metadata.json').read_text())['animations']
ground = -486/384
boots = {}
for suffix,side,sign in [('L','left',1),('R','right',-1)]:
    obj = bpy.data.objects['LEGS | '+side+' 09 broad charcoal sole']
    points = [obj.matrix_world@v.co for v in obj.data.vertices]
    boots[suffix] = dict(points=points,sole=[v for v in points if abs(v.z-ground)<1e-6],
        ankle=rig.data.bones['foot.'+suffix].head_local.copy(),sign=sign,
        inverse=rig.data.bones['foot.'+suffix].matrix_local.inverted())
meshes = [o for o in scene.objects if o.get('rig_binding')=='sector_trooper_rig_v1']


def positions(frame):
    scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in meshes:
        ev = obj.evaluated_get(dg)
        mesh = ev.to_mesh()
        points.extend(obj.matrix_world@v.co for v in mesh.vertices)
        ev.to_mesh_clear()
    return points


reports = {}
mirrored = {}
for clip,stats in metadata.items():
    rig.animation_data.action = bpy.data.actions[clip]
    period,direction = stats['cycle_frames'],stats['direction_x']
    lead = 'L' if direction==1 else 'R'
    min_clearance,min_gap,max_drift,max_ik = 1,1,0,0
    flights,max_air = 0,0
    heads = []
    for sample in range(period*8):
        frame = 1+sample/8
        scene.frame_set(int(frame),subframe=frame%1)
        bpy.context.view_layer.update()
        phase = (frame-1)/period
        supports = 0
        extents,clearances = {},[]
        for suffix,boot in boots.items():
            p = (phase+(0 if suffix==lead else .5))%1
            deform = rig.pose.bones['foot.'+suffix].matrix@boot['inverse']
            points = [deform@v for v in boot['points']]
            lowest = min(p.z-ground for p in points)
            min_clearance = min(min_clearance,lowest)
            clearances.append(lowest)
            extents[suffix] = (min(p.x for p in points),max(p.x for p in points))
            error = (rig.pose.bones['shin.'+suffix].tail-rig.pose.bones['foot_ik.'+suffix].head).length
            max_ik = max(max_ik,error)
            if p <= stats['stance_fraction']:
                supports += 1
                # The material vertex at the sole's lowest edge is fixed in
                # the world after applying the declared sideways actor speed.
                contact = min(boot['sole'],key=lambda v:(deform@v).z)
                base = Vector((boot['sign']*stats['foot_half_width_m']-
                    direction*stats['stride_m']*(p-stats['stance_fraction']/2),
                    -.018 if boot['sign']==direction else .018,boot['ankle'].z))
                expected = base+contact-boot['ankle']
                max_drift = max(max_drift,((deform@contact)-expected).length)
        min_gap = min(min_gap,extents['L'][0]-extents['R'][1])
        assert supports<=1, ('Unexpected double support',clip,frame)
        if supports==0:
            flights += 1
            max_air = max(max_air,min(clearances))
        assert rig.pose.bones['root'].matrix_basis.is_identity
        heads.append({b.name:tuple(b.head) for b in rig.pose.bones})
    mirrored[clip] = heads
    start,end = positions(1),positions(period+1)
    seam = max((a-b).length for a,b in zip(start,end))
    assert seam<.00001,(clip,'Loop seam',seam)
    assert min_clearance>-.001,(clip,'Ground penetration',min_clearance)
    assert max_drift<.001,(clip,'Contact slip',max_drift)
    assert max_ik<.001,(clip,'IK error',max_ik)
    assert min_gap>.008,(clip,'Boot overlap',min_gap)
    assert abs(flights/(period*8)-(1-2*stats['stance_fraction']))<.025
    assert max_air>.005,(clip,'Missing flight',max_air)
    reports[clip] = dict(subframe_samples=period*8,max_loop_seam_error_m=seam,
        minimum_sole_clearance_m=min_clearance,max_contact_drift_m=max_drift,
        max_ik_target_error_m=max_ik,minimum_boot_gap_m=min_gap,
        flight_fraction=flights/(period*8),maximum_both_feet_clearance_m=max_air)
max_mirror = 0
for left,right in zip(mirrored['Strafe_Left'],mirrored['Strafe_Right']):
    for name,p in left.items():
        counterpart = name[:-2]+('.R' if name.endswith('.L') else '.L') if name.endswith(('.L','.R')) else name
        max_mirror = max(max_mirror,(Vector((-p[0],p[1],p[2]))-Vector(right[counterpart])).length)
assert max_mirror<.0001,('Asymmetric left/right motion',max_mirror)
rig.animation_data.action = bpy.data.actions['Strafe_Left']
scene.frame_set(1)
result = dict(validation='PASS',animations=reports,max_mirrored_bone_error_m=max_mirror)
(HERE/'strafe-check.json').write_text(json.dumps(result,indent=2)+'\n')
