import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { PLAYER_SKINS } from '../entities/Character';
import { dialogFor, DialogEntry } from '../data/dialog';
import { touch, setActionHandler, showDialog, toast, updateHud } from '../ui';
import { Enemy } from '../entities/Enemy';
import { CHEST_REWARDS, ENEMIES, PlayerStats, START_STATS } from '../data/enemies';
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

interface Interactable { kind: 'npc' | 'sign' | 'chest'; rect: Phaser.Geom.Rectangle; npc?: Npc; dialog: string; id: string }
/** A door (village houses) or exit (cave ladder): walking up into it moves to `target`. */
interface Portal { id: string; kind: 'door' | 'exit'; target: string; rect: Phaser.Geom.Rectangle; tile: Phaser.Math.Vector2; busy: boolean }

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
  private dialog: { entry: DialogEntry; line: number; target?: Interactable } | null = null;
  private arrival: MapSceneData = {};
  private enemies: Enemy[] = [];
  private vignette: Phaser.GameObjects.Image | null = null;
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
    this.vignette = null;
    this.inBattle = false;
    this.safeUntil = 0;
  }

  create() {
    this.raw = this.cache.tilemap.get(this.scene.key).data as TiledMap;
    const map = this.make.tilemap({ key: this.scene.key });
    const tilesets = this.raw.tilesets.map((t) => map.addTilesetImage(t.name, t.name)!);
    ['Ground0', 'Ground1', 'Ground2'].forEach((name, i) => map.createLayer(name, tilesets, 0, 0)?.setDepth(-1000 + i));
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
    if (prop(this.raw, 'dark', false)) {
      this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(9000).setDisplaySize(cam.width, cam.height);
    }

    this.debugGfx = this.add.graphics().setDepth(10000).setVisible(false);
    this.setupInput();
    showDialog(null);
    updateHud(this.stats);
    this.events.on('battle-end', this.onBattleEnd, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('battle-end', this.onBattleEnd, this));
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
    const sprite = (this.registry.get('playerSkin') as string | undefined) ?? start?.sprite ?? 'adam';
    if (via) start = { x: via.rect.centerX, y: via.rect.bottom + 6, sprite, face: 'down' };
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
    // plugin-level listeners are removed automatically when the scene shuts down
    for (const k of ['E', 'SPACE', 'ENTER']) kb.on(`keydown-${k}`, () => this.interact());
    kb.on('keydown-M', () => this.toggleOverview());
    kb.on('keydown-C', () => this.cycleSkin());
    kb.on('keydown-F1', () => { this.debugOn = !this.debugOn; this.debugGfx.setVisible(this.debugOn); });
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
      cam.startFollow(this.player, true, 0.15, 0.15);
    }
  }

  private interact() {
    if (this.leaving) return;
    if (this.dialog) return this.advanceDialog();
    const p = this.player.probe;
    let best: Interactable | null = null;
    let bestD = 14;
    for (const it of this.interactables) {
      if (it.npc) it.rect.setTo(it.npc.x - 8, it.npc.y - 16, 16, 16);
      const d = Phaser.Math.Distance.Between(p.x, p.y, Phaser.Math.Clamp(p.x, it.rect.left, it.rect.right), Phaser.Math.Clamp(p.y, it.rect.top, it.rect.bottom));
      if (d < bestD) { bestD = d; best = it; }
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
        const reward = CHEST_REWARDS[best.id];
        if (reward) {
          const st = this.stats;
          st.potions += reward.potions ?? 0;
          if (reward.heal) st.hp = st.maxHp;
          this.registry.set('stats', st);
          updateHud(st);
          entry = { name: entry.name, lines: [...entry.lines, `+${reward.potions ?? 0} potions${reward.heal ? ', HP fully restored' : ''}.`] };
        }
      }
    }
    this.dialog = { entry, line: 0, target: best };
    this.player.frozen = true;
    this.renderDialog();
  }

  private advanceDialog() {
    if (!this.dialog) return;
    this.dialog.line++;
    if (this.dialog.line >= this.dialog.entry.lines.length) {
      if (this.dialog.target?.npc) this.dialog.target.npc.talking = false;
      this.dialog = null;
      this.player.frozen = false;
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
    this.player.update({
      up: k.W.isDown || k.UP.isDown || touch.up,
      down: k.S.isDown || k.DOWN.isDown || touch.down,
      left: k.A.isDown || k.LEFT.isDown || touch.left,
      right: k.D.isDown || k.RIGHT.isDown || touch.right,
    });
    for (const n of this.npcs) n.update(time, delta);
    for (const e of this.enemies) e.update(time, this.player);
    this.checkPortals();
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
