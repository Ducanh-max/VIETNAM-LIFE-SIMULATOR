"""Reimport all gameplay assets with Blender's glTF loader and record their data."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
reports = []
for filename in ('thap-rua-heritage.glb', 'den-ngoc-son-heritage.glb', 'cau-the-huc-heritage.glb'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = root / 'public/models' / filename
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    assert objects, filename + ' has no meshes'
    assert not any(obj.type in ('LIGHT', 'CAMERA') for obj in bpy.data.objects)
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    materials = {slot.material for obj in objects for slot in obj.material_slots if slot.material}
    textures = {node.image for material in materials if material.node_tree
                for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image}
    assert all(image.has_data for image in textures), 'Missing decoded texture in ' + filename
    for obj in objects:
        assert obj.data.uv_layers, 'Missing UV on ' + obj.name
        copy = obj.data.copy()
        assert not copy.validate(clean_customdata=False), 'Invalid mesh in ' + obj.name
        bpy.data.meshes.remove(copy)
    reports.append({
        'file': filename, 'bytes': path.stat().st_size,
        'triangles': sum(sum(len(face.vertices)-2 for face in obj.data.polygons) for obj in objects),
        'meshes': len(objects), 'materials': len(materials), 'images': len(textures),
        'bounds_blender': [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)],
        'texture_sizes': {image.name: list(image.size) for image in textures},
    })
destination = root / 'heritage-work' / 'glb-verification.json'
destination.parent.mkdir(exist_ok=True)
destination.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
print('GLB_VERIFICATION=' + json.dumps(reports, ensure_ascii=False))
