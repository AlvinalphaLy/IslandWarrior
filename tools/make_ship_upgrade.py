"""The upgraded black ship (the prize for escaping the Laestrygonian harbour): public/assets/props/ship_bronze.png.

A palette swap of public/assets/props/ship.png (tools/make_ship.py), so its 4 frames of 128x84 and the waterline at
y=66 stay identical: the cream sail becomes a crimson war sail with a gold stripe, the black hull is plated in bronze
with gold trim. Wood (mast, yard, oars), rigging, the eye and the water shading are untouched.
Run: python tools/make_ship_upgrade.py [preview.png]
"""

import sys
import numpy as np
from PIL import Image

SRC = "public/assets/props/ship.png"
OUT = "public/assets/props/ship_bronze.png"
SWAP = {
    # sail: cream -> crimson, shaded the same way
    (244, 234, 210): (198, 44, 44),
    (221, 207, 174): (160, 30, 34),
    (201, 180, 142): (122, 22, 30),
    # the red stripe (sail and hull band) -> gold, its highlight -> pale gold
    (217, 50, 50): (246, 204, 96),
    (252, 92, 70): (255, 236, 170),
    # hull: dark navy -> bronze plating
    (86, 89, 114): (176, 118, 54),
    (70, 70, 94): (136, 86, 38),
    (58, 58, 80): (100, 62, 28),
}

a = np.asarray(Image.open(SRC).convert("RGBA")).copy()
rgb = a[..., :3]
opaque = a[..., 3] == 255
out = a.copy()
for src, dst in SWAP.items():
    m = opaque & (rgb == np.array(src, np.uint8)).all(-1)
    out[m, :3] = dst
Image.fromarray(out).save(OUT)
if len(sys.argv) > 1:
    pv = Image.new("RGBA", (128 * 2 + 8, 84), (70, 140, 200, 255))
    pv.alpha_composite(Image.fromarray(a).crop((0, 0, 128, 84)), (0, 0))
    pv.alpha_composite(Image.fromarray(out).crop((0, 0, 128, 84)), (136, 0))
    pv.resize((pv.width * 3, pv.height * 3), Image.NEAREST).save(sys.argv[1])
print("wrote", OUT)
