"""Import LimeZu "Modern Interiors (free)" characters into game sprite sheets.

Source: vendor/modern_interiors_free/Modern tiles_Free/Characters_free/<Name>_{run,idle_anim}_16x16.png
        (24 frames of 16x32 each, direction order: right, up, left, down; 6 frames per direction)
Output: public/assets/sprites/<key>.png  - 16x32 frames, row 0 = run (24), row 1 = idle (24)

Free-version license: non-commercial use only (see vendor/.../LICENSE.txt).
Recolored variants (hue-shifted clothes/hair) are used so NPCs sharing a base sprite look different.
"""

import colorsys, os
import numpy as np
from PIL import Image

SRC = "vendor/modern_interiors_free/Modern tiles_Free/Characters_free/"
OUT = "public/assets/sprites"

# key: (base character, hue shift in degrees or 0)
CHARACTERS = {
    "adam": ("Adam", 0),
    "alex": ("Alex", 0),
    "amelia": ("Amelia", 0),
    "bob": ("Bob", 0),
    "alex_alt": ("Alex", 150),
    "amelia_alt": ("Amelia", -110),
}


def hue_shift(img, deg):
    """Rotate hue of saturated, non-skin pixels (clothes, hair)."""
    a = np.asarray(img).copy()
    h, w = a.shape[:2]
    for y in range(h):
        for x in range(w):
            r, g, b, al = a[y, x]
            if al == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            skin = 0.0 <= hh <= 0.12 and vv > 0.65 and 0.15 < ss < 0.6
            if ss < 0.18 or skin:
                continue
            nr, ng, nb = colorsys.hsv_to_rgb((hh + deg / 360) % 1, ss, vv)
            a[y, x, :3] = (round(nr * 255), round(ng * 255), round(nb * 255))
    return Image.fromarray(a)


def build(key, base, shift):
    run = Image.open(f"{SRC}{base}_run_16x16.png").convert("RGBA")
    idle = Image.open(f"{SRC}{base}_idle_anim_16x16.png").convert("RGBA")
    sheet = Image.new("RGBA", (384, 64), (0, 0, 0, 0))
    sheet.paste(run, (0, 0))
    sheet.paste(idle, (0, 32))
    if shift:
        sheet = hue_shift(sheet, shift)
    sheet.save(f"{OUT}/{key}.png")
    return sheet


# Fungus Cave pack: RPG Maker layout (3 cols x 4 rows of 16x32; rows down/left/right/up), copied as-is
CAVE_SRC = "Fungus Cave [16x16]/Characters/"
CAVE_CHARACTERS = {
    "cleric": "Cleric",
    "fungus_ghost": "Fungus - Ghost",
    "fungus_king": "Fungus - King",
    "fungus_red": "Fungus - red",
    "fungus_violet": "Fungus - violet",
    "refugee1": "Refugee 1",
    "refugee2": "Refugee 2",
    "refugee3": "Refugee 3",
    "refugee4": "Refugee 4",
    "sewer_ghost": "Sewers monster - ghost",
    "sewer_monster": "Sewers monster",
}


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for key, name in CAVE_CHARACTERS.items():
        Image.open(f"{CAVE_SRC}{name}.png").convert("RGBA").save(f"{OUT}/{key}.png")
    sheets = [build(k, b, s) for k, (b, s) in CHARACTERS.items()]
    # preview: idle-down frame of each
    prev = Image.new("RGBA", (20 * len(sheets), 36), (120, 180, 90, 255))
    for i, s in enumerate(sheets):
        prev.alpha_composite(s.crop((18 * 16, 32, 19 * 16, 64)), (i * 20 + 2, 2))
    prev.resize((prev.width * 6, prev.height * 6), Image.NEAREST).save(
        "cache/characters_preview.png"
    )
    print("ok", list(CHARACTERS))
