"""Detailed reference boots; shared by the leg builder and scoped foot revision.

Load with runpy and the existing mesh/loft helpers, S, ivory and black globals.
Local u runs across the foot, f runs forward, and all values are reference px.
"""
import math
import bpy
import bmesh
from mathutils import Vector


def build_boot(side,label):
    yaw=math.radians(8)
    created=[]

    def point(u,f,z):
        v=-f
        return (side*(98+u*math.cos(yaw)-v*math.sin(yaw)),
                u*math.sin(yaw)+v*math.cos(yaw),z)

    def block(name,rows,mat=black,seed=0):
        obj=loft(label+" "+name,[[point(*p) for p in row] for row in rows],
                 mat,caps=True,seed=seed)
        created.append(obj)
        return obj

    # Thin continuous contact sole, with a bevel instead of a rectangular slab.
    outline=[(-28,-42),(-35,-32),(-35,-4),(-44,62),(-46,88),(-37,108),
             (37,108),(46,88),(44,62),(35,-4),(35,-32),(28,-42)]
    block("09 broad charcoal sole",[
        [(u*.97,f*.98,-486) for u,f in outline],
        [(u,f,-483) for u,f in outline],
        [(u,f,-478) for u,f in outline],
    ])

    # Front shell: a high ankle crest, a distinct instep break and a short toe
    # shelf. Upright side panels carry the white armor down to the sole rim.
    rows=[
        [(-35,8,-472),(-33,8,-445),(-25,21,-425),(-19,29,-416),
         (19,29,-416),(25,21,-425),(33,8,-445),(35,8,-472)],
        [(-44,48,-472),(-42,48,-445),(-32,53,-433),(-24,53,-430),
         (24,53,-430),(32,53,-433),(42,48,-445),(44,48,-472)],
        [(-43,80,-469),(-43,83,-459),(-32,85,-443),(-27,82,-441),
         (27,82,-441),(32,85,-443),(43,83,-459),(43,80,-469)],
        [(-40,91,-467),(-39,92,-459),(-30,98,-450),(-25,98,-449),
         (25,98,-449),(30,98,-450),(39,92,-459),(40,91,-467)],
    ]
    vertices=[point(*p) for row in rows for p in row]
    faces=[]
    n=len(rows[0])
    for j in range(len(rows)-1):
        for i in range(n-1):
            a=j*n+i
            b,c,d=a+1,a+n+1,a+n
            faces.extend([(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)])
    instep=mesh(label+" 10 faceted instep armor",vertices,faces,ivory,thickness=2.5,seed=10)
    bm=bmesh.new()
    bm.from_mesh(instep.data)
    highest=max(bm.faces,key=lambda f:f.calc_center_median().z)
    if highest.normal.z<0:
        for face in bm.faces:
            face.normal_flip()
    bm.to_mesh(instep.data)
    bm.free()
    created.append(instep)

    # Compact heel cup, separated from the front shell by a recessed black seam.
    heel=[(-26,-41),(-34,-32),(-34,-8),(-26,-3),
          (26,-3),(34,-8),(34,-32),(26,-41)]
    block("11 separate heel armor",[
        [(u*.98,f,-471) for u,f in heel],
        [(u,f,-459) for u,f in heel],
        [(-22,-33,-437),(-25,-27,-429),(-23,-9,-427),(-16,-4,-433),
         (16,-4,-433),(23,-9,-427),(25,-27,-429),(22,-33,-437)],
    ],ivory,seed=11)
    seam=[]
    for z,width,depth in [(-478,29,25),(-443,29,25),(-429,23,23)]:
        seam.append([(width*math.sin(math.tau*i/10),depth*math.cos(math.tau*i/10),z)
                     for i in range(10)])
    block("12 recessed heel flex seam",seam)

    # Separate raised heel and forefoot rims expose a narrow flex break in profile.
    front_rim=[(-35,7),(-44,62),(-46,88),(-37,108),
               (37,108),(46,88),(44,62),(35,7)]
    block("13 forefoot sole rim",[
        [(u,f,-478) for u,f in front_rim],
        [(u*.98,f*.99,-472) for u,f in front_rim],
    ])
    heel_rim=[(-28,-42),(-35,-32),(-35,-5),(35,-5),(35,-32),(28,-42)]
    block("14 heel sole block",[
        [(u,f,-478) for u,f in heel_rim],
        [(u,f,-474) for u,f in heel_rim],
        [(u*.96,f,-471) for u,f in heel_rim],
    ])

    # Broad raised toe bumper, with sloping black front and clipped side corners.
    # The ivory shelf above it forms the thin light lip visible in both views.
    block("15 raised charcoal toe bumper",[
        [(-39,81,-472),(-46,89,-472),(-37,108,-472),
         (37,108,-472),(46,89,-472),(39,81,-472)],
        [(-31,82,-458),(-39,88,-459),(-29,99,-451),
         (29,99,-451),(39,88,-459),(31,82,-458)],
    ])
    for obj in created:
        obj["model_part"]="boot"
        obj["boot_revision"]=2
        obj["rig_segment"]="foot"
        obj["side"]=label
    return created


def add_boot_cameras(stage,inset_px=24):
    """Close inspection cameras for the character's right boot."""
    target=Vector((-(98-inset_px)*S,-28*S,-447*S))
    for name,offset,scale in [
        ("Boot Hero",(-4,-6,2.5),.55),
        ("Boot Front",(0,-6,0),.49),
        ("Boot Side",(-6,0,0),.55),
    ]:
        full="TROOPER CAM | "+name
        obj=bpy.data.objects.get(full)
        if not obj:
            obj=bpy.data.objects.new(full,bpy.data.cameras.new(full))
            stage.objects.link(obj)
        obj.location=target+Vector(offset)
        obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
        obj.data.type="ORTHO"
        obj.data.ortho_scale=scale
