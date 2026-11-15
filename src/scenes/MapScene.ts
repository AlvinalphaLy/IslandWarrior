import { publishVoyageEvent } from '../story';
import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { PLAYER_SKINS } from '../entities/Character';
import { dialogFor, DialogEntry } from '../data/dialog';
import { touch, setActionHandler, showDialog, toast, updateHud } from '../ui';
import { Enemy } from '../entities/Enemy';
import { Ship } from '../entities/Ship';
import { CHEST_REWARDS, ENEMIES, PlayerStats, START_STATS } from '../data/enemies';
import type { BattleData, BattleResult } from './BattleScene';

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x1fffffff;

interface TiledProp {
  name: string;
  value: unknown;
}
interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  gid?: number;
  point?: boolean;
  properties?: TiledProp[];
}
interface TiledTileset {
  firstgid: number;
  name: string;
  tilecount: number;
}
interface TiledLayer {
  name: string;
  type: string;
  objects?: TiledObject[];
}
interface TiledMap {
  tilesets: TiledTileset[];
  layers: TiledLayer[];
  tilewidth: number;
  properties?: TiledProp[];
}

const prop = <T>(o: { properties?: TiledProp[] }, key: string, def: T): T =>
  (o.properties?.find((p) => p.name === key)?.value as T) ?? def;

interface Interactable {
  kind: 'npc' | 'sign' | 'chest' | 'ship' | 'statue';
  rect: Phaser.Geom.Rectangle;
  npc?: Npc;
  dialog: string;
  id: string;
  /** ship / statue: scene it leads to; ship only: the unlock it needs (registry 'unlocks') */
  target?: string;
  requires?: string;
}
/** A door (village houses) or exit (cave ladder): walking up into it moves to `target`. */
interface Portal {
  id: string;
  kind: 'door' | 'exit';
  target: string;
  rect: Phaser.Geom.Rectangle;
  tile: Phaser.Math.Vector2;
  busy: boolean;
}

export interface MapSceneData {
  /** id of the portal the player arrived through on the previous map (e.g. house_3) */
  from?: string;
}

/**
 * Generic Tiled-driven map scene. Layer conventions (see tools/build_map.py, tools/build_cave.py):
 * Ground0..2 tile layers, Objects (tile objects with sortY/z), Collision rects, Spawns (player/npc/sign/chest/door/exit).
 */
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
  private dialog: {
    entry: DialogEntry;
    line: number;
    target?: Interactable;
    onClose?: () => void;
  } | null = null;
  private arrival: MapSceneData = {};
  private enemies: Enemy[] = [];
  /** ship name -> where the player lands when sailing back to this map */
  private shipLandings: Record<string, Phaser.Math.Vector2> = {};
  private vignette: Phaser.GameObjects.Image | null = null;
  /** the sailable ship (village only), its interactable, and the talk area relative to its waterline centre */
  private ship: Ship | null = null;
  private shipIt: Interactable | null = null;
  private shipTalk = new Phaser.Geom.Rectangle();
  private sailing = false;
  private edgeToastAt = 0;
  /** statues that lead somewhere (Circe's): where they stand and where you reappear on foot */
  private statues: { it: Interactable; x: number; y: number; arrive: Phaser.Math.Vector2 }[] = [];
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
    this.boardOnStart = false;
    this.vignette = null;
    this.inBattle = false;
    this.safeUntil = 0;
  }

  create() {
    this.raw = this.cache.tilemap.get(this.scene.key).data as TiledMap;
    const map = this.make.tilemap({ key: this.scene.key });
    const tilesets = this.raw.tilesets.map((t) => map.addTilesetImage(t.name, t.name)!);
    // Ground0..2 come from the tile reconstruction; Ground3 (village only) holds the patch that makes it pixel-exact
    this.raw.layers
      .filter((l) => l.type === 'tilelayer' && l.name.startsWith('Ground'))
      .forEach((l, i) => map.createLayer(l.name, tilesets, 0, 0)?.setDepth(-1000 + i));
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.setupTileAnimations(map);
    this.placeObjects();
    this.buildCollision();
    this.spawnActors();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    cam.fadeIn(300, 0, 0, 0);
    if (this.boardOnStart) this.board(true);
    if (prop(this.raw, 'dark', false)) {
      this.vignette = this.add
        .image(0, 0, 'vignette')
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(9000)
        .setDisplaySize(cam.width, cam.height);
    }

    this.debugGfx = this.add.graphics().setDepth(10000).setVisible(false);
    this.setupInput();
    // Story beats are data/events for the teammate's scene UI, never a replacement homepage.
    if (this.scene.key === 'circe') {
      publishVoyageEvent(this, { type: 'enter_grotto' });
      // A chest recovered before boarding must not soft-lock a later voyage.
      if (
        ((this.registry.get('openedChests') as string[] | undefined) ?? []).includes('chest_circe')
      ) {
        publishVoyageEvent(this, { type: 'recover_moly' });
      }
    }
    showDialog(null);
    updateHud(this.stats);
    this.events.on('battle-end', this.onBattleEnd, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.events.off('battle-end', this.onBattleEnd, this),
    );
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
      delay: 140,
      loop: true,
      callback: () => {
        frame++;
        for (const a of this.animatedTiles)
          for (const t of a.tiles) t.index = a.first + (frame % a.count);
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
      const hx = ts / 2,
        hy = -ts / 2;
      const img = this.add.sprite(
        o.x + hx * Math.cos(a) - hy * Math.sin(a),
        o.y + hx * Math.sin(a) + hy * Math.cos(a),
        `${key}_ss`,
        frame,
      );
      img.setAngle(o.rotation || 0);
      img.setFlip(!!(o.gid & FLIP_H), !!(o.gid & FLIP_V));
      if (o.gid & FLIP_D) img.setAngle(img.angle + 90).setFlipX(!img.flipX);
      const sortY = prop(o, 'sortY', -1),
        z = prop(o, 'z', 0);
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
        const npc = new Npc(
          this,
          s.x,
          s.y,
          prop(s, 'sprite', 'amelia'),
          s.name,
          prop(s, 'dialog', ''),
          prop(s, 'wander', 0),
        );
        this.npcs.push(npc);
        this.interactables.push({
          kind: 'npc',
          npc,
          rect: new Phaser.Geom.Rectangle(),
          dialog: npc.dialogKey,
          id: s.name,
        });
      } else if (s.type === 'enemy') {
        const id = prop(s, 'enemy', '');
        const defeated = (this.registry.get('defeated') as string[] | undefined) ?? [];
        if (ENEMIES[id] && !defeated.includes(`${this.scene.key}:${s.name}`))
          this.enemies.push(new Enemy(this, s.x, s.y, id, s.name));
      } else if (s.type === 'ship') {
        // the black ship: (x, y) is its mooring (waterline centre). Board it from the shore, sail it, land anywhere.
        // Where it was left is remembered; coming home from a voyage puts it back at the mooring.
        const saved = (
          this.registry.get('ships') as
            Record<string, { x: number; y: number; left: boolean }> | undefined
        )?.[`${this.scene.key}:${s.name}`];
        const fromVoyage = this.arrival.from === s.name;
        const water = this.layer('Collision').filter((r) => r.type === 'water');
        const b = this.physics.world.bounds;
        const keep = saved && !fromVoyage;
        this.ship = new Ship(
          this,
          keep ? saved.x : s.x,
          keep ? saved.y : s.y,
          water,
          b.width,
          b.height,
        );
        if (keep) this.ship.facingLeft = saved.left;
        // talkRect is the strip of shore you board from, kept relative to the mooring so it moves with the ship
        const r = prop(s, 'talkRect', '').split(',').map(Number);
        if (r.length === 4) this.shipTalk.setTo(r[0] - s.x, r[1] - s.y, r[2], r[3]);
        this.shipIt = {
          kind: 'ship',
          rect: new Phaser.Geom.Rectangle(),
          dialog: prop(s, 'dialog', ''),
          id: s.name,
          target: prop(s, 'target', ''),
          requires: prop(s, 'requires', ''),
        };
        this.interactables.push(this.shipIt);
        const a = prop(s, 'arrive', '').split(',').map(Number);
        if (a.length === 2) this.shipLandings[s.name] = new Phaser.Math.Vector2(a[0], a[1]);
      } else if (s.type === 'statue') {
        // a prop image standing on (x, y) = bottom centre of its base; the base blocks movement and can be read with E
        // optional: `aura` wraps it in black smoke; `target` makes E take you into that scene (from the shore or the ship)
        const fw = prop(s, 'footW', 28),
          fh = prop(s, 'footH', 8);
        const key = prop(s, 'sprite', 'horse_statue');
        const statue = this.add
          .sprite(s.x, s.y, key)
          .setOrigin(0.5, 1)
          .setDepth(s.y - fh / 2);
        if (this.anims.exists(`${key}-idle`)) statue.play(`${key}-idle`);
        if (prop(s, 'aura', false)) this.addAura(statue);
        this.walls.add(this.add.zone(s.x, s.y - 1 - fh / 2, fw, fh));
        const dialog = prop(s, 'dialog', '');
        const target = prop(s, 'target', '');
        const rect = new Phaser.Geom.Rectangle(s.x - fw / 2, s.y - fh - 1, fw, fh + 1);
        if (target) {
          const it: Interactable = { kind: 'statue', rect, dialog, id: s.name, target };
          this.interactables.push(it);
          const a = prop(s, 'arrive', '').split(',').map(Number);
          this.statues.push({
            it,
            x: s.x,
            y: s.y,
            arrive: new Phaser.Math.Vector2(
              a.length === 2 ? a[0] : s.x,
              a.length === 2 ? a[1] : s.y + 10,
            ),
          });
        } else if (dialog) {
          this.interactables.push({ kind: 'sign', rect, dialog, id: s.name });
        }
      } else if (s.type === 'sign' || s.type === 'chest') {
        this.interactables.push({ kind: s.type, rect, dialog: prop(s, 'dialog', ''), id: s.name });
      } else if (s.type === 'door' || s.type === 'exit') {
        const id = s.type === 'door' ? prop(s, 'house', s.name) : s.name;
        const p: Portal = {
          id,
          kind: s.type,
          target: prop(s, 'target', ''),
          busy: false,
          tile: new Phaser.Math.Vector2(s.x, s.y),
          rect:
            s.type === 'door'
              ? new Phaser.Geom.Rectangle(s.x + 3, s.y + s.height - 6, s.width - 6, 10)
              : rect,
        };
        this.portals.push(p);
      }
    }
    // arriving back through a door: stand just outside it, facing away from the house
    const via = this.portals.find((p) => p.kind === 'door' && p.id === this.arrival.from);
    // a skin chosen with C carries over between maps
    const sprite =
      (this.registry.get('playerSkin') as string | undefined) ?? start?.sprite ?? 'adam';
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
    if (
      this.inBattle ||
      this.leaving ||
      this.time.now < this.safeUntil ||
      this.time.now < enemy.stunnedUntil
    )
      return;
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
      // Only a confirmed victory produces a story battle event; losses and escape cannot advance it.
      if (this.scene.key === 'circe')
        publishVoyageEvent(this, { type: 'victory', enemy: enemy.spawnName });
      enemy.destroy();
      if (enemy.def.boss) toast(`${enemy.def.name} defeated! The treasure is yours.`, 2600);
    } else if (result === 'run' && enemy) {
      enemy.stunnedUntil = this.time.now + 2500;
      this.safeUntil = this.time.now + 1500;
    } else if (result === 'lose') {
      // wake up outside the house you entered
      this.leaving = true;
      toast('You wake up outside, fully healed.', 2600);
      this.scene.start('village', {
        from: (this.registry.get('lastHouse') as string | undefined) ?? '',
      } as MapSceneData);
    }
  }

  // ---------------------------------------------------------------- input / dialog
  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    kb.addCapture('F1');
    // The keyboard plugin keeps its listeners when the scene restarts (every trip through a door), so remove them on
    // shutdown. Otherwise each return to a map adds another set and one key press acts twice.
    const binds: [string, () => void][] = [
      ['keydown-E', () => this.interact()],
      ['keydown-SPACE', () => this.interact()],
      ['keydown-ENTER', () => this.interact()],
      ['keydown-M', () => this.toggleOverview()],
      ['keydown-C', () => this.cycleSkin()],
      [
        'keydown-F1',
        () => {
          this.debugOn = !this.debugOn;
          this.debugGfx.setVisible(this.debugOn);
        },
      ],
    ];
    // After a restart Phaser 3.80's keyboard plugin can also deliver the same DOM event twice, so act once per event
    // (otherwise E boards the ship and immediately steps off again, or skips a dialog line).
    let lastEvent: KeyboardEvent | null = null;
    const handlers = binds.map(
      ([ev, fn]) =>
        [
          ev,
          (e: KeyboardEvent) => {
            if (e === lastEvent) return;
            lastEvent = e;
            fn();
          },
        ] as const,
    );
    for (const [ev, fn] of handlers) kb.on(ev, fn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [ev, fn] of handlers) kb.off(ev, fn);
    });
    setActionHandler(() => this.interact());
  }

  /** Cycle the player through PLAYER_SKINS (Adam and the Greek gods). */
  private cycleSkin() {
    if (this.dialog || this.leaving) return;
    const i = PLAYER_SKINS.findIndex((s) => s.key === this.player.sheet);
    const next = PLAYER_SKINS[(i + 1) % PLAYER_SKINS.length];
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
    if (this.leaving) return;
    if (this.dialog) return this.advanceDialog();
    if (this.sailing) {
      const st = this.statueInReach();
      return st ? this.openStatue(st, true) : this.goAshore();
    }
    const p = this.player.probe;
    let best: Interactable | null = null;
    let bestD = 14;
    for (const it of this.interactables) {
      if (it.npc) it.rect.setTo(it.npc.x - 8, it.npc.y - 16, 16, 16);
      if (it === this.shipIt && this.ship) {
        // board from the shore strip, or from right next to the hull (after landing somewhere else)
        const h = this.ship.hull;
        const t = new Phaser.Geom.Rectangle(
          this.ship.pos.x + this.shipTalk.x,
          this.ship.pos.y + this.shipTalk.y,
          this.shipTalk.width,
          this.shipTalk.height,
        );
        Phaser.Geom.Rectangle.Union(h, t, it.rect);
      }
      // the ship's boarding area is big; anything else in reach (a statue, a villager) wins over boarding
      const d =
        Phaser.Math.Distance.Between(
          p.x,
          p.y,
          Phaser.Math.Clamp(p.x, it.rect.left, it.rect.right),
          Phaser.Math.Clamp(p.y, it.rect.top, it.rect.bottom),
        ) + (it.kind === 'ship' ? 8 : 0);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (!best) return;
    if (best.npc) {
      best.npc.talking = true;
      best.npc.faceTowards(this.player.x, this.player.y);
    }
    let entry = dialogFor(best.dialog);
    if (best.kind === 'chest') {
      const opened = (this.registry.get('openedChests') as string[] | undefined) ?? [];
      if (opened.includes(best.id)) entry = { name: entry.name, lines: ['It is empty.'] };
      else {
        this.registry.set('openedChests', [...opened, best.id]);
        // Moly is a story flag; the existing chest reward code remains the inventory authority.
        if (this.scene.key === 'circe' && best.dialog === 'chest_circe')
          publishVoyageEvent(this, { type: 'recover_moly' });
        const reward = CHEST_REWARDS[best.id];
        if (reward) {
          const st = this.stats;
          st.potions += reward.potions ?? 0;
          if (reward.heal) st.hp = st.maxHp;
          this.registry.set('stats', st);
          updateHud(st);
          entry = {
            name: entry.name,
            lines: [
              ...entry.lines,
              `+${reward.potions ?? 0} potions${reward.heal ? ', HP fully restored' : ''}.`,
            ],
          };
        }
      }
    }
    if (best.kind === 'ship') return this.board();
    if (best.kind === 'statue') return this.openStatue(best, false);
    this.dialog = { entry, line: 0, target: best };
    this.player.frozen = true;
    this.renderDialog();
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
    // Boarding is the story's start trigger; quiet reboarding also completes a rescued-crew return.
    publishVoyageEvent(this, { type: 'board' });
    if (!quiet) toast(dialogFor('ship_board').lines[0], 3200);
  }

  /** Remember where the ship is, so it's still there after visiting another map. */
  private saveShip() {
    if (!this.ship || !this.shipIt) return;
    const ships = (this.registry.get('ships') as Record<string, unknown> | undefined) ?? {};
    this.registry.set('ships', {
      ...ships,
      [`${this.scene.key}:${this.shipIt.id}`]: {
        x: this.ship.pos.x,
        y: this.ship.pos.y,
        left: this.ship.facingLeft,
      },
    });
  }

  // ---------------------------------------------------------------- statues with a dungeon (Circe's)
  /** A statue close enough to the ship's hull to step onto from the deck. */
  private statueInReach() {
    if (!this.ship) return null;
    const h = this.ship.hull;
    return (
      this.statues.find(
        (st) =>
          Phaser.Math.Distance.Between(
            st.x,
            st.y - 8,
            Phaser.Math.Clamp(st.x, h.x, h.right),
            Phaser.Math.Clamp(st.y - 8, h.y, h.bottom),
          ) <= 30,
      )?.it ?? null
    );
  }

  /** Read the statue's lines; closing them takes you into its dungeon. */
  private openStatue(it: Interactable, byShip: boolean) {
    this.dialog = {
      entry: dialogFor(it.dialog),
      line: 0,
      target: it,
      onClose: () => this.enterStatue(it, byShip),
    };
    this.player.frozen = true;
    this.renderDialog();
  }

  private enterStatue(it: Interactable, byShip: boolean) {
    if (!it.target || !this.scene.get(it.target))
      return toast('The black smoke thins. The way is sealed.', 2200);
    // Arriving by ship identifies this destination as the first island, without changing its UI.
    if (byShip && it.target === 'circe')
      publishVoyageEvent(this, { type: 'landfall', island: 'aeaea' });
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
   * Black aura: a soft black glow hugging the statue's silhouette, a dark pool at its feet and black-violet wisps
   * rising around it. Textures are made here (no tinting), so it looks the same in WebGL and Canvas.
   */
  private addAura(statue: Phaser.GameObjects.Sprite) {
    const key = statue.texture.key;
    const glowKey = `${key}__aura`;
    const pad = 10;
    const f = this.textures.getFrame(key, 0);
    if (!this.textures.exists(glowKey)) {
      const c = this.textures.createCanvas(glowKey, f.width + pad * 2, f.height + pad * 2)!;
      const ctx = c.getContext();
      const src = f.source.image as CanvasImageSource;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      for (let i = 0; i < 4; i++)
        ctx.drawImage(src, f.cutX, f.cutY, f.width, f.height, pad, pad, f.width, f.height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#07020c';
      ctx.fillRect(0, 0, c.width, c.height);
      c.refresh();
    }
    for (const [k, color] of [
      ['aura_wisp_black', '#000000'],
      ['aura_wisp_violet', '#2a0f3d'],
    ] as const) {
      if (this.textures.exists(k)) continue;
      const t = this.textures.createCanvas(k, 2, 2)!;
      t.getContext().fillStyle = color;
      t.getContext().fillRect(0, 0, 2, 2);
      t.refresh();
    }
    const { x, y, depth } = statue;
    const pool = this.add.ellipse(x, y - 1, 26, 7, 0x000000, 0.45).setDepth(-499);
    const glow = this.add
      .image(x, y + pad, glowKey)
      .setOrigin(0.5, 1)
      .setDepth(depth - 0.01)
      .setAlpha(0.75);
    this.tweens.add({
      targets: glow,
      alpha: 0.95,
      scaleX: 1.12,
      scaleY: 1.06,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.tweens.add({
      targets: pool,
      scaleX: 1.2,
      alpha: 0.6,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    for (const [k, freq] of [
      ['aura_wisp_black', 90],
      ['aura_wisp_violet', 160],
    ] as const) {
      this.add
        .particles(x, y, k, {
          x: { min: -9, max: 9 },
          y: { min: -28, max: -2 },
          speedX: { min: -4, max: 4 },
          speedY: { min: -16, max: -6 },
          lifespan: { min: 900, max: 1700 },
          alpha: { start: 0.9, end: 0 },
          scale: { start: 1.4, end: 0.4 },
          frequency: freq,
          quantity: 1,
        })
        .setDepth(depth + 0.02);
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
    const dx = spot.x - ship.pos.x,
      dy = spot.y - ship.pos.y;
    this.player.face(
      Math.abs(dy) * 2 > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : dx < 0 ? 'left' : 'right',
    );
    if (!this.overview) this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.saveShip();
    // Landing beside Circe's island is distinct from stepping off at the starting harbor.
    if (
      this.statues.some(
        (statue) =>
          statue.it.target === 'circe' &&
          Phaser.Math.Distance.Between(spot.x, spot.y, statue.x, statue.y) < 60,
      )
    ) {
      publishVoyageEvent(this, { type: 'landfall', island: 'aeaea' });
    }
  }

  /** Nearest point within reach of the hull where the player's feet fit on open ground. */
  private landingSpot(): Phaser.Math.Vector2 | null {
    const h = this.ship!.hull;
    const reach = 40; // the mooring sits ~26px off the sand; boarding works from as far away
    const b = this.physics.world.bounds;
    const near = this.layer('Collision').filter(
      (r) =>
        r.x < h.right + reach + 8 &&
        r.x + r.width > h.x - reach - 8 &&
        r.y < h.bottom + reach + 8 &&
        r.y + r.height > h.y - reach - 8,
    );
    let best: Phaser.Math.Vector2 | null = null;
    let bestD = Infinity;
    for (let y = Math.floor(h.y - reach); y <= h.bottom + reach; y += 2) {
      for (let x = Math.floor(h.x - reach); x <= h.right + reach; x += 2) {
        if (x < 8 || x > b.width - 8 || y < 10 || y > b.height - 2) continue;
        const d = Phaser.Math.Distance.Between(
          x,
          y,
          Phaser.Math.Clamp(x, h.x, h.right),
          Phaser.Math.Clamp(y, h.y, h.bottom),
        );
        if (d > reach || d >= bestD) continue;
        // the player's feet box (10x6, ending 1px above the feet) plus a 1px margin
        const fx0 = x - 6,
          fx1 = x + 6,
          fy0 = y - 8,
          fy1 = y;
        if (near.some((r) => fx0 < r.x + r.width && r.x < fx1 && fy0 < r.y + r.height && r.y < fy1))
          continue;
        bestD = d;
        best = new Phaser.Math.Vector2(x, y);
      }
    }
    return best;
  }

  /** Sailing off the south edge of the map is the voyage to the dragon's lair, once Achilles is beaten. */
  private openSea() {
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
        if (inside && !p.busy && this.player.facing === 'up') {
          p.busy = true;
          toast('The door is locked.');
        } else if (!inside) p.busy = false;
        continue;
      }
      if (p.busy || this.player.facing !== 'up' || !inside) continue;
      p.busy = true;
      this.player.frozen = true;
      if (p.kind === 'door') {
        const spr = this.add
          .sprite(p.tile.x + 8, p.tile.y + 8, 'door_ss', 0)
          .setDepth(p.rect.y - 1);
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
      this.leaving = false;
      p.busy = false;
      this.player.frozen = false;
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
    if (this.sailing && this.ship && !this.dialog && !this.leaving) {
      if (this.ship.step(dt, input)) this.openSea();
      this.player.update(idle);
    } else {
      this.ship?.step(dt, idle); // a moored or abandoned ship drifts to a stop
      this.player.update(input);
    }
    this.ship?.update(time);
    for (const n of this.npcs) n.update(time, delta);
    for (const e of this.enemies) e.update(time, this.player);
    if (!this.sailing) this.checkPortals();
    if (this.debugOn) this.drawDebug();
  }

  private drawDebug() {
    const g = this.debugGfx.clear();
    const colors: Record<string, number> = {
      water: 0x2266ff,
      pit: 0x2266ff,
      tree: 0xff3333,
      house: 0xff9900,
      wall: 0xff00cc,
      solid: 0xffee00,
    };
    for (const r of this.layer('Collision'))
      g.fillStyle(colors[r.type] ?? 0xffffff, 0.35).fillRect(r.x, r.y, r.width, r.height);
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
