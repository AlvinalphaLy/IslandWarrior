import Phaser from 'phaser';
import { Character } from './Character';

/** Wanders around its home point, pauses randomly, stops to talk. */
export class Npc extends Character {
  readonly home: Phaser.Math.Vector2;
  readonly radius: number;
  readonly dialogKey: string;
  readonly displayName: string;
  talking = false;
  private target: Phaser.Math.Vector2 | null = null;
  private waitUntil = 0;
  private stuckTime = 0;
  speed = 22;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string, name: string, dialogKey: string, radius: number) {
    super(scene, x, y, sheet);
    this.home = new Phaser.Math.Vector2(x, y);
    this.radius = radius;
    this.dialogKey = dialogKey;
    this.displayName = name;
    const body = this.body as Phaser.Physics.Arcade.Body;
    // not pushable, so the player can't shove villagers around. Not `immovable` either: Arcade never separates an
    // immovable body from static walls, which let villagers walk straight through rocks and fences.
    body.pushable = false;
    this.waitUntil = scene.time.now + Phaser.Math.Between(500, 2500);
  }

  update(time: number, delta: number) {
    if (this.talking || this.radius <= 0) {
      this.move(0, 0);
      return;
    }
    if (!this.target) {
      if (time < this.waitUntil) {
        this.move(0, 0);
        return;
      }
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * this.radius;
      this.target = new Phaser.Math.Vector2(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
      this.stuckTime = 0;
    }
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (dist < 2) return this.arrive(time);
    // grid-style movement: dominant axis first, reads better for top-down sprites
    if (Math.abs(dx) > 1.5) this.move(Math.sign(dx) * this.speed, 0);
    else this.move(0, Math.sign(dy) * this.speed);
    if (body.blocked.none && body.speed > 1) this.stuckTime = 0;
    else if ((this.stuckTime += delta) > 400) this.arrive(time);
  }

  private arrive(time: number) {
    this.target = null;
    this.move(0, 0);
    this.waitUntil = time + Phaser.Math.Between(1200, 4000);
  }
}
