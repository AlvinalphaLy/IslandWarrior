/** DOM overlay shared by all map scenes (registered once, so scene restarts don't duplicate listeners). */
import type { MoveInput } from './entities/Player';
import type { PlayerStats } from './data/enemies';

export const touch: MoveInput = { up: false, down: false, left: false, right: false };
let actionHandler: () => void = () => {};

export function setActionHandler(fn: () => void) {
  actionHandler = fn;
}

let weatherHandler: () => void = () => {};
/** the Night/Day button (toggles the night storm, like N) */
export function setWeatherHandler(fn: () => void) {
  weatherHandler = fn;
}
/** label the button with what it switches TO */
export function setWeatherButton(night: boolean) {
  const b = document.getElementById('weather');
  if (b) b.textContent = night ? '☀️ Day' : '🌙 Night';
}

let shootHandler: () => void = () => {};
/** the touch "bow" button (shoots, like F) */
export function setShootHandler(fn: () => void) {
  shootHandler = fn;
}

export function initUi() {
  document.querySelectorAll<HTMLButtonElement>('#dpad button').forEach((b) => {
    const d = b.dataset.d as keyof MoveInput;
    const set = (v: boolean) => (e: Event) => {
      e.preventDefault();
      touch[d] = v;
    };
    b.addEventListener('pointerdown', set(true));
    b.addEventListener('pointerup', set(false));
    b.addEventListener('pointerleave', set(false));
    b.addEventListener('pointercancel', set(false));
  });
  document.getElementById('act')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    actionHandler();
  });
  document.getElementById('bow')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    shootHandler();
  });
  document.getElementById('weather')?.addEventListener('click', (e) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).blur();
    weatherHandler();
  });
  const dlg = document.getElementById('dialog')!;
  dlg.style.pointerEvents = 'auto';
  dlg.addEventListener('pointerdown', () => actionHandler());
  document.querySelectorAll<HTMLButtonElement>('#battle button').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      battleHandler(b.dataset.c as BattleCommand);
    });
  });
}

export function showDialog(name: string | null, text = '') {
  const el = document.getElementById('dialog')!;
  if (name === null) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.querySelector('.name')!.textContent = name;
  el.querySelector('.text')!.textContent = text;
}

let toastTimer = 0;
export function toast(msg: string, ms = 1800) {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.style.display = 'none'), ms);
}

// ---------------------------------------------------------------- victory banner
/**
 * A challenge won: a golden VICTORY banner with the challenge's name and rewards, and a bar filling over `ms` while
 * the game waits to take you back to the island. Call hideVictory() when leaving.
 */
export function showVictory(name: string, rewards: string[], ms: number) {
  const el = document.getElementById('victory')!;
  el.querySelector('.title')!.textContent = 'VICTORY';
  el.querySelector('.back')!.textContent = 'Returning to the island...';
  (el.querySelector('.bar') as HTMLElement).style.display = '';
  el.querySelector('.sub')!.textContent = name;
  el.querySelector('ul')!.innerHTML = rewards
    .map((r) => `<li>${r.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</li>`)
    .join('');
  const bar = el.querySelector<HTMLElement>('.bar i')!;
  bar.style.transition = 'none';
  bar.style.width = '0';
  el.style.display = 'block';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.classList.add('show');
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = '100%';
    }),
  );
}

/** the end of the voyage: MISSIONS COMPLETE with every trial and its prize; the game closes it on E */
export function showMissionsComplete(name: string, lines: string[]) {
  const el = document.getElementById('victory')!;
  el.querySelector('.title')!.textContent = 'MISSIONS COMPLETE';
  el.querySelector('.sub')!.textContent = name;
  el.querySelector('ul')!.innerHTML = lines
    .map((r) => `<li>${r.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</li>`)
    .join('');
  el.querySelector('.back')!.textContent = 'Press E to continue';
  (el.querySelector('.bar') as HTMLElement).style.display = 'none';
  el.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
}

/**
 * The trials tracker under the HUD: 'Trials 1/3', then 'Trials 3/3 · Return to the ship' (glowing) until the
 * homecoming has played, then 'Home to Ithaca ✓'.
 */
export function updateTrials(won: number, total: number, home: boolean) {
  const el = document.getElementById('trials');
  if (!el) return;
  el.style.display = 'block';
  el.classList.toggle('ready', won >= total && !home);
  el.textContent = home ? 'Home to Ithaca ✓' : won >= total ? `Trials ${won}/${total} · Return to the ship` : `Trials ${won}/${total}`;
}

export function hideVictory() {
  const el = document.getElementById('victory')!;
  el.classList.remove('show');
  window.setTimeout(() => {
    if (!el.classList.contains('show')) el.style.display = 'none';
  }, 400);
}

// ---------------------------------------------------------------- HUD (level / HP / potions)
export function updateHud(s: PlayerStats) {
  const el = document.getElementById('hud')!;
  el.innerHTML =
    `<span>Lv ${s.level}</span><span>HP ${s.hp}/${s.maxHp}</span>` +
    `<span class="hpbar"><i style="width:${Math.round((100 * s.hp) / s.maxHp)}%"></i></span><span>Ambrosia ${s.potions}</span><span>Gold ${s.gold ?? 0}</span>`;
}

// ---------------------------------------------------------------- battle panel
export type BattleCommand = 'attack' | 'defend' | 'potion' | 'run';
let battleHandler: (c: BattleCommand) => void = () => {};

const q = <T extends Element = HTMLElement>(sel: string) =>
  document.querySelector<T>(`#battle ${sel}`)!;

export const battleUi = {
  show(foeName: string, onCommand: (c: BattleCommand) => void) {
    battleHandler = onCommand;
    q('.foe .n').textContent = foeName;
    document.getElementById('battle')!.style.display = 'block';
    document.getElementById('hint')!.style.visibility = 'hidden';
  },
  hide() {
    battleHandler = () => {};
    document.getElementById('battle')!.style.display = 'none';
    document.getElementById('hint')!.style.visibility = '';
  },
  bars(_foe: string, foeHp: number, foeMax: number, me: PlayerStats) {
    q('.foe .v').textContent = `${foeHp}/${foeMax}`;
    q<HTMLElement>('.foe .bar i').style.width = `${(100 * foeHp) / foeMax}%`;
    q('.me .n').textContent = `Odysseus (Lv ${me.level})`;
    q('.me .v').textContent = `${me.hp}/${me.maxHp}`;
    q<HTMLElement>('.me .bar i').style.width = `${(100 * me.hp) / me.maxHp}%`;
    q('button[data-c=potion]').innerHTML = `<kbd>3</kbd>Ambrosia (${me.potions})`;
  },
  log(text: string) {
    q('.log').textContent = text;
  },
  enable(on: boolean) {
    document
      .querySelectorAll<HTMLButtonElement>('#battle button')
      .forEach((b) => (b.disabled = !on));
  },
  select(c: BattleCommand) {
    document
      .querySelectorAll<HTMLButtonElement>('#battle button')
      .forEach((b) => b.classList.toggle('sel', b.dataset.c === c));
  },
};

// ---------------------------------------------------------------- real-time fight HUD (FightScene, #fight)
/** One fighter's health bar: exact HP numbers plus the smoothly draining fill and its lighter damage trail (0..1). */
export interface FighterBar {
  name: string;
  hp: number;
  max: number;
  fill: number;
  trail: number;
}

const fq = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(`#fight ${sel}`)!;
// bars() runs every frame: only touch the DOM when a value actually changes
const fightWritten = new Map<string, string>();
function fightPut(sel: string, kind: 'text' | 'width', value: string) {
  const key = `${sel}|${kind}`;
  if (fightWritten.get(key) === value) return;
  fightWritten.set(key, value);
  if (kind === 'text') fq(sel).textContent = value;
  else fq(sel).style.width = value;
}
/** (Re)start a one-shot CSS animation class. */
function restartAnim(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow, so the animation runs again
  el.classList.add(cls);
}
let lastCombo = 0;
const pct = (f: number) => `${(100 * Math.max(0, Math.min(1, f))).toFixed(1)}%`;

export const fightUi = {
  show(foeName: string) {
    fightWritten.clear();
    fightPut('.foe .n', 'text', foeName);
    lastCombo = 0;
    fightUi.meter(0);
    fightUi.combo(0);
    fightUi.log('');
    document.getElementById('fight')!.style.display = 'block';
    // the map's controls hint and stats box stay out of the fight (the fight HUD has its own bars and controls)
    document.getElementById('hint')!.style.visibility = 'hidden';
    document.getElementById('hud')!.style.visibility = 'hidden';
  },
  hide() {
    document.getElementById('fight')!.style.display = 'none';
    document.getElementById('hint')!.style.visibility = '';
    document.getElementById('hud')!.style.visibility = '';
  },
  /** both health bars: exact numbers, smoothed widths (the scene lerps fill/trail each frame) */
  bars(me: FighterBar, foe: FighterBar) {
    for (const [side, b] of [['.me', me], ['.foe', foe]] as const) {
      fightPut(`${side} .n`, 'text', b.name);
      fightPut(`${side} .v`, 'text', `${b.hp}/${b.max}`);
      fightPut(`${side} .bar i`, 'width', pct(b.fill));
      fightPut(`${side} .bar b`, 'width', pct(b.trail));
    }
  },
  /** launcher meter, 0..100; glows when full and its label says the next kick is the launcher */
  meter(v: number) {
    fightPut('.mbar i', 'width', pct(v / 100));
    fightPut('.meter .lbl', 'text', v >= 100 ? 'READY — K = LAUNCHER' : 'Meter');
    fq('.meter').classList.toggle('full', v >= 100);
  },
  /** the moment the meter fills: a short bright attention flash on top of the steady full glow */
  meterReady() {
    restartAnim(fq('.meter'), 'ready');
  },
  /** combo counter; pops (scale pulse) each time the count rises */
  combo(n: number) {
    fightPut('.combo', 'text', n >= 2 ? `${n} HITS` : '');
    if (n >= 2 && n > lastCombo) restartAnim(fq('.combo'), 'pop');
    lastCombo = n;
  },
  /** remaining automatic heals (ambrosia fires by itself at low HP, once per fight) */
  ambrosia(count: number, available: boolean) {
    fightPut('.amb .a', 'text', String(count));
    fq('.amb').classList.toggle('out', !available);
  },
  log(text: string) {
    fq('.log').textContent = text;
  },
};
