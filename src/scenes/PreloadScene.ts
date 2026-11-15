import Phaser from 'phaser';
import { CHARACTER_SHEETS, FRAME_H, FRAME_W } from '../entities/Character';
import { BATTLER_FILES, GREEK_SHEETS, START_STATS } from '../data/enemies';

export const MAPS = ['village', 'cave', 'dungeon'];
export const TILESETS = ['village', 'water', 'campfire', 'door', 'auto', 'cave', 'sewer'];

/** Loads every map, tileset and character once, then starts the village. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload');
  }

  preload() {
    for (const m of MAPS) this.load.tilemapTiledJSON(m, `assets/maps/${m}.json`);
    for (const t of TILESETS) {
      this.load.image(t, `assets/tilesets/${t}.png`);
      this.load.spritesheet(`${t}_ss`, `assets/tilesets/${t}.png`, { frameWidth: 16, frameHeight: 16 });
    }
    for (const c of Object.keys(CHARACTER_SHEETS)) {
      this.load.spritesheet(c, `assets/sprites/${c}.png`, { frameWidth: FRAME_W, frameHeight: FRAME_H });
    }
    for (const b of BATTLER_FILES) this.load.image(`battler_${b}`, `assets/battlers/${b}.png`);
    for (const [k, f] of Object.entries(GREEK_SHEETS)) {
      this.load.spritesheet(k, `assets/greek/${k.slice(3)}.png`, { frameWidth: f.w, frameHeight: f.h });
    }
    this.load.image('cave_bg', 'assets/greek/cave_bg.png');
  }

  create() {
    this.anims.create({ key: 'campfire', frames: this.anims.generateFrameNumbers('campfire_ss', {}), frameRate: 9, repeat: -1 });
    this.anims.create({ key: 'door-open', frames: this.anims.generateFrameNumbers('door_ss', { start: 0, end: 3 }), frameRate: 12 });
    // idle loop for every animated Greek enemy (frames 0-1), used on the map and in battle
    for (const k of Object.keys(GREEK_SHEETS)) {
      if (k === 'gk_fx' || k === 'gk_odysseus') continue;
      this.anims.create({ key: `${k}-idle`, frames: this.anims.generateFrameNumbers(k, { frames: [0, 1] }), frameRate: 2.5, repeat: -1 });
    }
    this.anims.create({ key: 'gk_odysseus-idle', frames: this.anims.generateFrameNumbers('gk_odysseus', { frames: [0, 1] }), frameRate: 2, repeat: -1 });
    this.anims.create({ key: 'fx-slash', frames: this.anims.generateFrameNumbers('gk_fx', { frames: [0, 1, 2] }), frameRate: 20 });
    this.anims.create({ key: 'fx-impact', frames: this.anims.generateFrameNumbers('gk_fx', { frames: [3, 4, 5] }), frameRate: 18 });
    this.makeVignette();
    if (!this.registry.get('stats')) this.registry.set('stats', { ...START_STATS });
    this.scene.start('village');
  }

  /** Radial darkness overlay used by maps with the `dark` property. */
  private makeVignette() {
    const w = 480, h = 270;
    const tex = this.textures.createCanvas('vignette', w, h)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, 'rgba(8,6,20,0)');
    g.addColorStop(0.55, 'rgba(8,6,20,0.25)');
    g.addColorStop(1, 'rgba(8,6,20,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }
}
