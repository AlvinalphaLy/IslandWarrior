# Voiced story popups

The approved design is implemented in `src/narration`: a navy/bronze panel, Oracle portrait, typewriter captions, voice status, mute, replay and E/Space/Enter advance. First press reveals the current line and stops its audio; the next press advances. Escape or Close stops audio and closes. A visible button supports touch. Reduced-motion settings show the entire line immediately. Mute persists locally. No clip means text-only fallback; this is not browser speech masquerading as ElevenLabs.

## Preview

```sh
npm run dev
```

Open http://localhost:5173/narration-preview.html and choose a story beat. The preview uses the existing village reference as a backdrop. The game at `/` is unchanged. It also ships in the production build as `/narration-preview.html`.

## Generate real ElevenLabs narration

The UI includes generated ElevenLabs MP3s for the 13 original cards and 16 homecoming story cards. Kalos uses Darian – Warm Grounded Storyteller, successfully generated after the initially suggested Callum ID returned HTTP 404. The saved clips use five distinct voices: narrator, Telemachus, Achilles, Oracle and Kalos. The Spartan introduction is narrated; Spartan and Dragon character dialogue has not been scripted yet. For a sponsor demonstration, use genuine generated clips and keep the provider manifest; a silent UI or synthetic test audio is not proof of using the service. Confirm the event's eligibility rules with organizers.

1. In ElevenLabs, choose voices you have permission to use. Copy their voice IDs and create a text-to-speech API key. Keep the key private.
2. Add these values to root `.env.local` using the names documented in `.env.example`: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_NARRATOR`, `ELEVENLABS_VOICE_ORACLE` and other characters you want to generate. Never use `VITE_` variables for secrets.
3. Preview the work without making provider requests:

```sh
npm run voices -- --dry-run --only=intro
```

4. After reviewing your ElevenLabs credit balance and applicable costs, generate just the first two cards:

```sh
npm run voices -- --only=intro
npm run voices -- --only=oracle
npm run voices -- --only=telemachus
```

Omit `--only` to generate every fixed story beat. Voice mappings for all referenced characters must be set before full generation. Dragon and Spartan mappings are reserved for later character dialogue; their current cards use the narrator. The default model is `eleven_multilingual_v2`, configurable through `ELEVENLABS_MODEL_ID`.

The command sends text server-side to ElevenLabs' documented `POST /v1/text-to-speech/:voice_id` endpoint and stores MP3s under `public/assets/voice/<card-key>.mp3`. `manifest.json` records provider, voice, model and a text/configuration hash. Unchanged clips are reused across invocations. Changing text, voice or model regenerates only affected clips. Failures stop the batch with no automatic paid retry. Keep successfully generated assets and manifest together. Clip generation can consume ElevenLabs credits; normal playback makes no provider requests. Any required account-plan attribution must be included before publishing.

The generation manifest is build provenance; it is not a live runtime credential. No API key is included in it. Generated assets can be committed once reviewed. `.partial` files are temporary incomplete writes and must not be committed.

Reference: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

## Gameplay owner handoff

```ts
import { narrate, closeNarration } from './narration';

// Inside the relevant scene; call during a user interaction to allow browser audio.
this.scene.pause();
narrate('telemachus', { onClose: () => this.scene.resume() });
// On scene disposal or route departure, call closeNarration().
```

Pause/resume must use the correct scene instance from your game's lifecycle. The helper does not change combat state, freeze the player, award items or attach automatic scene triggers. Keyboard commands are intercepted while the overlay is open, but the scene still needs pausing to stop enemy timers and touch controls. Existing `showDialog()` and its scene logic remain untouched to avoid conflicts with the gameplay owner. The overlay remains opt-in for general scenes. The homecoming story now connects matching NPC objectives and guardian victory through the story controller; other NPC interaction logic is unchanged.

Supported beat keys: `intro`, `telemachus`, `spartan`, `achilles`, `kalos`, `oracle`, `sail`, `victory`, `defeat`, `unlock`. Scripts live in `src/data/narration.ts`. The PDF's script drafts are used as editable dialogue rather than verified historical claims. Fixed scripts should match generated audio; regenerate affected cards when editing text.

Custom cards can be shown through `showNarration(cards, options)`; only one overlay/audio track is active. Opening another closes the previous overlay and calls its `onClose`. The seven character voice roles are supported; the Oracle has a generated portrait, while other speakers use an initial/emblem pending teammate art. This milestone covers fixed lines only: no live `/api/tts`, voice cache table, or integration with the FaceTime Oracle has been added.

## Checks

```sh
npm run build
npm run voices -- --dry-run --only=intro
npm run smoke:narration
```

The browser check covers text fallback with missing MP3s, keyboard advance, mute persistence, replay and audio cancellation using a synthetic audio test double, close, desktop and narrow-screen layout. Screenshots go to `/tmp/islandwarrior-narration-desktop.png` and `/tmp/islandwarrior-narration-mobile.png`. Set `CHROME_PATH` if Chrome is not in the default macOS location. The smoke check also decodes all available generated MP3s and starts intro playback in Chrome. Listen in the preview to judge voice quality; automated playback checks do not evaluate pronunciation or acting.
