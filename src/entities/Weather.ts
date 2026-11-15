import Phaser from 'phaser';

/**
 * Night storm: the Night/Day button (or N) turns outdoor maps to night with wind, rain and lightning.
 *
 *   night      a deep-blue darkness over the screen with a soft pool of light around the player (or the ship)
 *   rain       wind-slanted streaks over the whole view, and small splashes on the ground
 *   wind       gusts that bend the rain further and blow faint spray streaks across the screen
 *   lightning  every 6-14 s a jagged bolt and a white flash (the darkness lifts for an instant), thunder after
 *
 * Indoors (maps with the `dark` property: caves, the grotto) only the night is skipped too: no rain under a roof.
 * Everything is drawn in screen space (scroll factor 0) above the world and below the HUD/dialog (DOM).
 * The on/off state lives in the registry (`night`) so it carries across maps, and in localStorage between visits.
 */
const DEPTH = 8000;
const LIGHT_R = 46; // radius of the clear pool of light around the player (px)
const DARK = 0.8; // how dark the night is outside that pool (alpha)
const STORE_KEY = 'islandwarrior.night';

export function nightSaved(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}
function saveNight(on: boolean) {
  try {
    localStorage.setItem(STORE_KEY, on ? '1' : '0');
  } catch {
    /* private mode: just this visit */
  }
}

export class Weather {
  private on = false;
  private dark: Phaser.GameObjects.Image | null = null;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private bolt: Phaser.GameObjects.Graphics | null = null;
  private lightningTimers: Phaser.Time.TimerEvent[] = [];
  private nextBolt = 0;
  private nextGust = 0;
  private nextSplash = 0;
  private wind = 0.35; // rain slant: horizontal speed per unit of fall speed
  private windTarget = 0.35;

  /** `focus`: the point the light follows (the player, or the ship while sailing). `outdoor`: rain falls here. */
  constructor(
    private scene: Phaser.Scene,
    private outdoor: boolean,
    private focus: () => { x: number; y: number },
  ) {
    this.makeTextures();
    if (scene.registry.get('night') === undefined) scene.registry.set('night', nightSaved());
    this.set(!!scene.registry.get('night'));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get enabled() {
    return this.on;
  }

  toggle() {
    this.set(!this.on);
    this.scene.registry.set('night', this.on);
    saveNight(this.on);
    return this.on;
  }

  set(on: boolean) {
    this.on = on;
    if (!this.outdoor) return;
    if (on) this.start();
    else this.stop();
  }

  // ---------------------------------------------------------------- textures (drawn once, no tinting)
  private makeTextures() {
    const tx = this.scene.textures;
    if (!tx.exists('night_dark')) {
      // a big dark sheet with a soft transparent hole in the middle; moved so the hole sits on the player
      const S = 1024,
        c = tx.createCanvas('night_dark', S, S)!,
        ctx = c.getContext();
      const g = ctx.createRadialGradient(S / 2, S / 2, LIGHT_R * 0.45, S / 2, S / 2, LIGHT_R * 2.6);
      g.addColorStop(0, 'rgba(6,10,40,0)');
      g.addColorStop(0.45, `rgba(6,10,40,${DARK * 0.55})`);
      g.addColorStop(1, `rgba(6,10,40,${DARK})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      c.refresh();
    }
    if (!tx.exists('rain_drop')) {
      const c = tx.createCanvas('rain_drop', 1, 7)!,
        ctx = c.getContext();
      const g = ctx.createLinearGradient(0, 0, 0, 7);
      g.addColorStop(0, 'rgba(170,200,255,0)');
      g.addColorStop(1, 'rgba(200,220,255,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1, 7);
      c.refresh();
    }
    if (!tx.exists('wind_streak')) {
      const c = tx.createCanvas('wind_streak', 24, 1)!,
        ctx = c.getContext();
      const g = ctx.createLinearGradient(0, 0, 24, 0);
      g.addColorStop(0, 'rgba(220,230,255,0)');
      g.addColorStop(0.5, 'rgba(220,230,255,0.35)');
      g.addColorStop(1, 'rgba(220,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 24, 1);
      c.refresh();
    }
  }

  // ---------------------------------------------------------------- on / off
  private start() {
    if (this.dark) return;
    const s = this.scene,
      cam = s.cameras.main;
    this.dark = s.add.image(0, 0, 'night_dark').setScrollFactor(0).setDepth(DEPTH);
    // rain: spawned along the top edge and (for the slant) the upwind side, falling across the whole view
    this.rain = s.add
      .particles(0, 0, 'rain_drop', {
        x: { min: -cam.width * 0.5, max: cam.width * 1.1 },
        y: { min: -20, max: -4 },
        speedY: { min: 300, max: 380 },
        speedX: { onEmit: () => this.wind * Phaser.Math.Between(300, 380) },
        rotate: { onEmit: () => -Math.atan(this.wind) * Phaser.Math.RAD_TO_DEG },
        lifespan: { min: 700, max: 1000 },
        alpha: { start: 0.9, end: 0.4 },
        frequency: 8,
        quantity: 3,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH + 2);
    this.bolt = s.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(DEPTH + 3);
    this.nextBolt = s.time.now + Phaser.Math.Between(2500, 5000);
    this.nextGust = s.time.now + 1500;
  }

  /** Cancel pending flashes before destroying their graphics, including a toggle during lightning. */
  private stop() {
    for (const timer of this.lightningTimers) timer.remove();
    this.lightningTimers = [];
    this.dark?.destroy();
    this.dark = null;
    this.rain?.destroy();
    this.rain = null;
    this.bolt?.destroy();
    this.bolt = null;
  }

  // ---------------------------------------------------------------- per frame
  update(time: number) {
    if (!this.on || !this.outdoor || !this.dark) return;
    const s = this.scene,
      cam = s.cameras.main;
    // the light follows the player/ship (screen space; in the M overview it just stays centred)
    const f = this.focus();
    const sx = cam.zoom === 1 ? f.x - cam.scrollX : cam.width / 2;
    const sy = cam.zoom === 1 ? f.y - 12 - cam.scrollY : cam.height / 2;
    this.dark.setPosition(sx, sy);
    // wind: ease toward a target slant; gusts now and then, with spray streaks blown across the view
    this.wind += (this.windTarget - this.wind) * 0.02;
    if (time > this.nextGust) {
      this.nextGust = time + Phaser.Math.Between(2500, 6000);
      this.windTarget = Phaser.Math.FloatBetween(0.15, 0.75);
      if (this.windTarget > 0.45) this.gust();
    }
    // splashes on the ground (world space, inside the view)
    if (time > this.nextSplash) {
      this.nextSplash = time + 40;
      const v = cam.worldView;
      const x = Phaser.Math.Between(v.x, v.right),
        y = Phaser.Math.Between(v.y, v.bottom);
      const sp = s.add.ellipse(x, y, 3, 1, 0xd8e6ff, 0.7).setDepth(-450);
      s.tweens.add({
        targets: sp,
        scaleX: 2.6,
        scaleY: 2.2,
        alpha: 0,
        duration: 380,
        onComplete: () => sp.destroy(),
      });
    }
    if (time > this.nextBolt) {
      this.nextBolt = time + Phaser.Math.Between(6000, 14000);
      this.lightning();
    }
  }

  private gust() {
    const s = this.scene,
      cam = s.cameras.main;
    for (let i = 0; i < 7; i++) {
      const y = Phaser.Math.Between(10, cam.height - 10);
      const w = s.add
        .image(-30, y, 'wind_streak')
        .setScrollFactor(0)
        .setDepth(DEPTH + 1)
        .setAlpha(0);
      s.tweens.add({
        targets: w,
        x: cam.width + 40,
        alpha: { from: 0.9, to: 0.2 },
        duration: Phaser.Math.Between(600, 1000),
        delay: i * 90,
        ease: 'Sine.in',
        onComplete: () => w.destroy(),
      });
    }
  }

  /** a jagged bolt from the sky, a white flash that lifts the darkness for an instant, then thunder */
  private lightning() {
    const s = this.scene,
      cam = s.cameras.main,
      g = this.bolt!;
    const x0 = Phaser.Math.Between(40, cam.width - 40);
    const pts: [number, number][] = [[x0, -4]];
    let x = x0,
      y = -4;
    const end = Phaser.Math.Between(cam.height * 0.35, cam.height * 0.7);
    while (y < end) {
      y += Phaser.Math.Between(10, 22);
      x += Phaser.Math.Between(-14, 14);
      pts.push([x, y]);
    }
    const draw = (w: number, color: number, alpha: number) => {
      g.lineStyle(w, color, alpha).beginPath().moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
      g.strokePath();
      // one fork off a middle segment
      const [fx, fy] = pts[Math.floor(pts.length / 2)];
      g.lineStyle(Math.max(1, w - 1), color, alpha * 0.8)
        .beginPath()
        .moveTo(fx, fy)
        .lineTo(fx + 18, fy + 16)
        .lineTo(fx + 12, fy + 30)
        .strokePath();
    };
    draw(5, 0x9fb8ff, 0.35);
    draw(2, 0xffffff, 1);
    cam.flash(160, 230, 236, 255);
    this.dark?.setAlpha(0.15);
    this.lightningTimers = this.lightningTimers.filter((timer) => !timer.hasDispatched);
    this.lightningTimers.push(s.time.delayedCall(90, () => g.clear()));
    this.lightningTimers.push(
      s.time.delayedCall(140, () => {
        draw(2, 0xffffff, 0.8);
        this.dark?.setAlpha(0.5);
      }),
    );
    this.lightningTimers.push(
      s.time.delayedCall(220, () => {
        g.clear();
        this.dark?.setAlpha(1);
      }),
    );
    this.lightningTimers.push(
      s.time.delayedCall(Phaser.Math.Between(400, 1100), () => cam.shake(500, 0.004)),
    ); // thunder
  }

  destroy() {
    this.stop();
  }
}
