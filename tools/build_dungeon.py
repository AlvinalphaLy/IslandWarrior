"""Author the sewer dungeon (public/assets/maps/dungeon.json) from the Fungus Cave pack's Sewers tileset,
populated with Fantasy Battlers enemies (Spawns objects of type `enemy`).

Layout: a 32x22 sewer hall. A water channel runs under the top wall, and two canals cross the hall from
opposite sides, so the route zig-zags: ladder (top-left) -> right -> down -> left -> down -> the Gumball Golem's lair.
Run: python tools/build_dungeon.py  -> also cache/dungeon_render.png + cache/dungeon_collision.png

Variant `circe` (python tools/build_dungeon.py circe -> public/assets/maps/circe.json): Circe's grotto, entered from
the witch statue on the village islet. Same sewer tiles recoloured dark violet (tilesets/grotto.png), the canals
mirrored (the route goes left first, then right), sirens and shades, and a chest of moly at the end.
"""

import json, os, random, sys
import numpy as np
from PIL import Image, ImageDraw

SEWER = "Fungus Cave [16x16]/Tilesets/Tileset - Sewers 16x16.png"
CAVE = (
    "Fungus Cave [16x16]/Tilesets/Tileset - Fungus cave and Refugee outpost 16x16.png"
)
OUT = "public/assets"
TS, W, H = 16, 32, 22
VARIANT = sys.argv[1] if len(sys.argv) > 1 else "sewer"
assert VARIANT in ("sewer", "circe"), "variant: sewer | circe"
MAP_NAME = "dungeon" if VARIANT == "sewer" else "circe"
TILESET_NAME = "sewer" if VARIANT == "sewer" else "grotto"
random.seed(11 if VARIANT == "sewer" else 23)

sheets = {
    "sewer": np.asarray(Image.open(SEWER).convert("RGBA")),
    "cave": np.asarray(Image.open(CAVE).convert("RGBA")),
}


def tile(sheet, tid):
    s = sheets[sheet]
    cols = s.shape[1] // TS
    return s[
        (tid // cols) * TS : (tid // cols + 1) * TS,
        (tid % cols) * TS : (tid % cols + 1) * TS,
    ]


FLOOR = [44, 45, 46, 51, 52, 62, 66]
WATER_TOP, WATER = [60, 61], [29, 30]
SHADOW_FLOOR = [40, 41]  # floor just below a wall or a canal edge

# ------------------------------------------------------------------ terrain
TOP_CHANNEL = (9, W - 2)  # x range of the water under the top wall (rows 2-3)
CANALS = [(10, 1, 22), (15, 9, W - 2)]  # (top row, x0, x1): 2 rows of water each
if VARIANT == "circe":
    CANALS = [
        (9, 9, W - 2),
        (15, 1, 22),
    ]  # mirrored: the first gap is on the left, the second on the right
water = np.zeros((H, W), bool)

g = [[0] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        top, bottom, left, right = y == 0, y == H - 1, x == 0, x == W - 1
        if top and left:
            t = 4
        elif top and right:
            t = 7
        elif bottom and left:
            t = 36
        elif bottom and right:
            t = 39
        elif top:
            t = 5 + x % 2
        elif bottom:
            t = 37 + x % 2
        elif left:
            t = 12 if y == 1 else (20 if y % 2 else 28)
        elif right:
            t = 15 if y == 1 else (23 if y % 2 else 31)
        elif y == 1:
            t = 13 + x % 2
        else:
            t = random.choice(FLOOR)
        g[y][x] = t

# wall accents: waterfalls, drains, lanterns
for x, t in {
    10: 34,
    22: 34,
    16: 50,
    7: 75,
    13: 83,
    19: 67,
    26: 75,
    28: 32,
    29: 33,
}.items():
    g[1][x] = t
# floor directly under the wall (left of the top channel) is shadowed
for x in range(1, TOP_CHANNEL[0]):
    g[2][x] = SHADOW_FLOOR[x % 2]
# top channel
for x in range(TOP_CHANNEL[0], TOP_CHANNEL[1] + 1):
    g[2][x] = 42 if g[1][x] == 34 else 43
    g[3][x] = WATER[x % 2]
    water[2:4, x] = True
# canals
for ty, x0, x1 in CANALS:
    for x in range(x0, x1 + 1):
        g[ty][x] = WATER_TOP[x % 2]
        g[ty + 1][x] = WATER[x % 2]
        water[ty : ty + 2, x] = True
        if ty + 2 < H - 1:
            g[ty + 2][x] = SHADOW_FLOOR[x % 2]

# ------------------------------------------------------------------ overlays (Ground1): ladder from the cave tileset
g1 = [[None] * W for _ in range(H)]
LADDER_X = 3
g1[0][LADDER_X] = ("cave", 99)
g1[1][LADDER_X] = ("cave", 115)

# ------------------------------------------------------------------ props: (sheet, rows, tile x, tile y, category)
STAMPS_CIRCE = [
    ("sewer", [[47]], 6, 5, "flat"),
    ("sewer", [[54]], 17, 5, "flat"),
    ("sewer", [[55]], 25, 6, "flat"),
    ("sewer", [[47]], 4, 13, "flat"),
    ("sewer", [[55]], 12, 19, "flat"),
    ("sewer", [[54]], 27, 12, "flat"),
    ("cave", [[150]], 1, 5, "solid"),
    ("cave", [[151]], 1, 6, "solid"),
    ("cave", [[158]], 13, 6, "solid"),
    ("cave", [[242]], 29, 5, "solid"),
    ("cave", [[236], [244]], 30, 5, "solid"),
    ("cave", [[128]], 21, 12, "flat"),
    ("cave", [[130]], 9, 12, "flat"),
    ("cave", [[89]], 5, 19, "flat"),
    ("sewer", [[73, 74]], 28, 19, "solid"),  # Circe's chest of moly
]
STAMPS = [
    ("sewer", [[47]], 6, 4, "flat"),
    ("sewer", [[54]], 17, 6, "flat"),
    ("sewer", [[55]], 25, 5, "flat"),
    ("sewer", [[47]], 3, 13, "flat"),
    ("sewer", [[55]], 12, 18, "flat"),
    ("sewer", [[54]], 27, 13, "flat"),
    ("cave", [[150]], 1, 5, "solid"),
    ("cave", [[151]], 1, 6, "solid"),
    ("cave", [[158]], 7, 7, "solid"),
    ("cave", [[242]], 29, 7, "solid"),
    ("cave", [[236], [244]], 30, 7, "solid"),
    ("cave", [[128]], 21, 13, "flat"),
    ("cave", [[130]], 9, 13, "flat"),
    ("cave", [[89]], 5, 19, "flat"),
    ("sewer", [[73, 74]], 28, 19, "solid"),  # the Golem's treasure chest
]

if VARIANT == "circe":
    STAMPS = STAMPS_CIRCE

# ------------------------------------------------------------------ collision
rects = []
blocked = np.zeros((H, W), bool)
blocked[:2, :] = True
blocked[-1, :] = True
blocked[:, 0] = True
blocked[:, -1] = True


def greedy(grid, kind):
    gg = grid.copy()
    out = []
    for y in range(gg.shape[0]):
        x = 0
        while x < gg.shape[1]:
            if not gg[y, x]:
                x += 1
                continue
            x1 = x
            while x1 + 1 < gg.shape[1] and gg[y, x1 + 1]:
                x1 += 1
            y1 = y
            while y1 + 1 < gg.shape[0] and gg[y1 + 1, x : x1 + 1].all():
                y1 += 1
            gg[y : y1 + 1, x : x1 + 1] = False
            out.append((x * TS, y * TS, (x1 - x + 1) * TS, (y1 - y + 1) * TS, kind))
            x = x1 + 1
    return out


rects += greedy(blocked, "wall")
# water: let the player stand on the edge tile's lip (top 5px of the first water row are walkable)
for x, y, w, h, _ in greedy(water & ~blocked, "water"):
    rects.append((x, y + 5, w, h - 5, "water"))

objects = []
for z, (sheet, rows, tx, ty, cat) in enumerate(STAMPS):
    bottom = (ty + len(rows)) * TS
    pts = []
    for dy, row in enumerate(rows):
        for dx, tid in enumerate(row):
            o = dict(
                sheet=sheet,
                id=tid,
                x=(tx + dx) * TS,
                y=(ty + dy) * TS,
                cat=cat,
                sortY=-1 if cat == "flat" else bottom,
                z=len(objects),
            )
            objects.append(o)
            ys, xs = np.nonzero(tile(sheet, tid)[..., 3] > 127)
            if len(ys):
                pts.append(
                    (
                        o["x"] + xs.min(),
                        o["y"] + ys.min(),
                        o["x"] + xs.max() + 1,
                        o["y"] + ys.max() + 1,
                    )
                )
    if cat == "solid" and pts:
        x0 = min(p[0] for p in pts)
        y0 = min(p[1] for p in pts)
        x1 = max(p[2] for p in pts)
        y1 = max(p[3] for p in pts)
        y0 = y1 - max(6, int((y1 - y0) * 0.55))
        rects.append((x0, y0, x1 - x0, y1 - y0, "solid"))

pix = np.zeros((H * TS, W * TS), bool)
for x, y, w, h, _ in rects:
    pix[y : y + h, x : x + w] = True


def nearest_walkable(x, y):
    for r in range(40):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:
                    continue
                fx, fy = x + dx, y + dy
                if fx - 5 < 0 or fy - 6 < 0 or fx + 5 > W * TS or fy > H * TS:
                    continue
                if not pix[fy - 6 : fy, fx - 5 : fx + 5].any():
                    return fx, fy
    return x, y


# ------------------------------------------------------------------ spawns
oid = [1]


def nid():
    oid[0] += 1
    return oid[0]


spawns = []


def point(name, typ, tx, ty, **props):
    fx, fy = nearest_walkable(int(tx * TS), int(ty * TS))
    spawns.append(
        dict(
            id=nid(),
            name=name,
            type=typ,
            x=float(fx),
            y=float(fy),
            point=True,
            width=0,
            height=0,
            rotation=0,
            visible=True,
            properties=[
                dict(name=k, type="int" if isinstance(v, int) else "string", value=v)
                for k, v in props.items()
            ],
        )
    )


def area(name, typ, x, y, w, h, **props):
    spawns.append(
        dict(
            id=nid(),
            name=name,
            type=typ,
            x=float(x),
            y=float(y),
            width=w,
            height=h,
            rotation=0,
            visible=True,
            properties=[dict(name=k, type="string", value=v) for k, v in props.items()],
        )
    )


point("player", "player", LADDER_X + 0.5, 3.6, sprite="adam")
area("exit_ladder", "exit", LADDER_X * TS + 1, 2 * TS - 2, 14, 9, target="village")
# enemies: `enemy` = id in src/data/enemies.ts, names must be unique (defeats are remembered by name)
# one monster per dungeon. Odyssey enemies (tools/greek_battlers.py); the Fantasy Battlers ids in enemies.ts also work.
# More spawns that fit this layout: ('captain_a', 'raider_captain', 19, 8.5), ('siren_a', 'siren', 27, 7),
# ('siren_b', 'siren_violet', 26, 13.5), ('shade_a', 'shade', 14, 13.8), ('shade_b', 'shade_restless', 5, 14),
# ('raider_b', 'raider', 4, 19.5), ('shade_c', 'shade', 11, 20), ('polyphemus', 'polyphemus', 21, 20.5)
ENEMY_SPAWNS = [
    (
        "raider_a",
        "raider",
        12,
        6.5,
    ),  # Telemachus training room: one easy Ciconian Raider near the entrance
]
CHEST = "chest_golem"
if VARIANT == "circe":
    # Circe's creatures: the shades she sends Odysseus to, and sirens (she warns him of them)
    # one guardian. More spawns that fit this layout: ('shade_a', 'shade', 12, 6.5), ('siren_a', 'siren', 20, 7.5),
    # ('shade_b', 'shade_restless', 27, 7), ('shade_c', 'shade', 16, 13), ('siren_c', 'siren', 26, 13),
    # ('shade_d', 'shade_restless', 10, 20), ('siren_d', 'siren_violet', 22, 20)
    ENEMY_SPAWNS = [
        (
            "siren_b",
            "siren_violet",
            6,
            12.8,
        ),  # the Siren of the Rocks, on the way to the moly
    ]
    CHEST = "chest_circe"
for name, enemy, tx, ty in ENEMY_SPAWNS:
    point(name, "enemy", tx, ty, enemy=enemy)
area(CHEST, "chest", 28 * TS, 19 * TS, 32, 16, dialog=CHEST)

# ------------------------------------------------------------------ write Tiled JSON
os.makedirs(f"{OUT}/maps", exist_ok=True)
os.makedirs(f"{OUT}/tilesets", exist_ok=True)


def grotto(img):
    """Recolour the sewer tiles for Circe's grotto: darker, and every colour pulled toward violet."""
    a = np.asarray(img).astype(np.float32)
    lum = a[..., :3] @ np.array([0.3, 0.55, 0.15], np.float32)
    violet = lum[..., None] * np.array([0.9, 0.62, 1.25], np.float32)
    rgb = (a[..., :3] * 0.3 + violet * 0.7) * 1.08
    return Image.fromarray(
        np.dstack([np.clip(rgb, 0, 255), a[..., 3]]).astype(np.uint8)
    )


tileset_img = Image.open(SEWER).convert("RGBA")
if VARIANT == "circe":
    tileset_img = grotto(tileset_img)
    sheets["sewer"] = np.asarray(tileset_img)  # previews use the recoloured tiles
tileset_img.save(f"{OUT}/tilesets/{TILESET_NAME}.png")
FIRST = {"sewer": 1}
sw = sheets["sewer"]
scount = (sw.shape[1] // TS) * (sw.shape[0] // TS)
FIRST["cave"] = 1 + scount
cv = sheets["cave"]
ccount = (cv.shape[1] // TS) * (cv.shape[0] // TS)
layers = [
    dict(
        id=1,
        name="Ground0",
        type="tilelayer",
        width=W,
        height=H,
        x=0,
        y=0,
        opacity=1,
        visible=True,
        data=[FIRST["sewer"] + t for row in g for t in row],
    ),
    dict(
        id=2,
        name="Ground1",
        type="tilelayer",
        width=W,
        height=H,
        x=0,
        y=0,
        opacity=1,
        visible=True,
        data=[(FIRST[c[0]] + c[1]) if c else 0 for row in g1 for c in row],
    ),
    dict(
        id=3,
        name="Ground2",
        type="tilelayer",
        width=W,
        height=H,
        x=0,
        y=0,
        opacity=1,
        visible=True,
        data=[0] * (W * H),
    ),
    dict(
        id=4,
        name="Objects",
        type="objectgroup",
        draworder="index",
        opacity=1,
        visible=True,
        x=0,
        y=0,
        objects=[
            dict(
                id=nid(),
                gid=FIRST[o["sheet"]] + o["id"],
                x=o["x"],
                y=o["y"] + TS,
                width=TS,
                height=TS,
                rotation=0,
                visible=True,
                name="",
                type=o["cat"],
                properties=[
                    dict(name="sortY", type="int", value=o["sortY"]),
                    dict(name="z", type="int", value=o["z"]),
                ],
            )
            for o in objects
        ],
    ),
    dict(
        id=5,
        name="Collision",
        type="objectgroup",
        opacity=1,
        visible=False,
        x=0,
        y=0,
        objects=[
            dict(
                id=nid(),
                name="",
                type=k,
                x=int(x),
                y=int(y),
                width=int(w),
                height=int(h),
                rotation=0,
                visible=True,
            )
            for x, y, w, h, k in rects
        ],
    ),
    dict(
        id=6,
        name="Spawns",
        type="objectgroup",
        opacity=1,
        visible=False,
        x=0,
        y=0,
        objects=spawns,
    ),
]
tilesets = [
    dict(
        firstgid=FIRST["sewer"],
        name=TILESET_NAME,
        image=f"../tilesets/{TILESET_NAME}.png",
        imagewidth=sw.shape[1],
        imageheight=sw.shape[0],
        tilewidth=TS,
        tileheight=TS,
        columns=sw.shape[1] // TS,
        tilecount=scount,
        margin=0,
        spacing=0,
    ),
    dict(
        firstgid=FIRST["cave"],
        name="cave",
        image="../tilesets/cave.png",
        imagewidth=cv.shape[1],
        imageheight=cv.shape[0],
        tilewidth=TS,
        tileheight=TS,
        columns=cv.shape[1] // TS,
        tilecount=ccount,
        margin=0,
        spacing=0,
    ),
]
tmj = dict(
    type="map",
    version="1.10",
    tiledversion="1.10.2",
    orientation="orthogonal",
    renderorder="right-down",
    width=W,
    height=H,
    tilewidth=TS,
    tileheight=TS,
    infinite=False,
    nextlayerid=7,
    nextobjectid=oid[0] + 1,
    properties=[dict(name="dark", type="bool", value=True)],
    tilesets=tilesets,
    layers=layers,
)
json.dump(tmj, open(f"{OUT}/maps/{MAP_NAME}.json", "w"), default=lambda v: v.item())

# ------------------------------------------------------------------ previews
canvas = Image.new("RGBA", (W * TS, H * TS), (0, 0, 0, 255))
for y in range(H):
    for x in range(W):
        canvas.alpha_composite(
            Image.fromarray(tile("sewer", g[y][x])), (x * TS, y * TS)
        )
        if g1[y][x]:
            canvas.alpha_composite(Image.fromarray(tile(*g1[y][x])), (x * TS, y * TS))
for o in sorted(objects, key=lambda o: (o["sortY"], o["z"])):
    canvas.alpha_composite(Image.fromarray(tile(o["sheet"], o["id"])), (o["x"], o["y"]))
canvas.resize((W * TS * 2, H * TS * 2), Image.NEAREST).save(
    f"cache/{MAP_NAME}_render.png"
)
d = ImageDraw.Draw(canvas, "RGBA")
for x, y, w, h, k in rects:
    d.rectangle(
        [x, y, x + w - 1, y + h - 1],
        fill={
            "wall": (255, 0, 200, 90),
            "water": (0, 120, 255, 110),
            "solid": (255, 255, 0, 130),
        }[k],
    )
for s in spawns:
    if s.get("point"):
        d.ellipse(
            [s["x"] - 3, s["y"] - 3, s["x"] + 3, s["y"] + 3],
            fill=(255, 60, 60, 255) if s["type"] == "enemy" else (255, 255, 255, 255),
        )
    else:
        d.rectangle(
            [s["x"], s["y"], s["x"] + s["width"] - 1, s["y"] + s["height"] - 1],
            outline=(0, 255, 0, 255),
        )
canvas.resize((W * TS * 2, H * TS * 2), Image.NEAREST).save(
    f"cache/{MAP_NAME}_collision.png"
)
print(
    f"{MAP_NAME}: {W}x{H} objects={len(objects)} rects={len(rects)} spawns={len(spawns)}"
)
