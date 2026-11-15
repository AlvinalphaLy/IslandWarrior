import Phaser from 'phaser';
import {
  ENEMIES, EnemyDef, EnemyMove, FOE_FRAME, FX_FRAME, GREEK_SHEETS, HERO_FRAME, PlayerStats, POTION_HEAL, START_STATS, XP_PER_LEVEL,
} from '../data/enemies';
import { battleUi, BattleCommand, updateHud } from '../ui';

export interface BattleData {
  enemyId: string;
  /** key of the map scene to resume afterwards */
  mapKey: string;
}

export type BattleResult = 'win' | 'run' | 'lose';

const COMMANDS: BattleCommand[] = ['attack', 'defend', 'potion', 'run'];
// everything stands in the top ~2/3 of the screen: the HTML command panel covers the bottom
const HERO_HOME = { x: 72, y: 186 };
const FOE_HOME = { x: 290, y: 158 };
const HERO_SCALE = 2.2;

/**
 * Turn-based battle in Polyphemus' cave: Odysseus (seen from behind) against one enemy.
 * Odyssey enemies (tools/greek_battlers.py) have wind-up / strike / hurt frames; Fantasy Battlers enemies are
 * still images and get the same moves through tweens alone.
 */
export class BattleScene extends Phaser.Scene {
  private def!: EnemyDef;
  private data_!: BattleData;
  private stats!: PlayerStats;
  private foeHp = 0;
  private foe!: Phaser.GameObjects.Sprite;
  private foeAnimated = false;
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
    this.makePixelTextures();
    this.add.image(0, 0, 'cave_bg').setOrigin(0).setScale(2);

    // foe on the sunlit sand circle
    this.foeAnimated = this.def.sprite in GREEK_SHEETS;
    const fh = this.foeAnimated ? GREEK_SHEETS[this.def.sprite].h : this.textures.get(this.def.sprite).getSourceImage().height;
    const foeScale = this.foeAnimated ? (fh > 32 ? 2.2 : 2.5) : Math.min(2, 130 / fh);
    this.add.ellipse(FOE_HOME.x, FOE_HOME.y - 2, 26 * foeScale, 5 * foeScale, 0x000000, 0.3);
    this.foe = this.add.sprite(FOE_HOME.x, FOE_HOME.y, this.def.sprite, this.foeAnimated ? 0 : undefined).setOrigin(0.5, 1).setScale(foeScale);
    this.foeIdle();
    // shades float
    if (this.def.sprite.includes('shade')) this.tweens.add({ targets: this.foe, y: FOE_HOME.y - 4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Odysseus, seen from behind, bottom-left
    this.add.ellipse(HERO_HOME.x, HERO_HOME.y - 3, 60, 10, 0x000000, 0.3);
    this.hero = this.add.sprite(HERO_HOME.x, HERO_HOME.y, 'gk_odysseus', 0).setOrigin(0.5, 1).setScale(HERO_SCALE).setDepth(5);
    this.hero.play('gk_odysseus-idle');

    this.cameras.main.fadeIn(250, 0, 0, 0);
    battleUi.show(this.def.name, (c) => this.choose(c));
    this.refresh();
    this.say(this.def.intro);
    // intro: the foe steps forward with a wind-up pose
    this.foeFrame('windup');
    this.time.delayedCall(450, () => this.foeIdle());
    this.time.delayedCall(900, () => this.playerTurn());

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
    this.heroIdle();
    battleUi.enable(true);
    battleUi.select(COMMANDS[this.selected]);
    this.say('What will you do, son of Laertes?');
  }

  private async choose(c: BattleCommand) {
    if (this.busy) return;
    this.selected = COMMANDS.indexOf(c);
    if (c === 'potion' && this.stats.potions <= 0) return this.say('No ambrosia left!');
    if (c === 'run' && this.def.boss) return this.say('The cave is sealed by a great stone. There is no escape!');
    this.busy = true;
    battleUi.enable(false);

    if (c === 'attack') {
      const crit = Math.random() < 0.12;
      const dmg = (this.stats.atk + Phaser.Math.Between(-1, 2)) * (crit ? 2 : 1);
      await this.heroAttack(dmg, crit);
    } else if (c === 'defend') {
      this.defending = true;
      this.hero.anims.stop();
      this.hero.setFrame(HERO_FRAME.guard);
      this.burst(this.hero.x - 4, this.hero.y - 48, 'px_gold', 10, 60);
      this.fxSprite(this.hero.x - 4, this.hero.y - 48, FX_FRAME.spark, 1.2);
      this.say('You raise your bronze shield.');
      await this.wait(500);
    } else if (c === 'potion') {
      const heal = Math.min(POTION_HEAL, this.stats.maxHp - this.stats.hp);
      this.stats.potions--;
      this.stats.hp += heal;
      this.hero.anims.stop();
      this.hero.setFrame(HERO_FRAME.victory);
      this.ambrosia();
      this.floatText(this.hero.x, this.hero.y - 92, `+${heal}`, '#B8F28A');
      this.say(`You taste ambrosia, food of the gods, and recover ${heal} HP.`);
      this.refresh();
      await this.wait(800);
      this.heroIdle();
    } else if (c === 'run') {
      if (Math.random() < 0.65) {
        this.say('You slip away like Nobody!');
        this.hero.setFlipX(true);
        this.tweens.add({ targets: this.hero, x: -60, duration: 500, ease: 'Quad.in' });
        await this.wait(800);
        return this.finish('run');
      }
      this.say("Couldn't get away!");
      await this.tween({ targets: this.hero, x: HERO_HOME.x - 14, duration: 120, yoyo: true });
    }
    this.refresh();
    if (this.foeHp <= 0) return this.win();
    await this.wait(350);
    await this.enemyTurn();
  }

  // ---------------------------------------------------------------- hero attack
  private async heroAttack(dmg: number, crit: boolean) {
    const h = this.hero;
    h.anims.stop();
    if (crit) {
      // Athena's owl appears and the screen glows gold
      this.say('Grey-eyed Athena guides your spear!');
      const owl = this.fxSprite(h.x + 30, h.y - 104, FX_FRAME.owl, 2.5, false).setAlpha(0);
      this.tweens.add({ targets: owl, alpha: 1, y: owl.y - 10, duration: 300, yoyo: true, hold: 300, onComplete: () => owl.destroy() });
      this.cameras.main.flash(250, 246, 211, 107);
      await this.wait(600);
    }
    // wind-up: pull the spear back
    h.setFrame(HERO_FRAME.windup);
    await this.tween({ targets: h, x: HERO_HOME.x - 6, y: HERO_HOME.y + 3, duration: 160, ease: 'Quad.out' });
    // dash in (with after-images) and thrust: the spear tip lands on the foe's chest
    h.setFrame(HERO_FRAME.thrust);
    const target = { x: this.foe.x - 46, y: this.foe.y + 26 };
    await this.tween({
      targets: h, x: target.x, y: target.y, duration: 130, ease: 'Quad.in',
      onUpdate: () => this.afterImage(h),
    });
    // impact + hit-stop
    this.foeHp = Math.max(0, this.foeHp - dmg);
    this.hitFoe(dmg, crit);
    this.refresh();
    this.say(`${crit ? 'A godlike thrust! ' : ''}Your spear strikes ${this.def.boss ? '' : 'the '}${this.def.name} for ${dmg}.`);
    await this.wait(crit ? 140 : 80);
    // hop back home
    h.setFrame(HERO_FRAME.windup);
    await this.tween({ targets: h, x: HERO_HOME.x, y: HERO_HOME.y, duration: 260, ease: 'Quad.out' });
    this.heroIdle();
    if (this.foeHp > 0) this.foeIdle();
  }

  private hitFoe(dmg: number, crit: boolean) {
    const f = this.foe;
    const cx = f.x, cy = f.y - f.displayHeight * 0.55;
    this.foeFrame('hurt');
    f.setTintFill(0xffffff);
    this.time.delayedCall(90, () => f.clearTint());
    this.tweens.add({ targets: f, x: FOE_HOME.x + 10, duration: 60, yoyo: true, repeat: 1, onComplete: () => f.setX(FOE_HOME.x) });
    this.playFx(cx, cy, 'fx-slash', crit ? 3.5 : 2.5);
    this.playFx(cx + 6, cy + 6, 'fx-impact', crit ? 2.5 : 1.6);
    this.burst(cx, cy, crit ? 'px_gold' : 'px_white', crit ? 22 : 12, 140);
    this.cameras.main.shake(crit ? 260 : 120, crit ? 0.016 : 0.006);
    this.floatText(cx, f.y - f.displayHeight - 6, `${dmg}${crit ? '!' : ''}`, crit ? '#FFD166' : '#FFFFFF', crit ? 22 : 16);
  }

  // ---------------------------------------------------------------- enemy turn
  private pickMove(): EnemyMove {
    const moves = this.def.moves.filter((m) => !m.heal || this.foeHp < this.def.hp);
    let r = Math.random() * moves.reduce((s, m) => s + m.weight, 0);
    for (const m of moves) if ((r -= m.weight) <= 0) return m;
    return moves[0];
  }

  private async enemyTurn() {
    const m = this.pickMove();
    this.say(`${this.def.name} uses ${m.name}!`);
    let dmg = 0;
    if (m.power > 0) {
      dmg = Math.max(1, Math.round(this.def.atk * m.power + Phaser.Math.Between(0, 2)));
      if (this.defending) dmg = Math.max(1, Math.floor(dmg / 2));
    }

    if (m.power > 0) {
      if (m.fx === 'boulder') await this.foeBoulder();
      else if (m.fx === 'song') await this.foeSong();
      else await this.foeMelee();
      this.stats.hp = Math.max(0, this.stats.hp - dmg);
      this.hitHero(dmg, m.fx === 'boulder');
      this.say(`${this.def.name} uses ${m.name}! You take ${dmg} damage${this.defending ? ' (blocked by your shield)' : ''}.`);
    }
    if (m.heal) {
      const heal = Math.round(this.def.hp * m.heal);
      this.foeHp = Math.min(this.def.hp, this.foeHp + heal);
      this.foeHeal();
      this.floatText(this.foe.x, this.foe.y - this.foe.displayHeight - 6, `+${heal}`, '#7CFC9A');
      this.say(`${this.def.name} uses ${m.name}!${dmg ? ` You take ${dmg} damage.` : ''} It recovers ${heal} HP.`);
    }
    this.refresh();
    await this.wait(550);
    this.foeIdle();
    if (this.stats.hp <= 0) return this.lose();
    await this.wait(350);
    this.playerTurn();
  }

  /** Wind-up, lunge toward Odysseus, strike frame, then step back. */
  private async foeMelee() {
    const f = this.foe;
    this.foeFrame('windup');
    await this.tween({ targets: f, y: f.y - 6, duration: 220, ease: 'Quad.out' });
    this.foeFrame('strike');
    await this.tween({
      targets: f, x: FOE_HOME.x - 130, y: FOE_HOME.y + 12, duration: 140, ease: 'Quad.in',
      onUpdate: () => this.afterImage(f),
    });
    this.playFx(this.hero.x + 4, this.hero.y - 48, 'fx-slash', 2.5, true);
    this.tweens.add({ targets: f, x: FOE_HOME.x, y: FOE_HOME.y, duration: 320, delay: 120, ease: 'Quad.out' });
  }

  /** Polyphemus lifts a boulder over his head and hurls it in an arc. */
  private async foeBoulder() {
    const f = this.foe;
    this.foeFrame('windup');
    const sx = f.x + 10, sy = f.y - f.displayHeight - 4;
    const rock = this.fxSprite(sx, sy, FX_FRAME.boulder, 2.4, false).setDepth(20);
    this.tweens.add({ targets: rock, y: sy - 6, duration: 350, yoyo: true, repeat: 0 });
    await this.wait(500);
    this.foeFrame('strike');
    const tx = this.hero.x + 6, ty = this.hero.y - 44;
    await this.tween({
      targets: rock, x: tx, duration: 420, ease: 'Linear', angle: -360,
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        const p = tw.progress;
        rock.y = Phaser.Math.Linear(sy, ty, p) - Math.sin(p * Math.PI) * 70;
        rock.setScale(2.4 + p * 0.8);
      },
    });
    rock.destroy();
    this.playFx(tx, ty, 'fx-impact', 3);
    this.burst(tx, ty + 30, 'px_dust', 26, 180);
  }

  /** The Siren sings: notes drift to Odysseus along a wave. */
  private async foeSong() {
    const f = this.foe;
    this.foeFrame('windup');
    await this.wait(250);
    this.foeFrame('strike');
    const sx = f.x, sy = f.y - f.displayHeight * 0.8;
    const tx = this.hero.x, ty = this.hero.y - 52;
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
    await this.wait(650 + 4 * 110);
    this.cameras.main.flash(200, 200, 90, 180);
    this.burst(tx, ty, 'px_pink', 14, 90);
  }

  private hitHero(dmg: number, heavy: boolean) {
    const h = this.hero;
    h.anims.stop();
    h.setFrame(this.defending ? HERO_FRAME.guard : HERO_FRAME.hurt);
    if (this.defending) {
      // the shield rings: sparks instead of blood
      this.fxSprite(h.x - 4, h.y - 48, FX_FRAME.spark, 2);
      this.burst(h.x - 4, h.y - 48, 'px_gold', 14, 130);
    } else {
      h.setTintFill(0xff4040);
      this.time.delayedCall(110, () => h.clearTint());
    }
    this.tweens.add({ targets: h, x: HERO_HOME.x - (heavy ? 18 : 10), duration: 70, yoyo: true, onComplete: () => h.setX(HERO_HOME.x) });
    this.cameras.main.shake(heavy ? 320 : 180, heavy ? 0.02 : 0.01);
    if (!this.defending) this.cameras.main.flash(110, 140, 20, 20);
    this.floatText(h.x + 10, h.y - 96, `-${dmg}`, '#FF6B6B', heavy ? 20 : 16);
  }

  private foeHeal() {
    const f = this.foe;
    this.foeFrame('windup');
    for (let i = 0; i < 6; i++) {
      const s = this.fxSprite(f.x + Phaser.Math.Between(-30, 30), f.y - Phaser.Math.Between(10, 60), FX_FRAME.ambrosia, 1, false);
      this.tweens.add({ targets: s, y: s.y - 30, alpha: 0, duration: 700, delay: i * 70, onComplete: () => s.destroy() });
    }
  }

  // ---------------------------------------------------------------- endings
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
    this.hero.anims.stop();
    this.hero.setFrame(HERO_FRAME.victory);
    this.tweens.add({ targets: this.hero, y: HERO_HOME.y - 8, duration: 160, yoyo: true, repeat: 1 });

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
    this.hero.anims.stop();
    this.hero.setFrame(HERO_FRAME.hurt);
    this.tweens.add({ targets: this.hero, angle: -80, y: HERO_HOME.y + 10, alpha: 0.3, duration: 600, ease: 'Quad.in' });
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

  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(ms, r));
  }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig) {
    return new Promise<void>((r) => this.tweens.add({ ...cfg, onComplete: () => r() }));
  }

  /** A fading copy of a moving sprite (motion trail), at most one every 30 ms. */
  private lastGhost = 0;
  private afterImage(s: Phaser.GameObjects.Sprite) {
    if (this.time.now - this.lastGhost < 30) return;
    this.lastGhost = this.time.now;
    const g = this.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY)
      .setScale(s.scaleX, s.scaleY).setAlpha(0.35).setDepth(s.depth - 1).setFlipX(s.flipX);
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
    const t = this.add.text(x, y, text, { fontFamily: '"Pixelify Sans", monospace', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setResolution(4).setDepth(100);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }
}
