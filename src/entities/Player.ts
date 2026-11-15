import Phaser from 'phaser';
import { Character, Dir } from './Character';

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export class Player extends Character {
  speed = 64;
  frozen = false;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet = 'adam') {
    super(scene, x, y, sheet);
    this.setCollideWorldBounds(true);
  }

  update(input: MoveInput) {
    if (this.frozen) {
      this.move(0, 0);
      return;
    }
    let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (vx && vy) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    this.move(vx * this.speed, vy * this.speed);
  }

  /** Point just in front of the player, used to pick the interaction target. */
  get probe() {
    const off: Record<Dir, [number, number]> = { down: [0, 8], up: [0, -10], left: [-10, -3], right: [10, -3] };
    const [ox, oy] = off[this.facing];
    const f = this.feet;
    return new Phaser.Math.Vector2(f.x + ox, f.y + oy);
  }
}
