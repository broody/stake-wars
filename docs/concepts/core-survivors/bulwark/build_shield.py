"""Build a separate low-poly shield, rigidly weighted to the left equipment socket."""
from pathlib import Path
import runpy
import bpy
from mathutils import Vector


def build_shield(rig, mesh):
    pose=runpy.run_path(str(Path(__file__).with_name('pose_bulwark.py')))['set_display_pose']
    pose(rig,True)
    bpy.context.view_layer.update()
    socket='L.EquipmentSocket'
    rig.data.bones[socket].use_deform=True
    # Author the vertical shield in the standing pose, then bind it back to rest.
    transform=rig.pose.bones[socket].matrix @ rig.data.bones[socket].matrix_local.inverted()
    to_rest=transform.inverted()
    parts=[]

    def piece(name,verts,faces,colors=None,glowing=False):
        obj=mesh(name,[tuple(to_rest@Vector(v)) for v in verts],faces,socket,colors,glowing)
        parts.append(obj)
        return obj

    center=.91
    outline=[(-.30,1.49),(.25,1.62),(.33,1.50),(.265,.32),(.025,.13),(-.25,.29),(-.32,1.30)]
    inner=[(x*.88,.87+(z-.87)*.94) for x,z in outline]
    n=len(outline)

    def point(x,z,depth):
        return (center+x,depth+.12*x,z)

    # Narrow edge plus thick rear shell; the front remains large flat planes.
    verts=[point(x,z,y) for profile,y in [(outline,-.435),(inner,-.463),(outline,-.30)] for x,z in profile]
    faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    faces += [(i,2*n+i,2*n+(i+1)%n,(i+1)%n) for i in range(n)]
    faces += [tuple(reversed(range(2*n,3*n)))]
    piece('Shield · angular edge and rear',verts,faces,['454A4D','363B3E','292E31','3C4144'])
    # One central ridge makes broad triangular facets like the Mite carapace.
    verts=[point(x,z,-.463) for x,z in inner]+[point(.005,.85,-.515)]
    piece('Shield · faceted slab',verts,[(i,(i+1)%n,n) for i in range(n)],
          ['303437','383C3F','292D30','34383B','2C3033','3A3E41','303538'])

    # Dark inset and restrained red triangle, echoing the chest and Lancer mask.
    tri=[(-.155,1.13),(.18,1.17),(.01,.85)]
    piece('Shield · recessed triangular face',[point(x,z,-.523) for x,z in tri],[(0,1,2)],['111619'])
    rim=[(-.174,1.145),(.199,1.193),(.01,.817)]
    verts=[point(x,z,-.526) for x,z in rim]+[point(x,z,-.527) for x,z in tri]
    piece('Shield · triangular inset edge',verts,[(i,(i+1)%3,(i+1)%3+3,i+3) for i in range(3)],
          ['3D4245','292E31','44494B'])
    piece('Shield · scarlet marker',[point(x,z,-.530) for x,z in
          [(-.022,1.100),(.037,1.108),(.01,1.052)]],[(0,1,2)],glowing=True)

    # Rear handle reaches the closed left hand; it is part of the shield mesh.
    grip=(rig.pose.bones[socket].matrix.translation).copy()
    def box(name,c,d):
        verts=[(c[0]+sx*d[0]/2,c[1]+sy*d[1]/2,c[2]+sz*d[2]/2)
               for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        piece(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],['252B2E','393F42'])
    back_y=-.30+.12*(grip.x-center)
    for dz in [-.11,.11]:
        box('Shield · handle stand-off',(grip.x,(back_y+grip.y)/2,grip.z+dz),
            (.095,grip.y-back_y,.065))
    box('Shield · rear grip',(grip.x,grip.y,grip.z),(.065,.065,.255))

    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    shield=bpy.context.object
    shield.name='Bulwark_Shield'
    shield.data.name='Bulwark · separate shield'
    shield.parent=rig
    shield['equipment']='Shield'
    shield['attachment_bone']=socket
    modifier=shield.modifiers.new('Shield socket attachment','ARMATURE')
    modifier.object=rig
    pose(rig,False)
    bpy.context.view_layer.update()
    return shield
