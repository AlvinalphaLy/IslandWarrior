"""Draw the statue of Circe, the witch of Aeaea: a stone figure the size of a player sprite (16x32).

Pointed hat with a bent tip, hair falling past the shoulders, a flared robe, a staff topped with an orb, and a
square plinth. Grey stone in the village's style (navy #3a3a50 outline). The eyes and the orb glow violet.

Output: public/assets/props/witch_statue.png, 2 frames of 16x32 side by side (the glow pulses between them).
The black aura around it is drawn by the game (MapScene, statue spawns with `aura`).
Usage: python tools/make_witch_statue.py   (also writes cache/witch_statue_preview.png)
"""
import os
from PIL import Image, ImageDraw

W, H, FRAMES = 16, 32, 2


def rgb(h):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)


C = {k: rgb(v) for k, v in dict(outline='#3a3a50', light='#c8c6d2', mid='#9a98a8', dark='#6c6a7c', deep='#4e4c5e',
                                 moss='#5f7a52').items()}
GLOW = [rgb('#a24cf0'), rgb('#e2a8ff')]   # eyes and orb, per frame
GLOW_CORE = [rgb('#d68cff'), rgb('#ffffff')]


def draw(frame):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    px = lambda x, y, c: im.putpixel((x, y), c) if 0 <= x < W and 0 <= y < H else None
    # plinth
    d.rectangle([2, 28, 13, 30], fill=C['mid'])
    d.line([(2, 28), (13, 28)], fill=C['light'])
    d.line([(2, 30), (13, 30)], fill=C['dark'])
    px(4, 29, C['moss']); px(5, 29, C['moss']); px(11, 30, C['moss'])
    # robe: flares from the shoulders to the plinth, lit from the left
    for y in range(15, 28):
        t = (y - 15) / 12
        x0, x1 = round(5 - 2 * t), round(10 + 2 * t)
        for x in range(x0, x1 + 1):
            c = C['light'] if x <= x0 + 1 else C['dark'] if x >= x1 - 1 else C['mid']
            if (x - 7) % 3 == 0 and y > 19:
                c = C['dark']                       # folds
            px(x, y, c)
    d.line([(4, 27), (11, 27)], fill=C['deep'])     # hem
    # sleeve / hand reaching to the staff
    for x, y in ((10, 16), (11, 16), (11, 17), (12, 17)):
        px(x, y, C['mid'])
    px(12, 18, C['light'])
    # hair down the back and sides
    for y in range(11, 17):
        px(5, y, C['deep']); px(10, y, C['deep'])
    px(4, 15, C['deep']); px(11, 15, C['deep'])
    # face in the shadow of the brim
    d.rectangle([6, 10, 9, 14], fill=C['mid'])
    d.line([(6, 10), (9, 10)], fill=C['dark'])
    px(6, 12, GLOW[frame]); px(9, 12, GLOW[frame])  # glowing eyes
    px(7, 14, C['dark']); px(8, 14, C['dark'])      # mouth
    # hat: wide brim, tall cone, tip bent to the right
    d.line([(2, 9), (13, 9)], fill=C['dark'])
    d.line([(3, 8), (12, 8)], fill=C['mid'])
    d.polygon([(5, 8), (10, 8), (9, 3), (8, 2)], fill=C['mid'])
    d.line([(5, 8), (7, 3)], fill=C['light'])
    px(8, 1, C['mid']); px(9, 1, C['dark']); px(10, 2, C['dark']); px(11, 2, C['dark'])
    px(6, 7, C['deep']); px(7, 7, C['deep']); px(8, 7, C['deep']); px(9, 7, C['deep'])   # hat band
    # staff, orb on top
    for y in range(6, 28):
        px(13, y, C['dark'] if y % 4 else C['deep'])
    for x, y in ((12, 3), (13, 3), (14, 3), (12, 4), (14, 4), (12, 5), (13, 5), (14, 5)):
        px(x, y, C['mid'])
    px(13, 4, GLOW_CORE[frame]); px(12, 3, GLOW[frame])
    # outline everything (4-neighbour), like the tileset's sprites
    src = im.copy().load()
    out = im.load()
    for y in range(H):
        for x in range(W):
            if src[x, y][3]:
                continue
            if any(0 <= x + dx < W and 0 <= y + dy < H and src[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[x, y] = C['outline']
    return im


if __name__ == '__main__':
    os.makedirs('public/assets/props', exist_ok=True)
    sheet = Image.new('RGBA', (W * FRAMES, H), (0, 0, 0, 0))
    for f in range(FRAMES):
        sheet.paste(draw(f), (f * W, 0))
    sheet.save('public/assets/props/witch_statue.png')
    os.makedirs('cache', exist_ok=True)
    bg = Image.new('RGBA', sheet.size, (110, 190, 90, 255))
    bg.alpha_composite(sheet)
    bg.resize((bg.width * 10, bg.height * 10), Image.NEAREST).save('cache/witch_statue_preview.png')
    print('ok', sheet.size)
