"""Export the supplied Ngoc Son architecture at the existing game island scale.

Run with Blender --background --disable-autoexec heritage-work/heritage-optimized-working.blend
  --python scripts/heritage/export-game-temple.py
The review scene is preserved. The source bridge faces are excluded because its
orientation and span do not match the OSM bridge endpoints in the game.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from temple_finish import finish_temple

root = Path(__file__).resolve().parents[2]
if Path(bpy.data.filepath).name != 'heritage-optimized-working.blend':
    raise RuntimeError('Use the untransformed, material-split heritage-optimized-working.blend')
output = root / 'public' / 'models' / 'den-ngoc-son-heritage.glb'
names = {
    'Di sản v2 | Bờ nóc và diềm mái, gốm phong hoá',
    'Di sản v2 | Cột, cửa và xà gỗ sơn nâu',
    'Di sản v2 | Gạch đỏ đất và mạch',
    'Di sản v2 | Gờ bậc và đá chạm',
    'Di sản v2 | Ngói đất nung, sóng và mí ngói',
    'Di sản v2 | Vữa vôi của cổng và tường',
}
selected = []
for obj in bpy.data.objects:
    if obj.type != 'MESH' or not obj.data.polygons or obj.name == 'Mesh_0.002':
        continue
    material = obj.data.materials[obj.data.polygons[0].material_index]
    if material.name not in names:
        continue
    if material.name == 'Di sản v2 | Cột, cửa và xà gỗ sơn nâu':
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bridge_faces = [face for face in mesh.faces
                        if (obj.matrix_world @ face.calc_center_median()).y < -42]
        bmesh.ops.delete(mesh, geom=bridge_faces, context='FACES')
        mesh.to_mesh(obj.data)
        mesh.free()
        obj.data.update()
    selected.append(obj)

if len(selected) != len(names):
    raise RuntimeError(f'Expected {len(names)} architecture material groups; found {len(selected)}')

# The supplied bridge points toward -Y, whereas the game bridge reaches the
# island from +X. Keep the source building geometry and rotate it 90 degrees.
# (36, 50, 7) is the temple precinct centre in the source Blender scene.
origin = Vector((36, 50, 7))
scale = .145
transform = (Matrix.Scale(scale, 4) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
             @ Matrix.Translation(-origin))
for obj in selected:
    obj.data.transform(transform @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()

repairs = finish_temple(selected)
# Save a separate repair source, retaining packed images and original materials.
bpy.context.preferences.filepaths.file_preview_type = 'NONE'
bpy.ops.wm.save_as_mainfile(filepath=str(root / 'heritage-work' / 'temple-repaired.blend'))
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
coordinates = [obj.matrix_world @ vert.co for obj in selected for vert in obj.data.vertices]
report = {
    'file': str(output), 'bytes': output.stat().st_size,
    'triangles': sum(sum(len(face.vertices) - 2 for face in obj.data.polygons)
                     for obj in selected),
    'bounds_blender': [[min(v[i] for v in coordinates), max(v[i] for v in coordinates)] for i in range(3)],
    'materials': [obj.data.materials[obj.data.polygons[0].material_index].name for obj in selected],
    'repairs': repairs,
}
(root / 'heritage-work' / 'temple-export.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('GAME_TEMPLE=' + json.dumps(report, ensure_ascii=False))
