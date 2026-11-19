"""Finish the existing bridge in Blender, after conversion to local game metres."""
import math
from statistics import median

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def original_surface(obj, span):
    """Longitudinal datum sampled from the central boards, excluding the rails."""
    tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    stations = np.linspace(0.35, span - 0.35, 128)
    heights = []
    for station in stations:
        hits = [tree.ray_cast(Vector((-station, y, 12)), Vector((0, 0, -1)))[0]
                for y in (-0.8, -0.4, 0.0, 0.4, 0.8)]
        heights.append(median(hit.z for hit in hits if hit is not None))
    return stations, np.array(heights)


def clip_ends(obj, shore_station, island_station):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    for station, normal in ((shore_station, (1, 0, 0)), (island_station, (-1, 0, 0))):
        bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                              plane_co=(-station, 0, 0), plane_no=normal,
                              dist=0.00001, clear_outer=True)
    mesh.to_mesh(obj.data)
    mesh.free()


def add_box(mesh, center, dimensions):
    vertices = bmesh.ops.create_cube(mesh, size=1.0)['verts']
    for vertex in vertices:
        vertex.co = Vector(center) + Vector([vertex.co[i] * dimensions[i] for i in range(3)])


def fit_thresholds(deck, span, floor):
    # The irregular scanned plank boundary has no surface across the end.
    # Trim to a straight transverse cut, then stitch a closed sloped sill.
    inset = 0.60
    clip_ends(deck, inset, span - inset)
    mesh = bmesh.new()
    mesh.from_mesh(deck.data)
    # The scanned plank material also contains thin detached patches of the
    # upper railing past the intact central walking surface. Replace just the
    # two ragged margins with edge boards seated against the retained planks.
    for side in (-1, 1):
        bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
                              plane_co=(0, side*1.28, 0), plane_no=(0, side, 0),
                              dist=0.00001, clear_outer=True)
        prev = None
        for station in np.linspace(inset, span-inset, 97):
            z = floor(station)
            ring = [mesh.verts.new((-station, side*y, z+dz)) for y,dz in
                    [(1.28,0), (1.50,0), (1.50,-0.14), (1.28,-0.14)]]
            if prev is not None:
                for i in range(4):
                    j=(i+1)%4
                    corners=(prev[i],prev[j],ring[j],ring[i])
                    mesh.faces.new(corners if side==1 else corners[::-1])
            prev = ring
    for ends in ((-0.06, inset), (span - inset, span + 0.06)):
        rings = []
        for station in ends:
            top = floor(station)
            rings.append([mesh.verts.new((-station, y, z)) for y, z in
                          [(-1.50, top), (1.50, top), (1.50, top - 0.14), (-1.50, top - 0.14)]])
        outer, inner = rings
        faces = [mesh.faces.new(ring) for ring in (outer, inner)]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(mesh.faces.new((outer[i], outer[j], inner[j], inner[i])))
        bmesh.ops.recalc_face_normals(mesh, faces=faces)
    mesh.to_mesh(deck.data)
    mesh.free()


def finish_rail_ends(rail, span, floor):
    # Only the first and last 0.32 m of the scanned rail are trimmed. Square
    # terminal posts mask the torn rail tips and preserve the source lattice.
    inset = 0.32
    clip_ends(rail, inset, span - inset)
    mesh = bmesh.new()
    mesh.from_mesh(rail.data)
    for station in (inset, span - inset):
        for side in (-1, 1):
            y = side * 1.50
            base = floor(station) - 0.14
            add_box(mesh, (-station, y, base + 0.76), (0.24, 0.28, 1.52))
            add_box(mesh, (-station, y, base + 1.53), (0.28, 0.31, 0.06))
    mesh.to_mesh(rail.data)
    mesh.free()


def packed_map(name, colors, non_color):
    height, width, _ = colors.shape
    image = bpy.data.images.new(name, width, height, alpha=False)
    if non_color:
        image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = colors
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


def finish_boards(deck):
    # Texture seams and a tangent-space bevel leave the playing surface solid.
    height, width = 512, 256
    y, x = np.mgrid[0:height, 0:width]
    row, within = np.divmod(y, 32)
    edge = np.minimum(within + 0.5, 31.5 - within)
    groove = np.exp(-(edge / 1.3) ** 2)
    grain = np.sin(0.95 * y + 0.9 * np.sin(2*np.pi*x/width + row*1.7))
    tint = 0.98 + 0.07*np.sin(row*13.7) + 0.032*grain - 0.40*groove
    color = tint[:, :, None] * np.array([0.58, 0.30, 0.195])[None, None, :]
    bevel = 0.48 * groove * np.sign(16 - within)
    normal = np.stack([np.full_like(bevel, 0.5), 0.5 - bevel * 0.5,
                       0.5 + 0.5*np.sqrt(1.0 - bevel**2)], axis=-1)
    material = deck.data.materials[deck.data.polygons[0].material_index]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    for name, pixels, target in (('Painted board grain', color, 'Base Color'),
                                ('Board seam bevel', normal, 'Normal')):
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = packed_map(name, pixels, target == 'Normal')
        socket = tex.outputs['Color']
        if target == 'Normal':
            bump = nodes.new('ShaderNodeNormalMap')
            links.new(socket, bump.inputs['Color'])
            socket = bump.outputs['Normal']
        links.new(socket, shader.inputs[target])
    shader.inputs['Roughness'].default_value = 0.74
    uvs = deck.data.uv_layers.active or deck.data.uv_layers.new()
    for loop in deck.data.loops:
        x, y, _ = deck.data.vertices[loop.vertex_index].co
        uvs.data[loop.index].uv = ((y + 1.5)/3.0, -x/3.52)


def finish_bridge(objects, span):
    deck = next(o for o in objects if 'Ván gỗ' in o.name)
    rail = next(o for o in objects if 'Cầu Thê Húc' in o.name)
    bpy.context.view_layer.update()
    stations, heights = original_surface(deck, span)

    def floor(station):
        return 2.4 * math.sin(math.pi * max(0, min(1, station / span)))

    for obj in objects:
        for vert in obj.data.vertices:
            pos = vert.co
            station = -pos.x
            h = pos.z - np.interp(station, stations, heights)
            if obj == rail and h > 0:
                # The scanned handrail was over 2.4 m above the deck.
                # Bring both faces toward their centreline, independently of
                # the planks, leaving supports and clear deck width in place.
                y0 = math.copysign(1.50, pos.y)
                pos.y = y0 + 0.51 * (pos.y - y0)
                h *= 0.43
            pos.z = floor(station) + h
        obj.data.update()
    fit_thresholds(deck, span, floor)
    finish_rail_ends(rail, span, floor)
    finish_boards(deck)
    for obj in objects:
        obj.data.update()
