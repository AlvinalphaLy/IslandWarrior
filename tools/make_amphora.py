"""Draw the amphora of Maron's wine that stands beside the Cyclops head, as 16px-style pixel art.

Writes public/assets/props/amphora.png (14x19): a terracotta wine jar with two handles, a black-figure band round
its belly and dark wine at the lip. Symmetric silhouette given as half-widths per row, shaded with light from the
top left, then outlined.
Run: python tools/make_amphora.py [preview.png]
"""

import sys
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 14, 19
OUT = "public/assets/props/amphora.png"
OUTLINE = (50, 24, 18)
CLAY = [(140, 62, 34), (190, 96, 52), (222, 136, 80), (240, 172, 112)]  # dark -> light
BAND, BAND_DOT = (40, 22, 18), (204, 110, 60)
WINE = (96, 12, 40)

# half-widths per row around the centre (columns 7 - hw .. 6 + hw), from the lip down to the foot
HW = {
    1: 3,
    2: 2,
    3: 2,
    4: 2,
    5: 4,
    6: 5,
    7: 5,
    8: 5,
    9: 5,
    10: 4,
    11: 4,
    12: 3,
    13: 3,
    14: 2,
    15: 1,
    16: 2,
    17: 2,
}
body = np.zeros((H, W), bool)
for y, hw in HW.items():
    body[y, 7 - hw : 7 + hw] = True

img = np.zeros((H, W, 4), np.uint8)
ul = np.zeros_like(body)
ul[1:, 1:] = body[:-1, :-1]
dr = np.zeros_like(body)
dr[:-1, :-1] = body[1:, 1:]
xs = np.arange(W)[None, :].repeat(H, 0)
lvl = (
    2
    + (~ul).astype(int)
    - (~dr).astype(int)
    - (xs >= 9).astype(int)
    + ((xs == 5) & (np.arange(H)[:, None] >= 5)).astype(int)
)
for y, x in zip(*np.nonzero(body)):
    img[y, x] = (*CLAY[int(np.clip(lvl[y, x], 0, 3))], 255)
# black-figure band with a row of clay dots, and the wine in the mouth
for y in (8, 9):
    for x in range(W):
        if body[y, x]:
            img[y, x] = (*BAND, 255)
for x in range(3, 11, 2):
    if body[8, x]:
        img[8, x] = (*BAND_DOT, 255)
img[1, 5:9] = (*WINE, 255)

solid = img[..., 3] > 0
img[ndimage.binary_dilation(solid) & ~solid] = (*OUTLINE, 255)
# handles: thin clay arcs from the neck out and down onto the shoulder, outlined on the outside only, so the
# loop stays a 1px gap (bigger holes read as a pair of eyes at this size)
for (x, y), c in [((3, 2), CLAY[2]), ((2, 3), CLAY[1]), ((2, 4), CLAY[1])]:
    img[y, x] = (*c, 255)
    img[y, W - 1 - x] = (*c, 255)
for x, y in [(3, 1), (2, 2), (1, 3), (1, 4), (2, 5)]:
    img[y, x] = (*OUTLINE, 255)
    img[y, W - 1 - x] = (*OUTLINE, 255)

Image.fromarray(img).save(OUT)
if len(sys.argv) > 1:
    Image.fromarray(img).resize((W * 12, H * 12), Image.NEAREST).save(sys.argv[1])
print(f"wrote {OUT} ({W}x{H})")
