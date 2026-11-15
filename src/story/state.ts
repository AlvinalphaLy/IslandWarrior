export interface StoryEvent {
  type: 'talk' | 'inspect' | 'victory';
  key: string;
  map: string;
}
export interface StoryChapter {
  id: string;
  title: string;
  objective: string;
  event: StoryEvent;
}
export interface StoryProgress {
  started: boolean;
  chapter: number;
  completed: string[];
}
export const newStory = (): StoryProgress => ({ started: false, chapter: 0, completed: [] });
/** Only the current objective can progress; unrelated exploration and duplicate events are harmless. */
export function matchesChapter(
  progress: StoryProgress,
  chapter: StoryChapter | undefined,
  event: StoryEvent,
): boolean {
  return (
    progress.started &&
    !!chapter &&
    chapter.event.type === event.type &&
    chapter.event.key === event.key &&
    chapter.event.map === event.map
  );
}
/** Record completion once, after its story card finishes; cancelling a popup never completes a chapter. */
export function completeChapter(
  progress: StoryProgress,
  chapters: readonly StoryChapter[],
): StoryProgress {
  const chapter = chapters[progress.chapter];
  if (!progress.started || !chapter) return progress;
  return {
    ...progress,
    chapter: progress.chapter + 1,
    completed: [...progress.completed, chapter.id],
  };
}

/** This first chapter route uses existing map actors and the existing dungeon boss. */
export const CHAPTERS: readonly StoryChapter[] = [
  {
    id: 'shore',
    title: 'A broken oar',
    objective: 'Speak to Kai by the village shore.',
    event: { type: 'talk', key: 'kai', map: 'village' },
  },
  {
    id: 'lotus',
    title: 'The lotus promise',
    objective: 'Speak to Mira in the village garden.',
    event: { type: 'talk', key: 'mira', map: 'village' },
  },
  {
    id: 'circe',
    title: 'A spell of comfort',
    objective: 'Enter a house leading to the cave; speak to the Fungus King.',
    event: { type: 'talk', key: 'fungus_king', map: 'cave' },
  },
  {
    id: 'underworld',
    title: 'Those who never returned',
    objective: 'Speak to Sister Ada in the same cave.',
    event: { type: 'talk', key: 'cleric', map: 'cave' },
  },
  {
    id: 'cyclops',
    title: 'The name Nobody',
    objective: 'Enter the sewer dungeon through house_5 and defeat its guardian.',
    event: { type: 'victory', key: 'gumball_golem', map: 'dungeon' },
  },
  {
    id: 'sirens',
    title: 'The voice you leave behind',
    objective: 'Return to the village and speak to Wren near the orchard.',
    event: { type: 'talk', key: 'wren', map: 'village' },
  },
  {
    id: 'home',
    title: 'A promise kept',
    objective: 'Speak to Old Tobin in the village to finish the homecoming.',
    event: { type: 'talk', key: 'tobin', map: 'village' },
  },
];
