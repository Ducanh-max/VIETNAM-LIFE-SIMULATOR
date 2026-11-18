"""Build non-production review GLBs from the user-supplied Blender 5.3 scene.

Run with Blender --background --disable-autoexec SOURCE.blend --python this_file.
The source is never saved. Only foliage is decimated; architectural meshes stay intact.
"""
import bpy
import json
from pathlib import Path
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parents[2]
work = root / 'heritage-work'
work.mkdir(exist_ok=True)
models = root / 'public' / 'models' / 'review'
models.mkdir(parents=True, exist_ok=True)
source_counts = {obj.name: len(obj.data.polygons) for obj in bpy.data.objects if obj.type == 'MESH'}
tower = bpy.data.objects['Mesh_0.002']
combined = bpy.data.objects['Mesh_0.003']

bpy.ops.object.select_all(action='DESELECT')
combined.select_set(True)
bpy.context.view_layer.objects.active = combined
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')

groups = {}
for obj in bpy.data.objects:
    if obj.type != 'MESH' or obj == tower or not obj.data.polygons:
        continue
    material = obj.data.materials[obj.data.polygons[0].material_index]
    if material.name in groups:
        raise RuntimeError('Duplicate material group: ' + material.name)
    groups[material.name] = obj
    obj.name = 'Heritage | ' + material.name.split('|', 1)[-1].strip()

for material_name in ('Di sản v2 | Tán lá xanh rêu', 'Di sản v2 | Tán lá non xanh ấm'):
    obj = groups[material_name]
    modifier = obj.modifiers.new('Controlled foliage reduction', 'DECIMATE')
    modifier.ratio = 0.22
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)

summary = {
    'source_triangles': sum(source_counts.values()),
    'source_mesh_faces': source_counts,
    'working_meshes': {obj.name: len(obj.data.polygons) for obj in bpy.data.objects if obj.type == 'MESH'},
}
summary['optimized_triangles'] = sum(summary['working_meshes'].values())
(work / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
bpy.context.preferences.filepaths.use_file_compression = True
bpy.ops.wm.save_as_mainfile(filepath=str(work / 'heritage-optimized-working.blend'))

def export(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
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
    print('REVIEW_GLB=' + json.dumps({'file': str(path), 'bytes': path.stat().st_size}, ensure_ascii=False))

export(models / 'ngoc-son-the-huc-review.glb', list(groups.values()))

# Use a uniform scale and base-centred origin for the game review toggle.
# This changes placement only and does not alter the tower's proportions.
world_min = min((tower.matrix_world @ vertex.co).z for vertex in tower.data.vertices)
world_max = max((tower.matrix_world @ vertex.co).z for vertex in tower.data.vertices)
x_min = min((tower.matrix_world @ vertex.co).x for vertex in tower.data.vertices)
x_max = max((tower.matrix_world @ vertex.co).x for vertex in tower.data.vertices)
origin = Vector(((x_min+x_max)/2, 0, world_min))
scale = 8.8 / (world_max-world_min)
tower.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(-origin) @ tower.matrix_world)
tower.matrix_world = Matrix.Identity(4)
tower.data.update()
export(models / 'thap-rua-game-review.glb', [tower])
print('TOWER_ORIGIN_SCALE=' + json.dumps({'origin_blender': list(origin), 'scale': scale}))
