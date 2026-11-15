"""Make public/assets/maps/village.json render pixel-identical to reference/village.png.

Run after build_map.py (npm run map:build does both). The tile reconstruction matches about 96% of the reference
from real tileset art. This pass fills in the rest by copying the reference's own pixels, without breaking depth:

  - Every pixel that still differs is assigned an owner: the object drawn on top of it (a tree, house, fence...),
    or the ground.
  - Ground pixels go into a new tile layer, Ground3, drawn above Ground0..2 and below every object.
  - Object pixels become small "patch" tile objects with the same sortY as their owner and a higher z. They sort
    exactly like the object they fix, so characters still walk in front of and behind trees and houses correctly.
  - Water cells are copied whole. The reference's wave pattern is not a repeating tile, so the map shows the
    reference's static waves instead of the animated water tile.

Writes the patch tiles to public/assets/tilesets/patch.png and reports how much of the map is patched.
Running it again replaces the previous patch.
"""

import json, os
import numpy as np
from PIL import Image

MAP = "public/assets/maps/village.json"
REF = "reference/village.png"
PATCH_PNG = "public/assets/tilesets/patch.png"
H_, V_, D_ = 0x80000000, 0x40000000, 0x20000000
COLS = 32
# villagers painted into the reference image: never copy these pixels (the map shows what the tiles give there)
BAKED_ACTORS = [
    (55, 213, 72, 237),  # kid in a red shirt, in front of the red house (left)
    (143, 30, 162, 54),  # girl at the blue house's door (top)
]

m = json.load(open(MAP))
TS = m["tilewidth"]
W, H = m["width"], m["height"]
RW, RH = W * TS, H * TS

# ---- drop a previous patch so the script is repeatable
old = next((t for t in m["tilesets"] if t["name"] == "patch"), None)
if old:
    m["tilesets"].remove(old)
m["layers"] = [l for l in m["layers"] if l["name"] != "Ground3"]
objects_layer = next(l for l in m["layers"] if l["name"] == "Objects")
objects_layer["objects"] = [
    o
    for o in objects_layer["objects"]
    if not any(p["name"] == "patch" for p in o.get("properties", []))
]

sheets = []
for ts in m["tilesets"]:
    img = np.asarray(Image.open("public/assets/maps/" + ts["image"]).convert("RGBA"))
    sheets.append(
        (ts["firstgid"], ts["columns"], img, ts["name"], ts.get("tilecount", 0))
    )
water_ts = next(s for s in sheets if s[3] == "water")


def tile(gid):
    flags = gid & 0xE0000000
    gid &= 0x1FFFFFFF
    fg, cols, img, _, _ = [s for s in sheets if s[0] <= gid][-1]
    lid = gid - fg
    t = img[
        (lid // cols) * TS : (lid // cols + 1) * TS,
        (lid % cols) * TS : (lid % cols + 1) * TS,
    ]
    if flags & D_:
        t = np.swapaxes(t, 0, 1)
    if flags & H_:
        t = t[:, ::-1]
    if flags & V_:
        t = t[::-1]
    return t


def prop(o, k, d=None):
    for p in o.get("properties", []):
        if p["name"] == k:
            return p["value"]
    return d


# ---- render ground, then objects, remembering which object is on top of every pixel
canvas = np.zeros((RH, RW, 4), np.uint8)


def blit(dst, t, x, y, owner_id=None):
    x0, y0, x1, y1 = max(0, x), max(0, y), min(RW, x + TS), min(RH, y + TS)
    if x0 >= x1 or y0 >= y1:
        return
    sub = t[y0 - y : y1 - y, x0 - x : x1 - x]
    msk = sub[..., 3] > 127
    dst[y0:y1, x0:x1][msk] = sub[msk]
    if owner_id is not None:
        owner[y0:y1, x0:x1][msk] = owner_id
        if prop(objs[owner_id], "sortY", -1) < 0:
            return
        box = boxown[y0:y1, x0:x1]
        box[:] = np.where(order_rank[owner_id] > order_rank_of(box), owner_id, box)


ground = [
    l
    for l in m["layers"]
    if l["type"] == "tilelayer" and l["name"].startswith("Ground")
]
water_cell = np.zeros((H, W), bool)
for l in ground:
    for i, g in enumerate(l["data"]):
        if g:
            blit(canvas, tile(g), (i % W) * TS, (i // W) * TS)
            if water_ts[0] <= (g & 0x1FFFFFFF) < water_ts[0] + water_ts[4]:
                water_cell[i // W, i % W] = True
ground_only = canvas.copy()

objs = sorted(
    objects_layer["objects"], key=lambda o: (prop(o, "sortY", -1), prop(o, "z", 0))
)
order_rank = (
    np.arange(len(objs) + 1) - 1
)  # rank of object k is k; index len(objs) means "none" -> -1
NONE = len(objs)
order_rank[NONE] = -1
order_rank_of = lambda ids: order_rank[ids]
owner = np.full((RH, RW), NONE, np.int32)  # topmost object pixel drawn here
boxown = np.full(
    (RH, RW), NONE, np.int32
)  # topmost upright object whose 16x16 tile box covers this pixel
for k, o in enumerate(objs):
    t = tile(o["gid"])
    x, y, r = int(o["x"]), int(o["y"]), int(o.get("rotation", 0)) % 360
    if r == 0:
        blit(canvas, t, x, y - TS, k)
    elif r == 90:
        blit(canvas, np.rot90(t, -1), x, y, k)
    elif r == 270:
        blit(canvas, np.rot90(t, 1), x - TS, y - TS, k)
    elif r == 180:
        blit(canvas, np.rot90(t, 2), x - TS, y, k)

ref_full = np.asarray(Image.open(REF).convert("RGBA"))
ref = ref_full[::2, ::2].copy()
ref[..., 3] = 255

# areas build_map.py emptied on purpose (clearedAreas: the islet) are rebuilt from tiles there, so never copied
# from the reference (which still shows the tree and flowers)
BAKED_ACTORS = BAKED_ACTORS + [
    tuple(a)
    for a in json.loads(
        next(
            (
                p["value"]
                for p in m.get("properties", [])
                if p["name"] == "clearedAreas"
            ),
            "[]",
        )
    )
]
diff = (canvas[..., :3] != ref[..., :3]).any(-1)
for x0, y0, x1, y1 in BAKED_ACTORS:
    diff[y0:y1, x0:x1] = False


# owner per differing pixel: the object drawn there; else an upright (sortY >= 0) object whose tile box covers it
# (the reference shows more of that object than we draw); else the ground
def upright(k):
    return k != NONE and prop(objs[k], "sortY", -1) >= 0


pix_owner = owner.copy()
use_box = (pix_owner == NONE) & (boxown != NONE)
pix_owner[use_box] = boxown[use_box]
for k in np.unique(pix_owner[use_box]):
    if not upright(k):  # flat objects (paths, rugs) don't claim neighbours
        sel = use_box & (pix_owner == k)
        pix_owner[sel] = NONE

# ---- patch tiles (deduplicated)
tiles, index = [], {}


def tile_id(arr):
    key = arr.tobytes()
    if key not in index:
        index[key] = len(tiles)
        tiles.append(arr.copy())
    return index[key]


ground3 = [0] * (W * H)
new_objs = []
next_id = max(
    m.get("nextobjectid", 1),
    1 + max(o["id"] for l in m["layers"] if "objects" in l for o in l["objects"]),
)
ground_px = object_px = 0
for cy in range(H):
    for cx in range(W):
        ys, xs = slice(cy * TS, cy * TS + TS), slice(cx * TS, cx * TS + TS)
        d, own = diff[ys, xs], pix_owner[ys, xs]
        g_mask = d & (own == NONE)
        if water_cell[cy, cx]:
            # whole cell, opaque: reference wherever the ground shows, our ground under objects (they cover it anyway)
            cell = ground_only[ys, xs].copy()
            show = own == NONE
            for (
                bx0,
                by0,
                bx1,
                by1,
            ) in BAKED_ACTORS:  # inside a baked villager keep our own ground
                show[
                    max(0, by0 - cy * TS) : max(0, by1 - cy * TS),
                    max(0, bx0 - cx * TS) : max(0, bx1 - cx * TS),
                ] = False
            cell[show] = ref[ys, xs][show]
            cell[..., 3] = 255
            ground3[cy * W + cx] = ("ground", tile_id(cell))
            ground_px += int(g_mask.sum())
        elif g_mask.any():
            cell = np.zeros((TS, TS, 4), np.uint8)
            cell[g_mask] = ref[ys, xs][g_mask]
            ground3[cy * W + cx] = ("ground", tile_id(cell))
            ground_px += int(g_mask.sum())
        for k in np.unique(own[d & (own != NONE)]):
            msk = d & (own == k)
            cell = np.zeros((TS, TS, 4), np.uint8)
            cell[msk] = ref[ys, xs][msk]
            o = objs[k]
            new_objs.append(dict(o=o, tid=tile_id(cell), x=cx * TS, y=(cy + 1) * TS))
            object_px += int(msk.sum())

# ---- tileset image + JSON
rows = (len(tiles) + COLS - 1) // COLS
sheet = np.zeros((rows * TS, COLS * TS, 4), np.uint8)
for i, t in enumerate(tiles):
    sheet[
        (i // COLS) * TS : (i // COLS + 1) * TS, (i % COLS) * TS : (i % COLS + 1) * TS
    ] = t
Image.fromarray(sheet).save(PATCH_PNG)
first = max(t["firstgid"] + t["tilecount"] for t in m["tilesets"])
m["tilesets"].append(
    dict(
        firstgid=first,
        name="patch",
        image="../tilesets/patch.png",
        imagewidth=COLS * TS,
        imageheight=rows * TS,
        tilewidth=TS,
        tileheight=TS,
        columns=COLS,
        tilecount=len(tiles),
        margin=0,
        spacing=0,
    )
)
ground3 = [first + v[1] if v else 0 for v in ground3]
gi = max(i for i, l in enumerate(m["layers"]) if l["name"].startswith("Ground"))
m["layers"].insert(
    gi + 1,
    dict(
        id=m["nextlayerid"],
        name="Ground3",
        type="tilelayer",
        width=W,
        height=H,
        x=0,
        y=0,
        opacity=1,
        visible=True,
        data=ground3,
    ),
)
m["nextlayerid"] += 1
zmax = max(prop(o, "z", 0) for o in objects_layer["objects"])
for n in new_objs:
    o = n["o"]
    objects_layer["objects"].append(
        dict(
            id=next_id,
            gid=first + n["tid"],
            x=n["x"],
            y=n["y"],
            width=TS,
            height=TS,
            rotation=0,
            visible=True,
            name="",
            type="",
            properties=[
                dict(name="sortY", type="int", value=prop(o, "sortY", -1)),
                dict(name="z", type="int", value=zmax + 1),
                dict(name="patch", type="bool", value=True),
            ],
        )
    )
    next_id += 1
m["nextobjectid"] = next_id
m.setdefault("properties", [])
m["properties"] = [p for p in m["properties"] if p["name"] != "bakedActors"]
m["properties"].append(
    dict(name="bakedActors", type="string", value=json.dumps(BAKED_ACTORS))
)
json.dump(m, open(MAP, "w"))

total = RW * RH
print(
    f"patch: {len(tiles)} unique tiles, {sum(1 for v in ground3 if v)} ground cells, {len(new_objs)} object patches"
)
print(
    f"pixels taken from the reference: ground {ground_px} + objects {object_px} = "
    f"{(ground_px + object_px) / total * 100:.2f}% of the map ({water_cell.sum()} water cells copied whole)"
)
