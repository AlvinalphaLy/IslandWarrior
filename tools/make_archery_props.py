"""Draw the props of the Cyclops cave's archery puzzle as 16px-style pixel art, into public/assets/props/:

  arrow.png   10x5   an arrow pointing right (the game rotates it): fletched, gold-banded, bronze-headed
  bow.png     14x16  Odysseus' bow, lying on a stone (the pickup)
  target.png  2 frames of 14x22: a bronze disc on a wooden post, dull (0) and struck / glowing (1)
  axe.png     12x26  an axe standing on its haft, with the ring-hole at the top the arrow must pass through
  boulder.png 34x46  the great stone that seals Polyphemus' den
  bridge.png  16x16  plank bridge tile (boards run across, rails at the sides), tiled over a chasm
  sheep.png   2 frames of 18x15: a woolly sheep in profile facing right, legs apart / together

Each sprite is a list of rows with one character per pixel ('.' = transparent), mapped through a palette.
The ring of the axe is at axe-local y = RING_Y (the game reads it from the same constant in Archery.ts).
Run: python tools/make_archery_props.py [preview.png]
"""

import sys
import numpy as np
from PIL import Image

OUT = "public/assets/props"
O = (40, 26, 22)  # outline
PAL = {
    "O": O,
    "w": (110, 72, 40),
    "W": (150, 104, 60),
    "v": (186, 138, 84),  # wood dark / mid / light
    "b": (122, 82, 22),
    "B": (196, 146, 52),
    "Y": (246, 214, 110),
    "y": (255, 244, 190),  # bronze ramp
    "r": (176, 52, 44),
    "R": (226, 92, 70),  # red (fletching, target ring)
    "g": (86, 86, 98),
    "G": (124, 124, 134),
    "H": (164, 164, 170),
    "h": (198, 198, 202),  # stone ramp
    "s": (60, 60, 70),  # stone deep shadow
    "f": (226, 222, 210),
    "F": (248, 246, 238),
    "k": (184, 178, 166),  # wool shade / light / dark
    "n": (70, 56, 50),
    "N": (110, 92, 82),  # sheep face / legs
    "e": (20, 14, 14),
    "c": (240, 236, 220),  # bowstring
}


def sprite(rows):
    h, w = len(rows), max(len(r) for r in rows)
    a = np.zeros((h, w, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != ".":
                a[y, x] = (*PAL[ch], 255)
    return a


ARROW = [  # red-and-white fletching, a dark shaft with a gold band, a bronze broadhead
    "rr.....O..",
    "RFr...OBO.",
    "FRRwwYwBBO",
    "RFr...OBO.",
    "rr.....O..",
]

BOW = [
    "......OOO.....",
    ".....OWvWO....",
    "....OWOcOO....",
    "...OWO.c......",
    "...OWO.c......",
    "..OWO..c......",
    "..OBO..c......",
    "..OYO..c......",
    "..OBO..c......",
    "..OWO..c......",
    "...OWO.c......",
    "...OWO.c......",
    "..OOWOcOOOOO..",
    ".OGHHWvWHHHGO.",
    "OgGGGHHHHGGGgO",
    ".OOOOOOOOOOOO.",
]

TARGET_DULL = [
    "....OOOOOO....",
    "..OObbbbbbOO..",
    ".ObbBBBBBBbbO.",
    ".ObBBrrrrBBbO.",
    "ObBBrRRRRrBBbO",
    "ObBrRBYYBRrBbO",
    "ObBrRYYYYRrBbO",
    "ObBrRYYYYRrBbO",
    "ObBrRBYYBRrBbO",
    "ObBBrRRRRrBBbO",
    ".ObBBrrrrBBbO.",
    ".ObbBBBBBBbbO.",
    "..OObbbbbbOO..",
    "....OOWWOO....",
    ".....OWvO.....",
    ".....OWvO.....",
    ".....OWvO.....",
    ".....OWvO.....",
    ".....OWvO.....",
    "...OOOWvOOO...",
    "..OgGGHHGGgO..",
    "...OOOOOOOO...",
]
# struck: the disc glows, the bullseye goes white-hot
TARGET_LIT = [
    r.replace("b", "B").replace("Y", "y") for r in TARGET_DULL[:13]
] + TARGET_DULL[13:]
TARGET_LIT[3] = ".OBYYrrrrYYBO."
TARGET_LIT[10] = ".OBYYrrrrYYBO."

RING_Y = 3  # axe-local y of the ring-hole centre (keep in sync with Archery.ts)
AXE = [
    "....OOOO....",
    "...OBYYBO...",
    "...OY..YO...",
    "...OY..YO...",  # the ring-hole (rows 2-4): the arrow must pass here
    "...OY..YO...",
    "...OBYYBO...",
    "OOO.OBBO.OOO",
    "OYBO.OWO.OBYO",
    "OYBBOOWOOBBYO",
    "OYBBBOWOBBBYO",
    "OYBBOOWOOBBYO",
    "OYBO.OWO.OBYO",
    "OOO..OWO..OOO",
    ".....OWO.....",
    ".....OWO.....",
    ".....OWO.....",
    ".....OWO.....",
    ".....OWO.....",
    ".....OWO.....",
    ".....OWO.....",
    ".....OWO.....",
    ".....OWO.....",
    "....OOWOO....",
    "...OgGHGgO...",
    "...OOOOOOO...",
]
AXE = [r[:12] for r in AXE]

BOULDER = [
    "...........OOOOOOOOOOO............",
    "........OOOGGHHHHHHHGGOOO.........",
    "......OOGGHHHhhhhhHHHHGGGOO.......",
    ".....OGGHHHhhhhhhhhhHHHHGGGO......",
    "....OGGHHhhhhhhhhhhhhHHHHGGgO.....",
    "...OGGHHhhhhhhhhhhhhhHHHHGGggO....",
    "..OGGHHHhhhhhhhhhhhhHHHHHGGGggO...",
    "..OGHHHHhhhhhhhhhhhHHHHHHGGGggO...",
    ".OGGHHHHHhhhhhhhhhHHHHHHGGGGgggO..",
    ".OGHHHHHHHhhhhhhHHHHHHHHGGGGgggO..",
    ".OGHHHHHHHHHHHHHHHHHHHHGGGGGgggO..",
    "OGGHHHHHHHHHHHHHHHHHHHGGGGGggggsO.",
    "OGHHHHHHHHHHHHHHHHHHHGGGGGGggggsO.",
    "OGHHHHHHHHHHHHHHHHHHGGGGGGgggggsO.",
    "OGGHHHHHHHHHHHHHHHHGGGGGGggggggsO.",
    "OGGHHHHHHHHHHHHHHGGGGGGGgggggggsO.",
    "OGGGHHHHHHHHHHHGGGGGGGGggggggggsO.",
    "OGGGGHHHHHHHHGGGGGGGGGgggggggggsO.",
    "OgGGGGHHHHHGGGGGGGGGgggggggggsssO.",
    "OgGGGGGGGGGGGGGGGGGggggggggggsssO.",
    "OggGGGGGGGGGGGGGGgggggggggggssssO.",
    "OggGGGGGGGGGGGGGgggggggggggsssssO.",
    "OgggGGGGGGGGGGgggggggggggggssssssO",
    "OggggGGGGGGGgggggggggggggsssssssO.",
    "OgggggGGGGggggggggggggggssssssssO.",
    ".OgggggggggggggggggggggsssssssssO.",
    ".OggggggggggggggggggggssssssssssO.",
    ".Osggggggggggggggggggsssssssssss O".replace(" ", "s"),
    "..OsggggggggggggggggssssssssssssO.",
    "..OssgggggggggggggsssssssssssssO..",
    "...OsssggggggggssssssssssssssOO...",
    "....OOsssssssssssssssssssssOO.....",
    "......OOOOsssssssssssssOOOO.......",
    "..........OOOOOOOOOOOOO...........",
]
# rubble at the foot and a crack across the face, drawn on top
BOULDER = [r.ljust(34, ".")[:34] for r in BOULDER] + [
    "...OOO..................OOO.......",
    "..OGHGO.OO............OOGHGO......",
    ".OGgggGOGgO..........OGgggggO.....",
    "..OOOOOOOOO...........OOOOOOO.....",
]

BRIDGE = [
    "OwwwwwwwwwwwwwwO",
    "OvWWWWWWWWWWWWvO",
    "OWWWWWWWWWWWWWWO",
    "OwwwwwwwwwwwwwwO",
    "OOOOOOOOOOOOOOOO",
    "OwwwwwwwwwwwwwwO",
    "OvWWWWWWWWWWWWvO",
    "OWWWWWWWWWWWWWWO",
    "OwwwwwwwwwwwwwwO",
    "OOOOOOOOOOOOOOOO",
    "OwwwwwwwwwwwwwwO",
    "OvWWWWWWWWWWWWvO",
    "OWWWWWWWWWWWWWWO",
    "OwwwwwwwwwwwwwwO",
    "OOOOOOOOOOOOOOOO",
    "OwwwwwwwwwwwwwwO",
]

SHEEP_A = [
    "...OOOOOOO........",
    "..OfFFFFFFOOO.....",
    ".OfFFFFFFFFFFOOO..",
    "OfFFFFFFFFFFFFnnO.",
    "OfFFFFFFFFFFFOnenO",
    "OfFFFFFFFFFFFOnnnO",
    "OkfFFFFFFFFFfOnnO.",
    "OkfffFFFFFfffkOO..",
    ".OkkfffffffkkO....",
    "..OOOOOOOOOOO.....",
    "...ONO.....ONO....",
    "..ONO.......ONO...",
    "..ONO.......ONO...",
    "..OOO.......OOO...",
    "..................",
]
SHEEP_B = SHEEP_A[:10] + [
    "....ONO...ONO.....",
    "....ONO...ONO.....",
    "....ONO...ONO.....",
    "....OOO...OOO.....",
    "..................",
]


def save(name, frames):
    im = (
        np.concatenate([sprite(f) for f in frames], axis=1)
        if len(frames) > 1
        else sprite(frames[0])
    )
    Image.fromarray(im).save(f"{OUT}/{name}.png")
    return im


if __name__ == "__main__":
    out = {
        "arrow": save("arrow", [ARROW]),
        "bow": save("bow", [BOW]),
        "target": save("target", [TARGET_DULL, TARGET_LIT]),
        "axe": save("axe", [AXE]),
        "boulder": save("boulder", [BOULDER]),
        "bridge": save("bridge", [BRIDGE]),
        "sheep": save("sheep", [SHEEP_A, SHEEP_B]),
    }
    for k, v in out.items():
        print(f"{k}: {v.shape[1]}x{v.shape[0]}")
    if len(sys.argv) > 1:
        w = sum(v.shape[1] + 4 for v in out.values())
        h = max(v.shape[0] for v in out.values())
        pv = Image.new("RGBA", (w, h), (58, 52, 64, 255))
        x = 0
        for v in out.values():
            pv.alpha_composite(Image.fromarray(v), (x, h - v.shape[0]))
            x += v.shape[1] + 4
        pv.resize((w * 6, h * 6), Image.NEAREST).save(sys.argv[1])
