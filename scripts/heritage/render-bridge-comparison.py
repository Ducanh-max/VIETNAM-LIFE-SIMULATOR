"""Render the current bridge GLB with the temple at four fixed review angles.

Run: blender --background --disable-autoexec --python scripts/heritage/render-bridge-comparison.py
These are Blender placement renders, not WebGL gameplay captures.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
data = json.loads((root / 'src/data/hoanKiem.json').read_text(encoding='utf-8'))
origin = data['center']

def project(pair):
    x = (pair[0] - origin['lon']) * 111320 * math.cos(math.radians(origin['lat']))
    z = -(pair[1] - origin['lat']) * 111320
    return Vector((x, -z, 0))

island = [project(pair) for pair in data['lake']['coordinates'][1]]
centre = sum(island, Vector()) / len(island)
bridge_ends = [project(pair) for pair in data['landmarks']['Cầu Thê Húc'][0]['geojson']['coordinates']]
shore = max(bridge_ends, key=lambda point: point.x)
landing = min(bridge_ends, key=lambda point: point.x)

def import_asset(path, name, location, angle):
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH']
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    for obj in imported:
        obj.parent = parent
    parent.location = location
    parent.rotation_euler.z = angle

heading = math.atan2((landing - centre).y, (landing - centre).x)
import_asset(root / 'public/models/den-ngoc-son-heritage.glb', 'Temple',
             centre + Vector((4, 12, -1.55)), heading)
bridge_heading = math.atan2((landing - shore).y, (landing - shore).x) - math.pi
import_asset(root / 'public/models/cau-the-huc-heritage.glb', 'Bridge',
             shore + Vector((0, 0, 0.35)), bridge_heading)

mesh = bpy.data.meshes.new('Island outline')
mesh.from_pydata([(point.x, point.y, 0.28) for point in island], [],
                 [tuple(range(len(island)))])
mesh.update()
ground = bpy.data.objects.new('Island outline', mesh)
bpy.context.collection.objects.link(ground)
material = bpy.data.materials.new('Island neutral')
material.diffuse_color = (0.22, 0.42, 0.22, 1)
ground.data.materials.append(material)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 12
scene.render.resolution_x = 1250
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.world.color = (0.6, 0.7, 0.8)
light = bpy.data.lights.new('Sun', 'SUN')
light.energy = 2
sun = bpy.data.objects.new('Sun', light)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(25), 0, math.radians(-30))
camera_data = bpy.data.cameras.new('Review camera')
camera = bpy.data.objects.new('Review camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
views = [
    ('top', centre + Vector((25, 0, 100)), centre + Vector((25, 0, 0)), 95),
    ('shore', shore + Vector((18, -8, 7)), landing + Vector((0, 0, 2)), None),
    ('side', (25, 169, 8), (25, 217, 2), None),
    ('oblique', (63, 179, 12), (19, 217, 2), None),
]
for name, location, target, ortho_scale in views:
    location, target = Vector(location), Vector(target)
    camera.location = location
    camera.rotation_euler = (target - location).to_track_quat('-Z', 'Y').to_euler()
    if ortho_scale:
        camera_data.type = 'ORTHO'
        camera_data.ortho_scale = ortho_scale
    else:
        camera_data.type = 'PERSP'
        camera_data.lens = 38
    scene.render.filepath = str(root / 'docs/heritage-images' / f'bridge-after-{name}.png')
    bpy.ops.render.render(write_still=True)
