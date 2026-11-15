"""Author the cave of Polyphemus (public/assets/maps/cyclops.json): Odysseus' archery puzzle.

Entered through the mouth of the stone Cyclops head on the bay islet (after pouring the wine into it); the ladder
leads back out. Uses the Fungus Cave tileset already in the game (public/assets/tilesets/cave.png), so it runs
without the asset packs. The puzzle props and their rules live in src/entities/Archery.ts.

One challenge, the test of the axes: pick up the bow by the ladder, walk down to the chalk mark (a gold arrow
bounces over it), press F, and the arrow flies through the ring of all six axes into the bronze target. The boulder
breaks loose and rolls straight into Polyphemus, asleep by his hoard: crushed, no fight.
(The longer version, with two chasms, bridge targets and sheep in the line of fire, comes back with SHORT = False.)

Run: python tools/build_cyclops_cave.py  -> also writes cache/cyclops_render.png + cache/cyclops_collision.png
"""
import json, os, random
import numpy as np
from PIL import Image, ImageDraw

SRC = 'public/assets/tilesets/cave.png'
OUT = 'public/assets/maps/cyclops.json'
TS = 16
W, H = 30, 19
random.seed(31)

sheet = np.asarray(Image.open(SRC).convert('RGBA'))
COLS = sheet.shape[1] // TS
TILECOUNT = COLS * (sheet.shape[0] // TS)
def tile(tid):
    return sheet[(tid // COLS) * TS:(tid // COLS + 1) * TS, (tid % COLS) * TS:(tid % COLS + 1) * TS]

# ------------------------------------------------------------------ room autotile (template = tiles 0..47)
g0 = [[6] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        top, bottom, left, right = y == 0, y == H - 1, x == 0, x == W - 1
        if top and left: t = 0
        elif top and right: t = 5
        elif bottom and left: t = 40
        elif bottom and right: t = 45
        elif top: t = 1 + (x - 1) % 4
        elif bottom: t = 41 + (x - 1) % 4
        elif left: t = {1: 8, 2: 16}.get(y, 24 if y % 2 else 32)
        elif right: t = {1: 13, 2: 21}.get(y, 29 if y % 2 else 37)
        elif y == 1: t = 9 + (x - 1) % 4
        elif y == 2: t = 17 + (x - 1) % 4
        elif y == 3: t = 25 if x == 1 else 26 + (x % 3)
        elif x == 1: t = 33
        else:
            r = random.random()
            t = random.choice([7, 14, 15, 22, 23]) if r < 0.06 else random.choice([34, 35, 36])
        g0[y][x] = t
for x, (a, b) in {7: (73, 81), 14: (74, 82), 20: (73, 81), 26: (74, 82)}.items():   # cracks in the wall
    g0[1][x], g0[2][x] = a, b
for x, t in {10: 166, 17: 182, 23: 166}.items():                                   # lanterns
    g0[2][x] = t

g1 = [[0] * W for _ in range(H)]
LADDER_X = 3
for dy, t in enumerate((99, 107, 115)):
    g1[dy][LADDER_X] = t

# chasms (2-row pits: 67-69 over 75-77), and where their bridges will drop. SHORT: no chasms, straight to the axes.
SHORT = True
# SHORT keeps one chasm fencing the top of the den, so the boulder stays the only way in
CHASMS = [(21, 13, 28, 14)] if SHORT else [(1, 7, 28, 8), (1, 13, 28, 14)]
BRIDGES = {} if SHORT else {'bridge_a': (25, 7, 26, 8), 'bridge_b': (18, 13, 19, 14)}
for x0, y0, x1, y1 in CHASMS:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            col = 0 if x == x0 else 2 if x == x1 else 1
            g1[y][x] = [[67, 68, 69], [75, 76, 77]][y - y0][col]

# ------------------------------------------------------------------ props (tile stamps)
STAMPS = [
    ([[150], [158]], 12, 3, 'solid'), ([[151]], 13, 4, 'solid'),       # wine barrels in zone 1
    ([[242, 243]], 21, 4, 'solid'),                                     # crates
    ([[150]], 27, 9, 'solid'), ([[151]], 28, 10, 'solid'),              # more barrels in zone 2 (right)
    ([[120, 121]], 27, 15, 'solid'),                                    # Polyphemus' hoard (the chest in the den)
    ([[158]], 24, 16, 'solid'),                                         # a barrel he drank dry, on its side
    ([[89]], 5, 4, 'flat'), ([[91]], 18, 5, 'flat'), ([[128]], 9, 10, 'flat'), ([[130]], 22, 11, 'flat'),
    ([[88]], 15, 10, 'flat'), ([[129]], 4, 16, 'flat'), ([[90]], 26, 17, 'flat'), ([[89]], 11, 17, 'flat'),
]
objects = []
for z, (rows, tx, ty, cat) in enumerate(STAMPS):
    bottom = (ty + len(rows)) * TS
    for dy, row in enumerate(rows):
        for dx, tid in enumerate(row):
            objects.append(dict(id=tid, x=(tx + dx) * TS, y=(ty + dy) * TS, cat=cat,
                                sortY=-1 if cat == 'flat' else bottom, z=len(objects), stamp=z))

# ------------------------------------------------------------------ collision
blocked_tiles = np.zeros((H, W), bool)
blocked_tiles[:3, :] = True; blocked_tiles[-1, :] = True; blocked_tiles[:, 0] = True; blocked_tiles[:, -1] = True
def greedy(grid, kind):
    g = grid.copy(); out = []
    for y in range(g.shape[0]):
        x = 0
        while x < g.shape[1]:
            if not g[y, x]: x += 1; continue
            x1 = x
            while x1 + 1 < g.shape[1] and g[y, x1 + 1]: x1 += 1
            y1 = y
            while y1 + 1 < g.shape[0] and g[y1 + 1, x:x1 + 1].all(): y1 += 1
            g[y:y1 + 1, x:x1 + 1] = False
            out.append((x * TS, y * TS, (x1 - x + 1) * TS, (y1 - y + 1) * TS, kind))
            x = x1 + 1
    return out
rects = greedy(blocked_tiles, 'wall')
# chasm collision, leaving out the bridge spans: those are `gate` spawns (Archery blocks them until they open)
for x0, y0, x1, y1 in CHASMS:
    cols = [x for x in range(x0, x1 + 1) if not any(b[1] == y0 and b[0] <= x <= b[2] for b in BRIDGES.values())]
    runs, start = [], cols[0]
    for a, b in zip(cols, cols[1:] + [None]):
        if b != a + 1: runs.append((start, a)); start = b
    for a, b in runs:
        rects.append((a * TS, y0 * TS + 2, (b - a + 1) * TS, (y1 - y0 + 1) * TS - 4, 'pit'))
by_stamp = {}
for o in objects:
    by_stamp.setdefault(o['stamp'], []).append(o)
for st, ms in by_stamp.items():
    if ms[0]['cat'] != 'solid':
        continue
    pts = []
    for m in ms:
        ys, xs = np.nonzero(tile(m['id'])[..., 3] > 127)
        if len(ys):
            pts.append((m['x'] + xs.min(), m['y'] + ys.min(), m['x'] + xs.max() + 1, m['y'] + ys.max() + 1))
    x0 = min(p[0] for p in pts); y0 = min(p[1] for p in pts); x1 = max(p[2] for p in pts); y1 = max(p[3] for p in pts)
    y0 = y1 - max(6, int((y1 - y0) * 0.55))
    rects.append((x0, y0, x1 - x0, y1 - y0, 'solid'))

# ------------------------------------------------------------------ spawns
oid = [1]
def nid():
    oid[0] += 1; return oid[0]
spawns = []
def typed(k, v):
    return dict(name=k, type='int' if isinstance(v, int) else 'string', value=v)
def point(name, typ, x, y, **props):
    spawns.append(dict(id=nid(), name=name, type=typ, x=float(x), y=float(y), point=True, width=0, height=0,
                       rotation=0, visible=True, properties=[typed(k, v) for k, v in props.items()]))
def area(name, typ, x, y, w, h, **props):
    spawns.append(dict(id=nid(), name=name, type=typ, x=float(x), y=float(y), width=w, height=h, rotation=0,
                       visible=True, properties=[typed(k, v) for k, v in props.items()]))

point('player', 'player', LADDER_X * TS + 8, 4 * TS + 6, sprite='odysseus')
area('exit_ladder', 'exit', LADDER_X * TS + 1, 3 * TS - 2, 14, 9, target='village')
point('bow', 'bow', 7 * TS + 8, 5 * TS + 4, dialog='bow_found')

if not SHORT:
    # zone 1 -> zone 2: target A sits below the chasm, right under where you stand in zone 1
    point('target_a', 'target', 5 * TS + 8, 11 * TS + 8, opens='bridge_a', face='down')
    x0, y0, x1, y1 = BRIDGES['bridge_a']
    area('bridge_a', 'gate', x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS, style='bridge')
    # zone 2 -> zone 3: target B across chasm B on the far left; the flock grazes in the line of fire
    point('target_b', 'target', 3 * TS + 8, 17 * TS + 8, opens='bridge_b', face='down')
    x0, y0, x1, y1 = BRIDGES['bridge_b']
    area('bridge_b', 'gate', x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS, style='bridge')
    for i, (sx, sy) in enumerate([(3 * TS + 8, 11 * TS + 10), (6 * TS, 12 * TS + 4), (9 * TS, 11 * TS), (2 * TS + 8, 10 * TS)]):
        point(f'sheep_{i}', 'sheep', sx, sy, wander=34)

# zone 3: the axes. Their ring-holes line up 22px above their feet; arrows leave a shooter 10px above the feet,
# so you shoot from feet = AXE_FOOT - 12 (the chalk mark), straight along the row to the final target.
AXE_FOOT = 268
RING = AXE_FOOT - 22
# the test of the axes: from the chalk mark, shoot right through the ring at the top of every axe to the target.
# The mark guides the player (src/entities/Archery.ts): a bouncing arrow shows it, shooting near it lines you up,
# and standing on it shows the arrow's path through the rings.
for i, tx in enumerate(range(6, 17, 2)):
    point(f'axe_{i}', 'axe', tx * TS + 8, AXE_FOOT)
point('shooting_mark', 'mark', 2 * TS + 8, RING + 10, face='right')
point('target_final', 'target', 20 * TS + 8, RING + 16, opens='boulder', face='right', rings=6)
# the boulder: hitting the target sends it rolling into Polyphemus (`crush`), no fight
area('boulder', 'gate', 21 * TS, 15 * TS, 2 * TS, 3 * TS, style='boulder', crush='polyphemus')

# the den: Polyphemus asleep (a boss: touching him starts the fight) beside his hoard
# Polyphemus asleep: a `giant` (scenery that blocks the way), not a battle enemy. The boulder crushes him.
point('polyphemus', 'giant', 25 * TS + 8, 17 * TS + 10, sprite='gk_polyphemus', crushedBy='boulder')
point('snore', 'snore', 26 * TS + 6, 14 * TS + 10)   # above his head (the boss sprite is 48 tall)
area('chest_cyclops', 'chest', 27 * TS, 15 * TS, 32, 16, dialog='chest_cyclops')

# ------------------------------------------------------------------ write Tiled JSON
FIRST = 1
layers = []
for i, g in enumerate([g0, g1, [[0] * W for _ in range(H)]]):
    data = [(FIRST + t) if (i == 0 or t) else 0 for row in g for t in row]
    layers.append(dict(id=i + 1, name=f'Ground{i}', type='tilelayer', width=W, height=H, x=0, y=0, opacity=1,
                       visible=True, data=data))
layers.append(dict(id=4, name='Objects', type='objectgroup', draworder='index', opacity=1, visible=True, x=0, y=0,
                   objects=[dict(id=nid(), gid=FIRST + o['id'], x=o['x'], y=o['y'] + TS, width=TS, height=TS,
                                 rotation=0, visible=True, name='', type=o['cat'],
                                 properties=[dict(name='sortY', type='int', value=o['sortY']),
                                             dict(name='z', type='int', value=o['z'])]) for o in objects]))
layers.append(dict(id=5, name='Collision', type='objectgroup', opacity=1, visible=False, x=0, y=0,
                   objects=[dict(id=nid(), name='', type=k, x=x, y=y, width=w, height=h, rotation=0, visible=True)
                            for x, y, w, h, k in rects]))
layers.append(dict(id=6, name='Spawns', type='objectgroup', opacity=1, visible=False, x=0, y=0, objects=spawns))
tmj = dict(type='map', version='1.10', tiledversion='1.10.2', orientation='orthogonal', renderorder='right-down',
           width=W, height=H, tilewidth=TS, tileheight=TS, infinite=False, nextlayerid=7, nextobjectid=oid[0] + 1,
           properties=[dict(name='dark', type='bool', value=True)],
           tilesets=[dict(firstgid=FIRST, name='cave', image='../tilesets/cave.png', imagewidth=sheet.shape[1],
                          imageheight=sheet.shape[0], tilewidth=TS, tileheight=TS, columns=COLS, tilecount=TILECOUNT,
                          margin=0, spacing=0)],
           layers=layers)
json.dump(tmj, open(OUT, 'w'), default=lambda v: v.item())

# ------------------------------------------------------------------ previews
os.makedirs('cache', exist_ok=True)
canvas = Image.new('RGBA', (W * TS, H * TS), (0, 0, 0, 255))
for g in (g0, g1):
    for y in range(H):
        for x in range(W):
            if g is g0 or g[y][x]:
                canvas.alpha_composite(Image.fromarray(tile(g[y][x])), (x * TS, y * TS))
for o in sorted(objects, key=lambda o: (o['sortY'], o['z'])):
    canvas.alpha_composite(Image.fromarray(tile(o['id'])), (o['x'], o['y']))
canvas.resize((W * TS * 2, H * TS * 2), Image.NEAREST).save('cache/cyclops_render.png')
d = ImageDraw.Draw(canvas, 'RGBA')
for x, y, w, h, k in rects:
    d.rectangle([x, y, x + w - 1, y + h - 1], fill={'wall': (255, 0, 200, 90), 'pit': (0, 120, 255, 110), 'solid': (255, 255, 0, 130)}[k])
for s in spawns:
    if s.get('point'): d.ellipse([s['x'] - 2, s['y'] - 2, s['x'] + 2, s['y'] + 2], fill=(255, 255, 255, 255))
    else: d.rectangle([s['x'], s['y'], s['x'] + s['width'] - 1, s['y'] + s['height'] - 1], outline=(0, 255, 0, 255))
d.line([(0, RING), (W * TS, RING)], fill=(255, 80, 80, 200))
canvas.resize((W * TS * 2, H * TS * 2), Image.NEAREST).save('cache/cyclops_collision.png')
print(f'cyclops: {W}x{H} objects={len(objects)} rects={len(rects)} spawns={len(spawns)} ring line y={RING}')
