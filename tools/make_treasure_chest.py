"""Draw the treasure chest that lures sailors to Circe's islet: 2 frames of 24x20.

Frame 0: closed, gold glinting under the lid, a few coins spilled on the grass.
Frame 1: open, the lid thrown back, heaped with gold coins and a ruby.
Warm wood with gold bands and a lock plate, navy #3a3a50 outline like the village tiles.
The game bursts coins out of it, then turns it into Circe's statue (MapScene.awaken).

Output: public/assets/props/treasure_chest.png (+ cache/treasure_chest_preview.png)
Usage: python tools/make_treasure_chest.py
"""

import os
from PIL import Image, ImageDraw

W, H, FRAMES = 24, 20, 2


def rgb(h):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)


C = {
    k: rgb(v)
    for k, v in dict(
        outline="#3a3a50",
        wood="#b8693f",
        woodHi="#d8894f",
        woodLo="#7a3f28",
        inside="#4a2418",
        gold="#f0c040",
        goldHi="#fff2a0",
        goldLo="#c08a20",
        band="#e0a830",
        bandLo="#a87420",
        ruby="#e0304a",
        rubyHi="#ff9aa8",
    ).items()
}


def coin(px, x, y):
    px(x, y, C["gold"])
    px(x + 1, y, C["goldHi"])
    px(x, y + 1, C["goldLo"])
    px(x + 1, y + 1, C["gold"])


def draw(frame):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    px = lambda x, y, c: im.putpixel((x, y), c) if 0 <= x < W and 0 <= y < H else None
    # body
    d.rectangle([5, 10, 18, 17], fill=C["wood"])
    d.line([(5, 10), (18, 10)], fill=C["woodHi"])
    d.line([(5, 17), (18, 17)], fill=C["woodLo"])
    for x in (8, 15):  # gold bands
        d.line([(x, 10), (x, 17)], fill=C["band"])
        d.line([(x + 1, 10), (x + 1, 17)], fill=C["bandLo"])
    if frame == 0:
        # rounded lid, gold glinting in the gap
        d.rectangle([5, 6, 18, 9], fill=C["wood"])
        d.line([(6, 5), (17, 5)], fill=C["wood"])
        d.line([(6, 5), (17, 5)], fill=C["woodHi"])
        for x in (8, 15):
            d.line([(x, 5), (x, 9)], fill=C["band"])
            d.line([(x + 1, 5), (x + 1, 9)], fill=C["bandLo"])
        for x in range(6, 18, 2):
            px(x, 10, C["goldHi"])
        # lock plate
        d.rectangle([11, 9, 12, 12], fill=C["band"])
        px(11, 11, C["outline"])
    else:
        # lid thrown back (seen from inside) and a heap of gold
        d.rectangle([5, 1, 18, 5], fill=C["inside"])
        d.line([(5, 1), (18, 1)], fill=C["woodLo"])
        for x in (8, 15):
            d.line([(x, 1), (x, 5)], fill=C["bandLo"])
        for y in range(6, 11):
            for x in range(5, 19):
                bump = (x * 7 + y * 3) % 5
                if y == 6 and bump > 1:
                    continue
                px(
                    x,
                    y,
                    (
                        C["goldHi"]
                        if bump == 0
                        else C["gold"] if bump < 3 else C["goldLo"]
                    ),
                )
        px(11, 7, C["ruby"])
        px(12, 7, C["ruby"])
        px(11, 6, C["rubyHi"])
        d.rectangle([11, 11, 12, 13], fill=C["band"])
    # spilled coins on the grass
    for x, y in ((1, 17), (20, 16), (3, 15), (19, 18)):
        coin(px, x, y)
    # outline
    src = im.copy().load()
    out = im.load()
    for y in range(H):
        for x in range(W):
            if src[x, y][3]:
                continue
            if any(
                0 <= x + dx < W and 0 <= y + dy < H and src[x + dx, y + dy][3]
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                out[x, y] = C["outline"]
    return im


if __name__ == "__main__":
    os.makedirs("public/assets/props", exist_ok=True)
    sheet = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0))
    for f in range(FRAMES):
        sheet.paste(draw(f), (f * W, 0))
    sheet.save("public/assets/props/treasure_chest.png")
    os.makedirs("cache", exist_ok=True)
    bg = Image.new("RGBA", sheet.size, (110, 190, 90, 255))
    bg.alpha_composite(sheet)
    bg.resize((bg.width * 10, bg.height * 10), Image.NEAREST).save(
        "cache/treasure_chest_preview.png"
    )
    print("ok", sheet.size)
