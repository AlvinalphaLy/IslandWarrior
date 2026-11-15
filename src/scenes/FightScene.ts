/**
 * Real-time fight (ported from odyssey-integrated, keyboard only): A/D move, W jump, S block, J punch, K kick
 * (K with a full meter = launcher). Used for the battles on FIGHT_MAPS (MapScene); every other battle is the
 * turn-based BattleScene. Same contract as BattleScene: launched with BattleData, it resumes the map and emits
 * 'battle-end' with a BattleResult ('run' is never returned: there is no running away).
 */
import Phaser from 'phaser';
import {
  ENEMIES, EnemyDef, EnemyMove, FOE_FRAME, FX_FRAME, GREEK_SHEETS, HERO_FRAME, PlayerStats, POTION_HEAL, START_STATS, XP_PER_LEVEL,
} from '../data/enemies';
import { fightUi as battleUi, updateHud } from '../ui';
import type { BattleData, BattleResult } from './BattleScene';


// ---------------------------------------------------------------- arena & tuning
// the fighters stand on the sand above the HTML fight HUD, which covers the bottom ~60 px of the canvas
const FLOOR_Y = 194;
const ARENA = { left: 40, right: 440 };
const HERO_START_X = 170;
const FOE_START_X = 310;
/** the two fighters' centres never come closer than this (bigger foes push it up to their body width) */
const MIN_SEP = 28;
const HERO_SCALE = 2.2;
const HERO_HALF = 16;

const WALK = 100; // px/s toward the foe
const WALK_BACK = 80; // px/s backing off
const WALK_ACCEL = 900; // px/s² speeding up (full forward walk in ~110 ms)
const WALK_DECEL = 1500; // px/s² slowing down / turning (a stop from full walk takes ~65 ms)
const JUMP_V = 340; // px/s take-off speed (~52 px high, ~0.6 s in the air)
const GRAVITY = 1100;
const LAND_LAG = 45; // ms of landing recovery
/**
 * ms a press is remembered. Presses are recorded by the key handler at any time in the fight (hit-stop included) and
 * the countdown is paused during hit-stop, so J pressed just before a move recovers, before landing, during hit-stop
 * or late in hit-stun still comes out. 220 ms covers the tail of the longest recoveries (kick 240, launcher 320).
 */
const INPUT_BUFFER = 220;
/** camera: slight zoom, eased follow of the fighters' midpoint (clamped to the cave by the camera bounds) */
const CAM_ZOOM = 1.1;
const CAM_Y = 140; // world y the camera centres on: keeps the floor at the same screen height as at zoom 1
const CAM_EASE = 220; // ms time constant of the follow

type AttackKind = 'punch' | 'kick' | 'launcher';
interface AttackSpec {
  startup: number; // ms before the hit comes out
  active: number; // ms the hit can connect
  recovery: number; // ms before the hero can act again
  reach: number; // px of gap between the bodies the hit still reaches
  mult: number; // damage = stats.atk × mult
  stun: number; // ms of foe hit-stun
  push: number; // px/s knockback
  stop: number; // ms of hit-stop
  lunge: number; // px the sprite leans in on the active frames
}
const ATTACKS: Record<AttackKind, AttackSpec> = {
  punch: { startup: 90, active: 70, recovery: 150, reach: 24, mult: 0.6, stun: 260, push: 60, stop: 55, lunge: 7 },
  kick: { startup: 180, active: 80, recovery: 240, reach: 38, mult: 0.9, stun: 360, push: 220, stop: 95, lunge: 12 },
  launcher: { startup: 160, active: 90, recovery: 320, reach: 32, mult: 1.4, stun: 0, push: 40, stop: 140, lunge: 14 },
};
// other hit-stops (ms): juggle hit, crit floor, blocked hit (either side), hero hurt light / heavy
const STOP_JUGGLE = 80;
const STOP_CRIT = 110;
const STOP_BLOCK = 40;
const STOP_HURT = 65;
const STOP_HURT_HEAVY = 110;
const LINKED_KICK_STARTUP = 120; // K pressed within LINK_WINDOW of a landed J comes out faster (a combo step)
const LINK_WINDOW = 450; // ms after a landed hit in which J/K cancel the recovery
const COMBO_WINDOW = 1200; // ms between landed hits for the counter to keep going
const CHAIN_BONUS = 1.3; // punch → punch → kick: the kick deals +30 %
const CRIT_CHANCE = 0.12;
const JUGGLE_MULT = 0.5;
const MAX_JUGGLES = 2;
const LAUNCH_V = 300; // px/s the launcher pops the foe up
const JUGGLE_BUMP = 170; // px/s each juggle hit keeps it up
const METER_MAX = 100;
const METER_HIT = 12;
const METER_HURT = 8;
const METER_BLOCK = 3;
const HEAL_COOLDOWN = 7000; // ms: foe heal moves stay rare in real time
const KO_SLOWMO = 0.3;
const KO_SLOWMO_MS = 900; // real milliseconds of slow motion

type HeroState = 'idle' | 'walk' | 'jump' | 'land' | 'block' | 'attack' | 'hurt' | 'heal' | 'ko';
type FoeState = 'idle' | 'approach' | 'retreat' | 'taunt' | 'block' | 'windup' | 'strike' | 'recover' | 'hurt' | 'air' | 'down' | 'ko';
/** What a key press can ask for. The launcher is a kick pressed with a full meter; ambrosia fires on its own. */
type Action = 'jump' | 'punch' | 'kick';
const AUTO_AMBROSIA_AT = 0.25; // ambrosia drinks itself (once per fight) when HP drops below this share of max

interface Body {
  x: number;
  /** height above the floor */
  air: number;
  vy: number;
  /** knockback slide, px/s */
  vx: number;
  /** ms spent in the current state, and how long it lasts (0 = open-ended) */
  t: number;
  dur: number;
  /** sprite-only lean toward the opponent (px) */
  lunge: number;
}
interface HeroAttack {
  kind: AttackKind;
  spec: AttackSpec;
  startup: number;
  id: number;
  hitDone: boolean;
  landed: boolean;
  /** the active frames ended without touching anything (the whiff cue has been shown) */
  whiffed: boolean;
}

/**
 * Enemy personality, derived ONLY from the existing hp/atk stats.
 * "Heft" h = clamp((hp + 4·atk − 24) / 82, 0, 1):
 *   Sewer Mole / Ciconian Raider (12 hp, 3 atk) → 0, Wyvernling → 0.12, Restless Shade → 0.32, Gold Knight → 0.44,
 *   Polyphemus / Gumball Golem (70 hp, 9 atk) → 1.
 * Every trait is a straight lerp from the light skirmisher (h = 0) to the heavy boss (h = 1):
 *   walk speed 80 → 36 px/s, wind-up (telegraph) 260 → 560 ms, decision tick 150 → 250 ms,
 *   aggression 0.6 → 0.38, block chance 0.12 → 0.5, recovery after a strike 260 → 560 ms,
 *   melee reach 22 → 36 px, retreat-after-strike chance 0.55 → 0.25.
 *   h ≥ 0.6 also gives armour: hits during its wind-up still hurt but don't interrupt it.
 * Damage needs no extra rule: it is def.atk × move.power, so heavies already hit much harder.
 */
interface FoeAi {
  h: number;
  speed: number;
  windup: number;
  think: number;
  aggression: number;
  blockChance: number;
  recovery: number;
  reach: number;
  retreatChance: number;
  armor: boolean;
}
function foeAi(def: EnemyDef): FoeAi {
  const h = Phaser.Math.Clamp((def.hp + 4 * def.atk - 24) / 82, 0, 1);
  const L = (a: number, b: number) => Phaser.Math.Linear(a, b, h);
  return {
    h, speed: L(80, 36), windup: L(260, 560), think: L(150, 250), aggression: L(0.6, 0.38), blockChance: L(0.12, 0.5),
    recovery: L(260, 560), reach: L(22, 36), retreatChance: L(0.55, 0.25), armor: h >= 0.6,
  };
}

/** Move `v` toward 0 by `d` without overshooting. */
const decay = (v: number, d: number) => (Math.abs(v) <= d ? 0 : v - Math.sign(v) * d);
/** Move `v` toward `to` by `d` without overshooting. */
const approach = (v: number, to: number, d: number) => (Math.abs(to - v) <= d ? to : v + Math.sign(to - v) * d);
const FONT = '"Pixelify Sans", monospace';

/**
 * Real-time 1-on-1 fight in Polyphemus' cave: Odysseus against one enemy, side view, Tekken style.
 * Odyssey enemies (tools/greek_battlers.py) have wind-up / strike / hurt frames; Fantasy Battlers enemies are
 * still images and get the same moves through tweens, tints and offsets alone.
 */
export class FightScene extends Phaser.Scene {
  private def!: EnemyDef;
  private data_!: BattleData;
  private stats!: PlayerStats;
  private ai!: FoeAi;
  private foeHp = 0;
  private foe!: Phaser.GameObjects.Sprite;
  private foeAnimated = false;
  private hero!: Phaser.GameObjects.Sprite;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private foeShadow!: Phaser.GameObjects.Ellipse;
  private guardIcon!: Phaser.GameObjects.Sprite;
  private rock: Phaser.GameObjects.Sprite | null = null;

  private phase: 'intro' | 'fight' | 'ko' = 'intro';
  /** walk: current walking speed in px/s (ramps toward the held direction with WALK_ACCEL / WALK_DECEL) */
  private H!: Body & { state: HeroState; atk: HeroAttack | null; lock: number; walk: number };
  /** eased camera centre x */
  private camX = 240;
  private F!: Body & { state: FoeState; move: EnemyMove | null; hitDone: boolean; raise: number; think: number; juggles: number; seenAttack: number };
  private minSep = MIN_SEP;
  private foeHalf = 16;

  /** fight time in ms: stops during hit-stop, so every window below freezes with the fighters */
  private clock = 0;
  private hitStop = 0;
  private meter = 0;
  private combo = 0;
  private chain: AttackKind[] = [];
  private lastHitAt = -1e9;
  private lastLanded: { kind: AttackKind; at: number } | null = null;
  private lastHeal = -1e9;
  private attackId = 0;
  private potionUsed = false;
  private buffered: { action: Action; left: number } | null = null;
  private shown = { me: 1, meTrail: 1, foe: 1, foeTrail: 1 };
  private held!: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[]; down: Phaser.Input.Keyboard.Key[] };

  constructor() {
    super('fight');
  }

  init(data: BattleData) {
    this.data_ = data;
    this.def = ENEMIES[data.enemyId];
    this.stats = { ...START_STATS, ...(this.registry.get('stats') as PlayerStats | undefined) };
    this.ai = foeAi(this.def);
    this.foeHp = this.def.hp;
    this.phase = 'intro';
    this.H = { x: HERO_START_X, air: 0, vy: 0, vx: 0, t: 0, dur: 0, lunge: 0, state: 'idle', atk: null, lock: 0, walk: 0 };
    this.F = {
      x: FOE_START_X, air: 0, vy: 0, vx: 0, t: 0, dur: 0, lunge: 0, state: 'idle', move: null, hitDone: false, raise: 0, think: 0,
      juggles: 0, seenAttack: 0,
    };
    this.clock = 0;
    this.hitStop = 0;
    this.meter = 0;
    this.combo = 0;
    this.chain = [];
    this.lastHitAt = -1e9;
    this.lastLanded = null;
    this.lastHeal = -1e9;
    this.attackId = 0;
    this.potionUsed = false;
    this.buffered = null;
    this.rock = null;
    this.shown = { me: this.stats.hp / this.stats.maxHp, meTrail: this.stats.hp / this.stats.maxHp, foe: 1, foeTrail: 1 };
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.makePixelTextures();
    this.add.image(0, 0, 'cave_bg').setOrigin(0).setScale(2);

    // the foe, right side, facing left
    this.foeAnimated = this.def.sprite in GREEK_SHEETS;
    const fh = this.foeAnimated ? GREEK_SHEETS[this.def.sprite].h : this.textures.get(this.def.sprite).getSourceImage().height;
    const foeScale = this.foeAnimated ? (fh > 32 ? 2.2 : 2.5) : Math.min(2, 120 / fh);
    this.foe = this.add.sprite(this.F.x, FLOOR_Y, this.def.sprite, this.foeAnimated ? 0 : undefined).setOrigin(0.5, 1).setScale(foeScale).setDepth(4);
    this.foeHalf = Phaser.Math.Clamp(this.foe.displayWidth * 0.28, 14, 34);
    this.minSep = Math.max(MIN_SEP, HERO_HALF + this.foeHalf);
    this.foeShadow = this.add.ellipse(this.F.x, FLOOR_Y - 2, this.foeHalf * 2.6, 9, 0x000000, 0.3).setDepth(1);
    this.guardIcon = this.add.sprite(0, 0, 'gk_fx', FX_FRAME.spark).setScale(1.6).setDepth(6).setAlpha(0.8).setVisible(false);
    this.foeIdle();

    // Odysseus, left side, facing right
    this.heroShadow = this.add.ellipse(this.H.x, FLOOR_Y - 2, 40, 9, 0x000000, 0.3).setDepth(1);
    this.hero = this.add.sprite(this.H.x, FLOOR_Y, 'gk_odysseus', 0).setOrigin(0.5, 1).setScale(HERO_SCALE).setDepth(5);
    this.hero.play('gk_odysseus-idle');
    this.render();

    // No in-canvas controls text: the canvas is only 480×270 and gets upscaled, so small text there turns to mush.
    // The controls live in the DOM fight HUD (#battle .keys), rendered at full screen resolution.

    // camera: a slight zoom leaves room to follow the fighters' midpoint without ever showing past the cave
    const cam = this.cameras.main;
    cam.setBounds(0, 0, 480, 270).setZoom(CAM_ZOOM);
    this.camX = (this.H.x + this.F.x) / 2;
    cam.centerOn(this.camX, CAM_Y);
    cam.fadeIn(250, 0, 0, 0);
    battleUi.show(this.def.name);
    battleUi.ambrosia(this.stats.potions, this.stats.potions > 0);
    this.refresh();
    this.drainBars(0);
    this.setupInput();
    this.roundIntro();
  }

  // ---------------------------------------------------------------- input
  private setupInput() {
    // This scene restarts for every battle. Remove the listeners/keys on shutdown and act once per DOM event:
    // Phaser 3.80's keyboard plugin can otherwise deliver one key press twice from the second battle on.
    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    // held keys are polled every frame; no capture, so the map's own key captures stay as they were
    const key = (c: number) => kb.addKey(c, false);
    this.held = { left: [key(KC.A), key(KC.LEFT)], right: [key(KC.D), key(KC.RIGHT)], down: [key(KC.S), key(KC.DOWN)] };
    const binds: [string, () => void][] = [
      ['W', () => this.press('jump')], ['UP', () => this.press('jump')],
      ['J', () => this.press('punch')], ['K', () => this.press('kick')],
    ];
    let lastEvent: KeyboardEvent | null = null;
    const handlers = binds.map(([k, fn]) => [`keydown-${k}`, (e: KeyboardEvent) => {
      if (e === lastEvent || e.repeat) return;
      lastEvent = e;
      fn();
    }] as const);
    for (const [ev, fn] of handlers) kb.on(ev, fn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [ev, fn] of handlers) kb.off(ev, fn);
      for (const k of [...this.held.left, ...this.held.right, ...this.held.down]) kb.removeKey(k, true, false);
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
    });
  }

  private isHeld(keys: Phaser.Input.Keyboard.Key[]) {
    return keys.some((k) => k.isDown);
  }

  /** A press waits in a short buffer until the hero can act. */
  private press(action: Action) {
    if (this.phase !== 'fight') return;
    this.buffered = { action, left: INPUT_BUFFER };
  }

  // ---------------------------------------------------------------- round intro
  private roundIntro() {
    this.say(this.def.intro);
    // the foe steps forward with a wind-up pose while ROUND 1 is shown
    this.foeFrame('windup');
    this.time.delayedCall(450, () => this.foeIdle());
    this.bigText('ROUND 1', '#FDF6E3', 36, 700);
    this.time.delayedCall(750, () => {
      this.bigText('FIGHT!', '#FFD166', 48, 700);
      this.cameras.main.shake(140, 0.006);
      this.say('ROUND 1 — FIGHT!');
      this.phase = 'fight';
    });
  }

  // ---------------------------------------------------------------- main loop
  update(_time: number, delta: number) {
    const real = Math.min(delta, 50);
    this.drainBars(real);
    this.followCamera(real);
    if (this.phase !== 'fight') return;
    // hit-stop: both fighters (and every timer below) freeze; effects and the camera keep moving
    if (this.hitStop > 0) {
      this.hitStop -= real;
      if (this.hitStop <= 0) this.pauseFighters(false);
      return;
    }
    this.clock += real;
    if (this.buffered && (this.buffered.left -= real) <= 0) this.buffered = null;
    this.updateHero(real);
    if (this.phase !== 'fight') return;
    this.updateFoe(real);
    if (this.phase !== 'fight') return;
    this.autoAmbrosia();
    this.separate();
    if (this.combo > 0 && this.clock - this.lastHitAt > COMBO_WINDOW) this.resetCombo();
    this.render();
  }

  /** Ease the camera toward the fighters' midpoint; the camera bounds keep it inside the cave. */
  private followCamera(ms: number) {
    const target = (this.H.x + this.F.x) / 2;
    this.camX += (target - this.camX) * (1 - Math.exp(-ms / CAM_EASE));
    this.cameras.main.centerOn(this.camX, CAM_Y);
  }

  private freeze(ms: number) {
    this.hitStop = Math.max(this.hitStop, ms);
    this.pauseFighters(true);
  }

  private pauseFighters(on: boolean) {
    for (const s of [this.hero, this.foe]) {
      if (on) s.anims.pause();
      else s.anims.resume();
    }
  }

  // ---------------------------------------------------------------- hero
  private setHero(state: HeroState, dur = 0) {
    const H = this.H;
    H.state = state;
    H.t = 0;
    H.dur = dur;
    if (state !== 'idle' && state !== 'walk') H.walk = 0; // attacks, guards, jumps, hits plant the feet
    if (state !== 'attack') { H.atk = null; this.hero.setAngle(0); }
    const pose: Partial<Record<HeroState, number>> = {
      jump: HERO_FRAME.windup, land: HERO_FRAME.idle, block: HERO_FRAME.guard, hurt: HERO_FRAME.hurt, heal: HERO_FRAME.victory,
    };
    if (state === 'idle' || state === 'walk') this.heroIdle();
    else if (pose[state] !== undefined) this.heroPose(pose[state]!);
  }

  private updateHero(dt: number) {
    const H = this.H;
    const sec = dt / 1000;
    H.t += dt;
    H.lock = Math.max(0, H.lock - dt);
    const facing = this.F.x >= H.x ? 1 : -1;
    const dir = (this.isHeld(this.held.right) ? 1 : 0) - (this.isHeld(this.held.left) ? 1 : 0);

    // knockback slide and the jump arc
    H.x += H.vx * sec;
    H.vx = decay(H.vx, 900 * sec);
    if (H.air > 0 || H.vy < 0) {
      H.vy += GRAVITY * sec;
      H.air = Math.max(0, H.air - H.vy * sec);
      if (H.air === 0) {
        H.vy = 0;
        if (H.state === 'jump') this.setHero('land', LAND_LAG);
      }
    }

    // a state that ends this frame drops straight into neutral, so a buffered press comes out on the same frame
    switch (H.state) {
      case 'jump':
        H.x += dir * WALK * 0.9 * sec; // light air control; no attacks while airborne
        return;
      case 'land': case 'heal':
        if (H.t < H.dur) return;
        this.setHero('idle');
        break;
      case 'hurt':
        if (H.t < H.dur || H.air > 0) return;
        this.setHero('idle');
        break;
      case 'attack':
        this.stepAttack(sec, facing);
        if ((H.state as HeroState) !== 'idle') return; // (stepAttack may have ended the attack)
        break;
      case 'ko':
        return;
    }
    this.neutral(dir, facing, sec); // idle / walk / block
  }

  /** Free to act: block (held), buffered jump / attack, or walk. */
  private neutral(dir: number, facing: number, sec: number) {
    const H = this.H;
    if ((this.isHeld(this.held.down) || H.lock > 0) && H.air === 0) {
      if (H.state !== 'block') this.setHero('block');
      return; // blocking: no moving, no attacking
    }
    if (H.state === 'block') this.setHero('idle');
    const b = this.buffered;
    if (b) {
      this.buffered = null;
      if (b.action === 'jump') {
        H.vy = -JUMP_V;
        H.air = 0.01;
        this.setHero('jump');
        this.burst(H.x, FLOOR_Y - 2, 'px_dust', 6, 50, 0);
        return;
      }
      // J/K within LINK_WINDOW of a landed hit still count as a combo step after the recovery has ended
      const linked = !!this.lastLanded && this.clock - this.lastLanded.at <= LINK_WINDOW;
      return this.startAttack(b.action, linked);
    }
    // weighty walk: ramp up toward the held direction's speed, brake harder than you accelerate
    const target = dir * (dir === facing ? WALK : WALK_BACK);
    const speedingUp = target !== 0 && Math.sign(target) === Math.sign(H.walk || target) && Math.abs(target) > Math.abs(H.walk);
    H.walk = approach(H.walk, target, (speedingUp ? WALK_ACCEL : WALK_DECEL) * sec);
    H.x += H.walk * sec;
    const st: HeroState = dir || H.walk ? 'walk' : 'idle';
    if (H.state !== st) H.state = st;
  }

  private startAttack(pressed: 'punch' | 'kick', linked: boolean) {
    // kick is the heavy button: with a full meter it comes out as the launcher
    const kind: AttackKind = pressed === 'kick' && this.meter >= METER_MAX ? 'launcher' : pressed;
    const spec = ATTACKS[kind];
    let startup = spec.startup;
    if (kind === 'kick' && linked && this.lastLanded?.kind === 'punch') startup = LINKED_KICK_STARTUP;
    if (kind === 'launcher') {
      this.meter = 0;
      battleUi.meter(0);
      this.cameras.main.flash(120, 246, 211, 107);
      this.say('Launcher!');
    }
    this.setHero('attack');
    this.H.atk = { kind, spec, startup, id: ++this.attackId, hitDone: false, landed: false, whiffed: false };
  }

  /** Startup (wind-up frame) → active (thrust, can connect) → recovery (cancellable into J/K after a landed hit). */
  private stepAttack(sec: number, facing: number) {
    const H = this.H;
    const a = H.atk!;
    const s = a.spec;
    const t = H.t;
    const activeEnd = a.startup + s.active;
    if (t < a.startup) {
      this.heroPose(HERO_FRAME.windup);
      H.lunge = -3;
      if (a.kind === 'launcher') { H.x += facing * 150 * sec; this.afterImage(this.hero); } // dash in
      return;
    }
    if (t < activeEnd) {
      this.heroPose(HERO_FRAME.thrust);
      H.lunge = s.lunge;
      this.hero.setAngle(facing * (a.kind === 'kick' ? 10 : a.kind === 'launcher' ? -18 : 0));
      if (!a.hitDone) a.hitDone = this.heroStrike(a, facing);
      return;
    }
    this.hero.setAngle(0);
    if (!a.hitDone && !a.whiffed) { a.whiffed = true; this.whiffCue(a, facing); }
    const rec = (t - activeEnd) / s.recovery;
    H.lunge = s.lunge * Math.max(0, 1 - rec * 2);
    this.heroPose(rec < 0.5 ? HERO_FRAME.thrust : HERO_FRAME.windup);
    // combo link: a landed hit lets the next J/K (a full-meter K being the launcher) cancel the recovery
    const b = this.buffered;
    if (b && a.landed && this.lastLanded && this.clock - this.lastLanded.at <= LINK_WINDOW
      && (b.action === 'punch' || b.action === 'kick')) {
      this.buffered = null;
      this.startAttack(b.action, true);
      return;
    }
    if (rec >= 1) this.setHero('idle');
  }

  /** A whiff reads as a whiff: a small puff of air at the end of the reach and a dust scuff, no sparks, no shake. */
  private whiffCue(a: HeroAttack, facing: number) {
    const x = this.H.x + facing * (HERO_HALF + a.spec.reach * 0.7);
    const y = FLOOR_Y - this.H.air - (a.kind === 'kick' ? 34 : 50);
    this.burst(x, y, 'px_white', 5, 45, 0);
    this.burst(this.H.x - facing * 6, FLOOR_Y - 2, 'px_dust', 3, 35, 0);
  }

  /** The active frames: true once the attack has hit or been blocked (it can only connect once). */
  private heroStrike(a: HeroAttack, facing: number): boolean {
    const F = this.F;
    const gap = Math.abs(F.x - this.H.x) - this.minSep;
    if (gap > a.spec.reach || F.state === 'down' || F.state === 'ko') return false;
    if (F.state === 'air' && (a.kind === 'launcher' || F.juggles >= MAX_JUGGLES)) return false;
    if (F.state === 'block' && F.air === 0 && a.kind !== 'launcher') {
      this.foeBlocks(a, facing);
      return true;
    }
    this.landHit(a, facing);
    return true;
  }

  private landHit(a: HeroAttack, facing: number) {
    const F = this.F;
    const atk = this.stats.atk;
    const juggle = F.state === 'air';
    let crit = false;
    let dmg: number;
    let label = '';
    if (juggle) {
      dmg = Math.max(1, Math.round(atk * JUGGLE_MULT + Phaser.Math.Between(0, 1)));
      F.juggles++;
      label = 'JUGGLE!';
    } else if (a.kind === 'launcher') {
      dmg = Math.round(atk * a.spec.mult + Phaser.Math.Between(0, 2));
      label = 'LAUNCH!';
    } else {
      crit = Math.random() < CRIT_CHANCE;
      dmg = Math.max(1, Math.round(atk * a.spec.mult + Phaser.Math.Between(0, 1))) * (crit ? 2 : 1);
    }

    // combo bookkeeping
    if (this.clock - this.lastHitAt > COMBO_WINDOW) { this.combo = 0; this.chain = []; }
    this.combo++;
    this.chain.push(a.kind);
    this.lastHitAt = this.clock;
    this.lastLanded = { kind: a.kind, at: this.clock };
    a.landed = true;
    if (!juggle && a.kind === 'kick' && this.chain.slice(-3).join() === 'punch,punch,kick') {
      dmg = Math.round(dmg * CHAIN_BONUS);
      label = 'CHAIN!';
    }
    battleUi.combo(this.combo);
    if (this.combo === 3 || this.combo === 5 || this.combo >= 7) this.bigText(`${this.combo} HITS!`, '#FFD166', 22, 600, 64);

    this.foeHp = Math.max(0, this.foeHp - dmg);
    this.addMeter(METER_HIT);
    this.hitFoe(dmg, crit, a.kind, juggle, label);
    if (crit) this.say('Grey-eyed Athena guides your spear!');
    this.refresh();
    if (this.foeHp <= 0) return this.ko('hero');

    // reaction
    if (a.kind === 'launcher' && !juggle) {
      this.cancelFoeAttack();
      this.setFoe('air');
      F.vy = -LAUNCH_V;
      F.air = Math.max(F.air, 1);
      F.vx = facing * 40;
      F.juggles = 0;
    } else if (juggle) {
      F.vy = -JUGGLE_BUMP;
      F.vx = facing * 30;
    } else if (this.ai.armor && F.state === 'windup') {
      this.floatText(this.foe.x, this.foe.y - this.foe.displayHeight - 18, 'ARMOR', '#C9C9C9', 9);
    } else {
      this.cancelFoeAttack();
      this.setFoe('hurt', a.spec.stun);
      F.vx = facing * a.spec.push;
    }
    this.freeze(juggle ? STOP_JUGGLE : crit ? Math.max(STOP_CRIT, a.spec.stop) : a.spec.stop);
  }

  /** Foe guarded: chip damage, gold sparks, BLOCK. Chip never finishes a fight. */
  private foeBlocks(a: HeroAttack, facing: number) {
    const chip = a.kind === 'kick' ? 2 : 1;
    this.foeHp = Math.max(1, this.foeHp - chip);
    const f = this.foe;
    const x = f.x - facing * this.foeHalf, y = f.y - f.displayHeight * 0.55;
    this.fxSprite(x, y, FX_FRAME.spark, 2);
    this.burst(x, y, 'px_gold', 12, 120);
    this.floatText(x, f.y - f.displayHeight - 6, 'BLOCK', '#FFD166', 13);
    this.cameras.main.shake(60, 0.003);
    f.setTintFill(0xfff1c1); // the guard rings: a pale flash, never the red of a clean hit
    this.time.delayedCall(60, () => { if (this.F.state === 'block') f.clearTint(); });
    this.F.vx = facing * 120;
    this.F.t = Math.min(this.F.t, Math.max(0, this.F.dur - 200)); // a blocked hit holds the guard a little longer
    this.addMeter(METER_BLOCK);
    this.refresh();
    this.freeze(STOP_BLOCK);
  }

  /**
   * Automatic ambrosia: once per fight, when HP falls below AUTO_AMBROSIA_AT of max and a potion remains.
   * Runs from the main loop, so it fires right after the hit-stop of the blow that crossed the line.
   * It doesn't change the hero's state, so hit-stun and knockback play out as usual.
   */
  private autoAmbrosia() {
    if (this.potionUsed || this.stats.potions <= 0 || this.H.state === 'ko') return;
    if (this.stats.hp <= 0 || this.stats.hp >= this.stats.maxHp * AUTO_AMBROSIA_AT) return;
    const heal = Math.min(POTION_HEAL, this.stats.maxHp - this.stats.hp);
    this.potionUsed = true;
    this.stats.potions--;
    this.stats.hp += heal;
    this.ambrosia();
    this.bigText('AMBROSIA!', '#B8F28A', 26, 900, 150); // below centre: clear of the combo callouts at 64
    this.floatText(this.hero.x, this.hero.y - 92, `+${heal}`, '#B8F28A');
    this.say(`Low on strength: you taste ambrosia, food of the gods, and recover ${heal} HP.`);
    battleUi.ambrosia(this.stats.potions, false);
    this.refresh();
  }

  // ---------------------------------------------------------------- foe: AI state machine
  private setFoe(state: FoeState, dur = 0) {
    const F = this.F;
    F.state = state;
    F.t = 0;
    F.dur = dur;
    F.lunge = 0;
    if (state !== 'windup') F.raise = 0;
    if (state !== 'air') this.foe.setAngle(0);
    if (state === 'recover' || state === 'hurt' || state === 'air') F.move = null;
    this.guardIcon.setVisible(state === 'block');
    if (state !== 'windup' && state !== 'hurt') this.foe.clearTint();
    if (state === 'windup') this.foeFrame('windup');
    else if (state === 'strike') this.foeFrame('strike');
    else if (state === 'hurt' || state === 'air' || state === 'down') this.foeFrame('hurt');
    else if (state === 'block') this.foeFrame('idle');
    else this.foeIdle();
  }

  private updateFoe(dt: number) {
    const F = this.F, H = this.H, ai = this.ai;
    const sec = dt / 1000;
    F.t += dt;
    const toward = H.x < F.x ? -1 : 1;

    F.x += F.vx * sec;
    F.vx = decay(F.vx, 700 * sec);
    if (F.air > 0 || F.vy < 0) {
      F.vy += GRAVITY * 0.85 * sec; // a touch floatier, so juggles have time to land
      F.air = Math.max(0, F.air - F.vy * sec);
      if (F.state === 'air') this.foe.setAngle(-toward * Math.min(25, F.air / 2));
      if (F.air === 0) {
        F.vy = 0;
        if (F.state === 'air') {
          this.setFoe('down', 450);
          this.cameras.main.shake(90, 0.006);
          this.burst(F.x, FLOOR_Y - 2, 'px_dust', 16, 120);
        }
      }
    }

    switch (F.state) {
      case 'hurt': case 'down': case 'block': case 'taunt':
        if (F.t >= F.dur) { this.setFoe('idle'); F.think = 0; }
        break;
      case 'air': case 'ko':
        break;
      case 'windup': {
        F.raise = Math.min(1, F.t / F.dur) * 6;
        if (this.rock) this.rock.setPosition(this.foe.x + 10 * -toward, this.foe.y - this.foe.displayHeight - 4 + Math.sin(F.t / 60) * 2);
        if (F.t >= F.dur) this.foeStrike();
        break;
      }
      case 'strike': {
        const m = F.move;
        if (m && m.power > 0 && (!m.fx || m.fx === 'melee')) {
          // melee lunge with after-images; the blow lands part-way through
          if (F.t < 120) { F.x += toward * 260 * sec; this.afterImage(this.foe); }
          if (!F.hitDone && F.t >= 90) { F.hitDone = true; this.foeMeleeHit(m); }
        }
        if (F.t >= F.dur) this.setFoe('recover', ai.recovery);
        break;
      }
      case 'recover':
        if (F.t >= 120) this.foeIdle();
        if (F.t >= F.dur) {
          const low = this.foeHp < this.def.hp * 0.3;
          if (Math.random() < ai.retreatChance + (low ? 0.25 : 0)) this.setFoe('retreat', Phaser.Math.Between(350, 650));
          else this.setFoe('idle');
          F.think = ai.think;
        }
        break;
      case 'approach':
        F.x += toward * ai.speed * sec;
        break;
      case 'retreat':
        F.x -= toward * ai.speed * 0.8 * sec;
        if (F.t >= F.dur) this.setFoe('idle');
        break;
    }

    const free = F.state === 'idle' || F.state === 'approach' || F.state === 'retreat' || F.state === 'taunt';
    // react to an incoming attack: guard (heavier and badly hurt foes guard more)
    if (free && F.air === 0 && H.state === 'attack' && H.atk && H.atk.id !== F.seenAttack && H.atk.kind !== 'launcher') {
      F.seenAttack = H.atk.id;
      const gap = Math.abs(F.x - H.x) - this.minSep;
      const low = this.foeHp < this.def.hp * 0.3;
      if (gap < 60 && Math.random() < ai.blockChance + (low ? 0.15 : 0)) {
        this.setFoe('block', Phaser.Math.Between(350, 650));
        return;
      }
    }
    if (free && (F.think -= dt) <= 0) {
      F.think = ai.think;
      this.decide();
    }
  }

  /** One AI decision (every ai.think ms): approach, attack, retreat, hold, or taunt. */
  private decide() {
    const F = this.F, ai = this.ai;
    if (F.state === 'retreat' && F.t < F.dur) return; // finish backing off first
    const gap = Math.abs(F.x - this.H.x) - this.minSep;
    const low = this.foeHp < this.def.hp * 0.3;
    if (!F.move) F.move = this.pickMove();
    const m = F.move;
    const r = Math.random();
    if (m.power <= 0) { // pure heal: step away first if Odysseus is in its face
      if (gap < 40 && r < 0.6) return this.setFoe('retreat', 400);
      return this.startWindup();
    }
    if (m.fx === 'boulder' || m.fx === 'song') { // ranged: throws / sings from any distance
      if (gap < 24 && r < 0.4) return this.setFoe('retreat', 450);
      if (r < ai.aggression + 0.2) return this.startWindup();
      return this.setFoe(gap > 120 ? 'approach' : 'idle');
    }
    if (gap <= ai.reach) {
      if (r < ai.aggression) return this.startWindup();
      if (r < ai.aggression + (low ? 0.35 : 0.15)) return this.setFoe('retreat', Phaser.Math.Between(300, 600));
      if (r < ai.aggression + (low ? 0.4 : 0.22)) return this.taunt();
      return this.setFoe('idle'); // hold ground (it can still guard)
    }
    if (low && r < 0.3) return this.setFoe('retreat', 500);
    if (r < 0.05) return this.taunt();
    if (F.state !== 'approach') this.setFoe('approach');
  }

  private taunt() {
    this.setFoe('taunt', 500);
    if (this.ai.h < 0.5) { this.F.vy = -140; this.F.air = 1; } // light foes hop about
    else { this.foeFrame('breath'); this.cameras.main.shake(80, 0.003); } // heavies stamp
  }

  /** Same weighted pick as the turn-based game; heal moves only when hurt and at most once per HEAL_COOLDOWN. */
  private pickMove(): EnemyMove {
    const canHeal = this.foeHp < this.def.hp && this.clock - this.lastHeal > HEAL_COOLDOWN;
    const moves = this.def.moves.filter((m) => !m.heal || canHeal);
    let r = Math.random() * moves.reduce((s, m) => s + m.weight, 0);
    for (const m of moves) if ((r -= m.weight) <= 0) return m;
    return moves[0];
  }

  /** Telegraph: wind-up frame, a reddish tint and a slight rise, so the player can block or jump. */
  private startWindup() {
    const m = this.F.move!;
    const windup = m.fx === 'boulder' ? Math.max(500, this.ai.windup) : this.ai.windup;
    this.setFoe('windup', windup);
    this.foe.setTint(0xffb0a0);
    if (m.power > 0) {
      // an attack is coming: a brief red flash on top of the wind-up tint (heal moves get none: nothing to block)
      this.foe.setTintFill(0xff4040);
      this.time.delayedCall(120, () => { if (this.F.state === 'windup' && this.phase === 'fight') this.foe.setTint(0xffb0a0); });
    }
    this.say(`${this.def.name}: ${m.name}!`);
    if (m.fx === 'boulder') {
      // Polyphemus lifts a boulder over his head
      this.rock = this.fxSprite(this.foe.x + 10, this.foe.y - this.foe.displayHeight - 4, FX_FRAME.boulder, 2.4, false).setDepth(20);
    }
  }

  private foeDamage(m: EnemyMove) {
    return Math.max(1, Math.round(this.def.atk * m.power + Phaser.Math.Between(0, 2)));
  }

  private foeStrike() {
    const F = this.F;
    const m = F.move!;
    if (m.power > 0 && m.fx === 'boulder') {
      this.setFoe('strike', 260);
      this.throwBoulder(this.foeDamage(m), m.power >= 1.4);
    } else if (m.power > 0 && m.fx === 'song') {
      this.setFoe('strike', 420);
      this.foeSong(this.foeDamage(m), m.power >= 1.4);
    } else if (m.power > 0) {
      this.setFoe('strike', 180);
      F.hitDone = false;
    } else {
      this.setFoe('strike', 450);
      this.foeFrame('windup'); // drinks / refills / sugar-rushes in place
    }
    if (m.heal) {
      const heal = Math.round(this.def.hp * m.heal);
      this.foeHp = Math.min(this.def.hp, this.foeHp + heal);
      this.lastHeal = this.clock;
      this.foeHeal();
      this.floatText(this.foe.x, this.foe.y - this.foe.displayHeight - 6, `+${heal}`, '#7CFC9A');
      this.say(`${this.def.name} uses ${m.name} and recovers ${heal} HP.`);
      this.refresh();
    }
  }

  /** Hit interrupted the wind-up: drop the boulder, forget the move. */
  private cancelFoeAttack() {
    this.F.move = null;
    if (this.rock) {
      const r = this.rock;
      this.rock = null;
      this.tweens.add({ targets: r, y: FLOOR_Y - 8, alpha: 0, duration: 250, ease: 'Quad.in', onComplete: () => r.destroy() });
    }
  }

  private foeMeleeHit(m: EnemyMove) {
    const gap = Math.abs(this.F.x - this.H.x) - this.minSep;
    this.playFx(this.hero.x + 4, this.hero.y - 48, 'fx-slash', 2.5, true);
    if (gap <= this.ai.reach + 8 && this.H.air < 26) this.hitHero(this.foeDamage(m), m.power >= 1.4);
    else this.floatText(this.hero.x, this.hero.y - 96, 'miss', '#C9C9C9', 10);
  }

  /** Ranged hits resolve on arrival: walk out from under it or jump over it to dodge. */
  private rangedArrives(tx: number, dmg: number, heavy: boolean) {
    if (this.phase !== 'fight') return;
    if (Math.abs(this.H.x - tx) < 26 && this.H.air < 22) this.hitHero(dmg, heavy);
    else this.floatText(this.H.x, this.hero.y - 96, 'dodged!', '#B8F28A', 11);
  }

  /** Polyphemus hurls the boulder he is holding in an arc at where Odysseus stands now. */
  private throwBoulder(dmg: number, heavy: boolean) {
    const rock = this.rock ?? this.fxSprite(this.foe.x, this.foe.y - this.foe.displayHeight, FX_FRAME.boulder, 2.4, false).setDepth(20);
    this.rock = null;
    const sx = rock.x, sy = rock.y;
    const tx = this.H.x + 6, ty = FLOOR_Y - 44;
    this.tweens.add({
      targets: rock, x: tx, duration: 420, ease: 'Linear', angle: -360,
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        const p = tw.progress;
        rock.y = Phaser.Math.Linear(sy, ty, p) - Math.sin(p * Math.PI) * 70;
        rock.setScale(2.4 + p * 0.8);
      },
      onComplete: () => {
        rock.destroy();
        this.playFx(tx, ty, 'fx-impact', 3);
        this.burst(tx, ty + 30, 'px_dust', 26, 180);
        this.rangedArrives(tx, dmg, heavy);
      },
    });
  }

  /** The Siren sings: notes drift to Odysseus along a wave. */
  private foeSong(dmg: number, heavy: boolean) {
    const f = this.foe;
    const sx = f.x, sy = f.y - f.displayHeight * 0.8;
    const tx = this.H.x, ty = FLOOR_Y - 52;
    for (let i = 0; i < 5; i++) {
      const n = this.fxSprite(sx, sy, FX_FRAME.note, 1.2, false).setDepth(20).setAlpha(0.95);
      const ph = i * 1.3;
      this.tweens.add({
        targets: n, x: tx + Phaser.Math.Between(-12, 12), duration: 650, delay: i * 110, ease: 'Sine.in',
        onUpdate: (tw: Phaser.Tweens.Tween) => {
          n.y = Phaser.Math.Linear(sy, ty, tw.progress) + Math.sin(tw.progress * 9 + ph) * 12;
          n.angle = Math.sin(tw.progress * 12 + ph) * 20;
        },
        onComplete: () => n.destroy(),
      });
    }
    this.time.delayedCall(650 + 2 * 110, () => {
      if (this.phase !== 'fight') return;
      this.burst(tx, ty, 'px_pink', 14, 90);
      if (Math.abs(this.H.x - tx) < 26 && this.H.air < 22) this.cameras.main.flash(200, 200, 90, 180);
      this.rangedArrives(tx, dmg, heavy);
    });
  }

  private foeHeal() {
    const f = this.foe;
    for (let i = 0; i < 6; i++) {
      const s = this.fxSprite(f.x + Phaser.Math.Between(-30, 30), f.y - Phaser.Math.Between(10, 60), FX_FRAME.ambrosia, 1, false);
      this.tweens.add({ targets: s, y: s.y - 30, alpha: 0, duration: 700, delay: i * 70, onComplete: () => s.destroy() });
    }
  }

  // ---------------------------------------------------------------- hits on the hero
  private hitHero(dmg: number, heavy: boolean) {
    const H = this.H, h = this.hero;
    if (this.phase !== 'fight' || H.state === 'ko') return;
    const away = H.x <= this.F.x ? -1 : 1;
    if (H.state === 'block' && H.air === 0) {
      // the shield rings: sparks instead of blood, a point or two of chip (chip never K.O.s)
      const chip = dmg >= 8 ? 2 : 1;
      this.stats.hp = Math.max(1, this.stats.hp - chip);
      H.vx = away * (heavy ? 160 : 100);
      H.lock = 160; // block-stun: the guard stays up a moment
      this.fxSprite(h.x - away * 10, h.y - 48, FX_FRAME.spark, 2);
      this.burst(h.x - away * 10, h.y - 48, 'px_gold', 14, 130);
      this.floatText(h.x, h.y - 96, 'BLOCK', '#FFD166', 14);
      this.cameras.main.shake(heavy ? 120 : 70, heavy ? 0.006 : 0.003);
      h.setTintFill(0xfff1c1);
      this.time.delayedCall(60, () => h.clearTint());
      this.addMeter(METER_BLOCK);
      this.refresh();
      this.freeze(STOP_BLOCK);
      return;
    }
    this.stats.hp = Math.max(0, this.stats.hp - dmg);
    this.buffered = null;
    this.setHero('hurt', heavy ? 420 : 300);
    if (H.air > 0) H.vy = Math.min(H.vy, -120);
    H.vx = away * (heavy ? 240 : 150);
    h.setTintFill(0xff4040);
    this.time.delayedCall(110, () => h.clearTint());
    this.cameras.main.shake(heavy ? 320 : 180, heavy ? 0.02 : 0.01);
    this.cameras.main.flash(110, 140, 20, 20);
    this.floatText(h.x + 10, h.y - 96, `-${dmg}`, '#FF6B6B', heavy ? 20 : 16);
    this.resetCombo();
    this.addMeter(METER_HURT);
    this.refresh();
    if (this.stats.hp <= 0) return this.ko('foe');
    this.freeze(heavy ? STOP_HURT_HEAVY : STOP_HURT);
  }

  // ---------------------------------------------------------------- shared fight systems
  private addMeter(n: number) {
    const was = this.meter;
    this.meter = Math.min(METER_MAX, this.meter + n);
    battleUi.meter(this.meter);
    if (was < METER_MAX && this.meter >= METER_MAX) {
      battleUi.meterReady();
      this.floatText(this.hero.x, this.hero.y - 108, 'LAUNCHER READY — K!', '#FFD166', 13);
      this.say('Meter full — your next kick (K) is the launcher!');
    }
  }

  private resetCombo() {
    this.combo = 0;
    this.chain = [];
    battleUi.combo(0);
  }

  /** Keep both fighters inside the arena and at least minSep apart (they push, never pass). */
  private separate() {
    const H = this.H, F = this.F;
    const clampX = (x: number) => Phaser.Math.Clamp(x, ARENA.left, ARENA.right);
    H.x = clampX(H.x);
    F.x = clampX(F.x);
    const side = H.x <= F.x ? 1 : -1;
    const overlap = this.minSep - (F.x - H.x) * side;
    if (overlap <= 0) return;
    H.x = clampX(H.x - side * overlap / 2);
    F.x = clampX(F.x + side * overlap / 2);
    const still = this.minSep - (F.x - H.x) * side;
    if (still > 0) { // one of them is against a wall: the other one gives way
      if (H.x === ARENA.left || H.x === ARENA.right) F.x = H.x + side * this.minSep;
      else H.x = F.x - side * this.minSep;
    }
  }

  /** Physics state → sprites. */
  private render() {
    const H = this.H, F = this.F;
    const facing = F.x >= H.x ? 1 : -1;
    const bob = H.state === 'walk' ? -Math.abs(Math.sin(this.clock / 70)) * 2 : 0;
    this.hero.setPosition(H.x + H.lunge * facing, FLOOR_Y - H.air + bob).setFlipX(facing < 0);
    this.heroShadow.setPosition(H.x, FLOOR_Y - 2).setScale(1 - Math.min(0.5, H.air / 120));
    const float = this.def.sprite.includes('shade') ? Math.sin(this.time.now / 350) * 2 - 4 : 0; // shades hover
    this.foe.setPosition(F.x - F.lunge * facing, FLOOR_Y - F.air - F.raise + float).setFlipX(facing < 0);
    this.foeShadow.setPosition(F.x, FLOOR_Y - 2).setScale(1 - Math.min(0.5, F.air / 120));
    if (F.state === 'block') this.guardIcon.setPosition(this.foe.x - facing * this.foeHalf, this.foe.y - this.foe.displayHeight * 0.55);
  }

  /** Health bars drain smoothly: the fill catches up fast, the pale trail behind it slowly. Numbers stay exact. */
  private drainBars(ms: number) {
    const s = this.shown;
    const kFill = 1 - Math.exp(-ms / 70), kTrail = 1 - Math.exp(-ms / 380);
    const me = this.stats.hp / this.stats.maxHp, foe = this.foeHp / this.def.hp;
    s.me += (me - s.me) * kFill;
    s.foe += (foe - s.foe) * kFill;
    s.meTrail = Math.max(s.me, s.meTrail + (s.me - s.meTrail) * kTrail);
    s.foeTrail = Math.max(s.foe, s.foeTrail + (s.foe - s.foeTrail) * kTrail);
    battleUi.bars(
      { name: `Odysseus (Lv ${this.stats.level})`, hp: this.stats.hp, max: this.stats.maxHp, fill: s.me, trail: s.meTrail },
      { name: this.def.name, hp: this.foeHp, max: this.def.hp, fill: s.foe, trail: s.foeTrail },
    );
  }

  private say(text: string) {
    battleUi.log(text);
  }

  private refresh() {
    updateHud(this.stats);
  }

  // ---------------------------------------------------------------- hit effects on the foe
  private hitFoe(dmg: number, crit: boolean, kind: AttackKind, juggle: boolean, label: string) {
    const f = this.foe;
    const cx = f.x, cy = f.y - f.displayHeight * 0.55;
    const heavy = crit || kind !== 'punch' || juggle;
    // brief white then red flash
    f.setTintFill(0xffffff);
    this.time.delayedCall(50, () => f.setTintFill(0xff5050));
    this.time.delayedCall(120, () => { f.clearTint(); if (this.F.state === 'windup') f.setTint(0xffb0a0); });
    if (crit) {
      // Athena's owl appears and the screen glows gold
      const owl = this.fxSprite(this.hero.x + 30, this.hero.y - 104, FX_FRAME.owl, 2.5, false).setAlpha(0);
      this.tweens.add({ targets: owl, alpha: 1, y: owl.y - 10, duration: 200, yoyo: true, hold: 200, onComplete: () => owl.destroy() });
      this.cameras.main.flash(200, 246, 211, 107);
    }
    this.playFx(cx, cy, 'fx-slash', crit || kind === 'launcher' ? 3.5 : heavy ? 3 : 2.2);
    this.playFx(cx + 6, cy + 6, 'fx-impact', crit || kind === 'launcher' ? 2.5 : heavy ? 2 : 1.4);
    this.burst(cx, cy, crit || kind === 'launcher' ? 'px_gold' : 'px_white', crit || kind === 'launcher' ? 22 : heavy ? 16 : 10, 140);
    const shake = kind === 'launcher' ? [240, 0.014] : crit ? [220, 0.014] : kind === 'kick' ? [150, 0.009] : juggle ? [140, 0.008] : [80, 0.004];
    this.cameras.main.shake(shake[0], shake[1]);
    const color = crit ? '#FFD166' : juggle || kind === 'launcher' ? '#FFB347' : '#FFFFFF';
    const size = crit || kind === 'launcher' ? 22 : juggle ? 20 : kind === 'kick' ? 17 : 15;
    this.floatText(cx + Phaser.Math.Between(-6, 6), f.y - f.displayHeight - 6, `${dmg}${crit ? '!' : ''}`, color, size);
    if (label) this.floatText(cx, f.y - f.displayHeight - 22, label, '#FFD166', 11);
  }

  // ---------------------------------------------------------------- K.O. & endings
  private ko(winner: 'hero' | 'foe') {
    this.phase = 'ko';
    this.hitStop = 0;
    this.pauseFighters(false);
    this.buffered = null;
    this.guardIcon.setVisible(false);
    this.cancelFoeAttack();
    this.render();
    this.say('K.O.!');
    this.bigText('K.O.!', '#FF6B6B', 56, 1100);
    this.cameras.main.shake(400, 0.02);
    this.cameras.main.flash(160, 255, 255, 255);
    // slow motion: scene clock and tweens at KO_SLOWMO; tween durations below are in slowed time
    this.time.timeScale = KO_SLOWMO;
    this.tweens.timeScale = KO_SLOWMO;
    if (winner === 'hero') {
      const f = this.foe, away = f.x >= this.hero.x ? 1 : -1;
      this.tweens.killTweensOf(f);
      this.foeFrame('hurt');
      f.setTintFill(0xffffff);
      const x0 = f.x, y0 = f.y;
      this.tweens.add({
        targets: f, x: Phaser.Math.Clamp(x0 + away * 40, ARENA.left, ARENA.right), angle: away * 30, duration: 260, ease: 'Quad.out',
        onUpdate: (tw: Phaser.Tweens.Tween) => { f.y = Math.min(FLOOR_Y, y0 - Math.sin(tw.progress * Math.PI) * 30 + tw.progress * (FLOOR_Y - y0)); },
        onComplete: () => f.clearTint(),
      });
    } else {
      this.hero.anims.stop();
      this.hero.setFrame(HERO_FRAME.hurt);
      this.tweens.add({ targets: this.hero, angle: -80, y: FLOOR_Y + 10, alpha: 0.3, duration: 260, ease: 'Quad.in' });
    }
    this.time.delayedCall(KO_SLOWMO_MS * KO_SLOWMO, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      if (winner === 'hero') void this.win();
      else void this.lose();
    });
  }

  private async win() {
    const f = this.foe;
    this.tweens.killTweensOf(f);
    this.foeFrame('hurt');
    for (let i = 0; i < 3; i++) {
      f.setTintFill(0xffffff); await this.wait(70); f.clearTint(); await this.wait(70);
    }
    // the defeated foe dissolves into motes that drift up and fade
    this.burst(f.x, f.y - f.displayHeight / 2, this.def.sprite.includes('shade') ? 'px_pink' : 'px_white', 40, 120, -80);
    this.tweens.add({ targets: f, alpha: 0, scaleX: f.scaleX * 1.3, scaleY: f.scaleY * 0.2, y: f.y + 4, duration: 500, ease: 'Quad.in' });
    this.foeShadow.setVisible(false);
    this.hero.anims.stop();
    this.hero.setAngle(0).setFrame(HERO_FRAME.victory);
    this.tweens.add({ targets: this.hero, y: this.hero.y - 8, duration: 160, yoyo: true, repeat: 1 });

    this.stats.xp += this.def.xp;
    let msg = `${this.def.outro ?? `The ${this.def.name} is defeated!`} +${this.def.xp} XP.`;
    while (this.stats.xp >= this.stats.level * XP_PER_LEVEL) {
      this.stats.xp -= this.stats.level * XP_PER_LEVEL;
      this.stats.level++;
      this.stats.maxHp += 8;
      this.stats.atk += 2;
      this.stats.hp = this.stats.maxHp;
      msg += ` The gods favour you: level ${this.stats.level}!`;
    }
    this.say(msg);
    this.refresh();
    await this.wait(1800);
    this.finish('win');
  }

  private async lose() {
    this.say('You fall... and wake far from the cave. Ithaca must wait.');
    await this.wait(1600);
    this.finish('lose');
  }

  private finish(result: BattleResult) {
    if (result === 'lose') this.stats.hp = this.stats.maxHp; // wake up healed
    this.registry.set('stats', this.stats);
    updateHud(this.stats);
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      battleUi.hide();
      const map = this.scene.get(this.data_.mapKey);
      this.scene.stop();
      this.scene.resume(this.data_.mapKey);
      map.events.emit('battle-end', result);
    });
  }

  // ---------------------------------------------------------------- helpers
  private foeFrame(pose: keyof typeof FOE_FRAME) {
    if (!this.foeAnimated) return;
    this.foe.anims.stop();
    this.foe.setFrame(FOE_FRAME[pose]);
  }

  private foeIdle() {
    if (this.foeAnimated) this.foe.play(`${this.def.sprite}-idle`, true);
  }

  private heroIdle() {
    this.hero.setAngle(0).setAlpha(1);
    this.hero.play('gk_odysseus-idle', true);
  }

  /** A fixed hero frame (stops the idle animation). */
  private heroPose(frame: number) {
    if (this.hero.anims.isPlaying) this.hero.anims.stop();
    if (String(this.hero.frame.name) !== String(frame)) this.hero.setFrame(frame);
  }

  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(ms, r));
  }

  /** Big centre-screen announcement (ROUND 1, FIGHT!, K.O.!, combo milestones). */
  private bigText(text: string, color: string, size: number, holdMs: number, y = 104) {
    const t = this.add.text(240, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#2a1d18', strokeThickness: 6 })
      .setOrigin(0.5).setResolution(4).setDepth(200).setScale(1.8).setAlpha(0).setScrollFactor(0); // screen-fixed: ignores the camera follow
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, scale: 1.15, delay: Math.max(0, holdMs - 160), duration: 160, onComplete: () => t.destroy() });
    return t;
  }

  /** A fading copy of a moving sprite (motion trail), at most one every 30 ms. */
  private lastGhost = 0;
  private afterImage(s: Phaser.GameObjects.Sprite) {
    if (this.time.now - this.lastGhost < 30) return;
    this.lastGhost = this.time.now;
    const g = this.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY)
      .setScale(s.scaleX, s.scaleY).setAlpha(0.35).setDepth(s.depth - 1).setFlipX(s.flipX).setAngle(s.angle);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private playFx(x: number, y: number, anim: string, scale: number, flip = false) {
    const s = this.add.sprite(x, y, 'gk_fx', 0).setScale(scale).setDepth(30).setFlipX(flip);
    s.play(anim);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  private fxSprite(x: number, y: number, frame: number, scale: number, autoFade = true) {
    const s = this.add.sprite(x, y, 'gk_fx', frame).setScale(scale).setDepth(30);
    if (autoFade) this.tweens.add({ targets: s, alpha: 0, scale: scale * 1.4, duration: 350, onComplete: () => s.destroy() });
    return s;
  }

  /** One-shot particle burst. gravityY < 0 makes motes rise. */
  private burst(x: number, y: number, tex: string, count: number, speed: number, gravityY = 300) {
    const p = this.add.particles(x, y, tex, {
      speed: { min: speed * 0.3, max: speed }, angle: { min: 0, max: 360 }, lifespan: { min: 300, max: 650 },
      scale: { start: 1, end: 0.3 }, alpha: { start: 1, end: 0 }, gravityY, emitting: false,
    }).setDepth(40);
    p.explode(count);
    this.time.delayedCall(800, () => p.destroy());
  }

  private ambrosia() {
    const h = this.hero;
    for (let i = 0; i < 10; i++) {
      const s = this.fxSprite(h.x + Phaser.Math.Between(-30, 30), h.y - Phaser.Math.Between(10, 80), FX_FRAME.ambrosia, 1.2, false);
      this.tweens.add({ targets: s, y: s.y - 40, alpha: 0, duration: 800, delay: i * 60, onComplete: () => s.destroy() });
    }
    this.burst(h.x, h.y - 50, 'px_gold', 12, 60, -120);
  }

  /** Tiny solid-colour squares for particles (Canvas renderer can't tint, so each colour is its own texture). */
  private makePixelTextures() {
    const cols: Record<string, number> = { px_white: 0xffffff, px_gold: 0xf6d36b, px_dust: 0x9c8574, px_pink: 0xff8fc7 };
    for (const [k, c] of Object.entries(cols)) {
      if (this.textures.exists(k)) continue;
      const g = this.make.graphics({}, false);
      g.fillStyle(c, 1).fillRect(0, 0, 4, 4);
      g.generateTexture(k, 4, 4);
      g.destroy();
    }
  }

  private floatText(x: number, y: number, text: string, color: string, size = 16) {
    // never below 12 px: the canvas is 480×270 and upscaled, so smaller pixel text breaks up
    const px = Math.max(12, size);
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${px}px`, color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setResolution(4).setDepth(100);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }
}
