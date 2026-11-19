"""Extract the owner's Thê Húc bridge for isolated review in game coordinates.

Run with Blender --background --disable-autoexec heritage-work/heritage-optimized-working.blend
  --python scripts/heritage/export-game-bridge.py
The deck and outer railing bands are edited separately in source coordinates.
The length and arch heights are left intact. The source .blend is never saved;
this GLB remains a review asset until approved.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parents[2]
output = root / 'public' / 'models' / 'cau-the-huc-heritage.glb'
bridge_materials = {
    'Di sản v2 | Cầu Thê Húc sơn son satin',
    'Di sản v2 | Ván gỗ ngang mặt cầu',
    'Di sản v2 | Cột, cửa và xà gỗ sơn nâu',
}
selected = []
for obj in bpy.data.objects:
    if obj.type != 'MESH' or not obj.data.polygons:
        continue
    material = obj.data.materials[obj.data.polygons[0].material_index]
    if material.name not in bridge_materials:
        continue
    if material.name == 'Di sản v2 | Cầu Thê Húc sơn son satin':
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        # The original scene has an opaque landing wall below the island end.
        # It is not part of the arched walk or the regularly spaced bridge
        # posts and makes a dark slab at the gate after fitting to the map.
        landing_wall = [face for face in mesh.faces
                        if (obj.matrix_world @ face.calc_center_median()).y > -55
                        and (obj.matrix_world @ face.calc_center_median()).z < 22]
        bmesh.ops.delete(mesh, geom=landing_wall, context='FACES')
        mesh.to_mesh(obj.data)
        mesh.free()
        obj.data.update()
    if material.name == 'Di sản v2 | Cột, cửa và xà gỗ sơn nâu':
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        # Only the paired posts along the span belong to the bridge. The broad
        # timber fragment at the island gate and an isolated shore fragment
        # belong to the surrounding scene and caused dark overlap at landing.
        unrelated_faces = [face for face in mesh.faces
                           if not -155 < (obj.matrix_world @ face.calc_center_median()).y < -51]
        bmesh.ops.delete(mesh, geom=unrelated_faces, context='FACES')
        mesh.to_mesh(obj.data)
        mesh.free()
        obj.data.update()
    selected.append(obj)

if len(selected) != len(bridge_materials):
    raise RuntimeError(f'Expected three bridge material groups, found {len(selected)}')

# The source bridge runs from Y=-161.6 (city shore) to Y=-45.3 (island).
# Its x width is far out of proportion to the OSM span. Edit its cross-section
# in Blender mesh coordinates: the original plank span (-31.01, -12.91) is
# narrowed to 3.0 game metres, while the bulky outer railing/support bands
# are narrowed separately. This retains the original arch, posts, ornaments,
# red material and plank rhythm, and does not deform the length or elevations.
source_center_x = -21.96
deck_half_width = 9.05
new_deck_half_width = 3.75
outer_band_factor = 0.34

def narrowed_x(x):
    distance = x - source_center_x
    if abs(distance) <= deck_half_width:
        return source_center_x + distance * new_deck_half_width / deck_half_width
    offset = new_deck_half_width + (abs(distance) - deck_half_width) * outer_band_factor
    return source_center_x + math.copysign(offset, distance)

for obj in selected:
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    for vertex in obj.data.vertices:
        vertex.co.x = narrowed_x(vertex.co.x)
    obj.data.update()

# Rotate into local -X, which the existing map loader points from the city
# shore to the island. Uniform game scale fits the 46.256 m OSM endpoints.
source_origin = Vector((-22.0, -161.55, 26.0))
# Deck plank endpoints are the walkable endpoints after cleaning the two
# unrelated landing fragments. Fit these rather than the old slab extremity.
source_span = 161.55 - 45.88
target_span = 46.256
scale = target_span / source_span
transform = (Matrix.Scale(scale, 4) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
             @ Matrix.Translation(-source_origin))
# The source bridge sits several metres below the lake datum. Blender's
# comparison render has no water, so its planks appeared intact there while
# they were submerged in WebGL. Align the complete bridge to the gameplay
# deck curve without changing its span or arch. The end correction follows
# the measured plank height at each landing (see bridge QA notes).
shore_lift = 3.27
island_lift = 2.93
for obj in selected:
    obj.data.transform(transform)
    for vertex in obj.data.vertices:
        t = min(1.0, max(0.0, -vertex.co.x / target_span))
        vertex.co.z += shore_lift * (1.0 - t) + island_lift * t
    obj.data.update()

bpy.ops.object.select_all(action='DESELECT')
for obj in selected:
    obj.select_set(True)
bpy.context.view_layer.objects.active = selected[0]
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output), export_format='GLB', use_selection=True,
    export_yup=True, export_apply=False, export_materials='EXPORT',
    export_texcoords=True, export_normals=True, export_tangents=False,
    export_image_format='WEBP', export_image_quality=85,
    export_unused_images=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=8,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12,
)
points = [obj.matrix_world @ v.co for obj in selected for v in obj.data.vertices]
print('GAME_BRIDGE=' + json.dumps({
    'file': str(output), 'bytes': output.stat().st_size,
    'triangles': sum(len(obj.data.polygons) for obj in selected),
    'materials': [obj.data.materials[obj.data.polygons[0].material_index].name for obj in selected],
    'scale': scale,
    'deck_width_m': 2 * new_deck_half_width * scale,
    'outer_band_factor': outer_band_factor,
    'shore_lift_m': shore_lift,
    'island_lift_m': island_lift,
    'bounds_blender': [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)],
}, ensure_ascii=False))
