/** Fantasy Battlers enemies (public/assets/battlers/<sprite>.png, the "b" files are recolors). */
export interface EnemyMove {
  name: string;
  /** damage multiplier (0 = no damage) */
  power: number;
  /** relative chance of being picked */
  weight: number;
  /** heals the enemy by this fraction of its max HP */
  heal?: number;
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
}

export const START_STATS: PlayerStats = { level: 1, xp: 0, hp: 40, maxHp: 40, atk: 7, potions: 3 };
export const XP_PER_LEVEL = 20;
export const POTION_HEAL = 20;

/** Extra rewards for opening a chest the first time (on top of its dialog text). */
export const CHEST_REWARDS: Record<string, { potions?: number; heal?: boolean }> = {
  chest_0: { potions: 1 },
  chest_1: { potions: 1 },
  chest_golem: { potions: 3, heal: true },
};
