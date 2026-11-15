import Phaser from 'phaser';
import { toast, updateHud } from '../ui';
import { PlayerStats, START_STATS } from '../data/enemies';
import type { Ship } from './Ship';

/**
 * The harbour of the Laestrygonians (map property `harbor`): you start aboard the black ship and must sail out of the
 * harbour mouth (the south edge of the map) while giants on the cliffs hurl boulders at you.
 *
 *   thrower  point  a giant standing on the cliff top (bottom centre). `delay`: ms before his first throw.
 *                   (Not `giant`: that spawn type is Archery's sleeping giant.)
 *
 * Each giant in range winds up, throws, and the boulder arcs down onto where the ship will be (it leads its target);
 * a growing shadow on the water shows where it will land, so a change of course dodges it. A hit costs HULL_DAMAGE HP.
 * At 0 HP the ship is wrecked and you wash up back home (healed); out through the mouth, you escape with a reward.
 */
export interface GiantSpawn { name: string; type: string; x: number; y: number; properties?: { name: string; value: unknown }[] }
interface Giant { spr: Phaser.GameObjects.Sprite; next: number; busy: boolean }

const RANGE = 230;            // giants only throw at a ship this close
const FLIGHT_MS = 1150;       // boulder flight time (the shadow's warning)
const HULL_DAMAGE = 6;
const HIT_RADIUS = 13;        // landing this close to the hull (beyond its rectangle) still hits
const SHIP_SPEED = 104;       // the ship's top speed in the harbour (58 elsewhere)
const SHIP_ACCEL = 5.5;       // and how sharply it turns / stops (2.5 elsewhere)
const prop = <T>(o: GiantSpawn, k: string, d: T): T => (o.properties?.find((p) => p.name === k)?.value as T) ?? d;

export interface HarborHost {
  scene: Phaser.Scene;
  ship: Ship;
  /** open a dialog by key */
  say: (key: string) => void;
  /** leave the harbour: escaped (true, with the reward lines for the VICTORY banner) or wrecked (false) */
  leave: (escaped: boolean, rewards?: string[]) => void;
}

export class Harbor {
  private giants: Giant[] = [];
  private last = new Phaser.Math.Vector2();
  private vel = new Phaser.Math.Vector2();
  private over = false;
  private readonly scene: Phaser.Scene;

  constructor(private host: HarborHost, spawns: GiantSpawn[]) {
    const scene = (this.scene = host.scene);
    for (const s of spawns) {
      if (s.type !== 'thrower') continue;
      const spr = scene.add.sprite(s.x, s.y, 'giant', 0).setOrigin(0.5, 1).setScale(2).setDepth(s.y);
      this.giants.push({ spr, next: scene.time.now + 2200 + prop(s, 'delay', 0), busy: false });
    }
    this.last.copy(host.ship.pos);
    // the crew rows for their lives: much faster than at home, and quick to turn, so a change of course dodges
    host.ship.maxSpeed = SHIP_SPEED;
    host.ship.accel = SHIP_ACCEL;
  }

  update(time: number, delta: number) {
    const ship = this.host.ship;
    // the ship's velocity, measured (smoothed) so the giants can lead their throws
    const dt = Math.max(delta, 1) / 1000;
    this.vel.lerp(new Phaser.Math.Vector2((ship.pos.x - this.last.x) / dt, (ship.pos.y - this.last.y) / dt), 0.15);
    this.last.copy(ship.pos);
    if (this.over) return;
    for (const g of this.giants) {
      if (g.busy || time < g.next) continue;
      if (Phaser.Math.Distance.Between(g.spr.x, g.spr.y, ship.pos.x, ship.pos.y) > RANGE) { g.next = time + 400; continue; }
      this.hurl(g);
    }
  }

  /** wind up, throw, and drop a boulder onto where the ship is heading */
  private hurl(g: Giant) {
    const s = this.scene;
    g.busy = true;
    s.tweens.add({ targets: g.spr, y: g.spr.y - 3, duration: 160, yoyo: true });
    s.time.delayedCall(340, () => {
      if (this.over) { g.busy = false; return; }
      g.spr.setFrame(1);
      const ship = this.host.ship;
      const lead = FLIGHT_MS / 1000;
      const tx = ship.pos.x + this.vel.x * lead + Phaser.Math.Between(-8, 8);
      const ty = ship.pos.y - 4 + this.vel.y * lead + Phaser.Math.Between(-5, 5);
      const sx = g.spr.x, sy = g.spr.y - 50;
      const shadow = s.add.ellipse(tx, ty, 26, 9, 0x0a1830, 0.15).setDepth(-400).setScale(0.3);
      s.tweens.add({ targets: shadow, scale: 1, alpha: 0.45, duration: FLIGHT_MS, ease: 'Quad.in' });
      const rock = s.add.image(sx, sy, 'rock').setScale(2).setDepth(10000);
      const arc = Math.max(70, Math.abs(ty - sy) * 0.6);
      s.tweens.addCounter({
        from: 0, to: 1, duration: FLIGHT_MS,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          rock.setPosition(sx + (tx - sx) * t, sy + (ty - sy) * t - Math.sin(Math.PI * t) * arc);
          rock.setScale(2 + Math.sin(Math.PI * t) * 0.8).setAngle(t * 360);
        },
        onComplete: () => { rock.destroy(); shadow.destroy(); this.land(tx, ty); },
      });
      s.time.delayedCall(700, () => { g.spr.setFrame(0); g.busy = false; g.next = s.time.now + Phaser.Math.Between(2200, 3400); });
    });
  }

  private land(x: number, y: number) {
    const s = this.scene;
    // splash: a ring and a burst of spray
    const ring = s.add.ellipse(x, y, 10, 4).setStrokeStyle(1, 0xffffff, 0.9).setDepth(-300);
    s.tweens.add({ targets: ring, scaleX: 3.2, scaleY: 3.2, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    for (let i = 0; i < 14; i++) {
      const d = s.add.rectangle(x + Phaser.Math.Between(-4, 4), y, 2, 2, i % 3 ? 0xffffff : 0x9fd8ff).setDepth(y + 1);
      const a = Phaser.Math.FloatBetween(Math.PI * 1.1, Math.PI * 1.9), v = Phaser.Math.Between(8, 22);
      s.tweens.add({ targets: d, x: x + Math.cos(a) * v, y: y + Math.sin(a) * v, alpha: 0, duration: Phaser.Math.Between(350, 650), ease: 'Quad.out', onComplete: () => d.destroy() });
    }
    if (this.over) return;
    const hull = this.host.ship.hull;
    const near = Phaser.Math.Distance.Between(x, y, Phaser.Math.Clamp(x, hull.left, hull.right), Phaser.Math.Clamp(y, hull.top, hull.bottom));
    if (near <= HIT_RADIUS) this.hit();
    else s.cameras.main.shake(120, 0.002);
  }

  private hit() {
    const s = this.scene;
    const st: PlayerStats = { ...START_STATS, ...(s.registry.get('stats') as PlayerStats | undefined) };
    st.hp = Math.max(0, st.hp - HULL_DAMAGE);
    s.registry.set('stats', st);
    updateHud(st);
    s.cameras.main.shake(260, 0.008);
    s.cameras.main.flash(120, 255, 120, 80);
    const spr = this.host.ship.sprite;
    s.tweens.add({ targets: spr, alpha: 0.35, duration: 70, yoyo: true, repeat: 3, onComplete: () => spr.setAlpha(1) });
    if (st.hp <= 0) {
      this.over = true;
      toast('The ship breaks apart under the boulders...', 2600);
      s.time.delayedCall(900, () => this.host.leave(false));
    } else {
      toast(`A boulder smashes into the hull! -${HULL_DAMAGE} HP`, 1500);
    }
  }

  /** The ship reached the harbour mouth (the south edge). */
  escape() {
    if (this.over) return;
    this.over = true;
    const s = this.scene;
    const unlocks = (s.registry.get('unlocks') as string[] | undefined) ?? [];
    const st: PlayerStats = { ...START_STATS, ...(s.registry.get('stats') as PlayerStats | undefined) };
    const rewards = ['Out of the harbour mouth! The giants roar from the cliffs.'];
    if (!unlocks.includes('laestrygonians')) {
      s.registry.set('unlocks', [...unlocks, 'laestrygonians']);
      st.gold = (st.gold ?? 0) + 60;
      st.potions += 1;
      s.registry.set('stats', st);
      updateHud(st);
      rewards.push('+60 gold, +1 ambrosia');
    }
    this.host.leave(true, rewards);
  }
}
