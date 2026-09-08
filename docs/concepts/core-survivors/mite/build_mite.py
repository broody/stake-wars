"""Build the Hollow Legion Mite in Blender 5.1+.

Run inside Blender (including through Blender Lab MCP). The generated asset
scene is separate from any existing scene. No third-party assets are required.
"""

from pathlib import Path
import json
import math

import bpy
import bmesh
from mathutils import Vector


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
GLB = ROOT / "apps/web/public/models/hollow-legion/mite.glb"
STATIC_GLB = GLB.with_name("mite-instanced.glb")
BLEND = HERE / "mite.blend"
SCALE = 0.45
TAG = "stakewars_mite_v1"

# Remove only this script's own previous generation when iterating.
for obj in list(bpy.data.objects):
    if obj.get("generator") == TAG:
        bpy.data.objects.remove(obj, do_unlink=True)
for scene in list(bpy.data.scenes):
    if scene.get("generator") == TAG:
        bpy.data.scenes.remove(scene)
for collection in list(bpy.data.collections):
    if collection.get("generator") == TAG:
        bpy.data.collections.remove(collection)

scene = bpy.data.scenes.new("MITE | Studio")
scene["generator"] = TAG
bpy.context.window.scene = scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.length_unit = "METERS"


def collection(name):
    c = bpy.data.collections.new(name)
    c["generator"] = TAG
    scene.collection.children.link(c)
    return c


asset = collection("01 · MITE — model & rig")
stage = collection("02 · Studio — cameras & lights")
references = collection("03 · References — packed image")
references.hide_render = True


def linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(hex_color):
    h = hex_color.lstrip("#")
    return tuple(linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)


def material(name, color, metal, roughness, emission=0, vertex_color=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba(color)
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = rgba(color)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = roughness
    if emission:
        p.inputs["Emission Color"].default_value = rgba(color)
        p.inputs["Emission Strength"].default_value = emission
    if vertex_color:
        p.inputs["Base Color"].default_value = (1, 1, 1, 1)
        v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        v.layer_name = "ArmorTone"
        mat.node_tree.links.new(v.outputs["Color"], p.inputs["Base Color"])
    return mat


armor = material("MITE · Graphite plates", "292C2E", .28, .64, vertex_color=True)
signal = material("MITE · Scarlet optical strip", "C21109", .1, .34, 1.1)
mats = [armor, signal]
# Surface variations share one shader and travel as vertex colors.
surface_colors = ["3B3D3F", "111416", "383D3F", "404446", "FFFFFF"]
tones = ["3B3D3F", "36383A", "424446", "3B3D3E"]
parts = []


def make_mesh(name, verts, faces, mat_index=0, bone="Body", face_tones=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    colors = mesh.color_attributes.new(name="ArmorTone", type="FLOAT_COLOR", domain="CORNER")
    for poly in mesh.polygons:
        poly.material_index = 1 if mat_index == 4 else 0
        color = face_tones[poly.index % len(face_tones)] if face_tones else surface_colors[mat_index]
        base_tint = rgba(color)
        tint = tuple(c * (.5 if mat_index == 0 else 1) for c in base_tint[:3]) + (1,)
        for loop in poly.loop_indices:
            colors.data[loop].color = tint if poly.material_index == 0 else (1, 1, 1, 1)
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    obj["generator"] = TAG
    asset.objects.link(obj)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    parts.append(obj)
    return obj


def loft(name, levels, width_depth, start, end, bone, mat_index=0, sides=4):
    a, b = Vector(start), Vector(end)
    length = (b - a).length
    q = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    verts, faces = [], []
    for t, (width, depth) in zip(levels, width_depth):
        w, d = width / 2, depth / 2
        ring = [(-w, -d), (w, -d), (w, d), (-w, d)] if sides == 4 else [
            (-w * .65, -d), (w * .65, -d), (w, 0),
            (w * .65, d), (-w * .65, d), (-w, 0)]
        verts.extend(tuple(a + q @ Vector((x, y, t * length))) for x, y in ring)
    faces.append(tuple(reversed(range(sides))))
    for r in range(len(levels) - 1):
        for i in range(sides):
            faces.append((r * sides + i, r * sides + (i + 1) % sides,
                          (r + 1) * sides + (i + 1) % sides, (r + 1) * sides + i))
    faces.append(tuple((len(levels) - 1) * sides + i for i in range(sides)))
    return make_mesh(name, verts, faces, mat_index, bone, face_tones=tones)


def cylinder(name, center, axis, radius, depth, bone, mat_index=2, count=6):
    c, axis = Vector(center), Vector(axis).normalized()
    q = Vector((0, 0, 1)).rotation_difference(axis)
    verts = [tuple(c + q @ Vector((radius * math.cos(i * 2 * math.pi / count),
                                  radius * math.sin(i * 2 * math.pi / count), z)))
             for z in (-depth / 2, depth / 2) for i in range(count)]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count))
    return make_mesh(name, verts, faces, mat_index, bone)


def diamond(r, z):
    return [(0, -r, z), (r, 0, z), (0, r, z), (-r, 0, z)]


# Four broad roof triangles; no bevel strips or hidden internal caps.
roof_verts = diamond(.70, .94) + [(0, 0, 1.39)]
roof_faces = [(i, (i + 1) % 4, 4) for i in range(4)]
make_mesh("Pyramidal carapace", roof_verts, roof_faces,
          face_tones=["404244", "37393B", "343638", "46484A"])

ring = diamond(.70, .94) + diamond(.642, .861)
make_mesh("Overhanging armor rim", ring,
          [(i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4) for i in range(4)],
          face_tones=["282B2D", "2D3032", "2B2D30", "303335"])


def radius_at(z):
    return .065 + (.642 - .065) * (z - .355) / (.861 - .355)


def front_point(sign, u, z, inset=0):
    r = radius_at(z)
    return (sign * u * r, -(1 - u) * r + inset, z)


# The two forward chassis facets have actual holes for the inset visor.
for sign in (-1, 1):
    vertices, faces = [], []
    zs, us = [.355, .725, .809, .861], [0, .35, 1]
    for z in zs:
        for u in us:
            vertices.append(front_point(sign, u, z))
    for row in range(3):
        for col in range(2):
            if row == 1 and col == 0:
                continue
            n = row * 3 + col
            faces.append((n, n + 1, n + 4, n + 3))
    make_mesh("Forward chassis facet " + str(sign), vertices, faces,
              face_tones=["303335", "343638", "383A3C", "343638", "2D3032"])
    # Keep the recessed red signal: it carries the face at gameplay scale.
    outline = [front_point(sign, u, z) for u, z in [(0, .725), (.35, .725), (.35, .809), (0, .809)]]
    inset = [front_point(sign, u, z, .032) for u, z in [(0, .725), (.35, .725), (.35, .809), (0, .809)]]
    make_mesh("Visor cavity " + str(sign), outline + inset,
              [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)], mat_index=1)
    lens = [front_point(sign, u, z, .024) for u, z in [(0, .747), (.294, .750), (.308, .789), (0, .791)]]
    make_mesh("Scarlet visor " + str(sign), lens, [(0, 1, 2, 3)], mat_index=4)

rear_verts = diamond(.642, .861) + diamond(.065, .355)
make_mesh("Rear chassis facets", rear_verts, [(1, 2, 6, 5), (2, 3, 7, 6), (4, 5, 6, 7)],
          face_tones=["303335", "343638", "212426"])

# Four legs. Both joints and armor are rigid-weighted to a small skeleton.
legs = {}
for name, sx, sy in [("FL", -1, -1), ("FR", 1, -1), ("RL", -1, 1), ("RR", 1, 1)]:
    hip = Vector((sx * .315, sy * .315, .691))
    knee = Vector((sx * (.65 if sy < 0 else .54), sy * .63, .777 if sy < 0 else .705))
    toe = Vector((sx * (.98 if sy < 0 else .80), sy * .965, .045))
    axis = Vector((-sy, sx, 0)).normalized()
    upper_bone, lower_bone = name + ".Upper", name + ".Lower"
    legs[name] = (hip, knee, toe)
    cylinder(name + " hip pivot", hip, axis, .116, .225, upper_bone, 1)
    inner = hip + (knee - hip) * .16
    outer = hip + (knee - hip) * .84
    loft(name + " femur armor", [0, 1], [(.19, .20), (.166, .17)],
         inner, outer, upper_bone)
    cylinder(name + " knee pivot", knee, axis, .107, .238, lower_bone, 2)
    # One tapered six-sided blade replaces knee plates, shin bevels, and toe parts.
    shin_start = knee + (toe - knee) * .06
    loft(name + " tapered shin", [0, .38, 1], [(.228, .21), (.194, .167), (.048, .07)],
         shin_start, toe + Vector((0, 0, -.017)), lower_bone, sides=6)

# Rigid skinning keeps the assembled model to one mesh, with ten useful bones.
arm_data = bpy.data.armatures.new("MITE · mechanical skeleton")
rig = bpy.data.objects.new("Mite", arm_data)
asset.objects.link(rig)
rig["generator"] = TAG
rig["asset"] = "Hollow Legion / 01 Mite"
rig["front_axis"] = "-Y in Blender; +Z in glTF"
rig["height_meters"] = 1.39 * SCALE
rig["notes"] = "Swarm revision: broad facets, simple hinges, two materials. Separate static export for instancing."
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
root_bone = arm_data.edit_bones.new("Root")
root_bone.head, root_bone.tail = (0, 0, 0), (0, 0, .2)
body_bone = arm_data.edit_bones.new("Body")
body_bone.head, body_bone.tail = (0, 0, .68), (0, 0, 1.0)
body_bone.parent = root_bone
for name, (hip, knee, toe) in legs.items():
    upper = arm_data.edit_bones.new(name + ".Upper")
    upper.head, upper.tail, upper.parent = hip, knee, body_bone
    lower = arm_data.edit_bones.new(name + ".Lower")
    lower.head, lower.tail, lower.parent = knee, toe, upper
    lower.use_connect = True
bpy.ops.object.mode_set(mode="OBJECT")
rig.select_set(False)

for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh_obj = bpy.context.object
mesh_obj.name = "Mite_Armor"
mesh_obj.data.name = "Mite · rigid-skinned plates"
mesh_obj.parent = rig
deform = mesh_obj.modifiers.new("Mechanical articulation", "ARMATURE")
deform.object = rig
rig.scale = (SCALE,) * 3
rig.show_in_front = False
rig.display_type = "WIRE"

# A restrained idle loop for the optional rigged export.
# Motion is deliberately small so the reference pose is always readable.
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 49
rig.animation_data_create()
for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
for frame, offset in [(1, 0), (13, .013), (25, 0), (37, -.008), (49, 0)]:
    rig.pose.bones["Body"].location = (0, offset, 0)
    rig.pose.bones["Body"].keyframe_insert("location", frame=frame, group="Body")
    for name in legs:
        for segment in ("Upper", "Lower"):
            pose = rig.pose.bones[name + "." + segment]
            pose.rotation_euler = (0, 0, 0)
            pose.keyframe_insert("rotation_euler", frame=frame, group=name)
idle = rig.animation_data.action
idle.name = "Idle"
track = rig.animation_data.nla_tracks.new()
track.name = "Idle"
strip = track.strips.new("Idle", 1, idle)
track.mute = False
rig.animation_data.action = None
scene.frame_set(1)

# A reference sheet lives in the Blender project and is omitted from exports.
ref_image = bpy.data.images.load(str(HERE / "mite-reference.png"), check_existing=True)
ref_image.pack()
ref_image.filepath = "//mite-reference.png"
ref = bpy.data.objects.new("REFERENCE · Mite turnaround", None)
references.objects.link(ref)
ref["generator"] = TAG
ref.empty_display_type = "IMAGE"
ref.data = ref_image
ref.empty_display_size = 1.7
ref.location = (-1.45, .9, .7)
ref.rotation_euler = (math.pi / 2, 0, 0)
ref.color[3] = .8
ref.hide_render = True
references.hide_viewport = True

# Studio scene, separate from the game-export selection.
floor_mat = material("Studio · warm grey", "B8B8B2", 0, .9)
floor_mesh = bpy.data.meshes.new("Studio ground")
floor_mesh.from_pydata([(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[],[(0,1,2,3)])
floor = bpy.data.objects.new("Studio ground", floor_mesh)
floor["generator"] = TAG
stage.objects.link(floor)
floor.data.materials.append(floor_mat)

world = bpy.data.worlds.new("MITE · soft studio")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.45, .48, .52, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .24
scene.world = world


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area_light(name, pos, power, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size, data.color = power, "DISK", size, color
    obj = bpy.data.objects.new(name, data)
    obj["generator"] = TAG
    stage.objects.link(obj)
    obj.location = pos
    aim(obj, (0, 0, .25))
    return obj


area_light("Key · large softbox", (-2.1,-2.6,3.8), 260, 3.0, (1,.94,.86))
area_light("Fill · broad neutral", (2.6,-.5,2), 125, 2.7, (.85,.91,1))
area_light("Rim · roof facets", (.3,2.2,3.2), 320, 2.2, (1,1,.97))


def camera(name, loc, target, scale):
    data = bpy.data.cameras.new(name)
    data.type, data.ortho_scale, data.lens = "ORTHO", scale, 65
    obj = bpy.data.objects.new(name, data)
    obj["generator"] = TAG
    stage.objects.link(obj)
    obj.location = loc
    aim(obj, target)
    return obj


hero = camera("CAM · Hero", (1.9,-3.8,1.8), (0,0,.295), 1.72)
camera("CAM · Front", (0,-4,.30), (0,0,.30), 1.4)
camera("CAM · Top", (0,0,4), (0,0,0), 1.42)
camera("CAM · Side", (4,0,.30), (0,0,.30), 1.4)
scene.camera = hero
scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.render.filepath = str(HERE / "mite-preview.png")
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0

# Present a clean material viewport. The studio helpers do not obstruct modeling.
for obj in stage.objects:
    obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.shading.use_scene_world = False
            space.shading.use_scene_lights = False
            space.overlay.show_extras = False
            space.region_3d.view_distance = 1.75
            space.region_3d.view_location = (0, 0, .31)
            space.region_3d.view_rotation = hero.rotation_euler.to_quaternion()

bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_obj

GLB.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True, use_active_scene=True,
                          export_apply=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_nla_strips=True, export_skins=True, export_yup=True,
                          export_extras=True, export_cameras=False, export_lights=False)

# A rest-pose export with scale baked into the geometry can share two
# InstancedMesh batches (armor + visor) without per-enemy skeletons.
bpy.context.view_layer.update()
static_data = mesh_obj.data.copy()
static_data.transform(mesh_obj.matrix_world)
static_obj = bpy.data.objects.new("Mite_Instanced", static_data)
asset.objects.link(static_obj)
static_obj["asset"] = "Hollow Legion / 01 Mite / static swarm mesh"
static_obj["front_axis"] = "-Y in Blender; +Z in glTF"
bpy.ops.object.select_all(action="DESELECT")
static_obj.select_set(True)
bpy.context.view_layer.objects.active = static_obj
bpy.ops.export_scene.gltf(filepath=str(STATIC_GLB), export_format="GLB", use_selection=True, use_active_scene=True,
                          export_apply=True, export_animations=False, export_skins=False,
                          export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
bpy.data.objects.remove(static_obj, do_unlink=True)
bpy.data.meshes.remove(static_data)
rig.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_obj

save_versions = bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
finally:
    bpy.context.preferences.filepaths.save_version = save_versions
evaluated = mesh_obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
triangles = sum(len(p.vertices) - 2 for p in evaluated.data.polygons)
bounds = [mesh_obj.matrix_world @ Vector(p) for p in mesh_obj.bound_box]
dimensions = [max(p[i] for p in bounds) - min(p[i] for p in bounds) for i in range(3)]
result = {"blend": str(BLEND.relative_to(ROOT)), "glb": str(GLB.relative_to(ROOT)),
          "instanced_glb": str(STATIC_GLB.relative_to(ROOT)), "triangles": triangles,
          "materials": len(mesh_obj.data.materials), "bones": len(arm_data.bones),
          "dimensions_m": dimensions, "scene": scene.name,
          "previous_triangles": 4972, "triangle_reduction_percent": round((1 - triangles / 4972) * 100, 2),
          "rigged_bytes": GLB.stat().st_size, "instanced_bytes": STATIC_GLB.stat().st_size}
(HERE / "asset-stats.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))

# Keep the complete asset reproducible, including movement and LeapAttack.
import runpy
result.update(runpy.run_path(str(HERE / "animate_mite.py"))["result"])
