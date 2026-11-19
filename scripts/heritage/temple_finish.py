"""Verified repairs in Blender game metres, Z up. Preserve UVs and materials."""
import bmesh
from mathutils import Vector


def repair_side_wall(mesh):
    # Surveyed source facade: two dominant skins at Y=-9.5 / -9.2.
    # The torn sheets extend to -10.63 outside the external plaster skin.
    target = Vector((-11.5, -9.5, 3.5))
    seed = min(mesh.faces, key=lambda face: (face.calc_center_median() - target).length)
    faces = {seed}
    stack = [seed]
    while stack:
        face = stack.pop()
        for vert in face.verts:
            for neighbor in vert.link_faces:
                if neighbor not in faces:
                    faces.add(neighbor)
                    stack.append(neighbor)
    vertices = {vert for face in faces for vert in face.verts}
    low = [min(v.co[i] for v in vertices) for i in range(3)]
    high = [max(v.co[i] for v in vertices) for i in range(3)]
    if not (-14.5 < low[0] < -14 and -9.1 < high[0] < -8.7):
        raise RuntimeError(f'Side-wall component changed: {low} {high}')
    edges = {edge for face in faces for edge in face.edges}
    result = bmesh.ops.bisect_plane(
        mesh, geom=list(faces) + list(edges) + list(vertices),
        plane_co=(0, -9.55, 0), plane_no=(0, -1, 0),
        clear_outer=True, dist=.00001)
    cut_edges = [edge for edge in result['geom_cut']
                 if isinstance(edge, bmesh.types.BMEdge) and edge.is_boundary]
    if cut_edges:
        filled = bmesh.ops.holes_fill(mesh, edges=cut_edges, sides=0)['faces']
        uv = mesh.loops.layers.uv.active
        for face in filled:
            for loop in face.loops:
                loop[uv].uv = (loop.vert.co.x * .2, loop.vert.co.z * .2)
    return {'source_facade_y': -9.5, 'trim_plane_y': -9.55,
            'component_bounds': [low, high], 'cut_edges': len(cut_edges)}


def finish_temple(objects):
    changes = []
    for obj in objects:
        material = obj.data.materials[obj.data.polygons[0].material_index].name
        before = len(obj.data.polygons)
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        if material == 'Di sản v2 | Gạch đỏ đất và mạch':
            # Match the existing 0.35 m walking surface after temple placement.
            # Retain the source brick material and UVs, regularize its torn
            # perimeter, then extend the paving through the existing arch.
            for vert in mesh.verts:
                vert.co.z = 1.9
            for axis, limit, sign in ((0, -2.4, -1), (0, 8.9, 1),
                                      (1, -10.0, -1), (1, .4, 1)):
                point = [0, 0, 0]
                normal = [0, 0, 0]
                point[axis] = limit
                normal[axis] = sign
                bmesh.ops.bisect_plane(
                    mesh, geom=list(mesh.faces) + list(mesh.edges) + list(mesh.verts),
                    plane_co=point, plane_no=normal, clear_outer=True, dist=.00001)
            verts = [mesh.verts.new((x, y, 1.9)) for x, y in
                     ((8.9, -8.7), (14.5, -8.7), (14.5, -6.5), (8.9, -6.5))]
            path = mesh.faces.new(verts)
            uv = mesh.loops.layers.uv.active
            for loop in path.loops:
                loop[uv].uv = (loop.vert.co.x * .2, loop.vert.co.y * .2)
        if material in ('Di sản v2 | Gờ bậc và đá chạm',
                        'Di sản v2 | Vữa vôi của cổng và tường'):
            # The matched WebGL camera and raycasts identify these thin sheets
            # outside the south gate pier. Keep the adjoining solid pier.
            def fringe(vert):
                x, y, z = vert.co
                return -y > 12.05 and 10.9 < x < 12.85 and z < 2.65
            faces = [face for face in mesh.faces if all(fringe(v) for v in face.verts)]
            bmesh.ops.delete(mesh, geom=faces, context='FACES')
        wall_repair = None
        if material == 'Di sản v2 | Vữa vôi của cổng và tường':
            wall_repair = repair_side_wall(mesh)
        if material in ('Di sản v2 | Gờ bậc và đá chạm',
                        'Di sản v2 | Vữa vôi của cổng và tường'):
            # Disconnected scan fragments occupy the same rejected volume as
            # the torn wall skin, but are not connected to that wall component.
            outside_wall = [face for face in mesh.faces if all(
                -14.5 < v.co.x < -8.7 and v.co.y < -9.56 and 1.8 < v.co.z < 5.2
                for v in face.verts)]
            bmesh.ops.delete(mesh, geom=outside_wall, context='FACES')
        # Remove only zero-area faces and unused vertices, without welding UV
        # seams or filling architectural openings.
        empty = [face for face in mesh.faces if face.calc_area() < 1e-12]
        bmesh.ops.delete(mesh, geom=empty, context='FACES')
        loose = [vert for vert in mesh.verts if not vert.link_faces]
        bmesh.ops.delete(mesh, geom=loose, context='VERTS')
        mesh.to_mesh(obj.data)
        mesh.free()
        obj.data.update()
        changes.append({'material': material, 'faces_before': before,
                        'faces_after': len(obj.data.polygons), 'side_wall': wall_repair})
    return changes
