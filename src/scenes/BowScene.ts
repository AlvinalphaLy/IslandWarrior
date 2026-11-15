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
    // the limbs: unstrung they flex forward (away from you); bent back they take the working recurve shape
    const tips: Phaser.Math.Vector2[] = [];
    for (const s of [-1, 1]) tips.push(this.drawLimb(g, cx, gy, L, s, p));
    // the grip: dark, ribbed
    g.fillStyle(0x140c08).fillRoundedRect(cx - 6, gy - 14, 12, 28, 3);
    g.fillStyle(0x2e221c).fillRoundedRect(cx - 5, gy - 13, 10, 26, 2);
    for (let y = gy - 11; y <= gy + 11; y += 3) {
      g.fillStyle(0x4a3a30).fillRect(cx - 4, y, 8, 1);
      g.fillStyle(0x140c08).fillRect(cx - 4, y + 1, 8, 1);
    }
    const [top, bottom] = tips;
    if (!this.over || p < 1) {
      // the string, tied at the bottom tip, its loop held in Odysseus' hand, which climbs toward the top tip
      const hx = Phaser.Math.Linear(bottom.x - 34, top.x - 4, p);
      const hy = Phaser.Math.Linear(bottom.y - 30, top.y + 4, p);
      g.lineStyle(1, 0xb8bcc8, 1).lineBetween(bottom.x, bottom.y, hx, hy);
      g.fillStyle(0x2a1810).fillCircle(hx, hy, 6);
      g.fillStyle(0xe0a97c).fillCircle(hx, hy, 5);
    } else {
      // strung: taut from tip to tip, quivering after the snap
      const mid = (top.y + bottom.y) / 2,
        off = Math.sin(this.time.now / 18) * 6 * this.twang;
      g.lineStyle(1, 0xd8dce6, 1);
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

  /**
   * One limb of the recurve (s = -1 top, +1 bottom), after the reference bow: a dark limb with a sawtooth ridge along
   * its back, a gold-wrapped S-curve next to the grip with banded ends, and a tip that curls forward into a dark nock.
   * `p`: 0 unstrung (flexed forward), 1 bent into its working shape. Returns the nock, where the string sits.
   */
  private drawLimb(g: Phaser.GameObjects.Graphics, cx: number, gy: number, L: number, s: number, p: number) {
    const lerp = (a: number, b: number) => Phaser.Math.Linear(a, b, p);
    const V = (x: number, y: number) => new Phaser.Math.Vector2(cx + x, gy + s * y);
    const curve = new Phaser.Curves.CubicBezier(
      V(0, 12),
      V(lerp(22, 14), 36),
      V(lerp(46, -6), lerp(60, 66)),
      V(lerp(50, -14), lerp(L * 0.92, L)),
    );
    const pts = curve.getPoints(44);
    // the recurve: the last stretch curls forward, away from the string
    const tip = pts[pts.length - 1];
    const curl = [tip, new Phaser.Math.Vector2(tip.x + 6, tip.y + s * 3), new Phaser.Math.Vector2(tip.x + 11, tip.y + s * 2)];
    const all = [...pts, ...curl.slice(1)];
    const normal = (i: number) => {
      const a = all[Math.max(0, i - 1)], b = all[Math.min(all.length - 1, i + 1)];
      const n = new Phaser.Math.Vector2(-(b.y - a.y), b.x - a.x).normalize();
      return n.x < 0 ? n.negate() : n; // the back of the limb: the side away from the string (which is on the left)
    };
    // outline, body, sheen
    g.lineStyle(12, 0x140c08, 1).strokePoints(all, false);
    g.lineStyle(9, 0x3a2a22, 1).strokePoints(all, false);
    g.lineStyle(2, 0x6a4c3c, 1).strokePoints(all.map((q, i) => q.clone().add(normal(i).scale(-2.5))), false);
    // the sawtooth ridge along the back, outside the wrap
    for (let i = 18; i < all.length - 2; i += 2) {
      const n = normal(i), q = all[i], t = all[i + 1].clone().subtract(q).normalize();
      const base = q.clone().add(n.clone().scale(4));
      g.fillStyle(0x140c08).fillTriangle(base.x - t.x * 2, base.y - t.y * 2, base.x + t.x * 2, base.y + t.y * 2, base.x + n.x * 3, base.y + n.y * 3);
      g.fillStyle(0x3a2a22).fillTriangle(base.x - t.x * 1.2, base.y - t.y * 1.2, base.x + t.x * 1.2, base.y + t.y * 1.2, base.x + n.x * 2, base.y + n.y * 2);
    }
    // the gold wrap: an S-curve next to the grip, wound with thread, banded at both ends
    const w0 = 2, w1 = 17;
    const wrap = all.slice(w0, w1 + 1);
    g.lineStyle(11, 0x140c08, 1).strokePoints(wrap, false);
    g.lineStyle(9, 0xf2b530, 1).strokePoints(wrap, false);
    g.lineStyle(2, 0xffd76a, 1).strokePoints(wrap.map((q, i) => q.clone().add(normal(w0 + i).scale(-2.5))), false);
    for (let i = w0 + 1; i < w1; i++) {
      const n = normal(i), q = all[i];
      g.lineStyle(1, 0xc98a1e, 0.9).lineBetween(q.x - n.x * 4, q.y - n.y * 4, q.x + n.x * 4, q.y + n.y * 4);
    }
    for (const i of [w0, w1]) {
      const n = normal(i), q = all[i];
      g.lineStyle(5, 0x140c08, 1).lineBetween(q.x - n.x * 6, q.y - n.y * 6, q.x + n.x * 6, q.y + n.y * 6);
      g.lineStyle(3, 0xe0a020, 1).lineBetween(q.x - n.x * 5, q.y - n.y * 5, q.x + n.x * 5, q.y + n.y * 5);
    }
    // the nock cap at the tip
    const nock = all[all.length - 1];
    g.fillStyle(0x140c08).fillCircle(nock.x, nock.y, 4);
    g.fillStyle(0x2a1c16).fillCircle(nock.x, nock.y, 3);
    return nock;
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
