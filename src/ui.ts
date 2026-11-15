/** DOM overlay shared by all map scenes (registered once, so scene restarts don't duplicate listeners). */
import type { MoveInput } from './entities/Player';
import type { PlayerStats } from './data/enemies';

export const touch: MoveInput = { up: false, down: false, left: false, right: false };
let actionHandler: () => void = () => {};

export function setActionHandler(fn: () => void) {
  actionHandler = fn;
}

export function initUi() {
  document.querySelectorAll<HTMLButtonElement>('#dpad button').forEach((b) => {
    const d = b.dataset.d as keyof MoveInput;
    const set = (v: boolean) => (e: Event) => { e.preventDefault(); touch[d] = v; };
    b.addEventListener('pointerdown', set(true));
    b.addEventListener('pointerup', set(false));
    b.addEventListener('pointerleave', set(false));
    b.addEventListener('pointercancel', set(false));
  });
  document.getElementById('act')?.addEventListener('pointerdown', (e) => { e.preventDefault(); actionHandler(); });
  const dlg = document.getElementById('dialog')!;
  dlg.style.pointerEvents = 'auto';
  dlg.addEventListener('pointerdown', () => actionHandler());
  document.querySelectorAll<HTMLButtonElement>('#battle button').forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); battleHandler(b.dataset.c as BattleCommand); });
  });
}

export function showDialog(name: string | null, text = '') {
  const el = document.getElementById('dialog')!;
  if (name === null) { el.style.display = 'none'; return; }
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

// ---------------------------------------------------------------- HUD (level / HP / potions)
export function updateHud(s: PlayerStats) {
  const el = document.getElementById('hud')!;
  el.innerHTML = `<span>Lv ${s.level}</span><span>HP ${s.hp}/${s.maxHp}</span>` +
    `<span class="hpbar"><i style="width:${Math.round((100 * s.hp) / s.maxHp)}%"></i></span><span>Potions ${s.potions}</span>`;
}

// ---------------------------------------------------------------- battle panel
export type BattleCommand = 'attack' | 'defend' | 'potion' | 'run';
let battleHandler: (c: BattleCommand) => void = () => {};

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(`#battle ${sel}`)!;

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
    q('.me .n').textContent = `You (Lv ${me.level})`;
    q('.me .v').textContent = `${me.hp}/${me.maxHp}`;
    q<HTMLElement>('.me .bar i').style.width = `${(100 * me.hp) / me.maxHp}%`;
    q('button[data-c=potion]').innerHTML = `<kbd>3</kbd>Potion (${me.potions})`;
  },
  log(text: string) {
    q('.log').textContent = text;
  },
  enable(on: boolean) {
    document.querySelectorAll<HTMLButtonElement>('#battle button').forEach((b) => (b.disabled = !on));
  },
  select(c: BattleCommand) {
    document.querySelectorAll<HTMLButtonElement>('#battle button').forEach((b) => b.classList.toggle('sel', b.dataset.c === c));
  },
};
