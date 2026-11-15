"""The campfire put out by the rain (night storm): public/assets/tilesets/campfire_out.png, one 16x16 frame.

Frame 0 of public/assets/tilesets/campfire.png with the flames taken away: flame pixels above the brazier's bowl are
removed, those inside the bowl become grey ash with two dull embers. The brazier itself is unchanged.
Run: python tools/make_campfire_out.py [preview.png]
"""
import sys
import numpy as np
from PIL import Image

SRC = 'public/assets/tilesets/campfire.png'
OUT = 'public/assets/tilesets/campfire_out.png'
FLAME = {(255, 147, 61), (255, 195, 61), (255, 234, 61)}
ASH = [(96, 92, 100), (124, 118, 122), (78, 74, 84)]
EMBER = (150, 58, 40)

a = np.asarray(Image.open(SRC).convert('RGBA'))[:, :16].copy()
frame = a.copy()
# the bowl: rows where the brazier's dark rim appears (the flames stand above it)
rim = {(58, 58, 80), (70, 70, 94)}
rim_rows = [y for y in range(16) if any(tuple(int(v) for v in a[y, x, :3]) in rim and a[y, x, 3] for x in range(16))]
bowl_top = min(rim_rows) if rim_rows else 9
embers = 0
for y in range(16):
    for x in range(16):
        if not a[y, x, 3] or tuple(int(v) for v in a[y, x, :3]) not in FLAME:
            continue
        if y < bowl_top:
            frame[y, x] = (0, 0, 0, 0)                          # the flames are gone
        else:
            ember = embers < 2 and (x * 7 + y * 3) % 5 == 0
            embers += ember
            frame[y, x, :3] = EMBER if ember else ASH[(x + y) % 3]
Image.fromarray(frame).save(OUT)
if len(sys.argv) > 1:
    pv = Image.new('RGBA', (36, 16), (110, 170, 90, 255))
    pv.alpha_composite(Image.fromarray(a), (0, 0)); pv.alpha_composite(Image.fromarray(frame), (20, 0))
    pv.resize((36 * 10, 160), Image.NEAREST).save(sys.argv[1])
print(f'wrote {OUT} (bowl from row {bowl_top})')
