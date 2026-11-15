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
| Walk up into a house door | Red house (left, where you start) → **Telemachus training room** (sewer dungeon). Green fenced house (bottom-right) → **Fungus Cave**. The other four are locked until their dungeons exist. |
| Board the black ship (stand on the beach by it, press E) | Sail it with WASD / arrows: it only moves on open water, turns to face its heading and leaves a wake. Press E near any shore to step off; the ship stays where you left it. Sailing off the south edge of the map is the voyage to the `lair` scene, once `achilles` is in the registry's `unlocks`; until then the crew refuses. Coming home lands you on the beach with the ship back at its mooring. |
| Circe's statue (the islet in the bay) | Sail up beside the islet and press E from the ship, or land and press E facing it. You enter **Circe's grotto** (`circe` map: `npm run map:circe`, a violet variant of the sewer dungeon with sirens, shades and a chest of moly). The ladder brings you back where you came from: at the helm if you came by ship, otherwise beside the statue. |
| Walk up into a ladder | Climbs back out through the door you came in by |
| Win a statue challenge | Crushing Polyphemus (Cyclops den) or beating the Siren (Circe's grotto) hands you that dungeon's hoard and returns you to the ship's helm automatically, however you arrived. The bosses and chests are listed in `CHALLENGES` in `src/scenes/MapScene.ts`. |
| Touch a monster (dungeon) | Starts a battle. **1–4** or the arrow keys + Enter choose Attack / Defend / Potion / Run. |
| C | Change the player's skin: Adam → Zeus → Hermes → Hades → Heracles → Aphrodite |
| M | Toggle whole-map overview |
| F1 | Debug overlay: collision rectangles, door triggers, NPC wander areas, physics bodies |

On touch devices, an on-screen D-pad and an action button appear.

### Asset packs

The game runs from what's in `public/assets/`, which is committed. The original third-party packs are not in the repo: `Serene_Village_revamped_v1.9/`, `Fungus Cave [16x16]/`, `Fantasy Battlers - Free/` and `vendor/modern_interiors_free/`. You only need them to re-run the asset/map scripts in `tools/` (`npm run map`, `map:cave`, `characters`). To do that, download the packs and put them back at those paths in the project root.

## How the map was built

The reference is an exact 2× upscale of 16px art, which works out to a 44×25 tile grid. The map was rebuilt from it with a two-pass process:

1. **`tools/reconstruct.py`**: matches each 16px cell to a stack of grid-aligned terrain tiles. It then slides every object tile over the image at all pixel offsets, including rotated and flipped bridge pieces, and greedily places the tiles that explain the remaining pixels. Draw order is recovered from how the tiles overlap. Writes `cache/recon.json`.
2. **`tools/build_map.py`**: turns that into the Tiled map at `public/assets/maps/village.json`:
   - `Ground0..2`: terrain tile layers. Open water uses the animated `water` tileset.
   - `Objects`: free-placed tile objects. Each has `sortY` (its depth-sort baseline) and `z` (its draw order in the reference).
   - `Collision`: rectangles for the water mask, tree trunks, house walls, fences and cliffs, and rocks, bushes and props.
   - `Spawns`: the player, NPCs (`sprite`, `dialog`, `wander` properties), doors and signs.
3. **`tools/patch_map.py`**: makes the map pixel-exact. Real tileset art covers about 95% of the map. The pixels that still differ (canopy overlaps in the dense forests, and the reference's non-repeating water waves) are copied from the reference into `public/assets/tilesets/patch.png`. Ground pixels go into a `Ground3` tile layer. Pixels on trees, houses and props become patch objects with the same `sortY` as the object they sit on, so depth sorting with characters still works. Water cells are copied whole, so the village shows the reference's static waves instead of the animated water. About 5% of the map's pixels are copied this way.
4. **`tools/viking_houses.py`**: replaces the six houses with Viking longhouses drawn in code: shingled or turf roofs with crossed gable boards, plank walls, shields, iron-banded doors, stone foundations. Each house keeps its colour (rust-red, slate-blue, or a green turf roof), its footprint, its door position, its depth and its collision, so the doors and dungeons work as before. It also repaints the door-open animation (`tilesets/door.png`). Tiles go to `tilesets/viking.png`, and the house areas are saved in the map property `customArt`.
5. **`tools/verify_map.py`**: re-renders `village.json` the same way the game does and diffs it against the reference, leaving out the `customArt` areas. Current result: **99.99% pixel-identical outside the Viking houses**, which cover 7.2% of the map. Outputs go to `cache/verify_*.png`.

```
npm run map        # full rebuild (about 3 min): reconstruct, build, verify
npm run map:build  # rebuild Tiled JSON + collision + patch (skips the slow reconstruction)
npm run compare    # verify only
npm run map:cave   # rebuild the cave map
npm run map:dungeon # rebuild the sewer dungeon
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

## The Sewer Dungeon (Fantasy Battlers)

`tools/build_dungeon.py` writes `public/assets/maps/dungeon.json` from the **Sewers** tileset in the Fungus Cave pack. It's a 32×22 hall with a water channel under the top wall and two canals crossing from opposite sides, so the route zig-zags down to the boss. Spawns of type `enemy` place monsters from `src/data/enemies.ts`.

The **Fantasy Battlers** sprites are copied to `public/assets/battlers/`. Each is used twice: as the monster standing on the map (`src/entities/Enemy.ts`, which chases you within its `aggro` range) and as the battle sprite.

| Enemy | Sprite | HP | ATK | XP |
|---|---|---|---|---|
| Sewer Mole / Pink Mole | 01 / 01b | 12 / 14 | 3 / 4 | 4 / 5 |
| Mole Digger | 02 | 16 | 4 | 6 |
| Wyvernling | 06 | 14 | 5 | 6 |
| Lurker | 04 | 20 | 5 | 8 |
| Mirror Drake (heals) | 05b | 26 | 6 | 10 |
| Candy Kid (heals) | 10 | 18 | 4 | 8 |
| Gold Knight | 07 | 32 | 7 | 14 |
| **Gumball Golem** (boss, no running) | 11 | 70 | 9 | 40 |

**Battles** (`src/scenes/BattleScene.ts`) run on top of the paused map:
- **Commands:** Attack (12% critical hits), Defend (halves the next hit), Potion (+20 HP), Run (65% success; not allowed against the boss).
- **Leveling:** every `level × 20` XP gives a level: +8 max HP, +2 ATK, full heal.
- **Defeat:** you wake up outside the house, fully healed.
- **Memory:** defeated monsters and opened chests stay that way for the session. The Golem's chest gives +3 potions and a full heal.

Your level, HP and potions show in the HUD at the top-right.

The battlers (`03`, `08`, `09` and most `b` recolors) are loaded but not yet placed; add them to `ENEMIES` and to the spawn list in `build_dungeon.py`.

## How scenes connect

`src/scenes/MapScene.ts` is one generic scene, created once per map (`new MapScene('village')`, `new MapScene('cave')` in `src/main.ts`). Any Spawns object of type `door` or `exit` with a `target` property sends the player to that scene. The game remembers which house you entered, so the cave exit puts you back outside that door. Opened chests are remembered for the rest of the session.

To add another map, write a Tiled JSON using the same layer names, add it to `MAPS` (and any new tileset to `TILESETS`) in `src/scenes/PreloadScene.ts`, and add `new MapScene('<name>')` in `main.ts`.

Cave characters use RPG Maker layout (3×4 frames of 16×32). `CHARACTER_SHEETS` in `src/entities/Character.ts` records which layout each sheet uses.

## Known gaps

- The village water is static, copied from the reference. Its wave pattern isn't a repeating tile, so it can't use the pack's animated water and still match. The cave and dungeon are unaffected.
- Trees partly hidden by other trees get approximate trunk collision.
- Door destinations are set in `DOOR_TARGETS` in `tools/build_map.py`; houses not listed are locked. Run `npm run map:build` after changing it.
- Fantasy Battlers is a free sample pack; its README asks you to consider buying the full asset. Check its license before any commercial use.

## Chert, Tiger Data and Vultr integrations

The separate Oracle agent, local API, event harness and deployment configuration are documented in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Gameplay integration is exposed through explicit hooks for the gameplay owner; existing scenes and controls are unchanged.

For the navy-and-bronze voiced story popup, open `/narration-preview.html` while Vite is running. See [docs/NARRATION.md](docs/NARRATION.md) for ElevenLabs generation and scene hooks. Fixed clips play locally; provider keys stay out of the browser.

## Homecoming story

The current story starts when the player boards the black ship. Circe’s island is the first playable stop for supplies, with story cues emitted for the teammate-owned UI. The earlier NPC checklist is retired. See [docs/STORY.md](docs/STORY.md) for the script, triggers and integration contract.

## Code formatting

Use two-space indentation for TypeScript, JavaScript, HTML, CSS and YAML, and four spaces for Python. Important methods include comments explaining intent and lifecycle behavior.

```sh
npm run format
npm run format:check
```

Python scripts use Black (`requirements-dev.txt`): `python3 -m black tools/` and `python3 -m black --check tools/`. Formatter configuration excludes generated maps, assets, lockfiles and private environment files. `.editorconfig` carries the indentation settings into compatible editors.

## Voiced Odyssey story

Board the black ship with **E** to hear the opening story. Visit the Circe, Cyclops and Homer statues to play their island challenges. Story captions and ElevenLabs voices follow actual discoveries, wins and failures. Success narration waits until the victory banner and automatic boat return finish. In the Cyclops den, pick up the bow and press **F** from the chalk mark to shoot.

Keep `npm run dev` running while testing. Use the terminal’s Local URL. **E/Space** reveals a story line and advances it; **Escape** skips the current batch. The speaker control unmutes narration. See [story and integration notes](docs/STORY.md) and [merge review](docs/MERGE_REVIEW.md). Run `npm run smoke:challenges` for all three challenge paths, or `npm run smoke:story` for the boat/Circe narration flow. Existing low-level gameplay smoke uses `?story=off`.
