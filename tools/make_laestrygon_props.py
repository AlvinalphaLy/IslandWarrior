"""Draw the Laestrygonian props as 16px-style pixel art, into public/assets/props/:

  homer.png       2 frames of 20x40: a marble statue of Homer, the blind poet, in a draped himation with his lyre, on a
                  plinth on the narrow islet: still stone (0) / the lyre turned to gold as he sings (1)
  giant.png       2 frames of 26x28: a Laestrygonian giant on the harbour cliffs, a rock held over his head (0) /
                  arms flung out, just thrown (1). The game draws it at 2x: they are giants.
  rock.png        12x10: a thrown boulder (also drawn at 2x in flight)

Each sprite is a list of rows, one character per pixel ('.' = transparent), mapped through PAL.
Run: python tools/make_laestrygon_props.py [preview.png]
"""

import sys
import numpy as np
from PIL import Image

OUT = "public/assets/props"
PAL = {
    "O": (38, 30, 28),
    # granite of the king's statue
    "S": (164, 148, 126),
    "s": (120, 106, 90),
    "T": (198, 184, 160),
    "c": (40, 32, 28),
    "b": (96, 82, 68),
    "d": (128, 112, 94),
    # Homer's marble, and the gold his lyre turns when he sings
    "W": (238, 234, 224),
    "w": (206, 200, 188),
    "v": (164, 158, 148),
    "V": (124, 118, 112),
    "x": (88, 84, 84),
    "Y": (246, 210, 96),
    "y": (190, 140, 40),
    # boulder (cooler grey)
    "G": (104, 106, 114),
    "g": (72, 74, 84),
    "H": (140, 142, 150),
    "h": (176, 178, 184),
    # giant: sunburnt skin, beard, leather
    "K": (196, 122, 84),
    "k": (150, 86, 58),
    "e": (240, 230, 200),
    "n": (128, 70, 48),
    "B": (74, 46, 30),
    "L": (110, 74, 40),
    "l": (80, 52, 28),
    # moss on the rubble
    "m": (96, 128, 66),
}


def sprite(rows, w=None):
    w = w or max(len(r) for r in rows)
    a = np.zeros((len(rows), w, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r.ljust(w, ".")[:w]):
            if ch != ".":
                a[y, x] = (*PAL[ch], 255)
    return a


HOMER = [  # 'L' = the lyre: marble in frame 0, gold in frame 1
    ".......OOOO.........",
    "......OvvvvO........",
    ".....OvWWWWvO.......",
    "....OvWWWWWWvO......",
    "....OvWxWWxWvO......",
    "....OvWWWvWWvO......",
    "....OVvWWWWvVO......",
    "....OVvvVvVvvVO.....",
    ".....OVvVvVvVO......",
    "......OVvVvVO.......",
    ".....OOOVvVOOO......",
    "...OOWWWWWWWWWOO....",
    "..OWWWWWvWWWWWWOL.LO",
    "..OWWWWvWWWWWWWOL.LO",
    ".OWWWWvWWWWWWWWOLLLO",
    ".OWWWvWWWWWWWWWOLWLO",
    ".OWWvWWWWWWWWWWOLWLO",
    ".OWvWWWWWWWWWWOLLLLO",
    "OWWvWWWWWWWWWWWOLLO.",
    "OWvWWWWWWWWWWWWWOO..",
    "OvWWWWWWWWWWWWWWvO..",
    "OWWOWWWWvWWWWWWWvO..",
    ".OO.OWWWvWWWWWWWvO..",
    "....OWWvWWWWWWWWvO..",
    "....OWWvWWWWWWWWvO..",
    "....OWvWWWWWWWWvO...",
    "....OWvWWWWWWWWvO...",
    "....OvWWWWWWWWWvO...",
    "....OWWWWvWWWWWvO...",
    "....OWWWvWWWWWWvO...",
    "....OWWvWWWWWWWvO...",
    "....OWvWWWWWWWWvO...",
    "....OvWWWWWWWWvvO...",
    "...OWWWWWWWWWWWWvO..",
    "...OOWWOOOOOWWOOOO..",
    ".OOOOOOOOOOOOOOOOOO.",
    ".OWWWWWWWWWWWWWWWwO.",
    ".OwwwwwwwwwwwwwwwvO.",
    ".OvvvvvvvvvvvvvvvVO.",
    ".OOOOOOOOOOOOOOOOOO.",
]
HOMER_MARBLE = [r.replace("L", "v") for r in HOMER]  # 0: all stone
HOMER_GOLD = [
    r.replace("L", "Y") for r in HOMER
]  # 1: the lyre turned to gold as he sings

GIANT_HOLD = [
    ".........OOOOOOO..........",
    ".......OOGGHHHHGOO........",
    "......OGGHHhhHHHGGO.......",
    "......OGHHHhhHHHGGO.......",
    "......OGGHHHHHHGGgO.......",
    "...OO.OOGGGGGGgggOO.OO....",
    "..OKKO.OOOOOOOOOOO.OKKO...",
    "..OKKO.............OKKO...",
    "..OKkO....OOOOO....OkKO...",
    "..OKkO...OkKKKkO...OkKO...",
    "...OKO..OkKKKKKkO..OKO....",
    "...OKO..OKeOKOeKO..OKO....",
    "...OKKOOOKKKnKKKOOOKKO....",
    "....OKKKOKBBBBBKOKKKO.....",
    "....OKKKKOBBBBBOKKKKO.....",
    ".....OKKKKOBBBOKKKKO......",
    ".....OKKKKKKKKKKKKKO......",
    ".....OKKKkKKKKKkKKKO......",
    ".....OkKKKKKKKKKKKkO......",
    "......OkKKKKKKKKKkO.......",
    "......OLLLLLLLLLLLO.......",
    "......OLlLLlLLlLLlO.......",
    "......OKKOLLLLLOKKO.......",
    "......OKKO.OOO.OKKO.......",
    "......OKKO.....OKKO.......",
    "......OKkO.....OkKO.......",
    ".....OKKKO.....OKKKO......",
    ".....OOOOO.....OOOOO......",
]
GIANT_THROW = (
    [".........................."] * 8
    + [
        "..........OOOOO...........",
        ".........OkKKKkO..........",
        "........OkKKKKKkO.........",
        "........OKeOKOeKO.........",
        "..OOOOOOOKKKnKKKOOOOOOO...",
        ".OKKKKKKOKBBBBBKOKKKKKKO..",
        ".OkKKKKKKOBBBBBOKKKKKKkO..",
        "..OOOOKKKKOBBBOKKKKOOOO...",
    ]
    + GIANT_HOLD[16:]
)

ROCK = [
    "...OOOOOO...",
    "..OGHHHHGO..",
    ".OGHHhhHHGO.",
    "OGHHhhhHHGgO",
    "OGHHHhHHHGgO",
    "OGGHHHHHGGgO",
    "OgGGGGGGGggO",
    ".OgGGGGGggO.",
    "..OggggggO..",
    "...OOOOOO...",
]


def save(name, frames):
    w = max(max(len(r) for r in f) for f in frames)
    h = max(len(f) for f in frames)
    ims = [sprite([""] * (h - len(f)) + f, w) for f in frames]  # bottom-align frames
    im = np.concatenate(ims, axis=1)
    Image.fromarray(im).save(f"{OUT}/{name}.png")
    return im, w, h


if __name__ == "__main__":
    out = {
        "homer": save("homer", [HOMER_MARBLE, HOMER_GOLD]),
        "giant": save("giant", [GIANT_HOLD, GIANT_THROW]),
        "rock": save("rock", [ROCK]),
    }
    for k, (_, w, h) in out.items():
        print(f"{k}: frames of {w}x{h}")
    if len(sys.argv) > 1:
        ims = [v[0] for v in out.values()]
        W = sum(i.shape[1] + 4 for i in ims)
        H = max(i.shape[0] for i in ims)
        pv = Image.new("RGBA", (W, H), (70, 140, 200, 255))
        x = 0
        for i in ims:
            pv.alpha_composite(Image.fromarray(i), (x, H - i.shape[0]))
            x += i.shape[1] + 4
        pv.resize((W * 6, H * 6), Image.NEAREST).save(sys.argv[1])
