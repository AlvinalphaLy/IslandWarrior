import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { PLAYER_SKINS } from '../entities/Character';
import { dialogFor, DialogEntry } from '../data/dialog';
import { touch, setActionHandler, setShootHandler, setWeatherHandler, setWeatherButton, showDialog, toast, updateHud, showVictory, hideVictory } from '../ui';
import { Enemy } from '../entities/Enemy';
import { Ship } from '../entities/Ship';
import { Archery } from '../entities/Archery';
import { Harbor } from '../entities/Harbor';
import { Weather } from '../entities/Weather';
import { CHEST_REWARDS, ENEMIES, FX_FRAME, PlayerStats, START_STATS } from '../data/enemies';
import type { BattleData, BattleResult } from './BattleScene';

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x1fffffff;

interface TiledProp { name: string; value: unknown }
interface TiledObject {
  id: number; name: string; type: string; x: number; y: number; width: number; height: number;
  rotation: number; gid?: number; point?: boolean; properties?: TiledProp[];
}
interface TiledTileset { firstgid: number; name: string; tilecount: number }
interface TiledLayer { name: string; type: string; objects?: TiledObject[] }
interface TiledMap { tilesets: TiledTileset[]; layers: TiledLayer[]; tilewidth: number; properties?: TiledProp[] }

const prop = <T>(o: { properties?: TiledProp[] }, key: string, def: T): T =>
  (o.properties?.find((p) => p.name === key)?.value as T) ?? def;

interface Interactable {
  kind: 'npc' | 'sign' | 'chest' | 'ship' | 'statue';
  rect: Phaser.Geom.Rectangle; npc?: Npc; dialog: string; id: string;
  /** ship / statue: scene it leads to; ship only: the unlock it needs (registry 'unlocks') */
  target?: string; requires?: string;
}
/** A door (village houses) or exit (cave ladder): walking up into it moves to `target`. */
/**
 * A statue that leads into a dungeon. `chest`: the lure still standing there, until it is used.
 * `style`: how the lure wakes the statue - 'rise' (Circe: the chest is bait, the statue rises from the ground) or
 * 'pour' (Polyphemus: the statue is already there; you pour the amphora of wine into its mouth).
 * `aura`: the aura colour once awake (AURAS), or null for none.
 */
interface StatueSpot {
  it: Interactable; x: number; y: number; arrive: Phaser.Math.Vector2;
  sprite: Phaser.GameObjects.Sprite; aura: AuraStyle | null; chest: Phaser.GameObjects.Sprite | null; style: 'rise' | 'pour' | 'hurl' | 'sing';
  /** not woken yet: the first E plays its awakening instead of entering */
  asleep: boolean;
}
/** Aura palettes: the glow hugging the statue, the pool at its feet, and the two wisp textures rising from it. */
const AURAS = {
  black: { glow: '#07020c', shadow: '#000000', pool: 0x000000, wisps: ['aura_wisp_black', 'aura_wisp_violet'] },
  wine: { glow: '#5c0820', shadow: '#2a0010', pool: 0x3a0418, wisps: ['aura_wisp_wine', 'aura_wisp_purple'] },
} as const;
type AuraStyle = keyof typeof AURAS;
interface Portal { id: string; kind: 'door' | 'exit'; target: string; rect: Phaser.Geom.Rectangle; tile: Phaser.Math.Vector2; busy: boolean }

export interface MapSceneData {
  /** id of the portal the player arrived through on the previous map (e.g. house_3) */
  from?: string;
}

/**
 * Generic Tiled-driven map scene. Layer conventions (see tools/build_map.py, tools/build_cave.py):
 * Ground0..2 tile layers, Objects (tile objects with sortY/z), Collision rects, Spawns (player/npc/sign/chest/door/exit).
 */
/**
 * Statue dungeons whose challenge ends with a trip back to the ship: once `boss` (a Spawns name) is defeated (crushed
 * by the boulder or beaten in battle), its hoard `chest` is collected for you and you're returned to the helm of the
 * ship on the map you came from. `delay` lets the win play out first (the Cyclops' boulder cutscene runs ~3.2 s).
 */
const CHALLENGES: Record<string, { name: string; boss: string; chest: string; delay: number }> = {
  cyclops: { name: 'The Cave of Polyphemus', boss: 'polyphemus', chest: 'chest_cyclops', delay: 3600 },
  circe: { name: "Circe's Grotto", boss: 'siren_b', chest: 'chest_circe', delay: 1800 },
};
/** how long the VICTORY banner shows before the trip back to the island (ms) */
const VICTORY_MS = 4200;
/**
 * What each challenge gives the first time it is won (on top of its hoard, and the full heal every win gives):
 *   wine  Maron's wine, the Cyclops' undoing: max HP +WINE_HP for good
 *   ship  the black ship rebuilt with a bronze hull and a crimson war sail: faster on every map, and in the
 *         Laestrygonian harbour faster still and taking half damage (registry `shipLevel`)
 *   skin  the FaZe Odysseus skin (PLAYER_SKINS, unlock 'circe'): put on at once, then in the C cycle
 */
const PRIZES: Record<string, 'wine' | 'ship' | 'skin'> = { cyclops: 'wine', telepylus: 'ship', circe: 'skin' };
const WINE_HP = 10;

export class MapScene extends Phaser.Scene {
  private raw!: TiledMap;
  private player!: Player;
  private npcs: Npc[] = [];
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private interactables: Interactable[] = [];
  private portals: Portal[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private debugOn = false;
  private overview = false;
  private leaving = false;
  private animatedTiles: { tiles: Phaser.Tilemaps.Tile[]; first: number; count: number }[] = [];
  private dialog: { entry: DialogEntry; line: number; target?: Interactable; onClose?: () => void } | null = null;
  private arrival: MapSceneData = {};
  private enemies: Enemy[] = [];
  /** ship name -> where the player lands when sailing back to this map */
  private shipLandings: Record<string, Phaser.Math.Vector2> = {};
  private vignette: Phaser.GameObjects.Image | null = null;
  /** night storm: rain, wind, lightning on outdoor maps (Weather.ts; N or the Night/Day button) */
  private weather: Weather | null = null;
  /** the sailable ship (village only), its interactable, and the talk area relative to its waterline centre */
  private ship: Ship | null = null;
  /** Odysseus' bow: arrows, targets, gates, axes and sheep (Spawns of those types; see Archery.ts) */
  private archery: Archery | null = null;
  /** the Laestrygonian harbour escape (map property `harbor`; see Harbor.ts) */
  private harbor: Harbor | null = null;
  private shipIt: Interactable | null = null;
  private shipTalk = new Phaser.Geom.Rectangle();
  private sailing = false;
  private edgeToastAt = 0;
  /** statues that lead somewhere (Circe's): where they stand and where you reappear on foot */
  private statues: StatueSpot[] = [];
  /** statues with only a plaque to read (no dungeon): readable on foot, or from the ship's deck */
  private readableStatues: { it: Interactable; x: number; y: number }[] = [];
  /** a short scripted sequence (Circe's statue rising) is playing: no input */
  private cutscene = false;
  /** coming back from a statue's dungeon by ship: start at the helm */
  private boardOnStart = false;
  private inBattle = false;
  /** the player can't start another battle until this time (after running away) */
  private safeUntil = 0;

  constructor(key: string) {
    super(key);
  }

  init(data: MapSceneData) {
    this.arrival = data ?? {};
    this.npcs = [];
    this.interactables = [];
    this.portals = [];
    this.animatedTiles = [];
    this.dialog = null;
    this.debugOn = false;
    this.overview = false;
    this.leaving = false;
    this.enemies = [];
    this.shipLandings = {};
    this.ship = null;
    this.shipIt = null;
    this.sailing = false;
    this.statues = [];
    this.readableStatues = [];
    this.boardOnStart = false;
    this.cutscene = false;
    this.vignette = null;
    this.inBattle = false;
    this.safeUntil = 0;
  }

  create() {
    this.raw = this.cache.tilemap.get(this.scene.key).data as TiledMap;
    const map = this.make.tilemap({ key: this.scene.key });
    const tilesets = this.raw.tilesets.map((t) => map.addTilesetImage(t.name, t.name)!);
    // Ground0..2 come from the tile reconstruction; Ground3 (village only) holds the patch that makes it pixel-exact
    this.raw.layers.filter((l) => l.type === 'tilelayer' && l.name.startsWith('Ground'))
      .forEach((l, i) => map.createLayer(l.name, tilesets, 0, 0)?.setDepth(-1000 + i));
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.setupTileAnimations(map);
    this.placeObjects();
    this.buildCollision();
    this.spawnActors();
    this.archery = new Archery(
      { scene: this, walls: this.walls, player: this.player, say: (key) => this.say(key) },
      this.layer('Spawns'), this.layer('Collision'),
    );
    // the harbour of the Laestrygonians: you start at the helm and must sail out under the giants' boulders
    this.harbor = prop(this.raw, 'harbor', false) && this.ship
      ? new Harbor({ scene: this, ship: this.ship, say: (key) => this.say(key), leave: (escaped, rewards) => this.leaveHarbor(escaped, rewards) }, this.layer('Spawns'))
      : null;
    if (this.harbor) toast(dialogFor('harbor_intro').lines[0], 4200);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    cam.fadeIn(300, 0, 0, 0);
    // start at the helm (back from a statue by ship, or in the harbour): board after the camera setup above, so the
    // camera follows the ship rather than the hidden player
    if (this.boardOnStart || this.harbor) this.board(true);
    if (prop(this.raw, 'dark', false)) {
      this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(9000).setDisplaySize(cam.width, cam.height);
    }
    // the night storm (outdoors only: maps with `dark` are caves and grottos), lit by Odysseus' torch or the ship
    this.weather = new Weather(this, !prop(this.raw, 'dark', false),
      () => (this.sailing && this.ship ? { x: this.ship.pos.x, y: this.ship.pos.y } : { x: this.player.x, y: this.player.y, facing: this.player.facing }));
    setWeatherButton(this.weather.enabled);

    this.debugGfx = this.add.graphics().setDepth(10000).setVisible(false);
    this.setupInput();
    showDialog(null);
    updateHud(this.stats);
    this.events.on('battle-end', this.onBattleEnd, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('battle-end', this.onBattleEnd, this));
    this.watchChallenge();
  }

  // ---------------------------------------------------------------- challenge won: back to the ship
  /** In a CHALLENGES dungeon whose boss still stands, wait for it to be added to the registry's `defeated` list. */
  private watchChallenge() {
    const ch = CHALLENGES[this.scene.key];
    const bossKey = ch && `${this.scene.key}:${ch.boss}`;
    const defeated = () => (this.registry.get('defeated') as string[] | undefined) ?? [];
    if (!ch || defeated().includes(bossKey)) return;
    // 'setdata' fires the first time `defeated` is set, 'changedata' every time after
    const onData = (_parent: unknown, key: string) => {
      if (key !== 'defeated' || !defeated().includes(bossKey)) return;
      stop();
      this.challengeWon(ch);
    };
    const stop = () => {
      this.registry.events.off('setdata', onData);
      this.registry.events.off('changedata', onData);
    };
    this.registry.events.on('setdata', onData);
    this.registry.events.on('changedata', onData);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  }

  /** Let the victory play out, hand over the hoard, show the VICTORY banner, then sail back to the ship by itself. */
  private challengeWon(ch: { name: string; chest: string; delay: number }) {
    this.cutscene = true;
    this.player.frozen = true;
    this.player.move(0, 0);
    this.time.delayedCall(ch.delay, () => {
      if (this.leaving) return;
      const hoard = this.openChest(ch.chest);
      // the hoard's text, then its reward line (openChest appends it last)
      const rewards = hoard ? hoard.lines : [];
      this.celebrate(ch.name, rewards, () => this.returnToShip());
    });
  }

  /**
   * Every challenge ends here: a golden flash, the VICTORY banner (challenge name + rewards) for VICTORY_MS, then
   * `then` takes you back to the island. No input while it shows.
   */
  private celebrate(name: string, rewards: string[], then: () => void) {
    if (this.leaving) return;
    this.cutscene = true;
    this.player.frozen = true;
    this.player.move(0, 0);
    if (this.dialog) { this.dialog = null; this.renderDialog(); }
    const won = (this.registry.get('challengesWon') as string[] | undefined) ?? [];
    const first = !won.includes(this.scene.key);
    this.registry.set('challengesWon', [...won, ...(first ? [this.scene.key] : [])]);
    const lines = [...rewards];
    const st = this.stats;
    const prize = PRIZES[this.scene.key];
    if (first && prize === 'wine') {
      st.maxHp += WINE_HP;
      lines.push(`Prize: Maron's wine! Max HP +${WINE_HP} (now ${st.maxHp})`);
    } else if (first && prize === 'skin') {
      const skin = PLAYER_SKINS.find((k) => k.unlock === this.scene.key);
      if (skin) {
        this.player.setSheet(skin.key);
        this.registry.set('playerSkin', skin.key);
        lines.push(`Prize: the ${skin.name} skin! You're wearing it now (C to switch)`);
      }
    } else if (first && prize === 'ship') {
      this.registry.set('shipLevel', Math.max(1, (this.registry.get('shipLevel') as number | undefined) ?? 0));
      lines.push('Prize: your ship is rebuilt with a bronze hull and a crimson sail: faster, and boulders do half damage');
    }
    // every win: back to full health
    st.hp = st.maxHp;
    this.registry.set('stats', st);
    updateHud(st);
    if (!lines.some((l) => /HP fully restored/.test(l))) lines.push('HP fully restored');
    this.cameras.main.flash(500, 255, 224, 140);
    showVictory(name, lines, VICTORY_MS);
    this.time.delayedCall(VICTORY_MS, () => { hideVictory(); then(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, hideVictory);
  }

  /** Leave the dungeon for the map it was entered from, starting at the ship's helm. */
  private returnToShip() {
    this.leaving = true;
    this.player.frozen = true;
    const target = this.portals.find((p) => p.kind === 'exit')?.target || 'village';
    const from = (this.registry.get('lastHouse') as string | undefined) ?? '';
    this.registry.set('statueBy', 'ship'); // arriving back "through" the statue with this set boards the ship
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(target, { from } as MapSceneData);
    });
  }

  private get stats(): PlayerStats {
    return { ...START_STATS, ...(this.registry.get('stats') as PlayerStats | undefined) };
  }

  // ---------------------------------------------------------------- map
  private tilesetFor(gid: number) {
    const ts = [...this.raw.tilesets].reverse().find((t) => gid >= t.firstgid)!;
    return { key: ts.name, frame: gid - ts.firstgid };
  }

  private layer(name: string) {
    return this.raw.layers.find((l) => l.name === name)?.objects ?? [];
  }

  /** Animated tilesets (water) cycle through all their frames. */
  private setupTileAnimations(map: Phaser.Tilemaps.Tilemap) {
    for (const ts of this.raw.tilesets.filter((t) => t.name === 'water')) {
      const tiles: Phaser.Tilemaps.Tile[] = [];
      for (const name of ['Ground0', 'Ground1', 'Ground2']) {
        map.getLayer(name)?.tilemapLayer.forEachTile((t) => {
          if (t.index >= ts.firstgid && t.index < ts.firstgid + ts.tilecount) tiles.push(t);
        });
      }
      if (tiles.length) this.animatedTiles.push({ tiles, first: ts.firstgid, count: ts.tilecount });
    }
    if (!this.animatedTiles.length) return;
    let frame = 0;
    this.time.addEvent({
      delay: 140, loop: true,
      callback: () => {
        frame++;
        for (const a of this.animatedTiles) for (const t of a.tiles) t.index = a.first + (frame % a.count);
      },
    });
  }

  /** Free-placed tile objects -> sprites. Tiled tile objects anchor bottom-left and rotate around that anchor. */
  private placeObjects() {
    const ts = this.raw.tilewidth;
    for (const o of this.layer('Objects')) {
      if (!o.gid) continue;
      const { key, frame } = this.tilesetFor(o.gid & GID_MASK);
      const a = Phaser.Math.DegToRad(o.rotation || 0);
      const hx = ts / 2, hy = -ts / 2;
      const img = this.add.sprite(o.x + hx * Math.cos(a) - hy * Math.sin(a), o.y + hx * Math.sin(a) + hy * Math.cos(a), `${key}_ss`, frame);
      img.setAngle(o.rotation || 0);
      img.setFlip(!!(o.gid & FLIP_H), !!(o.gid & FLIP_V));
      if (o.gid & FLIP_D) img.setAngle(img.angle + 90).setFlipX(!img.flipX);
      const sortY = prop(o, 'sortY', -1), z = prop(o, 'z', 0);
      img.setDepth(sortY < 0 ? -500 + z * 1e-4 : sortY + z * 1e-5);
      if (key === 'campfire') img.play('campfire');
    }
  }

  private buildCollision() {
    this.walls = this.physics.add.staticGroup();
    for (const r of this.layer('Collision')) {
      this.walls.add(this.add.zone(r.x + r.width / 2, r.y + r.height / 2, r.width, r.height));
    }
  }

  private spawnActors() {
    let start: { x: number; y: number; sprite: string; face: 'down' | 'up' } | null = null;
    for (const s of this.layer('Spawns')) {
      const rect = new Phaser.Geom.Rectangle(s.x, s.y, s.width, s.height);
      if (s.type === 'player') {
        start ??= { x: s.x, y: s.y, sprite: prop(s, 'sprite', 'adam'), face: 'down' };
      } else if (s.type === 'npc') {
        const npc = new Npc(this, s.x, s.y, prop(s, 'sprite', 'amelia'), s.name, prop(s, 'dialog', ''), prop(s, 'wander', 0));
        this.npcs.push(npc);
        this.interactables.push({ kind: 'npc', npc, rect: new Phaser.Geom.Rectangle(), dialog: npc.dialogKey, id: s.name });
      } else if (s.type === 'enemy') {
        const id = prop(s, 'enemy', '');
        const defeated = (this.registry.get('defeated') as string[] | undefined) ?? [];
        if (ENEMIES[id] && !defeated.includes(`${this.scene.key}:${s.name}`)) this.enemies.push(new Enemy(this, s.x, s.y, id, s.name));
      } else if (s.type === 'ship') {
        // the black ship: (x, y) is its mooring (waterline centre). Board it from the shore, sail it, land anywhere.
        // Where it was left is remembered; coming home from a voyage puts it back at the mooring.
        const saved = (this.registry.get('ships') as Record<string, { x: number; y: number; left: boolean }> | undefined)?.[`${this.scene.key}:${s.name}`];
        const fromVoyage = this.arrival.from === s.name;
        const water = this.layer('Collision').filter((r) => r.type === 'water');
        const b = this.physics.world.bounds;
        const keep = saved && !fromVoyage;
        const upgraded = ((this.registry.get('shipLevel') as number | undefined) ?? 0) > 0;
        this.ship = new Ship(this, keep ? saved.x : s.x, keep ? saved.y : s.y, water, b.width, b.height, upgraded ? 'ship_bronze' : 'ship');
        if (upgraded) this.ship.maxSpeed *= 1.25;   // the bronze hull (prize for escaping Telepylus)
        if (keep) this.ship.facingLeft = saved.left;
        // talkRect is the strip of shore you board from, kept relative to the mooring so it moves with the ship
        const r = prop(s, 'talkRect', '').split(',').map(Number);
        if (r.length === 4) this.shipTalk.setTo(r[0] - s.x, r[1] - s.y, r[2], r[3]);
        this.shipIt = {
          kind: 'ship', rect: new Phaser.Geom.Rectangle(), dialog: prop(s, 'dialog', ''), id: s.name,
          target: prop(s, 'target', ''), requires: prop(s, 'requires', ''),
        };
        this.interactables.push(this.shipIt);
        const a = prop(s, 'arrive', '').split(',').map(Number);
        if (a.length === 2) this.shipLandings[s.name] = new Phaser.Math.Vector2(a[0], a[1]);
      } else if (s.type === 'statue') {
        // a prop image standing on (x, y) = bottom centre of its base; the base blocks movement and can be read with E
        // optional: `aura` wraps it in black smoke; `target` makes E take you into that scene (from the shore or the ship)
        const fw = prop(s, 'footW', 28), fh = prop(s, 'footH', 8);
        const key = prop(s, 'sprite', 'horse_statue');
        const statue = this.add.sprite(s.x, s.y, key).setOrigin(0.5, 1).setDepth(s.y - fh / 2);
        // `lure`: a sprite (the treasure chest, the amphora) stands at `lureAt` (default: on the statue's spot) until
        // used; `awaken` says what using it does: 'rise' (default, the statue rises: awaken()), 'pour' (pourWine()),
        // 'hurl' (no lure: a statue hurls the boulder it holds the first time: hurlBoulder()), or 'sing' (no lure:
        // Homer plays his lyre the first time: singTale())
        const lure = prop(s, 'lure', '');
        const awakenProp = prop<string>(s, 'awaken', 'rise');
        const style: StatueSpot['style'] = awakenProp === 'pour' || awakenProp === 'hurl' || awakenProp === 'sing' ? awakenProp : 'rise';
        const asleep = (!!lure || style === 'hurl' || style === 'sing') && !((this.registry.get('awakened') as string[] | undefined) ?? []).includes(s.name);
        const la = prop(s, 'lureAt', '').split(',').map(Number);
        const [lx, ly] = la.length === 2 ? la : [s.x, s.y];
        const chest = asleep && lure ? this.add.sprite(lx, ly, lure, 0).setOrigin(0.5, 1).setDepth(ly - 2) : null;
        if ((style === 'hurl' || style === 'sing') && !asleep) statue.setFrame(1);   // boulder thrown / lyre turned gold
        // `aura`: true = black smoke, or the name of an AURAS palette ('wine')
        const auraProp = prop<boolean | string>(s, 'aura', false);
        const aura: AuraStyle | null = auraProp === true ? 'black' : typeof auraProp === 'string' && auraProp in AURAS ? auraProp as AuraStyle : null;
        if (asleep) {
          if (style === 'rise') statue.setVisible(false);   // a 'pour' statue is already there, dormant (frame 0)
        } else {
          if (this.anims.exists(`${key}-idle`)) statue.play(`${key}-idle`);
          if (aura) this.addAura(statue, false, aura);
        }
        this.walls.add(this.add.zone(s.x, s.y - 1 - fh / 2, fw, fh));
        const dialog = prop(s, 'dialog', '');
        const target = prop(s, 'target', '');
        const rect = new Phaser.Geom.Rectangle(s.x - fw / 2, s.y - fh - 1, fw, fh + 1);
        if (target) {
          const it: Interactable = { kind: 'statue', rect, dialog, id: s.name, target };
          this.interactables.push(it);
          const a = prop(s, 'arrive', '').split(',').map(Number);
          this.statues.push({ it, x: s.x, y: s.y, arrive: new Phaser.Math.Vector2(a.length === 2 ? a[0] : s.x, a.length === 2 ? a[1] : s.y + 10), sprite: statue, aura, chest, style, asleep });
        } else if (dialog) {
          const it: Interactable = { kind: 'sign', rect, dialog, id: s.name };
          this.interactables.push(it);
          this.readableStatues.push({ it, x: s.x, y: s.y });
        }
      } else if (s.type === 'sign' || s.type === 'chest') {
        this.interactables.push({ kind: s.type, rect, dialog: prop(s, 'dialog', ''), id: s.name });
      } else if (s.type === 'door' || s.type === 'exit') {
        const id = s.type === 'door' ? prop(s, 'house', s.name) : s.name;
        const p: Portal = {
          id, kind: s.type, target: prop(s, 'target', ''), busy: false,
          tile: new Phaser.Math.Vector2(s.x, s.y),
          rect: s.type === 'door' ? new Phaser.Geom.Rectangle(s.x + 3, s.y + s.height - 6, s.width - 6, 10) : rect,
        };
        this.portals.push(p);
      }
    }
    // arriving back through a door: stand just outside it, facing away from the house
    const via = this.portals.find((p) => p.kind === 'door' && p.id === this.arrival.from);
    // a skin chosen with C carries over between maps
    // the player is Odysseus (PLAYER_SKINS[0]) unless another skin was picked with C
    const sprite = (this.registry.get('playerSkin') as string | undefined) ?? PLAYER_SKINS[0].key;
    if (via) start = { x: via.rect.centerX, y: via.rect.bottom + 6, sprite, face: 'down' };
    // sailing home: step off onto the shore, looking at the ship
    const landing = this.arrival.from ? this.shipLandings[this.arrival.from] : undefined;
    if (!via && landing) start = { x: landing.x, y: landing.y, sprite, face: 'down' };
    // back from a statue's dungeon: on foot beside the statue, or at the helm if you came by ship
    const viaStatue = this.statues.find((st) => st.it.id === this.arrival.from);
    if (viaStatue) {
      start = { x: viaStatue.arrive.x, y: viaStatue.arrive.y, sprite, face: 'down' };
      this.boardOnStart = this.registry.get('statueBy') === 'ship' && !!this.ship;
    }
    this.player = new Player(this, start!.x, start!.y, sprite);
    this.player.face(start!.face);

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.npcs);
    this.physics.add.collider(this.npcs, this.walls);
    this.physics.add.collider(this.npcs, this.npcs);
    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.startBattle(e as Enemy));
  }

  // ---------------------------------------------------------------- battles
  private startBattle(enemy: Enemy) {
    if (this.inBattle || this.leaving || this.time.now < this.safeUntil || this.time.now < enemy.stunnedUntil) return;
    this.inBattle = true;
    this.battleEnemy = enemy;
    this.player.move(0, 0);
    this.cameras.main.flash(200, 255, 255, 255);
    this.time.delayedCall(220, () => {
      this.scene.launch('battle', { enemyId: enemy.enemyId, mapKey: this.scene.key } as BattleData);
      this.scene.pause();
    });
  }

  private battleEnemy: Enemy | null = null;

  private onBattleEnd(result: BattleResult) {
    const enemy = this.battleEnemy;
    this.battleEnemy = null;
    this.inBattle = false;
    updateHud(this.stats);
    if (result === 'win' && enemy) {
      const defeated = (this.registry.get('defeated') as string[] | undefined) ?? [];
      this.registry.set('defeated', [...defeated, `${this.scene.key}:${enemy.spawnName}`]);
      this.enemies = this.enemies.filter((e) => e !== enemy);
      enemy.destroy();
      if (enemy.def.boss) toast(`${enemy.def.name} defeated! The treasure is yours.`, 2600);
    } else if (result === 'run' && enemy) {
      enemy.stunnedUntil = this.time.now + 2500;
      this.safeUntil = this.time.now + 1500;
    } else if (result === 'lose') {
      // wake up outside the house you entered
      this.leaving = true;
      toast('You wake up outside, fully healed.', 2600);
      this.scene.start('village', { from: (this.registry.get('lastHouse') as string | undefined) ?? '' } as MapSceneData);
    }
  }

  // ---------------------------------------------------------------- input / dialog
  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('F1');
    // The keyboard plugin keeps its listeners when the scene restarts (every trip through a door), so remove them on
    // shutdown. Otherwise each return to a map adds another set and one key press acts twice.
    const binds: [string, () => void][] = [
      ['keydown-E', () => this.interact()], ['keydown-SPACE', () => this.interact()], ['keydown-ENTER', () => this.interact()],
      ['keydown-M', () => this.toggleOverview()],
      ['keydown-C', () => this.cycleSkin()],
      ['keydown-F', () => this.shoot()],
      ['keydown-N', () => this.toggleWeather()],
      ['keydown-F1', () => { this.debugOn = !this.debugOn; this.debugGfx.setVisible(this.debugOn); }],
    ];
    // After a restart Phaser 3.80's keyboard plugin can also deliver the same DOM event twice, so act once per event
    // (otherwise E boards the ship and immediately steps off again, or skips a dialog line).
    let lastEvent: KeyboardEvent | null = null;
    const handlers = binds.map(([ev, fn]) => [ev, (e: KeyboardEvent) => { if (e === lastEvent) return; lastEvent = e; fn(); }] as const);
    for (const [ev, fn] of handlers) kb.on(ev, fn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { for (const [ev, fn] of handlers) kb.off(ev, fn); });
    setActionHandler(() => this.interact());
    setShootHandler(() => this.shoot());
    setWeatherHandler(() => this.toggleWeather());
  }

  /** F (or the bow button): shoot an arrow, once Odysseus has found his bow. */
  private shoot() {
    if (this.dialog || this.leaving || this.cutscene || this.sailing || this.inBattle) return;
    this.archery?.shoot(this.time.now);
  }

  /** N / the Night-Day button: the night storm on or off (remembered across maps and visits). */
  private toggleWeather() {
    if (!this.weather || this.leaving) return;
    const night = this.weather.toggle();
    setWeatherButton(night);
    toast(night ? 'Night falls. A storm rolls in over Ithaca...' : 'Dawn. The storm passes.', 2000);
  }

  /** Open a dialog by key (used by Archery for the bow). */
  private say(key: string) {
    this.dialog = { entry: dialogFor(key), line: 0 };
    this.player.frozen = true;
    this.player.move(0, 0);
    this.renderDialog();
  }

  /** Cycle the player through PLAYER_SKINS (Odysseus, Adam, the Greek gods, and prize skins once won). */
  private cycleSkin() {
    if (this.dialog || this.leaving) return;
    const won = (this.registry.get('challengesWon') as string[] | undefined) ?? [];
    const open = PLAYER_SKINS.filter((s) => !s.unlock || won.includes(s.unlock));
    const i = open.findIndex((s) => s.key === this.player.sheet);
    const next = open[(i + 1) % open.length];
    this.player.setSheet(next.key);
    this.registry.set('playerSkin', next.key);
    toast(next.name);
  }

  private toggleOverview() {
    const cam = this.cameras.main;
    const b = this.physics.world.bounds;
    this.overview = !this.overview;
    this.vignette?.setVisible(!this.overview); // a screen-space overlay can't follow the zoomed-out camera
    if (this.overview) {
      cam.stopFollow();
      cam.setZoom(Math.min(1, cam.width / b.width, cam.height / b.height));
      cam.centerOn(b.centerX, b.centerY);
    } else {
      cam.setZoom(1);
      cam.startFollow(this.sailing && this.ship ? this.ship.sprite : this.player, true, 0.15, 0.15);
    }
  }

  private interact() {
    if (this.leaving || this.cutscene) return;
    if (this.dialog) return this.advanceDialog();
    if (this.sailing) {
      if (this.harbor) return toast('No landing here: the giants would crush you. Sail for the harbour mouth!', 2200);
      const st = this.statueInReach();
      if (st) return this.openStatue(st, true);
      // statues with only a plaque (e.g. the Cyclops head on its tiny islet) can be read from the deck
      const r = this.statueInReach(this.readableStatues);
      if (r) {
        this.dialog = { entry: dialogFor(r.dialog), line: 0, target: r, onClose: () => { this.player.frozen = true; } };
        return this.renderDialog();
      }
      return this.goAshore();
    }
    const p = this.player.probe;
    let best: Interactable | null = null;
    let bestD = 14;
    for (const it of this.interactables) {
      if (it.npc) it.rect.setTo(it.npc.x - 8, it.npc.y - 16, 16, 16);
      if (it === this.shipIt && this.ship) {
        // board from the shore strip, or from right next to the hull (after landing somewhere else)
        const h = this.ship.hull;
        const t = new Phaser.Geom.Rectangle(this.ship.pos.x + this.shipTalk.x, this.ship.pos.y + this.shipTalk.y, this.shipTalk.width, this.shipTalk.height);
        Phaser.Geom.Rectangle.Union(h, t, it.rect);
      }
      // the ship's boarding area is big; anything else in reach (a statue, a villager) wins over boarding
      const d = Phaser.Math.Distance.Between(p.x, p.y, Phaser.Math.Clamp(p.x, it.rect.left, it.rect.right), Phaser.Math.Clamp(p.y, it.rect.top, it.rect.bottom))
        + (it.kind === 'ship' ? 8 : 0);
      if (d < bestD) { bestD = d; best = it; }
    }
    if (!best) return;
    if (best.npc) {
      best.npc.talking = true;
      best.npc.faceTowards(this.player.x, this.player.y);
    }
    let entry = dialogFor(best.dialog);
    if (best.kind === 'chest') entry = this.openChest(best.id, best.dialog) ?? { name: entry.name, lines: ['It is empty.'] };
    if (best.kind === 'ship') return this.board();
    if (best.kind === 'statue') return this.openStatue(best, false);
    this.dialog = { entry, line: 0, target: best };
    this.player.frozen = true;
    this.renderDialog();
  }

  /**
   * Open a chest for the first time: mark it opened, apply its CHEST_REWARDS, and return its dialog with the reward
   * line added. Returns null if it was already opened.
   */
  private openChest(id: string, dialog = id): DialogEntry | null {
    const opened = (this.registry.get('openedChests') as string[] | undefined) ?? [];
    if (opened.includes(id)) return null;
    this.registry.set('openedChests', [...opened, id]);
    const entry = dialogFor(dialog);
    const reward = CHEST_REWARDS[id];
    if (!reward) return entry;
    const st = this.stats;
    st.potions += reward.potions ?? 0;
    if (reward.heal) st.hp = st.maxHp;
    this.registry.set('stats', st);
    updateHud(st);
    return { name: entry.name, lines: [...entry.lines, `+${reward.potions ?? 0} potions${reward.heal ? ', HP fully restored' : ''}.`] };
  }

  // ---------------------------------------------------------------- the ship
  /** Climb aboard: the player goes onto the deck and the arrow keys steer the ship. */
  private board(quiet = false) {
    if (!this.ship) return;
    this.sailing = true;
    this.player.frozen = true;
    this.player.move(0, 0);
    this.player.setVisible(false);
    (this.player.body as Phaser.Physics.Arcade.Body).enable = false;
    if (!this.overview) this.cameras.main.startFollow(this.ship.sprite, true, 0.08, 0.08);
    if (!quiet) toast(dialogFor('ship_board').lines[0], 3200);
  }

  /** Remember where the ship is, so it's still there after visiting another map. */
  private saveShip() {
    if (!this.ship || !this.shipIt) return;
    const ships = (this.registry.get('ships') as Record<string, unknown> | undefined) ?? {};
    this.registry.set('ships', { ...ships, [`${this.scene.key}:${this.shipIt.id}`]: { x: this.ship.pos.x, y: this.ship.pos.y, left: this.ship.facingLeft } });
  }

  // ---------------------------------------------------------------- statues with a dungeon (Circe's)
  /** A statue close enough to the ship's hull to step onto from the deck. */
  private statueInReach(list: { it: Interactable; x: number; y: number }[] = this.statues) {
    if (!this.ship) return null;
    const h = this.ship.hull;
    // the nearest one within 30px of the hull (two statues can both be in reach of a 72px-wide galley)
    const d = (st: { x: number; y: number }) => Phaser.Math.Distance.Between(st.x, st.y - 8,
      Phaser.Math.Clamp(st.x, h.x, h.right), Phaser.Math.Clamp(st.y - 8, h.y, h.bottom));
    let best: { it: Interactable; x: number; y: number } | null = null;
    for (const st of list) if (d(st) <= 30 && (!best || d(st) < d(best))) best = st;
    return best?.it ?? null;
  }

  /** Read the statue's lines; closing them takes you into its dungeon. While the lure stands there, open it instead. */
  private openStatue(it: Interactable, byShip: boolean) {
    const spot = this.statues.find((st) => st.it === it);
    if (spot?.asleep) {
      if (spot.style === 'pour') return this.pourWine(spot);
      if (spot.style === 'hurl') return this.hurlBoulder(spot);
      if (spot.style === 'sing') return this.singTale(spot);
      return this.awaken(spot);
    }
    this.dialog = { entry: dialogFor(it.dialog), line: 0, target: it, onClose: () => this.enterStatue(it, byShip) };
    this.player.frozen = true;
    this.renderDialog();
  }

  private enterStatue(it: Interactable, byShip: boolean) {
    if (!it.target || !this.scene.get(it.target)) return toast('The black smoke thins. The way is sealed.', 2200);
    this.leaving = true;
    this.player.frozen = true;
    this.registry.set('lastHouse', it.id); // exits in the dungeon come back "through" the statue
    this.registry.set('statueBy', byShip ? 'ship' : 'foot');
    if (byShip) this.saveShip();
    this.cameras.main.fadeOut(700, 12, 0, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(it.target!, { from: it.id } as MapSceneData);
    });
  }

  /**
   * The chest was bait. About 3 seconds:
   *   1. the lid flies open and gold coins fountain out (+50 gold)
   *   2. the chest rattles while black smoke spirals in from all around
   *   3. it collapses into a puff of black smoke: violet flash, screen shake, the spilled coins blacken and vanish
   *   4. the statue grinds up out of the ground, top first, kicking up dust, with a low rumble
   *   5. its eyes flare, the black aura swells in, and Circe speaks
   */
  private awaken(st: StatueSpot) {
    const chest = st.chest!;
    st.chest = null;
    st.asleep = false;
    this.cutscene = true;
    this.player.frozen = true;
    this.registry.set('awakened', [...((this.registry.get('awakened') as string[] | undefined) ?? []), st.it.id]);
    const stats = this.stats;
    stats.gold = (stats.gold ?? 0) + 50;
    this.registry.set('stats', stats);
    updateHud(stats);
    this.ensureFxTextures();
    const { x, y } = st;
    const depth = chest.depth;
    const at = (ms: number, fn: () => void) => this.time.delayedCall(ms, fn);

    // 1. the bait
    chest.setFrame(1);
    toast('+50 gold!', 1800);
    const coins: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 16; i++) {
      const c = this.add.image(x + Phaser.Math.Between(-3, 3), y - 9, 'fx_coin').setDepth(depth + 1);
      coins.push(c);
      const tx = x + Phaser.Math.Between(-24, 24), peak = y - Phaser.Math.Between(18, 34), land = y + Phaser.Math.Between(-4, 3);
      this.tweens.add({ targets: c, x: tx, duration: 650, delay: i * 18 });
      this.tweens.add({ targets: c, y: peak, duration: 280, delay: i * 18, ease: 'Quad.out',
        onComplete: () => this.tweens.add({ targets: c, y: land, duration: 370, ease: 'Bounce.out' }) });
    }
    // 2. the trap: rattle + black smoke spiralling in
    at(650, () => {
      this.tweens.add({ targets: chest, x: x + 1, duration: 45, yoyo: true, repeat: 8 });
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, r = Phaser.Math.Between(34, 48);
        const w = this.add.image(x + Math.cos(a) * r, y - 8 + Math.sin(a) * r * 0.6, i % 3 ? 'aura_wisp_black' : 'aura_wisp_violet')
          .setDepth(depth + 2).setScale(2).setAlpha(0);
        this.tweens.add({ targets: w, x: x + Math.cos(a + 1.4) * 3, y: y - 8 + Math.sin(a + 1.4) * 2, alpha: { from: 0.95, to: 0.6 },
          scale: 1, duration: 650, delay: i * 12, ease: 'Sine.in', onComplete: () => w.destroy() });
      }
    });
    // 3. the curse
    at(1400, () => {
      this.tweens.add({ targets: chest, alpha: 0, scaleY: 0.2, duration: 140, onComplete: () => chest.destroy() });
      for (let i = 0; i < 9; i++) {
        const p = this.add.circle(x + Phaser.Math.Between(-6, 6), y - Phaser.Math.Between(4, 14), Phaser.Math.Between(3, 6), i % 3 ? 0x000000 : 0x2a0f3d, 0.9)
          .setDepth(depth + 3);
        this.tweens.add({ targets: p, scale: 2.6, alpha: 0, y: p.y - Phaser.Math.Between(6, 16), duration: Phaser.Math.Between(500, 800), onComplete: () => p.destroy() });
      }
      this.cameras.main.flash(260, 90, 30, 140);
      this.cameras.main.shake(220, 0.006);
      for (const c of coins) {
        c.setTexture('fx_coin_dark');
        this.tweens.add({ targets: c, alpha: 0, duration: 500, delay: Phaser.Math.Between(0, 250), onComplete: () => c.destroy() });
      }
    });
    // 4. she rises: reveal the statue top-first while sliding it up out of the ground
    at(1700, () => {
      const s = st.sprite, fh = s.height;
      s.setVisible(true).setFrame(0).setCrop(0, 0, s.width, 0).setY(y + fh);
      this.cameras.main.shake(1000, 0.002);
      const dust = this.time.addEvent({ delay: 70, repeat: 13, callback: () => {
        const d = this.add.rectangle(x + Phaser.Math.Between(-8, 8), y - 1, 2, 2, Phaser.Math.RND.pick([0xb89a6a, 0x8c7354, 0xd8c49a])).setDepth(depth + 1);
        this.tweens.add({ targets: d, x: d.x + Phaser.Math.Between(-10, 10), y: d.y - Phaser.Math.Between(3, 8), alpha: 0, duration: 450, onComplete: () => d.destroy() });
      } });
      this.tweens.addCounter({ from: 0, to: fh, duration: 1100, ease: 'Sine.out',
        onUpdate: (tw) => { const h = Math.round(tw.getValue() ?? 0); s.setCrop(0, 0, s.width, h).setY(y + fh - h); },
        onComplete: () => { s.setCrop().setY(y); dust.remove(); } });
    });
    // 5. eyes flare, aura swells in, Circe speaks
    at(2900, () => {
      const s = st.sprite;
      s.setFrame(1);
      if (this.anims.exists(`${s.texture.key}-idle`)) this.time.delayedCall(250, () => s.play(`${s.texture.key}-idle`));
      if (st.aura) this.addAura(s, true, st.aura);
      this.cameras.main.flash(150, 60, 10, 90);
    });
    at(3500, () => {
      this.cutscene = false;
      this.dialog = { entry: dialogFor('circe_awaken'), line: 0, target: st.it };
      this.renderDialog();
    });
  }

  /**
   * Odysseus' trick on Polyphemus: the amphora of Maron's wine poured into the stone mouth. About 3 seconds:
   *   1. the amphora tips toward the head and a stream of wine arcs into its mouth
   *   2. the empty jar topples and fades; the head shudders, the ground rumbles, a wine-red flash
   *   3. the jaw grinds open (frame 1), the eye blazes, red and violet sparks burst from the mouth
   *   4. the eye settles into its pulse, the wine-red aura swells in, and the Cyclops speaks
   * Uses the head's frames: 0 dormant, 1-2 awake (jaw open, eye blazing / glowing), idle anim `<key>-idle` = 1,2.
   */
  private pourWine(st: StatueSpot) {
    const jar = st.chest!;
    st.chest = null;
    st.asleep = false;
    this.cutscene = true;
    this.player.frozen = true;
    this.registry.set('awakened', [...((this.registry.get('awakened') as string[] | undefined) ?? []), st.it.id]);
    this.ensureFxTextures();
    const s = st.sprite;
    const mouth = { x: st.x, y: st.y - 13 };              // the mouth on the 32x34 head, from its bottom centre
    const dir = jar.x > st.x ? -1 : 1;                    // tip toward the head
    const lip = () => ({ x: jar.x + dir * 6, y: jar.y - 15 });
    const at = (ms: number, fn: () => void) => this.time.delayedCall(ms, fn);

    // 1. tip and pour
    this.tweens.add({ targets: jar, angle: dir * 75, y: jar.y - 3, duration: 420, ease: 'Sine.inOut' });
    at(420, () => {
      for (let i = 0; i < 22; i++) {
        at(i * 35, () => {
          const p = lip();
          const d = this.add.image(p.x, p.y, i % 4 ? 'fx_wine' : 'fx_wine_hi').setDepth(s.depth + 1);
          const peak = Math.min(p.y, mouth.y) - Phaser.Math.Between(6, 10);
          this.tweens.add({ targets: d, x: mouth.x + Phaser.Math.Between(-2, 2), duration: 380, ease: 'Linear' });
          this.tweens.add({ targets: d, y: peak, duration: 170, ease: 'Quad.out',
            onComplete: () => this.tweens.add({ targets: d, y: mouth.y + Phaser.Math.Between(-1, 1), duration: 210, ease: 'Quad.in', onComplete: () => d.destroy() }) });
        });
      }
    });
    // 2. the jar is empty: it topples and fades; the head shudders
    at(1350, () => {
      this.tweens.add({ targets: jar, angle: dir * 100, alpha: 0, y: jar.y + 2, duration: 450, onComplete: () => jar.destroy() });
      this.tweens.add({ targets: s, x: st.x + 1, duration: 50, yoyo: true, repeat: 7, onComplete: () => s.setX(st.x) });
      this.cameras.main.shake(700, 0.004);
      this.cameras.main.flash(240, 120, 10, 40);
    });
    // 3. the jaw opens, the eye blazes
    at(1900, () => {
      s.setFrame(1);
      for (let i = 0; i < 14; i++) {
        const a = Phaser.Math.FloatBetween(Math.PI * 1.1, Math.PI * 1.9);   // upwards fan from the mouth
        const p = this.add.image(mouth.x, mouth.y, i % 3 ? 'aura_wisp_wine' : 'aura_wisp_purple').setDepth(s.depth + 2).setScale(1.5);
        const r = Phaser.Math.Between(10, 22);
        this.tweens.add({ targets: p, x: mouth.x + Math.cos(a) * r, y: mouth.y + Math.sin(a) * r, alpha: 0, scale: 0.5,
          duration: Phaser.Math.Between(450, 750), ease: 'Quad.out', onComplete: () => p.destroy() });
      }
      this.cameras.main.flash(160, 160, 30, 30);
    });
    // 4. it breathes: eye pulse + aura
    at(2400, () => {
      if (this.anims.exists(`${s.texture.key}-idle`)) s.play(`${s.texture.key}-idle`);
      if (st.aura) this.addAura(s, true, st.aura);
    });
    at(3000, () => {
      this.cutscene = false;
      this.dialog = { entry: dialogFor(`${st.it.id}_awaken`), line: 0, target: st.it };
      this.renderDialog();
    });
  }

  /**
   * Homer begins the tale: his stone lyre turns to gold, a golden glow pulses and music notes (the battle fx sheet's
   * note frame) rise from the strings and drift out over the sea toward the tale's harbour. ~2.4 s.
   */
  private singTale(st: StatueSpot) {
    st.asleep = false;
    this.cutscene = true;
    this.player.frozen = true;
    this.registry.set('awakened', [...((this.registry.get('awakened') as string[] | undefined) ?? []), st.it.id]);
    const s = st.sprite;
    const lyre = { x: st.x + 7, y: st.y - s.height + 16 };   // the lyre on the statue's left arm
    s.setFrame(1);
    this.cameras.main.flash(260, 255, 226, 140);
    const glow = this.add.circle(lyre.x, lyre.y, 10, 0xffe08a, 0.35).setDepth(s.depth + 1);
    this.tweens.add({ targets: glow, scale: 1.8, alpha: 0, duration: 900, repeat: 1, onComplete: () => glow.destroy() });
    for (let i = 0; i < 9; i++) {
      this.time.delayedCall(i * 190, () => {
        const n = this.add.image(lyre.x, lyre.y, 'gk_fx', FX_FRAME.note).setScale(0.35).setDepth(10000).setAlpha(0);
        const tx = lyre.x + Phaser.Math.Between(30, 90), ty = lyre.y - Phaser.Math.Between(20, 60);
        this.tweens.add({ targets: n, alpha: { from: 1, to: 0 }, x: tx, duration: 1300, ease: 'Sine.out', onComplete: () => n.destroy() });
        this.tweens.add({ targets: n, y: ty, duration: 1300, ease: 'Sine.inOut' });
        this.tweens.add({ targets: n, angle: { from: -15, to: 15 }, duration: 320, yoyo: true, repeat: 2 });
      });
    }
    this.time.delayedCall(2400, () => {
      this.cutscene = false;
      this.dialog = { entry: dialogFor(`${st.it.id}_awaken`), line: 0, target: st.it };
      this.renderDialog();
    });
  }

  /**
   * A Laestrygonian statue wakes: it trembles, the ground rumbles, and it hurls the boulder it holds over its
   * head far out to sea (a long arc, a shadow racing ahead, a towering splash); its arms stay flung out (frame 1). ~2.6 s.
   */
  private hurlBoulder(st: StatueSpot) {
    st.asleep = false;
    this.cutscene = true;
    this.player.frozen = true;
    this.registry.set('awakened', [...((this.registry.get('awakened') as string[] | undefined) ?? []), st.it.id]);
    const s = st.sprite;
    const at = (ms: number, fn: () => void) => this.time.delayedCall(ms, fn);
    this.tweens.add({ targets: s, x: st.x + 1, duration: 45, yoyo: true, repeat: 9, onComplete: () => s.setX(st.x) });
    this.cameras.main.shake(700, 0.003);
    at(650, () => {
      s.setFrame(1);
      const sx = st.x, sy = st.y - s.height + 4;                // the boulder was held at the top of the sprite
      const tx = st.x + 150, ty = Math.min(this.physics.world.bounds.height - 12, st.y - 40);   // far out over the bay
      const rock = this.add.image(sx, sy, 'rock').setScale(1.2).setDepth(10000);
      const shadow = this.add.ellipse(sx, st.y - 2, 12, 4, 0x0a1830, 0.4).setDepth(-400);
      this.tweens.addCounter({ from: 0, to: 1, duration: 1100,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          rock.setPosition(sx + (tx - sx) * t, sy + (ty - sy) * t - Math.sin(Math.PI * t) * 90).setAngle(t * 540).setScale(1.2 + Math.sin(Math.PI * t) * 0.8);
          shadow.setPosition(sx + (tx - sx) * t, st.y - 2 + (ty - st.y + 2) * t);
        },
        onComplete: () => {
          rock.destroy(); shadow.destroy();
          const ring = this.add.ellipse(tx, ty, 10, 4).setStrokeStyle(1, 0xffffff, 0.9).setDepth(-300);
          this.tweens.add({ targets: ring, scaleX: 4, scaleY: 4, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
          for (let i = 0; i < 20; i++) {
            const d = this.add.rectangle(tx + Phaser.Math.Between(-4, 4), ty, 2, 2, i % 3 ? 0xffffff : 0x9fd8ff).setDepth(ty + 1);
            const a = Phaser.Math.FloatBetween(Math.PI * 1.15, Math.PI * 1.85), v = Phaser.Math.Between(10, 30);
            this.tweens.add({ targets: d, x: tx + Math.cos(a) * v, y: ty + Math.sin(a) * v, alpha: 0, duration: Phaser.Math.Between(400, 800), ease: 'Quad.out', onComplete: () => d.destroy() });
          }
          this.cameras.main.shake(250, 0.006);
        } });
    });
    at(2600, () => {
      this.cutscene = false;
      this.dialog = { entry: dialogFor(`${st.it.id}_awaken`), line: 0, target: st.it };
      this.renderDialog();
    });
  }

  /** Tiny textures for effects, drawn once (no tinting, so WebGL and Canvas look the same). */
  private ensureFxTextures() {
    const make = (k: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
      if (this.textures.exists(k)) return;
      const t = this.textures.createCanvas(k, w, h)!;
      draw(t.getContext()); t.refresh();
    };
    const coin = (body: string, hi: string, lo: string) => (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = body; ctx.fillRect(0, 1, 3, 1); ctx.fillRect(1, 0, 1, 3);
      ctx.fillStyle = hi; ctx.fillRect(1, 0, 1, 1); ctx.fillStyle = lo; ctx.fillRect(1, 2, 1, 1);
    };
    make('fx_coin', 3, 3, coin('#f0c040', '#fff2a0', '#c08a20'));
    make('fx_coin_dark', 3, 3, coin('#2a0f3d', '#5a2a7a', '#000000'));
    make('aura_wisp_black', 2, 2, (ctx) => { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 2, 2); });
    make('aura_wisp_violet', 2, 2, (ctx) => { ctx.fillStyle = '#2a0f3d'; ctx.fillRect(0, 0, 2, 2); });
    make('aura_wisp_wine', 2, 2, (ctx) => { ctx.fillStyle = '#9a1236'; ctx.fillRect(0, 0, 2, 2); });
    make('aura_wisp_purple', 2, 2, (ctx) => { ctx.fillStyle = '#6a2a9a'; ctx.fillRect(0, 0, 2, 2); });
    make('fx_wine', 2, 2, (ctx) => { ctx.fillStyle = '#7a0c2c'; ctx.fillRect(0, 0, 2, 2); });
    make('fx_wine_hi', 2, 2, (ctx) => { ctx.fillStyle = '#c0304e'; ctx.fillRect(0, 0, 2, 2); });
  }

  /**
   * Black aura: a soft black glow hugging the statue's silhouette, a dark pool at its feet and black-violet wisps
   * rising around it. Textures are made here (no tinting), so it looks the same in WebGL and Canvas.
   */
  private addAura(statue: Phaser.GameObjects.Sprite, fadeIn = false, style: AuraStyle = 'black') {
    const pal = AURAS[style];
    const key = statue.texture.key;
    const glowKey = `${key}__aura_${style}`;
    const pad = 10;
    const f = this.textures.getFrame(key, 0);
    if (!this.textures.exists(glowKey)) {
      const c = this.textures.createCanvas(glowKey, f.width + pad * 2, f.height + pad * 2)!;
      const ctx = c.getContext();
      const src = f.source.image as CanvasImageSource;
      ctx.shadowColor = pal.shadow; ctx.shadowBlur = 6;
      for (let i = 0; i < 4; i++) ctx.drawImage(src, f.cutX, f.cutY, f.width, f.height, pad, pad, f.width, f.height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = pal.glow;
      ctx.fillRect(0, 0, c.width, c.height);
      c.refresh();
    }
    this.ensureFxTextures();
    const { depth } = statue;
    const x = Math.round(statue.x), y = statue.y;
    const pool = this.add.ellipse(x, y - 1, Math.max(26, f.width + 4), 7, pal.pool, fadeIn ? 0 : 0.45).setDepth(-499);
    const glow = this.add.image(x, y + pad, glowKey).setOrigin(0.5, 1).setDepth(depth - 0.01).setAlpha(fadeIn ? 0 : 0.75);
    const breathe = () => {
      this.tweens.add({ targets: glow, alpha: 0.95, scaleX: 1.12, scaleY: 1.06, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: pool, scaleX: 1.2, alpha: 0.6, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    };
    if (fadeIn) {
      // swell in: the glow overshoots, then settles into its breathing
      this.tweens.add({ targets: glow, alpha: 0.75, scaleX: { from: 1.6, to: 1 }, scaleY: { from: 1.3, to: 1 }, duration: 600, ease: 'Back.out' });
      this.tweens.add({ targets: pool, alpha: 0.45, scaleX: { from: 2, to: 1 }, duration: 600, ease: 'Back.out', onComplete: breathe });
    } else {
      breathe();
    }
    // wisps rise from around the whole statue (sized from its frame, so a wide head gets a wide plume)
    const hw = Math.max(9, f.width / 2 - 3), top = Math.max(28, f.height - 6);
    for (const [k, freq] of [[pal.wisps[0], 90], [pal.wisps[1], 160]] as const) {
      this.add.particles(x, y, k, {
        x: { min: -hw, max: hw }, y: { min: -top, max: -2 },
        speedX: { min: -4, max: 4 }, speedY: { min: -16, max: -6 },
        lifespan: { min: 900, max: 1700 }, alpha: { start: 0.9, end: 0 }, scale: { start: 1.4, end: 0.4 },
        frequency: freq, quantity: 1,
      }).setDepth(depth + 0.02);
    }
  }

  /** Step off onto the nearest bit of land next to the hull. */
  private goAshore() {
    const ship = this.ship;
    if (!ship) return;
    const spot = this.landingSpot();
    if (!spot) return toast(dialogFor('ship_noland').lines[0], 2200);
    this.sailing = false;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    this.player.setPosition(spot.x, spot.y);
    body.reset(spot.x, spot.y);
    this.player.setPosition(spot.x, spot.y);
    this.player.setVisible(true);
    this.player.frozen = false;
    // face away from the ship, onto the land
    const dx = spot.x - ship.pos.x, dy = spot.y - ship.pos.y;
    this.player.face(Math.abs(dy) * 2 > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : dx < 0 ? 'left' : 'right');
    if (!this.overview) this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.saveShip();
  }

  /** Nearest point within reach of the hull where the player's feet fit on open ground. */
  private landingSpot(): Phaser.Math.Vector2 | null {
    const h = this.ship!.hull;
    const reach = 40; // the mooring sits ~26px off the sand; boarding works from as far away
    const b = this.physics.world.bounds;
    const near = this.layer('Collision').filter((r) => r.x < h.right + reach + 8 && r.x + r.width > h.x - reach - 8 && r.y < h.bottom + reach + 8 && r.y + r.height > h.y - reach - 8);
    let best: Phaser.Math.Vector2 | null = null;
    let bestD = Infinity;
    for (let y = Math.floor(h.y - reach); y <= h.bottom + reach; y += 2) {
      for (let x = Math.floor(h.x - reach); x <= h.right + reach; x += 2) {
        if (x < 8 || x > b.width - 8 || y < 10 || y > b.height - 2) continue;
        const d = Phaser.Math.Distance.Between(x, y, Phaser.Math.Clamp(x, h.x, h.right), Phaser.Math.Clamp(y, h.y, h.bottom));
        if (d > reach || d >= bestD) continue;
        // the player's feet box (10x6, ending 1px above the feet) plus a 1px margin
        const fx0 = x - 6, fx1 = x + 6, fy0 = y - 8, fy1 = y;
        if (near.some((r) => fx0 < r.x + r.width && r.x < fx1 && fy0 < r.y + r.height && r.y < fy1)) continue;
        bestD = d;
        best = new Phaser.Math.Vector2(x, y);
      }
    }
    return best;
  }

  /** Sailing off the south edge of the map is the voyage to the dragon's lair, once Achilles is beaten. */
  private openSea() {
    if (this.harbor) return this.harbor.escape();
    const it = this.shipIt;
    if (!it || this.leaving) return;
    const unlocks = (this.registry.get('unlocks') as string[] | undefined) ?? [];
    const unlocked = !it.requires || unlocks.includes(it.requires);
    if (unlocked && it.target && this.scene.get(it.target)) {
      toast(dialogFor(`${it.dialog}_sail`).lines[0], 2400);
      return this.sail(it);
    }
    if (this.time.now < this.edgeToastAt) return;
    this.edgeToastAt = this.time.now + 3500;
    toast(dialogFor(unlocked ? 'ship_voyage_soon' : 'ship_voyage_locked').lines[0], 3200);
  }

  /** Leave the Laestrygonian harbour: back beside the giant's fist. Wrecked: you wash up on the islet, healed. */
  private leaveHarbor(escaped: boolean, rewards: string[] = []) {
    if (this.leaving) return;
    // out of the harbour mouth: the VICTORY banner first, then home
    if (escaped && !this.cutscene) return this.celebrate('Escape from Telepylus', rewards, () => this.leaveHarbor(true));
    this.leaving = true;
    this.player.frozen = true;
    if (!escaped) {
      const st = this.stats;
      st.hp = st.maxHp;
      this.registry.set('stats', st);
      this.registry.set('statueBy', 'foot');
    }
    const back = prop(this.raw, 'returnTo', '');
    this.cameras.main.fadeOut(escaped ? 600 : 900, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('village', { from: back } as MapSceneData);
      if (!escaped) toast('You wash up on the islet, battered but alive. Fully healed.', 3000);
    });
  }

  /** Sail to the ship's target scene; exits there bring the player back to this shore. */
  private sail(ship: Interactable) {
    this.leaving = true;
    this.player.frozen = true;
    this.registry.set('lastHouse', ship.id); // exits in the target map return "through" the ship
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(ship.target!, { from: ship.id } as MapSceneData);
    });
  }

  private advanceDialog() {
    if (!this.dialog) return;
    this.dialog.line++;
    if (this.dialog.line >= this.dialog.entry.lines.length) {
      if (this.dialog.target?.npc) this.dialog.target.npc.talking = false;
      const onClose = this.dialog.onClose;
      this.dialog = null;
      this.player.frozen = false;
      this.renderDialog();
      onClose?.();
      return;
    }
    this.renderDialog();
  }

  private renderDialog() {
    if (!this.dialog) return showDialog(null);
    showDialog(this.dialog.entry.name, this.dialog.entry.lines[this.dialog.line]);
  }

  // ---------------------------------------------------------------- doors / exits
  private checkPortals() {
    if (this.leaving || this.dialog) return;
    const f = this.player.feet;
    for (const p of this.portals) {
      const inside = Phaser.Geom.Rectangle.Contains(p.rect, f.x, f.y);
      if (!p.target) {
        // locked: say so once per approach
        if (inside && !p.busy && this.player.facing === 'up') { p.busy = true; toast('The door is locked.'); }
        else if (!inside) p.busy = false;
        continue;
      }
      if (p.busy || this.player.facing !== 'up' || !inside) continue;
      p.busy = true;
      this.player.frozen = true;
      if (p.kind === 'door') {
        const spr = this.add.sprite(p.tile.x + 8, p.tile.y + 8, 'door_ss', 0).setDepth(p.rect.y - 1);
        spr.play('door-open');
        spr.once('animationcomplete', () => this.travel(p));
      } else {
        this.travel(p);
      }
      return;
    }
  }

  /** Leave through a portal. A door leads to its `target` map; exits return to the house the player came from. */
  private travel(p: Portal) {
    this.leaving = true;
    let from = p.id;
    if (p.kind === 'door') this.registry.set('lastHouse', p.id);
    else from = (this.registry.get('lastHouse') as string | undefined) ?? '';
    if (!p.target || !this.scene.get(p.target)) {
      toast('The door is locked.');
      this.leaving = false; p.busy = false; this.player.frozen = false;
      return;
    }
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(p.target, { from } as MapSceneData);
    });
  }

  // ---------------------------------------------------------------- loop
  update(time: number, delta: number) {
    const k = this.keys;
    const input = {
      up: k.W.isDown || k.UP.isDown || touch.up,
      down: k.S.isDown || k.DOWN.isDown || touch.down,
      left: k.A.isDown || k.LEFT.isDown || touch.left,
      right: k.D.isDown || k.RIGHT.isDown || touch.right,
    };
    const idle = { up: false, down: false, left: false, right: false };
    const dt = Math.min(delta, 50) / 1000;
    if (this.sailing && this.ship && !this.dialog && !this.leaving && !this.cutscene) {
      if (this.ship.step(dt, input)) this.openSea();
      this.player.update(idle);
    } else {
      this.ship?.step(dt, idle); // a moored or abandoned ship drifts to a stop
      this.player.update(input);
    }
    this.ship?.update(time);
    this.archery?.update(time, delta);
    this.harbor?.update(time, delta);
    this.weather?.update(time);
    for (const n of this.npcs) n.update(time, delta);
    for (const e of this.enemies) e.update(time, this.player);
    if (!this.sailing) this.checkPortals();
    if (this.debugOn) this.drawDebug();
  }

  private drawDebug() {
    const g = this.debugGfx.clear();
    const colors: Record<string, number> = { water: 0x2266ff, pit: 0x2266ff, tree: 0xff3333, house: 0xff9900, wall: 0xff00cc, solid: 0xffee00 };
    for (const r of this.layer('Collision')) g.fillStyle(colors[r.type] ?? 0xffffff, 0.35).fillRect(r.x, r.y, r.width, r.height);
    g.lineStyle(1, 0x00ff00, 1);
    for (const p of this.portals) g.strokeRectShape(p.rect);
    for (const it of this.interactables) if (!it.npc) g.strokeRectShape(it.rect);
    g.lineStyle(1, 0x00ffff, 0.8);
    for (const n of this.npcs) g.strokeCircle(n.home.x, n.home.y, n.radius);
    for (const b of [this.player, ...this.npcs]) {
      const body = b.body as Phaser.Physics.Arcade.Body;
      g.lineStyle(1, 0xffffff, 1).strokeRect(body.x, body.y, body.width, body.height);
    }
    const p = this.player.probe;
    g.fillStyle(0xffffff, 1).fillRect(p.x - 1, p.y - 1, 2, 2);
  }
}
