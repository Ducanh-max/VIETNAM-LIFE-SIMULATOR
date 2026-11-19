"""Verified repairs in Blender game metres, Z up. Preserve UVs and materials."""
import bmesh


def finish_temple(objects):
    changes = []
    for obj in objects:
        material = obj.data.materials[obj.data.polygons[0].material_index].name
        before = len(obj.data.polygons)
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        if material == 'Di sản v2 | Gạch đỏ đất và mạch':
            # Previously applied to the gameplay clone. Bake it once so review,
            # collision checks and gameplay all see the same paving height.
            for vert in mesh.verts:
                vert.co.z += 0.594
        if material in ('Di sản v2 | Gờ bậc và đá chạm',
                        'Di sản v2 | Vữa vôi của cổng và tường'):
            # The matched WebGL camera and raycasts identify these thin sheets
            # outside the south gate pier. Keep the adjoining solid pier.
            def fringe(vert):
                x, y, z = vert.co
                return -y > 12.05 and 10.9 < x < 12.85 and z < 2.65
            faces = [face for face in mesh.faces if all(fringe(v) for v in face.verts)]
            bmesh.ops.delete(mesh, geom=faces, context='FACES')
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
                        'faces_after': len(obj.data.polygons)})
    return changes
