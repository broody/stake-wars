"""Add mirrored T-pose arms through Blender Lab MCP in the existing file.

The approved body and shoulder pads are preserved. Reference coordinates use
384 px/m, -Y forward, with the arm axis at Z=-44 px. Hands deliberately omit
individual finger joints, knuckle plates and surface detailing.
"""
from pathlib import Path
import hashlib
import json
import math
import random
import runpy
import shutil
import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
S = 1 / 384
TAG = 'sector_trooper_arms_v1'
COLLECTION = '06 | ARMS - editable armor and gloves'
BODY_COLLECTIONS = ['01 | HEAD - editable armor parts',
                    '04 | TORSO - editable armor parts',
                    '05 | LEGS - editable armor and joints']
scene = bpy.context.scene
assert bpy.data.filepath.endswith('/sector-trooper/head/sector-trooper-head.blend')
assert bpy.context.mode == 'OBJECT'


def preserved_signature():
    records = []
    collections = BODY_COLLECTIONS + ['02 | STUDIO - cameras and lights']
    for name in collections:
        for obj in sorted(bpy.data.collections[name].objects, key=lambda o: o.name):
            if obj.name.startswith(('TROOPER CAM | Arm ', 'TROOPER CAM | Tpose ')):
                continue
            row = [obj.name, tuple(v for r in obj.matrix_world for v in r)]
            if obj.type == 'MESH':
                row.extend([[tuple(v.co) for v in obj.data.vertices],
                            [tuple(p.vertices) for p in obj.data.polygons],
                            [m.name for m in obj.data.materials],
                            [[tuple(v.color) for v in a.data] for a in obj.data.color_attributes],
                            [(m.name, m.type, getattr(m, 'thickness', None)) for m in obj.modifiers]])
            elif obj.type == 'CAMERA':
                row.extend([obj.data.lens, obj.data.ortho_scale])
            elif obj.type == 'LIGHT':
                row.extend([obj.data.energy, list(obj.data.color), obj.data.type])
            records.append(row)
    return hashlib.sha256(json.dumps(records).encode()).hexdigest()


bpy.context.view_layer.update()
before = preserved_signature()
old = bpy.data.collections.get(COLLECTION)
if old:
    assert globals().get('REPLACE_ARMS', False), 'Preserve manual arm edits before rebuilding.'
    assert old.get('generator') == TAG
    for obj in list(old.objects):
        assert len(obj.users_collection) == 1
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if isinstance(data, bpy.types.Mesh) and not data.users:
            bpy.data.meshes.remove(data)
    bpy.data.collections.remove(old)
asset = bpy.data.collections.new(COLLECTION)
scene.collection.children.link(asset)
asset['generator'] = TAG
root = bpy.data.objects.new('SectorTrooper_Arms', None)
asset.objects.link(root)
root.empty_display_size = .04
root['pose'] = 'T-pose, relaxed fists'
root['hand_detail'] = 'Single palm, four curled fingers and an outside tucked thumb'
ivory = bpy.data.materials['TROOPER | warm ivory armor']
black = bpy.data.materials['TROOPER | charcoal seals']
parts = []


def rgba(value):
    rgb = [int(value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def ring(x, ry, rz, cy=0, cz=-44):
    # Broad faces separated by restrained chamfers; no bevel modifier needed.
    profile = [(-.65, 1), (.65, 1), (1, .55), (1, -.55),
               (.65, -1), (-.65, -1), (-1, -.55), (-1, .55)]
    return [(x, cy + y * ry, cz + z * rz) for y, z in profile]


def loft(rows, caps=True):
    n = len(rows[0])
    verts = [v for row in rows for v in row]
    faces = []
    for j in range(len(rows) - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            c, d = b + n, a + n
            faces.extend([(a, b, c), (a, c, d)] if (j+i) % 2 else [(a, b, d), (b, c, d)])
    if caps:
        faces.extend([tuple(range(n-1, -1, -1)), tuple(range((len(rows)-1)*n, len(rows)*n))])
    return verts, faces


def add_part(label, side, geometry, pivot, armor=False, wall=0, seed=0):
    sign = 1 if side == 'left' else -1
    verts, faces = geometry
    origin = Vector((sign * pivot, 0, -44)) * S
    data = bpy.data.meshes.new('TROOPER ARMS | ' + label + ' ' + side)
    data.from_pydata([tuple(Vector((sign*x, y, z))*S-origin) for x,y,z in verts], [], faces)
    assert not data.validate(), (label, 'Mesh needed repair')
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if wall:
        top = max(bm.faces, key=lambda f: f.calc_center_median().z)
        if top.normal.z < 0:
            bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    assert all(e.is_manifold or (wall and e.is_boundary) for e in bm.edges)
    bm.to_mesh(data)
    bm.free()
    data.materials.append(ivory if armor else black)
    if armor:
        data.materials.append(black)
        attr = data.color_attributes.new(name='ArmorTone', type='FLOAT_COLOR', domain='CORNER')
        rng = random.Random(719 + seed)
        palette = ['D0C8BC', 'CEC6BA', 'CCC4B8', 'CFC7BB', 'D1C9BD']
        for face in data.polygons:
            tone = rgba(rng.choice(palette))
            for i in face.loop_indices:
                attr.data[i].color = tone
    obj = bpy.data.objects.new('ARMS | ' + label + ' ' + side, data)
    asset.objects.link(obj)
    obj.parent = root
    obj.location = origin
    obj['generator'] = TAG
    obj['side'] = side
    obj['pivot_px'] = [sign*pivot, 0, -44]
    if wall:
        mod = obj.modifiers.new('Armor wall thickness', 'SOLIDIFY')
        mod.thickness = wall * S
        mod.offset = -1
        mod.use_even_offset = True
        mod.material_offset_rim = 1
    parts.append(obj)
    return obj


glove_geometry = runpy.run_path(str(HERE/'glove_geometry.py'))['glove_geometry']
for side in ['left', 'right']:
    add_part('01 fitted upper arm', side, loft([
        ring(178, 25, 26), ring(185, 28, 28),
        ring(203, 23.5, 24), ring(207, 23, 23.5)]), 174)
    add_part('02 elbow joint', side, loft([
        ring(204, 22, 22), ring(208, 25, 25),
        ring(220, 25, 25), ring(227, 22.5, 22.5)]), 215)
    add_part('03 tapered forearm armor', side, loft([
        ring(222, 27.5, 28.5), ring(229, 33, 33),
        ring(249, 32.5, 34), ring(313, 25, 25),
        ring(318, 24, 24)], caps=False), 215, armor=True, wall=2.5)
    add_part('04 wrist seal', side, loft([
        ring(313, 16, 16), ring(318, 18, 18),
        ring(332, 17, 17), ring(339, 15, 15)]), 332)

    glove = add_part('05 simplified glove', side, glove_geometry(), 332)
    glove['finger_joints'] = 0
    glove['finger_count'] = 4
    glove['thumb_count'] = 1
    glove['hand_pose'] = 'Relaxed fist, thumb outside curled fingers'

bpy.context.view_layer.update()
assert preserved_signature() == before, 'Approved body or studio changed'
scene['arms_preserved_signature'] = before
scene['arms_revision'] = 1
scene['character_scope'] = 'Head, torso, belt-suspended pelvic plates, legs, boots and simplified T-pose arms'

reference = HERE / 'sector-trooper-arm-detail-reference.png'
source = globals().get('REFERENCE_SOURCE')
if not reference.exists():
    assert source and Path(source).is_file(), 'Supply the user arm reference path'
    shutil.copy2(source, reference)
image = bpy.data.images.load(str(reference), check_existing=True)
image.pack()
image.filepath = '//../arms/' + reference.name
ref_obj = bpy.data.objects.get('REFERENCE | detailed arm study')
if not ref_obj:
    ref_obj = bpy.data.objects.new('REFERENCE | detailed arm study', None)
    bpy.data.collections['03 | REFERENCE - original concept'].objects.link(ref_obj)
ref_obj.empty_display_type = 'IMAGE'
ref_obj.data = image
ref_obj.empty_display_size = 1.5
ref_obj.location = (1.7, 0, -.1)
ref_obj.hide_render = True
ref_obj.hide_set(True)

stage = bpy.data.collections['02 | STUDIO - cameras and lights']
def camera(label, target, offset, scale):
    name = 'TROOPER CAM | ' + label
    cam = bpy.data.objects.get(name)
    if not cam:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        stage.objects.link(cam)
    target = Vector(target)
    cam.location = target + Vector(offset)
    cam.rotation_euler = (target-cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = scale
    return cam

for label, offset in [('Front', (0,-6,0)), ('Top', (0,0,6)), ('Hero', (0,-6,3))]:
    camera('Arm '+label, (264*S,0,-33*S), offset, 1.08)
for label, offset in [('Front',(0,-6,0)), ('Hero',(-4,-6,1.3)),
                      ('Side',(-6,0,0)), ('Rear',(0,6,0))]:
    camera('Tpose '+label, (0,0,-124.5*S), offset, 2.64)
assert preserved_signature() == before
result = {'new_arm_meshes': len(parts), 'existing_body_and_cameras_unchanged': True,
          'reference_packed': bool(image.packed_file), 'pose': 'T-pose'}
