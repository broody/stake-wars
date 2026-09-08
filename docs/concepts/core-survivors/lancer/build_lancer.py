"""Build the low-poly Hollow Legion Lancer in an empty background Blender.

blender --background --factory-startup --python build_lancer.py
The live Mite project is never cleared or modified by this script.
"""
from pathlib import Path
import json
import math

import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUT = ROOT / "apps/web/public/models/hollow-legion"
TAG = "stakewars_lancer_v1"
assert bpy.app.background and not bpy.data.filepath, "Build in a fresh background process."
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene.name = "LANCER | Studio"
scene["generator"] = TAG
scene.unit_settings.system = "METRIC"


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


asset = collection("01 · LANCER — model & rig")
stage = collection("02 · Studio — cameras & lights")
references = collection("03 · References — packed image")
references.hide_render = True
parts = []


def rgba(hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels) + (1,)


def material(name, color, metal=.25, roughness=.65, vertex_color=False, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba(color)
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = rgba(color)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = roughness
    if vertex_color:
        v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        v.layer_name = "ArmorTone"
        mat.node_tree.links.new(v.outputs["Color"], p.inputs["Base Color"])
    if emission:
        p.inputs["Emission Color"].default_value = rgba(color)
        p.inputs["Emission Strength"].default_value = emission
    return mat


armor = material("LANCER · vertex-colored graphite", "303336", vertex_color=True)
signal = material("LANCER · scarlet sensors", "C21109", .1, .4, emission=1.1)
dark = ["303336", "393C3F", "272B2E", "35383A"]
pale = ["86837C", "959188", "74746F", "89867F"]


def mesh(name, verts, faces, bone="Spine", colors=None, glowing=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(armor)
    data.materials.append(signal)
    attr = data.color_attributes.new(name="ArmorTone", type="FLOAT_COLOR", domain="CORNER")
    palette = colors or dark
    for face in data.polygons:
        face.material_index = int(glowing)
        face.use_smooth = False
        color = rgba(palette[face.index % len(palette)])
        for index in face.loop_indices:
            attr.data[index].color = (1, 1, 1, 1) if glowing else color
    obj = bpy.data.objects.new(name, data)
    obj["generator"] = TAG
    asset.objects.link(obj)
    obj.vertex_groups.new(name=bone).add(list(range(len(verts))), 1, "REPLACE")
    parts.append(obj)
    return obj


def beam(name, start, end, sizes, bone, sides=4, colors=None, end_cap=True, levels=None):
    a, b = Vector(start), Vector(end)
    delta = b - a
    q = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    levels = levels or [i / (len(sizes) - 1) for i in range(len(sizes))]
    verts, faces = [], []
    for t, (width, depth) in zip(levels, sizes):
        w, d = width / 2, depth / 2
        ring = [(-w, -d), (w, -d), (w, d), (-w, d)] if sides == 4 else [
            (-w * .65, -d), (w * .65, -d), (w, 0), (w * .65, d), (-w * .65, d), (-w, 0)]
        verts += [tuple(a + q @ Vector((x, y, t * delta.length))) for x, y in ring]
    faces.append(tuple(reversed(range(sides))))
    for ring in range(len(sizes) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((ring * sides + i, ring * sides + j, (ring + 1) * sides + j, (ring + 1) * sides + i))
    if end_cap:
        faces.append(tuple((len(sizes) - 1) * sides + i for i in range(sides)))
    return mesh(name, verts, faces, bone, colors)


def cylinder(name, center, axis, radius, depth, bone, colors=None):
    count = 6
    c = Vector(center)
    q = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized())
    verts = [tuple(c + q @ Vector((radius * math.cos(i * math.tau / count),
                                  radius * math.sin(i * math.tau / count), z)))
             for z in (-depth / 2, depth / 2) for i in range(count)]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return mesh(name, verts, faces, bone, colors or ["44494B", "3C4143", "292D30"])


def plate(name, profile, front, back, bone, colors=None, ridge=.008):
    n = len(profile)
    verts = [(x, front, z) for x, z in profile] + [(x, back, z) for x, z in profile]
    verts.append((sum(x for x, _ in profile) / n, front - ridge, sum(z for _, z in profile) / n))
    faces = [(i, (i + 1) % n, n * 2) for i in range(n)]
    faces.append(tuple(reversed(range(n, n * 2))))
    faces += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    return mesh(name, verts, faces, bone, colors)


# Tall, narrow chassis, with a readable inverted breastplate and small waist.
plate("Torso shell", [(-.20, 1.49), (.20, 1.49), (.16, 1.31), (.075, 1.20), (-.075, 1.20), (-.16, 1.31)],
      -.085, .10, "Spine", ["373A3D", "303437", "292D30", "404346"])
plate("Central breastplate", [(-.075, 1.405), (.075, 1.405), (.083, 1.35), (.047, 1.26), (-.047, 1.26), (-.083, 1.35)],
      -.142, -.10, "Spine", ["383B3D", "2B2F32", "34383A"], ridge=.016)
beam("Waist core", (0, 0, 1.075), (0, 0, 1.255), [(.12, .13), (.10, .11)], "Hips", sides=6, colors=["1D2225"])
plate("Pelvic armor", [(-.145, 1.10), (.145, 1.10), (.10, .98), (-.10, .98)], -.08, .075, "Hips", dark)
for sx in (-1, 1):
    beam("Collar strut " + str(sx), (sx * .165, .012, 1.49), (sx * .084, .025, 1.59),
         [(.058, .105), (.048, .085)], "Spine", colors=["303538", "41464A"])
cylinder("Neck pivot", (0, .018, 1.573), (0, 0, 1), .043, .095, "Head", ["1D2225"])

# A steep wedge helmet. Its broad front mask and small red triangle read at distance.
profile = [(-.16, 1.79, .12), (.10, 1.92, .09), (.11, 1.69, .09), (-.055, 1.57, .055)]
verts = [(sx * w, y, z) for sx in (-1, 1) for y, z, w in profile]
mesh("Slanted wedge helmet", verts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                                    (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], "Head",
     ["35393C", "292E31", "464A4D", "252A2D", "25292C", "303538"])


def face_y(z, inset=0):
    return -.16 + (1.79 - z) * (.105 / .22) + inset


mesh("Recessed face mask", [(-.084, face_y(1.757, -.002), 1.757), (.084, face_y(1.757, -.002), 1.757),
                            (0, face_y(1.603, -.002), 1.603)], [(0, 1, 2)], "Head", ["0E1215"])
mesh("Scarlet face sensor", [(-.027, face_y(1.737, -.004), 1.737), (.027, face_y(1.737, -.004), 1.737),
                             (0, face_y(1.703, -.004), 1.703)], [(0, 1, 2)], "Head", glowing=True)

leg_points = {}
for side, sx in [("R", -1), ("L", 1)]:
    hip = Vector((sx * .122, 0, 1.035))
    knee = Vector((sx * .155, -.025, .61))
    ankle = Vector((sx * .177, .035, .15))
    leg_points[side] = (hip, knee, ankle)
    thigh, shin, foot = side + ".UpperLeg", side + ".LowerLeg", side + ".Foot"
    cylinder(side + " hip pivot", hip, (1, 0, 0), .066, .11, "Hips", ["24292C", "3D4245"])
    beam(side + " thigh", hip.lerp(knee, .12), hip.lerp(knee, .90),
         [(.145, .16), (.151, .165), (.101, .12)], thigh, 6, levels=[0, .14, 1])
    cylinder(side + " knee hinge", knee, (1, 0, 0), .057, .151, shin)
    p = [(knee.x + x, z) for x, z in [(-.048, .677), (.048, .677), (.068, .625), (.049, .55), (-.049, .55), (-.068, .625)]]
    plate(side + " knee plate", p, -.105, -.057, shin, pale, ridge=.012)
    beam(side + " tapered shin", knee.lerp(ankle, .12), knee.lerp(ankle, .93),
         [(.118, .135), (.125, .137), (.058, .071)], shin, 6, levels=[0, .17, 1])
    cylinder(side + " ankle hinge", ankle, (1, 0, 0), .035, .075, foot)
    x = ankle.x
    mesh(side + " wedge foot", [(x-.045,-.145,.002),(x+.045,-.145,.002),(x+.060,.092,.002),(x-.060,.092,.002),
                                 (x-.040,-.13,.073),(x+.040,-.13,.073),(x+.052,.06,.155),(x-.052,.06,.155)],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], foot,
         ["282D30", "484D50", "34393C", "303538"])

arm_points = {}
for side, sx in [("R", -1), ("L", 1)]:
    shoulder = Vector((sx * .267, 0, 1.464))
    elbow = Vector((sx * .335, -.008, 1.151))
    wrist = Vector((sx * .365, -.04, .913))
    arm_points[side] = (shoulder, elbow, wrist)
    upper, lower = side + ".UpperArm", side + ".Forearm"
    p = [(shoulder.x + x, z) for x, z in [(-.058,1.527),(.058,1.527),(.084,1.485),(.064,1.413),(-.064,1.413),(-.084,1.485)]]
    plate(side + " shoulder cap", p, -.098, .06, upper, pale, ridge=.021)
    beam(side + " upper arm", shoulder.lerp(elbow,.20), shoulder.lerp(elbow,.88),
         [(.083,.094),(.066,.072)], upper)
    cylinder(side + " elbow pivot", elbow, (0, 1, 0), .043, .092, lower)
    if side == "L":
        beam("L forearm", elbow.lerp(wrist,.16), elbow.lerp(wrist,1.02),
             [(.082,.086),(.093,.095),(.062,.067)], lower, 6, levels=[0,.2,1])
        beam("L palm", wrist, wrist + Vector((0,0,-.081)), [(.073,.068),(.064,.055)], "L.Hand")
        for sx2 in (-1, 1):
            # Two broad pincer fingers, with no small knuckle assemblies.
            px = wrist.x + sx2 * .042
            p = [(px-.013,.851),(px+.013,.851),(px+.015,.799),(px-sx2*.018+.010,.775),
                 (px-sx2*.018-.010,.777),(px-.013,.809)]
            plate("L claw " + str(sx2), p, -.070, -.028, "L.Hand", ["33393C", "42494C"], ridge=0)

# A conspicuous right-arm cannon, kept to large rectangular forms.
gun_start = arm_points["R"][1]
gun_end = Vector((-.385, -.30, .56))
gun_axis = (gun_end - gun_start).normalized()
gun_q = Vector((0, 0, 1)).rotation_difference(gun_axis)
beam("Cannon mount", gun_start, gun_start.lerp(gun_end,.20), [(.085,.095),(.10,.11)], "R.Forearm", colors=["262C2F"])
beam("Cannon receiver", gun_start.lerp(gun_end,.16), gun_start.lerp(gun_end,.60),
     [(.145,.166),(.177,.187),(.154,.165)], "Cannon", 6, levels=[0,.12,1])
beam("Cannon barrel", gun_start.lerp(gun_end,.60), gun_end,
     [(.147,.159),(.136,.147)], "Cannon", colors=["404649","32383B","282E31","383E41"], end_cap=False)
outer = [(-.068,-.0735),(.068,-.0735),(.068,.0735),(-.068,.0735)]
inner = [(-.043,-.048),(.043,-.048),(.043,.048),(-.043,.048)]
mouth = [tuple(gun_end + gun_q @ Vector((x,y,z))) for ring,z in [(outer,0),(inner,0),(inner,-.035)] for x,y in ring]
faces = [(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
faces += [(i+4,(i+1)%4+4,(i+1)%4+8,i+8) for i in range(4)] + [(8,9,10,11)]
mesh("Recessed cannon muzzle", mouth, faces, "Cannon", ["202629","11171A","303639","13191C"])
status_center = gun_start.lerp(gun_end,.70)
mesh("Cannon status strip", [tuple(status_center + gun_q @ Vector((x,y,z)))
                             for x,y,z in [(-.024,.082,-.032),(.024,.082,-.032),(.024,.082,.032),(-.024,.082,.032)]],
     [(0,1,2,3)], "Cannon", glowing=True)

# One mesh, rigid weights, and a compact animation skeleton. Muzzle is a socket.
arm_data = bpy.data.armatures.new("LANCER · mechanical skeleton")
rig = bpy.data.objects.new("Lancer", arm_data)
asset.objects.link(rig)
rig["generator"] = TAG
rig["asset"] = "Hollow Legion / 02 Lancer"
rig["front_axis"] = "-Y in Blender; +Z in glTF"
rig["notes"] = "Low-poly ranged sentinel; cannon replaces the right hand. Muzzle bone is the projectile socket."
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")


def bone(name, head, tail, parent=None, connected=False):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = connected
    return b


bone("Root", (0,0,0), (0,0,.18))
bone("Hips", (0,0,1.02), (0,0,1.16), "Root")
bone("Spine", (0,0,1.16), (0,0,1.51), "Hips", True)
bone("Head", (0,.018,1.56), (0,.018,1.86), "Spine")
for side,(hip,knee,ankle) in leg_points.items():
    bone(side+".UpperLeg",hip,knee,"Hips")
    bone(side+".LowerLeg",knee,ankle,side+".UpperLeg",True)
    bone(side+".Foot",ankle,(ankle.x,-.14,.045),side+".LowerLeg",True)
for side,(shoulder,elbow,wrist) in arm_points.items():
    bone(side+".UpperArm",shoulder,elbow,"Spine")
    bone(side+".Forearm",elbow,wrist,side+".UpperArm",True)
    if side == "L":
        bone("L.Hand",wrist,wrist+Vector((0,0,-.13)),"L.Forearm",True)
bone("Cannon",gun_start.lerp(gun_end,.16),gun_end,"R.Forearm")
bone("Muzzle",gun_end,gun_end+gun_axis*.06,"Cannon",True)
bpy.ops.object.mode_set(mode="OBJECT")
rig.select_set(False)
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
model = bpy.context.object
model.name = "Lancer_Armor"
model.data.name = "Lancer · rigid-skinned plates"
model.parent = rig
deform = model.modifiers.new("Mechanical articulation", "ARMATURE")
deform.object = rig
rig.display_type = "WIRE"

# A small upper-body idle; hips and both feet remain planted.
rig.animation_data_create()
for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
for frame in range(49):
    phase = frame / 48 * math.tau
    rig.pose.bones["Spine"].rotation_euler.x = .007 * math.sin(phase)
    rig.pose.bones["Spine"].location.y = .003 * (1 - math.cos(phase))
    rig.pose.bones["Head"].rotation_euler.y = .025 * math.sin(phase)
    rig.pose.bones["L.Forearm"].rotation_euler.x = .01 * math.sin(phase)
    for name in ("Spine", "Head", "L.Forearm"):
        pose = rig.pose.bones[name]
        pose.keyframe_insert("rotation_euler", frame=frame, group=name)
        pose.keyframe_insert("location", frame=frame, group=name)
idle = rig.animation_data.action
idle.name = "Idle"
track = rig.animation_data.nla_tracks.new()
track.name = "Idle"
track.strips.new("Idle",0,idle)
rig.animation_data.action = None
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0,47
scene.frame_set(0)

# Pack the generated reference into the authoring project.
ref_image = bpy.data.images.load(str(HERE / "lancer-reference.png"))
ref_image.pack()
ref_image.filepath = "//lancer-reference.png"
ref = bpy.data.objects.new("REFERENCE · Lancer turnaround", None)
references.objects.link(ref)
ref.empty_display_type, ref.data = "IMAGE", ref_image
ref.empty_display_size = 2.6
ref.location, ref.rotation_euler = (-1.8, .4, 1), (math.pi/2,0,0)
references.hide_viewport = True

floor_mat = material("Studio · warm grey", "B8B8B2", 0, .9)
data = bpy.data.meshes.new("Studio ground")
data.from_pydata([(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[],[(0,1,2,3)])
floor = bpy.data.objects.new("Studio ground",data)
stage.objects.link(floor)
data.materials.append(floor_mat)
world = bpy.data.worlds.new("LANCER · soft studio")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.45,.48,.52,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .25
scene.world = world


def aim(obj,target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()


for name,pos,power,size,color in [
    ("Key",(-3,-4,5),450,4,(1,.94,.86)),
    ("Fill",(3,-1,3),230,3,(.85,.91,1)),
    ("Rim",(.5,3,4),500,3,(1,1,.97)),
]:
    data = bpy.data.lights.new(name,"AREA")
    data.energy,data.shape,data.size,data.color = power,"DISK",size,color
    obj = bpy.data.objects.new(name,data)
    stage.objects.link(obj)
    obj.location = pos
    aim(obj,(0,0,1))
for name,pos,target,scale in [
    ("Hero",(-2.7,-4.5,2.25),(0,-.035,.97),2.35),
    ("Front",(0,-5,.97),(0,0,.97),2.3),
    ("Side",(-5,0,.97),(0,0,.97),2.3),
    ("Top",(0,0,5),(0,0,0),1.25),
]:
    data = bpy.data.cameras.new("CAM · "+name)
    data.type,data.ortho_scale = "ORTHO",scale
    obj = bpy.data.objects.new("CAM · "+name,data)
    stage.objects.link(obj)
    obj.location=pos
    aim(obj,target)
scene.camera = bpy.data.objects["CAM · Hero"]
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x,scene.render.resolution_y = 1200,1400
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = str(HERE / "lancer-preview.png")
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
for obj in stage.objects:
    obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space=area.spaces.active
            space.shading.type="MATERIAL"
            space.overlay.show_extras=False
            space.region_3d.view_distance=3.2
            space.region_3d.view_location=(0,0,.97)
            space.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()

# Export only the model. The static alternative omits the skeleton entirely.
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
model.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active=model
bpy.ops.export_scene.gltf(filepath=str(OUT / "lancer.glb"), export_format="GLB", use_selection=True,
                          use_active_scene=True,export_apply=True,export_animations=True,export_frame_range=False,
                          export_animation_mode="NLA_TRACKS",export_nla_strips=True,export_skins=True,
                          export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
bpy.ops.object.select_all(action="DESELECT")
static_data=model.data.copy()
static=bpy.data.objects.new("Lancer_Instanced",static_data)
asset.objects.link(static)
static.select_set(True)
bpy.context.view_layer.objects.active=static
bpy.ops.export_scene.gltf(filepath=str(OUT / "lancer-instanced.glb"), export_format="GLB", use_selection=True,
                          use_active_scene=True,export_apply=True,export_animations=False,export_skins=False,
                          export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
bpy.data.objects.remove(static,do_unlink=True)
bpy.data.meshes.remove(static_data)
rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "lancer.blend"))
triangles=sum(len(face.vertices)-2 for face in model.data.polygons)
bpy.context.view_layer.update()
bounds=[model.matrix_world @ Vector(v) for v in model.bound_box]
dimensions=[max(p[i] for p in bounds)-min(p[i] for p in bounds) for i in range(3)]
result=dict(triangles=triangles,materials=2,bones=len(arm_data.bones),dimensions_m=dimensions,
            animations=["Idle"],rigged_bytes=(OUT / "lancer.glb").stat().st_size,
            instanced_bytes=(OUT / "lancer-instanced.glb").stat().st_size,
            blend=str((HERE / "lancer.blend").relative_to(ROOT)),glb=str((OUT / "lancer.glb").relative_to(ROOT)),
            instanced_glb=str((OUT / "lancer-instanced.glb").relative_to(ROOT)),front_axis="+Z in glTF",muzzle_bone="Muzzle")
(HERE / "asset-stats.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2),flush=True)
