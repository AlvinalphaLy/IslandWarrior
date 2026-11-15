"""Greek god skins (Zeus, Hermes, Hades, Heracles, Aphrodite) built from the LimeZu base sheets.

Input : public/assets/sprites/<base>.png made by tools/import_characters.py
        (16x32 frames; row 0 = run, row 1 = idle; 6 frames per direction, order right, up, left, down)
Output: public/assets/sprites/<god>.png in the same layout, plus cache/greek_preview.png

Each frame is repainted region by region, measured from the feet up so the bounce in run frames is followed:
  head  = rows .. b-9   (hair, face)
  torso = rows b-8 .. b-4
  legs  = rows b-3 .. b  (b = lowest opaque row)
Silhouette edge pixels keep their outline colour. Interior colours are mapped onto the god's colour ramp by
brightness rank, so the base sprite's shading survives. Accessories (wreath, beard, winged helmet, crown,
lion ears, rose) are then drawn on each frame relative to the measured head and body.
"""

import os
import numpy as np
from PIL import Image

SPR = "public/assets/sprites"
FW, FH = 16, 32
ORDER = ["right", "up", "left", "down"]
OUTLINE = {(0x3A, 0x3A, 0x50), (0x46, 0x46, 0x5E), (0x56, 0x59, 0x72)}
DARK_OUTLINE = (0x3A, 0x3A, 0x50)

SKIN = {
    "adam": ["ffcbb0", "f6ae9f", "f69784", "ffb893", "e19b9b", "bba386", "d3a38d"],
    "alex": ["ffcbb0", "f6ae9f", "f69784", "ffb893", "e19b9b"],
    "bob": ["ffcbb0", "f6ae9f", "e19b9b", "c9a495", "b59e95"],
    "amelia": ["bf8b78", "b57972", "a77a67", "aa5e56"],
}
LONG_HAIR = {"amelia": ["ba8d5e", "957350", "8d7051", "8a6552", "674d49"]}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def ramp(*hexes):  # dark -> light
    return [rgb(h) for h in hexes]


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


GODS = {
    "zeus": dict(
        base="bob",
        legs="skirt",
        hair=ramp("8f93a8", "b9bccb", "dcdee8", "f6f6fa"),
        top=ramp("7d7460", "b8ab88", "dcd0ae", "efe6cb"),
        sandal=rgb("8a5a2b"),
    ),
    "hermes": dict(
        base="alex",
        legs="skirt",
        top=ramp("2f4f7d", "4c7fb8", "78aee3", "b5dafa"),
        belt=ramp("9b7a2c", "e0c060"),
        sandal=rgb("c9a440"),
    ),
    "hades": dict(
        base="alex",
        legs="robe",
        hair=ramp("16131f", "221c30", "30273f", "41355a"),
        skin=ramp("8d93ad", "b3b8cc", "d2d5e2", "e9ebf2"),
        top=ramp("140f1e", "2a1c3f", "43295f", "603a82"),
    ),
    "heracles": dict(
        base="adam",
        legs="skirt",
        hair=ramp("6b4314", "9c6a22", "c99636", "e9c062"),
        skin=ramp("9a6440", "bf8258", "d9a074", "efbd92"),
        top=ramp("4f2e17", "74451f", "9a6230", "bd8344"),
        sandal=rgb("5e3a1c"),
    ),
    "aphrodite": dict(
        base="amelia",
        legs="robe",
        hair=ramp("9a6a26", "c9933a", "e8bf5a", "f8e08e"),
        skin=ramp("d98f86", "eeb09c", "f8c9b4", "ffe0cc"),
        top=ramp("9e3f6b", "d06a97", "ee9bbd", "fcd0e2"),
        belt=ramp("b8860b", "f2cc55"),
    ),
}


class Frame:
    def __init__(self, a, d):
        self.a = a  # (32, 16, 4) uint8, edited in place
        self.d = d
        op = a[:, :, 3] > 0
        rows = np.where(op.any(1))[0]
        self.t, self.b = int(rows[0]), int(rows[-1])
        self.hb = self.b - 9  # last head row
        self.ts, self.te = self.b - 8, self.b - 4  # torso rows
        pad = np.pad(op, 1)
        nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        self.edge = op & ~nb
        self.op0 = op.copy()

    def px(self, x, y):
        return tuple(int(v) for v in self.a[y, x, :3])

    def opaque(self, x, y):
        return 0 <= x < FW and 0 <= y < FH and self.a[y, x, 3] > 0

    def put(self, x, y, c):
        if 0 <= x < FW and 0 <= y < FH:
            self.a[y, x, :3] = c
            self.a[y, x, 3] = 255

    def span(self, y):
        xs = np.where(self.a[y, :, 3] > 0)[0]
        return (int(xs[0]), int(xs[-1])) if len(xs) else (None, None)

    def region(self, y):
        return "head" if y <= self.hb else "torso" if y <= self.te else "legs"


def rank_map(colors, target):
    """Map each source colour to the target ramp by brightness rank."""
    cs = sorted(set(colors), key=lum)
    if not cs:
        return {}
    n, m = len(cs), len(target)
    return {c: target[round(i / max(n - 1, 1) * (m - 1))] for i, c in enumerate(cs)}


def frames_of(sheet):
    for r in range(2):
        for f in range(24):
            yield r, f, sheet[r * FH : (r + 1) * FH, f * FW : (f + 1) * FW]


def collect(sheet, base):
    """Colours present per (role) across the base sheet, used to build the rank maps."""
    skin = {rgb(h) for h in SKIN[base]}
    hair_set = {rgb(h) for h in LONG_HAIR.get(base, [])}
    roles = {"hair": [], "top": [], "skin": list(skin)}
    for _, _, fa in frames_of(sheet):
        fr = Frame(fa.copy(), None)
        for y in range(FH):
            for x in range(FW):
                if not fr.op0[y, x] or fr.edge[y, x]:
                    continue
                c = fr.px(x, y)
                reg = fr.region(y)
                if c in skin:
                    continue
                if reg == "head" or c in hair_set:
                    if c not in OUTLINE:
                        roles["hair"].append(c)
                elif reg == "torso":
                    roles["top"].append(c)
    return skin, hair_set, roles


def recolor(fr, spec, skin, hair_set, maps):
    legs = spec["legs"]
    top = spec["top"]
    for y in range(FH):
        reg = fr.region(y)
        for x in range(FW):
            if not fr.op0[y, x] or fr.edge[y, x]:
                continue
            c = fr.px(x, y)
            if c in skin:
                if "skin" in maps:
                    fr.put(x, y, maps["skin"][c])
                continue
            if (reg == "head" or c in hair_set) and c not in OUTLINE:
                if "hair" in maps:
                    fr.put(x, y, maps["hair"][c])
                continue
            if reg == "head":
                continue  # eyes and face lines
            if reg == "torso":
                if y == fr.ts and c in OUTLINE:
                    continue  # collar line under the chin
                fr.put(x, y, maps["top"].get(c, top[0]))
                continue
            # legs
            row = y - (fr.b - 3)
            if legs == "robe":
                if row <= 2:
                    fr.put(x, y, top[1] if row == 2 else maps["top"].get(c, top[1]))
            else:  # skirt: hem, bare thighs, sandals
                if row == 0:
                    fr.put(x, y, top[2])
                elif c in OUTLINE:
                    continue
                elif row == 1:
                    bare = rgb(SKIN[spec["base"]][0])
                    fr.put(x, y, maps["skin"][bare] if "skin" in maps else bare)
                elif row == 2:
                    fr.put(x, y, spec["sandal"])
    if legs == "robe":  # close the gap between the feet into a hem
        for y, col in ((fr.b - 1, top[0]), (fr.b, DARK_OUTLINE)):
            lx, rx = fr.span(y)
            if lx is None:
                continue
            for x in range(lx + 1, rx):
                fr.put(x, y, col)
        y = fr.b - 2
        for x in range(1, FW - 1):
            if (
                fr.opaque(x, y)
                and fr.opaque(x - 1, y)
                and fr.opaque(x + 1, y)
                and fr.px(x, y) in OUTLINE
            ):
                fr.put(x, y, top[1])


# ---------------------------------------------------------------- accessories
GOLD = ramp("9b6b12", "c9962f", "f5d76e", "fff1b0")
WHITE = ramp("9ea3b5", "c9ccd8", "eceef4", "ffffff")


def wreath(fr, light=GOLD[2], dark=GOLD[1], leaf_out=GOLD[1]):
    y = fr.t + 5
    lx, rx = fr.span(y)
    for x in range(lx, rx + 1):
        if fr.opaque(x, y) and not fr.edge[y, x] and fr.px(x, y) not in OUTLINE:
            fr.put(x, y, light if x % 2 == 0 else dark)
            if x % 3 == 0 and fr.opaque(x, y - 1) and not fr.edge[y - 1, x]:
                fr.put(x, y - 1, leaf_out)


def beard(fr):
    face = (
        lambda x, y: fr.opaque(x, y)
        and not fr.edge[y, x]
        and fr.px(x, y) not in OUTLINE
    )
    xs = [x for x in range(FW) if face(x, fr.hb)]
    if not xs or fr.d == "up":
        return
    lx, rx = min(xs), max(xs)
    cx = (lx + rx) / 2
    for x in xs:
        fr.put(x, fr.hb, WHITE[3])
    for x in range(FW):  # cheeks and moustache on the mouth row
        if face(x, fr.hb - 1) and (
            x <= lx + 1 or x >= rx - 1 or abs(x + 0.5 - cx - 0.5) <= 1
        ):
            fr.put(x, fr.hb - 1, WHITE[3] if abs(x + 0.5 - cx - 0.5) > 1 else WHITE[2])
    half = 2.5 if fr.d == "down" else 1.5
    for i, y in enumerate((fr.hb + 1, fr.hb + 2, fr.hb + 3)):
        h = half - i
        if h <= 0:
            break
        x0, x1 = int(round(cx - h + 0.5)), int(round(cx + h - 0.5))
        for x in range(x0, x1 + 1):
            fr.put(x, y, WHITE[3] if x not in (x0, x1) else WHITE[1])
        fr.put(x0 - 1, y, WHITE[0])
        fr.put(x1 + 1, y, WHITE[0])


def sash(fr, c1=GOLD[2], c2=GOLD[1]):
    lx, rx = fr.span(fr.ts + 1)
    n = fr.te - fr.ts
    for i, y in enumerate(range(fr.ts + 1, fr.te + 1)):
        if fr.d in ("down", "up"):
            x = int(round(lx + 3 + i * (rx - lx - 6) / max(n - 1, 1)))
            if fr.d == "up":
                x = lx + rx - x
        else:
            x = (lx + rx) // 2
        for xx, c in ((x, c1), (x + 1, c2)):
            if fr.opaque(xx, y) and not fr.edge[y, xx]:
                fr.put(xx, y, c)


def belt(fr, cols):
    y = fr.te
    for x in range(FW):
        if fr.opaque(x, y) and not fr.edge[y, x]:
            fr.put(x, y, cols[1] if x % 3 else cols[0])


def winged_helmet(fr):
    for y in range(fr.t + 1, fr.t + 4):
        for x in range(FW):
            if fr.opaque(x, y) and not fr.edge[y, x]:
                fr.put(
                    x,
                    y,
                    GOLD[3] if y == fr.t + 1 else GOLD[2] if y == fr.t + 2 else GOLD[1],
                )
    lx, rx = fr.span(fr.t + 4)
    for s, x0 in ((-1, lx), (1, rx)):
        if fr.d == "left" and s < 0 or fr.d == "right" and s > 0:
            x0 -= s  # face side: tuck the wing in so it doesn't cover the face
        for dx, dy, c in (
            (1, 0, WHITE[3]),
            (2, 0, WHITE[3]),
            (1, 1, WHITE[2]),
            (2, -1, WHITE[3]),
            (3, -1, WHITE[2]),
            (2, 1, WHITE[1]),
            (3, -2, WHITE[3]),
        ):
            fr.put(x0 + s * dx, fr.t + 3 + dy, c)


def winged_sandals(fr):
    y = fr.b - 1
    lx, rx = fr.span(y)
    if lx is None:
        return
    fr.put(lx - 1, y, WHITE[3])
    fr.put(lx - 1, y - 1, WHITE[2])
    fr.put(rx + 1, y, WHITE[3])
    fr.put(rx + 1, y - 1, WHITE[2])


def crown(fr):
    band, band_hi, flame, flame_hi = (
        rgb("6e6c86"),
        rgb("a9a7c4"),
        rgb("2f8fd8"),
        rgb("8fefff"),
    )
    for y in (fr.t + 1, fr.t + 2):
        for x in range(FW):
            if fr.opaque(x, y) and not fr.edge[y, x]:
                fr.put(x, y, band_hi if y == fr.t + 1 else band)
    lx, rx = fr.span(fr.t + 1)
    cx = (lx + rx) // 2
    for x, tall in ((lx + 2, 1), (cx, 2), (rx - 2, 1)):
        fr.put(x, fr.t, band_hi)
        for k in range(1, tall + 1):
            fr.put(x, fr.t - k, band)
        fr.put(x, fr.t - tall - 1, flame)
        fr.put(x, fr.t - tall - 2, flame_hi)
    if fr.d != "up":
        fr.put(cx, fr.t + 2, flame_hi)


def glowing_eyes(fr, skin_cols):
    for y in range(fr.hb - 4, fr.hb):
        for x in range(1, FW - 1):
            if (
                fr.px(x, y) in OUTLINE
                and not fr.edge[y, x]
                and fr.px(x - 1, y) in skin_cols
                and fr.px(x + 1, y) in skin_cols
            ):
                fr.put(x, y, rgb("6fe3ff"))


def lion_ears(fr):
    dark, mid = rgb("4a2c0c"), rgb("c99636")
    lx, rx = fr.span(fr.t + 1)
    for x0 in (lx + 2, rx - 3):
        fr.put(x0, fr.t - 1, dark)
        fr.put(x0 + 1, fr.t - 1, dark)
        fr.put(x0, fr.t, mid)
        fr.put(x0 + 1, fr.t, dark)
    # pelt fringe over the brow
    y = fr.hb - 6
    if fr.d != "up":
        for x in range(FW):
            if (
                fr.opaque(x, y)
                and not fr.edge[y, x]
                and fr.px(x, y) in set(map(tuple, GODS["heracles"]["hair"]))
            ):
                fr.put(x, y, rgb("6b4314"))


def lion_cape(fr):
    y = fr.ts + 1
    pelt = GODS["heracles"]["hair"]
    for x in range(FW):
        if fr.opaque(x, y) and not fr.edge[y, x]:
            fr.put(x, y, pelt[3] if x % 2 else pelt[2])
    skin = set(map(tuple, GODS["heracles"]["skin"]))
    for x in range(FW):  # bronze arm bands on the upper arms
        if fr.opaque(x, fr.ts + 2) and fr.px(x, fr.ts + 2) in skin:
            fr.put(x, fr.ts + 2, rgb("cd8a32"))


def rose(fr):
    y = fr.t + 4
    lx, rx = fr.span(y)
    x = lx + 1 if fr.d == "right" else rx - 2
    fr.put(x, y, rgb("ff6f91"))
    fr.put(x + 1, y, rgb("d8325a"))
    fr.put(x, y + 1, rgb("d8325a"))
    fr.put(x + 1, y + 1, rgb("4f9a46"))


def pearls(fr):
    y = fr.ts
    lx, rx = fr.span(y)
    for x in range(lx + 4, rx - 3, 2):
        if fr.opaque(x, y) and not fr.edge[y, x]:
            fr.put(x, y, rgb("fff8f0"))


def decorate(god, fr):
    spec = GODS[god]
    if god == "zeus":
        wreath(fr)
        beard(fr)
        sash(fr)
    elif god == "hermes":
        winged_helmet(fr)
        belt(fr, spec["belt"])
        winged_sandals(fr)
    elif god == "hades":
        crown(fr)
        glowing_eyes(fr, set(map(tuple, spec["skin"])))
    elif god == "heracles":
        lion_ears(fr)
        lion_cape(fr)
    elif god == "aphrodite":
        rose(fr)
        belt(fr, spec["belt"])
        pearls(fr)


def build(god):
    spec = GODS[god]
    base = spec["base"]
    sheet = np.asarray(Image.open(f"{SPR}/{base}.png").convert("RGBA")).copy()
    skin, hair_set, roles = collect(sheet, base)
    maps = {"top": rank_map(roles["top"], spec["top"])}
    if "hair" in spec:
        maps["hair"] = rank_map(roles["hair"], spec["hair"])
    if "skin" in spec:
        maps["skin"] = rank_map(roles["skin"], spec["skin"])
    out = sheet.copy()
    for r, f, _ in frames_of(sheet):
        a = out[r * FH : (r + 1) * FH, f * FW : (f + 1) * FW]
        fr = Frame(a, ORDER[f // 6])
        recolor(fr, spec, skin, hair_set, maps)
        decorate(god, fr)
    img = Image.fromarray(out)
    img.save(f"{SPR}/{god}.png")
    return img


def preview(sheets):
    """Idle frame 0 of each direction (down, left, right, up), then 6 down-run frames, per god."""
    cols = [(1, 18), (1, 12), (1, 0), (1, 6)] + [(0, 18 + k) for k in range(6)]
    pv = Image.new(
        "RGBA", (len(cols) * 18 + 2, len(sheets) * 34 + 2), (110, 170, 85, 255)
    )
    for i, s in enumerate(sheets):
        for j, (r, f) in enumerate(cols):
            pv.alpha_composite(
                s.crop((f * FW, r * FH, (f + 1) * FW, (r + 1) * FH)),
                (2 + j * 18, 2 + i * 34),
            )
    os.makedirs("cache", exist_ok=True)
    pv.resize((pv.width * 6, pv.height * 6), Image.NEAREST).save(
        "cache/greek_preview.png"
    )


if __name__ == "__main__":
    sheets = [build(g) for g in GODS]
    preview(sheets)
    print("ok", list(GODS))
