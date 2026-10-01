"""Reusable control poses for rig checks; no gameplay animation is implied."""
import math
import bpy
from mathutils import Matrix, Vector

rig = bpy.data.objects['SectorTrooper_Rig']
S = 1/384


def reset():
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def rotate(name, angles):
    rig.pose.bones[name].rotation_euler = [math.radians(v) for v in angles]


def move(name, delta_px):
    rig.pose.bones[name].location = rig.data.bones[name].matrix_local.to_3x3().inverted() @ (Vector(delta_px)*S)


def pose(name):
    reset()
    if name == 'Rest':
        return
    for suffix,sign in [('L',1),('R',-1)]:
        rotate('upper_arm.'+suffix, (-70,0,0))
        rotate('forearm.'+suffix, (0,0,-sign*25))
    if name == 'Ready':
        move('pelvis',(0,0,-10))
        rotate('chest',(3,0,0))
    elif name == 'Crouch':
        move('pelvis',(0,5,-28))
        rotate('chest',(10,0,0))
        rotate('head',(-5,0,0))
        rotate('front_guard',(0,0,-18))
        rotate('rear_guard',(0,0,12))
        for suffix,sign in [('L',1),('R',-1)]:
            rotate('upper_arm.'+suffix, (-60,0,-sign*10))
            rotate('forearm.'+suffix, (0,0,-sign*60))
    elif name == 'Step':
        move('pelvis',(0,0,-20))
        move('foot_ik.L',(0,-52,27))
        move('foot_ik.R',(0,22,0))
        rotate('chest',(6,6,0))
        rotate('head',(-2,-9,0))
        rotate('front_guard',(0,0,-25))
        rotate('rear_guard',(0,0,12))
        rotate('upper_arm.R',(-48,0,28))
        rotate('forearm.R',(0,0,60))
        rotate('upper_arm.L',(-76,0,12))
        rotate('forearm.L',(0,0,-30))
    elif name == 'Reach':
        move('pelvis',(0,0,-12))
        rotate('chest',(3,-8,0))
        rotate('head',(0,-14,0))
        rotate('upper_arm.L',(-20,0,-50))
        rotate('forearm.L',(0,0,-35))
        rotate('hand.L',(0,10,0))
        rotate('upper_arm.R',(-68,0,5))
        rotate('forearm.R',(0,0,45))
    else:
        raise ValueError(name)
    bpy.context.view_layer.update()


result = {'poses':['Rest','Ready','Crouch','Step','Reach']}
