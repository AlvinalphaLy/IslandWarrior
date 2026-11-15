import Phaser from 'phaser';
import { ENEMIES, EnemyDef, EnemyMove, PlayerStats, POTION_HEAL, START_STATS, XP_PER_LEVEL } from '../data/enemies';
import { battleUi, BattleCommand, updateHud } from '../ui';
import { createCharacterAnims } from '../entities/Character';

export interface BattleData {
  enemyId: string;
  /** key of the map scene to resume afterwards */
  mapKey: string;
}

export type BattleResult = 'win' | 'run' | 'lose';

const COMMANDS: BattleCommand[] = ['attack', 'defend', 'potion', 'run'];

/** Simple turn-based battle against one Fantasy Battlers enemy. Runs on top of the paused map scene. */
export class BattleScene extends Phaser.Scene {
  private def!: EnemyDef;
  private data_!: BattleData;
  private stats!: PlayerStats;
  private foeHp = 0;
  private foe!: Phaser.GameObjects.Image;
  private hero!: Phaser.GameObjects.Sprite;
  private busy = true;
  private defending = false;
  private selected = 0;

  constructor() {
    super('battle');
  }

  init(data: BattleData) {
    this.data_ = data;
    this.def = ENEMIES[data.enemyId];
    this.stats = { ...START_STATS, ...(this.registry.get('stats') as PlayerStats | undefined) };
    this.foeHp = this.def.hp;
    this.busy = true;
    this.defending = false;
    this.selected = 0;
  }

  create() {
    const { width: w, height: h } = this.scale.gameSize;
    // backdrop: dark sewer gradient + arena floor
    const g = this.add.graphics();
    // vertical gradient as solid bands (gradient fills are WebGL-only; this works in Canvas too)
    const top = Phaser.Display.Color.ValueToColor(0x1a2420), bottom = Phaser.Display.Color.ValueToColor(0x07090c);
    const BANDS = 18;
    for (let i = 0; i < BANDS; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, BANDS - 1, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(0, Math.floor((i * h) / BANDS), w, Math.ceil(h / BANDS) + 1);
    }
    g.fillStyle(0x2b3a2f, 1).fillEllipse(w / 2, 190, 300, 54);
    g.fillStyle(0x000000, 0.35).fillEllipse(w / 2, 192, 120, 18);

    // battlers are drawn at 2x (the largest, 96px, becomes 192px and still fits above the menu)
    this.foe = this.add.image(w / 2, 196, this.def.sprite).setOrigin(0.5, 1).setScale(2);
    this.tweens.add({ targets: this.foe, scaleY: 2.06, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // the player, seen from behind, bottom-left
    const skin = (this.registry.get('playerSkin') as string | undefined) ?? 'adam';
    createCharacterAnims(this, skin);
    this.hero = this.add.sprite(70, 262, skin, 0).setOrigin(0.5, 1).setScale(3);
    this.hero.play(`${skin}-idle-up`);

    this.cameras.main.fadeIn(250, 0, 0, 0);
    battleUi.show(this.def.name, (c) => this.choose(c));
    this.refresh();
    this.say(this.def.intro);
    this.time.delayedCall(700, () => this.playerTurn());

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.choose('attack'));
    kb.on('keydown-TWO', () => this.choose('defend'));
    kb.on('keydown-THREE', () => this.choose('potion'));
    kb.on('keydown-FOUR', () => this.choose('run'));
    kb.on('keydown-LEFT', () => this.move(-1)); kb.on('keydown-UP', () => this.move(-1)); kb.on('keydown-A', () => this.move(-1)); kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1)); kb.on('keydown-DOWN', () => this.move(1)); kb.on('keydown-D', () => this.move(1)); kb.on('keydown-S', () => this.move(1));
    for (const k of ['ENTER', 'SPACE', 'E']) kb.on(`keydown-${k}`, () => this.choose(COMMANDS[this.selected]));
  }

  private move(d: number) {
    if (this.busy) return;
    this.selected = (this.selected + d + COMMANDS.length) % COMMANDS.length;
    battleUi.select(COMMANDS[this.selected]);
  }

  private say(text: string) {
    battleUi.log(text);
  }

  private refresh() {
    battleUi.bars(this.def.name, this.foeHp, this.def.hp, this.stats);
    updateHud(this.stats);
  }

  private playerTurn() {
    this.busy = false;
    this.defending = false;
    battleUi.enable(true);
    battleUi.select(COMMANDS[this.selected]);
    this.say(`What will you do?`);
  }

  private choose(c: BattleCommand) {
    if (this.busy) return;
    this.selected = COMMANDS.indexOf(c);
    if (c === 'potion' && this.stats.potions <= 0) return this.say('No potions left!');
    if (c === 'run' && this.def.boss) return this.say('There is no escape from this fight!');
    this.busy = true;
    battleUi.enable(false);

    if (c === 'attack') {
      const crit = Math.random() < 0.12;
      const dmg = (this.stats.atk + Phaser.Math.Between(-1, 2)) * (crit ? 2 : 1);
      this.foeHp = Math.max(0, this.foeHp - dmg);
      this.lunge(this.hero, -18);
      this.hitFx(this.foe, dmg, crit);
      this.say(`${crit ? 'Critical hit! ' : ''}You hit the ${this.def.name} for ${dmg}.`);
    } else if (c === 'defend') {
      this.defending = true;
      this.say('You raise your guard.');
    } else if (c === 'potion') {
      const heal = Math.min(POTION_HEAL, this.stats.maxHp - this.stats.hp);
      this.stats.potions--;
      this.stats.hp += heal;
      this.floatText(this.hero.x, this.hero.y - 90, `+${heal}`, '#7CFC9A');
      this.say(`You drink a potion and recover ${heal} HP.`);
    } else if (c === 'run') {
      if (Math.random() < 0.65) {
        this.say('You got away safely!');
        this.refresh();
        return void this.time.delayedCall(800, () => this.finish('run'));
      }
      this.say("Couldn't get away!");
    }
    this.refresh();
    if (this.foeHp <= 0) return void this.time.delayedCall(700, () => this.win());
    this.time.delayedCall(900, () => this.enemyTurn());
  }

  private pickMove(): EnemyMove {
    const moves = this.def.moves.filter((m) => !m.heal || this.foeHp < this.def.hp);
    let r = Math.random() * moves.reduce((s, m) => s + m.weight, 0);
    for (const m of moves) if ((r -= m.weight) <= 0) return m;
    return moves[0];
  }

  private enemyTurn() {
    const m = this.pickMove();
    let text = `${this.def.name} uses ${m.name}!`;
    if (m.heal) {
      const heal = Math.round(this.def.hp * m.heal);
      this.foeHp = Math.min(this.def.hp, this.foeHp + heal);
      this.floatText(this.foe.x, this.foe.y - this.foe.displayHeight - 4, `+${heal}`, '#7CFC9A');
      text += ` It recovers ${heal} HP.`;
    }
    if (m.power > 0) {
      let dmg = Math.max(1, Math.round(this.def.atk * m.power + Phaser.Math.Between(0, 2)));
      if (this.defending) dmg = Math.max(1, Math.floor(dmg / 2));
      this.stats.hp = Math.max(0, this.stats.hp - dmg);
      this.lunge(this.foe, 14);
      this.cameras.main.shake(180, 0.01);
      this.cameras.main.flash(120, 140, 20, 20);
      this.floatText(this.hero.x, this.hero.y - 90, `-${dmg}`, '#FF6B6B');
      text += ` You take ${dmg} damage${this.defending ? ' (guarded)' : ''}.`;
    }
    this.say(text);
    this.refresh();
    if (this.stats.hp <= 0) return void this.time.delayedCall(900, () => this.lose());
    this.time.delayedCall(900, () => this.playerTurn());
  }

  private win() {
    this.tweens.add({ targets: this.foe, alpha: 0, scaleX: 0.2, duration: 450 });
    this.stats.xp += this.def.xp;
    let msg = `The ${this.def.name} is defeated! +${this.def.xp} XP.`;
    while (this.stats.xp >= this.stats.level * XP_PER_LEVEL) {
      this.stats.xp -= this.stats.level * XP_PER_LEVEL;
      this.stats.level++;
      this.stats.maxHp += 8;
      this.stats.atk += 2;
      this.stats.hp = this.stats.maxHp;
      msg += ` Level up! You are now level ${this.stats.level}.`;
    }
    this.say(msg);
    this.refresh();
    this.time.delayedCall(1600, () => this.finish('win'));
  }

  private lose() {
    this.tweens.add({ targets: this.hero, alpha: 0.2, duration: 400 });
    this.say('You collapse... everything goes dark.');
    this.time.delayedCall(1600, () => this.finish('lose'));
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

  // ---------------------------------------------------------------- effects
  private lunge(target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, dy: number) {
    this.tweens.add({ targets: target, y: (target as unknown as { y: number }).y + dy, duration: 90, yoyo: true });
  }

  private hitFx(target: Phaser.GameObjects.Image, dmg: number, crit: boolean) {
    target.setTintFill(0xffffff);
    this.time.delayedCall(90, () => target.clearTint());
    this.tweens.add({ targets: target, x: target.x + 6, duration: 40, yoyo: true, repeat: 2 });
    this.floatText(target.x, target.y - target.displayHeight - 4, `${dmg}${crit ? '!' : ''}`, crit ? '#FFD166' : '#FFFFFF');
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: '"Pixelify Sans", monospace', fontSize: '16px', color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setResolution(4).setDepth(100);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }
}
