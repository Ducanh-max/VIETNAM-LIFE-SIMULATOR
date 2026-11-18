"""Read-only inventory for the supplied Blender project. Auto-execution disabled by CLI."""
import bpy
import json
import os
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
report_path = root / 'heritage-work' / 'heritage-inventory.json'
blend_path = Path(bpy.data.filepath)

def vec(v):
    return [round(float(x), 5) for x in v]

def tris(mesh):
    return sum(max(0, len(poly.vertices)-2) for poly in mesh.polygons)

def bounds_world(obj):
    if not hasattr(obj, 'bound_box'):
        return None
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return {'min': vec([min(p[i] for p in corners) for i in range(3)]),
            'max': vec([max(p[i] for p in corners) for i in range(3)])}

images = []
for im in bpy.data.images:
    packed = sum(p.packed_file.size for p in im.packed_files) if im.packed_files else 0
    filepath = bpy.path.abspath(im.filepath) if im.filepath else ''
    exists = bool(filepath and os.path.isfile(filepath))
    images.append({
        'name':im.name,'source':im.source,'size_px':list(im.size),
        'channels':im.channels,'file_format':im.file_format,
        'filepath':im.filepath,'resolved_filepath':filepath,
        'external_exists':exists,'packed_bytes':packed,
        'colorspace':im.colorspace_settings.name,
    })

objects = []
for ob in bpy.data.objects:
    rec = {
        'name':ob.name,'type':ob.type,'collections':[c.name for c in ob.users_collection],
        'parent':ob.parent.name if ob.parent else None,
        'location':vec(ob.location),'rotation_euler':vec(ob.rotation_euler),
        'scale':vec(ob.scale),'dimensions':vec(ob.dimensions),
        'bounds_world':bounds_world(ob),'hide_render':bool(ob.hide_render),
        'modifiers':[{'name':m.name,'type':m.type,'show_render':m.show_render} for m in ob.modifiers],
        'materials':[s.material.name if s.material else None for s in ob.material_slots],
    }
    if ob.type == 'MESH':
        rec.update({'mesh_name':ob.data.name,'mesh_users':ob.data.users,
                    'vertices':len(ob.data.vertices),'faces':len(ob.data.polygons),
                    'triangles':tris(ob.data),'uv_layers':len(ob.data.uv_layers)})
    objects.append(rec)

mesh_objects = [o for o in objects if o['type']=='MESH']
unique_meshes = {o['mesh_name']:o for o in mesh_objects}
report = {
    'source_path':str(blend_path),'source_bytes':blend_path.stat().st_size,
    'blender_version':bpy.app.version_string,
    'scene_names':[s.name for s in bpy.data.scenes],
    'counts':{
        'objects':len(objects),'mesh_objects':len(mesh_objects),
        'unique_mesh_datablocks':len(bpy.data.meshes),
        'materials':len(bpy.data.materials),'images':len(images),
        'cameras':sum(o['type']=='CAMERA' for o in objects),
        'lights':sum(o['type']=='LIGHT' for o in objects),
        'empty_mesh_objects':sum(o['type']=='MESH' and o['vertices']==0 for o in objects),
        'total_object_triangles':sum(o['triangles'] for o in mesh_objects),
        'unique_mesh_triangles':sum(o['triangles'] for o in unique_meshes.values()),
        'packed_image_bytes':sum(i['packed_bytes'] for i in images),
        'missing_external_images':sum(i['source']=='FILE' and not i['external_exists'] and i['packed_bytes']==0 for i in images),
    },
    'collections':[{'name':c.name,'objects':[o.name for o in c.objects]} for c in bpy.data.collections],
    'images':images,'objects':objects,
    'materials':[{'name':m.name,'users':m.users,'nodes':len(m.node_tree.nodes) if m.node_tree else 0} for m in bpy.data.materials],
}
report_path.parent.mkdir(parents=True,exist_ok=True)
with report_path.open('w',encoding='utf-8') as f:
    json.dump(report,f,ensure_ascii=False,indent=2)
print('INVENTORY_PATH='+str(report_path))
print('INVENTORY_COUNTS='+json.dumps(report['counts']))
print('LARGEST_MESH_OBJECTS='+json.dumps(sorted(
    ({'name':o['name'],'triangles':o['triangles'],'vertices':o['vertices'],
      'materials':o['materials']} for o in mesh_objects),
    key=lambda x:x['triangles'],reverse=True)[:15],ensure_ascii=False))
