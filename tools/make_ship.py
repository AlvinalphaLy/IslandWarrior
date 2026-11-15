"""Draw the ship of Odysseus: an original pixel-art Greek galley, every pixel placed by this script.

Homeric "black ship" (pitch-sealed hull) seen side-on in the village's 3/4 view, in the Serene Village palette
(navy #3a3a50 outlines, warm woods, roof reds):
  - black hull with a red wale stripe and the painted eye (oculus) on the bow
  - bronze ram at the waterline, curled stern post (aphlaston), small prow post
  - one mast with a yard and a square linen sail with vertical brail lines, pennant at the masthead
  - forestay / backstay rigging, a bank of oars, the big steering oar at the stern
  - waterline foam and a dark reflection

Output: public/assets/props/ship.png - 4 frames of 128x84, side by side (sail billow, pennant, foam).
The waterline is at y = WL in every frame; the game anchors the sprite there.
Usage: python tools/make_ship.py   (also writes cache/ship_preview.png)
"""
import math, os
from PIL import Image, ImageDraw

W, H, FRAMES = 128, 84, 4
WL = 66  # waterline row

C = dict(
    outline='#3a3a50',
    hull='#46465e', hullHi='#565972', hullLo='#3a3a50',
    stripe='#d93232', stripeHi='#fc5c46',
    deck='#e0b870', deckSeam='#c78c59',
    wood='#c78c59', woodHi='#e0b870', woodLo='#a85f46',
    bronze='#c8913a', bronzeHi='#f0c46a', bronzeLo='#8a5a2a',
    sail='#f4ead2', sailShade='#ddcfae', brail='#c9b48e', sailBand='#d93232',
    eye='#ffffff', pupil='#3a3a50', eyeRing='#ba2d2f',
    pennant='#e63f38', pennantLo='#ba2d2f',
    foam='#ffffff', foamLo='#bfe3f7', shadow=(30, 40, 90, 95), splash='#dff3ff',
)


def hexrgba(h, a=255):
    if isinstance(h, tuple):
        return h
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)


class Layer:
    def __init__(self):
        self.im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def px(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.im.putpixel((int(x), int(y)), hexrgba(c))

    def rect(self, x0, y0, x1, y1, c):  # inclusive
        self.d.rectangle([x0, y0, x1, y1], fill=hexrgba(c))

    def line(self, pts, c, w=1):
        self.d.line(pts, fill=hexrgba(c), width=w)

    def poly(self, pts, c):
        self.d.polygon(pts, fill=hexrgba(c))

    def get(self, x, y):
        return self.im.getpixel((x, y))


# ------------------------------------------------------------------ hull geometry
def gunwale(x):
    """y of the top edge of the hull side at column x (rises toward stern and bow)."""
    if x < 30:
        return round(54 - (30 - x) * 0.45)
    if x > 98:
        return round(54 - (x - 98) * 0.35)
    return 54


HULL = [(13, 47), (15, 54), (19, 60), (25, 64), (30, WL), (104, WL), (109, 62), (112, 56), (112, 51),
        (104, 52), (98, 54), (30, 54), (20, 50)]


def draw_frame(f):
    solid = Layer()     # everything that gets the navy outline
    over = Layer()      # thin details drawn after outlining (rigging, oars, water)

    bulge = [0, 1, 2, 1][f]

    # ---- mast + yard + sail (behind the hull)
    mx = 62
    solid.rect(mx, 7, mx + 1, 54, C['wood'])
    solid.line([(mx, 7), (mx, 54)], C['woodHi'])
    yard_y = 11
    for x in range(36, 91):
        droop = 1 if abs(x - 63) > 22 else 0
        solid.px(x, yard_y + droop, C['wood'])
        solid.px(x, yard_y + 1 + droop, C['woodLo'])
    # sail: hangs from the yard, belly pushed right by the wind (bulge), bottom edge sags
    for y in range(13, 42):
        t = (y - 13) / 28
        left = 39 + round(2 * math.sin(t * math.pi))
        right = 86 + round(bulge * math.sin(t * math.pi))
        for x in range(left, right + 1):
            sag = 39 + round(3 * (1 - ((x - 63) / 24) ** 2))
            if y > sag:
                continue
            c = C['sail']
            if x < left + 3 or y > sag - 1:
                c = C['sailShade']
            if (x - 41) % 6 == 0:            # brail lines (the vertical ropes of a Greek sail)
                c = C['brail']
            if 31 <= y <= 33:                 # red band
                c = C['sailBand']
            solid.px(x, y, c)
    solid.rect(mx, 7, mx + 1, 43, C['wood'])  # mast in front of the sail
    solid.line([(mx, 7), (mx, 43)], C['woodHi'])

    # ---- pennant at the masthead, fluttering
    wave = [0, 1, 0, -1][f]
    for i in range(7):
        h = 3 - i // 3
        yy = 4 + (wave if i > 3 else 0) + (i % 2 if f % 2 else 0) * 0
        for j in range(h):
            solid.px(mx + 2 + i, yy + j, C['pennant'] if j < h - 1 else C['pennantLo'])

    # ---- stern post curl (aphlaston) and prow post
    curl = [(14, 48), (11, 43), (9, 38), (9, 33), (10, 29), (13, 26), (17, 26), (19, 29), (18, 32), (15, 32)]
    solid.line(curl, C['hull'], w=3)
    solid.line(curl[:7], C['hullHi'], w=1)
    solid.line([(111, 52), (113, 48), (114, 44), (113, 42)], C['hull'], w=2)

    # ---- hull
    solid.poly(HULL, C['hull'])
    for x in range(13, 113):
        top = gunwale(x)
        for y in range(top, WL + 1):
            p = solid.get(x, y)
            if p[3] == 0:
                continue
            c = C['hull']
            if y <= top + 1:
                c = C['hullHi']                  # wale
            elif 57 <= y <= 58 and 18 < x < 108:
                c = C['stripe'] if y == 58 else C['stripeHi']
            elif y >= WL - 1:
                c = C['hullLo']
            solid.px(x, y, c)
    # deck seen from above (3/4 view): a strip of planks above the gunwale
    for x in range(26, 101):
        for y in range(51, 54):
            c = C['deck'] if (x % 7) else C['deckSeam']
            if y == 51:
                c = C['deckSeam']
            solid.px(x, y, c)
    # painted eye on the bow
    ex, ey = 100, 56
    for dx, dy in [(-2, 0), (-1, -1), (0, -1), (1, -1), (2, 0), (-1, 1), (0, 1), (1, 1), (-1, 0), (1, 0), (0, 0)]:
        solid.px(ex + dx, ey + dy, C['eye'])
    solid.px(ex, ey, C['pupil']); solid.px(ex + 1, ey, C['pupil'])
    for dx in (-3, 3):
        solid.px(ex + dx, ey, C['eyeRing'])
    # bronze ram at the waterline, pointing forward
    solid.poly([(106, 61), (123, 64), (106, WL)], C['bronze'])
    solid.line([(107, 62), (121, 64)], C['bronzeHi'])
    solid.line([(107, WL - 1), (121, 65)], C['bronzeLo'])

    # ---- outline everything solid (4-neighbour), like the tileset's sprites
    out = Layer()
    src = solid.im.load()
    for y in range(H):
        for x in range(W):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and src[nx, ny][3]:
                    out.px(x, y, C['outline'])
                    break
    img = out.im.copy()
    img.alpha_composite(solid.im)

    # ---- below the waterline: cut the hull, add reflection
    for y in range(WL + 1, H):
        for x in range(W):
            img.putpixel((x, y), (0, 0, 0, 0))
    for y in range(WL + 1, WL + 7):
        fade = 1 - (y - WL - 1) / 6
        for x in range(30 - (y - WL), 106 - (y - WL) * 2):
            if (x + y) % 2 == 0 or y < WL + 3:
                r, g, b, a = C['shadow']
                img.putpixel((x, y), (r, g, b, int(a * fade)))

    # ---- rigging (thin lines, no outline)
    over.line([(mx + 1, 8), (112, 50)], C['hullHi'])       # forestay to the prow
    over.line([(mx, 8), (17, 30)], C['hullHi'])           # backstay to the stern post
    # ---- oars: ports on the stripe, shafts angled back into the water
    for i, x in enumerate(range(36, 96, 8)):
        sweep = (f + i) % 2  # alternate oars shift a pixel so the row shimmers
        x1, y1 = x - 8 - sweep, WL + 6
        over.line([(x, 59), (x1, y1)], C['woodLo'])
        over.line([(x, 58), (x1, y1 - 1)], C['woodHi'])
        over.rect(x1 - 1, y1 - 1, x1 + 1, y1 + 1, C['wood'])
        over.px(x, 58, C['outline'])                        # oar port
        over.px(x1 - 2, WL + 1, C['splash']); over.px(x1 + 2 - sweep, WL + 2, C['foam'])
    # steering oar at the stern
    over.line([(24, 55), (17, WL + 8)], C['woodLo'], w=2)
    over.line([(25, 55), (18, WL + 7)], C['woodHi'])
    over.rect(15, WL + 3, 19, WL + 9, C['wood'])
    over.line([(15, WL + 3), (15, WL + 9)], C['woodLo'])
    # foam along the waterline
    for x in range(26, 124):
        if (x + f * 3) % 7 in (0, 1, 2):
            over.px(x, WL + 1, C['foam'] if (x + f) % 3 else C['foamLo'])
        if (x + f * 2) % 11 == 0:
            over.px(x + 1, WL + 2, C['foamLo'])
    img.alpha_composite(over.im)
    return img


if __name__ == '__main__':
    os.makedirs('public/assets/props', exist_ok=True)
    sheet = Image.new('RGBA', (W * FRAMES, H), (0, 0, 0, 0))
    for f in range(FRAMES):
        sheet.paste(draw_frame(f), (f * W, 0))
    sheet.save('public/assets/props/ship.png')
    # preview on water, 4x
    os.makedirs('cache', exist_ok=True)
    bg = Image.new('RGBA', sheet.size, (80, 167, 232, 255))
    bg.paste(Image.new('RGBA', (sheet.width, WL + 1), (240, 220, 160, 255)), (0, 0))
    bg.alpha_composite(sheet)
    bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save('cache/ship_preview.png')
    print('ok', sheet.size)
