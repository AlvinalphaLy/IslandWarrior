import type Phaser from 'phaser';
import { NARRATION } from '../data/narration';
import { showNarration, closeNarration } from '../narration';
import { touch } from '../ui';
import {
  CHAPTERS,
  newStory,
  matchesChapter,
  completeChapter,
  type StoryEvent,
  type StoryProgress,
} from './state';
import './story.css';
const REGISTRY_KEY = 'odysseyStory';
const progress = (scene: Phaser.Scene): StoryProgress =>
  scene.registry.get(REGISTRY_KEY) ?? newStory();
let modal = false;
export const storyIsOpen = () => modal;

/** Pause this scene and clear held movement so narration cannot leave physics or touch input running. */
function episode(scene: Phaser.Scene, id: string, onComplete?: () => void) {
  const cards = NARRATION.journey.filter((card) => card.key.startsWith(`journey_${id}_`));
  if (!cards.length || modal) return;
  modal = true;
  Object.assign(touch, { up: false, down: false, left: false, right: false });
  scene.input.keyboard?.resetKeys();
  scene.scene.pause();
  const teardown = () => {
    closeNarration();
  };
  scene.events.once('shutdown', teardown);
  showNarration(cards, {
    onComplete,
    onClose: () => {
      scene.events.off('shutdown', teardown);
      modal = false;
      Object.assign(touch, { up: false, down: false, left: false, right: false });
      scene.input.keyboard?.resetKeys();
      if (scene.scene.isPaused()) scene.scene.resume();
    },
  });
}

/** Mount session-scoped objectives on every map; progress is never presented as a complete save system. */
export function mountStory(scene: Phaser.Scene) {
  if (new URLSearchParams(location.search).has('nostory')) return;
  document.getElementById('story-widget')?.remove();
  const root = document.createElement('aside');
  root.id = 'story-widget';
  root.setAttribute('aria-label', 'Odyssey journey');
  document.body.append(root);
  function render() {
    const p = progress(scene),
      chapter = CHAPTERS[p.chapter];
    root.textContent = '';
    const title = document.createElement('h2');
    title.textContent = 'The long way home';
    root.append(title);
    const goal = document.createElement('p');
    goal.id = 'story-objective';
    goal.textContent = !p.started
      ? 'Troy has fallen. Your journey to Ithaca begins here.'
      : chapter
        ? `${p.chapter + 1} / ${CHAPTERS.length} · ${chapter.objective}`
        : 'Homecoming complete. Explore the island or revisit your story.';
    root.append(goal);
    const button = document.createElement('button');
    button.id = 'story-begin';
    const guardianDone =
      chapter?.event.type === 'victory' &&
      ((scene.registry.get('defeated') as string[] | undefined) ?? []).includes('dungeon:golem');
    button.textContent = guardianDone
      ? 'Continue guardian chapter'
      : p.started
        ? 'Replay opening'
        : 'Begin your Odyssey';
    button.onclick = () => {
      if (guardianDone) {
        episode(scene, chapter.id, () => {
          scene.registry.set(REGISTRY_KEY, completeChapter(progress(scene), CHAPTERS));
          render();
        });
        return;
      }
      episode(scene, 'opening', () => {
        if (!progress(scene).started) {
          scene.registry.set(REGISTRY_KEY, { ...newStory(), started: true });
          render();
        }
      });
    };
    root.append(button);
    const details = document.createElement('details'),
      summary = document.createElement('summary');
    summary.textContent = `Journey journal · ${p.completed.length} / ${CHAPTERS.length}`;
    details.append(summary);
    const list = document.createElement('ol');
    for (const c of CHAPTERS) {
      const li = document.createElement('li');
      li.textContent = `${p.completed.includes(c.id) ? '✓ ' : ''}${c.title}`;
      if (p.completed.includes(c.id)) {
        const replay = document.createElement('button');
        replay.textContent = 'Replay';
        replay.setAttribute('aria-label', `Replay ${c.title}`);
        replay.onclick = () => episode(scene, c.id);
        li.append(document.createTextNode(' '), replay);
      }
      list.append(li);
    }
    details.append(list);
    root.append(details);
  }
  render();
  scene.events.on('story-changed', render);
  const onPause = () => {
    root.hidden = true;
  };
  const onResume = () => {
    root.hidden = false;
    render();
  };
  scene.events.on('pause', onPause);
  scene.events.on('resume', onResume);
  scene.events.once('shutdown', () => {
    scene.events.off('story-changed', render);
    scene.events.off('pause', onPause);
    scene.events.off('resume', onResume);
    root.remove();
  });
}

/** Route only the active quest interaction into narration; all other NPCs keep their existing dialogue. */
export function handleStoryEvent(scene: Phaser.Scene, event: StoryEvent): boolean {
  if (new URLSearchParams(location.search).has('nostory') || modal) return false;
  const p = progress(scene),
    chapter = CHAPTERS[p.chapter];
  if (!matchesChapter(p, chapter, event)) return false;
  episode(scene, chapter.id, () => {
    scene.registry.set(REGISTRY_KEY, completeChapter(progress(scene), CHAPTERS));
    scene.events.emit('story-changed');
  });
  return true;
}
