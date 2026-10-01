"""Create a braced, forward-facing Idle_Shoot loop via Blender MCP."""
from pathlib import Path
import ast, math
import bpy
from mathutils import Matrix, Vector
HERE=Path(__file__).resolve().parent
scene=bpy.context.scene
rig=bpy.data.objects['SectorTrooper_Rig']
rifle=bpy.data.objects['SectorTrooper_Rifle']
assert bpy.data.filepath.endswith('/head/sector-trooper-head.blend')
if bpy.context.screen.is_animation_playing:bpy.ops.screen.animation_cancel(restore_frame=False)
if bpy.context.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
rig.animation_data.action=bpy.data.actions['Armed_Idle']
scene.frame_set(1);bpy.context.view_layer.update()
if 'weapon' not in rig.data.bones:
    world=rifle.matrix_world.copy()
    weapon_pose=world.to_quaternion().to_matrix().to_4x4()
    weapon_pose.translation=world.translation
    weapon_rest=rig.data.bones['hand.R'].matrix_local@rig.pose.bones['hand.R'].matrix.inverted()@weapon_pose
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    bone=rig.data.edit_bones.new('weapon')
    bone.parent=rig.data.edit_bones['hand.R']
    bone.matrix=weapon_rest;bone.length=.08;bone.use_deform=False
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.pose.bones['weapon'].rotation_mode='XYZ'
    bpy.context.view_layer.update()
    rifle.parent_bone='weapon'
    bpy.context.view_layer.update()
    rifle.matrix_world=world
    bpy.context.view_layer.update()
    # Idle explicitly restores the socket when switching from the firing action.
    for frame in [1,73]:
        rig.pose.bones['weapon'].matrix_basis=Matrix.Identity(4)
        for channel in ['location','rotation_euler','scale']:
            rig.pose.bones['weapon'].keyframe_insert(channel,frame=frame,group='weapon')
    rig['weapon_socket']='weapon: adjustable child of hand.R, animated per armed action'

scene.frame_set(1);bpy.context.view_layer.update()
socket_to_rifle=rig.pose.bones['weapon'].matrix.inverted()@rifle.matrix_world
rifle_scale=Matrix.Diagonal((.9,1,1,1))
rig.animation_data.action=None
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
tree=ast.parse((HERE/'armed_idle.py').read_text())
names={'set_segment','arm','hand_frame'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'armed_arm_helpers','exec'))
old=bpy.data.actions.get('Idle_Shoot')
if old:
    assert old.get('generator')=='idle_shoot_v1'
    bpy.data.actions.remove(old)
action=bpy.data.actions.new('Idle_Shoot');action.use_fake_user=True
action['generator']='idle_shoot_v1';action['cycle_frames']=24
action['pose_description']='Staggered brace, torso rotated, shouldered rifle aiming forward'
action['shot_frames']='1,13; 2 shots per second for inspection'
rig.animation_data.action=action
hand_R=hand_frame((.2,-.9,.15),(-1,0,0))
hand_L=hand_frame((-.7,-.7,.1),(0,0,-1))
main_local=Vector((0,0,0))
support_local=Vector((0,-.4176,.0112))
errors=[]
for frame in range(1,26):
    scene.frame_set(frame)
    for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
    t=(frame-1)%12
    if t<=1.5:
        u=t/1.5;kick=u*u*(3-2*u)
    elif t<9:
        u=(t-1.5)/7.5;kick=1-u*u*(3-2*u)
    else:kick=0
    def move(name,delta):
        rig.pose.bones[name].location=rest[name].to_3x3().inverted()@Vector(delta)
    move('pelvis',(0,-.045,-.065))
    move('foot_ik.L',(.035,-.15,0))
    move('foot_ik.R',(-.035,.18,0))
    rig.pose.bones['pelvis'].rotation_euler.y=math.radians(-12)
    rig.pose.bones['spine'].rotation_euler=(math.radians(8),math.radians(-12),0)
    rig.pose.bones['chest'].rotation_euler=(math.radians(5-1.6*kick),math.radians(-23),0)
    rig.pose.bones['head'].rotation_euler=(math.radians(-10),math.radians(40),0)
    bpy.context.view_layer.update()
    gun_rotation=Matrix.Rotation(math.radians(-3.2*kick),3,'X')
    gun=gun_rotation.to_4x4();gun.translation=Vector((-.20,-.18+.030*kick,-.28+.007*kick))
    main=gun@main_local;support=gun@support_local
    if frame==1:
        for _ in range(24):
            wrist_R=main-hand_R@Vector((0,.085,-.025))
            arm('R',wrist_R,hand_R)
            lower=rig.pose.bones['forearm.R']
            hand_R=hand_frame((lower.tail-lower.head).normalized(),(-1,0,0))
    hr=gun_rotation@hand_R;hl=gun_rotation@hand_L
    # Let the wrist follow the forearm through recoil even in the deeper brace.
    # The animated weapon socket independently maintains the straight-ahead aim.
    for _ in range(3):
        wrist_R=main-hr@Vector((0,.085,-.025))
        arm('R',wrist_R,hr)
        lower=rig.pose.bones['forearm.R']
        aligned=hand_frame((lower.tail-lower.head).normalized(),(gun_rotation@hand_R).col[2])
        hr=hr.to_quaternion().slerp(aligned.to_quaternion(),.5).to_matrix()
    wrist_R=main-hr@Vector((0,.085,-.025))
    wrist_L=support-hl@Vector((0,.075,-.012))
    for suffix,wrist,rotation in [('R',wrist_R,hr),('L',wrist_L,hl)]:
        arm(suffix,wrist,rotation)
        lower=rig.pose.bones['forearm.'+suffix]
        mat=hand_frame((lower.tail-lower.head).normalized(),rotation.col[2]).to_4x4()
        mat.translation=lower.head.copy();lower.matrix=mat
        bpy.context.view_layer.update()
        mat=rotation.to_4x4();mat.translation=wrist
        rig.pose.bones['hand.'+suffix].matrix=mat
        bpy.context.view_layer.update()
    rig.pose.bones['weapon'].matrix=gun@rifle_scale@socket_to_rifle.inverted()
    bpy.context.view_layer.update()
    for pb in rig.pose.bones:
        for channel in ['location','rotation_euler','scale']:
            pb.keyframe_insert(channel,frame=frame,group=pb.name)
    errors.append(max((rig.pose.bones['forearm.'+s].tail-w).length for s,w in [('R',wrist_R),('L',wrist_L)]))
scene.frame_start,scene.frame_end=1,24;scene.render.fps=24
collection=bpy.data.collections['13 | ARMED - rifle and preview']
for label,offset in [('Hero',(-4,-6,1.1)),('Front',(0,-6,.2)),('Side',(-6,0,.2))]:
    name='TROOPER CAM | Shooting '+label
    cam=bpy.data.objects.get(name)
    if not cam:
        cam=bpy.data.objects.new(name,bpy.data.cameras.new(name));collection.objects.link(cam)
    target=Vector((0,-.18,-.32));cam.location=target+Vector(offset)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=2.5
scene.camera=bpy.data.objects['TROOPER CAM | Shooting Hero']
scene.frame_set(1);bpy.context.view_layer.update()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active;space.use_local_camera=False;space.camera=scene.camera
        space.region_3d.view_perspective='CAMERA';space.region_3d.view_camera_zoom=12
        space.region_3d.view_camera_offset=(0,0)
        space.overlay.show_overlays=False;space.show_region_ui=False
result={'action':action.name,'max_wrist_error':max(errors),'frames':[1,24],'rifle_parent':rifle.parent_bone}
