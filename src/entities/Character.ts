import Phaser from 'phaser';

export type Dir = 'down' | 'left' | 'right' | 'up';
export const FRAME_W = 16;
export const FRAME_H = 32;

interface SheetLayout {
  walk: Record<Dir, number[]>;
  idle: Record<Dir, number[]>;
  walkRate: number;
  idleRate: number;
}

/** LimeZu Modern Interiors (tools/import_characters.py): row 0 = run, row 1 = idle; 6 frames/dir, order right,up,left,down. */
function limezu(): SheetLayout {
  const order: Dir[] = ['right', 'up', 'left', 'down'];
  const walk = {} as Record<Dir, number[]>,
    idle = {} as Record<Dir, number[]>;
  order.forEach((d, i) => {
    walk[d] = [0, 1, 2, 3, 4, 5].map((k) => i * 6 + k);
    idle[d] = [0, 1, 2, 3, 4, 5].map((k) => 24 + i * 6 + k);
  });
  return { walk, idle, walkRate: 10, idleRate: 6 };
}

/** RPG Maker style (Fungus Cave pack): 3 cols x 4 rows, rows down,left,right,up; middle column = standing. */
function rpgMaker(): SheetLayout {
  const order: Dir[] = ['down', 'left', 'right', 'up'];
  const walk = {} as Record<Dir, number[]>,
    idle = {} as Record<Dir, number[]>;
  order.forEach((d, r) => {
    walk[d] = [r * 3, r * 3 + 1, r * 3 + 2, r * 3 + 1];
    idle[d] = [r * 3 + 1];
  });
  return { walk, idle, walkRate: 7, idleRate: 1 };
}

const LIMEZU = limezu();
const RPGM = rpgMaker();

/** Every character sheet the game knows, with its layout. Preload loads exactly these. */
export const CHARACTER_SHEETS: Record<string, SheetLayout> = {
  adam: LIMEZU,
  alex: LIMEZU,
  amelia: LIMEZU,
  bob: LIMEZU,
  alex_alt: LIMEZU,
  amelia_alt: LIMEZU,
  cleric: RPGM,
  fungus_ghost: RPGM,
  fungus_king: RPGM,
  fungus_red: RPGM,
  fungus_violet: RPGM,
  refugee1: RPGM,
  refugee2: RPGM,
  refugee3: RPGM,
  refugee4: RPGM,
  sewer_ghost: RPGM,
  sewer_monster: RPGM,
  // Greek god skins (tools/greek_skins.py), same layout as the LimeZu sheets they are painted over
  zeus: LIMEZU,
  hermes: LIMEZU,
  hades: LIMEZU,
  heracles: LIMEZU,
  aphrodite: LIMEZU,
};

/** Skins the player can cycle through with C, in order. */
export const PLAYER_SKINS: { key: string; name: string }[] = [
  { key: 'adam', name: 'Adam' },
  { key: 'zeus', name: 'Zeus' },
  { key: 'hermes', name: 'Hermes' },
  { key: 'hades', name: 'Hades' },
  { key: 'heracles', name: 'Heracles' },
  { key: 'aphrodite', name: 'Aphrodite' },
];

export function createCharacterAnims(scene: Phaser.Scene, key: string) {
  const layout = CHARACTER_SHEETS[key] ?? LIMEZU;
  (Object.keys(layout.walk) as Dir[]).forEach((d) => {
    if (!scene.anims.exists(`${key}-walk-${d}`)) {
      scene.anims.create({
        key: `${key}-walk-${d}`,
        frames: scene.anims.generateFrameNumbers(key, { frames: layout.walk[d] }),
        frameRate: layout.walkRate,
        repeat: -1,
      });
    }
    if (!scene.anims.exists(`${key}-idle-${d}`)) {
      scene.anims.create({
        key: `${key}-idle-${d}`,
        frames: scene.anims.generateFrameNumbers(key, { frames: layout.idle[d] }),
        frameRate: layout.idleRate,
        repeat: -1,
      });
    }
  });
}

/** Sprite positioned by its feet, with a small feet-only physics body and y-sorted depth. */
export class Character extends Phaser.Physics.Arcade.Sprite {
  facing: Dir = 'down';
  sheet: string;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string) {
    super(scene, x, y, sheet, 0);
    this.sheet = sheet;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 6);
    body.setOffset(3, FRAME_H - 7);
    createCharacterAnims(scene, sheet);
    this.face('down');
  }

  /** Swap to another character sheet, keeping position and facing. */
  setSheet(sheet: string) {
    this.sheet = sheet;
    createCharacterAnims(this.scene, sheet);
    this.setTexture(sheet, 0);
    this.face(this.facing);
  }

  /** Feet-centre point in world space (from the sprite, so it is valid right after a teleport). */
  get feet() {
    return new Phaser.Math.Vector2(this.x, this.y - 1);
  }

  face(d: Dir) {
    this.facing = d;
    this.anims.play(`${this.sheet}-idle-${d}`, true);
  }

  faceTowards(x: number, y: number) {
    const dx = x - this.x,
      dy = y - this.y;
    this.face(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
  }

  move(vx: number, vy: number) {
    this.setVelocity(vx, vy);
    if (vx === 0 && vy === 0) {
      this.face(this.facing);
      return;
    }
    if (Math.abs(vx) > Math.abs(vy)) this.facing = vx < 0 ? 'left' : 'right';
    else this.facing = vy < 0 ? 'up' : 'down';
    this.anims.play(`${this.sheet}-walk-${this.facing}`, true);
  }

  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt);
    this.setDepth(this.y);
  }
}
