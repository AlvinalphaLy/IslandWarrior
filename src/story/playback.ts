import type Phaser from 'phaser';
import { showNarration } from '../narration';
import { touch } from '../ui';
import { takeVoyageCues, type VoyageCue } from './index';

interface Playback {
  open: boolean;
  pump: () => void;
}
const players = new WeakMap<Phaser.Scene, Playback>();

/** Prevent new encounters and map actions while a queued story beat is taking over input. */
export function voyagePlaybackBlocks(scene: Phaser.Scene): boolean {
  const player = players.get(scene);
  if (!player) return false;
  return (
    player.open ||
    ((scene.registry.get('odysseyStoryQueue') as VoyageCue[] | undefined)?.length ?? 0) > 0
  );
}

/**
 * Connect the existing narrator to actual game events without changing the homepage or combat UI.
 * Defer presentation until scene creation/transitions and ordinary dialogues have finished.
 */
export function installVoyagePlayback(scene: Phaser.Scene, isBusy: () => boolean): void {
  if (new URLSearchParams(location.search).get('story') === 'off') return;
  let disposed = false;
  let closePanel: (() => void) | undefined;
  let playing: VoyageCue[] = [];
  const player: Playback = { open: false, pump };
  players.set(scene, player);

  /** Reset held controls before pausing/resuming so releasing a key behind the modal cannot strand movement. */
  function clearInput() {
    Object.assign(touch, { up: false, down: false, left: false, right: false });
    scene.input.keyboard?.resetKeys();
  }

  /** Drain one batch in order; events that arrive during speech remain queued for the next batch. */
  function pump() {
    if (disposed || player.open || isBusy() || !scene.scene.isActive()) return;
    playing = takeVoyageCues(scene);
    if (!playing.length) return;
    player.open = true;
    clearInput();
    scene.scene.pause();
    const previousAction = document.getElementById('act')?.style.visibility;
    const action = document.getElementById('act');
    if (action) action.style.visibility = 'hidden';
    const panel = showNarration(
      playing.flatMap((cue) => cue.cards),
      {
        onClose: () => {
          closePanel = undefined;
          player.open = false;
          playing = [];
          if (action) action.style.visibility = previousAction ?? '';
          clearInput();
          if (!disposed && scene.scene.isPaused()) scene.scene.resume();
        },
      },
    );
    closePanel = panel.close;
  }

  const schedule = () => queueMicrotask(pump);
  window.addEventListener('odyssey:story', schedule);
  scene.events.on('postupdate', pump);
  scene.events.on('resume', schedule);

  /** Release subscriptions on map changes and preserve undisplayed dialogue across forced transitions. */
  scene.events.once('shutdown', () => {
    disposed = true;
    if (playing.length) {
      const pending = (scene.registry.get('odysseyStoryQueue') as VoyageCue[] | undefined) ?? [];
      scene.registry.set('odysseyStoryQueue', [...playing, ...pending]);
    }
    closePanel?.();
    players.delete(scene);
    window.removeEventListener('odyssey:story', schedule);
    scene.events.off('postupdate', pump);
    scene.events.off('resume', schedule);
  });
  schedule();
}
