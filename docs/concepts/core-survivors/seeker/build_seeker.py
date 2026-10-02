"""Build Seeker in an isolated background Blender, preserving the live session.
Blender -Y forward, +Z up; glTF +Z forward, +Y up. Rigid-weighted quadruped.
"""
from pathlib import Path
import bpy, bmesh, math, json
from mathutils import Vector
HERE=Path(__file__).resolve().parent
assert bpy.app.background
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='SEEKER | Studio'
scene.unit_settings.system='METRIC'
def collection(name):
 c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
asset=collection('01 · SEEKER — model & rig');stage=collection('02 · Studio');refs=collection('03 · Packed reference')
refs.hide_render=True
parts=[]
def rgba(h):
 c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)
def material(name,color,vertex=False,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=rgba(color);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgba(color)
 p.inputs['Metallic'].default_value=.25;p.inputs['Roughness'].default_value=.65
 if vertex:
  n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='ArmorTone';m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
 if emission:p.inputs['Emission Color'].default_value=rgba(color);p.inputs['Emission Strength'].default_value=emission
 return m
armor=material('SEEKER · graphite facets','303336',True)
signal=material('SEEKER · scarlet sensors','C21109',emission=1.1)
dark=['303336','393C3F','272B2E','35383A'];edge=['555752','62635C','454943'];black=['15191B','1D2224','22272A'];pale=['77776E','686A65','85847A']
def mesh(name,verts,faces,bone='Body',colors=None,glow=False):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free()
 d.materials.append(armor);d.materials.append(signal)
 a=d.color_attributes.new(name='ArmorTone',type='FLOAT_COLOR',domain='CORNER')
 for f in d.polygons:
  f.material_index=int(glow);f.use_smooth=False
  for i in f.loop_indices:a.data[i].color=(1,1,1,1) if glow else rgba((colors or dark)[f.index%len(colors or dark)])
 o=bpy.data.objects.new(name,d);asset.objects.link(o)
 o.vertex_groups.new(name=bone).add(list(range(len(verts))),1,'REPLACE');o['part']=name;parts.append(o);return o

def beam(name,a,b,sizes,bone,colors=None):
 a,b=Vector(a),Vector(b);q=Vector((0,0,1)).rotation_difference((b-a).normalized())
 profile=[(-.68,-1),(.68,-1),(1,-.68),(1,.68),(.68,1),(-.68,1),(-1,.68),(-1,-.68)]
 verts=[]
 for j,(w,d) in enumerate(sizes):
  t=j/(len(sizes)-1);verts += [tuple(a+(b-a)*t+q@Vector((x*w/2,y*d/2,0))) for x,y in profile]
 n=8;faces=[tuple(range(n-1,-1,-1)),tuple(range((len(sizes)-1)*n,len(sizes)*n))]
 for j in range(len(sizes)-1):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 return mesh(name,verts,faces,bone,colors)

def joint(name,pos,radius,width,bone):
 return beam(name,(pos[0]-width/2,pos[1],pos[2]),(pos[0]+width/2,pos[1],pos[2]),[(radius*1.7,radius*1.7),(radius*2,radius*2),(radius*1.7,radius*1.7)],bone,edge)

def plate(name,outline,thickness,bone,colors=None,ridge=.025):
 # Closed faceted plate; bevel strip follows its outline instead of smooth normals.
 n=len(outline);center=sum((Vector(v) for v in outline),Vector())/n
 top=[Vector(v) for v in outline]
 inset=[center+(v-center)*.94+Vector((0,0,.014)) for v in top]
 verts=[tuple(v-Vector((0,0,thickness))) for v in top]+[tuple(v) for v in top]+[tuple(v) for v in inset]+[tuple(center+Vector((0,0,ridge)))]
 faces=[tuple(range(n-1,-1,-1))]
 for i in range(n):
  j=(i+1)%n;faces.extend([(i,j,n+j,n+i),(n+i,n+j,2*n+j,2*n+i),(2*n+i,2*n+j,3*n)])
 return mesh(name,verts,faces,bone,colors)

# Elongated armored trunk with a low, tapered pelvis and exposed neck hinge.
beam('Ventral chassis',(0,-.62,1.0),(0,.92,1.02),[(.55,.48),(.74,.57),(.45,.36)],'Body',black)
plate('Dorsal keel',[(-.21,-.64,1.36),(.21,-.64,1.36),(.35,.2,1.45),(.2,.94,1.31),(0,1.20,1.18),(-.2,.94,1.31),(-.35,.2,1.45)],.14,'Body',ridge=.10)
for sign,side in [(-1,'R'),(1,'L')]:
 plate(side+' swept blade carapace',[(sign*.18,-.65,1.40),(sign*.73,-.23,1.28),(sign*.64,1.47,1.93),(sign*.26,.55,1.49)],.065,'Fin'+side,colors=['3C3F40','343839','494B49','303436'],ridge=.04)
 beam(side+' flank chassis',(sign*.38,-.45,1.02),(sign*.34,.72,1.12),[(.2,.3),(.22,.34),(.17,.2)],'Body',black)
beam('Neck hinge',(0,-.49,1.03),(0,-.91,1.13),[(.29,.28),(.29,.28)],'Neck',black)
# Head top, faceted cheeks and a long split muzzle: no rounded animal surfaces.
plate('Brow wedge',[(-.36,-.70,1.46),(.36,-.70,1.46),(.24,-1.30,1.14),(0,-1.42,1.11),(-.24,-1.30,1.14)],.13,'Head',ridge=.018)
plate('Nasal spear',[(-.16,-1.19,1.035),(.16,-1.19,1.035),(.095,-1.82,.81),(-.095,-1.82,.81)],.075,'Head',colors=['393D3E','414444','292E30'],ridge=.04)
for sign,side in [(-1,'R'),(1,'L')]:
 # The side cheeks step inward below the brow, leaving a dark optical socket.
 verts=[(sign*.315,-.76,1.25),(sign*.255,-1.24,1.04),(sign*.14,-1.47,.88),(sign*.24,-.88,.92),
        (sign*.26,-.76,1.23),(sign*.20,-1.24,1.02),(sign*.10,-1.47,.89),(sign*.18,-.88,.94)]
 mesh(side+' angular cheek',verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'Head',black)
 # Eye wells sit on the outer cheek plane, elongated toward the snout.
 pts=[(sign*.318,-.84,1.245),(sign*.264,-1.19,1.09),(sign*.258,-1.18,1.025),(sign*.314,-.83,1.18)]
 mesh(side+' optical recess',pts,[(0,1,2,3)],'Head',['090E10'])
 a=Vector(pts[0]);b=Vector(pts[1]);c=Vector(pts[2]);d=Vector(pts[3]);offset=Vector((sign*.003,0,0))
 eye=[a.lerp(b,.23).lerp(d.lerp(c,.23),.35)+offset,a.lerp(b,.77).lerp(d.lerp(c,.77),.35)+offset,a.lerp(b,.77).lerp(d.lerp(c,.77),.7)+offset,a.lerp(b,.23).lerp(d.lerp(c,.23),.7)+offset]
 mesh(side+' red slit',[tuple(v) for v in eye],[(0,1,2,3)],'Head',glow=True)
# Hanging throat plate / red diamond echoes the other Hollow Legion chest emblems.
mesh('Throat shield',[(-.18,-1.03,.99),(.18,-1.03,.99),(0,-1.27,.55),(-.14,-.91,.96),(.14,-.91,.96),(0,-1.13,.57)],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],'Neck',dark)
mesh('Throat sensor well',[(-.09,-1.052,.93),(.09,-1.052,.93),(0,-1.223,.64)],[(0,1,2)],'Neck',['101517'])
mesh('Throat crimson delta',[(-.049,-1.073,.89),(.049,-1.073,.89),(0,-1.171,.715)],[(0,1,2)],'Neck',glow=True)

bones=[('Root',(0,0,0),(0,0,.25),None),('Body',(0,0,.92),(0,-.5,1.0),'Root'),('Neck',(0,-.5,1.0),(0,-.9,1.12),'Body'),('Head',(0,-.9,1.12),(0,-1.6,.92),'Neck')]
for sign,side in [(-1,'R'),(1,'L')]:
 bones.append(('Fin'+side,(sign*.3,-.4,1.37),(sign*.6,1.35,1.87),'Body'))
 for front in [True,False]:
  tag=('Front' if front else 'Rear')+side
  shoulder=(sign*.46,-.51 if front else .66,1.08)
  knee=(sign*.64,-.30 if front else .91,.65)
  ankle=(sign*.78,-.86 if front else 1.0,.12)
  hock=(sign*.72,1.15,.33)
  toe=(sign*.78,(-1.10 if front else .78),.065)
  upper=tag+'Upper';lower=tag+'Lower';foot=tag+'Foot'
  bones += [(upper,shoulder,knee,'Body'),(lower,knee,ankle if front else hock,upper)]
  if not front:bones.append((tag+'Hock',hock,ankle,lower))
  bones.append((foot,ankle,toe,lower if front else tag+'Hock'))
  joint(tag+' socket',shoulder,.16,.14,'Body')
  a=Vector(shoulder);b=Vector(knee)
  beam(tag+' upper armor',a.lerp(b,.1),a.lerp(b,.86),[(.25,.29),(.29,.31),(.18,.20)],upper)
  joint(tag+' knee',knee,.095,.15,lower)
  low_end=ankle if front else hock
  a=Vector(knee);b=Vector(low_end)
  beam(tag+' exposed actuator',a,b,[(.105,.1),(.105,.1)],lower,black)
  beam(tag+' shin armor',a.lerp(b,.15),a.lerp(b,.86),[(.16,.19),(.20,.18),(.145,.14)],lower)
  if not front:
   joint(tag+' hock pivot',hock,.072,.12,tag+'Hock')
   beam(tag+' hock strut',hock,ankle,[(.105,.11),(.11,.12)],tag+'Hock',black)
  joint(tag+' wrist',ankle,.065,.12,foot)
  # Separate three-toe mechanical paw, sole exactly on Z=0.
  x,y,z=ankle
  plate(tag+' paw knuckle',[(x-.145,y+.045,.115),(x+.145,y+.045,.115),(x+.125,y-.10,.10),(x-.125,y-.10,.10)],.065,foot,edge,.01)
  for i in [-1,0,1]:
   xx=x+i*.095;end=y-.25+abs(i)*.025
   v=[(xx-.038,y-.075,.09),(xx+.038,y-.075,.09),(xx+.033,end,.052),(xx-.033,end,.052),
      (xx-.038,y-.075,0),(xx+.038,y-.075,0),(xx+.033,end,0),(xx-.033,end,0)]
   mesh(tag+' toe '+str(i+2),v,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],foot,edge)

# Keep individual armor islands editable; join for two material draws in the export.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();model=bpy.context.object;model.name='Seeker_Armor'
arm=bpy.data.armatures.new('Seeker_Rig');rig=bpy.data.objects.new('Seeker',arm);asset.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);model.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
for name,a,b,parent in bones:
 bone=arm.edit_bones.new(name);bone.head=a;bone.tail=b
 if parent:bone.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
mod=model.modifiers.new('Rigid armor skeleton','ARMATURE');mod.object=rig;model.parent=rig
rig['front_axis']='-Y Blender; +Z glTF';rig['status']='Rigged neutral stance; movement and attacks to be authored.'
# Packed source reference, hidden in renders and viewport.
img=bpy.data.images.load(str(HERE/'seeker-reference.png'));img.pack();img.filepath='//seeker-reference.png'
ref=bpy.data.objects.new('REFERENCE · supplied Seeker',None);refs.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=img;refs.hide_viewport=True
# Studio.
floor_mat=material('Studio · neutral','777C80');floor_mat.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=0
floor_mesh=bpy.data.meshes.new('Floor');floor_mesh.from_pydata([(-200,-200,-.005),(200,-200,-.005),(200,200,-.005),(-200,200,-.005)],[],[(0,1,2,3)])
floor=bpy.data.objects.new('Studio floor',floor_mesh);stage.objects.link(floor);floor_mesh.materials.append(floor_mat)
world=bpy.data.worlds.new('Seeker Studio');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.40,.44,.5,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.4;scene.world=world

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,pos,power,size in [('Key',(-3,-4,6),650,4),('Fill',(4,-1,3),370,3),('Rim',(0,4,5),700,3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);stage.objects.link(o);o.location=pos;aim(o,(0,0,.8))
for name,pos,target,scale in [('Hero',(4,-6,3.5),(0,-.12,.91),4.1),('Front',(0,-7,1.0),(0,-.12,1),3.5),('Side',(6,0,1),(0,-.12,1),3.9),('Top',(0,0,7),(0,-.12,0),4.0)]:
 d=bpy.data.cameras.new('CAM · '+name);d.type='ORTHO';d.ortho_scale=scale;o=bpy.data.objects.new('CAM · '+name,d);stage.objects.link(o);o.location=pos;aim(o,target)
scene.camera=bpy.data.objects['CAM · Hero'];scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
for obj in stage.objects:obj.hide_set(True)
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_extras=False;area.spaces.active.region_3d.view_distance=5
   area.spaces.active.region_3d.view_location=(0,-.1,.9);area.spaces.active.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
bpy.ops.object.select_all(action='DESELECT');model.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(HERE/'seeker.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_extras=True,export_cameras=False,export_lights=False)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'seeker.blend'))
model.data.calc_loop_triangles()
stats={'triangles':len(model.data.loop_triangles),'vertices':len(model.data.vertices),'bones':len(bones),'materials':len(model.data.materials),'animations':[], 'dimensions_blender':list(model.dimensions),'glb_bytes':(HERE/'seeker.glb').stat().st_size,'pose':'Neutral crouched quadruped stance','front_axis':'+Z in glTF'}
(HERE/'asset-stats.json').write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps(stats),flush=True)
for name in ['Hero','Side','Top','Front']:
 scene.camera=bpy.data.objects['CAM · '+name];scene.render.filepath=str(HERE/('seeker-'+('preview' if name=='Hero' else name.lower())+'.png'));bpy.ops.render.render(write_still=True)
print('SEEKER COMPLETE',flush=True)
