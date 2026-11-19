"""Check exported paving against the owner's source UV projection."""
import bpy
import json
import numpy as np
from pathlib import Path

root = Path(__file__).resolve().parents[2]
export = json.loads((root / 'heritage-work/temple-export.json').read_text(encoding='utf-8'))
repair = next(row['paving_uv'] for row in export['repairs'] if row['paving_uv'])
projection = np.array(repair['source_uv_projection'])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'public/models/den-ngoc-son-heritage.glb'))
floor = next(obj for obj in bpy.context.selected_objects if obj.type == 'MESH'
             and obj.data.materials[0].name == 'Di sản v2 | Gạch đỏ đất và mạch')
uv = floor.data.uv_layers.active.data
errors = []
path_faces = 0
for face in floor.data.polygons:
    if face.center.x > 9:
        path_faces += 1
    for loop_index in face.loop_indices:
        loop = floor.data.loops[loop_index]
        p = floor.data.vertices[loop.vertex_index].co
        expected = np.array((p.x, p.y, 1)) @ projection
        errors.append(float(np.max(np.abs(expected - np.array(uv[loop_index].uv)))))
assert path_faces, 'No paving through the gate'
# Draco position/UV quantization introduces small numeric errors at export.
assert max(errors) < .006, f'Paving UV mismatch {max(errors)}'
result = {'loop_count': len(errors), 'path_faces': path_faces,
          'max_export_uv_error': max(errors),
          'source_projection': repair}
(root / 'heritage-work/paving-uv-check.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('PAVING_UV_CHECK=' + json.dumps(result), flush=True)
