import Phaser from 'phaser';

export interface Rect { x: number; y: number; width: number; height: number }
export interface ShipInput { up: boolean; down: boolean; left: boolean; right: boolean }

/** ship.png: 4 frames of 128x84, waterline at y=66 (tools/make_ship.py) */
const FRAME_H = 84;
const WATERLINE = 66;
/** hull footprint on the water, relative to the waterline centre */
const HALF_W = 36; // 72px: the widest hull that still fits between the islets to the open sea (the sprite is ~110px)
const TOP = -6;
const BOTTOM = 2;
const CELL = 4;
const MAX_SPEED = 44;

/**
 * The black ship: a sailable boat. `pos` is the waterline centre. It moves only over water (the map's `water`
 * collision rects, so bridges and the pier stop it too), turns to face where it's going and leaves a wake.
 */
export class Ship {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly pos: Phaser.Math.Vector2;
  facingLeft = false;
  private vel = new Phaser.Math.Vector2();
  private water: Uint8Array;
  private gw: number;
  private gh: number;
  private nextWake = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number, waterRects: Rect[], private worldW: number, private worldH: number) {
    this.pos = new Phaser.Math.Vector2(x, y);
    this.sprite = scene.add.sprite(x, y, 'ship', 0).setOrigin(0.5, WATERLINE / FRAME_H).setDepth(y);
    this.sprite.play('ship-idle');
    this.gw = Math.ceil(worldW / CELL);
    this.gh = Math.ceil(worldH / CELL);
    this.water = new Uint8Array(this.gw * this.gh);
    for (const r of waterRects) {
      for (let gy = Math.floor(r.y / CELL); gy < Math.ceil((r.y + r.height) / CELL); gy++) {
        for (let gx = Math.floor(r.x / CELL); gx < Math.ceil((r.x + r.width) / CELL); gx++) {
          if (gx >= 0 && gy >= 0 && gx < this.gw && gy < this.gh) this.water[gy * this.gw + gx] = 1;
        }
      }
    }
  }

  get moving() {
    return this.vel.lengthSq() > 4;
  }

  /** The hull as it sits on the water, for talking to the ship and finding a place to land. */
  get hull() {
    return new Phaser.Geom.Rectangle(this.pos.x - HALF_W, this.pos.y - 14, HALF_W * 2, 18);
  }

  /** How many footprint samples at (x, y) are not open water. Off-map counts as land. */
  private landAt(x: number, y: number) {
    let n = 0;
    for (let py = y + TOP; py <= y + BOTTOM; py += CELL / 2) {
      for (let px = x - HALF_W; px <= x + HALF_W; px += CELL / 2) {
        const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
        if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh || !this.water[gy * this.gw + gx]) n++;
      }
    }
    return n;
  }

  /** A move is allowed onto clear water, or (if the ship starts slightly aground) anywhere less aground. */
  private tryMove(nx: number, ny: number) {
    const now = this.landAt(this.pos.x, this.pos.y);
    const next = this.landAt(nx, ny);
    if (next === 0 || next < now) {
      this.pos.set(nx, ny);
      return true;
    }
    return false;
  }

  /** Blocked moving by (dx, dy): try the same move shifted 1-3px perpendicular, toward whichever side is clearer. */
  private slide(dx: number, dy: number) {
    if (Math.abs(dx) + Math.abs(dy) < 0.05) return false;
    const px = dy ? 1 : 0, py = dx ? 1 : 0; // perpendicular axis
    const sides = [1, -1].sort((a, b) =>
      this.landAt(this.pos.x + dx + px * a * 4, this.pos.y + dy + py * a * 4) - this.landAt(this.pos.x + dx + px * b * 4, this.pos.y + dy + py * b * 4));
    for (const s of [1, 2, 3]) {
      for (const side of sides) {
        if (this.landAt(this.pos.x + dx + px * side * s, this.pos.y + dy + py * side * s) === 0) {
          this.pos.set(this.pos.x + dx + px * side * s, this.pos.y + dy + py * side * s);
          return true;
        }
      }
    }
    return false;
  }

  /** Sail one frame. Returns true when the ship pushes against the south edge of the map (the open sea). */
  step(dt: number, input: ShipInput) {
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(ix, iy) || 1;
    const k = Math.min(1, dt * 2.5); // ease in and out: a heavy galley, not a speedboat
    this.vel.x += ((ix / len) * MAX_SPEED - this.vel.x) * k;
    this.vel.y += ((iy / len) * MAX_SPEED * 0.75 - this.vel.y) * k;
    if (ix) this.facingLeft = ix < 0;
    // move each axis separately; when blocked, slide sideways around the obstacle (up to 3px per frame),
    // so holding one direction finds its way through narrow channels instead of sticking on a corner
    if (!this.tryMove(this.pos.x + this.vel.x * dt, this.pos.y) && !this.slide(this.vel.x * dt, 0)) this.vel.x = 0;
    if (!this.tryMove(this.pos.x, this.pos.y + this.vel.y * dt) && !this.slide(0, this.vel.y * dt)) this.vel.y = 0;
    return iy > 0 && this.pos.y + BOTTOM >= this.worldH - 2;
  }

  /** Draw: bob on the swell, face the right way, row faster while moving, leave foam behind. */
  update(time: number) {
    const bob = Math.round(Math.sin(time / 550));
    this.sprite.setPosition(Math.round(this.pos.x), Math.round(this.pos.y) + bob).setDepth(this.pos.y);
    this.sprite.setFlipX(this.facingLeft);
    this.sprite.anims.timeScale = this.moving ? 2.5 : 1;
    if (this.moving && time > this.nextWake) {
      this.nextWake = time + 90;
      const sx = this.pos.x + (this.facingLeft ? HALF_W + 2 : -HALF_W - 2);
      const foam = this.scene.add.rectangle(sx, this.pos.y + 1 + Phaser.Math.Between(-1, 1), 3, 1, 0xffffff, 0.9).setDepth(this.pos.y - 1);
      this.scene.tweens.add({ targets: foam, alpha: 0, scaleX: 3, duration: 800, onComplete: () => foam.destroy() });
    }
  }
}
