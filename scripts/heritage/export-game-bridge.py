"""Extract the owner's Thê Húc bridge for isolated review in game coordinates.

Run with Blender --background --disable-autoexec heritage-work/heritage-optimized-working.blend
  --python scripts/heritage/export-game-bridge.py
Only a uniform scale, rotation and translation are applied. The source .blend
is never saved. The export is intentionally a review asset until approved.
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
    if material.name == 'Di sản v2 | Cột, cửa và xà gỗ sơn nâu':
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        temple_faces = [face for face in mesh.faces
                        if (obj.matrix_world @ face.calc_center_median()).y >= -42]
        bmesh.ops.delete(mesh, geom=temple_faces, context='FACES')
        mesh.to_mesh(obj.data)
        mesh.free()
        obj.data.update()
    selected.append(obj)

if len(selected) != len(bridge_materials):
    raise RuntimeError(f'Expected three bridge material groups, found {len(selected)}')

# The source bridge runs from Y=-161.6 (city shore) to Y=-45.3 (island).
# Rotate it into local -X, which the existing map loader points from city shore
# to island. Size is fitted uniformly to the 46.256 m OSM endpoint distance.
source_origin = Vector((-22.0, -161.64, 26.0))
source_span = 161.64 - 45.35
target_span = 46.256
scale = target_span / source_span
transform = (Matrix.Scale(scale, 4) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
             @ Matrix.Translation(-source_origin))
for obj in selected:
    obj.data.transform(transform @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
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
    'bounds_blender': [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)],
}, ensure_ascii=False))
