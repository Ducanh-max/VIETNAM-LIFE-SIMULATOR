"""Check the exported GLB and its actual walkable surface, including landings.

From the repository root, run Blender with -b --disable-autoexec
--python-exit-code 1 -P scripts/heritage/check-bridge-surface.py.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path(__file__).resolve().parents[2]
bridge = root / 'public/models/cau-the-huc-heritage.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(bridge))
trees = []
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        vertices = [obj.matrix_world @ v.co for v in obj.data.vertices]
        faces = [tuple(p.vertices) for p in obj.data.polygons]
        trees.append(BVHTree.FromPolygons(vertices, faces, all_triangles=True))

stations = [0, 0.05] + [i / 10 for i in range(1, 463)] + [46.256]
max_walk_error = 0
for distance in stations:
    expected = 2.4 * math.sin(math.pi * distance / 46.256)
    for j in range(-14, 15):
        lateral = j / 10
        origin = Vector((-distance, lateral, 12))
        hits = [tree.ray_cast(origin, (0, 0, -1))[0] for tree in trees]
        heights = [hit.z for hit in hits if hit is not None]
        assert heights, f'No surface at {distance:.2f}m, lateral {lateral:.2f}m'
        if abs(lateral) <= 1.25:
            error = abs(max(heights) - expected)
            max_walk_error = max(error, max_walk_error)
            assert error < 0.065, f'Deck/collision differ by {error:.3f}m at {distance}, {lateral}'

print(json.dumps({'rays': len(stations) * 29, 'max_walk_error_m': round(max_walk_error, 4)}))
