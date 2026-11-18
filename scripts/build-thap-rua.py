"""Build the Hoan Kiem Turtle Tower as an original, measured Blender GLB.

Run: blender --background --factory-startup --python scripts/build-thap-rua.py

Sources and view-by-view comparison: docs/THAP_RUA_REFERENCES.md.
Photographs guide the geometry; no photograph or downloaded asset is embedded.
Blender is Z-up. glTF export is Y-up, with the three-arch east face toward +X.
"""

import math
import random
from array import array
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent
WORK = OUTPUT.parent / "work"
WORK.mkdir(parents=True, exist_ok=True)
GLB = ROOT / "public" / "models" / "thap-rua.glb"
ASSET = []

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0


def image_texture(name, filename, size, maker):
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.colorspace_settings.name = "sRGB"
    pixels = array("f")
    rng = random.Random(1886 if "stone" in name.lower() else 2026)
    for row in range(size):
        for col in range(size):
            pixels.extend((*maker(col / size, row / size, rng), 1.0))
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(WORK / filename)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def stone_color(u, v, rng):
    large = math.sin(u * 9.7 + math.cos(v * 11.3)) * 0.050
    large += math.sin(v * 17.1 - u * 5.8) * 0.031
    stains = max(0.0, math.sin(u * 37 + v * 8)) * 0.065
    stains += max(0.0, math.cos(u * 24 - v * 32)) * 0.055
    stains += max(0.0, math.sin(u * 12 - v * 19)) * 0.035
    grain = (rng.random() - 0.5) * 0.060
    patina = large + grain - stains
    return (0.64 + patina, 0.645 + patina, 0.61 + patina * 0.9)


def roof_color(u, v, rng):
    course = 0.055 if (v * 11) % 1 < 0.055 else 0
    variation = math.sin(u * 41 + v * 19) * 0.023 + (rng.random() - 0.5) * 0.065
    return (0.38 + variation - course, 0.375 + variation - course, 0.35 + variation - course)


def material(name, color, roughness, texture=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if texture:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = texture
        mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


wall_mat = material(
    "Weathered grey-ivory plaster", (0.65, 0.65, 0.61), 0.96,
    image_texture("Original stone wash", "thap-rua-stone.png", 384, stone_color),
)
trim_mat = material("Aged limestone mouldings", (0.57, 0.58, 0.55), 0.93)
shadow_mat = material("Darkened stone in recesses", (0.40, 0.42, 0.40), 0.98)
brick_mat = material("Weathered terrace brick", (0.43, 0.40, 0.37), 0.95)
tile_mat = material(
    "Old slate-grey roof tiles", (0.38, 0.38, 0.35), 0.93,
    image_texture("Original roof tiles", "thap-rua-roof.png", 256, roof_color),
)


def apply(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def box(name, dimensions, location, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Worn arris", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        apply(obj, modifier)
    ASSET.append(obj)
    return obj


def polygon_mesh(name, vertices, faces, mat, uvs=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if uvs:
        layer = mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            for index in poly.loop_indices:
                layer.data[index].uv = uvs[mesh.loops[index].vertex_index]
    ASSET.append(obj)
    return obj


def pointed_arch(center, half_width, base, spring, apex):
    # Rounded Gothic shoulders meet at a modest point, like the surviving openings.
    points = [(center - half_width, base), (center + half_width, base),
              (center + half_width, spring)]
    control_z = spring + (apex - spring) * 0.49
    for step in range(1, 9):
        t = step / 8
        h = ((1 - t) ** 2 * (center + half_width)
             + 2 * (1 - t) * t * (center + half_width * 0.68) + t * t * center)
        z = (1 - t) ** 2 * spring + 2 * (1 - t) * t * control_z + t * t * apex
        points.append((h, z))
    for step in range(1, 9):
        t = step / 8
        h = ((1 - t) ** 2 * center
             + 2 * (1 - t) * t * (center - half_width * 0.68)
             + t * t * (center - half_width))
        z = (1 - t) ** 2 * apex + 2 * (1 - t) * t * control_z + t * t * spring
        points.append((h, z))
    return points


def arch_cutter(name, axis, perpendicular, thickness, profile):
    count = len(profile)
    low = perpendicular - thickness * 2.5
    high = perpendicular + thickness * 2.5
    if axis == "Y":
        vertices = [(low, h, z) for h, z in profile] + [(high, h, z) for h, z in profile]
    else:
        vertices = [(h, low, z) for h, z in profile] + [(h, high, z) for h, z in profile]
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count)
              for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def pierced_wall(name, axis, perpendicular, span, base, height, openings):
    thickness = 0.29 if base < 3.4 else 0.25
    dims = ((thickness, span, height) if axis == "Y"
            else (span, thickness, height))
    loc = ((perpendicular, 0, base + height / 2) if axis == "Y"
           else (0, perpendicular, base + height / 2))
    wall = box(name, dims, loc, wall_mat)
    bay = span / openings
    for index in range(openings):
        center = -span / 2 + bay * (index + 0.5)
        profile = pointed_arch(center, bay * 0.27, base - 0.08,
                               base + height * 0.56, base + height * 0.90)
        cutter = arch_cutter(name + " cutter", axis, perpendicular, thickness, profile)
        modifier = wall.modifiers.new("Pierced Gothic opening", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = cutter
        apply(wall, modifier)
        bpy.data.objects.remove(cutter, do_unlink=True)
    modifier = wall.modifiers.new("Soft worn arch edge", "BEVEL")
    modifier.width = 0.017
    modifier.segments = 2
    apply(wall, modifier)


def arcade_tier(name, length, depth, base, height):
    for sign in (-1, 1):
        pierced_wall(name + " long facade", "Y", sign * depth / 2,
                     length, base, height, 3)
        pierced_wall(name + " short facade", "X", sign * length / 2,
                     depth, base, height, 2)
    # Narrow pilasters catch side light without whitening or widening the arches.
    for x in (-depth / 2, depth / 2):
        for y in (-length / 2, length / 2):
            box(name + " corner pilaster", (0.21, 0.21, height),
                (x, y, base + height / 2), trim_mat, 0.014)


def stone_balustrade(name, length, depth, base, height, spacing):
    # Short, closely spaced masonry slats between heavy corner posts.
    for x in (-depth / 2, depth / 2):
        box(name + " long coping", (0.10, length, 0.07),
            (x, 0, base + height), wall_mat, 0.012)
        count = round(length / spacing)
        for i in range(count + 1):
            y = -length / 2 + length * i / count
            width = 0.15 if i in (0, count) else 0.08
            box(name + " long baluster", (width, width, height - 0.03),
                (x, y, base + (height - 0.03) / 2), wall_mat, 0.009)
    for y in (-length / 2, length / 2):
        box(name + " short coping", (depth, 0.10, 0.07),
            (0, y, base + height), wall_mat, 0.012)
        count = round(depth / spacing)
        for i in range(1, count):
            x = -depth / 2 + depth * i / count
            box(name + " short baluster", (0.08, 0.08, height - 0.03),
                (x, y, base + (height - 0.03) / 2), wall_mat, 0.009)


def terrace_parapet(length, depth, base):
    # The first terrace in the photographs reads as a weathered low wall.
    for x in (-depth / 2, depth / 2):
        for i in range(7):
            y = -length / 2 + (i + 0.5) * length / 7
            box("First terrace masonry panel", (0.16, length / 7 - 0.10, 0.22),
                (x, y, base + 0.11), brick_mat, 0.009)
    for y in (-length / 2, length / 2):
        for i in range(5):
            x = -depth / 2 + (i + 0.5) * depth / 5
            box("First terrace masonry return", (depth / 5 - 0.10, 0.16, 0.22),
                (x, y, base + 0.11), brick_mat, 0.009)
    for x in (-depth / 2, depth / 2):
        for y in (-length / 2, length / 2):
            box("First terrace corner pier", (0.22, 0.22, 0.31),
                (x, y, base + 0.155), trim_mat, 0.014)


# Exact footprint of each inhabited tier, with visually lighter foundations.
box("Stone foundation lower course", (4.94, 6.68, 0.23),
    (0, 0, 0.115), shadow_mat, 0.035)
box("Stone foundation upper course", (4.70, 6.42, 0.35),
    (0, 0, 0.405), wall_mat, 0.035)
box("First floor sill", (4.62, 6.36, 0.11),
    (0, 0, 0.625), trim_mat, 0.014)

# Ground storey: 6.28 by 4.54 m.
arcade_tier("Ground storey", 6.28, 4.54, 0.68, 2.45)
box("Ground storey upper fascia", (4.77, 6.51, 0.12),
    (0, 0, 3.18), trim_mat, 0.017)
box("First terrace dark course", (4.91, 6.66, 0.11),
    (0, 0, 3.30), brick_mat, 0.016)
box("First terrace paving", (4.82, 6.56, 0.10),
    (0, 0, 3.405), trim_mat, 0.015)
terrace_parapet(6.37, 4.65, 3.46)

# Second storey: 4.80 by 3.64 m. Its set-back is substantial in both axes.
arcade_tier("Middle storey", 4.80, 3.64, 3.47, 2.06)
box("Second storey fascia", (3.83, 5.01, 0.105),
    (0, 0, 5.585), trim_mat, 0.013)
box("Upper terrace dark course", (3.95, 5.12, 0.10),
    (0, 0, 5.692), brick_mat, 0.014)
box("Upper terrace paving", (3.88, 5.04, 0.08),
    (0, 0, 5.78), trim_mat, 0.012)
stone_balustrade("Upper terrace", 4.94, 3.78, 5.82, 0.27, 0.34)

# Third storey: 2.97 by 1.90 m. Only the east face has a 0.68 m round opening.
chamber = box("Third storey oculus chamber", (1.90, 2.97, 1.38),
              (0, 0, 6.50), wall_mat, 0.014)
bpy.ops.mesh.primitive_cylinder_add(
    vertices=32, radius=0.34, depth=0.56,
    location=(0.83, 0, 6.47), rotation=(0, math.pi / 2, 0),
)
hole = bpy.context.object
hole.name = "East oculus cutter"
modifier = chamber.modifiers.new("Round east opening, 0.68 m", "BOOLEAN")
modifier.operation = "DIFFERENCE"
modifier.solver = "EXACT"
modifier.object = hole
apply(chamber, modifier)
bpy.data.objects.remove(hole, do_unlink=True)
box("Dark oculus interior", (0.015, 0.62, 0.62),
    (0.55, 0, 6.47), shadow_mat)
bpy.ops.mesh.primitive_torus_add(
    major_segments=32, minor_segments=6, major_radius=0.347,
    minor_radius=0.023, location=(0.958, 0, 6.47),
    rotation=(0, math.pi / 2, 0),
)
ring = bpy.context.object
ring.name = "Thin stone oculus arris"
ring.data.materials.append(trim_mat)
ASSET.append(ring)
for x in (-0.975, 0.975):
    for y in (-1.37, -0.78, 0.78, 1.37):
        box("Third storey engaged masonry strip", (0.075, 0.075, 1.18),
            (x, y, 6.48), wall_mat, 0.009)
for y in (-1.51, 1.51):
    for x in (-0.80, 0.80):
        box("Third storey side pilaster", (0.075, 0.065, 1.15),
            (x, y, 6.48), wall_mat, 0.008)

# Shallow masonry pediment over the real east-side round opening.
relief = []
for i in range(13):
    u = i / 12
    y = -0.54 + 1.08 * u
    z = 6.96 + 0.12 * math.sin(math.pi * u)
    relief.extend([(0.992, y, z - 0.023), (0.992, y, z + 0.023)])
relief_faces = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1)
                for i in range(12)]
polygon_mesh("Low carved pediment above oculus", relief, relief_faces, wall_mat)

# Historical east inscription; cast to mesh so the GLB has no font dependency.
bpy.ops.object.text_add(location=(1.002, 0, 7.095))
inscription = bpy.context.object
inscription.name = "Quy Son Thap stone inscription"
inscription.data.body = "QUY SON THAP"
inscription.data.align_x = "CENTER"
inscription.data.align_y = "CENTER"
inscription.data.size = 0.075
inscription.data.extrude = 0.002
inscription.rotation_euler = Vector((1, 0, 0)).to_track_quat("Z", "Y").to_euler()
bpy.ops.object.convert(target="MESH")
inscription = bpy.context.object
inscription.data.materials.append(shadow_mat)
ASSET.append(inscription)
box("Third storey cornice", (2.00, 3.08, 0.095),
    (0, 0, 7.23), trim_mat, 0.013)

# A tiny masonry lookout has one rounded arch per face; reference photos show
# open dark apertures immediately below the roof, rather than four bare posts.
box("Lookout weathered sill", (1.98, 2.10, 0.07),
    (0, 0, 7.30), shadow_mat, 0.012)


def lookout_wall(name, axis, perpendicular, span):
    thickness = 0.15
    base = 7.33
    height = 0.51
    dims = ((thickness, span, height) if axis == "Y"
            else (span, thickness, height))
    loc = ((perpendicular, 0, base + height / 2) if axis == "Y"
           else (0, perpendicular, base + height / 2))
    wall = box(name, dims, loc, wall_mat)
    half = 0.34
    spring = 7.56
    apex = 7.77
    profile = [(-half, base - 0.07), (half, base - 0.07), (half, spring)]
    for i in range(1, 13):
        angle = math.pi * i / 12
        profile.append((half * math.cos(angle),
                        spring + (apex - spring) * math.sin(angle)))
    cutter = arch_cutter(name + " rounded opening", axis,
                         perpendicular, thickness, profile)
    modifier = wall.modifiers.new("Open pavilion arch", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    apply(wall, modifier)
    bpy.data.objects.remove(cutter, do_unlink=True)


for sign in (-1, 1):
    lookout_wall("Lookout east-west wall", "Y", sign * 0.90, 1.90)
    lookout_wall("Lookout north-south wall", "X", sign * 0.95, 1.80)


def roof_height(x, y):
    ax = abs(x) / 1.24
    ay = abs(y) / 1.29
    hip = max(ax, max(0, (ay - 0.40) / 0.60))
    uplift = 0.18 * (ax * ay) ** 4
    return 8.38 - 0.32 * hip + uplift


def ancient_roof():
    # A real continuous four-sided roof surface, dark tiled and upturned at all corners.
    columns = rows = 16
    vertices = []
    uv = []
    faces = []
    for j in range(rows + 1):
        y = -1.29 + 2.58 * j / rows
        for i in range(columns + 1):
            x = -1.24 + 2.48 * i / columns
            vertices.append((x, y, roof_height(x, y)))
            uv.append((i / columns * 3.5, j / rows * 3.5))
            if i < columns and j < rows:
                a = j * (columns + 1) + i
                faces.append((a, a + 1, a + columns + 2, a + columns + 1))
    roof = polygon_mesh("Four-hip aged tile roof", vertices, faces, tile_mat, uv)
    roof.data.polygons.foreach_set("use_smooth", [True] * len(roof.data.polygons))
    modifier = roof.modifiers.new("Subtle tile thickness", "SOLIDIFY")
    modifier.thickness = 0.075
    apply(roof, modifier)
    return roof


ancient_roof()


def raised_corner(sx, sy):
    # Low, broad upturned ceramic ends; the roof plane supplies most of the curve.
    sections = [
        (1.11, 1.16, roof_height(sx * 1.11, sy * 1.16), 0.16),
        (1.27, 1.31, 8.27, 0.13),
        (1.33, 1.35, 8.40, 0.065),
    ]
    verts = []
    for px, py, z, width in sections:
        verts.extend([
            (sx * px - width, sy * py, z - 0.04),
            (sx * px + width, sy * py, z - 0.04),
            (sx * px, sy * py, z + 0.04),
        ])
    faces = []
    for step in range(len(sections) - 1):
        a = step * 3
        b = a + 3
        faces.extend([(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2),
                      (a + 2, b + 2, b, a)])
    faces.extend([(2, 1, 0), (6, 7, 8)])
    polygon_mesh("Upturned ceramic roof corner", verts, faces, tile_mat)


for sx in (-1, 1):
    for sy in (-1, 1):
        raised_corner(sx, sy)

# Small ridge cap and the raised central emblem visible in the reference photos.
box("Low roof ridge", (0.11, 1.52, 0.085),
    (0, 0, 8.38), tile_mat, 0.028)
bpy.ops.mesh.primitive_cylinder_add(
    vertices=16, radius=0.14, depth=0.065,
    location=(0, 0, 8.59), rotation=(0, math.pi / 2, 0),
)
emblem = bpy.context.object
emblem.name = "Small central roof emblem"
emblem.data.materials.append(trim_mat)
ASSET.append(emblem)
box("Emblem foot", (0.11, 0.10, 0.20),
    (0, 0, 8.47), tile_mat, 0.025)


# Merge by PBR material for four to five draw calls. GLB contains no island,
# preview lights, camera, or collision geometry.
groups = {}
for obj in ASSET:
    groups.setdefault(obj.data.materials[0].name, []).append(obj)
merged = []
for name, objects in groups.items():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")
    merged.append(obj)

corners = [obj.matrix_world @ Vector(corner) for obj in merged
           for corner in obj.bound_box]
max_height = max(point.z for point in corners)
assert 8.7 <= max_height <= 8.9, f"Unexpected tower height: {max_height:.3f} m"
bpy.ops.object.select_all(action="DESELECT")
for obj in merged:
    obj.select_set(True)
bpy.context.view_layer.objects.active = merged[0]
GLB.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(GLB), export_format="GLB", use_selection=True,
    export_yup=True, export_apply=True, export_texcoords=True,
    export_normals=True, export_materials="EXPORT",
)
triangles = sum(len(poly.vertices) - 2 for obj in merged
                for poly in obj.data.polygons)
print(f"THAP_RUA_GLB={GLB}")
print(f"THAP_RUA_BYTES={GLB.stat().st_size}")
print(f"THAP_RUA_TRIANGLES={triangles}")
print(f"THAP_RUA_HEIGHT_M={max_height:.3f}")
print(f"THAP_RUA_MATERIALS={','.join(groups)}")

# Four comparable renders. The water and islet below are preview-only.
water_mat = material("Preview lake", (0.18, 0.35, 0.33), 0.72)
grass_mat = material("Preview islet grass", (0.28, 0.39, 0.25), 0.98)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.18))
bpy.context.object.data.materials.append(water_mat)
bpy.ops.mesh.primitive_cylinder_add(
    vertices=56, radius=1, depth=0.20, location=(0, 0, -0.035)
)
islet = bpy.context.object
islet.name = "Preview-only natural island"
islet.scale = (8.5, 7.0, 1)
islet.data.materials.append(grass_mat)
bpy.ops.object.light_add(type="AREA", location=(10, -9, 17))
bpy.context.object.data.energy = 2200
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 9
bpy.ops.object.light_add(type="AREA", location=(-9, 8, 12))
bpy.context.object.data.energy = 1200
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 11
bpy.context.scene.world.use_nodes = True
background = bpy.context.scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.60, 0.66, 0.70, 1)
background.inputs["Strength"].default_value = 0.8
bpy.ops.object.camera_add()
camera = bpy.context.object
bpy.context.scene.camera = camera
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 22
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.resolution_x = 900
bpy.context.scene.render.resolution_y = 900


def preview(name, location, target, ortho_scale=None, lens=None, wide=False):
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    if ortho_scale:
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = ortho_scale
    else:
        camera.data.type = "PERSP"
        camera.data.lens = lens
    bpy.context.scene.render.resolution_x = 1200 if wide else 900
    bpy.context.scene.render.resolution_y = 700 if wide else 900
    path = OUTPUT / f"thap-rua-{name}.png"
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"THAP_RUA_RENDER_{name.upper()}={path}")


preview("east-long", (18, 0, 5.5), (0, 0, 4.35), ortho_scale=10.8)
preview("north-short", (0, 18, 5.5), (0, 0, 4.35), ortho_scale=10.8)
preview("oblique", (16, -16, 8.2), (0, 0, 4.25), ortho_scale=11.3)
preview("shore", (78, 4, 5.8), (0, 0, 4.1), lens=90, wide=True)
