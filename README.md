# Island Warrior

A top-down village map rebuilt tile-for-tile from `reference/village.png`, using the Serene Village 16×16 tileset. Built with Phaser 3, Vite and TypeScript.

## Run

```
npm install
npm run dev        # http://localhost:5173
```

| Key | Action |
|---|---|
| WASD / Arrows | Move |
| E / Space / Enter | Talk to an NPC, read a sign, advance dialog |
| Walk up into a house door | Goes down into the Fungus Cave. Every house leads there. |
| Walk up into the cave ladder | Climbs back out through the door you came in by |
| C | Change the player's skin: Adam → Zeus → Hermes → Hades → Heracles → Aphrodite |
| M | Toggle whole-map overview |
| F1 | Debug overlay: collision rectangles, door triggers, NPC wander areas, physics bodies |

On touch devices, an on-screen D-pad and an action button appear.

## How the map was built

The reference is an exact 2× upscale of 16px art, which works out to a 44×25 tile grid. The map was rebuilt from it with a two-pass process:

1. **`tools/reconstruct.py`**: matches each 16px cell to a stack of grid-aligned terrain tiles. It then slides every object tile over the image at all pixel offsets, including rotated and flipped bridge pieces, and greedily places the tiles that explain the remaining pixels. Draw order is recovered from how the tiles overlap. Writes `cache/recon.json`.
2. **`tools/build_map.py`**: turns that into the Tiled map at `public/assets/maps/village.json`:
   - `Ground0..2`: terrain tile layers. Open water uses the animated `water` tileset.
   - `Objects`: free-placed tile objects. Each has `sortY` (its depth-sort baseline) and `z` (its draw order in the reference).
   - `Collision`: rectangles for the water mask, tree trunks, house walls, fences and cliffs, and rocks, bushes and props.
   - `Spawns`: the player, NPCs (`sprite`, `dialog`, `wander` properties), doors and signs.
3. **`tools/verify_map.py`**: re-renders `village.json` the same way the game does and diffs it against the reference. Current result: **95.7% pixel-identical**, not counting the open water, which animates in-game instead of matching the static waves. Outputs go to `cache/verify_*.png`.

```
npm run map        # full rebuild (about 3 min): reconstruct, build, verify
npm run map:build  # rebuild Tiled JSON + collision only
npm run compare    # verify only
npm run map:cave   # rebuild the cave map
npm run smoke      # headless test: walk, collide, talk, house -> cave -> back (needs `npm run dev` running and Chrome)
```

`tools/sheet_ids.py <sheet.png> <out.png> <scale> <rowFrom> <rowTo>` renders part of a tileset with tile IDs printed on it, which helps when editing the category tables in `build_map.py`.

## Editing

- **Map:** open `public/assets/maps/village.json` in Tiled. The game reads object `x`/`y`/`rotation`/flip flags the same way Tiled does. Re-running `build_map.py` overwrites manual edits, so rename the file if you hand-edit it.
- **Collision rules:** edit the tile category tables (`TREES`, `HOUSES`, `WALLS`, `FLAT`, …) in `tools/build_map.py`.
- **Dialog:** edit `src/data/dialog.ts`.
- **Characters:** Adam, Alex, Amelia and Bob come from LimeZu's *Modern Interiors* free pack, extracted to `vendor/modern_interiors_free/`. `npm run characters` runs `tools/import_characters.py`, which packs each one's run and idle strips into `public/assets/sprites/<key>.png` (16×32 frames; row 0 is run, row 1 is idle; directions in the order right/up/left/down, 6 frames each). It also makes hue-shifted variants (`alex_alt`, `amelia_alt`) so NPCs don't look identical. To choose who plays whom, change the `sprite` values in `SPAWNS` in `tools/build_map.py`, then run `npm run map:build`.
  - **Greek god skins:** `tools/greek_skins.py` (run as part of `npm run characters`) repaints the LimeZu sheets into `zeus` (from Bob: white beard, laurel wreath, toga with a gold sash), `hermes` (from Alex: winged helmet and sandals, blue tunic), `hades` (from Alex: pale skin, flame-tipped crown, glowing eyes, black robe), `heracles` (from Adam: lion pelt with ears, tan skin, leather tunic, bronze arm bands) and `aphrodite` (from Amelia: golden hair with a rose, pink dress, pearls). The village NPCs wear them, and the player can switch skins with C (the choice carries over to the cave). Colors and accessories are in the `GODS` table and the accessory functions; `cache/greek_preview.png` shows the result.
  - ⚠️ **The free-version license allows non-commercial use only.** For a commercial release, buy the full Modern Interiors pack.

## The Fungus Cave

`tools/build_cave.py` writes `public/assets/maps/cave.json` using the tileset in `Fungus Cave [16x16]/` (copied to `public/assets/tilesets/cave.png`). Run it with `npm run map:cave`. The layout is defined in code, so edit the script to change it:

- **Room:** the tileset's 6×6 room template (tiles 0–47), autotiled to 30×20 with wall accents (lanterns, mushroom walls, cracks, a tunnel arch).
- **Chasms (`PITS`):** 2-row pits (tiles 67–69 over 75–77) or 1-row cracks (83–85). They stretch horizontally only.
- **Props (`STAMPS`):** the Fungus King statue, mushrooms, chests, the refugee camp, barrels, tools and rubble. Each is a `solid` or `flat` tile object; solid props get collision automatically.
- **Spawns:** the player entry under the ladder, the ladder `exit` (`target=village`), two chests, and NPCs using the pack's own characters (Fungus King, fungi, cleric, refugees).

The map has a `dark` property, which adds a vignette overlay.

## How scenes connect

`src/scenes/MapScene.ts` is one generic scene, created once per map (`new MapScene('village')`, `new MapScene('cave')` in `src/main.ts`). Any Spawns object of type `door` or `exit` with a `target` property sends the player to that scene. The game remembers which house you entered, so the cave exit puts you back outside that door. Opened chests are remembered for the rest of the session.

To add another map, write a Tiled JSON using the same layer names, add it to `MAPS` (and any new tileset to `TILESETS`) in `src/scenes/PreloadScene.ts`, and add `new MapScene('<name>')` in `main.ts`.

Cave characters use RPG Maker layout (3×4 frames of 16×32). `CHARACTER_SHEETS` in `src/entities/Character.ts` records which layout each sheet uses.

## Known gaps

- The reference water's wave pattern isn't a repeating tile, so the game uses the pack's animated water instead.
- About 4% of non-water pixels differ, mostly where tree canopies overlap in the dense forests. Trees partly hidden by other trees get approximate trunk collision.
- Every house leads to the same cave. To give a house its own destination, set that door's `target` property (in `build_map.py` or in Tiled) to another map's scene key.
