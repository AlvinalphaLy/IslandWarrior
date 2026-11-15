# The long way home

Open the game at `/` and select **Begin your Odyssey**. Finishing the opening starts a seven-chapter homecoming, told through original dialogue inspired by Homer's Odyssey rather than a movie transcript.

1. Speak to Kai by the shore: recover your purpose after Troy.
2. Speak to Mira: resist the lotus promise of forgetting home.
3. Enter a house leading to the cave and speak to the Fungus King: recall Circe's enchantment.
4. Speak to Sister Ada in the same cave: listen to those who never returned.
5. Enter the sewer dungeon through `house_5`, the lower/right dungeon entrance, and defeat the existing guardian: recall the Cyclops and the name Nobody.
6. Return to Wren in the village: leave the Sirens' promise behind.
7. Speak to Old Tobin: finish the homecoming story.

The current maps, NPCs and existing guardian stage the journey. New Cyclops/Siren art, new islands and a literal voyage or Ithaca palace scene are not implemented. Battle damage, rewards, controls and map layouts are unchanged. The Gumball Golem remains the existing guardian; defeating it unlocks a narrated memory of Polyphemus.

The objective widget updates after each completed episode. Its journal replays finished chapters without giving rewards or advancing objectives. E/Space reveals a line, then advances; Escape closes without completing a story objective. If the guardian was defeated before the quest, or you cancel its story popup after victory, **Continue guardian chapter** lets you finish the chapter without fighting a removed enemy.

Progress lives in Phaser's registry for this browser session and survives map changes. A page reload resets story progress alongside the game's existing session state. This is not a server save/load feature.

## Integration

`src/story/state.ts` defines the ordered objectives and pure progression rules. `src/story/index.ts` mounts the objective/journal and routes matching events to the narration overlay. `MapScene` calls it for NPC interactions and confirmed victories. Ordinary conversations and chests keep their original behavior. Active narration pauses the map and clears held movement; closing resumes it. `?nostory` disables the widget and story interception for isolated gameplay testing.

The new `journey` narration group contains 16 ElevenLabs-generated clips. Re-generate only edited story lines with `npm run voices -- --only=journey`. Clips reuse the configured narrator and Oracle voices; named villagers use those voices rather than adding new voice IDs.

## Checks

- `npm run test:integrations`: includes ordered quest progression and duplicate-event checks.
- `npm run smoke:story`: exercises opening cancellation, NPC chapters, real battle victory, cancelled-victory recovery, return to village and completion.
- `npm run smoke:narration`: checks controls, mobile layout and generated audio decoding.
