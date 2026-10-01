"""Validate locomotion at frame and subframe times without editing its keys."""
from pathlib import Path
import json
import math
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
scene = bpy.context.scene
rig = bpy.data.objects['SectorTrooper_Rig']
clip = globals().get('CLIP','Walk')
assert clip in ['Walk','Run','Backward'] and rig.animation_data.action.name == clip
backward = clip == 'Backward'
running = clip in ['Run','Backward']
stats = json.loads((HERE/(clip.lower()+'-metadata.json')).read_text())
period = stats['frames'][1]-stats['frames'][0]
stride, duty = stats['stride_m'],stats['stance_fraction']
ground = -486/384
feet = {}
for suffix,side,sign in [('L','left',1),('R','right',-1)]:
    ankle = rig.data.bones['foot.'+suffix].head_local
    yaw = Matrix.Rotation(sign*math.radians(8),3,'Z')
    obj = bpy.data.objects['LEGS | '+side+' 09 broad charcoal sole']
    # The object's undeformed vertices remain in the original modeling pose.
    sole = [obj.matrix_world@v.co for v in obj.data.vertices
            if abs((obj.matrix_world@v.co).z-ground)<1e-6]
    local = [yaw.inverted()@(v-ankle) for v in sole]
    feet[suffix] = dict(sole=sole,ankle=ankle,rest_inverse=rig.data.bones['foot.'+suffix].matrix_local.inverted(),
        heel=yaw@Vector((0,max(p.y for p in local),ground-ankle.z)),
        toe=yaw@Vector((0,min(p.y for p in local),ground-ankle.z)),sign=sign)
max_plant_error = 0
min_clearance = 1
double_support = 0
max_ik_error = 0
flights = 0
max_flight_clearance = 0
body_samples = []
substeps = 8 if running else 4
for sample in range(period*substeps):
    frame = 1+sample/substeps
    scene.frame_set(int(frame),subframe=frame%1)
    bpy.context.view_layer.update()
    phase = ((frame-1)/period+stats.get('start_phase',0))%1
    planted = 0
    clearances = []
    for suffix,boot in feet.items():
        p = (phase+(0 if suffix=='L' else .5))%1
        deform = rig.pose.bones['foot.'+suffix].matrix@boot['rest_inverse']
        lowest = min((deform@v).z-ground for v in boot['sole'])
        min_clearance = min(min_clearance,lowest)
        clearances.append(lowest)
        error = (rig.pose.bones['shin.'+suffix].tail-rig.pose.bones['foot_ik.'+suffix].head).length
        max_ik_error = max(max_ik_error,error)
        if p <= duty:
            planted += 1
            pivot = (boot['toe'] if p<.13 else boot['heel']) if backward else (
                boot['toe'] if p>stats.get('toe_roll_start',.42) else boot['heel'])
            actual = deform@(boot['ankle']+pivot)
            y = stats['foot_y_bias_m']-stride*(p-duty/2) if backward else stride*(p-duty/2)
            base = Vector((boot['sign']*stats.get('foot_half_width_m',.175),y,boot['ankle'].z))
            # Cancelling the actor's declared speed leaves this material
            # contact point stationary in the world throughout support.
            expected = base+pivot
            max_plant_error = max(max_plant_error,(actual-expected).length)
    if running:
        assert planted<=1, ('Unexpected double support in Run',frame)
        if planted==0:
            flights += 1
            max_flight_clearance = max(max_flight_clearance,min(clearances))
    else:
        assert planted>=1, ('Both feet airborne in a walk',frame)
    double_support += planted==2
    if running:
        chest = rig.pose.bones['chest']
        rotation = (chest.matrix.to_3x3()@chest.bone.matrix_local.to_3x3().inverted()).to_euler('XYZ')
        body_samples.append({'chest_lateral_m':chest.tail.x,
            'pelvis_vertical_m':rig.pose.bones['pelvis'].head.z,
            'chest_pitch_degrees':math.degrees(rotation.x),
            'chest_side_bend_degrees':math.degrees(rotation.y),
            'chest_twist_degrees':math.degrees(rotation.z)})
assert min_clearance>-.001, ('Floor penetration',min_clearance)
assert max_plant_error<.001, ('Planted foot drift',max_plant_error)
assert max_ik_error<.001
if running:
    assert abs(flights/(period*substeps)-(1-2*duty)) < .02
    assert max_flight_clearance>.003, 'Run must have visible ground clearance during flight'

meshes = [o for o in scene.objects if o.get('rig_binding')=='sector_trooper_rig_v1']
def positions(frame):
    scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    rows = []
    for obj in meshes:
        ev = obj.evaluated_get(dg)
        data = ev.to_mesh()
        rows.extend(obj.matrix_world@v.co for v in data.vertices)
        ev.to_mesh_clear()
    return rows
start,end = positions(1),positions(period+1)
seam = max((a-b).length for a,b in zip(start,end))
assert seam<.00001, ('Loop seam',seam)
scene.frame_set(1)
report = {'validation':'PASS','animation':clip,'subframe_samples':period*substeps,
          'max_contact_drift_m':max_plant_error,'minimum_sole_clearance_m':min_clearance,
          'max_ik_target_error_m':max_ik_error,'max_loop_seam_error_m':seam,
          'double_support_fraction':double_support/(period*substeps),
          'flight_fraction':flights/(period*substeps),
          'maximum_both_feet_clearance_m':max_flight_clearance,'no_flight_phase':not running}
if body_samples:
    report['body_motion_peak_to_peak'] = {
        key:max(row[key] for row in body_samples)-min(row[key] for row in body_samples)
        for key in body_samples[0]}
    if backward:
        pitches = [r['chest_pitch_degrees'] for r in body_samples]
        assert max(pitches)<-3, ('Expected a slight backward body lean',max(pitches))
        report['backward_chest_lean_degrees'] = [-max(pitches),-min(pitches)]
(HERE/(clip.lower()+'-check.json')).write_text(json.dumps(report,indent=2)+'\n')
result = report
