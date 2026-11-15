/** Fantasy Battlers enemies (public/assets/battlers/<sprite>.png, the "b" files are recolors). */
export interface EnemyMove {
  name: string;
  /** damage multiplier (0 = no damage) */
  power: number;
  /** relative chance of being picked */
  weight: number;
  /** heals the enemy by this fraction of its max HP */
  heal?: number;
  /** battle animation: melee lunge (default), thrown boulder, or siren song notes */
  fx?: 'melee' | 'boulder' | 'song';
}

export interface EnemyDef {
  name: string;
  sprite: string;
  hp: number;
  atk: number;
  xp: number;
  boss?: boolean;
  /** map behaviour: chase the player when this close (px), 0 = stand still */
  aggro: number;
  intro: string;
  moves: EnemyMove[];
  /** line shown when it is defeated */
  outro?: string;
}

const hit = (name = 'Attack', power = 1, weight = 3): EnemyMove => ({ name, power, weight });

export const ENEMIES: Record<string, EnemyDef> = {
  mole: {
    name: 'Sewer Mole',
    sprite: 'battler_01',
    hp: 12,
    atk: 3,
    xp: 4,
    aggro: 70,
    intro: 'A Sewer Mole pops out of the muck!',
    moves: [hit('Scratch'), hit('Dig Strike', 1.4, 1)],
  },
  mole_pink: {
    name: 'Pink Mole',
    sprite: 'battler_01b',
    hp: 14,
    atk: 4,
    xp: 5,
    aggro: 70,
    intro: 'A Pink Mole blocks the way!',
    moves: [hit('Scratch'), hit('Dig Strike', 1.4, 1)],
  },
  mole_digger: {
    name: 'Mole Digger',
    sprite: 'battler_02',
    hp: 16,
    atk: 4,
    xp: 6,
    aggro: 70,
    intro: 'A Mole Digger swings its axe!',
    moves: [hit('Axe Chop', 1.2), hit('Barrel Roll', 1.6, 1)],
  },
  wyvernling: {
    name: 'Wyvernling',
    sprite: 'battler_06',
    hp: 14,
    atk: 5,
    xp: 6,
    aggro: 90,
    intro: 'A Wyvernling swoops down!',
    moves: [hit('Claw'), hit('Dive', 1.5, 1)],
  },
  lurker: {
    name: 'Lurker',
    sprite: 'battler_04',
    hp: 20,
    atk: 5,
    xp: 8,
    aggro: 60,
    intro: 'A Lurker rises from the water!',
    moves: [hit('Knife'), hit('Belly Flop', 1.3, 2)],
  },
  mirror_drake: {
    name: 'Mirror Drake',
    sprite: 'battler_05b',
    hp: 26,
    atk: 6,
    xp: 10,
    aggro: 60,
    intro: 'The Mirror Drake glares at its reflection... then at you.',
    moves: [hit('Tail Whip'), { name: 'Mirror Shine', power: 0.6, weight: 1, heal: 0.15 }],
  },
  gold_knight: {
    name: 'Gold Knight',
    sprite: 'battler_07',
    hp: 32,
    atk: 7,
    xp: 14,
    aggro: 50,
    intro: 'A Gold Knight draws twin blades!',
    moves: [hit('Slash'), hit('Twin Slash', 1.6, 1)],
  },
  candy_kid: {
    name: 'Candy Kid',
    sprite: 'battler_10',
    hp: 18,
    atk: 4,
    xp: 8,
    aggro: 80,
    intro: 'The Candy Kid wants your lunch money!',
    moves: [hit('Lollipop Bonk'), { name: 'Sugar Rush', power: 0, weight: 1, heal: 0.3 }],
  },
  gumball_golem: {
    name: 'Gumball Golem',
    sprite: 'battler_11',
    hp: 70,
    atk: 9,
    xp: 40,
    boss: true,
    aggro: 0,
    intro: 'The Gumball Golem awakens! It guards the sewer treasure.',
    moves: [
      hit('Iron Fist', 1, 3),
      hit('Gumball Barrage', 1.5, 2),
      { name: 'Refill', power: 0, weight: 1, heal: 0.15 },
    ],
  },
};

// ---------------------------------------------------------------- Odyssey enemies (tools/greek_battlers.py)
const song = (name: string, power: number, weight: number): EnemyMove => ({
  name,
  power,
  weight,
  fx: 'song',
});

Object.assign(ENEMIES, {
  raider: {
    name: 'Ciconian Raider',
    sprite: 'gk_raider',
    hp: 12,
    atk: 3,
    xp: 4,
    aggro: 70,
    intro: 'A Ciconian raider bars the way, shield raised!',
    outro: 'The raider flees back to his ships.',
    moves: [hit('Xiphos Slash'), hit('Shield Bash', 1.4, 1)],
  },
  raider_captain: {
    name: 'Ciconian Captain',
    sprite: 'gk_raider_captain',
    hp: 18,
    atk: 4,
    xp: 6,
    aggro: 70,
    intro: 'A Ciconian captain in gilded bronze challenges you!',
    outro: 'The captain drops his golden shield and runs.',
    moves: [hit('Xiphos Slash'), hit('Shield Bash', 1.4, 1), hit('Battle Cry Charge', 1.7, 1)],
  },
  siren: {
    name: 'Siren',
    sprite: 'gk_siren',
    hp: 14,
    atk: 5,
    xp: 7,
    aggro: 90,
    intro: 'A Siren sings from her rock. Stop your ears, son of Laertes!',
    outro: 'The song breaks off. The Siren flies away over the sea.',
    moves: [hit('Talon Swipe', 1, 2), song('Bewitching Song', 1.4, 2)],
  },
  siren_violet: {
    name: 'Siren of the Rocks',
    sprite: 'gk_siren_violet',
    hp: 20,
    atk: 5,
    xp: 9,
    aggro: 90,
    intro: 'A golden-haired Siren promises you all the wisdom of the world...',
    outro: 'Her song fades into the sound of waves.',
    moves: [
      hit('Talon Swipe', 1, 2),
      song('Song of Knowledge', 1.5, 2),
      { name: 'Sea Breeze', power: 0, weight: 1, heal: 0.2 },
    ],
  },
  shade: {
    name: 'Shade of the Dead',
    sprite: 'gk_shade',
    hp: 16,
    atk: 4,
    xp: 6,
    aggro: 60,
    intro: 'A shade drifts up from the House of Hades!',
    outro: 'The shade sinks back to the Underworld.',
    moves: [hit('Spectral Spear'), hit('Grave Chill', 1.5, 1)],
  },
  shade_restless: {
    name: 'Restless Shade',
    sprite: 'gk_shade_restless',
    hp: 26,
    atk: 6,
    xp: 10,
    aggro: 60,
    intro: 'A restless shade thirsts for the blood of the living!',
    outro: 'At last the restless shade is at peace.',
    moves: [
      hit('Spectral Spear'),
      hit('Grave Chill', 1.5, 1),
      { name: 'Drink of Blood', power: 0.6, weight: 1, heal: 0.15 },
    ],
  },
  polyphemus: {
    name: 'Polyphemus',
    sprite: 'gk_polyphemus',
    hp: 70,
    atk: 9,
    xp: 40,
    boss: true,
    aggro: 0,
    intro:
      'Polyphemus the Cyclops rolls the stone from his cave. "Who are you, stranger?" ...You answer: "Nobody."',
    outro: '"Nobody has blinded me!" roars Polyphemus. Not one Cyclops comes to help him.',
    moves: [
      hit('Club Smash', 1, 3),
      { name: 'Hurl Boulder', power: 1.5, weight: 2, fx: 'boulder' },
      { name: 'Guzzle Wine', power: 0, weight: 1, heal: 0.15 },
    ],
  },
} satisfies Record<string, EnemyDef>);

/**
 * Animated Greek sheets in public/assets/greek/<name>.png (key = gk_<name>).
 * Enemy frames: 0 idle, 1 idle (breath), 2 wind-up, 3 strike, 4 hurt.
 */
export const GREEK_SHEETS: Record<string, { w: number; h: number }> = {
  gk_raider: { w: 32, h: 32 },
  gk_raider_captain: { w: 32, h: 32 },
  gk_shade: { w: 32, h: 32 },
  gk_shade_restless: { w: 32, h: 32 },
  gk_siren: { w: 32, h: 32 },
  gk_siren_violet: { w: 32, h: 32 },
  gk_polyphemus: { w: 48, h: 48 },
  /** hero, seen from behind: 0 idle, 1 breath, 2 wind-up, 3 thrust, 4 guard, 5 hurt, 6 victory */
  gk_odysseus: { w: 40, h: 40 },
  /** 0-2 slash, 3-5 impact, 6 note, 7 boulder, 8 spark, 9 ambrosia, 10 owl */
  gk_fx: { w: 32, h: 32 },
};
export const FOE_FRAME = { idle: 0, breath: 1, windup: 2, strike: 3, hurt: 4 } as const;
export const HERO_FRAME = {
  idle: 0,
  breath: 1,
  windup: 2,
  thrust: 3,
  guard: 4,
  hurt: 5,
  victory: 6,
} as const;
export const FX_FRAME = {
  slash: 0,
  impact: 3,
  note: 6,
  boulder: 7,
  spark: 8,
  ambrosia: 9,
  owl: 10,
} as const;

/** All battler images to preload (key = battler_<file name>). */
export const BATTLER_FILES = [
  '01',
  '01b',
  '02',
  '02b',
  '03',
  '03b',
  '04',
  '04b',
  '05',
  '05b',
  '06',
  '06b',
  '07',
  '07b',
  '08',
  '08b',
  '09',
  '09b',
  '10',
  '10b',
  '11',
  '11b',
];

export interface PlayerStats {
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  atk: number;
  potions: number;
  /** coins: from treasure (Circe's lure chest); Kalos's shop will spend them */
  gold?: number;
}

export const START_STATS: PlayerStats = {
  level: 1,
  xp: 0,
  hp: 40,
  maxHp: 40,
  atk: 7,
  potions: 3,
  gold: 0,
};
export const XP_PER_LEVEL = 20;
export const POTION_HEAL = 20;

/** Extra rewards for opening a chest the first time (on top of its dialog text). */
export const CHEST_REWARDS: Record<string, { potions?: number; heal?: boolean }> = {
  chest_0: { potions: 1 },
  chest_1: { potions: 1 },
  chest_golem: { potions: 3, heal: true },
  chest_circe: { potions: 2, heal: true },
  chest_cyclops: { potions: 2, heal: true },
};
