"""Replace the six village houses with Viking longhouses, drawn pixel by pixel in code (like tools/make_ship.py).

Run after patch_map.py (npm run map:build does build -> patch -> viking -> verify). For each house it:
  - removes the house's tile objects and the patch pixels that belonged to it,
  - draws a longhouse that fits the old house's footprint, with the door in exactly the same spot,
  - slices the drawing into 16x16 tiles (public/assets/tilesets/viking.png) and places them as house objects
    with the old house's sortY, so depth sorting, door triggers and collision all stay as they were,
  - repaints public/assets/tilesets/door.png (the door-open animation) as the Viking door,
  - records the house areas in the map property `customArt`, which verify_map.py leaves out of the
    pixel comparison with the reference.

Each house keeps its colour so the team plan's names still work: rust-red shingles, slate-blue shingles,
and grass turf roofs for the green houses.
"""
import json, math
import numpy as np
from PIL import Image

MAP = 'public/assets/maps/village.json'
SHEET = 'public/assets/tilesets/viking.png'
DOOR_SHEET = 'public/assets/tilesets/door.png'
TS, COLS = 16, 16
GID_MASK = 0x1FFFFFFF

def rgb(h, a=255):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)

C = {k: rgb(v) for k, v in dict(
    outline='#3a3a50',
    plank='#8b5a33', plank2='#7a4e2d', seam='#5a3a22', beam='#a06a3a', beamHi='#c08850', eaveShadow='#4a3020',
    post='#5e3d24', postHi='#7a5230', sill='#6a4528',
    door='#6a4224', door2='#5a3820', band='#585868', bandHi='#80808e', ring='#d0d0d8', doorway='#1a1418',
    stone='#8a8a96', stoneHi='#a8a8b2', stoneLo='#6a6a78', step='#9a9aa4', stepHi='#b8b8c0',
    board='#a8743c', boardHi='#c8955a', boardLo='#7a5028',
    boss='#e0b05a', rim='#a8743c', shieldW='#efe6d2',
    dirt='#6b4a2e', dirtLo='#4e3420',
).items()}
ROOFS = {
    'red':   dict(base='#a8432f', hi='#c8553a', lo='#7a2e22', shield='#c8372d', turf=False),
    'blue':  dict(base='#4f6f94', hi='#6a8db4', lo='#3a5070', shield='#3d6fb5', turf=False),
    'green': dict(base='#5c8f3a', hi='#78ad4a', lo='#406a2a', shield='#4f8a3a', turf=True),
}
COLOUR = {'house_0': 'red', 'house_1': 'blue', 'house_2': 'green', 'house_3': 'red', 'house_4': 'blue', 'house_5': 'green'}


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), np.uint8)

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = c if len(c) == 4 else (*c, 255)

    def rect(self, x0, y0, x1, y1, c):  # inclusive
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.px(x, y, c)

    def line(self, x0, y0, x1, y1, c, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n):
            t = i / max(1, n - 1)
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for dx in range(w):
                self.px(x + dx, y, c)

    def outline(self, c):
        solid = self.a[..., 3] > 0
        pad = np.pad(solid, 1)
        near = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
        ring = near & ~solid
        self.a[ring] = c


def draw_door(frame):
    """16x16 door tile; frame 0 closed, frames 1-3 swing open (dark doorway grows from the hinge side)."""
    cv = Canvas(TS, TS)
    x0, x1, y0, y1 = 3, 12, 2, 15
    cv.rect(x0 - 1, y0 - 1, x1 + 1, y1, C['seam'])                    # frame
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            if y == y0 and x in (x0, x1):
                continue                                            # rounded top corners
            cv.px(x, y, C['door'] if (x - x0) % 3 else C['door2'])
    for by in (y0 + 3, y1 - 3):                                     # iron bands
        cv.line(x0, by, x1, by, C['band'])
        cv.px(x0 + 1, by, C['bandHi'])
    cv.px(x1 - 2, (y0 + y1) // 2, C['ring']); cv.px(x1 - 2, (y0 + y1) // 2 + 1, C['bandHi'])
    if frame:
        open_w = [0, 3, 6, 10][frame]
        cv.rect(x0, y0, x0 + open_w - 1, y1, C['doorway'])
        if open_w < 10:
            cv.line(x0 + open_w, y0, x0 + open_w, y1, C['boardLo'])   # edge of the swinging door
    return cv.a


def draw_shield(cv, cx, cy, colour):
    col = rgb(colour)
    for y in range(-4, 5):
        for x in range(-4, 5):
            d = math.hypot(x, y)
            if d <= 4.2:
                if d > 3.3:
                    c = C['rim']
                elif (x >= 0) == (y >= 0):
                    c = col
                else:
                    c = C['shieldW']
                cv.px(cx + x, cy + y, c)
    cv.rect(cx - 1, cy - 1, cx, cy, C['boss'])


def draw_house(w, h, wall_top, base, door_x, colour, top_cut):
    """Longhouse in a w x h canvas. wall_top/base: y of the wall top and the door sill. door_x: door tile left."""
    roof = {k: (rgb(v) if isinstance(v, str) else v) for k, v in ROOFS[colour].items()}
    cv = Canvas(w, h)
    wl, wr = 2, w - 3                                    # wall extent
    # ---- walls: vertical planks between corner posts
    for x in range(wl, wr + 1):
        for y in range(wall_top, base + 1):
            k = (x - wl) % 3
            cv.px(x, y, C['seam'] if k == 0 else (C['plank'] if (x // 3) % 2 else C['plank2']))
    for px_ in (wl, wl + 1, wr - 1, wr):
        cv.line(px_, wall_top, px_, base, C['post'])
    cv.line(wl + 1, wall_top, wl + 1, base, C['postHi'])
    cv.line(wl, wall_top + 2, wr, wall_top + 2, C['beam']); cv.line(wl, wall_top + 3, wr, wall_top + 3, C['beamHi'])
    cv.line(wl, base, wr, base, C['sill'])
    # ---- shields on the wall, either side of the door
    door_cx = door_x + 8
    shield_y = wall_top + 9
    for sx in ((wl + door_x) // 2 + 1, (door_x + 16 + wr) // 2):
        if abs(sx - door_cx) >= 11 and wl + 5 <= sx <= wr - 5:
            draw_shield(cv, sx, shield_y, ROOFS[colour]['shield'])
    # ---- door (same art as frame 0 of the door-open animation)
    d = draw_door(0)
    m = d[..., 3] > 0
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        cv.px(door_x + x, base - 15 + y, tuple(d[y, x]))
    # ---- roof: eaves overhang the walls, ridge sags a little in the middle like a ship's keel
    eave = wall_top + 2
    ridge_mid = top_cut + 6
    span = eave - ridge_mid
    inset = max(4, int(span * 0.32))
    for y in range(ridge_mid, eave + 1):
        t = (y - ridge_mid) / max(1, span)
        xl = round(inset * (1 - t)); xr = w - 1 - round(inset * (1 - t))
        for x in range(xl, xr + 1):
            u = (x - w / 2) / (w / 2)
            sag = round(2 * (1 - u * u))           # ridge line is lower in the middle
            if y < ridge_mid + sag - 2:
                continue
            row = (y - ridge_mid) % 4
            if roof['turf']:
                n = (x * 7 + y * 13) % 11
                c = roof['hi'] if n == 0 else roof['lo'] if n in (3, 8) else roof['base']
                if y >= eave - 1:
                    c = C['dirt'] if y == eave - 1 else C['dirtLo']
            else:
                c = roof['base']
                if row == 3:
                    c = roof['lo']                  # bottom of a shingle course
                elif row == 0 and (x + (y // 4) * 2) % 4 == 0:
                    c = roof['lo']                  # shingle joints, staggered per course
                elif row == 1:
                    c = roof['hi']
                if y == eave:
                    c = roof['lo']
            cv.px(x, y, c)
    if roof['turf']:                                # grass tufts hanging over the eave
        for x in range(1, w - 1, 3):
            cv.px(x, eave + 1, roof['base']); cv.px(x + 1, eave + 1 + (x % 2), roof['lo'])
    # ridge beam
    for x in range(inset, w - inset):
        u = (x - w / 2) / (w / 2)
        y = ridge_mid + round(2 * (1 - u * u)) - 2
        cv.px(x, y, C['boardLo']); cv.px(x, y - 1, C['board']); cv.px(x, y - 2, C['boardHi'])
    # crossed gable boards with dragon heads at both ends of the ridge
    for end, sgn in ((inset, -1), (w - 1 - inset, 1)):
        y = ridge_mid - 2
        cv.line(end - 3 * sgn, y + 3, end + 3 * sgn, y - 5, C['board'], 1)
        cv.line(end + 3 * sgn, y + 3, end - 3 * sgn, y - 5, C['board'], 1)
        for hx, hy in ((end + 3 * sgn, y - 5), (end - 3 * sgn, y - 5)):   # dragon heads curl outward
            out = sgn if hx * sgn > end * sgn else -sgn
            cv.px(hx, hy - 1, C['boardHi']); cv.px(hx + out, hy - 1, C['board']); cv.px(hx + 2 * out, hy, C['boardLo'])
    # shadow of the eave on the wall
    cv.line(wl, eave + 1, wr, eave + 1, C['eaveShadow']) if not roof['turf'] else None
    # ---- stone foundation and front steps
    for x in range(wl - 1, wr + 2):
        for y in (base + 1, base + 2):
            k = (x + (3 if y == base + 2 else 0)) % 6
            cv.px(x, y, C['stoneLo'] if k == 0 else (C['stoneHi'] if y == base + 1 else C['stone']))
    for y in range(base + 3, min(h, base + 7)):
        for x in range(door_x, door_x + 16):
            cv.px(x, y, C['stepHi'] if y == base + 3 else (C['stoneLo'] if (x + y) % 5 == 0 else C['step']))
    cv.outline(C['outline'])
    return cv.a


def prop(o, k, d=None):
    for p in o.get('properties', []):
        if p['name'] == k:
            return p['value']
    return d


if __name__ == '__main__':
    m = json.load(open(MAP))
    L = {l['name']: l for l in m['layers']}
    objs = L['Objects']['objects']
    doors = [o for o in L['Spawns']['objects'] if o['type'] == 'door']
    houses = [o for o in objs if o['type'] == 'house']

    # cluster house tiles: same sortY and touching
    clusters = []
    for o in houses:
        x, y = o['x'], o['y'] - TS
        for c in clusters:
            if c['sortY'] == prop(o, 'sortY') and c['x0'] - TS <= x <= c['x1'] and c['y0'] - TS <= y <= c['y1']:
                c['tiles'].append(o); c['x0'] = min(c['x0'], x); c['y0'] = min(c['y0'], y)
                c['x1'] = max(c['x1'], x + TS); c['y1'] = max(c['y1'], y + TS)
                break
        else:
            clusters.append(dict(sortY=prop(o, 'sortY'), tiles=[o], x0=x, y0=y, x1=x + TS, y1=y + TS))
    for _ in range(3):                                 # merge clusters that grew into each other
        merged = []
        for c in clusters:
            for d in merged:
                if d['sortY'] == c['sortY'] and c['x0'] <= d['x1'] and d['x0'] <= c['x1'] and c['y0'] <= d['y1'] and d['y0'] <= c['y1']:
                    d['tiles'] += c['tiles']
                    for k, f in (('x0', min), ('y0', min), ('x1', max), ('y1', max)):
                        d[k] = f(d[k], c[k])
                    break
            else:
                merged.append(c)
        clusters = merged

    # tight pixel extent of each old house
    sheets = {}
    for ts in m['tilesets']:
        sheets[ts['name']] = (ts['firstgid'], ts['columns'], np.asarray(Image.open('public/assets/maps/' + ts['image']).convert('RGBA')))
    def alpha_of(gid):
        for name, (fg, cols, img) in sorted(sheets.items(), key=lambda s: -s[1][0]):
            if gid >= fg:
                lid = gid - fg
                return img[(lid // cols) * TS:(lid // cols + 1) * TS, (lid % cols) * TS:(lid % cols + 1) * TS, 3] > 127
    tiles_out, index = [], {}
    def tile_id(t):
        k = t.tobytes()
        if k not in index:
            index[k] = len(tiles_out); tiles_out.append(t)
        return index[k]

    remove = set()
    new_objs, custom, zones = [], [], []
    next_id = m['nextobjectid']
    for c in clusters:
        door = next(d for d in doors if c['x0'] <= d['x'] + 8 <= c['x1'] and c['y0'] <= d['y'] + 8 <= c['y1'])
        name = prop(door, 'house')
        xs, ys = [], []
        for o in c['tiles']:
            a = alpha_of(o['gid'] & GID_MASK)
            yy, xx = np.nonzero(a)
            if len(yy):
                xs += [o['x'] + xx.min(), o['x'] + xx.max()]; ys += [o['y'] - TS + yy.min(), o['y'] - TS + yy.max()]
            remove.add(o['id'])
        tx0, tx1, ty0, ty1 = int(min(xs)), int(max(xs)), int(min(ys)), int(max(ys))
        base = int(door['y']) + 15
        ty1 = max(ty1, base + 6)   # always room for the sill, foundation and steps below the door
        # canvas aligned to the tile grid
        gx0, gy0 = (tx0 // TS) * TS, (ty0 // TS) * TS
        gx1, gy1 = -(-(tx1 + 1) // TS) * TS, -(-(ty1 + 1) // TS) * TS
        top_cut = 0 if ty0 <= 0 else ty0 - gy0
        cvw = tx1 - tx0 + 1
        wall_h = max(20, round((base - ty0) * 0.42))   # tall houses get taller walls, not just a taller roof
        art = draw_house(cvw, ty1 - gy0 + 1, base - wall_h - gy0, base - gy0, int(door['x']) - tx0, COLOUR[name], top_cut)
        canvas = np.zeros((gy1 - gy0, gx1 - gx0, 4), np.uint8)
        canvas[:art.shape[0], tx0 - gx0:tx0 - gx0 + cvw] = art
        zmax = max(prop(o, 'z', 0) for o in c['tiles'])
        for ty in range(0, canvas.shape[0], TS):
            for tx in range(0, canvas.shape[1], TS):
                t = canvas[ty:ty + TS, tx:tx + TS]
                if not t[..., 3].any():
                    continue
                new_objs.append(dict(tid=tile_id(t.copy()), x=gx0 + tx, y=gy0 + ty + TS, sortY=c['sortY'], z=zmax))
        custom.append([tx0 - 2, max(0, ty0 - 2), tx1 + 3, ty1 + 3])
        zones.append((tx0, ty0, tx1 + 1, ty1 + 1))
        # pieces of the old roof that the reconstruction filed under another category (same depth, above the sill)
        for o in objs:
            if (o['type'] != 'house' and not prop(o, 'patch') and prop(o, 'sortY') == c['sortY'] and o['y'] <= base - 8
                    and o['x'] < tx1 and o['x'] + TS > tx0 and o['y'] - TS < ty1 and o['y'] > ty0):
                remove.add(o['id'])
        print(f'{name}: {COLOUR[name]:5s} longhouse {cvw}x{ty1 - ty0 + 1}px at ({tx0},{ty0}), door ({door["x"]:.0f},{door["y"]:.0f})')

    # patch pixels inside an old house outline were copies of the old house: cut them out.
    # Trimmed tiles move into viking.png (pending gids are resolved once its firstgid is known).
    pfg, pcols, pimg = sheets['patch']
    def trimmed(gid, left, top):
        lid = (gid & GID_MASK) - pfg
        t = pimg[(lid // pcols) * TS:(lid // pcols + 1) * TS, (lid % pcols) * TS:(lid % pcols + 1) * TS].copy()
        hit = False
        for x0, y0, x1, y1 in zones:
            ax0, ay0, ax1, ay1 = max(x0, left), max(y0, top), min(x1, left + TS), min(y1, top + TS)
            if ax0 < ax1 and ay0 < ay1:
                t[ay0 - top:ay1 - top, ax0 - left:ax1 - left] = 0; hit = True
        if not hit:
            return None
        return 'empty' if not t[..., 3].any() else ('pending', tile_id(t))
    pending = []
    for o in objs:
        if prop(o, 'patch') and o['id'] not in remove:
            r = trimmed(o['gid'], int(o['x']), int(o['y']) - TS)
            if r == 'empty':
                remove.add(o['id'])
            elif r:
                pending.append((o, 'gid', r[1]))
    g3 = L.get('Ground3')
    if g3:
        W = m['width']
        for i, g in enumerate(g3['data']):
            if g:
                r = trimmed(g, (i % W) * TS, (i // W) * TS)
                if r == 'empty':
                    g3['data'][i] = 0
                elif r:
                    pending.append((g3['data'], i, r[1]))

    rows = (len(tiles_out) + COLS - 1) // COLS
    sheet = np.zeros((rows * TS, COLS * TS, 4), np.uint8)
    for i, t in enumerate(tiles_out):
        sheet[(i // COLS) * TS:(i // COLS + 1) * TS, (i % COLS) * TS:(i % COLS + 1) * TS] = t
    Image.fromarray(sheet).save(SHEET)
    m['tilesets'] = [t for t in m['tilesets'] if t['name'] != 'viking']
    first = max(t['firstgid'] + t['tilecount'] for t in m['tilesets'])
    m['tilesets'].append(dict(firstgid=first, name='viking', image='../tilesets/viking.png', imagewidth=COLS * TS,
                              imageheight=rows * TS, tilewidth=TS, tileheight=TS, columns=COLS, tilecount=len(tiles_out),
                              margin=0, spacing=0))
    for holder, key, tid in pending:
        holder[key] = first + tid
    L['Objects']['objects'] = [o for o in objs if o['id'] not in remove]
    for n in new_objs:
        L['Objects']['objects'].append(dict(
            id=next_id, gid=first + n['tid'], x=n['x'], y=n['y'], width=TS, height=TS, rotation=0, visible=True,
            name='', type='house', properties=[dict(name='sortY', type='int', value=n['sortY']),
                                               dict(name='z', type='int', value=n['z'])]))
        next_id += 1
    m['nextobjectid'] = next_id
    m.setdefault('properties', [])
    m['properties'] = [p for p in m['properties'] if p['name'] != 'customArt']
    m['properties'].append(dict(name='customArt', type='string', value=json.dumps(custom)))
    json.dump(m, open(MAP, 'w'))

    # door-open animation in the same style
    Image.fromarray(np.concatenate([draw_door(f) for f in range(4)], axis=1)).save(DOOR_SHEET)
    print(f'viking: {len(new_objs)} tiles placed ({len(tiles_out)} unique), {len(remove)} old house/patch objects removed')
