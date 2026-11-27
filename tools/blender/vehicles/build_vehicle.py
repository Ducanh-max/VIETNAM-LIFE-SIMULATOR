"""
ĐỜI VIỆT vehicle builder (Blender 5.x, bpy). Original designs of the game's fictional brand "Sen Việt".

    blender -b --factory-startup --python tools/blender/vehicles/build_vehicle.py -- <design.json> <out_dir> [--stage body|full]

Pipeline per car: design JSON (body cage sections + zones) -> low-poly control cage (quads, half car) -> Mirror ->
Subdivision Surface -> wheel-arch booleans + liners -> doors / tailgate separated along cage lines (own pivots) ->
panel thickness -> lamps, grille, trims shrink-wrapped onto the body -> wheels (steer > spin) -> full interior ->
materials (PBR, named for the game) -> anchors -> .blend + GLB LOD0 / LOD1 / LOD2 + metadata JSON + previews.

Blender frame: +Z up, -Y is the car's FRONT, +X the car's LEFT (driver side). glTF export turns that into the game's
frame (+Y up, +Z forward, +X left).
"""
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DESIGN = json.load(open(argv[0], encoding='utf-8'))
OUT = argv[1]
STAGE = argv[argv.index('--stage') + 1] if '--stage' in argv else 'full'
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- scene / materials
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
COL = {}
def collection(name):
    if name not in COL:
        c = bpy.data.collections.new(name); SC.collection.children.link(c); COL[name] = c
    return COL[name]

def material(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, coat=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if coat: b.inputs['Coat Weight'].default_value = coat
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.diffuse_color = (*color, alpha)
    return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

MAT = {
    'Paint': material('Paint', srgb('#e9e8e3'), 0.3, 0.4, coat=1.0),
    'Glass': material('Glass', srgb('#1c2830'), 0.03, 0.2, alpha=0.4),
    'GlassDark': material('GlassDark', srgb('#11181d'), 0.05, 0.3, alpha=0.75),
    'BlackGloss': material('BlackGloss', srgb('#0d0f11'), 0.15, 0.2),
    'BlackTrim': material('BlackTrim', srgb('#1d1f22'), 0.7),
    'Chrome': material('Chrome', srgb('#e8ecee'), 0.06, 1.0),
    'Satin': material('Satin', srgb('#a9b0b5'), 0.32, 0.9),
    'Underbody': material('Underbody', srgb('#141516'), 0.9),
    'Liner': material('Liner', srgb('#0e0f10'), 0.95),
}

# ---------------------------------------------------------------- body cage
D = DESIGN; S = D['sections']; Z = D['zones']
def zone(name, z):
    a = Z.get(name)
    return a is not None and min(a) <= z <= max(a)

def profile(s):
    """Half profile, bottom centre -> roof centre (x, height). Index 5 = belt line, 7 = window top line."""
    hw, zb, belt, edge, top, hwE = s['hw'], s['zb'], s['belt'], s['edge'], s['top'], s['hwE']
    xb = hw * 0.968
    return [
        (0.0, zb), (hw * 0.86, zb), (hw * 0.985, zb + 0.13),
        (hw, zb + 0.13 + (belt - 0.12 - zb - 0.13) * 0.5),
        (hw * 0.997, belt - 0.12), (xb, belt),
        (xb + (hwE - xb) * 0.5, belt + (edge - belt) * 0.5),
        (hwE + (xb - hwE) * 0.08, edge - min(0.055, (edge - belt) * 0.3)), (hwE, edge),
        (hwE * 0.74, edge + (top - edge) * 0.82), (0.0, top),
    ]
NP = 11  # 5 = belt, 7..8 = black window-frame band (A pillar / roof rail), 8 = window top

def part_and_mat(zm, j, nose, tail):
    """Material (+ part tag) of the cage face between profile points j..j+1 at mid z = zm."""
    part = ''
    if j == 0: return 'Underbody', ''
    if j == 1: k = 'BlackTrim'
    elif j <= 4: k = 'Paint'
    elif j <= 6:  # side glass band
        if zone('windshield', zm) and j == 6: k = 'BlackGloss'          # A pillar
        elif zone('windshield', zm): k = 'BlackGloss'
        elif zone('bPillar', zm) or zone('cPillar', zm) or zone('dPillar', zm): k = 'BlackGloss'
        elif zone('frontDoor', zm) or zone('rearDoor', zm) or zone('quarterGlass', zm): k = 'Glass'
        else: k = 'Paint'
        if nose or zm > max(Z['windshield']): k = 'Paint'
        if tail and j == 6: k = 'BlackGloss'
    elif j == 7:  # window frame band: black A pillars and roof rails (the brand's floating-roof line)
        k = 'Paint' if (nose or zm > max(Z['windshield'])) else 'BlackGloss'
    else:  # top band
        if zone('windshield', zm): k = 'Glass'
        elif zone('rearGlass', zm) and j >= 7: k = 'Glass'
        else: k = 'Paint'
        if nose: k = 'Paint'
    # part tags (which faces become doors / tailgate)
    if 2 <= j <= 7 and not nose:
        if zone('frontDoor', zm): part = 'DF'
        elif zone('rearDoor', zm): part = 'DR'
    if zone('tailgate', zm) and j >= 4: part = 'TG'
    return k, part

def build_cage():
    me = bpy.data.meshes.new('BodyCage'); bm = bmesh.new()
    rings = []
    for s in S:
        y = -s['z']
        rings.append([bm.verts.new((x, y, h)) for (x, h) in profile(s)])
    # nose / tail closing columns (x = 0, heights of the end rings)
    def column(s, dz):
        y = -(s['z'] + dz)
        return [bm.verts.new((0.0, y, h)) for (x, h) in profile(s)]
    nose = column(S[0], 0.022); tail = column(S[-1], -0.017)
    allrings = [nose] + rings + [tail]
    zs = [S[0]['z'] + 0.022] + [s['z'] for s in S] + [S[-1]['z'] - 0.017]
    slots = {}
    def slot(name):
        if name not in slots:
            slots[name] = len(slots); me.materials.append(MAT[name.split('__')[0]] if '__' in name else MAT[name])
        return slots[name]
    for i in range(len(allrings) - 1):
        A, B = allrings[i], allrings[i + 1]; zm = (zs[i] + zs[i + 1]) / 2
        is_nose, is_tail = i == 0, i == len(allrings) - 2
        for j in range(NP - 1):
            if (is_nose or is_tail) and False: pass
            f = bm.faces.new((A[j], A[j + 1], B[j + 1], B[j])) if True else None
            k, part = part_and_mat(zm, j, is_nose, is_tail)
            f.material_index = slot(k + ('__' + part if part else ''))
    cr = bm.edges.layers.float.new('crease_edge')
    zcab = max(Z['windshield'])
    for i in range(len(allrings) - 1):
        for j, w in ((5, 0.55), (7, 0.85), (8, 0.85), (4, 0.25)):
            if zs[i] <= zcab + 0.01 and zs[i + 1] <= zcab + 0.01 or j == 4:
                e = bm.edges.get((allrings[i][j], allrings[i + 1][j]))
                if e: e[cr] = w
    for i in range(1, len(allrings) - 1):  # transverse edges where the side material changes (pillar edges)
        za, zb_ = (zs[i - 1] + zs[i]) / 2, (zs[i] + zs[i + 1]) / 2
        for j in (5, 6, 7):
            if part_and_mat(za, j, False, False)[0] != part_and_mat(zb_, j, False, False)[0]:
                e = bm.edges.get((allrings[i][j], allrings[i][j + 1]))
                if e: e[cr] = 0.9
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    # tag materials per part: duplicate base materials as '<Base>__<PART>' so the split survives the modifiers
    for idx, m in enumerate(list(me.materials)):
        pass
    ob = bpy.data.objects.new('BodyShell', me); collection('Body').objects.link(ob)
    names = sorted(slots, key=lambda n: slots[n])
    for i, n in enumerate(names):
        if '__' in n:
            base, part = n.split('__'); tag = bpy.data.materials.get(n) or MAT[base].copy(); tag.name = n; me.materials[i] = tag
    return ob

body = build_cage()
mod = body.modifiers.new('Mirror', 'MIRROR'); mod.use_axis[0] = True; mod.use_clip = True; mod.use_mirror_merge = True; mod.merge_threshold = 0.002
sub = body.modifiers.new('Subsurf', 'SUBSURF'); sub.levels = 3; sub.render_levels = 3
for p in body.data.polygons: p.use_smooth = True

def render_views(prefix, views=None, res=(1100, 680)):
    SC.render.engine = 'BLENDER_WORKBENCH'; SC.display.shading.light = 'STUDIO'; SC.display.shading.color_type = 'MATERIAL'
    SC.display.shading.show_specular_highlight = True
    SC.render.resolution_x, SC.render.resolution_y = res; SC.render.film_transparent = False
    cam = bpy.data.objects.get('PreviewCam') or bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    if cam.name not in SC.collection.objects: SC.collection.objects.link(cam)
    SC.camera = cam
    V = views or {'front34': ((-5.2, -7.0, 2.3), 0.75), 'side': ((-9.5, 0, 1.1), 0.8), 'rear34': ((5.2, 7.0, 2.6), 0.8), 'front': ((0, -8.5, 1.2), 0.8), 'rear': ((0, 8.5, 1.3), 0.8), 'top': ((0.01, 0, 11), 0.0)}
    for name, (p, tz) in V.items():
        cam.location = p; d = Vector((0, 0, tz)) - Vector(p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 40
        SC.render.filepath = os.path.join(OUT, f'{prefix}{name}.png'); bpy.ops.render.render(write_still=True)

def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

TYRE_R = (D['tyre'][2] * 0.0254 + 2 * D['tyre'][0] / 1000 * D['tyre'][1] / 100) / 2
TYRE_W = D['tyre'][0] / 1000
AXLES = [D['axleF'], D['axleR']]
def cut_arches(ob):
    for a in AXLES:
        for sd in (1, -1):
            bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=TYRE_R + 0.045, depth=0.5, location=(sd * (D['width'] / 2), -a, TYRE_R + 0.01), rotation=(0, math.pi / 2, 0))
            cyl = bpy.context.active_object
            b = ob.modifiers.new('arch', 'BOOLEAN'); b.object = cyl; b.operation = 'DIFFERENCE'; b.solver = 'EXACT'
            apply_mods(ob); bpy.data.objects.remove(cyl, do_unlink=True)
            # liner: a dark half tube inside the arch
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=TYRE_R + 0.04, depth=0.36, end_fill_type='NOTHING', location=(sd * (D['width'] / 2 - 0.2), -a, TYRE_R + 0.01), rotation=(0, math.pi / 2, 0))
            ln = bpy.context.active_object; ln.name = f'ArchLiner'; ln.data.materials.append(MAT['Liner'])
            bm = bmesh.new(); bm.from_mesh(ln.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.0 and False], context='VERTS')
            for v in [v for v in bm.verts if (ln.matrix_world @ v.co).z < 0.12]: bm.verts.remove(v)
            bm.to_mesh(ln.data); bm.free(); ln.data.flip_normals() if hasattr(ln.data, 'flip_normals') else None
            for c in ln.users_collection: c.objects.unlink(ln)
            collection('Body').objects.link(ln)

def wheel_placeholders():
    for a in AXLES:
        for sd in (1, -1):
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=TYRE_R, depth=TYRE_W, location=(sd * D['track'] / 2, -a, TYRE_R), rotation=(0, math.pi / 2, 0))
            w = bpy.context.active_object; w.data.materials.append(MAT['Underbody'])

if STAGE == 'body':
    apply_mods(body); cut_arches(body); wheel_placeholders()
    for p in body.data.polygons: p.use_smooth = True
    render_views('body_')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'body_stage.blend'))
    sys.exit(0)

# ---------------------------------------------------------------- previews of the real Blender model
HERE = os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('--python') + 1]))
def render_previews():
    SC.display.shading.show_cavity = True; SC.display.shading.cavity_type = 'BOTH'
    L, Hh = D['length'], D['height']; cab = D['cabin']
    ext = {'front': ((0, -L / 2 - 4.2, 1.1), (0, 0, 0.8)), 'rear': ((0, L / 2 + 4.2, 1.2), (0, 0, 0.8)), 'left': ((6.8, 0, 1.0), (0, 0, 0.8)), 'right': ((-6.8, 0, 1.0), (0, 0, 0.8)),
           'front34': ((4.6, -5.6, 2.0), (0, -0.2, 0.75)), 'rear34': ((-4.6, 5.6, 2.2), (0, 0.2, 0.8)), 'top': ((0.001, 0, 9.5), (0, 0, 0))}
    cam = bpy.data.objects.get('PreviewCam') or bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    if cam.name not in SC.collection.objects: SC.collection.objects.link(cam)
    SC.camera = cam; SC.render.engine = 'BLENDER_WORKBENCH'; SC.display.shading.light = 'STUDIO'; SC.display.shading.color_type = 'MATERIAL'
    SC.render.resolution_x, SC.render.resolution_y = 1280, 800
    def shot(name, p, t, lens=40):
        cam.location = p; cam.rotation_euler = (Vector(t) - Vector(p)).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens; cam.data.clip_start = 0.02
        SC.render.filepath = os.path.join(OUT, 'preview_' + name + '.png'); bpy.ops.render.render(write_still=True)
    for k, (p, t) in ext.items(): shot(k, p, t)
    r0 = cab['rows'][0]; eye = cab['floor'] + 1.0
    if SC.world is None: SC.world = bpy.data.worlds.new('W')
    SC.world.color = (0.62, 0.66, 0.7)
    shot('cockpit', (0.4, -(r0 - 0.1), eye), (0.3, -(r0 + 2), eye - 0.45), 22)
    if len(cab['rows']) > 1: shot('rearseats', (-0.3, -(cab['rows'][0] - 0.1), eye - 0.05), (0, -(cab['rows'][-1] - 0.5), cab['floor'] + 0.5), 22)
    hidden = [o for o in bpy.data.objects if o.name.startswith('Trunk') and o.type == 'MESH']
    tp = bpy.data.objects.get('Trunk_Pivot')
    if tp: tp.rotation_euler = (-1.2, 0, 0)
    shot('boot', (0, L / 2 + 2.6, 1.9), (0, L / 2 - 1.2, 0.7), 30)
    for nm in ('Door_FL', 'Door_FR', 'Door_RL', 'Door_RR'):
        pv = bpy.data.objects.get(nm + '_Pivot')
        if not pv: continue
        sgn = 1 if nm.endswith('L') else -1
        if nm.startswith('Door_R') and Z.get('rearDoorType') == 'sliding': pv.location = pv.location + Vector((sgn * 0.12, 0.85, 0))
        else: pv.rotation_euler = (0, 0, -sgn * 1.05)
    shot('doors_open', (4.8, -4.6, 2.2), (0, 0, 0.8))
    for o in bpy.data.objects:
        if o.name.endswith('_Pivot'): o.rotation_euler = (0, 0, 0)
    for nm in ('Door_RL', 'Door_RR'):
        pv = bpy.data.objects.get(nm + '_Pivot'); sgn = 1 if nm.endswith('L') else -1
        if pv and Z.get('rearDoorType') == 'sliding': pv.location = pv.location - Vector((sgn * 0.12, 0.85, 0))
    SC.display.shading.color_type = 'SINGLE'; SC.display.shading.show_xray = False
    for o in bpy.data.objects:
        if o.type == 'MESH': w = o.modifiers.new('wf', 'WIREFRAME'); w.thickness = 0.003; w.use_replace = False
    shot('wireframe', (4.6, -5.6, 2.0), (0, -0.2, 0.75))
    for o in bpy.data.objects:
        if o.type == 'MESH' and 'wf' in o.modifiers: o.modifiers.remove(o.modifiers['wf'])
    SC.display.shading.color_type = 'MATERIAL'

exec(open(os.path.join(HERE, 'vehicle_full.py'), encoding='utf-8').read())
