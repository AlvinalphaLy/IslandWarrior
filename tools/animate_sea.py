"""Make every sea pixel of public/assets/maps/village.json use the animated water.

Run after patch_map.py and viking_houses.py (npm run map:build does this). patch_map.py copies the reference's
static waves into Ground3, and the coastline tiles have static water painted into them, so only open-water cells
could animate, and the waves broke into still blocks along every shore. This pass:

  - renders the ground layers (Ground0..3) and finds the sea: pixels in the two water colours that connect to an
    open-water cell. Ponds don't connect, so they stay still.
  - for every cell that contains sea: Ground0 becomes the animated water tile, Ground1..2 are cleared and Ground3
    holds the cell's rendered ground with the sea pixels cut out (a 'shore' tile), or nothing if the cell is all sea.

Objects (bridges, rocks, boats) are untouched and still draw on top. Writes public/assets/tilesets/shore.png.
Running it again gives the same result.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

MAP = 'public/assets/maps/village.json'
SHORE_PNG = 'public/assets/tilesets/shore.png'
H_, V_, D_ = 0x80000000, 0x40000000, 0x20000000
COLS = 32

m = json.load(open(MAP))
TS = m['tilewidth']; W, H = m['width'], m['height']

old = next((t for t in m['tilesets'] if t['name'] == 'shore'), None)
assert old is None or old is m['tilesets'][-1], 'shore must be the last tileset'

sheets = []
for ts in m['tilesets']:
    img = np.asarray(Image.open('public/assets/maps/' + ts['image']).convert('RGBA'))
    sheets.append((ts['firstgid'], ts['columns'], img, ts['name'], ts.get('tilecount', 0)))
water = next(t for t in m['tilesets'] if t['name'] == 'water')
WATER_GID = water['firstgid']
WATER_COLORS = {tuple(c) for c in np.unique(sheets[[s[3] for s in sheets].index('water')][2].reshape(-1, 4), axis=0)
                if c[3] == 255}

def tile(gid):
    flags = gid & 0xE0000000; gid &= 0x1FFFFFFF
    fg, cols, img, _, _ = [s for s in sheets if s[0] <= gid][-1]
    lid = gid - fg
    t = img[(lid // cols) * TS:(lid // cols + 1) * TS, (lid % cols) * TS:(lid % cols + 1) * TS]
    if flags & D_: t = np.swapaxes(t, 0, 1)
    if flags & H_: t = t[:, ::-1]
    if flags & V_: t = t[::-1]
    return t

L = {l['name']: l for l in m['layers'] if l['type'] == 'tilelayer'}
ground = [L[n] for n in ('Ground0', 'Ground1', 'Ground2', 'Ground3') if n in L]
canvas = np.zeros((H * TS, W * TS, 4), np.uint8)
open_water = np.zeros((H, W), bool)
for l in ground:
    for i, g in enumerate(l['data']):
        if not g:
            continue
        cy, cx = divmod(i, W)
        t = tile(g); msk = t[..., 3] > 127
        canvas[cy * TS:(cy + 1) * TS, cx * TS:(cx + 1) * TS][msk] = t[msk]
        if l is ground[0] and (g & 0x1FFFFFFF) - WATER_GID in range(water['tilecount']):
            open_water[cy, cx] = True

# sea = water-coloured pixels connected to an open-water cell
is_water = np.zeros(canvas.shape[:2], bool)
for c in WATER_COLORS:
    is_water |= (canvas == np.array(c, np.uint8)).all(-1)
labels, _ = ndimage.label(is_water)
# seeds: cells that are all water, and either open water or showing waves (the darker colour). Inlets cut off by
# bridges have no open-water cells, so they are found by their waves; ponds are flat light blue and stay still.
DARK = min(WATER_COLORS, key=lambda c: sum(int(v) for v in c[:3]))
has_dark = (canvas == np.array(DARK, np.uint8)).all(-1).reshape(H, TS, W, TS).any(axis=(1, 3))
all_water = is_water.reshape(H, TS, W, TS).all(axis=(1, 3)) & (open_water | has_dark)
seed = np.kron(all_water, np.ones((TS, TS), bool))
sea = np.isin(labels, np.unique(labels[seed])) & is_water

tiles, index = [], {}
def tile_id(arr):
    key = arr.tobytes()
    if key not in index:
        index[key] = len(tiles); tiles.append(arr.copy())
    return index[key]

if 'Ground3' not in L:
    raise SystemExit('run patch_map.py first (Ground3 missing)')
shore_cells, sea_cells = {}, 0
for cy in range(H):
    for cx in range(W):
        ys, xs = slice(cy * TS, (cy + 1) * TS), slice(cx * TS, (cx + 1) * TS)
        s = sea[ys, xs]
        if not s.any():
            continue
        sea_cells += 1
        cell = canvas[ys, xs].copy()
        cell[s] = 0
        i = cy * W + cx
        L['Ground0']['data'][i] = WATER_GID
        for n in ('Ground1', 'Ground2'):
            if n in L: L[n]['data'][i] = 0
        L['Ground3']['data'][i] = 0
        if (cell[..., 3] > 0).any():
            shore_cells[i] = tile_id(cell)

# ---- objects: some tile objects paint still water over the sea (full water tiles from the reconstruction, and
# patch_map.py's reference pixels). Cut the sea out of them, dropping any that end up empty. Edited objects are
# baked to an upright, unflipped tile in the shore sheet, so rotation/flip flags are cleared.
def oriented(o):
    """(tile pixels as drawn, left, top), the way the game places Tiled tile objects (bottom-left anchor)."""
    t = tile(o['gid']); x, y, r = int(o['x']), int(o['y']), int(o.get('rotation', 0)) % 360
    if r == 0:   return t, x, y - TS
    if r == 90:  return np.rot90(t, -1), x, y
    if r == 270: return np.rot90(t, 1), x - TS, y - TS
    return np.rot90(t, 2), x - TS, y

objects_layer = next(l for l in m['layers'] if l['name'] == 'Objects')
shore_first_old = old['firstgid'] if old else None
kept, removed, edited = [], 0, []
for o in objects_layer['objects']:
    if 'gid' not in o:
        kept.append(o); continue
    t, x0, y0 = oriented(o)
    on_sea = np.zeros((TS, TS), bool)
    ys0, xs0 = max(0, y0), max(0, x0)
    ys1, xs1 = min(H * TS, y0 + TS), min(W * TS, x0 + TS)
    if ys0 < ys1 and xs0 < xs1:
        on_sea[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = sea[ys0:ys1, xs0:xs1]
    if x0 < 0 or y0 < 0 or x0 + TS > W * TS or y0 + TS > H * TS:   # off-map parts next to the sea count as sea
        off = np.ones((TS, TS), bool); off[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = False
        on_sea |= off
    wet = on_sea & np.isin(t[..., :3].view([('', np.uint8)] * 3).reshape(TS, TS),
                           np.array([tuple(c[:3]) for c in WATER_COLORS], dtype=[('', np.uint8)] * 3)) & (t[..., 3] > 0)
    from_shore = shore_first_old is not None and (o['gid'] & 0x1FFFFFFF) >= shore_first_old
    if not wet.any() and not from_shore:
        kept.append(o); continue
    cut = t.copy(); cut[wet] = 0
    if not (cut[..., 3] > 0).any():
        removed += 1; continue
    edited.append((o, tile_id(cut), x0, y0)); kept.append(o)
objects_layer['objects'] = kept

rows = max(1, (len(tiles) + COLS - 1) // COLS)
sheet = np.zeros((rows * TS, COLS * TS, 4), np.uint8)
for i, t in enumerate(tiles):
    sheet[(i // COLS) * TS:(i // COLS + 1) * TS, (i % COLS) * TS:(i % COLS + 1) * TS] = t
Image.fromarray(sheet).save(SHORE_PNG)
if old:  # rendered above with the previous shore tiles; now replace them
    m['tilesets'].remove(old)
first =max(t['firstgid'] + t['tilecount'] for t in m['tilesets'])
m['tilesets'].append(dict(firstgid=first, name='shore', image='../tilesets/shore.png', imagewidth=COLS * TS,
                          imageheight=rows * TS, tilewidth=TS, tileheight=TS, columns=COLS, tilecount=len(tiles),
                          margin=0, spacing=0))
for i, tid in shore_cells.items():
    L['Ground3']['data'][i] = first + tid
for o, tid, x0, y0 in edited:
    o['gid'] = first + tid; o['x'] = x0; o['y'] = y0 + TS; o['rotation'] = 0
json.dump(m, open(MAP, 'w'))
print(f'sea: {sea_cells} cells animate ({int(open_water.sum())} were open water before), '
      f'{len(shore_cells)} shore overlays, {len(edited)} objects trimmed, {removed} removed, '
      f'{len(tiles)} unique shore tiles')
