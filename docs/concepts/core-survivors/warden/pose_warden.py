"""Staff guard pose, retaining the T-pose rest skeleton."""
from mathutils import Matrix, Vector
import math

def set_display_pose(rig):
 rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
 poses={name:matrix.copy() for name,matrix in rest.items()}
 def aimed(name,head,tail):
  b=rig.data.bones[name]
  q=(b.tail_local-b.head_local).rotation_difference(tail-head)
  m=q.to_matrix().to_4x4()@rest[name];m.translation=head;return m
 for side,sx in [('R',-1),('L',1)]:
  shoulder=rig.data.bones[side+'.UpperArm'].head_local.copy()
  wrist=Vector((sx*.85 if side=='R' else sx*.74, -.46 if side=='R' else -.05,2.02 if side=='R' else 1.52))
  delta=wrist-shoulder;distance=delta.length
  a=rig.data.bones[side+'.UpperArm'].length;b=rig.data.bones[side+'.Forearm'].length
  assert abs(a-b)<distance<a+b
  direction=delta.normalized();pole=Vector((sx,.25,-.6))
  bend=(pole-direction*pole.dot(direction)).normalized()
  along=(a*a-b*b+distance*distance)/(2*distance)
  elbow=shoulder+direction*along+bend*math.sqrt(max(0,a*a-along*along))
  poses[side+'.UpperArm']=aimed(side+'.UpperArm',shoulder,elbow)
  poses[side+'.Forearm']=aimed(side+'.Forearm',elbow,wrist)
  if side=='R':
   # Palm vertical: fingers wrap horizontally while their row runs up the shaft.
   rotation=Matrix(((0,0,1),(1,0,0),(0,1,0))).to_4x4()
   poses[side+'.Hand']=rotation@rest[side+'.Hand']
   poses[side+'.Hand'].translation=wrist
  else:
   poses[side+'.Hand']=aimed(side+'.Hand',wrist,wrist+Vector((sx*.045,-.035,-.2)))
  poses[side+'.EquipmentSocket']=poses[side+'.Hand']@rest[side+'.Hand'].inverted()@rest[side+'.EquipmentSocket']
 for pose in rig.pose.bones:
  pose.rotation_mode='QUATERNION'
  kw=dict(parent_matrix=poses[pose.parent.name],parent_matrix_local=rest[pose.parent.name]) if pose.parent else {}
  pose.matrix_basis=pose.bone.convert_local_to_pose(poses[pose.name],rest[pose.name],invert=True,**kw)

 return poses
