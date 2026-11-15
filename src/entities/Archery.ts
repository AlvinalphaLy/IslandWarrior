import Phaser from 'phaser';
import { toast } from '../ui';
import type { Dir } from './Character';

/**
 * Odysseus' bow and the archery puzzles of the Cyclops cave. Everything is driven by Spawns objects in the map:
 *
 *   bow     point  the bow lying on a stone: walk over it to pick it up (registry `items` gets 'bow'), `dialog`
 *   target  point  a bronze disc on a post (bottom centre). Hitting it opens the gate named in `opens`.
 *                  `face`: only arrows flying that way count ('right' = shot from the left). `rings`: the arrow must
 *                  first have passed through that many axe rings.
 *   gate    rect   blocks the way until opened: `style` 'bridge' (planks drop across a chasm) or 'boulder'.
 *   axe     point  an axe standing on its haft (bottom centre). Arrows hit it, except a horizontal arrow passing
 *                  exactly through the ring-hole at the top.
 *   sheep   point  a sheep grazing within `wander` px of here. It blocks arrows (and complains).
 *   snore   point  floating Zzz (the drunk Cyclops asleep).
 *   mark    point  a chalk mark on the floor: the spot to shoot from.
 *
 * Arrows fly over pits and water and stop at walls, solid props, closed gates, axes, targets and sheep.
 * Opened gates are remembered for the session (registry `opened`, keys `<scene>:<gate>`).
 */
export interface ArchSpawn { name: string; type: string; x: number; y: number; width: number; height: number; properties?: { name: string; value: unknown }[] }
interface Rect { x: number; y: number; width: number; height: number; type?: string }
interface Target { name: string; sprite: Phaser.GameObjects.Sprite; opens: string; face: Dir | ''; rings: number; hit: boolean; box: Phaser.Geom.Rectangle }
interface Gate { name: string; style: string; rect: Phaser.Geom.Rectangle; zone: Phaser.GameObjects.Zone | null; art: Phaser.GameObjects.GameObject | null }
interface Axe { x: number; foot: number; ringY: number; box: Phaser.Geom.Rectangle }
interface Arrow { img: Phaser.GameObjects.Image; dx: number; dy: number; rings: Set<Axe>; life: number }
interface Sheep { spr: Phaser.Physics.Arcade.Sprite; home: Phaser.Math.Vector2; radius: number; next: number; tx: number; ty: number }

/** axe.png (tools/make_archery_props.py): 12x25, ring-hole centre 3px below the top */
const AXE_W = 12, AXE_H = 25, AXE_RING_Y = 3;
const ARROW_SPEED = 260;
const BLOCKING = new Set(['wall', 'solid', 'tree', 'house']);
const prop = <T>(o: ArchSpawn, k: string, d: T): T => (o.properties?.find((p) => p.name === k)?.value as T) ?? d;

export interface ArcheryHost {
  scene: Phaser.Scene;
  walls: Phaser.Physics.Arcade.StaticGroup;
  player: Phaser.Physics.Arcade.Sprite & { facing: Dir };
  /** open a dialog by its key in DIALOG */
  say: (dialogKey: string) => void;
}

export class Archery {
  private targets: Target[] = [];
  private gates: Gate[] = [];
  private axes: Axe[] = [];
  private sheep: Sheep[] = [];
  private arrows: Arrow[] = [];
  private blockers: Phaser.Geom.Rectangle[];
  private bow: { spr: Phaser.GameObjects.Image; dialog: string } | null = null;
  private lastShot = 0;
  private readonly scene: Phaser.Scene;

  constructor(private host: ArcheryHost, spawns: ArchSpawn[], collision: Rect[]) {
    const scene = (this.scene = host.scene);
    this.blockers = collision.filter((r) => BLOCKING.has(r.type ?? '')).map((r) => new Phaser.Geom.Rectangle(r.x, r.y, r.width, r.height));
    const opened = this.opened;
    for (const s of spawns) {
      if (s.type === 'bow' && !this.hasBow) {
        this.bow = { spr: scene.add.image(s.x, s.y, 'bow').setOrigin(0.5, 1).setDepth(s.y - 8), dialog: prop(s, 'dialog', '') };
        scene.tweens.add({ targets: this.bow.spr, y: s.y - 1, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      } else if (s.type === 'gate') {
        const rect = new Phaser.Geom.Rectangle(s.x, s.y, s.width, s.height);
        const g: Gate = { name: s.name, style: prop(s, 'style', 'bridge'), rect, zone: null, art: null };
        this.gates.push(g);
        if (opened.includes(this.key(g.name))) this.drawOpen(g, false);
        else this.close(g);
      } else if (s.type === 'target') {
        const spr = scene.add.sprite(s.x, s.y, 'target', 0).setOrigin(0.5, 1).setDepth(s.y);
        const t: Target = { name: s.name, sprite: spr, opens: prop(s, 'opens', ''), face: prop(s, 'face', '') as Dir | '',
          rings: prop(s, 'rings', 0), hit: false, box: new Phaser.Geom.Rectangle(s.x - 7, s.y - 22, 14, 13) };
        this.targets.push(t);
        this.solid(s.x, s.y, 6, 3);
        if (opened.includes(this.key(t.opens))) { t.hit = true; spr.setFrame(1); }
      } else if (s.type === 'axe') {
        scene.add.image(s.x, s.y, 'axe').setOrigin(0.5, 1).setDepth(s.y);
        this.axes.push({ x: s.x, foot: s.y, ringY: s.y - AXE_H + AXE_RING_Y, box: new Phaser.Geom.Rectangle(s.x - AXE_W / 2, s.y - AXE_H, AXE_W, AXE_H) });
        this.solid(s.x, s.y, 6, 3);
      } else if (s.type === 'sheep') {
        const spr = scene.physics.add.sprite(s.x, s.y, 'sheep', 0).setOrigin(0.5, 1);
        const body = spr.body as Phaser.Physics.Arcade.Body;
        body.setSize(14, 6).setOffset(2, 9);
        body.pushable = false;
        scene.physics.add.collider(spr, host.walls);
        scene.physics.add.collider(spr, host.player);
        this.sheep.push({ spr, home: new Phaser.Math.Vector2(s.x, s.y), radius: prop(s, 'wander', 40), next: 0, tx: s.x, ty: s.y });
      } else if (s.type === 'snore') {
        scene.time.addEvent({ delay: 900, loop: true, callback: () => this.zzz(s.x, s.y) });
      } else if (s.type === 'mark') {
        const g = scene.add.graphics().setDepth(-400);
        g.lineStyle(1, 0xe8e0c8, 0.55);
        g.lineBetween(s.x - 4, s.y - 3, s.x + 4, s.y + 3).lineBetween(s.x - 4, s.y + 3, s.x + 4, s.y - 3);
      }
    }
    scene.physics.add.collider(this.sheep.map((s) => s.spr), this.sheep.map((s) => s.spr));
  }

  // ---------------------------------------------------------------- state
  get hasBow() {
    return ((this.scene.registry.get('items') as string[] | undefined) ?? []).includes('bow');
  }
  private get opened() {
    return (this.scene.registry.get('opened') as string[] | undefined) ?? [];
  }
  private key(gate: string) {
    return `${this.scene.scene.key}:${gate}`;
  }

  // ---------------------------------------------------------------- shooting
  /** Loose an arrow the way the player faces. Returns false if there is no bow yet. */
  shoot(time: number) {
    if (!this.hasBow) { toast('You have no bow.', 1400); return false; }
    if (time - this.lastShot < 350) return true;
    this.lastShot = time;
    const p = this.host.player;
    const d = p.facing;
    const dx = d === 'left' ? -1 : d === 'right' ? 1 : 0, dy = d === 'up' ? -1 : d === 'down' ? 1 : 0;
    // horizontal shots leave at chest height (feet - 10); vertical ones from the centre of the body
    const x = p.x + dx * 7, y = dx ? p.y - 10 : p.y - 12 + dy * 8;
    const img = this.scene.add.image(x, y, 'arrow').setAngle(dx < 0 ? 180 : dy < 0 ? -90 : dy > 0 ? 90 : 0).setDepth(dy < 0 ? p.y - 1 : p.y + 1);
    this.arrows.push({ img, dx, dy, rings: new Set(), life: 2.5 });
    return true;
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    for (const a of [...this.arrows]) this.fly(a, dt);
    this.pickUp();
    for (const s of this.sheep) this.graze(s, time);
  }

  /** Move an arrow in 2px steps, so it can't skip through a thin axe haft or a target's edge. */
  private fly(a: Arrow, dt: number) {
    a.life -= dt;
    const dist = ARROW_SPEED * dt;
    const steps = Math.max(1, Math.ceil(dist / 2));
    const b = this.scene.physics.world.bounds;
    for (let i = 0; i < steps; i++) {
      a.img.x += (a.dx * dist) / steps;
      a.img.y += (a.dy * dist) / steps;
      // the tip of the arrow
      const tx = a.img.x + a.dx * 5, ty = a.img.y + a.dy * 5;
      if (a.life <= 0 || !b.contains(tx, ty)) return this.drop(a, false);
      if (this.hitsTarget(a, tx, ty)) return;
      for (const ax of this.axes) {
        if (!ax.box.contains(tx, ty)) continue;
        // through the ring: flying sideways at ring height (the hole is ~3px tall)
        if (a.dy === 0 && Math.abs(ty - ax.ringY) <= 2) { a.rings.add(ax); continue; }
        return this.drop(a, true);
      }
      for (const s of this.sheep) {
        if (s.spr.getBounds().contains(tx, ty)) { this.baa(s, a); return this.drop(a, false); }
      }
      for (const g of this.gates) if (g.zone && g.style !== 'bridge' && g.rect.contains(tx, ty)) return this.drop(a, true);
      for (const r of this.blockers) if (r.contains(tx, ty)) return this.drop(a, true);
    }
    a.img.setDepth(a.dy === 0 ? a.img.y + 10 : a.img.y + 4);
  }

  private hitsTarget(a: Arrow, tx: number, ty: number) {
    for (const t of this.targets) {
      if (!t.box.contains(tx, ty)) continue;
      const dir: Dir = a.dx > 0 ? 'right' : a.dx < 0 ? 'left' : a.dy > 0 ? 'down' : 'up';
      if ((t.face && t.face !== dir) || t.hit) { this.drop(a, true); return true; }
      if (a.rings.size < t.rings) {
        this.drop(a, true);
        toast(a.rings.size ? `Through ${a.rings.size} of ${t.rings} rings... it must fly through every one.` : 'The arrow must fly through every ring.', 2200);
        return true;
      }
      // stuck in the disc
      a.img.setPosition(tx - a.dx * 5, ty - a.dy * 5);
      this.arrows.splice(this.arrows.indexOf(a), 1);
      this.scene.time.delayedCall(1600, () => a.img.destroy());
      this.strike(t);
      return true;
    }
    return false;
  }

  /** The arrow stops. `clank`: against stone/bronze (sparks), otherwise it just falls. */
  private drop(a: Arrow, clank: boolean) {
    this.arrows.splice(this.arrows.indexOf(a), 1);
    const img = a.img;
    if (clank) {
      for (let i = 0; i < 5; i++) {
        const s = this.scene.add.rectangle(img.x + a.dx * 5, img.y + a.dy * 5, 1, 1, i % 2 ? 0xffe9a0 : 0xffffff).setDepth(img.depth + 1);
        this.scene.tweens.add({ targets: s, x: s.x - a.dx * Phaser.Math.Between(2, 8) + Phaser.Math.Between(-4, 4),
          y: s.y - a.dy * Phaser.Math.Between(2, 8) + Phaser.Math.Between(-5, 2), alpha: 0, duration: 260, onComplete: () => s.destroy() });
      }
    }
    this.scene.tweens.add({ targets: img, y: img.y + 6, angle: img.angle + (a.dx >= 0 ? 35 : -35), alpha: 0, duration: 380, onComplete: () => img.destroy() });
  }

  // ---------------------------------------------------------------- targets and gates
  private strike(t: Target) {
    t.hit = true;
    t.sprite.setFrame(1);
    this.scene.tweens.add({ targets: t.sprite, x: t.sprite.x + 1, duration: 40, yoyo: true, repeat: 3 });
    this.scene.cameras.main.flash(120, 255, 230, 160);
    const g = this.gates.find((x) => x.name === t.opens);
    if (!g || !g.zone) return;
    this.scene.registry.set('opened', [...this.opened, this.key(g.name)]);
    toast(g.style === 'boulder' ? t.rings ? `Through all ${t.rings} rings! The great stone grinds aside...` : 'The great stone grinds aside...'
      : 'Clang! Across the chasm, a bridge of planks drops into place.', 2600);
    // show the gate opening, then come back to the player
    const cam = this.scene.cameras.main;
    const follow = () => cam.startFollow(this.host.player, true, 0.15, 0.15);
    cam.stopFollow();
    cam.pan(g.rect.centerX, g.rect.centerY, 450, 'Sine.easeInOut');
    this.scene.time.delayedCall(500, () => this.drawOpen(g, true));
    this.scene.time.delayedCall(1700, () => { cam.pan(this.host.player.x, this.host.player.y, 400, 'Sine.easeInOut'); });
    this.scene.time.delayedCall(2150, follow);
  }

  private close(g: Gate) {
    const r = g.rect;
    g.zone = this.scene.add.zone(r.centerX, r.centerY, r.width, r.height);
    this.host.walls.add(g.zone);
    if (g.style === 'boulder') {
      g.art = this.scene.add.image(r.centerX, r.bottom, 'boulder').setOrigin(0.5, 1).setDepth(r.bottom - 4);
    }
  }

  private drawOpen(g: Gate, animate: boolean) {
    g.zone?.destroy();
    g.zone = null;
    const r = g.rect, s = this.scene;
    if (g.style === 'bridge') {
      const br = s.add.tileSprite(r.x, r.y, r.width, r.height, 'bridge').setOrigin(0, 0).setDepth(-500);
      g.art = br;
      if (animate) {
        br.setScale(1, 0);
        s.tweens.add({ targets: br, scaleY: 1, duration: 450, ease: 'Bounce.out' });
        s.cameras.main.shake(200, 0.003);
      }
    } else if (g.style === 'boulder') {
      const b = (g.art as Phaser.GameObjects.Image | null) ?? s.add.image(r.centerX, r.bottom, 'boulder').setOrigin(0.5, 1).setDepth(r.bottom - 4);
      g.art = b;
      const done = () => b.setPosition(r.centerX + 30, r.bottom).setAngle(90).setAlpha(0.35);
      if (!animate) return done();
      s.cameras.main.shake(1100, 0.005);
      b.setOrigin(0.5, 0.5).setY(r.bottom - b.height / 2);
      s.tweens.add({ targets: b, x: r.centerX + 30, angle: 90, duration: 1200, ease: 'Sine.inOut',
        onComplete: () => { b.setOrigin(0.5, 1).setY(r.bottom); s.tweens.add({ targets: b, alpha: 0.35, duration: 500 }); } });
      for (let i = 0; i < 14; i++) {
        const d = s.add.rectangle(r.centerX + Phaser.Math.Between(-14, 14), r.bottom - Phaser.Math.Between(0, 6), 2, 2, 0x8a8478).setDepth(r.bottom);
        s.tweens.add({ targets: d, y: d.y - Phaser.Math.Between(6, 18), x: d.x + Phaser.Math.Between(-10, 10), alpha: 0,
          duration: Phaser.Math.Between(500, 900), delay: i * 50, onComplete: () => d.destroy() });
      }
    }
  }

  /** a small static collider at the foot of a post (target, axe) */
  private solid(x: number, foot: number, w: number, h: number) {
    this.host.walls.add(this.scene.add.zone(x, foot - h / 2, w, h));
  }

  // ---------------------------------------------------------------- the bow
  private pickUp() {
    if (!this.bow) return;
    const p = this.host.player;
    if (Phaser.Math.Distance.Between(p.x, p.y, this.bow.spr.x, this.bow.spr.y) > 10) return;
    const { spr, dialog } = this.bow;
    this.bow = null;
    this.scene.registry.set('items', [...((this.scene.registry.get('items') as string[] | undefined) ?? []), 'bow']);
    this.scene.tweens.killTweensOf(spr);
    this.scene.tweens.add({ targets: spr, y: spr.y - 14, alpha: 0, duration: 500, onComplete: () => spr.destroy() });
    this.scene.cameras.main.flash(160, 255, 236, 170);
    if (dialog) this.host.say(dialog);
  }

  // ---------------------------------------------------------------- sheep
  private graze(s: Sheep, time: number) {
    const body = s.spr.body as Phaser.Physics.Arcade.Body;
    if (time > s.next) {
      s.next = time + Phaser.Math.Between(1200, 3200);
      if (Math.random() < 0.35) { s.tx = s.spr.x; s.ty = s.spr.y; }   // stop and graze a while
      else {
        const a = Math.random() * Math.PI * 2, r = Math.random() * s.radius;
        s.tx = s.home.x + Math.cos(a) * r; s.ty = s.home.y + Math.sin(a) * r * 0.6;
      }
    }
    const dx = s.tx - s.spr.x, dy = s.ty - s.spr.y, d = Math.hypot(dx, dy);
    if (d < 2) { body.setVelocity(0, 0); s.spr.setFrame(0); }
    else {
      body.setVelocity((dx / d) * 16, (dy / d) * 16);
      s.spr.setFlipX(dx < 0);
      s.spr.setFrame(Math.floor(time / 220) % 2);
    }
    s.spr.setDepth(s.spr.y);
  }

  private baa(s: Sheep, a: Arrow) {
    const t = this.scene.add.text(s.spr.x, s.spr.y - 18, 'Baa!', { fontFamily: 'Pixelify Sans, monospace', fontSize: '8px', color: '#ffffff', stroke: '#2a1d18', strokeThickness: 2 })
      .setOrigin(0.5, 1).setDepth(10000).setResolution(4);
    this.scene.tweens.add({ targets: t, y: t.y - 8, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    // it trots off out of the line of fire
    s.tx = s.spr.x + (a.dy ? (Math.random() < 0.5 ? -1 : 1) * 24 : 0);
    s.ty = s.spr.y + (a.dx ? (Math.random() < 0.5 ? -1 : 1) * 14 : 0);
    s.next = this.scene.time.now + 1500;
  }

  /** a pixel-art "z" drifting up and away from the sleeper */
  private zzz(x: number, y: number) {
    if (!this.scene.textures.exists('fx_z')) {
      const t = this.scene.textures.createCanvas('fx_z', 5, 5)!;
      const ctx = t.getContext();
      const z = (c: string, o: number) => {   // a 4x4 "z": top bar, diagonal, bottom bar
        ctx.fillStyle = c;
        ctx.fillRect(o, o, 4, 1); ctx.fillRect(o + 2, o + 1, 1, 1); ctx.fillRect(o + 1, o + 2, 1, 1); ctx.fillRect(o, o + 3, 4, 1);
      };
      z('#1a1030', 1); z('#e8e0ff', 0);   // dark drop shadow, then the letter
      t.refresh();
    }
    const z = this.scene.add.image(x, y, 'fx_z').setDepth(10000).setAlpha(0.95);
    this.scene.tweens.add({ targets: z, x: x + Phaser.Math.Between(5, 10), y: y - 14, alpha: 0, scale: 1.5, duration: 2200, ease: 'Sine.out', onComplete: () => z.destroy() });
  }

}
