"""Original Greek / Odyssey battle art, drawn in code (no source assets).

Output: public/assets/greek/
  odysseus.png   hero, seen from behind, 40x40 frames:
                 0 idle, 1 idle (breath), 2 wind-up, 3 spear thrust, 4 shield guard, 5 hurt, 6 victory
  <enemy>.png    enemies, front view, 5 frames each: 0 idle, 1 idle (breath), 2 wind-up, 3 strike, 4 hurt
                 raider / raider_captain / shade / shade_restless / siren / siren_violet: 32x32, polyphemus: 48x48
  fx.png         32x32 effects: 0-2 slash, 3-5 impact, 6 note, 7 boulder, 8 spark, 9 ambrosia, 10 owl of Athena
  cave_bg.png    240x135 battle backdrop (Polyphemus' cave opening onto the Aegean), shown at 2x
Preview: cache/greek_preview.png

Every figure is built from pixel primitives driven by a pose, then gets a 1px dark outline, so all frames of a
character share one silhouette and palette. Run: python tools/greek_battlers.py
"""
import math, os, random
import numpy as np
from PIL import Image, ImageDraw

OUT = 'public/assets/greek'
OUTLINE = (34, 24, 30, 255)


def C(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


# shared palette (dark -> light ramps)
BRONZE = [C('6b3f1d'), C('a8642a'), C('d89a3c'), C('f6d36b')]
SKIN = [C('8a4b32'), C('c27a52'), C('e8a978'), C('f6c99a')]
RED = [C('5a1420'), C('8e2230'), C('c23a3a'), C('e8645a')]
CREAM = [C('9c8a70'), C('cbbd9c'), C('eee3c4')]
WOOD = [C('3d2516'), C('6a4026'), C('93603a')]
STEEL = [C('5d6a78'), C('a3b4c0'), C('e8f0f4')]
DARK = C('2b1d24')


class F:
    """One frame: a tiny canvas with pixel primitives (no anti-aliasing)."""

    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def px(self, x, y, c):
        if 0 <= x < self.im.width and 0 <= y < self.im.height:
            self.im.putpixel((int(x), int(y)), c)

    def rect(self, x0, y0, x1, y1, c):
        self.d.rectangle([x0, y0, x1, y1], fill=c)

    def ell(self, x0, y0, x1, y1, c):
        self.d.ellipse([x0, y0, x1, y1], fill=c)

    def poly(self, pts, c):
        self.d.polygon([(round(x), round(y)) for x, y in pts], fill=c)

    def line(self, x0, y0, x1, y1, c, w=1):
        self.d.line([(round(x0), round(y0)), (round(x1), round(y1))], fill=c, width=w)

    def done(self, outline=OUTLINE):
        a = np.array(self.im)
        m = a[:, :, 3] > 0
        g = np.zeros_like(m)
        g[1:, :] |= m[:-1, :]; g[:-1, :] |= m[1:, :]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        a[g & ~m] = outline
        return Image.fromarray(a)


def strip(frames):
    w, h = frames[0].size
    s = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.paste(f, (i * w, 0))
    return s


def recolor(img, mapping):
    a = np.array(img)
    out = a.copy()
    for src, dst in mapping.items():
        m = np.all(a == np.array(src), axis=-1)
        out[m] = dst
    return Image.fromarray(out)


def spear(f, x0, y0, x1, y1):
    """Shaft from butt (x0,y0) to tip (x1,y1), with a bronze leaf blade."""
    f.line(x0, y0, x1, y1, WOOD[2])
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    for k in range(4):  # blade
        cx, cy = x1 - ux * k, y1 - uy * k
        f.px(round(cx), round(cy), BRONZE[3] if k < 2 else BRONZE[2])
        if 1 <= k <= 2:
            f.px(round(cx - uy), round(cy + ux), BRONZE[2])
            f.px(round(cx + uy), round(cy - ux), BRONZE[1])


# ====================================================================== Odysseus (back view, 40x40)
def odysseus(pose):
    f = F(40, 40)
    up = {'idle': 0, 'breath': 1, 'windup': 1, 'thrust': 0, 'guard': 1, 'hurt': 2, 'victory': 0}[pose]
    lean = {'windup': -2, 'thrust': 2, 'hurt': -2}.get(pose, 0)
    cx = 18
    # spear behind the body for idle / guard / victory
    sp = {
        'idle': (27, 38, 27, 4), 'breath': (27, 38, 27, 5), 'guard': (28, 37, 30, 4),
        'windup': (30, 36, 37, 12), 'thrust': (20, 30, 39, 1), 'hurt': (32, 38, 37, 14), 'victory': (27, 30, 27, 0),
    }[pose]
    if pose in ('idle', 'breath', 'guard', 'victory', 'hurt'):
        spear(f, *sp)
    # legs + greaves + sandals
    for lx in (cx - 4, cx + 1):
        f.rect(lx, 31, lx + 2, 36, BRONZE[1]); f.rect(lx + 1, 31, lx + 1, 35, BRONZE[2])
        f.rect(lx, 37, lx + 2, 38, WOOD[0])
    if pose == 'thrust':  # back leg pushing off
        f.rect(cx - 6, 33, cx - 4, 38, BRONZE[1]); f.rect(cx - 7, 37, cx - 4, 38, WOOD[0])
    b = up  # upper-body offset
    x = cx + lean
    # pteruges (leather skirt strips)
    f.rect(x - 5, 27 + b // 2, x + 4, 31, CREAM[1])
    for k in range(x - 5, x + 5, 2):
        f.rect(k, 28 + b // 2, k, 31, CREAM[0])
    # red cloak over the back
    f.poly([(x - 5, 15 + b), (x + 5, 15 + b), (x + 7, 30 + b // 2), (x - 7, 30 + b // 2)], RED[2])
    f.poly([(x - 1, 16 + b), (x + 1, 16 + b), (x + 2, 30 + b // 2), (x - 2, 30 + b // 2)], RED[1])
    f.line(x + 5, 16 + b, x + 7, 29 + b // 2, RED[3])
    # right arm (viewer's right) holding the spear
    if pose == 'thrust':
        f.line(x + 4, 17, 26, 24, SKIN[2], 3); spear(f, *sp)
        f.rect(25, 23, 27, 25, SKIN[1])
    elif pose == 'windup':
        f.line(x + 4, 17 + b, 31, 27, SKIN[2], 3); spear(f, *sp); f.rect(30, 26, 32, 28, SKIN[1])
    elif pose == 'victory':
        f.line(x + 4, 16, 27, 8, SKIN[2], 3); f.rect(26, 6, 28, 9, SKIN[1])
    elif pose == 'hurt':
        f.line(x + 4, 17 + b, 30, 25, SKIN[2], 3); f.rect(29, 24, 31, 26, SKIN[1])
    else:
        f.line(x + 4, 17 + b, 27, 24 + b, SKIN[2], 3); f.rect(26, 22 + b, 28, 25 + b, SKIN[1])
    # helmet (Corinthian) with transverse horsehair crest
    hx, hy = x, 8 + b
    f.ell(hx - 4, hy, hx + 4, hy + 8, BRONZE[2])
    f.ell(hx - 3, hy + 1, hx + 1, hy + 5, BRONZE[3])
    f.rect(hx - 4, hy + 6, hx + 4, hy + 8, BRONZE[1])  # neck guard
    f.ell(hx - 2, hy - 4, hx + 2, hy + 3, RED[2])  # crest
    f.rect(hx - 1, hy - 4, hx + 1, hy + 2, RED[3])
    f.rect(hx - 2, hy + 1, hx + 2, hy + 1, DARK)
    # round shield (aspis) on the left arm, seen from behind: wood inside, bronze rim, leather grip
    if pose == 'guard':
        sx, sy, r = x - 1, 21 + b, 9
    elif pose == 'hurt':
        sx, sy, r = x - 9, 25 + b, 7
    else:
        sx, sy, r = x - 8 + (1 if pose == 'thrust' else 0), 22 + b, 7
    f.ell(sx - r, sy - r, sx + r, sy + r, BRONZE[2])
    f.ell(sx - r + 1, sy - r + 1, sx + r - 1, sy + r - 1, WOOD[1])
    f.ell(sx - r + 2, sy - r + 1, sx + r - 3, sy + r - 3, WOOD[2])
    f.rect(sx - 2, sy - 1, sx + 2, sy + 1, WOOD[0])
    f.px(sx - r + 1, sy - 2, BRONZE[3]); f.px(sx - r + 1, sy - 1, BRONZE[3])
    return f.done()


# ====================================================================== Ciconian raider (front, 32x32)
def raider(pose):
    f = F(32, 32)
    b = {'breath': 1, 'windup': -1, 'strike': 1, 'hurt': 0}.get(pose, 0)
    lean = {'strike': -2, 'hurt': 2}.get(pose, 0)
    x = 16 + lean
    # sword behind for wind-up
    if pose == 'windup':
        f.line(24, 9, 28, 1, STEEL[1], 2); f.line(23, 10, 24, 9, BRONZE[2])
    # legs
    for lx in (13, 17):
        f.rect(lx, 24, lx + 2, 29, SKIN[2]); f.rect(lx, 26, lx + 2, 29, BRONZE[2]); f.rect(lx + 2, 26, lx + 2, 29, BRONZE[1])
        f.rect(lx - 1, 30, lx + 2, 31, WOOD[0])
    # tunic skirt
    f.poly([(x - 5, 19 + b), (x + 5, 19 + b), (x + 6, 25), (x - 6, 25)], RED[2])
    f.rect(x - 6, 24, x + 6, 25, RED[1])
    # bronze cuirass
    f.rect(x - 5, 11 + b, x + 5, 20 + b, BRONZE[2])
    f.rect(x - 4, 12 + b, x - 1, 15 + b, BRONZE[3])
    f.rect(x - 5, 19 + b, x + 5, 20 + b, BRONZE[1])
    f.px(x, 16 + b, BRONZE[1]); f.px(x, 17 + b, BRONZE[1])
    # head: face, beard, conical helmet with plume
    hx, hy = x, 3 + b + (1 if pose == 'hurt' else 0)
    f.rect(hx - 3, hy + 3, hx + 3, hy + 8, SKIN[2])
    f.rect(hx - 3, hy + 6, hx + 3, hy + 9, WOOD[1])  # beard
    f.rect(hx - 1, hy + 7, hx + 1, hy + 7, SKIN[1])
    if pose == 'hurt':
        f.px(hx - 2, hy + 4, DARK); f.px(hx - 1, hy + 5, DARK); f.px(hx + 2, hy + 4, DARK); f.px(hx + 1, hy + 5, DARK)
    else:
        f.px(hx - 2, hy + 5, DARK); f.px(hx + 1, hy + 5, DARK)
        if pose in ('windup', 'strike'):
            f.px(hx - 2, hy + 4, DARK); f.px(hx + 2, hy + 4, DARK)  # angry brows
    f.poly([(hx - 4, hy + 4), (hx + 4, hy + 4), (hx + 2, hy - 1), (hx - 2, hy - 1)], BRONZE[2])
    f.rect(hx - 4, hy + 3, hx + 4, hy + 4, BRONZE[1])
    f.px(hx - 1, hy, BRONZE[3]); f.px(hx - 2, hy + 2, BRONZE[3])
    f.ell(hx - 2, hy - 4, hx + 2, hy, C('1d1a20'))  # black plume
    # sword arm (viewer's right)
    if pose == 'windup':
        f.line(x + 5, 13 + b, 23, 10, SKIN[2], 3)
    elif pose == 'strike':
        f.line(x + 5, 13 + b, 19, 21, SKIN[2], 3)
        f.line(18, 22, 9, 29, STEEL[1], 2); f.px(9, 29, STEEL[2]); f.line(18, 21, 20, 23, BRONZE[2])
    elif pose == 'hurt':
        f.line(x + 5, 13, 24, 9, SKIN[2], 3); f.line(24, 8, 27, 3, STEEL[1], 2)
    else:
        f.line(x + 5, 13 + b, 22, 19 + b, SKIN[2], 3)
        f.line(22, 20 + b, 24, 27 + b, STEEL[1], 2); f.line(21, 20 + b, 23, 20 + b, BRONZE[2])
    # round shield on the left arm, painted with a black boar-tusk crescent
    sx, sy = (x - 7, 18 + b) if pose != 'strike' else (x - 4, 17 + b)
    f.ell(sx - 6, sy - 6, sx + 6, sy + 6, BRONZE[1])
    f.ell(sx - 5, sy - 5, sx + 5, sy + 5, RED[2] if pose != 'hurt' else RED[1])
    f.ell(sx - 3, sy - 3, sx + 3, sy + 3, DARK)
    f.ell(sx - 3, sy - 4, sx + 2, sy + 1, RED[2])
    f.px(sx - 4, sy - 3, RED[3]); f.px(sx - 3, sy - 4, RED[3])
    return f.done()


# ====================================================================== Shade of the Underworld (front, 32x32)
GHOST = [C('1d4b5a', 160), C('3e8fa0', 200), C('8fe3e6', 230)]
BONE = [C('8d8a80'), C('cfcabb'), C('f3efe2')]
VERD = [C('2e5248'), C('4f8371'), C('7fb8a0')]  # verdigris (corroded bronze)


def shade(pose):
    f = F(32, 32)
    b = {'breath': 1, 'windup': -2, 'strike': 1}.get(pose, 0)
    lean = {'strike': -2, 'hurt': 2}.get(pose, 0)
    x = 16 + lean
    if pose == 'windup':
        spear(f, 26, 22, 30, 1)
    # ghostly tail instead of legs
    wob = 1 if pose == 'breath' else 0
    f.poly([(x - 6, 20 + b), (x + 6, 20 + b), (x + 3 + wob, 30), (x, 26), (x - 3 - wob, 31), (x - 5, 27)], GHOST[1])
    f.poly([(x - 3, 21 + b), (x + 3, 21 + b), (x + 1, 28), (x - 2, 29)], GHOST[2])
    # ragged dark cloak
    f.poly([(x - 6, 11 + b), (x + 6, 11 + b), (x + 7, 23 + b), (x + 4, 21 + b), (x + 2, 24 + b), (x - 1, 21 + b), (x - 4, 24 + b), (x - 7, 22 + b)], C('2b2440'))
    # ribcage
    f.rect(x - 3, 12 + b, x + 3, 19 + b, C('1c1726'))
    for ry in (13, 15, 17):
        f.rect(x - 3, ry + b, x + 3, ry + b, BONE[1])
    f.rect(x, 12 + b, x, 19 + b, BONE[2])
    # skull with verdigris helmet and glowing eyes
    hx, hy = x, 3 + b + (1 if pose == 'hurt' else 0)
    f.ell(hx - 4, hy + 1, hx + 4, hy + 9, BONE[1])
    f.rect(hx - 2, hy + 8, hx + 2, hy + 10, BONE[1])
    for tx in (hx - 2, hx, hx + 2):
        f.px(tx, hy + 9, DARK)
    eye = C('ff5a7a') if pose in ('windup', 'strike') else C('7ffcff')
    f.rect(hx - 3, hy + 4, hx - 1, hy + 6, DARK); f.rect(hx + 1, hy + 4, hx + 3, hy + 6, DARK)
    if pose != 'hurt':
        f.px(hx - 2, hy + 5, eye); f.px(hx + 2, hy + 5, eye)
    f.px(hx, hy + 7, DARK)
    f.poly([(hx - 5, hy + 4), (hx + 5, hy + 4), (hx + 4, hy - 1), (hx - 4, hy - 1)], VERD[1])
    f.rect(hx - 5, hy + 3, hx + 5, hy + 4, VERD[0]); f.px(hx - 2, hy, VERD[2]); f.px(hx - 3, hy + 1, VERD[2])
    f.rect(hx - 1, hy - 4, hx + 1, hy - 1, C('5b2a6a'))  # tattered crest
    # bony arm + spear
    if pose == 'strike':
        f.line(x + 4, 13 + b, 18, 19, BONE[1], 2); spear(f, 26, 13, 6, 29)
    elif pose == 'windup':
        f.line(x + 4, 13 + b, 25, 19, BONE[1], 2)
    elif pose == 'hurt':
        f.line(x + 4, 13, 23, 11, BONE[1], 2); spear(f, 21, 24, 27, 2)
    else:
        f.line(x + 4, 13 + b, 23, 17 + b, BONE[1], 2); spear(f, 24, 28, 24, 1 + b)
    f.line(x - 5, 13 + b, x - 7, 19 + b, BONE[1], 2)
    f.rect(x - 8, 19 + b, x - 6, 20 + b, BONE[2])
    return f.done(C('10202a'))


# ====================================================================== Siren (front, 32x32) - bird body, woman's head
FEATH = [C('16485a'), C('237a86'), C('3fb3a8'), C('9be3c8')]
HAIR = [C('4a1a14'), C('7d2c1e'), C('b2472a')]


def siren(pose):
    f = F(32, 32)
    b = {'breath': 1, 'windup': -2, 'strike': 0, 'hurt': 1}.get(pose, 0)
    x = 16 + {'strike': -1, 'hurt': 1}.get(pose, 0)
    # rock perch
    f.ell(8, 26, 24, 33, C('5d5866')); f.ell(10, 26, 20, 30, C('7d778a'))
    # wings
    wings = {
        'idle': [(x - 5, 13), (x - 11, 15), (x - 10, 24), (x - 5, 22)],
        'breath': [(x - 5, 13), (x - 12, 12), (x - 11, 21), (x - 5, 22)],
        'windup': [(x - 5, 12 + b), (x - 15, 2), (x - 14, 13), (x - 5, 20 + b)],
        'strike': [(x - 5, 13), (x - 14, 18), (x - 9, 25), (x - 5, 22)],
        'hurt': [(x - 5, 14), (x - 10, 20), (x - 8, 27), (x - 4, 23)],
    }[pose]
    for side in (-1, 1):
        pts = [(x + (px_ - x) * side if side == 1 else px_, py) for px_, py in wings]
        if side == 1:
            pts = [(2 * x - px_, py) for px_, py in wings]
        f.poly(pts, FEATH[1])
        inner = [pts[0], ((pts[1][0] + pts[0][0]) / 2, (pts[1][1] + pts[0][1]) / 2 + 1), pts[2], pts[3]]
        f.poly(inner, FEATH[2])
        f.line(*pts[1], *pts[2], FEATH[0])
    # body
    f.ell(x - 5, 11 + b, x + 5, 25, FEATH[1])
    f.ell(x - 3, 13 + b, x + 3, 24, FEATH[3])
    for k in range(15 + b, 24, 3):
        f.rect(x - 2, k, x + 2, k, FEATH[2])
    # talons
    for tx in (x - 3, x + 2):
        f.rect(tx, 25, tx + 1, 27, BRONZE[2]); f.px(tx - 1, 27, BRONZE[3]); f.px(tx + 2, 27, BRONZE[3])
    # head + long hair
    hx, hy = x, 2 + b
    f.ell(hx - 5, hy, hx + 5, hy + 10, HAIR[1])
    f.rect(hx - 5, hy + 5, hx - 3, hy + 15, HAIR[1]); f.rect(hx + 3, hy + 5, hx + 5, hy + 15, HAIR[1])
    f.rect(hx - 5, hy + 8, hx - 4, hy + 15, HAIR[0]); f.rect(hx + 4, hy + 8, hx + 5, hy + 15, HAIR[0])
    f.ell(hx - 3, hy + 2, hx + 3, hy + 9, SKIN[3])
    f.rect(hx - 3, hy + 1, hx + 3, hy + 2, HAIR[2])  # fringe
    f.px(hx - 3, hy + 3, HAIR[1]); f.px(hx + 3, hy + 3, HAIR[1])
    for k in (-4, -2, 2, 4):  # gold circlet
        f.px(hx + k, hy + 1, BRONZE[3])
    if pose == 'hurt':
        f.rect(hx - 2, hy + 5, hx - 1, hy + 5, DARK); f.rect(hx + 1, hy + 5, hx + 2, hy + 5, DARK)
    else:
        f.px(hx - 2, hy + 5, C('2a6070')); f.px(hx + 2, hy + 5, C('2a6070'))
        f.px(hx - 2, hy + 4, DARK); f.px(hx + 2, hy + 4, DARK)
    if pose in ('windup', 'strike'):
        f.rect(hx - 1, hy + 7, hx + 1, hy + 8, C('6a1e2e'))  # singing
    else:
        f.rect(hx - 1, hy + 7, hx + 1, hy + 7, C('c4566a'))
    return f.done(C('1b1a2c'))


# ====================================================================== Polyphemus the Cyclops (front, 48x48)
CYC = [C('5e5a2e'), C('8a8746'), C('b3b067'), C('d4d08e')]
WOOL = [C('a59a86'), C('dcd3c0'), C('f7f2e6')]


def club(f, x0, y0, x1, y1):
    L = math.hypot(x1 - x0, y1 - y0)
    for i in range(int(L) + 1):
        t = i / L
        w = 1 + t * 3
        cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        f.ell(cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2, WOOD[1] if i % 5 else WOOD[0])
    f.px(x1, y1, WOOD[2]); f.px(x1 - 1, y1, WOOD[2])


def polyphemus(pose):
    f = F(48, 48)
    b = {'breath': 1, 'windup': -2, 'strike': 2, 'hurt': 1}.get(pose, 0)
    lean = {'strike': -3, 'hurt': 2}.get(pose, 0)
    x = 24 + lean
    if pose == 'windup':
        club(f, 36, 8, 14, 0)  # raised over the head, drawn behind
    # legs
    for lx in (16, 27):
        f.rect(lx, 37, lx + 5, 45, CYC[1]); f.rect(lx, 37, lx + 1, 45, CYC[0])
        f.rect(lx - 1, 45, lx + 6, 47, WOOD[0])
    # body
    f.ell(x - 13, 13 + b, x + 13, 37, CYC[1])
    f.ell(x - 10, 15 + b, x + 8, 33, CYC[2])
    f.ell(x - 6, 23 + b, x + 4, 33, CYC[3])
    f.line(x - 2, 25 + b, x - 2, 30, CYC[1])  # belly line
    # sheepskin loincloth
    for k, wx in enumerate(range(x - 12, x + 12, 4)):
        f.ell(wx, 31 + (k % 2), wx + 5, 38 + (k % 2), WOOL[1])
        f.px(wx + 2, 33 + (k % 2), WOOL[2]); f.px(wx + 1, 36, WOOL[0])
    # left arm (viewer's left)
    if pose == 'hurt':
        f.line(x - 11, 17 + b, x - 4, 9 + b, CYC[1], 5)  # hand clutching the eye
    else:
        f.line(x - 12, 17 + b, x - 17, 30 + b, CYC[1], 5)
        f.ell(x - 20, 29 + b, x - 14, 35 + b, CYC[2])
    # head
    hx, hy = x, 1 + b + (1 if pose == 'hurt' else 0)
    f.ell(hx - 9, hy - 1, hx + 9, hy + 4, C('3a2618'))  # wild hair
    for k in range(-8, 9, 3):
        f.poly([(hx + k - 1, hy + 1), (hx + k + 1, hy + 1), (hx + k + (1 if k > 0 else -1), hy - 3)], C('3a2618'))
    f.ell(hx - 7, hy, hx + 7, hy + 15, CYC[2])
    f.ell(hx - 6, hy + 1, hx + 2, hy + 8, CYC[3])
    # the single eye
    if pose == 'hurt':
        f.rect(hx - 4, hy + 6, hx + 4, hy + 7, DARK)
        f.px(hx - 3, hy + 8, C('c23a3a')); f.px(hx + 2, hy + 8, C('c23a3a'))
    else:
        f.ell(hx - 4, hy + 3, hx + 4, hy + 10, C('fbf7e8'))
        iris = C('c23a3a') if pose in ('windup', 'strike') else C('5a7a3a')
        dx = -1 if pose != 'hurt' else 0  # looks toward the hero (bottom-left)
        f.ell(hx - 2 + dx, hy + 5, hx + 2 + dx, hy + 9, iris)
        f.rect(hx - 1 + dx, hy + 6, hx + dx, hy + 8, DARK)
        f.px(hx + 1 + dx, hy + 5, C('ffffff'))
    brow = hy + (2 if pose in ('windup', 'strike') else 1)
    f.rect(hx - 5, brow, hx + 5, brow + 1, C('3a2618'))
    # beard + mouth with teeth
    f.poly([(hx - 7, hy + 10), (hx + 7, hy + 10), (hx + 5, hy + 17), (hx, hy + 19), (hx - 5, hy + 17)], C('3a2618'))
    mouth = 2 if pose in ('windup', 'strike') else 1
    f.rect(hx - 3, hy + 11, hx + 3, hy + 11 + mouth, C('5a1420'))
    f.px(hx - 2, hy + 11, CREAM[2]); f.px(hx + 2, hy + 11, CREAM[2])
    # club arm (viewer's right)
    if pose == 'windup':
        f.line(x + 11, 17 + b, 37, 7, CYC[1], 5); f.ell(34, 4, 40, 10, CYC[2])
    elif pose == 'strike':
        f.line(x + 11, 18 + b, x - 2, 30, CYC[1], 5)
        club(f, x - 2, 30, 3, 44); f.ell(x - 5, 27, x + 1, 33, CYC[2])
    elif pose == 'hurt':
        club(f, 40, 30, 46, 8); f.line(x + 11, 17 + b, 40, 28, CYC[1], 5); f.ell(37, 26, 43, 32, CYC[2])
    else:
        club(f, 39, 30 + b, 45, 5 + b); f.line(x + 11, 17 + b, 39, 28 + b, CYC[1], 5); f.ell(36, 26 + b, 42, 32 + b, CYC[2])
    return f.done(C('20180f'))


# ====================================================================== effects (32x32)
def fx_frames():
    out = []
    # 0-2 slash: a growing diagonal crescent
    for t in range(3):
        f = F(32, 32)
        r = 8 + t * 3
        col = [C('ffffff'), C('fff3b0'), C('f6d36b', 190)][t]
        width = [5, 4, 2][t]
        for a in range(-70, 71, 2):
            ang = math.radians(a - 45)
            taper = 1 - abs(a) / 80  # thick in the middle, pointed ends
            for w in range(max(1, round(width * taper))):
                px_, py = 16 + math.cos(ang) * (r - w), 16 + math.sin(ang) * (r - w)
                f.px(round(px_), round(py), col if w else C('ffffff'))
        out.append(f.im)
    # 3-5 impact star
    for t in range(3):
        f = F(32, 32)
        r = [6, 11, 14][t]
        col = [C('ffffff'), C('ffe27a'), C('ff9a3c', 180)][t]
        pts = []
        for k in range(16):
            rr = r if k % 2 == 0 else r * 0.45
            a = math.pi * 2 * k / 16
            pts.append((16 + math.cos(a) * rr, 16 + math.sin(a) * rr))
        f.poly(pts, col)
        if t < 2:
            f.ell(16 - r * 0.3, 16 - r * 0.3, 16 + r * 0.3, 16 + r * 0.3, C('ffffff'))
        out.append(f.im if t == 2 else f.done(C('7a2e10')))
    # 6 music note
    f = F(32, 32)
    f.ell(9, 19, 15, 24, C('ff8fc7')); f.rect(14, 7, 15, 21, C('ff8fc7')); f.rect(14, 7, 20, 9, C('ff8fc7')); f.rect(19, 7, 20, 13, C('ff8fc7'))
    f.ell(15, 11, 20, 15, C('ff8fc7')); f.px(10, 20, C('ffd8ee'))
    out.append(f.done(C('5a1640')))
    # 7 boulder
    f = F(32, 32)
    f.ell(5, 6, 27, 26, C('6e6660')); f.ell(7, 7, 22, 20, C('8f8780')); f.ell(9, 8, 15, 13, C('b2aaa2'))
    f.px(19, 21, C('4e4844')); f.px(12, 18, C('4e4844')); f.px(22, 13, C('4e4844'))
    out.append(f.done(C('2a2420')))
    # 8 spark (4-point star)
    f = F(32, 32)
    f.poly([(16, 6), (18, 14), (26, 16), (18, 18), (16, 26), (14, 18), (6, 16), (14, 14)], C('fff3b0'))
    f.rect(15, 15, 17, 17, C('ffffff'))
    out.append(f.im)
    # 9 ambrosia sparkle (green-gold)
    f = F(32, 32)
    f.poly([(16, 9), (17, 15), (23, 16), (17, 17), (16, 23), (15, 17), (9, 16), (15, 15)], C('b8f28a'))
    f.px(16, 16, C('ffffff'))
    out.append(f.im)
    # 10 owl of Athena
    f = F(32, 32)
    o = [C('8a6a2a'), C('d6a840'), C('f6d36b')]
    f.ell(9, 10, 23, 28, o[1]); f.ell(12, 16, 20, 27, o[2])
    f.poly([(9, 12), (11, 6), (14, 11)], o[1]); f.poly([(23, 12), (21, 6), (18, 11)], o[1])
    f.ell(10, 9, 16, 15, C('fff8e0')); f.ell(16, 9, 22, 15, C('fff8e0'))
    f.rect(12, 11, 13, 12, DARK); f.rect(19, 11, 20, 12, DARK)
    f.poly([(15, 14), (17, 14), (16, 17)], C('c46a20'))
    for k in range(13, 20, 3):
        f.px(k, 21, o[0]); f.px(k + 1, 24, o[0])
    out.append(f.done(C('3a2a10')))
    return out


# ====================================================================== backdrop (240x135)
def backdrop():
    W, H = 240, 135
    rnd = random.Random(7)
    im = Image.new('RGBA', (W, H), C('2a2026'))
    d = ImageDraw.Draw(im)
    # view through the cave mouth: sunset sky, sun, Aegean sea, island
    sky = [C('3b2a5c'), C('6a3a6e'), C('a64a62'), C('e0704e'), C('f6a14a'), C('fcd27a')]
    for i, c in enumerate(sky):
        d.rectangle([0, i * 9, W, i * 9 + 9], fill=c)
    d.ellipse([132, 40, 158, 66], fill=C('fff0b0'))
    sea = [C('2c5a8a'), C('22476e'), C('1b3656'), C('152a44')]
    for i, c in enumerate(sea):
        d.rectangle([0, 54 + i * 6, W, 60 + i * 6], fill=c)
    for i in range(40):
        y = 56 + rnd.randrange(22); x = rnd.randrange(60, 200)
        d.line([x, y, x + rnd.randrange(2, 7), y], fill=C('5d8fc0'))
    for k in range(6):  # sun glitter
        d.line([140 + rnd.randrange(-4, 4), 56 + k * 3, 150 + rnd.randrange(-4, 4), 56 + k * 3], fill=C('fcd27a'))
    d.polygon([(64, 54), (78, 44), (90, 47), (104, 54)], fill=C('3a2a4a'))  # distant island
    d.polygon([(178, 54), (188, 49), (199, 54)], fill=C('3a2a4a'))
    # cave rock: everything outside an irregular mouth
    rock = Image.new('L', (W, H), 255)
    rd = ImageDraw.Draw(rock)
    mouth = []
    for k in range(40):
        a = math.pi + math.pi * k / 39
        rx, ry = 78 + rnd.randrange(-4, 4), 52 + rnd.randrange(-4, 4)
        mouth.append((122 + math.cos(a) * rx, 74 + math.sin(a) * ry))
    mouth += [(200, 74), (44, 74)]
    rd.polygon(mouth, fill=0)
    m = np.array(rock) > 0
    a = np.array(im)
    ys = np.arange(H)[:, None]
    shade = np.clip(1 - np.abs(ys - 40) / 120, 0.35, 1)
    base = np.array([74, 58, 60])
    noise = np.array([[rnd.random() for _ in range(W)] for _ in range(H)])
    rockcol = (base * shade[..., None] * (0.82 + 0.25 * noise[..., None])).astype(np.uint8)
    a[m, :3] = rockcol[m]
    a[m, 3] = 255
    im = Image.fromarray(a)
    d = ImageDraw.Draw(im)
    # rim light from the sunset along the mouth edge
    for (x0, y0), (x1, y1) in zip(mouth[:-3], mouth[1:-2]):
        d.line([x0, y0 + 1, x1, y1 + 1], fill=C('c9805a'))
    # stalactites
    for x in range(6, W, 17):
        h = rnd.randrange(8, 20)
        d.polygon([(x - 4, 0), (x + 4, 0), (x + rnd.randrange(-1, 2), h)], fill=C('3a2c30'))
    # cave floor (sand and stone) in front of the opening
    d.rectangle([0, 74, W, H], fill=C('6b5446'))
    for i in range(6):
        d.rectangle([0, 74 + i * 10, W, 84 + i * 10], fill=[C('7a604e'), C('735a49'), C('6b5446'), C('624c40'), C('594539'), C('4f3d33')][i])
    for _ in range(140):
        x, y = rnd.randrange(W), rnd.randrange(76, H)
        d.point([x, y], fill=C('8d7360') if rnd.random() < 0.6 else C('4a382e'))
    # battle circles (foe and hero stand here)
    d.ellipse([110, 88, 180, 102], fill=C('836a56')); d.ellipse([116, 90, 174, 100], fill=C('8f7562'))
    # Polyphemus' sheep on the left, wine amphoras and a cheese rack on the right
    for sx, sy in [(14, 78), (34, 82), (22, 90)]:
        d.ellipse([sx, sy, sx + 14, sy + 9], fill=C('e6dfd0')); d.ellipse([sx + 1, sy + 1, sx + 9, sy + 5], fill=C('fbf7ee'))
        d.ellipse([sx - 4, sy + 1, sx + 2, sy + 6], fill=C('3a2c2a'))
        for lx in (sx + 2, sx + 10):
            d.rectangle([lx, sy + 9, lx + 1, sy + 12], fill=C('3a2c2a'))
    for ax, ay in [(206, 72), (222, 78)]:
        d.ellipse([ax, ay + 4, ax + 12, ay + 20], fill=C('b0583a')); d.rectangle([ax + 4, ay, ax + 8, ay + 5], fill=C('b0583a'))
        d.rectangle([ax + 2, ay + 1, ax + 3, ay + 7], fill=C('8a4028')); d.rectangle([ax + 9, ay + 1, ax + 10, ay + 7], fill=C('8a4028'))
        d.rectangle([ax + 1, ay + 10, ax + 11, ay + 11], fill=C('2a1a14'))  # black-figure band
        for k in range(ax + 2, ax + 11, 3):
            d.point([k, ay + 13], fill=C('2a1a14'))
    # Greek key (meander) frieze along the bottom edge
    d.rectangle([0, H - 7, W, H], fill=C('2a1a14'))
    for x in range(0, W, 8):
        c = C('c8803c')
        d.line([x, H - 2, x + 6, H - 2], fill=c); d.line([x + 6, H - 2, x + 6, H - 6], fill=c)
        d.line([x + 6, H - 6, x + 2, H - 6], fill=c); d.line([x + 2, H - 6, x + 2, H - 4], fill=c); d.line([x + 2, H - 4, x + 4, H - 4], fill=c)
    return im


ENEMY_POSES = ['idle', 'breath', 'windup', 'strike', 'hurt']
HERO_POSES = ['idle', 'breath', 'windup', 'thrust', 'guard', 'hurt', 'victory']


def main():
    os.makedirs(OUT, exist_ok=True)
    sheets = {
        'odysseus': strip([odysseus(p) for p in HERO_POSES]),
        'raider': strip([raider(p) for p in ENEMY_POSES]),
        'shade': strip([shade(p) for p in ENEMY_POSES]),
        'siren': strip([siren(p) for p in ENEMY_POSES]),
        'polyphemus': strip([polyphemus(p) for p in ENEMY_POSES]),
        'fx': strip(fx_frames()),
    }
    # recoloured variants
    sheets['raider_captain'] = recolor(sheets['raider'], {
        RED[2]: C('4a2a7a'), RED[1]: C('34195a'), RED[3]: C('7a52b0'),
        BRONZE[2]: C('e8c040'), BRONZE[3]: C('fff0a0'), BRONZE[1]: C('b08a20'), C('1d1a20'): C('d23a2a'),
    })
    sheets['shade_restless'] = recolor(sheets['shade'], {
        GHOST[1]: C('6a2a5a', 200), GHOST[2]: C('e07ac0', 230), C('7ffcff'): C('ffd34a'), C('2b2440'): C('3a1426'),
    })
    sheets['siren_violet'] = recolor(sheets['siren'], {
        FEATH[1]: C('5a3a8a'), FEATH[2]: C('9a6ad0'), FEATH[3]: C('e0c8f6'), FEATH[0]: C('2e1a50'),
        HAIR[1]: C('d8b04a'), HAIR[0]: C('a07a2a'), HAIR[2]: C('f6dc7a'),
    })
    for k, im in sheets.items():
        im.save(f'{OUT}/{k}.png')
    backdrop().save(f'{OUT}/cave_bg.png')

    # preview: every sheet at 4x on a mid-grey background
    os.makedirs('cache', exist_ok=True)
    S = 4
    rows = [v for v in sheets.values()]
    W = max(r.width for r in rows) * S + 16
    H = sum(r.height * S + 8 for r in rows) + 8 + 135 * 2 + 8
    pv = Image.new('RGBA', (max(W, 480 + 16), H), C('6c7a86'))
    y = 8
    for r in rows:
        pv.alpha_composite(r.resize((r.width * S, r.height * S), Image.NEAREST), (8, y))
        y += r.height * S + 8
    pv.alpha_composite(backdrop().resize((480, 270), Image.NEAREST), (8, y))
    pv.save('cache/greek_preview.png')
    print('wrote', ', '.join(sheets), '+ cave_bg to', OUT)


if __name__ == '__main__':
    main()
