"""Build the Sector Trooper head in a NEW scene, via Blender MCP.

The attached front/side concept is the source of truth. Dimensions below use
reference pixels (384 px = 1 m); +Z is up, -Y is forward. Existing scenes are
never cleared. Only this generated scene is written to the standalone blend.
"""
from pathlib import Path
import json
import math
import random

import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
TAG = "sector_trooper_head_v1"
S = 1 / 384
if globals().get("REPLACE_GENERATED_SCENE", False):
    previous = bpy.data.scenes.get("SECTOR TROOPER | Head study")
    assert previous and previous.get("generator") == TAG
    assert not previous.collection.children.get("04 | TORSO - editable armor parts"), \
        "This file now includes a torso. Edit the head in place; do not rebuild the full scene."
    assert all(len(obj.users_scene) == 1 for obj in previous.objects)
    replacement = bpy.data.scenes.new("Trooper rebuild staging")
    bpy.context.window.scene = replacement
    for obj in list(previous.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(previous)
    for group in [bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.collections, bpy.data.worlds]:
        for block in list(group):
            if block.users == 0:
                group.remove(block)
scene = bpy.data.scenes.new("SECTOR TROOPER | Head study")
scene["generator"] = TAG
scene.unit_settings.system = "METRIC"
bpy.context.window.scene = scene
if globals().get("REPLACE_GENERATED_SCENE", False):
    bpy.data.scenes.remove(replacement)


def collection(name):
    value = bpy.data.collections.new(name)
    scene.collection.children.link(value)
    return value


asset = collection("01 | HEAD - editable armor parts")
stage = collection("02 | STUDIO - cameras and lights")
refs = collection("03 | REFERENCE - original concept")
refs.hide_render = True
parts = []


def rgba(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def material(name, color, roughness=.65, metallic=.05, emission=0, facets=False):
    value = bpy.data.materials.new("TROOPER | " + name)
    value.diffuse_color = rgba(color)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if facets:
        colors = value.node_tree.nodes.new("ShaderNodeVertexColor")
        colors.layer_name = "ArmorTone"
        value.node_tree.links.new(colors.outputs["Color"], bsdf.inputs["Base Color"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = rgba(color)
        bsdf.inputs["Emission Strength"].default_value = emission
    return value


ivory = material("warm ivory armor", "CEC6B8", facets=True)
black = material("charcoal seals", "20211F", .82)
visor = material("recessed smoked visor", "080A08", .72, .0)
visor.node_tree.nodes.get("Principled BSDF").inputs["Specular IOR Level"].default_value = .10
orange = material("amber painted stripe", "FF980A", .73, .0)
eye_rim = material("amber optic surround", "EA9917", .4, .1, .6)
eye = material("warm amber optic", "FFCA22", .45, .0, 1.8)


def mesh(name, vertices, faces, mat, thickness=0, tone_seed=0):
    data = bpy.data.meshes.new("TROOPER | " + name)
    data.from_pydata([tuple(c * S for c in v) for v in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(mat)
    if mat == ivory:
        attr = data.color_attributes.new(name="ArmorTone", type="FLOAT_COLOR", domain="CORNER")
        rng = random.Random(108 + tone_seed)
        palette = ["D1C9BD", "CEC6BA", "CBC3B7", "CFC7BB", "D3CCBF", "CDC5B9"]
        for face in data.polygons:
            color = rgba(rng.choice(palette))
            for loop in face.loop_indices:
                attr.data[loop].color = color
    for poly in data.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new("HEAD | " + name, data)
    obj["generator"] = TAG
    asset.objects.link(obj)
    if thickness:
        modifier = obj.modifiers.new("Armor wall thickness", "SOLIDIFY")
        modifier.thickness = thickness * S
        modifier.offset = -1
        modifier.use_even_offset = True
    parts.append(obj)
    return obj


def ring_point(angle, width, front, back, z):
    a = math.radians(angle)
    sn, cs = math.sin(a), math.cos(a)
    # Broad forehead planes, with a rounder rear dome.
    x = width * math.copysign(abs(sn) ** .80, sn)
    y = -(front if cs >= 0 else back) * math.copysign(abs(cs) ** .62, cs)
    return (x, y, z)


def loft(name, rows, mat=ivory, closed=False, thickness=2, seed=0):
    n = len(rows[0])
    vertices = [v for row in rows for v in row]
    faces = []
    for j in range(len(rows) - 1):
        for i in range(n if closed else n - 1):
            a, b = j * n + i, j * n + (i + 1) % n
            c, d = b + n, a + n
            if (j + i) % 2:
                faces.extend([(a, b, d), (b, c, d)])
            else:
                faces.extend([(a, b, c), (a, c, d)])
    return mesh(name, vertices, faces, mat, thickness, seed)


# Main crown: large, deliberately placed planar facets rather than subdivision.
angles = list(range(-180, 180, 15))
crown_rows = []
for width, front, back, z in [(98, 96, 108, 190), (67, 68, 85, 222), (35, 33, 53, 232)]:
    crown_rows.append([ring_point(a, width, front, back, z) for a in angles])
crown = loft("01 crown", crown_rows, closed=True, seed=1)
# Top gently ridged polygon, with a low summit rather than a pointed helmet.
top_ring = crown_rows[-1]
top = mesh("02 crown top", top_ring + [(0, 4, 237)],
           [(i, (i + 1) % 24, 24) for i in range(24)], ivory, 2, 2)

# The front brow stops cleanly above the eye slot.
front_angles = list(range(-60, 61, 15))
front_rows = [
    [ring_point(a, 98, 96, 108, 190) for a in front_angles],
    [ring_point(a, 106, 106, 116, 173) for a in front_angles],
    [ring_point(a, 116, 113, 123, 126) for a in front_angles],
]
brow = loft("03 overhanging brow", front_rows, seed=3)

# Flared rear shell. The lower rim is widened 15% from the first head pass,
# with a rearward kick below the temple. The crown and brow retain their fit.
# Forward edges expose a black joint beside the cheek assemblies.
rear_angles = list(range(60, 301, 15))
rear_rows = []
for row, (width, front, back, z) in enumerate([(98, 96, 108, 190), (116, 98, 124, 124), (154, 90, 146, 56)]):
    points = []
    for i, angle in enumerate(rear_angles):
        shift = (8 if i == 0 else -8 if i == len(rear_angles) - 1 else 0) * row / 2
        x, y, zz = ring_point(angle + shift, width, front, back, z)
        if row == 2:
            zz -= 13 * abs(math.cos(math.radians(angle)))
        points.append((x, y, zz))
    rear_rows.append(points)
rear = loft("04 flared side and rear shell", rear_rows, seed=4, thickness=3)

# Dark structural under-shell is recessed below the separate ivory plates.
inner_rows = []
for width, front, back, z in [(96, 84, 104, 188), (110, 92, 115, 121), (145, 75, 138, 44), (110, 60, 106, 25)]:
    inner_rows.append([ring_point(a, width, front, back, z) for a in angles])
loft("05 dark inner helmet", inner_rows, black, closed=True, thickness=2)

# Visor is a real recessed surface with side returns, not a painted black bar.
visor_x = [-106, -78, -43, 0, 43, 78, 106]
visor_rows = []
for z, depth in [(127, -104), (104, -104), (68, -95), (35, -87)]:
    visor_rows.append([(x, depth + 29 * (abs(x) / 106) ** 3, z) for x in visor_x])
loft("06 recessed visor", visor_rows, visor, thickness=2)

# Each cheek uses the reference silhouette: high outside corner, descending
# inner edge, central V cutout, and a broad chin with a vertical center seam.
cheek_vertices = [
    (0, -113, 54), (22, -117, 84), (104, -101, 105),
    (110, -88, 40), (19, -103, 0), (0, -107, 0),
    (57, -112, 75), (78, -103, 43), (42, -109, 22),
]
cheek_faces = [(0, 1, 6), (1, 2, 6), (2, 3, 7), (2, 7, 6),
               (6, 7, 8), (7, 3, 4), (7, 4, 8), (8, 4, 5),
               (0, 6, 8), (0, 8, 5)]
for side, label in [(-1, "right"), (1, "left")]:
    mesh("07 " + label + " cheek and chin", [(side*x, y, z) for x,y,z in cheek_vertices],
         cheek_faces, ivory, 3.0, 7)
    # Side cheek return follows the opening, leaving a visible temple seam.
    mesh("08 " + label + " cheek return", [
        (side*104, -101, 105), (side*110, -88, 40),
        (side*108, -48, 28), (side*105, -52, 100),
    ], [(0,1,2), (0,2,3)], ivory, 2.5, 8)

mesh("10 central black bridge", [(-22,-102,85),(0,-110,97),(22,-102,85),(0,-110,54)],
     [(0,1,3),(1,2,3)], black, 1.5)


def clip(poly, axis, boundary, keep_greater):
    result = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        ina = a[axis] >= boundary if keep_greater else a[axis] <= boundary
        inb = b[axis] >= boundary if keep_greater else b[axis] <= boundary
        if ina:
            result.append(a)
        if ina != inb:
            t = (boundary - a[axis]) / (b[axis] - a[axis])
            result.append(a.lerp(b, t))
    return result


# A thin painted ribbon clipped onto the EXACT crown triangles: no floating
# rectangular stripe, no texture atlas, and no extra subdivision of the helmet.
stripe_v, stripe_f = [], []
for obj in [crown, top, brow]:
    obj.data.calc_loop_triangles()
    for tri in obj.data.loop_triangles:
        poly = [obj.data.vertices[i].co.copy() / S for i in tri.vertices]
        for axis, boundary, greater in [(0,35,True),(0,57,False),(1,32,False),(2,143,True)]:
            if poly:
                poly = clip(poly, axis, boundary, greater)
        if len(poly) < 3:
            continue
        normal = tri.normal.copy()
        center = sum(poly, Vector()) / len(poly)
        if normal.dot(center - Vector((0,0,120))) < 0:
            normal.negate()
        start = len(stripe_v)
        stripe_v.extend([tuple(v + normal * .16) for v in poly])
        stripe_f.extend([(start, start+i, start+i+1) for i in range(1,len(poly)-1)])
stripe_f = [face for face in stripe_f if
            (Vector(stripe_v[face[1]])-Vector(stripe_v[face[0]])).cross(
                Vector(stripe_v[face[2]])-Vector(stripe_v[face[0]])).length > 1e-6]
stripe = mesh("11 offset amber crown stripe", stripe_v, stripe_f, orange)
# Clipped pieces are disconnected; orient each piece outward explicitly so
# backface-culling game renderers show the same painted ribbon as Blender.
bm = bmesh.new()
bm.from_mesh(stripe.data)
for face in bm.faces:
    if face.normal.dot(face.calc_center_median() - Vector((0,0,120*S))) < 0:
        face.normal_flip()
bm.to_mesh(stripe.data)
bm.free()


def rectangular_optic(name, x0, x1, z0, z1, y, mat, bevel=.8, depth=1):
    outline = [(x0+bevel,z0),(x1-bevel,z0),(x1,z0+bevel),(x1,z1-bevel),
               (x1-bevel,z1),(x0+bevel,z1),(x0,z1-bevel),(x0,z0+bevel)]
    vertices = [(x,y,z) for x,z in outline] + [(x,y+depth,z) for x,z in outline]
    faces = [tuple(range(8)), tuple(range(15,7,-1))]
    faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    return mesh(name, vertices, faces, mat)


rectangular_optic("12 single optic housing", -80,-45,105,122,-103.8,black,1.0,2)
rectangular_optic("13 amber optic rim", -78,-47,107,120,-106.4,eye_rim,.6,1)
rectangular_optic("14 amber optic lens", -76.5,-48.5,108.3,118.7,-107,eye,.25,.7)

# Only the small neck socket needed to understand the head attachment.
neck_angles = list(range(0,360,30))
loft("15 neck socket", [
    [(r*math.sin(math.radians(a)), 3+r*.92*math.cos(math.radians(a)), z) for a in neck_angles]
    for r,z in [(33,-26),(43,-13),(47,5),(52,43)]
], black, closed=True, thickness=4)

root = bpy.data.objects.new("SectorTrooper_Head", None)
asset.objects.link(root)
root.empty_display_type = "PLAIN_AXES"
root.empty_display_size = .07
root["forward"] = "-Y (Blender); +Z (glTF)"
root["scope"] = "Head only; no body, rig or animations"
for obj in parts:
    obj.parent = root

# Original source is packed into the .blend and available as image references.
source = bpy.data.images.load(str(HERE / "sector-trooper-reference.png"), check_existing=True)
source.pack()
reference = bpy.data.objects.new("REFERENCE | exact supplied front and side concept", None)
reference.empty_display_type = "IMAGE"
reference.data = source
reference.empty_display_size = 2.6
reference.location = (1.75,.3,.34)
reference.rotation_euler = (math.pi/2,0,0)
refs.objects.link(reference)
refs.hide_viewport = True


def camera(name, location, target, scale):
    data = bpy.data.cameras.new("TROOPER CAM | " + name)
    obj = bpy.data.objects.new("TROOPER CAM | " + name, data)
    stage.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.type = "ORTHO"
    data.ortho_scale = scale
    data.lens = 70
    return obj


front_cam = camera("Front", (0,-5,.274), (0,0,.274), .86)
camera("Side", (-5,0,.274), (0,0,.274), .86)
camera("Reference side", (-5,-3.3,.48), (0,0,.274), .9)
hero_cam = camera("Hero", (-3.8,-6,.95), (0,0,.29), .98)
camera("Rear", (0,5,.4), (0,0,.274), .86)


def area(name, location, energy, size, color):
    data = bpy.data.lights.new("TROOPER LIGHT | " + name, "AREA")
    data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
    obj = bpy.data.objects.new(data.name, data)
    stage.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0,0,.3))-obj.location).to_track_quat('-Z','Y').to_euler()


area("soft key", (-2,-3,3), 225, 3, (1,.97,.93))
area("soft fill", (2,-2,1.5), 100, 2.8, (.93,.96,1))
area("upper rim", (1,1.6,2), 270, 2, (1,.98,.95))
world = bpy.data.worlds.new("TROOPER | charcoal studio")
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs[0].default_value = (.035,.035,.033,1)
world.node_tree.nodes.get("Background").inputs[1].default_value = .45
scene.world = world
scene.camera = hero_cam
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200,1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Khronos PBR Neutral"
scene.render.film_transparent = False

# Restrained glow for the emissive eye in saved Cycles previews (Blender 5.2).
compositor = bpy.data.node_groups.new("TROOPER | subtle optic bloom", "CompositorNodeTree")
compositor.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
layers = compositor.nodes.new("CompositorNodeRLayers")
layers.scene = scene
glare = compositor.nodes.new("CompositorNodeGlare")
glare.inputs["Type"].default_value = "Fog Glow"
glare.inputs["Quality"].default_value = "High"
glare.inputs["Threshold"].default_value = 1.5
glare.inputs["Size"].default_value = .25
glare.inputs["Strength"].default_value = .28
output = compositor.nodes.new("NodeGroupOutput")
compositor.links.new(layers.outputs["Image"], glare.inputs["Image"])
compositor.links.new(glare.outputs["Image"], output.inputs["Image"])
scene.compositing_node_group = compositor

bpy.context.view_layer.update()
evaluated = bpy.context.evaluated_depsgraph_get()
triangles = 0
for obj in parts:
    evaluated_obj = obj.evaluated_get(evaluated)
    evaluated_mesh = evaluated_obj.to_mesh()
    evaluated_mesh.calc_loop_triangles()
    triangles += len(evaluated_mesh.loop_triangles)
    evaluated_obj.to_mesh_clear()

stats = {"asset":"Sector Trooper head", "generator":TAG, "triangles":triangles,
         "mesh_parts":len(parts), "materials":6, "blender_forward":"-Y", "blender_up":"Z",
         "helmet_height_m":237*S,"helmet_width_m":308*S,
         "reference":"sector-trooper-reference.png", "scope":"Head study only; no body or animation",
         "notes":["Single amber eye is intentional", "Stripe is offset toward character left",
                  "Rear surfaces are inferred from the supplied two views",
                  "Lower helmet rim widened about 15% with additional rear flare after review"]}
(HERE / "head-metadata.json").write_text(json.dumps(stats,indent=2)+"\n")
bpy.data.libraries.write(str(HERE / "sector-trooper-head.blend"), {scene}, path_remap='RELATIVE_ALL', compress=True)
result = {"file":str(HERE / "sector-trooper-head.blend"), **stats}
