"""Draw the Laestrygonian props as 16px-style pixel art, into public/assets/props/:

  giant_fist.png  2 frames of 20x41: a weathered stone fist rising from rubble on the narrow islet,
                  gripping a boulder (0, dormant) / open and empty after hurling it (1, awake)
  giant.png       2 frames of 26x28: a Laestrygonian giant on the harbour cliffs, a rock held over his head (0) /
                  arms flung out, just thrown (1). The game draws it at 2x: they are giants.
  rock.png        12x10: a thrown boulder (also drawn at 2x in flight)

Each sprite is a list of rows, one character per pixel ('.' = transparent), mapped through PAL.
Run: python tools/make_laestrygon_props.py [preview.png]
"""
import sys
import numpy as np
from PIL import Image

OUT = 'public/assets/props'
PAL = {
    'O': (38, 30, 28),
    # weathered granite of the fist
    'S': (176, 164, 140), 's': (128, 118, 102), 'T': (206, 196, 172), 'c': (96, 88, 78),
    # boulder (cooler grey)
    'G': (104, 106, 114), 'g': (72, 74, 84), 'H': (140, 142, 150), 'h': (176, 178, 184),
    # giant: sunburnt skin, beard, leather
    'K': (196, 122, 84), 'k': (150, 86, 58), 'e': (240, 230, 200), 'n': (128, 70, 48),
    'B': (74, 46, 30), 'L': (110, 74, 40), 'l': (80, 52, 28),
    # moss on the rubble
    'm': (96, 128, 66),
}

def sprite(rows, w=None):
    w = w or max(len(r) for r in rows)
    a = np.zeros((len(rows), w, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r.ljust(w, '.')[:w]):
            if ch != '.':
                a[y, x] = (*PAL[ch], 255)
    return a

FOREARM = [
    '..OSTSSSSSSSSSsO....',
    '..OSTSSSSSSSSssO....',
    '...OTSSSSSSSSsO.....',
    '...OTSSSSScSSsO.....',
    '...OTSSSSScSssO.....',
    '...OTSSSSSScSsO.....',
    '...OTSSSSSSSssO.....',
    '...OTSSSSSSSSsO.....',
    '...OTSSScSSSSsO.....',
    '...OTSSSccSSssO.....',
    '...OTSSSScSSSsO.....',
    '...OTSSSSSSSSsO.....',
    '...OTSSSSSSSssO.....',
    '...OTSSSSSSSSsO.....',
    '...OTSSSSSScSsO.....',
    '...OTSSSSScSssO.....',
    '...OTSSSSSSSSsO.....',
    '...OTSSSSSSSssO.....',
    '...OTSSSSSSSSsO.....',
    '..OOTSSSSSSSSsOO....',
    '.OGmOTSSSSSSssOmGO..',
    '.OGGHOTSSSSSsOGHGGO.',
    'OGHHGgOSSSSsOgGHHGO.',
    'OGgmGGgOOOOOgGGmgGgO',
    'OOOOOOOOOOOOOOOOOOOO',
]
FIST_HOLD = [
    '.......OOOOO........',
    '.....OOHHhhHOO......',
    '....OHHhhhhHHGO.....',
    '...OGHHhhhHHHGGO....',
    '...OGHHHHHHHGGgO....',
    '..OGGHHHHHHGGGggO...',
    '..OGGGHHHGGGGgggO...',
    '..OOTSSOTSSOTSSOOO..',
    '.OTSOTSSOTSSOTSSsO..',
    '.OTSOTSSOTSSOTSSsO..',
    '.OTsOTSsOTSsOTSssO..',
    '.OOcOOcOOOcOOOcOsO..',
    '..OSSSSSSSSSSSssO...',
    '..OSSSSSSSSSSSssO...',
    '...OSSSSSSSSSssO....',
    '...OTSSSSSSSSsO.....',
] + FOREARM
FIST_OPEN = [
    '....................',
    '..OO..OO..OO..OO....',
    '.OTO.OTO.OTO.OTO....',
    '.OTO.OTO.OTO.OTO....',
    '.OTSOOTSOOTSOOTSO...',
    '.OTSOOTSOOTSOOTSO...',
    '.OTSSSSSSSSSSSSsO.OO',
    '.OTSSSSSSSSSSSSsOOTO',
    '.OTSSSSSSSSSSSSssTsO',
    '..OTSSSScSSSSSSssOO.',
    '..OTSSSSSSSSSSSsO...',
    '..OSSSSSSSSSSSssO...',
    '..OSSSSSSSSSSSssO...',
    '...OSSSSSSSSSssO....',
    '...OSSSSSSSSSssO....',
    '...OTSSSSSSSSsO.....',
] + FOREARM

GIANT_HOLD = [
    '.........OOOOOOO..........',
    '.......OOGGHHHHGOO........',
    '......OGGHHhhHHHGGO.......',
    '......OGHHHhhHHHGGO.......',
    '......OGGHHHHHHGGgO.......',
    '...OO.OOGGGGGGgggOO.OO....',
    '..OKKO.OOOOOOOOOOO.OKKO...',
    '..OKKO.............OKKO...',
    '..OKkO....OOOOO....OkKO...',
    '..OKkO...OkKKKkO...OkKO...',
    '...OKO..OkKKKKKkO..OKO....',
    '...OKO..OKeOKOeKO..OKO....',
    '...OKKOOOKKKnKKKOOOKKO....',
    '....OKKKOKBBBBBKOKKKO.....',
    '....OKKKKOBBBBBOKKKKO.....',
    '.....OKKKKOBBBOKKKKO......',
    '.....OKKKKKKKKKKKKKO......',
    '.....OKKKkKKKKKkKKKO......',
    '.....OkKKKKKKKKKKKkO......',
    '......OkKKKKKKKKKkO.......',
    '......OLLLLLLLLLLLO.......',
    '......OLlLLlLLlLLlO.......',
    '......OKKOLLLLLOKKO.......',
    '......OKKO.OOO.OKKO.......',
    '......OKKO.....OKKO.......',
    '......OKkO.....OkKO.......',
    '.....OKKKO.....OKKKO......',
    '.....OOOOO.....OOOOO......',
]
GIANT_THROW = ['..........................'] * 8 + [
    '..........OOOOO...........',
    '.........OkKKKkO..........',
    '........OkKKKKKkO.........',
    '........OKeOKOeKO.........',
    '..OOOOOOOKKKnKKKOOOOOOO...',
    '.OKKKKKKOKBBBBBKOKKKKKKO..',
    '.OkKKKKKKOBBBBBOKKKKKKkO..',
    '..OOOOKKKKOBBBOKKKKOOOO...',
] + GIANT_HOLD[16:]

ROCK = [
    '...OOOOOO...',
    '..OGHHHHGO..',
    '.OGHHhhHHGO.',
    'OGHHhhhHHGgO',
    'OGHHHhHHHGgO',
    'OGGHHHHHGGgO',
    'OgGGGGGGGggO',
    '.OgGGGGGggO.',
    '..OggggggO..',
    '...OOOOOO...',
]

def save(name, frames):
    w = max(max(len(r) for r in f) for f in frames)
    h = max(len(f) for f in frames)
    ims = [sprite([''] * (h - len(f)) + f, w) for f in frames]   # bottom-align frames
    im = np.concatenate(ims, axis=1)
    Image.fromarray(im).save(f'{OUT}/{name}.png')
    return im, w, h

if __name__ == '__main__':
    out = {'giant_fist': save('giant_fist', [FIST_HOLD, FIST_OPEN]), 'giant': save('giant', [GIANT_HOLD, GIANT_THROW]),
           'rock': save('rock', [ROCK])}
    for k, (_, w, h) in out.items():
        print(f'{k}: frames of {w}x{h}')
    if len(sys.argv) > 1:
        ims = [v[0] for v in out.values()]
        W = sum(i.shape[1] + 4 for i in ims); H = max(i.shape[0] for i in ims)
        pv = Image.new('RGBA', (W, H), (70, 140, 200, 255)); x = 0
        for i in ims:
            pv.alpha_composite(Image.fromarray(i), (x, H - i.shape[0])); x += i.shape[1] + 4
        pv.resize((W * 6, H * 6), Image.NEAREST).save(sys.argv[1])
