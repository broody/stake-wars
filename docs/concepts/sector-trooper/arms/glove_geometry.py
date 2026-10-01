"""Simple relaxed fist in the arm builder's reference-pixel coordinates.

One palm, four curled digits and an outside thumb. The existing 152 vertices
and 280 triangles are retained; the glove still follows a single hand bone.
"""
import math

PROFILE = [(-.65,1),(.65,1),(1,.55),(1,-.55),
           (.65,-1),(-.65,-1),(-1,-.55),(-1,.55)]


def ring(x, ry, rz, cy=0, cz=-44):
    return [(x,cy+y*ry,cz+z*rz) for y,z in PROFILE]


def curled_ring(x,y,z,width,depth,bend):
    angle = math.radians(bend)
    return [(x+b*depth*math.sin(angle),y+a*width,
             z+b*depth*math.cos(angle)) for a,b in PROFILE]


def swept_ring(center,tangent,width,depth):
    def cross(a,b):
        return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    def unit(v):
        length=math.sqrt(sum(c*c for c in v))
        return tuple(c/length for c in v)
    tangent=unit(tangent)
    side=unit(cross((0,0,1),tangent))
    back=cross(tangent,side)
    return [tuple(center[i]+a*width*side[i]+b*depth*back[i] for i in range(3))
            for a,b in PROFILE]


def loft(rows):
    n = len(rows[0])
    verts = [v for row in rows for v in row]
    faces = []
    for j in range(len(rows)-1):
        for i in range(n):
            a,b = j*n+i,j*n+(i+1)%n
            c,d = b+n,a+n
            faces.extend([(a,b,c),(a,c,d)] if (j+i)%2 else [(a,b,d),(b,c,d)])
    faces.extend([tuple(range(n-1,-1,-1)),tuple(range((len(rows)-1)*n,len(rows)*n))])
    return verts,faces


def glove_geometry():
    verts,faces = loft([ring(334,16,13.5),ring(343,23,16),
                        ring(370,25,15),ring(384,21,12)])
    def append(rows):
        v,f = loft(rows)
        offset = len(verts)
        verts.extend(v)
        faces.extend(tuple(i+offset for i in face) for face in f)
    for y,length,width in [(-17.5,46,5.6),(-5.8,53,5.8),
                           (6,49,5.6),(17.4,37,5.1)]:
        stagger = (length-46)*.28
        append([curled_ring(377,y,-43,width,8,20),
                curled_ring(391+stagger,y,-55,width*.88,7,100),
                curled_ring(372+stagger*.35,y,-65-stagger*.45,width*.62,4.8,170)])
    # Lay the thumb across the curled index/middle fingers, outside the palm.
    append([swept_ring((350,-18,-49),(1,-.4,-.7),8,10),
            swept_ring((367,-27,-63),(1,.35,-.45),8,8),
            swept_ring((378,-8,-68),(.3,1,-.1),5.6,6)])
    assert len(verts)==152 and sum(len(f)-2 for f in faces)==280
    return verts,faces
