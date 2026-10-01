"""Cut the muzzle side pockets and improve readability of charcoal surfaces."""
from pathlib import Path
import bpy
import bmesh

S=1/1250
scene=bpy.context.scene
assert scene.get('generator')=='sector_rifle_concept01_mcp'
assert not scene.get('muzzle_pockets_refined')
construction=bpy.data.collections.new('04 | CONSTRUCTION - editable pocket cutters')
scene.collection.children.link(construction)
muzzle=bpy.data.objects['RIFLE | 31 hollow faceted muzzle']
outline=[(1299,206),(1358,205),(1358,219),(1318,231),(1291,229)]
for sign,side in [(-1,'left'),(1,'right')]:
    verts=[(sign*depth*S,-(x-508)*S,(355-y)*S)
           for depth in [38.5,74] for x,y in outline]
    n=len(outline)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    data=bpy.data.meshes.new('RIFLE CUTTER | Muzzle pocket '+side)
    data.from_pydata(verts,[],faces)
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(data.name,data);construction.objects.link(obj)
    obj.parent=bpy.data.objects['SectorTrooper_Rifle']
    obj.display_type='WIRE';obj.hide_render=True;obj.hide_set(True)
    modifier=muzzle.modifiers.new('Recessed side pocket '+side,'BOOLEAN')
    modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=obj
    panel=bpy.data.objects['RIFLE | 32 muzzle side recess '+side]
    for v in panel.data.vertices:
        v.co.x-=sign*(54.5-38.8)*S


def rgba(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)


for name,color in [('charcoal body','353832'),('grip rubber','252923'),
                   ('dark recesses','111410')]:
    mat=bpy.data.materials['RIFLE | '+name]
    mat.diffuse_color=rgba(color)
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=rgba(color)
scene['muzzle_pockets_refined']=True
# User-requested small reduction in depth; leave this editable on the root.
root=bpy.data.objects['SectorTrooper_Rifle']
root.scale.x=.90
root['width_scale']=.90
bpy.context.view_layer.update()
result={'muzzle_side_pockets':2,'width_scale':.90,
        'construction':'Boolean cutters retained for editing'}
