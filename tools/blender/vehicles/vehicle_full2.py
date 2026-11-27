# Full build, part 2: side details, wheels, interior, anchors, LODs, export, previews. Shares build_vehicle.py globals.

# ---- side details: mirrors (on the front doors), handles, sill strip, roof rails, wipers
for s, sfx in ((1, 'L'), (-1, 'R')):
    door = PIVOTS.get('Door_F' + sfx)
    ws0 = max(Z['windshield']); sb = S[[i for i, q in enumerate(S) if q['z'] <= ws0][0]]
    my = -(ws0 - 0.22); p, n = on_side(my, sb['belt'] + 0.1, s)
    if p is not None:
        cx = p.x + s * 0.13
        rbox(f'Mirror_{sfx}', (0.2, 0.07, 0.1), (cx, my, p.z + 0.02), 'Paint', 0.025, rot=(0.0, 0.0, -s * 0.12), col='Body', parent=door)
        rbox(f'MirrorBase_{sfx}', (0.2, 0.072, 0.03), (cx, my, p.z - 0.035), 'BlackGloss', 0.01, rot=(0.0, 0.0, -s * 0.12), col='Body', parent=door)
        rbox(f'MirrorArm_{sfx}', (0.1, 0.04, 0.03), (p.x + s * 0.05, my + 0.02, p.z - 0.02), 'BlackTrim', 0.01, col='Body', parent=door)
        rbox(f'MirrorGlass_{sfx}', (0.18, 0.004, 0.085), (cx, my + 0.037, p.z + 0.025), 'Mirror', 0.002, rot=(0.0, 0.0, -s * 0.12), col='Body', parent=door)
        ribbon(f'Indicator_Mirror{sfx}', [(my - 0.05 + 0.1 * t, p.z - 0.035) for t in np.linspace(0, 1, 4)], 0.006, 'Light_Indicator', side=s, parent=door) if False else None
    for nm in ('Door_F', 'Door_R'):
        piv = PIVOTS.get(nm + sfx)
        if not piv: continue
        lo, hi = bbox(parts[nm + sfx]); hy = lo.y + (hi.y - lo.y) * (0.72 if nm == 'Door_F' else 0.18)
        hp, hn = on_side(hy, sb['belt'] - 0.11, s, off=0.008)
        if hp is not None: rbox(f'Handle_{nm[-1]}{sfx}', (0.03, 0.17, 0.035), tuple(hp), 'Chrome' if nm == 'Door_R' else 'Paint', 0.012, col='Body', parent=piv)
    # sill chrome line between the arches
    ribbon(f'SillStrip_{sfx}', [(-(D['axleF'] - TYRE_R - 0.1) + t * (D['axleF'] - D['axleR'] - 2 * TYRE_R - 0.2), 0.33) for t in np.linspace(0, 1, 16)], 0.012, 'Satin', side=s, parent=BODYROOT)
    # roof rail
    y0, y1 = -(min(Z['windshield']) - 0.15), -(min(Z['dPillar']) + 0.05)
    rbox(f'RoofRail_{sfx}', (0.03, abs(y1 - y0), 0.035), (s * S[9]['hwE'] * 0.8, (y0 + y1) / 2, S[9]['top'] - 0.03), 'Satin', 0.012, col='Body', parent=BODYROOT)
for s in (1, -1):  # wipers at the windshield base
    ws = S[[i for i, q in enumerate(S) if q['z'] <= max(Z['windshield'])][0]]
    rbox(f'Wiper_{s}', (0.55, 0.012, 0.012), (s * 0.3, -max(Z['windshield']) + 0.06, ws['edge'] + 0.03), 'BlackTrim', 0.004, rot=(0, 0, s * 0.12), col='Body', parent=BODYROOT)

# ---- wheels: lathed tyre, dished rim with five petal spokes (brand rim language), disc and caliper
def lathe(name, prof, seg, mat):
    bm = bmesh.new(); ring0 = None; rings = []
    for k in range(seg):
        a = 2 * math.pi * k / seg; ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, r * ca, r * sa)) for (r, x) in prof])
    for k in range(seg):
        A, B = rings[k], rings[(k + 1) % seg]
        for j in range(len(prof) - 1): bm.faces.new((A[j], A[j + 1], B[j + 1], B[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

RIM_R = D['tyre'][2] * 0.0254 / 2
def build_wheel(prefix, side):
    objs = []
    h = TYRE_W / 2
    tp = [(RIM_R + 0.01, -h + 0.02), (TYRE_R - 0.055, -h), (TYRE_R - 0.015, -h + 0.012), (TYRE_R, -h + 0.045), (TYRE_R, h - 0.045), (TYRE_R - 0.015, h - 0.012), (TYRE_R - 0.055, h), (RIM_R + 0.01, h - 0.02)]
    objs.append(mesh_obj(prefix + '_Tyre', lathe('t', tp, 48, 'Tyre'), [MAT['Tyre']], col='Wheels'))
    rp = [(RIM_R, h - 0.02), (RIM_R * 0.96, h - 0.05), (RIM_R * 0.95, -h + 0.04)]
    objs.append(mesh_obj(prefix + '_Barrel', lathe('b', rp, 40, 'Rim'), [MAT['Rim']], col='Wheels'))
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, radius=RIM_R * 0.94, segments=40); bm.transform(Matrix.Translation((h - 0.075, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    objs.append(mesh_obj(prefix + '_RimFace', bm, [MAT['RimDark']], col='Wheels'))
    for k in range(5):  # petal spokes: each a pair of tapered blades meeting at the rim
        for d in (-1, 1):
            a = 2 * math.pi * k / 5 + d * 0.13
            bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
            for v in bm.verts:
                t = v.co.z + 0.5; v.co.y *= 0.02 + 0.03 * t; v.co.z = 0.07 + t * (RIM_R * 0.86 - 0.07); v.co.x *= 0.03; v.co.x -= t * 0.02
            bm.transform(Matrix.Translation((h - 0.035, 0, 0)) @ Matrix.Rotation(a, 4, 'X'))
            objs.append(mesh_obj(f'{prefix}_Spoke{k}{d}', bm, [MAT['Rim']], col='Wheels', smooth=False))
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.075, radius2=0.065, depth=0.04); bm.transform(Matrix.Translation((h - 0.03, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    objs.append(mesh_obj(prefix + '_Hub', bm, [MAT['Rim']], col='Wheels'))
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, radius=0.034, segments=24); bm.transform(Matrix.Translation((h - 0.008, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    uv = bm.loops.layers.uv.new()
    for f in bm.faces:
        for l in f.loops: l[uv].uv = (l.vert.co.y / 0.068 + 0.5, l.vert.co.z / 0.068 + 0.5)
    objs.append(mesh_obj(prefix + '_Cap', bm, [MAT['Emblem']], col='Wheels'))
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=36, radius1=RIM_R * 0.78, radius2=RIM_R * 0.78, depth=0.025); bm.transform(Matrix.Translation((-0.02, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    objs.append(mesh_obj(prefix + '_Disc', bm, [MAT['Brake']], col='Wheels'))
    if side < 0:
        for o in objs: o.data.transform(Matrix.Scale(-1, 4, (1, 0, 0))); o.data.flip_normals()
    return objs, objs[-1]

WHEELS = {}
for z, fr in ((D['axleF'], 'F'), (D['axleR'], 'R')):
    for s, sfx in ((1, 'L'), (-1, 'R')):
        c = Vector((s * D['track'] / 2, -z, TYRE_R))
        steer = empty(f'Wheel_{fr}{sfx}_Steer', c, BODYROOT) if fr == 'F' else None
        spin = empty(f'Wheel_{fr}{sfx}_Spin', c, steer or BODYROOT)
        objs, disc = build_wheel(f'Wheel_{fr}{sfx}', s)
        for o in objs: o.matrix_world = Matrix.Translation(c); parent_keep(o, spin)
        cal = rbox(f'Caliper_{fr}{sfx}', (0.05, 0.09, 0.14), (c.x - s * 0.02, c.y + 0.12, c.z + 0.1), 'Caliper', 0.015, col='Wheels', parent=steer or BODYROOT)
        WHEELS[fr + sfx] = spin

# ---- interior: fitted to the cabin (floor, side walls from rays), seats in the design's layout
INT = empty('Interior', parent=BODYROOT)
CAB = D['cabin']; FL = CAB['floor']; HW = CAB['halfW']
def floor_at(z): return FL if z > CAB.get('zStep', -9) else CAB.get('floorRear', FL)
zF, zB = CAB['zFront'], CAB['zBack']
rbox('Floor', (HW * 2, zF - zB, 0.03), (0, -(zF + zB) / 2, FL - 0.015), 'Carpet', 0.005, parent=INT)
hz0 = min(Z['windshield']) - 0.05; rbox('Headliner', (HW * 1.8, hz0 - zB - 0.1, 0.02), (0, -(hz0 + zB) / 2 + 0.05, CAB['roof'] - 0.01), 'Headliner', 0.008, parent=INT)
# dashboard: soft upper, wood + satin trim, vents, glovebox, ambient line, two screens, cluster hood
DASH = empty('Dashboard', parent=INT); dz1 = CAB['rows'][0] + 0.62; dz0 = zF - 0.02; dt = CAB['dashTop']
rbox('DashUpper', (HW * 2 - 0.04, dz0 - dz1, 0.2), (0, -(dz0 + dz1) / 2, dt - 0.1), 'Dash', 0.06, parent=DASH)
rbox('DashLower', (HW * 2 - 0.1, (dz0 - dz1) * 0.7, 0.3), (0, -(dz0 + dz1) / 2 + 0.06, dt - 0.33), 'Dash', 0.05, parent=DASH)
rbox('DashWood', (HW * 2 - 0.12, 0.03, 0.05), (0, -dz1 - 0.01, dt - 0.2), 'Wood', 0.012, parent=DASH)
rbox('DashSatin', (HW * 2 - 0.12, 0.035, 0.012), (0, -dz1 - 0.012, dt - 0.17), 'Satin', 0.004, parent=DASH)
rbox('AmbientLine', (HW * 2 - 0.16, 0.008, 0.006), (0, -dz1 + 0.012, dt - 0.235), 'Light_Interior', 0.0, parent=DASH)
for x in (-0.6, -0.18, 0.18, 0.6): rbox(f'Vent_{x}', (0.16, 0.03, 0.05), (x, -dz1 + 0.005, dt - 0.11), 'BlackGloss', 0.012, parent=DASH)
rbox('Glovebox', (0.36, 0.04, 0.16), (-0.42, -dz1 - 0.05, dt - 0.34), 'Dash', 0.02, parent=DASH)
sw, sh = 0.64, 0.16
rbox('ScreenBezel', (sw + 0.03, 0.02, sh + 0.025), (0.42 - sw / 2 + 0.05, -dz1 - 0.12, dt + 0.06), 'BlackGloss', 0.008, rot=(-0.12, 0, 0), parent=DASH)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); bm.transform(Matrix.Diagonal((sw, sh, 1, 1)))
uv = bm.loops.layers.uv.new()
for f in bm.faces:
    for l in f.loops: l[uv].uv = (0.5 - l.vert.co.x / sw, l.vert.co.y / sh + 0.5)
bm.transform(Matrix.Translation((0.42 - sw / 2 + 0.05, -dz1 - 0.108, dt + 0.06)) @ Matrix.Rotation(-0.12, 4, 'X') @ Matrix.Rotation(math.pi / 2, 4, 'X'))
mesh_obj('Screen', bm, [MAT['Screen']], col='Interior', parent=DASH, smooth=False)
# steering wheel (driver on +X), pedals
SWP = empty('SteeringWheel_Pivot', (0.4, -(CAB['rows'][0] + 0.42), dt - 0.03), INT)
bpy.ops.mesh.primitive_torus_add(major_radius=0.185, minor_radius=0.02, major_segments=36, minor_segments=10, location=(0, 0, 0)); tor = bpy.context.active_object; tor.name = 'SteeringRim'
for c in tor.users_collection: c.objects.unlink(tor)
collection('Interior').objects.link(tor); tor.data.materials.append(MAT['LeatherDark'])
for p in tor.data.polygons: p.use_smooth = True
tor.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X')); tor.matrix_world = SWP.matrix_world @ Matrix.Rotation(-0.38, 4, 'X'); parent_keep(tor, SWP)
hub = rbox('SteeringHub', (0.15, 0.05, 0.11), (0, 0, 0), 'Dash', 0.02, parent=None); hub.matrix_world = SWP.matrix_world @ Matrix.Rotation(-0.38, 4, 'X'); parent_keep(hub, SWP)
d = disc_on('SteeringEmblem', Vector((0, 0, 0)), Vector((0, -1, 0)), 0.025, 'Emblem'); d.matrix_world = SWP.matrix_world @ Matrix.Rotation(-0.38, 4, 'X') @ Matrix.Translation((0, -0.027, 0)); parent_keep(d, SWP)
for a in (0, math.pi, -math.pi / 2):
    sp = rbox(f'SteeringSpoke{a:.1f}', (0.11, 0.022, 0.035), (0, 0, 0), 'Dash', 0.008); sp.matrix_world = SWP.matrix_world @ Matrix.Rotation(-0.38, 4, 'X') @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Translation((0.11, 0, 0)); parent_keep(sp, SWP)
col_ = rbox('SteeringColumn', (0.07, 0.3, 0.07), (0.4, -(CAB['rows'][0] + 0.42) - 0.16, dt - 0.09), 'Dash', 0.02, rot=(-0.38, 0, 0), parent=INT)
for x in (0.33, 0.46): rbox(f'Pedal_{x}', (0.06, 0.02, 0.1), (x, -(zF - 0.12), FL + 0.13), 'Satin', 0.006, rot=(0.5, 0, 0), parent=INT)
# centre console: bridge with wireless pad, rotary knob, cup holders, armrest
cz0, cz1 = dz1 + 0.05, CAB['rows'][0] - 0.3; cy = FL + 0.42
rbox('ConsoleBridge', (0.26, cz0 - cz1, 0.08), (0, -(cz0 + cz1) / 2, cy), 'Dash', 0.03, parent=INT)
rbox('ConsoleStem', (0.22, 0.3, cy - FL - 0.04), (0, -(cz0 - 0.15), (cy + FL) / 2), 'Dash', 0.03, parent=INT)
rbox('WirelessPad', (0.14, 0.12, 0.008), (0, -(cz0 - 0.12), cy + 0.044), 'BlackGloss', 0.003, parent=INT)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.04, radius2=0.035, depth=0.035); bm.transform(Matrix.Translation((0, -(cz0 - 0.3), cy + 0.06)))
mesh_obj('GearKnob', bm, [MAT['Chrome']], col='Interior', parent=INT)
rbox('Armrest', (0.24, 0.32, 0.07), (0, -(cz1 + 0.17), cy + 0.07), 'Leather', 0.03, parent=INT)
# seats per row: cushion, bolsters, backrest, headrest (+ VIP leg rests on row 2 of the MPV), belts and red buckles
SEATS = empty('Seats', parent=INT); RED = material('BuckleRed', srgb('#c8102e'), 0.5)
anchors = {}
for row, n in enumerate(D['seats']):
    z = CAB['rows'][row]; fl = floor_at(z); front = row == 0; vip = D.get('vipRow') == row; last = row == len(D['seats']) - 1 and row > 0
    usable = HW * 2 - (0.34 if (front or vip) else 0.1); w = min(0.56, usable / n)
    fold = empty(f'SeatFold_R{row + 1}', (0, -(z - 0.27), fl + 0.4), SEATS) if last else None
    for k in range(n):
        x = -usable / 2 + usable / n * (k + 0.5)
        if front or vip: x = (1 if k == 0 else -1) * (0.17 + w / 2)
        sw2 = w - 0.04; ch = fl + 0.36; y = -z; nm = f'Seat_R{row + 1}_{k + 1}'
        grp = empty(nm, (x, y, ch), SEATS)
        rbox(nm + '_Cushion', (sw2, 0.52, 0.13), (x, y, ch - 0.065), 'Leather', 0.05, parent=grp)
        for dd in (-1, 1): rbox(f'{nm}_Bolster{dd}', (0.06, 0.48, 0.1), (x + dd * (sw2 / 2 - 0.03), y, ch + 0.01), 'Leather', 0.03, rot=(0, dd * 0.25, 0), parent=grp)
        rbox(nm + '_Base', (sw2 - 0.04, 0.4, ch - fl - 0.13), (x, y + 0.02, (ch - 0.13 + fl) / 2), 'Dash', 0.03, parent=grp)
        bp = fold or grp
        rbox(nm + '_Back', (sw2, 0.13, 0.66), (x, y + 0.25, fl + 0.7), 'Leather', 0.05, rot=(-0.17, 0, 0), parent=bp)
        rbox(nm + '_Head', (0.25, 0.09, 0.17), (x, y + 0.31, fl + 1.12), 'Leather', 0.04, parent=bp)
        rbox(nm + '_Belt', (0.045, 0.006, 0.62), (x + sw2 * 0.32, y + 0.16, ch + 0.3), 'BlackTrim', 0.0, rot=(0.2, 0.42, 0), parent=grp)
        rbox(nm + '_Buckle', (0.032, 0.055, 0.045), (x - sw2 / 2 - 0.012, y + 0.12, ch + 0.03), RED, 0.008, parent=grp)
        if vip:
            rbox(nm + '_LegRest', (sw2 * 0.85, 0.34, 0.06), (x, y - 0.42, ch - 0.12), 'Leather', 0.025, rot=(1.0, 0, 0), parent=grp)
            for dd in (-1, 1): rbox(f'{nm}_Arm{dd}', (0.075, 0.4, 0.08), (x + dd * (sw2 / 2 + 0.035), y + 0.04, ch + 0.16), 'Leather', 0.03, parent=grp)
        anchors.setdefault(row, []).append((x, y, ch))
# door trims (move with the doors), boot items, dome light, sun visors, interior mirror
for nm, piv in PIVOTS.items():
    if not nm.startswith('Door'): continue
    lo, hi = bbox(parts[nm]); sgn = 1 if nm.endswith('L') else -1
    rbox(nm + '_Trim', (0.03, (hi.y - lo.y) - 0.1, 0.5), (sgn * (HW - 0.01), (lo.y + hi.y) / 2, FL + 0.45), 'Leather', 0.012, col='Interior', parent=piv)
    rbox(nm + '_TrimTop', (0.06, (hi.y - lo.y) - 0.12, 0.05), (sgn * (HW - 0.03), (lo.y + hi.y) / 2, FL + 0.72), 'Dash', 0.015, col='Interior', parent=piv)
rbox('BootBag1', (0.42, 0.24, 0.28), (0.3, -(zB + 0.18), floor_at(zB) + 0.16), 'Dash', 0.05, parent=INT)
rbox('BootBag2', (0.32, 0.2, 0.22), (-0.25, -(zB + 0.2), floor_at(zB) + 0.13), RED, 0.05, parent=INT)
rbox('InteriorLight', (0.22, 0.12, 0.012), (0, -(CAB['rows'][0] + 0.1), CAB['roof'] - 0.025), 'Light_Interior', 0.004, parent=INT)
for s in (1, -1): rbox(f'SunVisor_{s}', (0.32, 0.16, 0.015), (s * 0.35, -(dz1 - 0.1), CAB['roof'] - 0.04), 'Headliner', 0.006, parent=INT)
rbox('RearViewMirror', (0.22, 0.02, 0.06), (0, -(dz1 - 0.05), CAB['roof'] - 0.12), 'BlackTrim', 0.01, parent=INT)

# ---- anchors and collision proxy
AN = empty('Anchors', parent=ROOT)
r0 = anchors[0]
def anc(name, p): empty(name, p, AN)
anc('Anchor_DriverSeat', r0[0]); anc('Anchor_FrontPassenger', r0[-1])
if 1 in anchors: anc('Anchor_RearSeats', (0, anchors[1][0][1], anchors[1][0][2]))
if 2 in anchors: anc('Anchor_ThirdRow', (0, anchors[2][0][1], anchors[2][0][2]))
anc('Anchor_EnterDriver', (D['width'] / 2 + 0.6, r0[0][1] - 0.1, 0.0)); anc('Anchor_ExitDriver', (D['width'] / 2 + 0.8, r0[0][1], 0.0))
anc('Anchor_Cargo', (0, -(zB + 0.25), floor_at(zB) + 0.1)); anc('Anchor_CameraInterior', (r0[0][0], r0[0][1] + 0.1, r0[0][2] + 0.64))
anc('Anchor_CameraThirdPerson', (0, D['length'] * 1.2, 2.6)); anc('Anchor_CameraRear', (0, D['length'] / 2 + 0.6, 1.2)); anc('Anchor_CameraShowroom', (-4.5, -5.8, 1.8))
CP = empty('CollisionProxies', parent=ROOT)
cp = rbox('CollisionProxy_Body', (D['width'], D['length'], D['height'] - D.get('clearance', 0.17)), (0, 0, (D['height'] + D.get('clearance', 0.17)) / 2), 'Underbody', 0.0, col='Body', parent=CP)

# ---- parent every loose object under the root hierarchy
for o in list(bpy.data.objects):
    if o.parent is None and o is not ROOT and o.name != 'PreviewCam': parent_keep(o, BODYROOT)

# ---------------------------------------------------------------- LODs, export, metadata
def tris_of(objs): return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')
def descendants(o):
    out = [o]
    for c in o.children: out += descendants(c)
    return out
ALL = descendants(ROOT); INTERIOR = descendants(INT)
meshes = [o for o in ALL if o.type == 'MESH']
stats = {'lod0': tris_of(meshes)}
GLB_DIR = argv[argv.index('--glb') + 1] if '--glb' in argv else OUT
os.makedirs(GLB_DIR, exist_ok=True)
def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_extras=True, export_yup=True)
cp.hide_render = True
# the editable source keeps every part as its own named object (Headlight_L, Door_FL, ...)
BLEND_DIR = argv[argv.index('--blend') + 1] if '--blend' in argv else OUT
os.makedirs(BLEND_DIR, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, f"{D['id']}.blend"))
if '--no-previews' not in argv: render_previews()

# game export: fewer materials (similar ones share), meshes joined per rigid group (one mesh per moving part,
# one primitive per material) to cut draw calls; LOD1 / LOD2 are joined further and decimated to the spec budgets
REMAP0 = {'Underbody': 'BlackTrim', 'Liner': 'BlackTrim', 'MirrorGlass': 'Chrome', 'Rim': 'Satin', 'Brake': 'RimDark', 'Caliper': 'BuckleRed', 'LeatherDark': 'Dash', 'Wood': 'Dash', 'GlassDark': 'Glass'}
REMAP2 = {'BlackGloss': 'BlackTrim', 'Satin': 'Chrome', 'RimDark': 'BlackTrim', 'Tyre': 'BlackTrim', 'Emblem': 'Chrome', 'Plate': 'Chrome', 'BuckleRed': 'Light_Tail',
          'Light_DRL': 'Light_Head', 'Light_Brake': 'Light_Tail', 'Light_Reverse': 'Light_Head', 'Light_Indicator': 'Light_Tail', 'Light_Interior': 'Light_Head'}
def remap(objs, table):
    for o in objs:
        if o.type != 'MESH': continue
        for i, m in enumerate(o.data.materials):
            if m and m.name in table: o.data.materials[i] = bpy.data.materials[table[m.name]]
        # merge duplicate slots
        names = [m.name if m else '' for m in o.data.materials]; first = {}
        idx_map = {}
        for i, n in enumerate(names): idx_map[i] = first.setdefault(n, i)
        for poly in o.data.polygons: poly.material_index = idx_map[poly.material_index]
        used = {pp.material_index for pp in o.data.polygons}
        for i in sorted(range(len(o.data.materials)), reverse=True):
            if i not in used: o.data.materials.pop(index=i)
ANIMATED = ('_Pivot', '_Spin', '_Steer', 'SeatFold_')
def iter_parents(o):
    q = o.parent
    while q is not None:
        yield q; q = q.parent
def group_of(o, animated=ANIMATED):
    for q in iter_parents(o):
        if q.type == 'EMPTY' and any(k in q.name for k in animated): return q, q.name
    ps = list(iter_parents(o))
    if any(x is SEATS for x in ps): return SEATS, 'Seats'
    if any(x is INT for x in ps): return INT, 'Interior'
    return BODYROOT, 'Body'
def join_groups(objs, animated=ANIMATED, tag=''):
    groups = {}
    for o in objs:
        if o.type == 'MESH' and not o.name.startswith('CollisionProxy'):
            node, key = group_of(o, animated); groups.setdefault(key, (node, []))[1].append(o)
    out = {}
    for key, (node, members) in groups.items():
        me = bpy.data.meshes.new(f'G{tag}_' + key); tgt = bpy.data.objects.new(f'G{tag}_' + key, me); collection('Body').objects.link(tgt)
        tgt.parent = node; tgt.matrix_world = node.matrix_world.copy()
        bpy.ops.object.select_all(action='DESELECT')
        for o in members: o.select_set(True)
        tgt.select_set(True); bpy.context.view_layer.objects.active = tgt
        bpy.ops.object.join(); out[key] = tgt
    return out
def game_meshes(objs): return [o for o in objs if o.type == 'MESH' and not o.name.startswith('CollisionProxy')]
def decimate_to(objs, target, protect=()):
    ms = [o for o in game_meshes(objs) if len(o.data.polygons) > 40]
    fixed = sum(tris_of([o]) for o in ms if o.name in protect)
    cur = tris_of([o for o in ms if o.name not in protect])
    if cur <= 0: return
    r = max(0.02, min(1.0, (target - fixed - tris_of([o for o in game_meshes(objs) if o not in ms])) / cur))
    for o in ms:
        if o.name in protect or r >= 0.999: continue
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r; apply_mods(o)
def primitives(objs): return sum(len({pp.material_index for pp in o.data.polygons}) for o in game_meshes(objs))

ALL = descendants(ROOT)
remap(game_meshes(ALL), REMAP0)
GROUPS = join_groups(ALL)
ALL = descendants(ROOT)
decimate_to(ALL, 60000)
stats = {'lod0': tris_of(game_meshes(ALL)), 'lod0_primitives': primitives(ALL)}
export(os.path.join(GLB_DIR, f"{D['id']}_lod0.glb"), ALL)
# LOD1 (18–50 m): no cabin furniture except the seats; everything static joined into one mesh (wheels keep spinning)
cabin = GROUPS.get('Interior')
if cabin: bpy.data.objects.remove(cabin, do_unlink=True)
ALL = descendants(ROOT)
G1 = join_groups(ALL, animated=('_Spin',), tag='1')
ALL = descendants(ROOT)
decimate_to(ALL, 20000)
stats['lod1'] = tris_of(game_meshes(ALL)); stats['lod1_primitives'] = primitives(ALL)
export(os.path.join(GLB_DIR, f"{D['id']}_lod1.glb"), ALL)
# LOD2 (> 50 m): no seats, one mesh, a handful of materials
for o in [o for o in game_meshes(ALL)]:
    pass
ALL = descendants(ROOT)
G2 = join_groups(ALL, animated=(), tag='2')
ALL = descendants(ROOT)
remap(game_meshes(ALL), REMAP2)
decimate_to(ALL, 4000)
stats['lod2'] = tris_of(game_meshes(ALL)); stats['lod2_primitives'] = primitives(ALL)
export(os.path.join(GLB_DIR, f"{D['id']}_lod2.glb"), ALL)
meshes = [o for o in ALL if o.type == 'MESH']
nodes = sorted(o.name for o in ALL if o.type == 'EMPTY')
meta = {'vehicleId': D['id'], 'brandId': D['brand'], 'displayModel': D['name'], 'vehicleClass': D['class'], 'rightsStatus': 'ORIGINAL_DESIGN',
        'dimensions': {'length': D['length'], 'width': D['width'], 'height': D['height']}, 'wheelbase': D['wheelbase'], 'wheelRadius': round(TYRE_R, 4),
        'seatLayout': D['seats'], 'triangles': stats, 'nodes': nodes,
        'anchors': {o.name: [round(o.matrix_world.translation.x, 3), round(o.matrix_world.translation.z, 3), round(-o.matrix_world.translation.y, 3)] for o in descendants(AN) if o is not AN},
        'materials': sorted({m.name for o in meshes for m in o.data.materials if m}), 'source': 'tools/blender/vehicles/build_vehicle.py + designs/' + D['id'] + '.json'}
json.dump(meta, open(os.path.join(GLB_DIR, f"{D['id']}.json"), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('STATS', json.dumps(stats))
