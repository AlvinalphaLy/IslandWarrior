import { NARRATION, type NarrationCard } from '../data/narration';
import './narration.css';
const audioBase = `${import.meta.env.BASE_URL}assets/voice/`;
const portraitBase = `${import.meta.env.BASE_URL}assets/portraits/`;
const speakerIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8M20 5q8 7 0 14"/></svg>';
const replayIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8a8 8 0 1 1-1 7M5 3v6h6"/></svg>';
export interface NarrationOptions {
  onClose?: () => void;
  onComplete?: () => void;
  audio?: boolean;
}
/** Opt-in modal. Gameplay owner must pause their scene before opening and resume in onClose. */
export function narrate(key: string, options: NarrationOptions = {}) {
  const cards = NARRATION[key];
  if (!cards) throw new Error(`Unknown narration: ${key}`);
  return showNarration(cards, options);
}
let currentClose: (() => void) | undefined;
export function closeNarration() {
  currentClose?.();
}
/** Own one modal and one audio track; close the previous session before opening another. */
export function showNarration(cards: readonly NarrationCard[], options: NarrationOptions = {}) {
  currentClose?.();
  if (!cards.length) {
    options.onClose?.();
    return { close: () => {} };
  }
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.createElement('section');
  root.className = 'narration-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Story narration');
  root.innerHTML = `<div class="narration-portrait narration-emblem" aria-hidden="true">Ω</div><div class="narration-body"><div class="narration-top"><div class="narration-speaker"></div><div class="narration-tools"><button class="narration-mute" aria-label="Mute narration" title="Mute narration">${speakerIcon}</button><button class="narration-replay" aria-label="Replay line" title="Replay line">${replayIcon}</button></div></div><p class="narration-text"></p><div class="narration-footer"><div class="narration-status"><span class="narration-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="narration-state"></span><span class="narration-counter"></span></div><button class="narration-continue"><kbd>E</kbd><span>Reveal line</span></button></div></div><button class="narration-close" aria-label="Close narration">Close ×</button>`;
  document.body.append(root);
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const text = q('.narration-text'),
    state = q('.narration-state'),
    mute = q<HTMLButtonElement>('.narration-mute'),
    next = q<HTMLButtonElement>('.narration-continue');
  let index = 0,
    visible = 0,
    letters: HTMLSpanElement[] = [],
    audio: HTMLAudioElement | undefined,
    frame = 0,
    start = 0,
    duration = 0,
    closed = false,
    generation = 0,
    muted = false;
  try {
    muted = localStorage.getItem('islandwarrior.narration.muted') === 'true';
  } catch {}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Release the current track so a skipped line cannot keep speaking behind the next card. */
  function stopAudio() {
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = undefined;
    }
    root.dataset.speaking = 'false';
  }
  function updateMute() {
    mute.setAttribute('aria-pressed', String(muted));
    mute.setAttribute('aria-label', muted ? 'Unmute narration' : 'Mute narration');
    mute.title = muted ? 'Unmute narration' : 'Mute narration';
    mute.style.opacity = muted ? '.5' : '1';
  }
  function reveal(count: number) {
    for (let i = visible; i < count; i++) letters[i]?.classList.add('visible');
    visible = Math.max(visible, count);
    next.querySelector('span')!.textContent =
      visible >= letters.length
        ? index === cards.length - 1
          ? 'Finish'
          : 'Continue'
        : 'Reveal line';
  }
  /** First advance reveals the full caption; a second advance moves to the next card. */
  function finishLine() {
    generation++;
    cancelAnimationFrame(frame);
    reveal(letters.length);
    stopAudio();
    state.textContent = muted ? 'Muted' : 'Ready';
  }
  function tick(now: number) {
    if (closed) return;
    const elapsed = now - start;
    reveal(Math.min(letters.length, Math.floor((elapsed / duration) * letters.length)));
    if (visible < letters.length) frame = requestAnimationFrame(tick);
  }
  /** Tokens discard late audio events from closed, muted, replayed or replaced cards. */
  function play() {
    stopAudio();
    const token = ++generation;
    if (options.audio === false) {
      state.textContent = 'Text only';
      return;
    }
    if (muted) {
      state.textContent = 'Muted';
      return;
    }
    const a = (audio = new Audio(`${audioBase}${cards[index].key}.mp3`));
    state.textContent = 'Loading voice…';
    a.addEventListener(
      'loadedmetadata',
      () => {
        if (token !== generation || closed) return;
        if (Number.isFinite(a.duration) && a.duration > 0 && visible < letters.length) {
          duration = Math.max(500, a.duration * 1000);
          start = performance.now() - (visible / letters.length) * duration;
        }
      },
      { once: true },
    );
    a.addEventListener('playing', () => {
      if (token !== generation || closed) return;
      root.dataset.speaking = 'true';
      state.textContent = 'Speaking…';
    });
    a.addEventListener('ended', () => {
      if (token !== generation || closed) return;
      root.dataset.speaking = 'false';
      state.textContent = 'Ready';
      cancelAnimationFrame(frame);
      reveal(letters.length);
    });
    a.addEventListener('error', () => {
      if (token !== generation || closed) return;
      root.dataset.speaking = 'false';
      state.textContent = 'Text only';
    });
    void a.play().catch(() => {
      if (token !== generation || closed) return;
      root.dataset.speaking = 'false';
      state.textContent = 'Text only · replay to listen';
    });
  }
  /** Rebuild one card; reserve its full caption layout while revealing glyphs over time. */
  function render() {
    generation++;
    stopAudio();
    cancelAnimationFrame(frame);
    visible = 0;
    const card = cards[index];
    q('.narration-speaker').textContent = card.speaker;
    q('.narration-counter').textContent = `${index + 1} / ${cards.length}`;
    root.querySelector('.narration-portrait')?.remove();
    const portrait = document.createElement(card.voice === 'oracle' ? 'img' : 'div');
    portrait.className = 'narration-portrait';
    portrait.setAttribute('aria-hidden', 'true');
    if (portrait instanceof HTMLImageElement) {
      portrait.src = `${portraitBase}oracle.png`;
      portrait.alt = '';
    } else {
      portrait.classList.add('narration-emblem');
      portrait.textContent = card.voice === 'narrator' ? 'Ω' : card.speaker.slice(0, 1);
    }
    root.prepend(portrait);
    text.textContent = '';
    text.setAttribute('aria-label', card.text);
    letters = Array.from(card.text, (letter) => {
      const span = document.createElement('span');
      span.textContent = letter;
      span.setAttribute('aria-hidden', 'true');
      text.append(span);
      return span;
    });
    duration = Math.max(1200, letters.length * 30);
    start = performance.now();
    updateMute();
    reveal(0);
    if (reduced) reveal(letters.length);
    else frame = requestAnimationFrame(tick);
    play();
  }
  function advance() {
    if (visible < letters.length) {
      finishLine();
      return;
    }
    if (++index >= cards.length) {
      options.onComplete?.();
      close();
    } else render();
  }
  /** Trap narration controls and focus without letting shortcuts reach the paused game. */
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      e.stopImmediatePropagation();
      buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      return;
    }
    if (['e', 'E', ' ', 'Enter', 'Escape'].includes(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.key === 'Escape') close();
      else if (
        (document.activeElement === mute ||
          document.activeElement === q('.narration-replay') ||
          document.activeElement === q('.narration-close')) &&
        [' ', 'Enter'].includes(e.key)
      ) {
        (document.activeElement as HTMLButtonElement).click();
      } else advance();
    } else e.stopImmediatePropagation(); // Do not send movement/battle shortcuts while modal is open.
  }
  const stop = (e: Event) => e.stopPropagation();
  root.addEventListener('pointerdown', stop);
  /** Always cancel audio, animation and global listeners before restoring the owning scene. */
  function close() {
    if (closed) return;
    closed = true;
    generation++;
    stopAudio();
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('pagehide', close);
    root.remove();
    if (currentClose === close) currentClose = undefined;
    previousFocus?.focus();
    options.onClose?.();
  }
  currentClose = close;
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('pagehide', close);
  mute.onclick = () => {
    muted = !muted;
    try {
      localStorage.setItem('islandwarrior.narration.muted', String(muted));
    } catch {}
    updateMute();
    if (muted) {
      generation++;
      stopAudio();
      state.textContent = 'Muted';
    } else play();
  };
  q('.narration-replay').onclick = play;
  next.onclick = advance;
  q('.narration-close').onclick = close;
  render();
  next.focus();
  return { close };
}
