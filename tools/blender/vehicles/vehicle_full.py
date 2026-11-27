# Full build stage (exec'd from build_vehicle.py after the body cage exists). Shares its globals.
import numpy as np
from mathutils.bvhtree import BVHTree

MAT.update({
    'Tyre': material('Tyre', srgb('#151617'), 0.85),
    'Rim': material('Rim', srgb('#c3c8cc'), 0.25, 1.0),
    'RimDark': material('RimDark', srgb('#3b4045'), 0.35, 0.8),
    'Brake': material('Brake', srgb('#5d6166'), 0.4, 0.9),
    'Caliper': material('Caliper', srgb('#a3262c'), 0.4, 0.2),
    'Leather': material('Leather', srgb(D.get('interior', '#8a4b3a')), 0.6),
    'LeatherDark': material('LeatherDark', srgb('#3a3330'), 0.6),
    'Dash': material('Dash', srgb('#3c3f44'), 0.7),
    'Wood': material('Wood', srgb('#5a3b26'), 0.45),
    'Carpet': material('Carpet', srgb('#1c1d20'), 0.97),
    'Headliner': material('Headliner', srgb('#d6d0c4'), 0.9),
    'Screen': material('Screen', srgb('#0b1219'), 0.2, emit=srgb('#0b1219'), emit_strength=1.0),
    'Plate': material('Plate', srgb('#f2f2ee'), 0.4),
    'Mirror': material('MirrorGlass', srgb('#a9b8c2'), 0.02, 1.0),
    'Light_Head': material('Light_Head', srgb('#dfe9f0'), 0.1, 0.0, emit=srgb('#ffffff'), emit_strength=0.4),
    'Light_DRL': material('Light_DRL', srgb('#eef8ff'), 0.1, 0.0, emit=srgb('#eef8ff'), emit_strength=3.0),
    'Light_Tail': material('Light_Tail', srgb('#9b1c24'), 0.15, 0.0, emit=srgb('#ff1e2c'), emit_strength=1.2),
    'Light_Brake': material('Light_Brake', srgb('#b3121e'), 0.15, 0.0, emit=srgb('#ff1e2c'), emit_strength=0.3),
    'Light_Reverse': material('Light_Reverse', srgb('#e8e8e8'), 0.1, 0.0, emit=srgb('#ffffff'), emit_strength=0.1),
    'Light_Indicator': material('Light_Indicator', srgb('#d98a1e'), 0.15, 0.0, emit=srgb('#ffa52e'), emit_strength=0.1),
    'Light_Interior': material('Light_Interior', srgb('#fff2dc'), 0.3, 0.0, emit=srgb('#ffe2b8'), emit_strength=0.6),
})

def emblem_material():
    """The Sen Viet emblem: a ring with a stylised lotus bud (three petals), drawn into a packed image."""
    n = 256; yy, xx = np.mgrid[0:n, 0:n]; u = (xx - n / 2) / (n / 2); v = (yy - n / 2) / (n / 2)
    r = np.hypot(u, v); img = np.zeros((n, n, 4), np.float32)
    ring = (r > 0.82) & (r < 0.95); disc = r < 0.95
    def petal(cx, ang, w, h):
        ca, sa = math.cos(ang), math.sin(ang); px = (u - cx) * ca + (v + 0.05) * sa; py = -(u - cx) * sa + (v + 0.05) * ca
        return (px / w) ** 2 + ((py - h * 0.45) / (h * 0.55)) ** 2 < 1
    lotus = petal(0, 0, 0.17, 0.95) | petal(-0.12, 0.55, 0.15, 0.78) | petal(0.12, -0.55, 0.15, 0.78)
    base = (np.abs(u) < 0.42) & (np.abs(v + 0.48) < 0.035)
    img[disc] = (0.05, 0.055, 0.06, 1); img[ring | lotus | base] = (0.85, 0.88, 0.9, 1)
    im = bpy.data.images.new('Emblem', n, n, alpha=True); im.pixels[:] = img.ravel(); im.pack()
    m = bpy.data.materials.new('Emblem'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Metallic'].default_value = 0.6; b.inputs['Roughness'].default_value = 0.25
    return m
MAT['Emblem'] = emblem_material()

def empty(name, loc=(0, 0, 0), parent=None, col='Body'):
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.1; collection(col).objects.link(e)
    if parent: e.parent = parent
    e.matrix_world = Matrix.Translation(Vector(loc))
    return e

def parent_keep(ob, parent):
    mw = ob.matrix_world.copy(); ob.parent = parent; ob.matrix_world = mw

def mesh_obj(name, bm, mats, col='Body', parent=None, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); collection(col).objects.link(ob)
    if parent: parent_keep(ob, parent)
    return ob

def rbox(name, size, loc, mat, bevel=0.02, seg=3, rot=(0, 0, 0), col='Interior', parent=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bm.transform(Matrix.Diagonal((*size, 1)))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); collection(col).objects.link(ob)
    if bevel > 0:
        b = ob.modifiers.new('bv', 'BEVEL'); b.width = min(bevel, min(size) * 0.45); b.segments = seg; b.limit_method = 'NONE'
        apply_mods(ob)
    ob.data.materials.append(MAT[mat] if isinstance(mat, str) else mat)
    for p in ob.data.polygons: p.use_smooth = True
    ob.matrix_world = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4()
    if parent: parent_keep(ob, parent)
    return ob
from mathutils import Euler

# ---------------------------------------------------------------- body: apply, arches, split parts
apply_mods(body); cut_arches(body)
for p in body.data.polygons: p.use_smooth = True
# wheel-arch trims: a slim dark band round each arch hides the cut edge
for a in AXLES:
    for sd in (1, -1):
        bm = bmesh.new(); r0, r1 = TYRE_R + 0.035, TYRE_R + 0.085; segs = 40; ring_o, ring_i = [], []
        for k in range(segs + 1):
            ang = math.radians(-12 + (204 * k / segs)); cy, cz = math.cos(ang), math.sin(ang)
            ring_i.append(bm.verts.new((0, -a + r0 * cy, TYRE_R + 0.01 + r0 * cz))); ring_o.append(bm.verts.new((0, -a + r1 * cy, TYRE_R + 0.01 + r1 * cz)))
        for k in range(segs): bm.faces.new((ring_i[k], ring_o[k], ring_o[k + 1], ring_i[k + 1]))
        # push every vertex onto the body side (ray from outside) so the band hugs the panel
        tmp = bmesh.new(); tmp.from_mesh(body.data); tree = __import__('mathutils').bvhtree.BVHTree.FromBMesh(tmp)
        for v in bm.verts:
            hit = tree.ray_cast(Vector((sd * 2.0, v.co.y, v.co.z)), Vector((-sd, 0, 0)))
            v.co.x = (hit[0].x + sd * 0.006) if hit[0] is not None else sd * (D['width'] / 2)
        tmp.free()
        if sd < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
        me = bpy.data.meshes.new('ArchTrim'); bm.to_mesh(me); bm.free(); me.materials.append(MAT['BlackTrim'])
        ob = bpy.data.objects.new('ArchTrim', me); collection('Body').objects.link(ob)

def split_by(ob, pred, name):
    """Move faces whose material name satisfies pred(name, face_center) into a new object (same world space)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    names = [m.name if m else '' for m in ob.data.materials]
    sel = [f for f in bm.faces if pred(names[f.material_index], f.calc_center_median())]
    if not sel: bm.free(); return None
    nbm = bmesh.new(); vmap = {}
    for f in sel:
        vs = []
        for v in f.verts:
            if v not in vmap: vmap[v] = nbm.verts.new(v.co)
            vs.append(vmap[v])
        nf = nbm.faces.new(vs); nf.material_index = f.material_index; nf.smooth = True
    bmesh.ops.delete(bm, geom=sel, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    me = bpy.data.meshes.new(name); nbm.to_mesh(me); nbm.free()
    for m in ob.data.materials: me.materials.append(m)
    o2 = bpy.data.objects.new(name, me); collection('Body').objects.link(o2); o2.matrix_world = ob.matrix_world.copy()
    return o2

def base_materials(ob):
    for i, m in enumerate(ob.data.materials):
        if m and '__' in m.name: ob.data.materials[i] = MAT[m.name.split('__')[0]]
        elif m is None: ob.data.materials[i] = MAT['Liner']
    used = {p.material_index for p in ob.data.polygons}
    for i in sorted(range(len(ob.data.materials)), reverse=True):
        if i not in used: ob.data.materials.pop(index=i)

ROOT = empty('VehicleRoot', col='Root'); BODYROOT = empty('BodyRoot', parent=ROOT)
parent_keep(body, BODYROOT)
parts = {}
for tag, side, nm in (('DF', 1, 'Door_FL'), ('DF', -1, 'Door_FR'), ('DR', 1, 'Door_RL'), ('DR', -1, 'Door_RR'), ('TG', 0, 'Trunk')):
    o = split_by(body, lambda n, c, tag=tag, side=side: n.endswith('__' + tag) and (side == 0 or c.x * side > 0), nm)
    if o: parts[nm] = o
for o in [body] + list(parts.values()): base_materials(o)
glass = split_by(body, lambda n, c: n == 'Glass', 'Glass'); parent_keep(glass, BODYROOT)
def bbox(o):
    ws = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(v[i] for v in ws) for i in range(3)]), Vector([max(v[i] for v in ws) for i in range(3)])
PIVOTS = {}
for nm, o in parts.items():
    lo, hi = bbox(o); c = (lo + hi) / 2
    if nm == 'Trunk': piv = Vector((0, lo.y + 0.01, hi.z - 0.01))
    elif nm.startswith('Door_R') and Z.get('rearDoorType') == 'sliding': piv = c.copy()
    else: piv = Vector((hi.x if nm.endswith('L') else lo.x, lo.y + 0.02, c.z))  # hinge at the door's front edge
    pe = empty(nm + '_Pivot', piv, BODYROOT); PIVOTS[nm] = pe
    o.data.transform(Matrix.Translation(c) @ Matrix.Scale(0.994, 4) @ Matrix.Translation(-c))  # panel gaps
    parent_keep(o, pe)
    g = split_by(o, lambda n, cc: n == 'Glass', nm + '_Glass')
    if g: parent_keep(g, o); base_materials(o); base_materials(g)

# ---------------------------------------------------------------- surface helpers (project features onto the body)
def bvh_of(objs):
    bm = bmesh.new()
    for o in objs:
        t = bmesh.new(); t.from_mesh(o.data); t.transform(o.matrix_world); tm = bpy.data.meshes.new('t'); t.to_mesh(tm); t.free(); bm.from_mesh(tm); bpy.data.meshes.remove(tm)
    return BVHTree.FromBMesh(bm)
SURF = bvh_of([body] + list(parts.values()))

def on_surface(x, z, front=True, off=0.004):
    o = Vector((x, -5 if front else 5, z)); d = Vector((0, 1 if front else -1, 0))
    hit = SURF.ray_cast(o, d)
    if hit[0] is None: return None, None
    return hit[0] + hit[1] * off, hit[1]

def on_side(y, z, side, off=0.004):
    o = Vector((side * 3, y, z)); d = Vector((-side, 0, 0)); hit = SURF.ray_cast(o, d)
    if hit[0] is None: return None, None
    return hit[0] + hit[1] * off, hit[1]

def ribbon(name, pts, half_h, mat, front=True, depth=0.012, col='Body', parent=None, side=None, hh=None):
    """A strip following a polyline of (x, z) on the nose / tail (or (y, z) on a side), projected onto the body."""
    bm = bmesh.new(); top, bot, topb, botb = [], [], [], []
    for ii, (a, z) in enumerate(pts):
        if hh: half_h = hh[ii]
        hu = on_surface(a, z + half_h, front) if side is None else on_side(a, z + half_h, side)
        hd = on_surface(a, z - half_h, front) if side is None else on_side(a, z - half_h, side)
        if hu[0] is None or hd[0] is None: continue
        top.append(bm.verts.new(hu[0])); bot.append(bm.verts.new(hd[0]))
        topb.append(bm.verts.new(hu[0] - hu[1] * depth)); botb.append(bm.verts.new(hd[0] - hd[1] * depth))
    for i in range(len(top) - 1):
        bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
        bm.faces.new((top[i], top[i + 1], topb[i + 1], topb[i])); bm.faces.new((botb[i], botb[i + 1], bot[i + 1], bot[i]))
    if len(top) > 1:
        bm.faces.new((bot[0], top[0], topb[0], botb[0])); bm.faces.new((top[-1], bot[-1], botb[-1], topb[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, [MAT[mat] if isinstance(mat, str) else mat], col=col, parent=parent)

def patch(name, x0, x1, z0, z1, mat, front=True, nx=12, nz=6, depth=0.006, col='Body', parent=None, shape=None):
    bm = bmesh.new(); grid = {}
    for i in range(nx + 1):
        for k in range(nz + 1):
            x = x0 + (x1 - x0) * i / nx; z = z0 + (z1 - z0) * k / nz; p, n = on_surface(x, z, front, off=depth)
            if p is not None: grid[(i, k)] = bm.verts.new(p)
    for i in range(nx):
        for k in range(nz):
            q = [grid.get(t) for t in ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))]
            if None in q: continue
            if shape and not shape((i + 0.5) / nx, (k + 0.5) / nz): continue
            bm.faces.new(q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, [MAT[mat] if isinstance(mat, str) else mat], col=col, parent=parent)

def disc_on(name, p, n, r, mat, col='Body', parent=None):
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, radius=r, segments=32)
    q = Vector((0, 0, 1)).rotation_difference(n); bm.transform(Matrix.Translation(p) @ q.to_matrix().to_4x4())
    uv = bm.loops.layers.uv.new()
    for f in bm.faces:
        for l in f.loops:
            lv = q.inverted() @ (l.vert.co - p); l[uv].uv = (lv.x / (2 * r) + 0.5, lv.y / (2 * r) + 0.5)
    return mesh_obj(name, bm, [MAT[mat] if isinstance(mat, str) else mat], col=col, parent=parent)

def plate(name, p, n, parent):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bm.transform(Matrix.Diagonal((0.52, 0.11, 0.012, 1)))
    uv = bm.loops.layers.uv.new()
    for f in bm.faces:
        for l in f.loops: l[uv].uv = (l.vert.co.x / 0.52 + 0.5, l.vert.co.y / 0.11 + 0.5)
    bm.transform(Matrix.Translation(p) @ Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4())
    return mesh_obj(name, bm, [MAT['Plate']], parent=parent, smooth=False)

DF = D.get('front', {}); DR_ = D.get('rear', {})
LIGHTS = empty('Lights', parent=BODYROOT)
# ---- front: the brand's "lotus line" DRL across the nose, slim headlamps under it, grille, lower intake, emblem
fz = DF.get('drlZ', 0.86); hwF = DF.get('halfW', 0.86)
for s, sfx in ((1, 'L'), (-1, 'R')):
    pts = [(s * (0.04 + (hwF - 0.04) * t), fz + 0.07 * (t ** 3) - 0.012 * math.sin(math.pi * t)) for t in np.linspace(0, 1, 20)]
    ribbon(f'DRL_{sfx}', pts, 0.009, 'Light_DRL', parent=LIGHTS)
    ribbon(f'Headlight_{sfx}', [(s * (hwF * 0.62 + hwF * 0.35 * t), fz - 0.06 + 0.035 * t) for t in np.linspace(0, 1, 10)], 0.026, 'Light_Head', parent=LIGHTS)
    ribbon(f'HeadlightHousing_{sfx}', [(s * (hwF * 0.6 + hwF * 0.39 * t), fz - 0.06 + 0.035 * t) for t in np.linspace(0, 1, 10)], 0.036, 'BlackGloss', depth=0.006, parent=BODYROOT)
    ribbon(f'Indicator_F{sfx}', [(s * (hwF * 0.8 + 0.12 * t), fz - 0.1 + 0.02 * t) for t in np.linspace(0, 1, 5)], 0.007, 'Light_Indicator', parent=LIGHTS)
    ribbon(f'Fog_{sfx}', [(s * (hwF * 0.78 + 0.1 * t), 0.43) for t in np.linspace(0, 1, 4)], 0.013, 'Light_Head', parent=LIGHTS)
gz1 = fz - 0.085; gz0 = DF.get('grilleBottom', 0.5)
gz0 = gz1 - 0.11; gx = np.linspace(-hwF * 0.62, hwF * 0.62, 31); gh = [0.055 * (1 - (abs(x) / (hwF * 0.62)) ** 4) + 0.006 for x in gx]
ribbon('Grille', [(x, gz1 - h) for x, h in zip(gx, gh)], 0, 'BlackGloss', depth=0.006, parent=BODYROOT, hh=gh)
for i in range(-7, 8):  # satin vertical slats: a lotus-stem rhythm
    x = i * hwF * 0.07
    ribbon(f'GrilleSlat_{i + 7}', [(x - 0.004, (gz0 + gz1) / 2), (x + 0.004, (gz0 + gz1) / 2)], (gz1 - gz0) * 0.42, 'Satin', depth=0.004, parent=BODYROOT)
ix = np.linspace(-hwF * 0.6, hwF * 0.6, 25); ih = [0.065 * (1 - (abs(x) / (hwF * 0.6)) ** 6) + 0.004 for x in ix]
ribbon('LowerIntake', [(x, 0.365) for x in ix], 0, 'BlackGloss', depth=0.006, parent=BODYROOT, hh=ih)
ribbon('IntakeFrame', [(x, 0.445) for x in np.linspace(-hwF * 0.55, hwF * 0.55, 20)], 0.006, 'Satin', depth=0.004, parent=BODYROOT)
patch('SkidFront', -hwF * 0.42, hwF * 0.42, 0.262, 0.292, 'Satin', nx=10, nz=1)
pe, ne = on_surface(0, gz1 + 0.035, True, off=0.008); disc_on('Emblem_Front', pe, ne, 0.05, 'Emblem', parent=BODYROOT)
pp, pn = on_surface(0, 0.54, True, off=0.012); plate('Plate_Front', pp, pn, BODYROOT)
# ---- rear: a full-width tail bar with petal ends, brake / reverse / indicator units, emblem, plate
rz = DR_.get('barZ', 1.12); hwR = DR_.get('halfW', 0.84)
TGP = PIVOTS.get('Trunk')
ribbon('Taillight_Bar', [(x, rz) for x in np.linspace(-hwR * 0.84, hwR * 0.84, 26)], 0.014, 'Light_Tail', front=False, parent=TGP or LIGHTS)
for s, sfx in ((1, 'L'), (-1, 'R')):
    ribbon(f'Taillight_{sfx}', [(s * (hwR * 0.84 + 0.14 * t), rz - 0.04 * t - 0.18 * t * t) for t in np.linspace(0, 1, 9)], 0.026, 'Light_Tail', front=False, parent=LIGHTS)
    ribbon(f'BrakeLight_{sfx}', [(s * (hwR * 0.87 + 0.07 * t), rz - 0.03 - 0.05 * t) for t in np.linspace(0, 1, 4)], 0.012, 'Light_Brake', front=False, parent=LIGHTS)
    ribbon(f'Indicator_R{sfx}', [(s * (hwR * 0.93 + 0.05 * t), rz - 0.16 - 0.05 * t) for t in np.linspace(0, 1, 4)], 0.012, 'Light_Indicator', front=False, parent=LIGHTS)
    ribbon(f'ReverseLight_{sfx}', [(s * (hwR * 0.55 + 0.12 * t), 0.44) for t in np.linspace(0, 1, 4)], 0.012, 'Light_Reverse', front=False, parent=LIGHTS)
ribbon('HighMountedBrakeLight', [(x, S[-3]['edge'] - 0.03) for x in np.linspace(-0.25, 0.25, 6)], 0.008, 'Light_Brake', front=False, parent=TGP or LIGHTS)
pe, ne = on_surface(0, rz - 0.1, False, off=0.008); disc_on('Emblem_Rear', pe, ne, 0.048, 'Emblem', parent=TGP or BODYROOT)
pp, pn = on_surface(0, rz - 0.34, False, off=0.012); plate('Plate_Rear', pp, pn, TGP or BODYROOT)
patch('RearBumperTrim', -hwR * 0.72, hwR * 0.72, 0.34, 0.40, 'BlackTrim', front=False, nx=14, nz=2)
patch('SkidRear', -hwR * 0.5, hwR * 0.5, 0.30, 0.33, 'Satin', front=False, nx=10, nz=1)
exec(open(os.path.join(HERE, 'vehicle_full2.py'), encoding='utf-8').read())
