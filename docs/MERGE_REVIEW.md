# Latest map integration review

## Night-storm update (2026-11-15)

The working tree was clean at `150cead`. Fetched `origin/main` at `388804e`, which contains the team's merged story pull request, and fast-forwarded to it. Reviewed `origin/map` through `6d60652`: three commits adding night/day controls, weather effects, villagers indoors and extinguished campfires. The intermediate torch was removed by the final incoming commit and remains removed.

Four formatting/content conflicts (`index.html`, `MapScene.ts`, `PreloadScene.ts`, `ui.ts`) were resolved by normalizing the three merge inputs to the existing indentation before merging them. Existing voyage hooks, input guards, narration and challenge rewards remain intact.

Review fixes: cancel scheduled lightning callbacks before destroying their graphics; release weather resources on scene shutdown; reject weather toggles during dialogue, story playback and challenge cinematics; reject interaction with villagers whose bodies are already disabled during their fade indoors. The original weather visuals and night persistence remain intact. `npm run smoke:weather` exercises these behaviors, including a toggle during lightning, cave exclusion and scene restarts. Challenge and story regression tests cover the existing episodes.

## Previous challenge integration

## Source and conflict resolution

Merged `origin/map` at `49409b1` into `feat/chert-tiger-vultr`. Local narration work was saved first in checkpoint `c43e635`. No remote push was performed.

The merge had 12 content conflicts: `index.html`, `src/data/dialog.ts`, `src/entities/Character.ts`, `src/entities/Ship.ts`, `src/main.ts`, `src/scenes/MapScene.ts`, `src/scenes/PreloadScene.ts`, `src/ui.ts`, `tools/build_dungeon.py`, `tools/build_map.py`, `tools/greek_skins.py`, and `tools/smoke.mjs`.

Resolution began with the incoming versions, preserving the homepage, combat, statues, archery puzzle, harbor attack, victory banners, automatic boat returns and first-win prizes. Small story event hooks and the existing popup adapter were then applied to those methods. The busy guard includes challenge cutscenes so narration cannot pause a victory timer. Python files were indented with Black; their syntax trees match the incoming scripts.

## Story additions

Three Odyssey-inspired episodes follow the implemented challenges: Circe’s captivity and moly, Polyphemus’s cave and axe-ring shot, and the Laestrygonian harbor escape. Arrival, actual bow pickup, confirmed wins and failures generate deduplicated story cues. The gameplay code alone grants prizes. Fifteen new ElevenLabs clips are cached alongside the previous voyage audio. No extra live AI service is needed.

## Validation

`npm run build`, `npm run api:check`, `npm run test:integrations`, `npm run smoke:story`, `npm run smoke:challenges`, `npm run smoke:narration`, `npm run smoke:integrations` and formatting checks cover the combined work. The optional Tiger Data database persistence test needs a dedicated test database; it is skipped without one. Live Chert calls, production hosting and remote database connectivity remain separate configuration-dependent checks.
