import { CHALLENGE_BEATS } from '../data/challenge-stories';
import type Phaser from 'phaser';
import { VOYAGE_BEATS } from '../data/voyage';
import type { NarrationCard } from '../data/narration';
import {
  advanceVoyage,
  newVoyage,
  voyageObjective,
  type VoyageEvent,
  type VoyageProgress,
} from './state';

const REGISTRY_KEY = 'odysseyVoyage';
export interface VoyageCue {
  key: string;
  cards: readonly NarrationCard[];
  progress: VoyageProgress;
  objective: string;
}

/** Read session progress without creating any UI, save system, combat rewards or inventory entries. */
export function getVoyage(scene: Phaser.Scene): VoyageProgress {
  return { ...newVoyage(), ...(scene.registry.get(REGISTRY_KEY) ?? {}) };
}

/** Publish story data for the UI owner; deduplication survives scene transitions through the registry. */
export function publishVoyageEvent(scene: Phaser.Scene, event: VoyageEvent): VoyageCue[] {
  const transition = advanceVoyage(getVoyage(scene), event);
  scene.registry.set(REGISTRY_KEY, transition.progress);
  const cues = transition.beats.map((key) => ({
    key,
    cards: VOYAGE_BEATS[key] ?? CHALLENGE_BEATS[key],
    progress: transition.progress,
    objective: voyageObjective(transition.progress),
  }));
  // A queue prevents story events from disappearing before a new scene's UI subscribes.
  const pending = (scene.registry.get('odysseyStoryQueue') as VoyageCue[] | undefined) ?? [];
  scene.registry.set('odysseyStoryQueue', [...pending, ...cues]);
  for (const cue of cues) {
    scene.events.emit('voyage-story', cue);
    window.dispatchEvent(new CustomEvent<VoyageCue>('odyssey:story', { detail: cue }));
  }
  return cues;
}

/** Consume queued beats once. The UI owner controls pause/resume, presentation, choices and skipping. */
export function takeVoyageCues(scene: Phaser.Scene): VoyageCue[] {
  const cues = (scene.registry.get('odysseyStoryQueue') as VoyageCue[] | undefined) ?? [];
  scene.registry.set('odysseyStoryQueue', []);
  return cues;
}
