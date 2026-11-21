"""Fit the Sector Trooper's saber to a clean Vanguard GLB export."""
import argparse
import json
import struct
from collections import defaultdict
from pathlib import Path


def read_glb(path):
    data = path.read_bytes()
    size, kind = struct.unpack_from("<I4s", data, 12)
    assert kind == b"JSON"
    return json.loads(data[20:20 + size]), bytearray(data[28 + size:])


def save_glb(path, model, binary):
    model["buffers"][0]["byteLength"] = len(binary)
    header = json.dumps(model, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    binary.extend(bytes(-len(binary) % 4))
    path.write_bytes(struct.pack("<4sIII4s", b"glTF", 2, 28 + len(header) + len(binary),
                                 len(header), b"JSON") + header
                     + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def equip(vanguard, trooper, output):
    model, binary = read_glb(vanguard)
    donor, source = read_glb(trooper)

    def read_values(index, fmt):
        accessor = donor["accessors"][index]
        view = donor["bufferViews"][accessor["bufferView"]]
        assert "byteStride" not in view
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        end = offset + accessor["count"] * struct.calcsize(fmt)
        return list(struct.iter_unpack(fmt, source[offset:end]))

    def write_values(values, fmt):
        kind, component_type = {"<3f": ("VEC3", 5126), "<H": ("SCALAR", 5123),
                                "<4B": ("VEC4", 5121)}[fmt]
        binary.extend(bytes(-len(binary) % 4))
        data = b"".join(struct.pack(fmt, *v) for v in values)
        view = dict(buffer=0, byteOffset=len(binary), byteLength=len(data),
                    target=34963 if kind == "SCALAR" else 34962)
        binary.extend(data)
        accessor = dict(bufferView=len(model["bufferViews"]), count=len(values),
                        type=kind, componentType=component_type)
        if kind == "VEC4":
            accessor["normalized"] = True
        if kind == "VEC3":
            accessor.update(min=list(map(min, zip(*values))), max=list(map(max, zip(*values))))
        model["bufferViews"].append(view)
        model["accessors"].append(accessor)
        return len(model["accessors"]) - 1

    # Batch the hilt's disconnected pieces by finish. Both rigs hold the
    # grip centre at zero and the new blade follows the original trail endpoints.
    parts = defaultdict(lambda: ([], [], []))
    for mesh in donor["meshes"]:
        if not mesh["name"].startswith("SABER | "):
            continue
        for primitive in mesh["primitives"]:
            finish = donor["materials"][primitive["material"]]["name"]
            part = "blade" if mesh["name"] == "SABER | energy blade" else finish
            positions, normals, indices = parts[part]
            start = len(positions)
            for x, y, z in read_values(primitive["attributes"]["POSITION"], "<3f"):
                positions.append((x, .158 + (y - .174) * (.837 / .946), z))
            normals.extend(read_values(primitive["attributes"]["NORMAL"], "<3f"))
            indices.extend((i + start,) for i, in read_values(primitive["indices"], "<H"))

    def lit(name, rgb, intensity):
        return dict(name=name, emissiveFactor=rgb,
                        extensions={"KHR_materials_emissive_strength": {"emissiveStrength": intensity}},
                        pbrMetallicRoughness=dict(baseColorFactor=[*rgb, 1], metallicFactor=0))

    ember = [1, .125, .018]
    primitives = []

    def add_part(positions, normals, indices, material):
        primitives.append(dict(attributes=dict(POSITION=write_values(positions, "<3f"),
                                               NORMAL=write_values(normals, "<3f")),
                               indices=write_values(indices, "<H"),
                               material=len(model["materials"])))
        model["materials"].append(material)

    blade, normals, indices = parts.pop("blade")
    for finish, geometry in parts.items():
        material = next(m for m in donor["materials"] if m["name"] == finish)
        if finish == "SABER | cyan energy":
            material = lit("Saber ignition ring", ember, 2)
        add_part(*geometry, material)
    add_part(blade, normals, indices, lit("Saber incandescent core", [1, .84, .61], 3))

    # Concentric back faces leave the white centre and the hand unobscured.
    # Batch all layers outside-in into one unlit draw. Vertex alpha tapers the
    # orange halo to zero even in the low-power chase renderer without bloom.
    glow, opacity, triangles = [], [], []
    reverse = [index for i in range(0, len(indices), 3)
               for index, in (indices[i], indices[i + 2], indices[i + 1])]
    for radius, alpha in [(3.4, 4), (2.95, 7), (2.55, 11), (2.20, 18),
                          (1.90, 29), (1.62, 49), (1.38, 82), (1.18, 130)]:
        start = len(glow)
        cap = .018 * (radius - 1)
        glow.extend((x * radius, y + cap * (y - .158) / .837, z * radius) for x, y, z in blade)
        opacity.extend([(255, 255, 255, alpha)] * len(blade))
        triangles.extend((start + i,) for i in reverse)
    primitives.append(dict(attributes=dict(POSITION=write_values(glow, "<3f"),
                                           COLOR_0=write_values(opacity, "<4B")),
                           indices=write_values(triangles, "<H"), material=len(model["materials"])))
    model["extensionsUsed"].append("KHR_materials_unlit")
    model["materials"].append(dict(name="Saber orange halo", alphaMode="BLEND",
                                   extensions={"KHR_materials_unlit": {}},
                                   pbrMetallicRoughness={"baseColorFactor": [1, .075, .006, 1]}))

    sword = next(n for n in model["nodes"] if n["name"] == "Vanguard_Sword")
    sword_index = model["nodes"].index(sword)
    rig = next(n for n in model["nodes"] if sword_index in n.get("children", []))
    rig["children"].remove(sword_index)
    rig["extras"].update(equipment="lightsaber", pose="Lightsaber equipped")
    socket = next(n for n in model["nodes"] if n["name"] == "weapon")
    socket.setdefault("children", []).append(sword_index)
    model["meshes"][sword["mesh"]] = dict(name="Vanguard Lightsaber", primitives=primitives)
    del sword["skin"]
    sword.update(name="Vanguard_Lightsaber", extras={"equipment": "lightsaber", "socket": "weapon"})
    save_glb(output, model, binary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("vanguard", "trooper", "output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    equip(args.vanguard, args.trooper, args.output)
