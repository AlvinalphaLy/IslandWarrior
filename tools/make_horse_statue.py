"""Draw the wooden horse statue (a rearing horse on a round plinth) as 16px-style pixel art.

Writes public/assets/props/horse_statue.png. The silhouette is placed by hand as pixel runs per row on a 40x56
design grid (near body, far limbs, carved mane/tail plates), scaled up by SCALE, and only then shaded (light from
the top left), given carved strap lines like a wooden statue, and outlined, so the outline stays 1px like the rest
of the village art at any size.
Run: python tools/make_horse_statue.py [preview.png]
"""

import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SCALE = 1.5
GW, GH = 40, 56  # design grid
W, H = round(GW * SCALE), round(GH * SCALE)  # output size
OUT = "public/assets/props/horse_statue.png"

OUTLINE = (52, 30, 22)
WOOD = [(92, 52, 32), (122, 72, 42), (150, 92, 54), (178, 118, 70)]  # dark -> light
GROOVE = (104, 60, 36)
PLINTH = [(88, 52, 34), (120, 72, 44), (146, 90, 56)]  # side, top, highlight


def runs(spec):
    m = np.zeros((GH, GW), bool)
    for y, rs in spec.items():
        for a, b in rs:
            m[y, a : b + 1] = True
    return m


def up(m):
    return (
        np.asarray(
            Image.fromarray(m.astype(np.uint8) * 255).resize((W, H), Image.NEAREST)
        )
        > 0
    )


def s(v):
    return round(v * SCALE)


# near side of the horse: head (muzzle tipped down), neck, chest, raised foreleg, body, haunch, planted hind leg
body = runs(
    {
        0: [(28, 28)],
        1: [(28, 29)],
        2: [(27, 30)],
        3: [(26, 31)],
        4: [(23, 32)],
        5: [(22, 33)],
        6: [(22, 33)],
        7: [(21, 34)],
        8: [(21, 35)],
        9: [(20, 35)],
        10: [(20, 27), (29, 35)],
        11: [(19, 27), (31, 34)],
        12: [(19, 27)],
        13: [(18, 27)],
        14: [(18, 28)],
        15: [(17, 29)],
        16: [(16, 30)],
        17: [(16, 33)],
        18: [(15, 34)],
        19: [(15, 27), (31, 35)],
        20: [(14, 27), (33, 36)],
        21: [(14, 26), (34, 36)],
        22: [(13, 26), (34, 36)],
        23: [(13, 25), (33, 36)],
        24: [(12, 24)],
        25: [(12, 24)],
        26: [(11, 23)],
        27: [(11, 23)],
        28: [(10, 22)],
        29: [(10, 22)],
        30: [(10, 22)],
        31: [(10, 22)],
        32: [(10, 21)],
        33: [(10, 21)],
        34: [(11, 21)],
        35: [(11, 20)],
        36: [(12, 19)],
        37: [(12, 18)],
        38: [(12, 17)],
        39: [(12, 16)],
        40: [(12, 15)],
        41: [(13, 15)],
        42: [(14, 16)],
        43: [(14, 16)],
        44: [(15, 17)],
        45: [(15, 18)],
        46: [(15, 18)],
    }
)
# far side: the other foreleg (lower, pawing) and the other hind leg, drawn darker behind the body
far = (
    runs(
        {
            20: [(28, 30)],
            21: [(27, 31)],
            22: [(28, 32)],
            23: [(30, 32)],
            24: [(30, 33)],
            25: [(30, 33)],
            26: [(30, 33)],
            36: [(19, 21)],
            37: [(18, 21)],
            38: [(18, 21)],
            39: [(19, 21)],
            40: [(19, 22)],
            41: [(20, 22)],
            42: [(20, 22)],
            43: [(21, 23)],
            44: [(21, 23)],
            45: [(21, 24)],
            46: [(21, 24)],
        }
    )
    & ~body
)
# carved plates: a comb mane along the crest, and a segmented tail
crest = {3: 23, 5: 22, 7: 21, 9: 20, 11: 19, 13: 18}
mane = np.zeros((GH, GW), bool)
for y, x in crest.items():
    mane[y, x - 2 : x] = True
    mane[y - 1, x - 2] = True
tail = runs(
    {
        29: [(8, 9)],
        30: [(7, 9)],
        31: [(7, 8)],
        32: [(6, 8)],
        34: [(6, 7)],
        35: [(5, 7)],
        36: [(5, 6)],
        38: [(5, 7)],
        39: [(6, 7)],
        40: [(6, 8)],
    }
)
plates = (mane | tail) & ~body

body, far, plates = up(body), up(far), up(plates)
far &= ~body
plates &= ~body

# ---- shade: highlight where the up-left neighbour is empty, shadow where the down-right one is
img = np.zeros((H, W, 4), np.uint8)


def shade(m, base):
    ul = np.zeros_like(m)
    ul[1:, 1:] = m[:-1, :-1]
    dr = np.zeros_like(m)
    dr[:-1, :-1] = m[1:, 1:]
    lvl = np.full(m.shape, base) + (~ul) - (~dr)
    for y, x in zip(*np.nonzero(m)):
        img[y, x] = (*WOOD[int(np.clip(lvl[y, x], 0, 3))], 255)


shade(far, 0)
shade(body, 2)
shade(plates, 3)

# carved straps, like the armour-plate seams of the reference: around the neck base, the chest, and the girth
inner = ndimage.binary_erosion(body)
for (x0, y0), (x1, y1) in [
    ((19, 13), (27, 9)),
    ((15, 21), (26, 16)),
    ((11, 30), (22, 25)),
    ((13, 38), (20, 34)),
]:
    for t in np.linspace(0, 1, 80):
        x, y = round(s(x0) + (s(x1) - s(x0)) * t), round(s(y0) + (s(y1) - s(y0)) * t)
        if inner[y, x]:
            img[y, x] = (*GROOVE, 255)
img[s(5), s(30)] = (*OUTLINE, 255)  # eye
img[s(10), s(34)] = (*WOOD[1], 255)  # nostril

# ---- plinth
plinth = np.zeros((H, W, 4), np.uint8)


def mask(fn):
    im = Image.new("L", (W, H), 0)
    fn(ImageDraw.Draw(im))
    return np.asarray(im) > 0


top = mask(lambda d: d.ellipse((s(5), s(43), s(34), s(51)), fill=255))
side = mask(
    lambda d: (
        d.ellipse((s(5), s(46), s(34), s(54)), fill=255),
        d.rectangle((s(5), s(47), s(34), s(50)), fill=255),
    )
)
plinth[side] = (*PLINTH[0], 255)
plinth[top] = (*PLINTH[1], 255)
plinth[mask(lambda d: d.arc((s(8), s(44), s(31), s(50)), 180, 290, fill=255)) & top] = (
    *PLINTH[2],
    255,
)

out = plinth.copy()
hm = img[..., 3] > 0
out[hm] = img[hm]

# ---- outlines: around everything, between the far limbs / plates and the body, and the plinth rim
solid = out[..., 3] > 0
out[ndimage.binary_dilation(solid) & ~solid] = (*OUTLINE, 255)
out[ndimage.binary_dilation(body) & (far | plates)] = (*OUTLINE, 255)
rim = top & ~ndimage.binary_erosion(top) & (np.arange(H)[:, None] >= s(47)) & ~hm
out[rim] = (*OUTLINE, 255)

Image.fromarray(out).save(OUT)
if len(sys.argv) > 1:
    Image.fromarray(out).resize((W * 6, H * 6), Image.NEAREST).save(sys.argv[1])
print(f"wrote {OUT} ({W}x{H}); plinth footprint about {s(29)}x{s(8)} px")
