import Phaser from 'phaser';

/**
 * String the bow of Odysseus: a mash mini-game launched over the paused map (like a battle).
 *
 * A recurve bow is strung by bending its limbs back against their curve, not by pulling it forward like a longbow
 * (the suitors' mistake). On screen the unstrung bow's tips curl forward, away from you; every SPACE (or tap) bends
 * the limbs back toward their working shape, while the bow keeps springing back, harder the further it is bent.
 * Bend it all the way before the time runs out and the string snaps onto the top tip: the map gets 'bow-end' (true).
 * Time out or ESC: 'bow-end' (false).
 */
export interface BowGameData {
  mapKey: string;
}

const TIME_S = 10;
const PUSH = 0.07; // bend gained per press
const SPRING = 0.15; // bend lost per second (times 0.5 + bend: the further, the harder it fights)
const FONT = { fontFamily: '"Pixelify Sans", monospace', color: '#fdf6e3' };

export class BowScene extends Phaser.Scene {
  private data_!: BowGameData;
  private bend = 0;
  private timeLeft = TIME_S;
  private over = false;
  private g!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private timer!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private keyHint!: Phaser.GameObjects.Text;
  private twang = 0; // string vibration after it snaps on
  private shakeUntil = 0;

  constructor() {
    super('bowstring');
  }

  init(data: BowGameData) {
    this.data_ = data;
    this.bend = 0;
    this.timeLeft = TIME_S;
    this.over = false;
    this.twang = 0;
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, 0x0a0812, 0.82).setOrigin(0);
    this.add
      .text(W / 2, 14, 'STRING THE BOW OF ODYSSEUS', { ...FONT, fontSize: '12px', color: '#ffe08a' })
      .setOrigin(0.5, 0)
;
    this.add
      .text(W / 2, 34, "Don't force it forward like a longbow: bend the curve back!", { ...FONT, fontSize: '7px', color: '#d9cfc0' })
      .setOrigin(0.5, 0)
;
    this.g = this.add.graphics();
    this.meter = this.add.graphics();
    this.timer = this.add.graphics();
    this.keyHint = this.add
      .text(W / 2, H - 18, 'Tap  SPACE  as fast as you can   (ESC to give up)', { ...FONT, fontSize: '8px' })
      .setOrigin(0.5, 1)
;
    this.status = this.add
      .text(W / 2, H / 2, '', { ...FONT, fontSize: '16px', color: '#ffe08a', stroke: '#2a1d18', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: this.keyHint, alpha: 0.45, duration: 380, yoyo: true, repeat: -1 });

    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.push());
    kb.on('keydown-ENTER', () => this.push());
    kb.on('keydown-E', () => this.push());
    kb.on('keydown-ESC', () => this.finish(false, 'You let the bow go.'));
    this.input.on('pointerdown', () => this.push());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.removeAllListeners();
      this.input.removeAllListeners();
    });
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private push() {
    if (this.over) return;
    this.bend = Math.min(1, this.bend + PUSH);
    this.shakeUntil = this.time.now + 90;
    // creaks: a few wood chips off the limbs
    const { width: W, height: H } = this.scale;
    for (let i = 0; i < 2; i++) {
      const y = H / 2 + (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.Between(40, 80);
      const c = this.add.rectangle(W / 2 + 10, y, 2, 2, 0xd8b07a).setDepth(5);
      this.tweens.add({
        targets: c,
        x: c.x + Phaser.Math.Between(10, 26),
        y: c.y + Phaser.Math.Between(-10, 10),
        alpha: 0,
        duration: 320,
        onComplete: () => c.destroy(),
      });
    }
    if (this.bend >= 1) this.strung();
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    if (!this.over) {
      this.timeLeft -= dt;
      this.bend = Math.max(0, this.bend - SPRING * (0.5 + this.bend) * dt);
      if (this.timeLeft <= 0) this.finish(false, 'The bow springs back!');
    }
    this.twang *= 0.9;
    this.draw();
  }

  /** the bow, the string held in Odysseus' hand, the bend meter and the timer */
  private draw() {
    const { width: W, height: H } = this.scale;
    const g = this.g.clear();
    const strained = this.time.now < this.shakeUntil || (!this.over && this.bend > 0.75);
    const jx = strained ? Phaser.Math.Between(-1, 1) * (1 + this.bend * 2) : 0;
    const cx = W / 2 - 10 + jx,
      gy = H / 2 + 6,
      L = 82;
    const p = this.bend;
    // unstrung, the tips curl forward (away from you, to the right); strung, they sit back with a small recurve hook
    const tipX = Phaser.Math.Linear(48, -12, p);
    const ctrlX = Phaser.Math.Linear(20, 10, p);
    const tips: Phaser.Math.Vector2[] = [];
    for (const s of [-1, 1]) {
      const start = new Phaser.Math.Vector2(cx, gy + s * 9);
      const ctrl = new Phaser.Math.Vector2(cx + ctrlX, gy + s * L * 0.55);
      const end = new Phaser.Math.Vector2(cx + tipX, gy + s * L);
      const curve = new Phaser.Curves.QuadraticBezier(start, ctrl, end);
      g.lineStyle(9, 0x2a1810, 1);
      curve.draw(g, 32);
      g.lineStyle(6, 0x9a6232, 1);
      curve.draw(g, 32);
      g.lineStyle(2, 0xc98b4e, 1);
      curve.draw(g, 32);
      // the recurve hook at the tip, curling forward
      const hook = new Phaser.Math.Vector2(end.x + 8, end.y + s * 6);
      g.lineStyle(6, 0x2a1810, 1).lineBetween(end.x, end.y, hook.x, hook.y);
      g.lineStyle(4, 0x9a6232, 1).lineBetween(end.x, end.y, hook.x, hook.y);
      tips.push(end);
    }
    // the grip, wrapped in leather with a bronze band
    g.fillStyle(0x2a1810).fillRect(cx - 5, gy - 13, 10, 26);
    g.fillStyle(0x5a3a22).fillRect(cx - 4, gy - 12, 8, 24);
    g.fillStyle(0xc9962f).fillRect(cx - 4, gy - 2, 8, 3);
    const [top, bottom] = tips;
    if (!this.over || p < 1) {
      // the string, tied at the bottom tip, its loop held in Odysseus' hand, which climbs toward the top tip
      const hx = Phaser.Math.Linear(bottom.x - 34, top.x - 4, p);
      const hy = Phaser.Math.Linear(bottom.y - 30, top.y + 4, p);
      g.lineStyle(1, 0xf0e6d0, 1).lineBetween(bottom.x, bottom.y, hx, hy);
      g.fillStyle(0x2a1810).fillCircle(hx, hy, 6);
      g.fillStyle(0xe0a97c).fillCircle(hx, hy, 5);
    } else {
      // strung: taut from tip to tip, quivering after the snap
      const mid = (top.y + bottom.y) / 2,
        off = Math.sin(this.time.now / 18) * 6 * this.twang;
      g.lineStyle(1, 0xffffff, 1);
      g.beginPath().moveTo(top.x, top.y).lineTo(top.x - 6 + off, mid).lineTo(bottom.x, bottom.y).strokePath();
    }
    // bend meter
    const mw = 220,
      mx = (W - mw) / 2,
      my = H - 44;
    const m = this.meter.clear();
    m.fillStyle(0x000000, 0.6).fillRect(mx - 2, my - 2, mw + 4, 14);
    m.fillStyle(p > 0.75 ? 0xffd25a : p > 0.4 ? 0xe9a23b : 0xc0603a).fillRect(mx, my, mw * p, 10);
    m.lineStyle(1, 0xe9c46a).strokeRect(mx - 2, my - 2, mw + 4, 14);
    // timer
    const t = this.timer.clear(),
      f = Math.max(0, this.timeLeft / TIME_S);
    t.fillStyle(0x000000, 0.6).fillRect(W / 2 - 110, 50, 220, 4);
    t.fillStyle(f > 0.3 ? 0x7cfc9a : 0xe05d5d).fillRect(W / 2 - 110, 50, 220 * f, 4);
  }

  private strung() {
    if (this.over) return;
    this.over = true;
    this.bend = 1;
    this.twang = 1;
    this.keyHint.setVisible(false);
    this.cameras.main.flash(300, 255, 236, 170);
    this.cameras.main.shake(180, 0.006);
    this.status.setText('TWANG!').setScale(0.4);
    this.tweens.add({ targets: this.status, scale: 1, duration: 260, ease: 'Back.out' });
    this.time.delayedCall(1300, () => this.end(true));
  }

  private finish(won: boolean, text: string) {
    if (this.over) return;
    this.over = true;
    this.keyHint.setVisible(false);
    this.status.setText(text).setColor('#ff9a7a');
    this.cameras.main.shake(220, 0.004);
    this.time.delayedCall(1200, () => this.end(won));
  }

  private end(won: boolean) {
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const map = this.scene.get(this.data_.mapKey);
      this.scene.stop();
      this.scene.resume(this.data_.mapKey);
      map.events.emit('bow-end', won);
    });
  }
}
