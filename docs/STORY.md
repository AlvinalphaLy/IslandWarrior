# The long way home: a boat-first Odyssey

## Story premise

Troy has fallen, but Odysseus has not won his way home. He boards the black ship with a hungry, exhausted crew. Ithaca is the destination; keeping his people alive is the reason to stop at each island. A promising harbor offers something the crew needs, then reveals a danger that tests the captain's judgment.

The repeating story loop is **board → sail → land for a reason → discover a threat → resolve the challenge → return to the crew → depart**. Challenges grow from the reason for landing. Treasure is tempting because it could repair the ship; food matters because someone must row tomorrow. Avoid a sequence of unrelated battles or a narrator who announces every danger before discovery.

This is original dialogue inspired by Homer's Odyssey, not a movie transcript. Aeaea is the first playable stop because the latest map branch already contains Circe's sanctuary. That is an adaptation for this slice, not a claim that Circe is the first island in Homer's poem.

## First island: a feast that forgets your name

**Need:** the water jars are almost empty and the crew needs food. An optional treasure motive points toward bronze markers near the same sanctuary. Food is the default until the UI owner presents a choice.

1. **Boarding.** The player steps aboard. The departure narration establishes Troy behind, Ithaca ahead, and responsibility for the crew. No new title screen or start button is required by this story module.
2. **Landfall.** A green island seems deserted. Water, fruit and a welcoming sanctuary promise relief. The player can land near Circe's statue or approach it from the boat.
3. **Reason to explore.** Food-minded Odysseus orders water before glory. A treasure-minded crew follows bronze objects toward the sanctuary. Both routes converge on the grotto; the choice changes the telling, not the existing game's economy or layout.
4. **The welcome turns.** The sanctuary offers a feast and rest. Scouts stop answering. The real challenge is recognizing comfort as captivity, not simply attacking a woman because she is a witch.
5. **The Oracle's warning.** This is Aeaea. Find moly, the white flower with the dark root, and bring it back before the spell makes the crew forget home. Existing shades and sirens stage the enchanted resistance; victory buys time rather than ending the whole story.
6. **Discovery.** The existing Circe chest holds moly. Its actual potion/healing reward remains controlled by the game. The story records that the herb was recovered; it does not mint extra items or coins.
7. **Return.** Reboarding with the herb breaks the island's hold on the crew. Water and bread are shared. The ship leaves with a lesson: a captain comes back with his people, not only with treasure.

**Ending line:** “One island behind you. A long sea ahead. Remember the cost of a welcome that asks you to forget home. Ithaca is still waiting.”

This completes the first island, not the entire Odyssey. The next destination remains a future episode.

## Character direction

- **Odysseus:** capable and tired, capable of pride, learning to measure success in people brought home.
- **The Oracle:** brief warnings and questions rather than a solution to every puzzle. She names the danger after it is discovered.
- **The crew:** the emotional reason for supplies, risk and retreat. Their safety matters even when the prototype represents it only through dialogue.
- **Circe:** hospitality, power and the temptation to stop struggling. Avoid inventing a defeated-Circe boss when the map does not contain one.
- **Narrator:** describes what changed because the player acted. Keep guidance short enough to preserve exploration.

## Future island outline (not implemented)

| Island / passage | Why land or continue | Challenge | Lesson carried forward |
| --- | --- | --- | --- |
| Lotus shore | Fruit and rest | Remember the crew's purpose instead of staying forever | Comfort can erase duty |
| Cyclops cave | Sheep, cheese, shelter | Outsmart Polyphemus and choose whether pride is worth the risk | A victory can create a worse enemy |
| Aeolus | A safe wind home | Preserve trust around a gift the crew misunderstands | Leadership requires trust |
| The dead | Directions no living sailor knows | Hear hard counsel and remember lost companions | Listen before acting |
| Sirens | A passage that promises knowledge | Prepare before the song begins | Wisdom includes restraint |
| Narrow strait | The only route onward | Choose what can be saved under pressure | Not every danger can be conquered |
| Ithaca | Home | Recognition, loyalty and restoring a household | Returning is more than arriving |

The existing Polyphemus dungeon can support a later Cyclops episode. These rows are narrative direction, not completed maps or features.

## UI-owner handoff

`src/data/voyage.ts` contains the script cards by trigger. `src/story/state.ts` defines pure event progression and objective text. `src/story/index.ts` writes progress to Phaser's `odysseyVoyage` registry key and publishes `voyage-story` on the scene plus `odyssey:story` on `window`.

**The existing voiced popup now consumes these story hooks in the game.** Boarding and island milestones automatically display their queued cards, pause the map and speak the matching ElevenLabs audio. There is no new homepage, journal or choice panel. The former seven-NPC checklist and sidebar are retired. The presentation adapter is isolated in `src/story/playback.ts` so your teammate can replace it.

Every cue contains `{ key, cards, progress, objective }`. A persistent queue in `odysseyStoryQueue` keeps cues from getting lost during a scene transition. The UI should consume the queue once and present its cards in order. Subscribe to the global event as a wake-up signal, rather than displaying both the event payload and queue independently.

```ts
import { publishVoyageEvent, takeVoyageCues } from './story';

// On a rendered story-choice button, before entering the grotto:
publishVoyageEvent(scene, { type: 'choose_reason', reason: 'treasure' });

// After scene/UI readiness, and whenever odyssey:story signals new work:
const cues = takeVoyageCues(scene);
// Your UI queues cues.flatMap(cue => cue.cards) and owns scene pause/resume.
```

The approved `showNarration` component is mounted automatically by the playback adapter. It waits for ordinary dialogue, battles and fades to finish before pausing the map. Its presentation may be replaced by the teammate. Register/unregister the global listener with the UI lifecycle. If a modal is used, pause the appropriate map and clear held input so enemies and ship movement do not continue behind it.

### Actual game hooks

- `MapScene.board`: begins the voyage; reboarding with moly completes this island.
- `MapScene.goAshore`: emits landfall only near Circe's sanctuary, not at the starting dock.
- `MapScene.enterStatue`: records a ship arrival at the Circe destination.
- `MapScene.create` for `circe`: emits challenge/discovery beats after the transition.
- `MapScene.onBattleEnd`: emits first-victory text only after a real win in Circe's grotto.
- Opening `chest_circe`: records moly once. A previously recovered chest reconciles when revisiting, so exploring before boarding does not soft-lock the story.

Repeated boarding, kills, chest interactions and scene callbacks do not duplicate beats. Defeat and retreat do not count as victories. The first food/treasure selection locks once acknowledged. Story progress is session-only, matching the existing registry saves; it is not a backend save/load system.

## Voice production

The new boat-first script is the `voyage` narration group. Old trainer and homecoming clips are preserved as assets but are not used by the new game hooks. All 12 new boat-first clips have been generated with ElevenLabs and are cached locally. The new text does not play an old clip with different words.

```sh
npm run voices -- --dry-run --only=voyage
# Once the team approves the new wording, generation uses ElevenLabs credits:
npm run voices -- --only=voyage
```

If a clip fails to load or playback is blocked, the popup keeps its captions and replay/mute controls. No additional voice accounts are required; the script uses the existing narrator and Oracle roles.

## Checks

`npm run test:integrations` tests voyage order, idempotence, choices and early/out-of-order events. `npm run smoke:story` checks boarding, actual Circe scene entry, a real battle victory, chest recovery and reboarding with visible story cards, audible playback readiness, paused ship movement and queue draining. The upstream gameplay smoke separately checks ship controls, collision, Circe transitions and Greek combat. `npm run build` verifies the combined source.

For manual testing, run `npm run dev`, open `/`, approach the black ship and press E. The first voiced story popup appears after boarding. E/Space reveals a line, then advances; Escape skips the current batch. Use the speaker button if narration was previously muted. `?story=off` disables automatic playback for low-level gameplay smoke tests.
