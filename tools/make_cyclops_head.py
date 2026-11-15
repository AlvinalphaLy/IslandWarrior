"""Draw the stone head of Polyphemus the Cyclops, half sunk into the islet, as 16px-style pixel art.

Writes public/assets/props/cyclops_head.png (32x34). The head is a symmetric silhouette (left half given as pixel
runs, mirrored), carved from grey stone with moss on the crown, one great eye under a heavy brow, a broad nose,
a snarling mouth and a shaggy beard that sinks into a ring of rubble. Shaded with light from the top left, then
outlined.
Run: python tools/make_cyclops_head.py [preview.png]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 32, 34
OUT = 'public/assets/props/cyclops_head.png'

OUTLINE = (38, 38, 46)
STONE = [(78, 80, 92), (108, 110, 120), (138, 140, 146), (168, 168, 170)]   # dark -> light
MOSS = [(70, 104, 52), (98, 138, 64), (130, 168, 80)]
EYE_WHITE = (226, 222, 204)
IRIS = [(150, 40, 34), (196, 70, 48)]   # red, so the eye reads from afar
RUBBLE = [(92, 90, 96), (124, 122, 126)]

C = W / 2   # mirror axis: column c <-> W - 1 - c

def sym(spec):
    """left-half runs per row: {row: first column}; filled to the mirror axis and mirrored."""
    m = np.zeros((H, W), bool)
    for y, a in spec.items():
        m[y, a:W - a] = True
    return m

def runs(spec, mirror=True):
    m = np.zeros((H, W), bool)
    for y, rs in spec.items():
        for a, b in rs:
            m[y, a:b + 1] = True
            if mirror: m[y, W - 1 - b:W - a] = True
    return m

# ---- shapes
head = sym({0: 12, 1: 10, 2: 8, 3: 7, 4: 6, 5: 5, 6: 5, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4, 12: 4, 13: 4, 14: 5,
            15: 5, 16: 5, 17: 5, 18: 5, 19: 6, 20: 6, 21: 6, 22: 7, 23: 7, 24: 8, 25: 8, 26: 9})
ears = runs({10: [(2, 4)], 11: [(1, 4)], 12: [(1, 4)], 13: [(2, 4)], 14: [(3, 4)]})
hair = runs({5: [(4, 6)], 6: [(3, 5)], 7: [(2, 4)], 8: [(2, 4)], 9: [(3, 4)], 15: [(3, 5)], 16: [(3, 5)],
             17: [(4, 5)]})                                   # shaggy tufts at the temples
rubble = runs({26: [(3, 8)], 27: [(1, 15)], 28: [(0, 15)], 29: [(0, 15)], 30: [(1, 15)], 31: [(2, 15)],
               32: [(4, 15)]})
solid_head = head | ears | hair

brow = runs({8: [(8, 15)], 9: [(7, 15)]})
eye_socket = runs({10: [(10, 15)], 11: [(9, 15)], 12: [(9, 15)], 13: [(9, 15)], 14: [(10, 15)]})
eye_white = runs({11: [(11, 15)], 12: [(10, 15)], 13: [(11, 15)]})
iris = runs({11: [(14, 15)], 12: [(13, 15)], 13: [(14, 15)]})
pupil = runs({12: [(15, 15)]})
nose = runs({15: [(14, 15)], 16: [(13, 15)], 17: [(12, 15)], 18: [(12, 15)]})
nostril = runs({18: [(13, 13)]})
mouth = runs({20: [(10, 15)], 21: [(11, 15)]})
tusk = runs({20: [(11, 11)], 21: [(11, 11)]})
beard = runs({19: [(6, 9)], 20: [(6, 9)], 21: [(6, 10)], 22: [(7, 15)], 23: [(7, 15)], 24: [(8, 15)],
              25: [(8, 15)], 26: [(9, 15)]})
moss = runs({0: [(12, 15)], 1: [(10, 13)], 2: [(8, 11)], 3: [(7, 9)], 4: [(6, 7)], 5: [(5, 5)]}, mirror=False) \
     | runs({0: [(16, 19)], 1: [(18, 21)], 2: [(21, 22)], 3: [(23, 23)]}, mirror=False) \
     | runs({7: [(17, 18)], 26: [(4, 6)], 27: [(3, 5), (25, 27)], 28: [(26, 28)]}, mirror=False)

img = np.zeros((H, W, 4), np.uint8)
def put(m, c):
    img[m] = (*c, 255)

# stone: base tone, rounded with light from the top left
def stone(m, base):
    ul = np.zeros_like(m); ul[1:, 1:] = m[:-1, :-1]
    dr = np.zeros_like(m); dr[:-1, :-1] = m[1:, 1:]
    xs = np.arange(W)[None, :].repeat(H, 0)
    lvl = np.full(m.shape, base) + (~ul) - (~dr) - (xs > W * 0.72) + (xs < W * 0.3) * 0
    for y, x in zip(*np.nonzero(m)):
        img[y, x] = (*STONE[int(np.clip(lvl[y, x], 0, 3))], 255)

rub = rubble & ~solid_head
# a mound of broken stones: lit on top, darker toward the water, with scattered pebble shadows
for y, x in zip(*np.nonzero(rub)):
    img[y, x] = (*RUBBLE[1 if y <= 28 else 0], 255)
    if (x * 13 + y * 7) % 11 == 0 and y < 32:
        img[y, x] = (*STONE[0], 255)
    if (x * 5 + y * 11) % 13 == 0 and y <= 29:
        img[y, x] = (*STONE[3], 255)
stone(solid_head, 2)
stone(hair, 1)
for y, x in zip(*np.nonzero(beard)):   # beard strands: alternating columns
    img[y, x] = (*STONE[1 if x % 2 else 2], 255)
put(brow & ~ndimage.binary_dilation(brow, [[0, 0, 0], [0, 1, 0], [0, 1, 0]]) | brow, STONE[3])
put(runs({10: [(9, 15)]}) & ~eye_socket | (eye_socket & ~eye_white), STONE[0])  # shadow under the brow
put(eye_white, EYE_WHITE)
put(iris, IRIS[0]); img[11, 15] = img[11, 16] = (*IRIS[1], 255)
put(pupil, OUTLINE)
put(nose, STONE[3]); put(runs({18: [(12, 12)], 17: [(12, 12)]}), STONE[1]); put(nostril, STONE[0])
put(mouth, OUTLINE); put(tusk, EYE_WHITE)
img[18, W - 1 - 13] = (*STONE[0], 255)   # far nostril darker (light comes from the left)
# a crack across the right cheek
for y, x in [(13, 22), (14, 22), (15, 23), (16, 23), (17, 24), (18, 24)]:
    img[y, x] = (*STONE[0], 255)
for y, x in zip(*np.nonzero(moss & (img[..., 3] > 0))):
    img[y, x] = (*MOSS[2 if (x + y) % 3 == 0 else 1], 255)

# ---- outline
solid = img[..., 3] > 0
img[ndimage.binary_dilation(solid) & ~solid] = (*OUTLINE, 255)
img[ndimage.binary_dilation(solid_head) & rub & (np.arange(H)[:, None] < 30)] = (*OUTLINE, 255)

# ---- frames: 0 = dormant (as drawn above), 1/2 = awakened by the wine: jaw gaping open into a dark cave mouth,
# the eye blazing (1) / glowing (2). The game pulses between 1 and 2.
def awake(bright):
    a = img.copy()
    inside, wine = (24, 8, 16), (106, 14, 36)
    gape = runs({20: [(10, 15)], 21: [(10, 15)], 22: [(10, 15)], 23: [(11, 15)], 24: [(12, 15)]})
    a[gape] = (*inside, 255)
    a[runs({23: [(13, 15)], 24: [(14, 15)]})] = (*wine, 255)              # wine glinting in the throat
    a[runs({20: [(11, 11)], 21: [(11, 11)], 22: [(11, 11)]})] = (*EYE_WHITE, 255)   # upper tusks, longer now
    a[runs({24: [(13, 13)]})] = (*EYE_WHITE, 255)                         # lower teeth
    a[runs({25: [(12, 15)]})] = (*OUTLINE, 255)                           # lower lip line
    hot = [(255, 214, 120), (255, 92, 48)] if bright else [(255, 150, 80), (214, 52, 40)]
    a[iris] = (*hot[1], 255); a[runs({12: [(14, 15)]})] = (*hot[0], 255)
    a[pupil] = (*((120, 10, 10) if bright else (60, 8, 8)), 255)
    for y, x in zip(*np.nonzero(eye_white & ~iris)):
        a[y, x] = (*((255, 236, 200) if bright else (238, 226, 200)), 255)
    return a

sheet = np.concatenate([img, awake(True), awake(False)], axis=1)
Image.fromarray(sheet).save(OUT)
if len(sys.argv) > 1:
    Image.fromarray(sheet).resize((sheet.shape[1] * 8, H * 8), Image.NEAREST).save(sys.argv[1])
print(f'wrote {OUT} (3 frames of {W}x{H})')
