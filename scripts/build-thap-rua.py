"""Build an original, reference-informed Turtle Tower GLB with Blender 5.3.

Run: blender --background --factory-startup --python scripts/build-thap-rua.py
The source photographs are references only; no downloaded image is embedded.
Blender Z-up is converted to glTF Y-up. The facade faces local +X.
"""

import math
import random
from array import array
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent.parent / "work"
WORK.mkdir(parents=True, exist_ok=True)
GLB = ROOT / "public" / "models" / "thap-rua.glb"
PREVIEW = ROOT.parent / "thap-rua-preview.png"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0
ASSET = []


def stone_image():
    size = 384
    image = bpy.data.images.new("Original weathered limestone", width=size, height=size, alpha=True)
    image.colorspace_settings.name = "sRGB"
    rng = random.Random(1886)
    pixels = array("f")
    for py in range(size):
        v = py / size
        for px in range(size):
            u = px / size
            grain = (rng.random() - 0.5) * 0.085
            cloudy = math.sin(u * 21 + math.sin(v * 17) * 2) * 0.026
            cloudy += math.sin(v * 31 - u * 9) * 0.018
            stain = 0.045 * max(0.0, (0.22 - v) / 0.22)
            stain += 0.026 * max(0.0, math.sin(u * 47 + v * 8)) * max(0.0, 0.5 - v)
            value = grain + cloudy - stain
            pixels.extend((0.67 + value, 0.65 + value, 0.58 + value * 0.9, 1.0))
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(WORK / "thap-rua-limestone.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def material(name, color, roughness=0.9, image=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if image:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


wall_mat = material("Limestone · stained limewash", (0.69, 0.67, 0.61), 0.93, stone_image())
trim_mat = material("Limestone · worn cornices", (0.60, 0.59, 0.54), 0.91)
ledge_mat = material("Aged dark stone · ledges", (0.42, 0.43, 0.40), 0.95)
crest_mat = material("Weathered grey crest", (0.42, 0.42, 0.39), 0.96)


def apply(obj, mod):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def box(name, dims, location, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Soft masonry arris", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        apply(obj, mod)
    ASSET.append(obj)
    return obj


def arch_profile(center, half, bottom, spring, top):
    pts = [(center - half, bottom), (center + half, bottom), (center + half, spring)]
    control_z = spring + (top - spring) * 0.28
    for i in range(1, 9):
        t = i / 8
        h = (1 - t) ** 2 * (center + half) + 2 * (1 - t) * t * (center + half * 0.8) + t * t * center
        z = (1 - t) ** 2 * spring + 2 * (1 - t) * t * control_z + t * t * top
        pts.append((h, z))
    for i in range(1, 9):
        t = i / 8
        h = (1 - t) ** 2 * center + 2 * (1 - t) * t * (center - half * 0.8) + t * t * (center - half)
        z = (1 - t) ** 2 * top + 2 * (1 - t) * t * control_z + t * t * spring
        pts.append((h, z))
    return pts


def arch_cutter(name, axis, perp, thickness, profile):
    n = len(profile)
    lo, hi = perp - thickness * 2.5, perp + thickness * 2.5
    if axis == "Y":
        verts = [(lo, h, z) for h, z in profile] + [(hi, h, z) for h, z in profile]
    else:
        verts = [(h, lo, z) for h, z in profile] + [(h, hi, z) for h, z in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def trim_curve(name, axis, perp, profile, bevel=0.055):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(profile) - 1)
    for point, (h, z) in zip(spline.points, profile):
        point.co = ((perp, h, z, 1) if axis == "Y" else (h, perp, z, 1))
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.data.materials.append(trim_mat)
    ASSET.append(obj)


def arcade_wall(name, axis, perp, span, thick, bottom, height, openings):
    dims = (thick, span, height) if axis == "Y" else (span, thick, height)
    loc = (perp, 0, bottom + height / 2) if axis == "Y" else (0, perp, bottom + height / 2)
    wall = box(name, dims, loc, wall_mat)
    bay = span / openings
    for i in range(openings):
        center = -span / 2 + bay * (i + 0.5)
        profile = arch_profile(center, bay * 0.315, bottom - 0.15, bottom + height * 0.51, bottom + height * 0.86)
        cutter = arch_cutter(name + " arch cutter", axis, perp, thick, profile)
        mod = wall.modifiers.new("Pointed arch", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cutter
        apply(wall, mod)
        bpy.data.objects.remove(cutter, do_unlink=True)
        outer = 1 if perp > 0 else -1
        trim_curve(name + " carved reveal", axis, perp + outer * (thick / 2 + 0.045), profile[2:])
    mod = wall.modifiers.new("Worn arch edges", "BEVEL")
    mod.width = 0.038
    mod.segments = 2
    apply(wall, mod)
    return wall


def tier(name, depth, width, bottom, height):
    thick = 0.39
    for sign in (-1, 1):
        arcade_wall(name + (" east" if sign > 0 else " west"), "Y", sign * depth / 2, width, thick, bottom, height, 3)
        arcade_wall(name + (" south" if sign > 0 else " north"), "X", sign * width / 2, depth, thick, bottom, height, 2)
    for x in (-depth / 2, depth / 2):
        for y in (-width / 2, width / 2):
            box(name + " corner pier", (0.47, 0.47, height), (x, y, bottom + height / 2), trim_mat, 0.025)
            box(name + " pier capital", (0.62, 0.62, 0.17), (x, y, bottom + height - 0.08), ledge_mat, 0.02)


# Profile follows the photographs: broad pointed arcade, narrower arcade, then a solid oculus chamber.
box("Two step islet footing", (8.15, 10.0, 0.24), (0, 0, 0.12), ledge_mat, 0.065)
box("Raised stone plinth", (7.65, 9.55, 0.51), (0, 0, 0.47), trim_mat, 0.075)
box("First tier sill", (7.24, 9.16, 0.14), (0, 0, 0.76), ledge_mat, 0.025)
tier("Ground arcade", 6.85, 8.85, 0.81, 3.13)
box("Lower cornice dark lip", (7.7, 9.65, 0.20), (0, 0, 4.02), ledge_mat, 0.06)
box("Lower cornice pale band", (7.42, 9.37, 0.22), (0, 0, 4.25), trim_mat, 0.04)
box("First terrace paving", (6.8, 8.8, 0.18), (0, 0, 4.43), ledge_mat, 0.035)
tier("Upper arcade", 5.67, 7.55, 4.53, 2.58)
box("Upper arcade frieze", (6.28, 8.18, 0.22), (0, 0, 7.17), trim_mat, 0.035)
box("Upper cornice shadow", (6.55, 8.46, 0.14), (0, 0, 7.36), ledge_mat, 0.045)
box("Upper terrace deck", (6.45, 8.32, 0.16), (0, 0, 7.52), trim_mat, 0.03)

# A light balustrade around the third level gives the characteristic stepped skyline.
for x in (-3.0, 3.0):
    box("Balustrade long rail", (0.20, 8.00, 0.14), (x, 0, 8.22), trim_mat, 0.025)
    for y in (-3.75, -2.85, -1.95, -1.05, 1.05, 1.95, 2.85, 3.75):
        box("Balustrade pier", (0.19, 0.19, 0.55), (x, y, 7.88), trim_mat, 0.018)
for y in (-3.88, 3.88):
    box("Balustrade short rail", (6.0, 0.20, 0.14), (0, y, 8.22), trim_mat, 0.025)
    for x in (-2.75, -1.7, -0.65, 0.65, 1.7, 2.75):
        box("Balustrade return pier", (0.19, 0.19, 0.55), (x, y, 7.88), trim_mat, 0.018)

# Upper oculus chamber. The circle is an actual opening through the mesh.
chamber = box("Top oculus chamber", (3.56, 4.85, 2.18), (0, 0, 8.72), wall_mat)
bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.43, depth=5.2, location=(0, 0, 8.82), rotation=(0, math.pi / 2, 0))
oculus = bpy.context.object
oculus.name = "Oculus cutter"
mod = chamber.modifiers.new("Round oculus", "BOOLEAN")
mod.operation = "DIFFERENCE"
mod.solver = "EXACT"
mod.object = oculus
apply(chamber, mod)
bpy.data.objects.remove(oculus, do_unlink=True)
mod = chamber.modifiers.new("Soft oculus edge", "BEVEL")
mod.width = 0.045
mod.segments = 2
apply(chamber, mod)
for x in (-1.81, 1.81):
    bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=8, location=(x, 0, 8.82), rotation=(0, math.pi / 2, 0), major_radius=0.45, minor_radius=0.055)
    ring = bpy.context.object
    ring.name = "Carved round window frame"
    ring.data.materials.append(trim_mat)
    ASSET.append(ring)
box("Top frieze", (4.16, 5.46, 0.23), (0, 0, 9.91), trim_mat, 0.04)
box("Crown shadow line", (4.52, 5.83, 0.15), (0, 0, 10.12), ledge_mat, 0.045)
box("Crown parapet", (4.25, 5.50, 0.56), (0, 0, 10.47), crest_mat, 0.06)
box("Crown coping", (4.61, 5.86, 0.15), (0, 0, 10.81), trim_mat, 0.055)
for x in (-2.28, 2.28):
    box("Carved crest front", (0.27, 4.94, 0.44), (x, 0, 11.10), crest_mat, 0.045)

for x in (-2.10, 2.10):
    for y in (-2.72, 2.72):
        box("Crown corner finial", (0.34, 0.34, 0.52), (x, y, 11.10), crest_mat, 0.045)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.17, location=(x, y, 11.39))
        finial = bpy.context.object
        finial.name = "Crown ball finial"
        finial.data.materials.append(crest_mat)
        ASSET.append(finial)

# Restrained scroll crest: these raised curves read as the real tower's sculpted roofline from the shore.
for sign in (-1, 1):
    points = []
    for i in range(11):
        t = i / 10
        y = sign * (0.34 + t * 2.42)
        z = 11.18 + 0.38 * math.sin(math.pi * t) + 0.34 * t * t
        points.append((y, z))
    trim_curve("Sculpted crest scroll", "Y", 2.24, points, 0.12)
    trim_curve("Rear crest scroll", "Y", -2.24, points, 0.12)
box("Central crest base", (3.2, 1.35, 0.33), (0, 0, 11.18), crest_mat, 0.07)
bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=0.38, location=(0, 0, 11.56))
central = bpy.context.object
central.name = "Central carved finial"
central.scale = (0.72, 0.72, 1.25)
central.data.materials.append(crest_mat)
ASSET.append(central)

# UV-map and merge by material to keep draw calls low. The wall texture is authored here, not copied from photos.
merged = []
groups = {}
for obj in ASSET:
    groups.setdefault(obj.data.materials[0].name, []).append(obj)
for name, group in groups.items():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in group:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")
    merged.append(obj)

bpy.ops.object.select_all(action="DESELECT")
for obj in merged:
    obj.select_set(True)
bpy.context.view_layer.objects.active = merged[0]
GLB.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials="EXPORT")

triangles = sum(len(poly.vertices) - 2 for obj in merged for poly in obj.data.polygons)
print(f"THAP_RUA_GLB={GLB}")
print(f"THAP_RUA_BYTES={GLB.stat().st_size}")
print(f"THAP_RUA_TRIANGLES={triangles}")
print(f"THAP_RUA_MATERIALS={','.join(groups)}")

# Preview only; the ground, camera and lights are never exported to the GLB.
ground_mat = material("Preview grass", (0.25, 0.35, 0.22), 1.0)
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=8.8, depth=0.25, location=(0, 0, -0.15))
bpy.context.object.data.materials.append(ground_mat)
bpy.ops.object.camera_add(location=(22, -17, 12.8))
camera = bpy.context.object
direction = Vector((0, 0, 5.7)) - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 18.5
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type="AREA", location=(8, -10, 19))
bpy.context.object.data.energy = 2600
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 11
bpy.context.scene.world.color = (0.18, 0.22, 0.25)
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 24
bpy.context.scene.render.resolution_x = 980
bpy.context.scene.render.resolution_y = 980
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.filepath = str(PREVIEW)
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print(f"THAP_RUA_PREVIEW={PREVIEW}")
