"""Author the cave interior (public/assets/maps/cave.json) from the Fungus Cave tileset.

Same layer conventions as the village map:
  Ground0 (room autotile), Ground1 (pits, ladder overlays), Ground2 (unused),
  Objects (tile objects with sortY/z), Collision (rects), Spawns (player/npc/exit/chest).
Run: python tools/build_cave.py   -> also writes cache/cave_render.png + cache/cave_collision.png
"""
import json, os, random
import numpy as np
from PIL import Image, ImageDraw

SRC = 'Fungus Cave [16x16]/Tilesets/Tileset - Fungus cave and Refugee outpost 16x16.png'
OUT = 'public/assets'
TS = 16
W, H = 30, 20
random.seed(7)

sheet = np.asarray(Image.open(SRC).convert('RGBA'))
COLS = sheet.shape[1] // TS
TILECOUNT = COLS * (sheet.shape[0] // TS)

def tile(tid):
    return sheet[(tid // COLS) * TS:(tid // COLS + 1) * TS, (tid % COLS) * TS:(tid % COLS + 1) * TS]

# ------------------------------------------------------------------ room autotile (template = tiles 0..47)
VOID = 6
g0 = [[VOID] * W for _ in range(H)]
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
        elif y == 1: t = 9 + (x - 1) % 4                    # wall, upper
        elif y == 2: t = 17 + (x - 1) % 4                   # wall, lower
        elif y == 3: t = 25 if x == 1 else 26 + (x % 3)     # floor in the wall's shadow
        elif x == 1: t = 33
        else:
            r = random.random()
            t = random.choice([7, 14, 15, 22, 23]) if r < 0.08 else random.choice([34, 35, 36])
        g0[y][x] = t

# wall accents (upper, lower) pairs
WALL_ACCENTS = {6: (110, 118), 10: (73, 81), 19: (110, 118), 23: (74, 82), 26: (73, 81)}
for x, (a, b) in WALL_ACCENTS.items():
    g0[1][x], g0[2][x] = a, b
for x, t in {8: 166, 12: 174, 17: 182, 21: 174}.items():   # lanterns on the lower wall
    g0[2][x] = t

g1 = [[0] * W for _ in range(H)]
# ladder back up to the village (3 tall, over the top border + wall)
LADDER_X = 3
for dy, t in enumerate((99, 107, 115)):
    g1[dy][LADDER_X] = t

# chasms: the tileset has a 2-row pit (67-69 over 75-77) and a 1-row crack (83-85); both stretch horizontally
PITS = [(4, 9, 9, 10), (19, 11, 25, 12), (11, 15, 16, 16), (2, 12, 5, 12)]
for x0, y0, x1, y1 in PITS:
    assert y1 - y0 in (0, 1), 'pits are 1 or 2 rows tall'
    rows = [[83, 84, 85]] if y1 == y0 else [[67, 68, 69], [75, 76, 77]]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            col = 0 if x == x0 else 2 if x == x1 else 1
            g1[y][x] = rows[y - y0][col]

# ------------------------------------------------------------------ objects (stamps)
# (tile ids rows, tile x, tile y, category)  category: solid | flat
STAMPS = [
    ([[168, 169, 170], [176, 177, 178], [184, 185, 186]], 13, 4, 'solid'),   # Fungus King shrine statue
    ([[212], [220]], 11, 5, 'solid'), ([[213], [221]], 17, 5, 'solid'),       # posts flanking the shrine
    ([[190], [198]], 2, 6, 'solid'), ([[190], [198]], 27, 9, 'solid'),        # big green mushrooms
    ([[111]], 11, 9, 'solid'), ([[119]], 3, 14, 'solid'), ([[111]], 18, 8, 'solid'), ([[119]], 26, 15, 'solid'),
    ([[200]], 7, 4, 'solid'), ([[202]], 16, 13, 'solid'), ([[200]], 9, 17, 'solid'), ([[202]], 25, 4, 'solid'),
    ([[201]], 12, 9, 'flat'), ([[201]], 6, 15, 'flat'), ([[201]], 22, 7, 'flat'), ([[201]], 16, 17, 'flat'),
    ([[120, 121]], 21, 4, 'solid'),                                            # chest (north-east)
    ([[124, 125]], 2, 17, 'solid'),                                            # blue chest (south-west)
    ([[238, 239], [246, 247]], 26, 16, 'solid'),                               # refugee camp crates
    ([[236], [244]], 25, 16, 'solid'), ([[242]], 21, 17, 'solid'), ([[243]], 22, 17, 'solid'),
    ([[150]], 28, 13, 'solid'), ([[151]], 28, 14, 'solid'), ([[158]], 19, 17, 'solid'),
    ([[216], [224]], 23, 15, 'flat'), ([[216], [224]], 18, 15, 'flat'),        # bedrolls
    ([[218]], 20, 15, 'solid'), ([[215], [223]], 28, 4, 'solid'),              # chair, cabinet
    ([[135]], 5, 4, 'flat'), ([[60]], 6, 3, 'flat'),                           # tools by the ladder
    ([[128]], 9, 7, 'flat'), ([[129]], 15, 10, 'flat'), ([[130]], 24, 9, 'flat'), ([[128]], 4, 15, 'flat'),
    ([[89]], 13, 12, 'flat'), ([[90]], 20, 6, 'flat'), ([[88]], 7, 13, 'flat'), ([[91]], 26, 11, 'flat'),
]
objects = []  # dict(id, x, y, cat, sortY, z)
for z, (rows, tx, ty, cat) in enumerate(STAMPS):
    bottom = (ty + len(rows)) * TS
    for dy, row in enumerate(rows):
        for dx, tid in enumerate(row):
            objects.append(dict(id=tid, x=(tx + dx) * TS, y=(ty + dy) * TS, cat=cat,
                                sortY=-1 if cat == 'flat' else bottom, z=len(objects), stamp=z))

# ------------------------------------------------------------------ collision
rects = []
blocked_tiles = np.zeros((H, W), bool)
blocked_tiles[:3, :] = True; blocked_tiles[-1, :] = True; blocked_tiles[:, 0] = True; blocked_tiles[:, -1] = True

def greedy(grid):
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
            out.append((x * TS, y * TS, (x1 - x + 1) * TS, (y1 - y + 1) * TS, 'wall'))
            x = x1 + 1
    return out
rects += greedy(blocked_tiles)
for x0, y0, x1, y1 in PITS:
    rects.append((x0 * TS + 3, y0 * TS + 4, (x1 - x0 + 1) * TS - 6, (y1 - y0 + 1) * TS - 7, 'pit'))
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

blocked = np.zeros((H * TS, W * TS), bool)
for x, y, w, h, _ in rects:
    blocked[y:y + h, x:x + w] = True

def nearest_walkable(x, y):
    for r in range(40):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r: continue
                fx, fy = x + dx, y + dy
                if fx - 5 < 0 or fy - 6 < 0 or fx + 5 > W * TS or fy > H * TS: continue
                if not blocked[fy - 6:fy, fx - 5:fx + 5].any():
                    return fx, fy
    return x, y

# ------------------------------------------------------------------ spawns
oid = [1]
def nid():
    oid[0] += 1; return oid[0]
spawns = []
def point(name, typ, x, y, **props):
    fx, fy = nearest_walkable(x, y)
    spawns.append(dict(id=nid(), name=name, type=typ, x=float(fx), y=float(fy), point=True, width=0, height=0,
                       rotation=0, visible=True,
                       properties=[dict(name=k, type='int' if isinstance(v, int) else 'string', value=v)
                                   for k, v in props.items()]))
def area(name, typ, x, y, w, h, **props):
    spawns.append(dict(id=nid(), name=name, type=typ, x=float(x), y=float(y), width=w, height=h, rotation=0,
                       visible=True, properties=[dict(name=k, type='string', value=v) for k, v in props.items()]))

point('player', 'player', LADDER_X * TS + 8, 4 * TS + 6, sprite='adam')
area('exit_ladder', 'exit', LADDER_X * TS + 1, 3 * TS - 2, 14, 9, target='village')
point('Fungus King', 'npc', 14 * TS + 8, 8 * TS + 6, sprite='fungus_king', dialog='fungus_king')
point('Rufus', 'npc', 8 * TS, 6 * TS, sprite='fungus_red', dialog='fungus_red', wander=30)
point('Violet', 'npc', 23 * TS, 8 * TS + 8, sprite='fungus_violet', dialog='fungus_violet', wander=30)
point('Wisp', 'npc', 9 * TS, 15 * TS, sprite='fungus_ghost', dialog='fungus_ghost', wander=24)
point('Sister Ada', 'npc', 24 * TS, 17 * TS + 10, sprite='cleric', dialog='cleric', wander=10)
point('Bram', 'npc', 19 * TS + 8, 16 * TS + 6, sprite='refugee1', dialog='refugee1', wander=12)
point('Nell', 'npc', 27 * TS, 12 * TS + 8, sprite='refugee3', dialog='refugee3', wander=10)
area('chest_0', 'chest', 21 * TS, 4 * TS, 32, 16, dialog='chest_0')
area('chest_1', 'chest', 2 * TS, 17 * TS, 32, 16, dialog='chest_1')

# ------------------------------------------------------------------ write Tiled JSON
os.makedirs(f'{OUT}/maps', exist_ok=True); os.makedirs(f'{OUT}/tilesets', exist_ok=True)
Image.open(SRC).convert('RGBA').save(f'{OUT}/tilesets/cave.png')
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
json.dump(tmj, open(f'{OUT}/maps/cave.json', 'w'), default=lambda v: v.item())

# ------------------------------------------------------------------ previews
canvas = Image.new('RGBA', (W * TS, H * TS), (0, 0, 0, 255))
def blit(tid, x, y):
    canvas.alpha_composite(Image.fromarray(tile(tid)), (x, y))
for g in (g0, g1):
    for y in range(H):
        for x in range(W):
            if g is g0 or g[y][x]:
                blit(g[y][x], x * TS, y * TS)
for o in sorted(objects, key=lambda o: (o['sortY'], o['z'])):
    blit(o['id'], o['x'], o['y'])
canvas.resize((W * TS * 2, H * TS * 2), Image.NEAREST).save('cache/cave_render.png')
d = ImageDraw.Draw(canvas, 'RGBA')
for x, y, w, h, k in rects:
    d.rectangle([x, y, x + w - 1, y + h - 1], fill={'wall': (255, 0, 200, 90), 'pit': (0, 120, 255, 110), 'solid': (255, 255, 0, 130)}[k])
for s in spawns:
    if s.get('point'): d.ellipse([s['x'] - 2, s['y'] - 2, s['x'] + 2, s['y'] + 2], fill=(255, 255, 255, 255))
    else: d.rectangle([s['x'], s['y'], s['x'] + s['width'] - 1, s['y'] + s['height'] - 1], outline=(0, 255, 0, 255))
canvas.resize((W * TS * 2, H * TS * 2), Image.NEAREST).save('cache/cave_collision.png')
print(f'cave: {W}x{H} objects={len(objects)} rects={len(rects)} spawns={len(spawns)}')
