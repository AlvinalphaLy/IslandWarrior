"""Turn cache/recon.json into a Tiled map (public/assets/maps/village.json).

Layers:
  Ground0..2  grid tile layers (terrain stack, bottom -> top)
  Objects     free-placed tile objects (pixel positions), with sortY / z for depth sorting
  Collision   rectangles (water mask + object footprints)
  Spawns      player / NPC points, door + sign triggers
"""
import json, os, shutil
import numpy as np
from PIL import Image

P = 'Serene_Village_revamped_v1.9/SERENE_VILLAGE_REVAMPED/'
OUT_DIR = 'public/assets'
TS = 16
H_, V_, D_ = 0x80000000, 0x40000000, 0x20000000

TILESETS = [  # name, source, columns, tilecount
    ('village', P + 'Serene_Village_16x16.png'),
    ('water', P + 'Animated stuff/water_waves_16x16.png'),
    ('campfire', P + 'Animated stuff/campfire_16x16.png'),
    ('door', P + 'Animated stuff/door_16x16.png'),
    ('auto', P + 'Construct 3/Autotiles_no_inner_corners_16x16.png'),
]

# ---------------------------------------------------------------- categories
def rng(*pairs):
    s = set()
    for a, b in pairs:
        s.update(range(a, b + 1))
    return s

TREES = rng((199, 206), (218, 225), (237, 244), (256, 265), (275, 284), (294, 303), (313, 322),
            (332, 341), (351, 360), (370, 379), (389, 398))
HOUSE_ROWS = [(399, 413), (418, 432), (437, 451), (456, 470), (475, 490), (494, 509), (513, 528), (532, 547),
              (556, 565), (570, 584), (589, 603), (608, 622), (627, 642), (646, 661), (665, 680), (684, 699),
              (703, 717), (722, 736), (741, 755), (760, 774), (779, 793), (798, 813), (817, 832), (836, 851)]
HOUSES = rng(*HOUSE_ROWS)
WALLS = rng((133, 138), (152, 152), (157, 159), (171, 171), (176, 178), (190, 191), (194, 195),
            (252, 253), (270, 271), (289, 291), (308, 310), (327, 329), (551, 555))
FLAT = rng((0, 132), (153, 156), (172, 175), (192, 193), (230, 232), (234, 234), (249, 249), (268, 268), (380, 382),
           (414, 417), (433, 436), (452, 455), (471, 474), (491, 493), (510, 512), (529, 531), (548, 550),
           (566, 569), (585, 588), (604, 607))
FRUIT = rng((414, 417), (433, 436), (452, 453), (471, 472))
SIGNS = {247, 254, 255, 273, 274, 293}
BRIDGE = rng((67, 72), (86, 90), (105, 109), (124, 128))
AUTO_WALL = {5, 6, 7, 16, 17, 19, 28, 29, 31, 40, 41, 42, 43}
# House footprints are deliberately not removed from FLAT sets etc. - categories checked in order below.

def category(sheet, tid):
    if sheet == 'water':
        return 'flat'
    if sheet == 'campfire':
        return 'solid'
    if sheet == 'door':
        return 'house'
    if sheet == 'auto':
        return 'wall' if tid in AUTO_WALL else 'flat'
    if tid in HOUSES: return 'house'
    if tid in TREES: return 'tree'
    if tid in WALLS: return 'wall'
    if tid in FLAT: return 'flat'
    return 'solid'

# ---------------------------------------------------------------- load
recon = json.load(open('cache/recon.json'))
W, H = recon['W'], recon['H']
RW, RH = W * TS, H * TS

sheets = {}
firstgid = {}
gid = 1
for name, src in TILESETS:
    im = np.asarray(Image.open(src).convert('RGBA'))
    cols = im.shape[1] // TS
    count = cols * (im.shape[0] // TS)
    sheets[name] = dict(img=im, cols=cols, count=count, src=src)
    firstgid[name] = gid
    gid += count

def tile_rgba(sheet, tid, f=0):
    s = sheets[sheet]; c = s['cols']
    t = s['img'][(tid // c) * TS:(tid // c + 1) * TS, (tid % c) * TS:(tid % c + 1) * TS]
    if f & D_: t = np.swapaxes(t, 0, 1)
    if f & H_: t = t[:, ::-1]
    if f & V_: t = t[::-1]
    return t

def water_norm(sheet, tid):
    # every open-water tile becomes animated water frame 0
    if sheet == 'water' or (sheet == 'village' and tid == 123):
        return 'water', 0
    return sheet, tid

# ---------------------------------------------------------------- ground layers
# hand fixes to the reconstructed ground, (cell x, cell y) -> tile stack. The islet in the bay had its top shoreline
# hidden under a tree in the reference; with the tree gone it gets the tileset's island top edge (80-83).
GROUND_OVERRIDES = {(17, 19): [('village', 123), ('village', 80)], (18, 19): [('village', 123), ('village', 81)],
                    (19, 19): [('village', 123), ('village', 82)], (20, 19): [('village', 123), ('village', 83)]}
for (cx, cy), stack in GROUND_OVERRIDES.items():
    recon['ground'][cy][cx] = [list(t) for t in stack]
layers_gid = [[0] * (W * H) for _ in range(3)]
for cy in range(H):
    for cx in range(W):
        for li, (sh, tid) in enumerate(recon['ground'][cy][cx][:3]):
            sh, tid = water_norm(sh, tid)
            layers_gid[li][cy * W + cx] = firstgid[sh] + tid

# ---------------------------------------------------------------- objects & groups
# areas emptied on purpose: every reconstructed object in them (trees, flowers, rocks) is dropped, along with its
# collision. patch_map.py and verify_map.py read them from the map property `clearedAreas` and leave them alone.
CLEARED_AREAS = [
    (266, 290, 342, 346),   # the islet in the bay: only the Cyclops head stands there
    (400, 336, 444, 364),   # the small south-east islet: its rock makes way for Circe's statue
]
def cleared(o):
    cx, cy = o['x'] + TS / 2, o['y'] + TS / 2
    return any(x0 <= cx < x1 and y0 <= cy < y1 for x0, y0, x1, y1 in CLEARED_AREAS)
objs = [o for o in recon['objects'] if not cleared(o)]
for i, o in enumerate(objs):
    o['i'] = i
    o['cat'] = category(o['sheet'], o['id'])
    o['rgba'] = tile_rgba(o['sheet'], o['id'], o['f'])
    o['alpha'] = o['rgba'][..., 3] > 127

parent = list(range(len(objs)))
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
def union(a, b): parent[find(a)] = find(b)

by_pos = {}
for o in objs:
    by_pos.setdefault((o['x'], o['y']), []).append(o)
for o in objs:
    if o['f'] or o['cat'] == 'flat':
        continue
    cols = sheets[o['sheet']]['cols']
    tx, ty = o['id'] % cols, o['id'] // cols
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if not dx and not dy: continue
            for n in by_pos.get((o['x'] + dx * TS, o['y'] + dy * TS), []):
                if n['f'] or n['sheet'] != o['sheet'] or n['cat'] == 'flat': continue
                if n['id'] % cols == tx + dx and n['id'] // cols == ty + dy:
                    union(o['i'], n['i'])

# houses in the reference are assembled from pieces that are not sheet-adjacent: merge touching house pieces
def gbox(ms):
    return (min(m['x'] for m in ms), min(m['y'] for m in ms), max(m['x'] for m in ms) + TS, max(m['y'] for m in ms) + TS)
for _ in range(3):
    tmp = {}
    for o in objs:
        tmp.setdefault(find(o['i']), []).append(o)
    hs = [(g, gbox(ms)) for g, ms in tmp.items() if any(m['cat'] == 'house' for m in ms)]
    for i in range(len(hs)):
        for j in range(i + 1, len(hs)):
            a, b = hs[i][1], hs[j][1]
            if a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]:
                union(hs[i][0], hs[j][0])
groups = {}
for o in objs:
    groups.setdefault(find(o['i']), []).append(o)

GROUP_CAT_PRIORITY = ['house', 'tree', 'wall', 'solid', 'flat']
ginfo = {}
for g, members in groups.items():
    cats = {m['cat'] for m in members}
    cat = next(c for c in GROUP_CAT_PRIORITY if c in cats)
    x0 = min(m['x'] for m in members); y0 = min(m['y'] for m in members)
    x1 = max(m['x'] for m in members) + TS; y1 = max(m['y'] for m in members) + TS
    ginfo[g] = dict(cat=cat, bbox=(x0, y0, x1, y1), sortY=-1 if cat == 'flat' else y1)
    for m in members:
        m['g'] = g

# depth fix-up: whenever object A is drawn over B in the reference, A must not sort below B
pairs = []
for a in objs:
    for b in objs:
        if a['z'] <= b['z'] or a['g'] == b['g']:
            continue
        dx, dy = b['x'] - a['x'], b['y'] - a['y']
        if abs(dx) >= TS or abs(dy) >= TS:
            continue
        sa = (slice(max(0, dy), TS + min(0, dy)), slice(max(0, dx), TS + min(0, dx)))
        sb = (slice(max(0, -dy), TS + min(0, -dy)), slice(max(0, -dx), TS + min(0, -dx)))
        if (a['alpha'][sa] & b['alpha'][sb]).any():
            pairs.append((a['g'], b['g']))
def fixup_depths():
    for _ in range(50):
        changed = False
        for ga, gb in pairs:
            if ginfo[ga]['sortY'] < ginfo[gb]['sortY']:
                ginfo[ga]['sortY'] = ginfo[gb]['sortY']; changed = True
        if not changed:
            break
fixup_depths()

# ---------------------------------------------------------------- render (static composite, for collision + verification)
def render(include_objects=True):
    canvas = np.zeros((RH, RW, 4), np.uint8)
    def blit(t, x, y):
        x0, y0 = max(0, x), max(0, y); x1, y1 = min(RW, x + TS), min(RH, y + TS)
        if x0 >= x1 or y0 >= y1: return
        sub = t[y0 - y:y1 - y, x0 - x:x1 - x]
        m = sub[..., 3] > 127
        canvas[y0:y1, x0:x1][m] = sub[m]
    gid_lookup = []
    for name, _ in TILESETS:
        gid_lookup.append((firstgid[name], name))
    def from_gid(g):
        for fg, name in reversed(gid_lookup):
            if g >= fg: return name, g - fg
    for li in range(3):
        for i, g in enumerate(layers_gid[li]):
            if g:
                sh, tid = from_gid(g)
                blit(tile_rgba(sh, tid), (i % W) * TS, (i // W) * TS)
    if include_objects:
        for o in sorted(objs, key=lambda o: (ginfo[o['g']]['sortY'], o['z'])):
            blit(o['rgba'], o['x'], o['y'])
    return canvas

full = render()

# ---------------------------------------------------------------- colour sets
def colors_of(arrs):
    s = set()
    for a in arrs:
        a = a.reshape(-1, 4); a = a[a[:, 3] > 127]
        s.update(map(tuple, a[:, :3].tolist()))
    return s
WATER_COLORS = colors_of([sheets['water']['img']] + [tile_rgba('village', t) for t in (31, 123)])
GRASS_COLORS = colors_of([tile_rgba('village', t) for t in (3, 4, 5, 22, 23)])

def color_mask(img, cset):
    flat = img[..., :3].reshape(-1, 3)
    keys = (flat[:, 0].astype(np.int64) << 16) | (flat[:, 1].astype(np.int64) << 8) | flat[:, 2]
    cs = np.array([(r << 16) | (g << 8) | b for r, g, b in cset], np.int64)
    return np.isin(keys, cs).reshape(img.shape[:2])

# ---------------------------------------------------------------- doors (door-coloured blob inside each house)
from scipy import ndimage  # noqa
door0 = tile_rgba('door', 0)
DOOR_COLORS = colors_of([door0[4:14, 5:11]])
door_mask = color_mask(full, DOOR_COLORS)
doors = []
door_of = {}
for g, members in groups.items():
    if ginfo[g]['cat'] != 'house':
        continue
    x0, y0, x1, y1 = ginfo[g]['bbox']
    x0, y0 = max(0, x0), max(0, y0)
    lab, n = ndimage.label(door_mask[y0:y1, x0:x1])
    best = None
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < 25: continue
        if best is None or len(ys) > best[0]:
            best = (len(ys), xs.min(), ys.min(), xs.max(), ys.max())
    if best:
        _, bx0, by0, bx1, by1 = best
        cx = x0 + (bx0 + bx1) // 2; by = y0 + by1
        doors.append((cx - 8, by - 15)); door_of[g] = (cx, by)
    else:
        doors.append(((x0 + x1) // 2 - 8, y1 - 24)); door_of[g] = ((x0 + x1) // 2, y1 - 9)

# houses sort by their wall base (door sill), not the front steps, so the player can stand at the door
for g, (cx, by) in door_of.items():
    ginfo[g]['sortY'] = by
fixup_depths()

# ---------------------------------------------------------------- collision
rects = []
# 1. water (4px sub-cells), bridges excluded
water = color_mask(full, WATER_COLORS)
walk_override = np.zeros((RH, RW), bool)
def walk_on(x, y, sheet, tid, f=0):
    # a bridge tile is walkable over the extent of its planks (opaque pixels), gaps between planks included
    ys, xs = np.nonzero(tile_rgba(sheet, tid, f)[..., 3] > 127)
    if len(ys):
        y0, y1, x0, x1 = max(0, y + ys.min()), min(RH, y + ys.max() + 1), max(0, x + xs.min()), min(RW, x + xs.max() + 1)
        walk_override[y0:y1, x0:x1] = True
for o in objs:  # bridges placed as objects (the pier)
    if o['sheet'] == 'village' and o['id'] in BRIDGE:
        walk_on(o['x'], o['y'], o['sheet'], o['id'], o['f'])
for cy in range(H):  # bridges in the ground layers (the plank bridge between the pond and the beach)
    for cx in range(W):
        for sh, tid in recon['ground'][cy][cx]:
            if sh == 'village' and tid in BRIDGE:
                walk_on(cx * TS, cy * TS, sh, tid)
SUB = 4
wg = (water.reshape(RH // SUB, SUB, RW // SUB, SUB).mean((1, 3)) >= 0.5) & \
     ~(walk_override.reshape(RH // SUB, SUB, RW // SUB, SUB).any((1, 3)))

def greedy_rects(grid, cell):
    g = grid.copy(); out = []
    gh, gw = g.shape
    for y in range(gh):
        x = 0
        while x < gw:
            if not g[y, x]:
                x += 1; continue
            x1 = x
            while x1 + 1 < gw and g[y, x1 + 1]: x1 += 1
            y1 = y
            while y1 + 1 < gh and g[y1 + 1, x:x1 + 1].all(): y1 += 1
            g[y:y1 + 1, x:x1 + 1] = False
            out.append((x * cell, y * cell, (x1 - x + 1) * cell, (y1 - y + 1) * cell, 'water'))
            x = x1 + 1
    return out
rects += greedy_rects(wg, SUB)

# 2. object footprints
def solid_bbox(members, lower=1.0):
    """bbox of non-grass opaque pixels of these tiles; keep only the lower fraction"""
    pts = []
    for m in members:
        a = m['alpha'] & ~color_mask(m['rgba'], GRASS_COLORS)
        ys, xs = np.nonzero(a)
        if len(ys):
            pts.append((m['x'] + xs.min(), m['y'] + ys.min(), m['x'] + xs.max() + 1, m['y'] + ys.max() + 1))
    if not pts: return None
    x0 = min(p[0] for p in pts); y0 = min(p[1] for p in pts)
    x1 = max(p[2] for p in pts); y1 = max(p[3] for p in pts)
    h = y1 - y0
    y0 = y1 - max(6, int(round(h * lower)))
    return (x0, y0, x1, y1)

doors_from_houses = []
for g, members in groups.items():
    info = ginfo[g]; cat = info['cat']
    x0, y0, x1, y1 = info['bbox']
    if cat == 'flat':
        continue
    if cat == 'tree':
        bottom = [m for m in members if m['y'] + TS == y1 and m['cat'] == 'tree'] or members
        bx0 = min(m['x'] for m in bottom); bx1 = max(m['x'] for m in bottom) + TS
        w = bx1 - bx0; cw = max(8, int(w * 0.4)); cx = (bx0 + bx1) // 2
        rects.append((cx - cw // 2, y1 - 11, cw, 8, 'tree'))
    elif cat == 'house':
        bb = solid_bbox(members)
        if bb:
            hx0, hy0, hx1, hy1 = bb
            h = hy1 - hy0
            top = hy0 + int(h * 0.42)
            bottom = door_of[g][1] - 2 if g in door_of else hy1 - 7
            rects.append((hx0 + 1, top, hx1 - hx0 - 2, max(8, bottom - top), 'house'))
    elif cat == 'wall':
        for m in members:
            bb = solid_bbox([m])
            if bb:
                rects.append((bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1], 'wall'))
    else:
        bb = solid_bbox(members, lower=0.6)
        if bb:
            rects.append((bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1], 'solid'))

# the campfire and its two log seats: one solid block, so nobody slips into the gaps or stands inside a log
fires = [o for o in objs if o['sheet'] == 'campfire']
if fires:
    fx0 = min(o['x'] for o in fires) - 20; fx1 = max(o['x'] for o in fires) + TS + 20
    fy0 = min(o['y'] for o in fires) - 8; fy1 = max(o['y'] for o in fires) + TS + 4
    seats = [r for r in rects if r[4] == 'solid' and r[0] < fx1 and r[0] + r[2] > fx0 and r[1] < fy1 and r[1] + r[3] > fy0]
    if seats:
        rects = [r for r in rects if r not in seats]
        x0 = min(r[0] for r in seats); y0 = min(r[1] for r in seats) - 4
        x1 = max(r[0] + r[2] for r in seats); y1 = max(r[1] + r[3] for r in seats)
        rects.append((x0, y0, x1 - x0, y1 - y0, 'solid'))

# clip to map
rects = [(max(0, x), max(0, y), min(RW, x + w) - max(0, x), min(RH, y + h) - max(0, y), k)
         for x, y, w, h, k in rects if min(RW, x + w) > max(0, x) and min(RH, y + h) > max(0, y)]

# blocked mask (for spawn validation)
blocked = np.zeros((RH, RW), bool)
for x, y, w, h, k in rects:
    blocked[y:y + h, x:x + w] = True

# ---------------------------------------------------------------- spawns
# where each house door leads (scene key); houses not listed are locked
# (team plan: red house left = Telemachus training room, the brown-brick sewer dungeon)
DOOR_TARGETS = {
    'house_0': 'dungeon',  # red house, left (player start) -> Telemachus training room (sewer dungeon)
    'house_5': 'cave',     # green fenced house, bottom-right -> Fungus Cave
}
def nearest_walkable(x, y, foot=(10, 6)):
    best = None
    for r in range(0, 40):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r: continue
                fx, fy = x + dx, y + dy
                x0, y0 = fx - foot[0] // 2, fy - foot[1]
                if x0 < 0 or y0 < 0 or x0 + foot[0] > RW or fy > RH: continue
                if not blocked[y0:fy, x0:x0 + foot[0]].any():
                    return fx, fy
    return x, y

SPAWNS = [  # name, sprite, foot x, foot y (native px), dialog key, wander radius
    ('player', 'adam', 64, 237, None, 0),
    # NPCs wear the Greek god skins from tools/greek_skins.py (originals: amelia, bob, alex, alex_alt, amelia_alt)
    ('Mira', 'aphrodite', 152, 53, 'mira', 18),
    ('Old Tobin', 'zeus', 410, 168, 'tobin', 10),  # beside the campfire (not in front of it, where he hid the fire)
    ('Pip', 'hermes', 372, 64, 'pip', 24),
    ('Kai', 'heracles', 345, 255, 'kai', 30),
    ('Wren', 'hades', 590, 290, 'wren', 24),
]
spawn_objs = []
oid = [1]
def next_id():
    oid[0] += 1; return oid[0]
for name, sprite, x, y, dlg, wander in SPAWNS:
    fx, fy = nearest_walkable(x, y)
    props = [dict(name='sprite', type='string', value=sprite)]
    if dlg: props.append(dict(name='dialog', type='string', value=dlg))
    if wander: props.append(dict(name='wander', type='int', value=wander))
    spawn_objs.append(dict(id=next_id(), name=name, type='player' if name == 'player' else 'npc',
                           x=float(fx), y=float(fy), point=True, width=0, height=0, rotation=0, visible=True,
                           properties=props))
for i, (dx, dy) in enumerate(sorted(doors)):
    spawn_objs.append(dict(id=next_id(), name=f'door_{i}', type='door', x=float(dx), y=float(dy), width=16, height=16,
                           rotation=0, visible=True, properties=[dict(name='house', type='string', value=f'house_{i}'), dict(name='target', type='string', value=DOOR_TARGETS.get(f'house_{i}', ''))]))
# the ship of Odysseus (tools/make_ship.py) at anchor off the beach. Homeric ships were beached or anchored at the
# shore, and the open water south of the beach is the only stretch wide enough for a galley seen side-on.
# (x, y) = waterline centre, moored right at the beach's edge so it's easy to board and sail off; talkRect = the
# strip of beach you board from; arrive = where you land coming home (beside the stern, not under the sail).
spawn_objs.append(dict(id=next_id(), name='odysseus_ship', type='ship', x=406.0, y=292.0, point=True, width=0, height=0,
                       rotation=0, visible=True,
                       properties=[dict(name='dialog', type='string', value='ship'),
                                   dict(name='talkRect', type='string', value='326,262,160,30'),
                                   # the ship is the dragon raid entry: sails to `target` once `requires` is unlocked
                                   dict(name='target', type='string', value='lair'),
                                   dict(name='requires', type='string', value='achilles'),
                                   dict(name='arrive', type='string', value='330,272')]))
# the wooden horse statue on the beach (tools/make_horse_statue.py). (x, y) = bottom centre of its plinth.
spawn_objs.append(dict(id=next_id(), name='horse_statue', type='statue', x=330.0, y=244.0, point=True, width=0, height=0,
                       rotation=0, visible=True,
                       properties=[dict(name='sprite', type='string', value='horse_statue'),
                                   dict(name='dialog', type='string', value='horse_statue'),
                                   dict(name='footW', type='int', value=40), dict(name='footH', type='int', value=11)]))
# Circe, the witch of Aeaea (tools/make_witch_statue.py): a player-sized stone statue on the small south-east islet, wrapped
# in a black aura. Sail up to it (or land on the islet) and press E to enter her grotto (`target`).
# arrive = where you stand when you come back on foot (by ship you're put back at the helm).
spawn_objs.append(dict(id=next_id(), name='circe_statue', type='statue', x=424.0, y=364.0, point=True, width=0, height=0,
                       rotation=0, visible=True,
                       properties=[dict(name='sprite', type='string', value='witch_statue'),
                                   dict(name='dialog', type='string', value='circe_statue'),
                                   dict(name='aura', type='bool', value=True),
                                   # a treasure chest stands here first; opening it (E, from the ship or on foot) raises the statue
                                   dict(name='lure', type='string', value='treasure_chest'),
                                   dict(name='target', type='string', value='circe'),
                                   dict(name='arrive', type='string', value='424,374'),
                                   dict(name='footW', type='int', value=12), dict(name='footH', type='int', value=5)]))
# the stone head of Polyphemus (tools/make_cyclops_head.py), half sunk into the islet in the bay, gazing at the
# bay. Land the ship on the islet to read it. (x, y) = bottom centre of its rubble mound.
spawn_objs.append(dict(id=next_id(), name='cyclops_head', type='statue', x=304.0, y=342.0, point=True, width=0, height=0,
                       rotation=0, visible=True,
                       properties=[dict(name='sprite', type='string', value='cyclops_head'),
                                   dict(name='dialog', type='string', value='cyclops_head'),
                                   # Maron's wine (tools/make_amphora.py) stands beside it: pour it into the mouth
                                   # (E, on foot or from the ship) and the jaw opens onto Polyphemus' cave
                                   dict(name='lure', type='string', value='amphora'),
                                   dict(name='lureAt', type='string', value='326,340'),
                                   dict(name='awaken', type='string', value='pour'),
                                   dict(name='aura', type='string', value='wine'),
                                   dict(name='target', type='string', value='cyclops'),
                                   dict(name='arrive', type='string', value='282,340'),
                                   dict(name='footW', type='int', value=26), dict(name='footH', type='int', value=9)]))
sign_i = 0
for g, members in groups.items():
    if any(m['sheet'] == 'village' and m['id'] in SIGNS for m in members):
        x0, y0, x1, y1 = ginfo[g]['bbox']
        spawn_objs.append(dict(id=next_id(), name=f'sign_{sign_i}', type='sign', x=float(x0), y=float(y0),
                               width=x1 - x0, height=y1 - y0, rotation=0, visible=True,
                               properties=[dict(name='dialog', type='string', value=f'sign_{sign_i}')]))
        sign_i += 1

# ---------------------------------------------------------------- write Tiled JSON
os.makedirs(f'{OUT_DIR}/maps', exist_ok=True); os.makedirs(f'{OUT_DIR}/tilesets', exist_ok=True)
tilesets_json = []
for name, src in TILESETS:
    dst = f'{OUT_DIR}/tilesets/{name}.png'
    Image.open(src).convert('RGBA').save(dst)
    s = sheets[name]
    ts = dict(firstgid=firstgid[name], name=name, image=f'../tilesets/{name}.png', imagewidth=s['img'].shape[1],
              imageheight=s['img'].shape[0], tilewidth=TS, tileheight=TS, columns=s['cols'], tilecount=s['count'],
              margin=0, spacing=0)
    if name in ('water', 'campfire'):
        ts['tiles'] = [dict(id=0, animation=[dict(tileid=k, duration=140 if name == 'water' else 110)
                                              for k in range(s['count'])])]
    tilesets_json.append(ts)

object_json = []
for o in sorted(objs, key=lambda o: o['z']):
    g = firstgid[o['sheet']] + o['id']
    x, y, rot = o['x'], o['y'] + TS, 0  # tile objects anchor bottom-left
    if o['f'] == D_ | H_:      # 90 deg clockwise
        x, y, rot = o['x'], o['y'], 90
    elif o['f'] == D_ | V_:    # 90 deg counter-clockwise
        x, y, rot = o['x'] + TS, o['y'] + TS, 270
    elif o['f']:
        g |= o['f']
    object_json.append(dict(id=next_id(), gid=g, x=x, y=y, width=TS, height=TS, rotation=rot, visible=True,
                            name='', type=ginfo[o['g']]['cat'],
                            properties=[dict(name='sortY', type='int', value=int(ginfo[o['g']]['sortY'])),
                                        dict(name='z', type='int', value=int(o['z']))]))

collision_json = [dict(id=next_id(), name='', type=k, x=x, y=y, width=w, height=h, rotation=0, visible=True)
                  for x, y, w, h, k in rects]

tmj = dict(type='map', version='1.10', tiledversion='1.10.2', orientation='orthogonal', renderorder='right-down',
           width=W, height=H, tilewidth=TS, tileheight=TS, infinite=False, nextlayerid=8, nextobjectid=oid[0] + 1,
           tilesets=tilesets_json, layers=[],
           properties=[dict(name='clearedAreas', type='string', value=json.dumps(CLEARED_AREAS))])
for li in range(3):
    tmj['layers'].append(dict(id=li + 1, name=f'Ground{li}', type='tilelayer', width=W, height=H, x=0, y=0,
                              opacity=1, visible=True, data=layers_gid[li]))
tmj['layers'].append(dict(id=4, name='Objects', type='objectgroup', draworder='index', opacity=1, visible=True,
                          x=0, y=0, objects=object_json))
tmj['layers'].append(dict(id=5, name='Collision', type='objectgroup', opacity=1, visible=False, x=0, y=0,
                          objects=collision_json))
tmj['layers'].append(dict(id=6, name='Spawns', type='objectgroup', opacity=1, visible=False, x=0, y=0,
                          objects=spawn_objs))
json.dump(tmj, open(f'{OUT_DIR}/maps/village.json', 'w'), default=lambda v: v.item() if hasattr(v, 'item') else str(v))

# previews
Image.fromarray(full).resize((RW * 2, RH * 2), Image.NEAREST).save('cache/map_render.png')
dbg = Image.fromarray(full).convert('RGBA')
from PIL import ImageDraw
d = ImageDraw.Draw(dbg, 'RGBA')
colors = dict(water=(0, 80, 255, 90), tree=(255, 0, 0, 140), house=(255, 120, 0, 140), wall=(255, 0, 200, 120),
              solid=(255, 255, 0, 140))
for x, y, w, h, k in rects:
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=colors[k])
for s in spawn_objs:
    if s.get('point'):
        d.ellipse([s['x'] - 2, s['y'] - 2, s['x'] + 2, s['y'] + 2], fill=(255, 255, 255, 255))
    else:
        d.rectangle([s['x'], s['y'], s['x'] + s['width'] - 1, s['y'] + s['height'] - 1], outline=(0, 255, 0, 255))
dbg.resize((RW * 2, RH * 2), Image.NEAREST).save('cache/collision_debug.png')
print(f'objects={len(objs)} groups={len(groups)} rects={len(rects)} doors={len(doors)} signs={sign_i}')
