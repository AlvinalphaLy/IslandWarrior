"""Author the harbour of the Laestrygonians at Telepylus (public/assets/maps/telepylus.json): the ship escape.

Entered through Homer's statue on the narrow islet (he sings you into the tale). You start aboard the black ship in an inner basin walled by
cliffs; a winding channel leads south to the harbour mouth (the bottom edge of the map). Giants on the cliff tops hurl
boulders at the ship (src/entities/Harbor.ts): sail out of the mouth to escape.

Ground0 is the game's animated water everywhere; Ground1 is the land, drawn per pixel into a generated tileset
(public/assets/tilesets/harbor.png): rock tops with scrub, sheer cliff faces where the land drops to the water to the
south, foam along every shore. Water collision is written at 4px resolution, so the ship hugs the real coastline.

Run: python tools/build_harbor.py  -> also writes cache/harbor_render.png
"""

import json, os, random
import numpy as np
from PIL import Image
from scipy import ndimage

TS = 16
W, H = 30, 40  # tiles (480 x 640 px)
PW, PH = W * TS, H * TS
OUT_MAP = "public/assets/maps/telepylus.json"
OUT_TS = "public/assets/tilesets/harbor.png"
WATER_PNG = "public/assets/tilesets/water.png"
rng = np.random.default_rng(5)
random.seed(5)

# ------------------------------------------------------------------ water shape (tiles), then a rough pixel coastline
WATER_RECTS = [  # x0, y0, x1, y1 (inclusive, tiles)
    (4, 2, 25, 12),  # the inner basin, where the ship starts
    (5, 12, 14, 21),  # channel, first leg (south-west)
    (5, 19, 21, 23),  # the bend east
    (13, 21, 22, 30),  # second leg
    (9, 28, 22, 31),  # the bend west
    (9, 29, 17, 39),  # last leg, out through the mouth (bottom edge)
]
water_t = np.zeros((H, W), bool)
for x0, y0, x1, y1 in WATER_RECTS:
    water_t[y0 : y1 + 1, x0 : x1 + 1] = True
water = np.kron(water_t, np.ones((TS, TS), bool))
# roughen the coast: smooth noise field, shift the boundary in or out by up to ~5px
noise = (
    ndimage.gaussian_filter(rng.standard_normal((PH, PW)), 14) * 0.6
    + ndimage.gaussian_filter(rng.standard_normal((PH, PW)), 5) * 0.4
)
noise /= np.abs(noise).max()
dist_in = ndimage.distance_transform_edt(water)
dist_out = ndimage.distance_transform_edt(~water)
signed = np.where(water, dist_in, -dist_out) + noise * 13
water = signed > 0.5
water[PH - 2 :, :] = water[PH - 3, :]  # keep the mouth open right to the edge
water = ndimage.binary_opening(water, iterations=2)
land = ~water

# ------------------------------------------------------------------ paint the land
ROCK = np.array(
    [(92, 78, 66), (118, 100, 82), (142, 122, 98), (168, 148, 118)], np.uint8
)
CLIFF = np.array([(54, 44, 40), (74, 60, 52), (96, 80, 66)], np.uint8)
SCRUB = np.array([(64, 92, 52), (84, 118, 62)], np.uint8)
FOAM = np.array([(200, 230, 245), (240, 250, 255)], np.uint8)
OUTLINE = np.array((40, 30, 28), np.uint8)
img = np.zeros((PH, PW, 4), np.uint8)
tex = ndimage.gaussian_filter(rng.standard_normal((PH, PW)), 1.2)
tex2 = ndimage.gaussian_filter(rng.standard_normal((PH, PW)), 4)
ys, xs = np.nonzero(land)
tex3 = ndimage.gaussian_filter(rng.standard_normal((PH, PW)), 12)
tex3 /= np.abs(tex3).max()
lvl = np.clip(
    1.5 + tex[ys, xs] * 1.2 + tex2[ys, xs] * 0.6 + tex3[ys, xs] * 1.6, 0, 3
).astype(int)
img[ys, xs, :3] = ROCK[lvl]
img[ys, xs, 3] = 255
# cliff faces: land within 12px above water (we look down on cliffs that drop away to the south)
below_water = np.zeros_like(land)
for d in range(1, 13):
    below_water[:-d] |= water[d:]
face = land & below_water
fy, fx = np.nonzero(face)
fl = np.clip(1 + ((fx * 7 + (fy // 3) * 3) % 5 == 0) - (tex[fy, fx] < -0.3), 0, 2)
img[fy, fx, :3] = CLIFF[fl]
# the lip of each cliff: a light edge on the rock top just above the face
lip = land & ~face & np.roll(face, -1, axis=0)
img[lip, :3] = ROCK[3]
# scrub on the plateaus, away from the edges
far = ndimage.distance_transform_edt(land) > 10
sc = far & (ndimage.gaussian_filter(rng.standard_normal((PH, PW)), 3) > 0.35)
img[sc, :3] = SCRUB[(tex[sc] > 0).astype(int)]
# loose boulders on the plateaus (light top, dark underside, outline)
for _ in range(70):
    cx, cy, r = (
        int(rng.integers(6, PW - 6)),
        int(rng.integers(6, PH - 6)),
        int(rng.integers(2, 5)),
    )
    yy, xx = np.ogrid[-r - 1 : r + 2, -r - 1 : r + 2]
    disc = xx * xx + yy * yy <= r * r
    y0, x0 = cy - r - 1, cx - r - 1
    region = (slice(y0, y0 + disc.shape[0]), slice(x0, x0 + disc.shape[1]))
    if not land[region].all() or face[region].any():
        continue
    ring = ndimage.binary_dilation(disc) & ~disc
    sub = img[region]
    sub[ring, :3] = OUTLINE
    dy, dx = np.nonzero(disc)
    for py, px in zip(dy, dx):
        sub[py, px, :3] = (
            ROCK[3]
            if (py - r - 1) + (px - r - 1) < -r // 2
            else ROCK[1] if (py - r - 1) > r // 2 else ROCK[2]
        )
# outline the land, then foam on the water along the shore
edge = land & ~ndimage.binary_erosion(land)
img[edge, :3] = OUTLINE
foam1 = water & ndimage.binary_dilation(land, iterations=1)
foam2 = water & ndimage.binary_dilation(land, iterations=3) & ~foam1 & (tex > 0.2)
img[foam1] = (*FOAM[1], 255)
img[foam2] = (*FOAM[0], 200)

# ------------------------------------------------------------------ cut into tiles (deduplicated) -> tileset
tiles, index = [], {}
g1 = np.zeros((H, W), int)
for ty in range(H):
    for tx in range(W):
        t = img[ty * TS : (ty + 1) * TS, tx * TS : (tx + 1) * TS]
        if not (t[..., 3] > 0).any():
            continue
        k = t.tobytes()
        if k not in index:
            index[k] = len(tiles)
            tiles.append(t.copy())
        g1[ty, tx] = index[k] + 1
COLS = 32
rows = (len(tiles) + COLS - 1) // COLS
sheet = np.zeros((rows * TS, COLS * TS, 4), np.uint8)
for i, t in enumerate(tiles):
    sheet[
        (i // COLS) * TS : (i // COLS + 1) * TS, (i % COLS) * TS : (i % COLS + 1) * TS
    ] = t
Image.fromarray(sheet).save(OUT_TS)

# ------------------------------------------------------------------ collision: water rects at 4px for the ship
C = 4
wc = water.reshape(PH // C, C, PW // C, C).all(axis=(1, 3))


def greedy(grid):
    g = grid.copy()
    out = []
    for y in range(g.shape[0]):
        x = 0
        while x < g.shape[1]:
            if not g[y, x]:
                x += 1
                continue
            x1 = x
            while x1 + 1 < g.shape[1] and g[y, x1 + 1]:
                x1 += 1
            y1 = y
            while y1 + 1 < g.shape[0] and g[y1 + 1, x : x1 + 1].all():
                y1 += 1
            g[y : y1 + 1, x : x1 + 1] = False
            out.append((x * C, y * C, (x1 - x + 1) * C, (y1 - y + 1) * C))
            x = x1 + 1
    return out


water_rects = greedy(wc)

# ------------------------------------------------------------------ spawns: the ship, and giants on the cliff tops
oid = [1]


def nid():
    oid[0] += 1
    return oid[0]


def typed(k, v):
    return dict(
        name=k,
        type=(
            "bool" if isinstance(v, bool) else "int" if isinstance(v, int) else "string"
        ),
        value=v,
    )


spawns = []


def point(name, typ, x, y, **props):
    spawns.append(
        dict(
            id=nid(),
            name=name,
            type=typ,
            x=float(x),
            y=float(y),
            point=True,
            width=0,
            height=0,
            rotation=0,
            visible=True,
            properties=[typed(k, v) for k, v in props.items()],
        )
    )


point("player", "player", 240, 90)
point("black_ship", "ship", 15 * TS, 7 * TS, dialog="ship")
# giants stand on land, a little back from the edge; `delay` staggers their first throw (ms)
GIANTS = [
    (2.2, 6, 0),
    (27.6, 5, 900),
    (17.5, 15.5, 400),
    (2.5, 22.5, 1300),
    (25, 26, 200),
    (5.5, 32, 700),
    (20.5, 34.5, 1100),
    (26.5, 14, 1600),
]
for i, (gx, gy, delay) in enumerate(GIANTS):
    x, y = int(gx * TS), int(gy * TS)
    assert land[
        min(PH - 1, y), min(PW - 1, x)
    ], f"giant {i} at {gx},{gy} is not on land"
    point(
        f"giant_{i}", "thrower", x, y, delay=delay
    )  # not 'giant': that type is Archery's sleeping giant

# ------------------------------------------------------------------ write Tiled JSON
water_im = Image.open(WATER_PNG)
WATER_COUNT = water_im.width // TS
FIRST_WATER, FIRST_HARBOR = 1, 1 + WATER_COUNT
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
        data=[FIRST_WATER] * (W * H),
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
        data=[int(FIRST_HARBOR + v - 1) if v else 0 for v in g1.ravel()],
    ),
    dict(
        id=3,
        name="Objects",
        type="objectgroup",
        draworder="index",
        opacity=1,
        visible=True,
        x=0,
        y=0,
        objects=[],
    ),
    dict(
        id=4,
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
                type="water",
                x=x,
                y=y,
                width=w,
                height=h,
                rotation=0,
                visible=True,
            )
            for x, y, w, h in water_rects
        ],
    ),
    dict(
        id=5,
        name="Spawns",
        type="objectgroup",
        opacity=1,
        visible=False,
        x=0,
        y=0,
        objects=spawns,
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
    nextlayerid=6,
    nextobjectid=oid[0] + 1,
    properties=[typed("harbor", True), typed("returnTo", "homer")],
    tilesets=[
        dict(
            firstgid=FIRST_WATER,
            name="water",
            image="../tilesets/water.png",
            imagewidth=water_im.width,
            imageheight=water_im.height,
            tilewidth=TS,
            tileheight=TS,
            columns=WATER_COUNT,
            tilecount=WATER_COUNT,
            margin=0,
            spacing=0,
        ),
        dict(
            firstgid=FIRST_HARBOR,
            name="harbor",
            image="../tilesets/harbor.png",
            imagewidth=COLS * TS,
            imageheight=rows * TS,
            tilewidth=TS,
            tileheight=TS,
            columns=COLS,
            tilecount=len(tiles),
            margin=0,
            spacing=0,
        ),
    ],
    layers=layers,
)
json.dump(tmj, open(OUT_MAP, "w"))

# ------------------------------------------------------------------ preview
os.makedirs("cache", exist_ok=True)
wt = np.asarray(water_im.convert("RGBA"))[:, :TS]
pv = Image.fromarray(np.tile(wt, (H, W, 1)))
pv.alpha_composite(Image.fromarray(img))
pv.resize((PW, PH)).save("cache/harbor_render.png")
print(
    f"harbor: {W}x{H} tiles, {len(tiles)} land tiles, {len(water_rects)} water rects, {len(GIANTS)} giants"
)
