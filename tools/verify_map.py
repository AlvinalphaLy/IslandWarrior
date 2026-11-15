"""Render public/assets/maps/village.json exactly as the game does (ground layers, then objects
sorted by sortY/z) and compare against reference/village.png.
Writes cache/verify_render.png, cache/verify_side_by_side.png, cache/verify_diff.png."""
import json, sys
import numpy as np
from PIL import Image

MAP = 'public/assets/maps/village.json'
REF = 'reference/village.png'
H_, V_, D_ = 0x80000000, 0x40000000, 0x20000000

m = json.load(open(MAP))
TS = m['tilewidth']; RW, RH = m['width'] * TS, m['height'] * TS
sheets = []
for ts in m['tilesets']:
    img = np.asarray(Image.open('public/assets/maps/' + ts['image']).convert('RGBA'))
    sheets.append((ts['firstgid'], ts['columns'], img))

def tile(gid):
    flags = gid & 0xE0000000; gid &= 0x1FFFFFFF
    fg, cols, img = [s for s in sheets if s[0] <= gid][-1]
    lid = gid - fg
    t = img[(lid // cols) * TS:(lid // cols + 1) * TS, (lid % cols) * TS:(lid % cols + 1) * TS]
    if flags & D_: t = np.swapaxes(t, 0, 1)
    if flags & H_: t = t[:, ::-1]
    if flags & V_: t = t[::-1]
    return t

canvas = np.zeros((RH, RW, 4), np.uint8)
def blit(t, x, y):
    x0, y0, x1, y1 = max(0, x), max(0, y), min(RW, x + TS), min(RH, y + TS)
    if x0 >= x1 or y0 >= y1: return
    sub = t[y0 - y:y1 - y, x0 - x:x1 - x]; msk = sub[..., 3] > 127
    canvas[y0:y1, x0:x1][msk] = sub[msk]

layers = {l['name']: l for l in m['layers']}
for name in ('Ground0', 'Ground1', 'Ground2'):
    for i, g in enumerate(layers[name]['data']):
        if g: blit(tile(g), (i % m['width']) * TS, (i // m['width']) * TS)

def prop(o, k, d=None):
    for p in o.get('properties', []):
        if p['name'] == k: return p['value']
    return d

objs = layers['Objects']['objects']
objs = sorted(objs, key=lambda o: (prop(o, 'sortY', -1), prop(o, 'z', 0)))
for o in objs:
    t = tile(o['gid']); x, y, r = int(o['x']), int(o['y']), int(o.get('rotation', 0)) % 360
    # Tiled tile objects rotate around their bottom-left anchor
    if r == 0:   blit(t, x, y - TS)
    elif r == 90:  blit(np.rot90(t, -1), x, y)
    elif r == 270: blit(np.rot90(t, 1), x - TS, y - TS)
    elif r == 180: blit(np.rot90(t, 2), x - TS, y)

ref = np.asarray(Image.open(REF).convert('RGB'))[::2, ::2]
out = canvas[..., :3]
same = (out == ref).all(-1)
rc = ref.astype(np.int32); key = (rc[..., 0] << 16) | (rc[..., 1] << 8) | rc[..., 2]
wave = np.isin(key, [0x4280DD, 0x50A7E8])  # the two wave blues of the static reference water
print(f'pixel-identical: {same.mean() * 100:.2f}%   excluding open water (animated in-game): {same[~wave].mean() * 100:.2f}%')

Image.fromarray(out).resize((RW * 2, RH * 2), Image.NEAREST).save('cache/verify_render.png')
side = Image.new('RGB', (RW * 4 + 8, RH * 2), (0, 0, 0))
side.paste(Image.fromarray(ref).resize((RW * 2, RH * 2), Image.NEAREST), (0, 0))
side.paste(Image.fromarray(out).resize((RW * 2, RH * 2), Image.NEAREST), (RW * 2 + 8, 0))
side.save('cache/verify_side_by_side.png')
d = ref.copy(); d[~same] = [255, 0, 255]
Image.fromarray(d).resize((RW * 2, RH * 2), Image.NEAREST).save('cache/verify_diff.png')
if same[~wave].mean() < 0.90:
    sys.exit(1)
