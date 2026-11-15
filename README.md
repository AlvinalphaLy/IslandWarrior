
# ⚔️ ODYSSEY — Forge Your Legend, Conquer the Myth

> 🌊 **Sail across ancient seas. Explore mythical islands.
> Battle legendary creatures. Write your own Odyssey.**
<p align="center">
  <img src="Game_page.png" alt="ODYSSEY game homepage" width="100%" />
</p>



A browser-based, pixel-art RPG inspired by Greek mythology,
built with Phaser 3, TypeScript, and Vite.

## 🎮 Gameplay at a Glance

- **Explore an island:** Traverse a detailed top-down village, investigate landmarks, talk to NPCs, and discover entrances.
- **Travel by ship:** Board a vessel, navigate open water, and disembark near shorelines.
- **Discover mythological challenges:** Visit Circe's grotto and other dungeon environments, encounter monsters, and pursue rewards.
- **Fight tactical battles:** Choose to attack, defend, use Ambrosia to heal, or attempt to escape. Earn experience, level up, and strengthen your character.
- **Experience a living world:** Switch between day and stormy night, see weather effects, and explore with collision-aware movement.
- **Choose your appearance:** Cycle through character skins themed around Greek gods and heroes.
- **Play with keyboard or touch:** On-screen movement and action controls are available on touch devices.

## 🕹️ Controls

| Input | Action |
| --- | --- |
| `W A S D` / Arrow keys | Move; steer the ship |
| `E` / `Space` / `Enter` | Talk, interact, advance dialogue, board/disembark |
| `F` | Shoot after obtaining the bow |
| `N` | Toggle night storm |
| `C` | Change character skin |
| `M` | Toggle map overview |
| `F1` | Show collision/debug overlay |
| `1`–`4` | Select battle action |
| Arrow keys + `Enter` | Navigate and confirm battle actions |

**Tip:** Walk toward doors to enter accessible buildings and use ladders to return from dungeons. Some areas are locked until their content or unlock conditions are available.

## 🧰 Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Game engine | Phaser 3 | Game scenes, sprites, input, physics, and combat |
| Language | TypeScript | Gameplay logic and entity systems |
| Interface | HTML, CSS | HUD, dialogue, menus, and on-screen controls |
| Development tools | Vite | Development server and production builds |
| Maps and assets | Tiled JSON, pixel-art assets | Island environments, collision layers, and characters |
| Asset tooling | Python | Map and sprite generation utilities |

## 🏗️ Game Architecture

```text
                      ODYSSEY
                         │
                  Browser Game
                Phaser 3 + Vite
                         │
         ┌───────────────┼────────────────┐
         │               │                │
      World Maps      Game Systems      Game UI
         │               │                │
    Island / Sea     Movement & Ship   Health / Items
    NPCs / Doors     Enemies & Combat  Dialogue / Menus
    Dungeons         Quests & Rewards  Touch Controls
```

The game scenes live in `src/scenes/`, entities in `src/entities/`, story and gameplay data in `src/data/` and `src/story/`, and map/asset utilities in `tools/`.

## 🚀 Getting Started

### Requirements

- Node.js and npm
- A modern desktop or mobile browser
- Python only if rebuilding maps or generated assets

### Run the game locally

```bash
git clone <YOUR_REPOSITORY_URL>
cd Odyssey-feat-chert-tiger-vultr
npm ci
npm run dev
```

Open the **Local** URL printed by Vite (normally `http://localhost:5173/`). If that port is already occupied, Vite automatically chooses another available port, such as `5174` or `5175`.

### Production build

```bash
npm run build
npm run preview
```

The build output is placed in `dist/`.

## 🗺️ Worlds and Gameplay Systems

### Island exploration

The main `village` map includes buildings, signs, NPCs, coastlines, bridges, a ship, and interactive landmarks. The map uses layered terrain and objects, depth sorting, and collision geometry.

### Dungeons and encounters

The repository defines scenes for `village`, `cave`, `dungeon`, `circe`, `cyclops`, and `telepylus`. Each area can have its own enemies, hazards, NPCs, and progression conditions. Not every entrance or storyline is necessarily unlocked in the current build.

### RPG combat

Battles run in a separate `BattleScene` over the paused world. Players can attack, defend, consume healing items, or flee when allowed. Combat includes enemy stats, critical hits, experience, leveling, and boss restrictions. Defeated enemies and opened chests are tracked in game state.

### Story and narration

Story data, playback logic, and narration assets are organized separately from scene rendering, making it easier to extend dialogue and narrative sequences. See [`docs/STORY.md`](docs/STORY.md) and [`docs/NARRATION.md`](docs/NARRATION.md).

## 📁 Project Structure

```text
.
├── src/
│   ├── scenes/          # Preload, map, and battle scenes
│   ├── entities/        # Player, enemies, ship, weather, NPCs, archery
│   ├── data/            # Dialogue, enemies, voyage, narration
│   ├── story/           # Story state and playback
│   ├── narration/       # Narration interface
│   ├── main.ts          # Phaser configuration and scene registration
│   └── ui.ts            # HUD, dialogue, battle controls, touch inputs
├── public/              # Runtime game assets and maps
├── tools/               # Map generation, sprites, smoke tests
├── docs/                # Story, narration, integration documentation
├── reference/           # Reference map artwork
├── index.html
└── package.json
```

## 🧪 Useful Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and build the game |
| `npm run map:build` | Rebuild map JSON and associated generated artwork |
| `npm run map:cave` | Rebuild the cave map |
| `npm run map:dungeon` | Rebuild the sewer dungeon |
| `npm run map:circe` | Rebuild Circe's grotto map |
| `npm run characters` | Regenerate character sprites and skins |
| `npm run smoke:story` | Run story smoke tests |
| `npm run smoke:challenges` | Run challenge smoke tests |
| `npm run smoke:weather` | Run weather smoke tests |

**Asset note:** The game uses committed runtime assets in `public/assets/`. Rebuilding certain source maps and sprite sheets requires separately obtaining the original third-party art packs. See the existing asset notes and license terms before redistributing or commercializing the game.

## 💡 Technical Highlights

- Layered tilemap rendering with depth-aware object sorting and physics collisions
- Reconstructed reference map using Python scripts and generated Tiled JSON
- Reusable map scenes and entity classes for expanding the world
- Turn-based combat with persistent encounter state during play
- Ship movement and shore interaction logic
- Story, dialogue, and narration support within the game
- Automated test and smoke-test scripts for core systems

## 🔮 What's Next

Potential future improvements include deeper quest progression, additional boss encounters, expanded sailing destinations, and more story-driven challenges. These are **roadmap ideas**, not claims of completed functionality.

## 📜 Credits and Asset Licensing

Built using Phaser and third-party pixel-art packs, including Serene Village, Fungus Cave, Fantasy Battlers, and LimeZu Modern Interiors artwork. The repository's existing documentation identifies additional attribution and asset-generation details.

**Licensing caution:** The free Modern Interiors assets are documented as **non-commercial use only**. Check the terms of every art pack before distribution or commercial use. No blanket open-source license for the entire project is asserted here.

---

**⚔️ Explore the island. Face the legends. Write your Odyssey.**
