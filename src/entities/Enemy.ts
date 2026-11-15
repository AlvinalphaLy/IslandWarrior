import Phaser from 'phaser';
import { ENEMIES, EnemyDef, GREEK_SHEETS } from '../data/enemies';

/** A Fantasy Battlers or Odyssey monster standing on the map. Touching it starts a battle. */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly def: EnemyDef;
  readonly spawnName: string;
  readonly enemyId: string;
  private home: Phaser.Math.Vector2;
  /** time until which the enemy ignores the player (after the player runs away) */
  stunnedUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, enemyId: string, spawnName: string) {
    const def = ENEMIES[enemyId];
    const animated = def.sprite in GREEK_SHEETS;
    super(scene, x, y, def.sprite, animated ? 0 : undefined);
    this.def = def;
    this.enemyId = enemyId;
    this.spawnName = spawnName;
    this.home = new Phaser.Math.Vector2(x, y);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const w = def.boss ? 40 : 14;
    body.setSize(w, 8);
    body.setOffset((this.width - w) / 2, this.height - 10);
    body.setImmovable(true);
    body.pushable = false;
    if (animated) {
      this.play({ key: `${def.sprite}-idle`, startFrame: Math.random() < 0.5 ? 0 : 1 });
      return;
    }
    // idle "breathing" so the static battle sprite feels alive on the map
    scene.tweens.add({ targets: this, scaleY: 1.04, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  update(time: number, player: Phaser.GameObjects.Components.Transform) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.setDepth(this.y);
    if (!this.def.aggro || time < this.stunnedUntil) {
      body.setVelocity(0, 0);
      return;
    }
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const leash = Phaser.Math.Distance.Between(this.x, this.y, this.home.x, this.home.y);
    if (d < this.def.aggro && leash < this.def.aggro * 1.6) {
      this.scene.physics.moveTo(this, player.x, player.y, 26);
    } else if (leash > 3) {
      this.scene.physics.moveTo(this, this.home.x, this.home.y, 20);
    } else {
      body.setVelocity(0, 0);
    }
    if (body.velocity.x) this.setFlipX(body.velocity.x > 0);
  }
}
