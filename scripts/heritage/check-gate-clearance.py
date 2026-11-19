"""Blender geometry check for the player's path through the supplied gate.

Run from the repository root using Blender --background --factory-startup
--disable-autoexec --python-exit-code 1 --python scripts/heritage/check-gate-clearance.py.
scripts/check-bridge-walk.mjs independently tests the controller at game scale.
"""
from pathlib import Path
import bpy
from mathutils import Vector


model = Path(__file__).resolve().parents[2] / "public/models/den-ngoc-son-heritage.glb"
bpy.ops.import_scene.gltf(filepath=str(model))
meshes = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH']
assert meshes


def crosses_gate_mesh(start, end):
    for obj in meshes:
        inverse = obj.matrix_world.inverted()
        origin, destination = inverse @ start, inverse @ end
        vector = destination - origin
        if obj.ray_cast(origin, vector.normalized(), distance=vector.length)[0]:
            return True
    return False


# Blender -Y corresponds to Three.js +Z. Temple translation lowers its local
# floor by 1.55 m. Probe the full width of the character at six body heights.
count = 0
for offset in (-0.32, 0, 0.32):
    for height in (0.55, 1, 1.6, 2.1, 2.55, 2.7):
        y, z = -7.60 + offset, height + 1.55
        assert not crosses_gate_mesh(Vector((13.25, y, z)), Vector((7.50, y, z))), (
            f"Temple blocks avatar at offset {offset} m, height {height} m")
        count += 1
for y in (-8.65, -6.55):
    assert crosses_gate_mesh(Vector((13.25, y, 3.35)), Vector((9.40, y, 3.35))), (
        "Expected solid masonry immediately beside the arch")
print(f"Gate verified: {count} clear body rays through the arch; both jambs detected.")
