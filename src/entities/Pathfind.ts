import Phaser from 'phaser';

/**
 * Walking routes for scripted moves (the homecoming walk to Mira): A* over a 4 px grid built from the map's solid
 * bodies (Collision rects, statue bases, posts...), sized for the player's feet (10 px wide, 6 px tall above the
 * feet point), then smoothed so the walk takes straight lines where nothing is in the way.
 */
const C = 4;
const FOOT_HALF_W = 5;
const FOOT_H = 6;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class WalkGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(width: number, height: number, solids: Box[]) {
    this.cols = Math.ceil(width / C);
    this.rows = Math.ceil(height / C);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (const r of solids) {
      // cells whose feet box (centred on the cell centre) would overlap this solid
      const c0 = Math.max(0, Math.floor((r.x - FOOT_HALF_W) / C)),
        c1 = Math.min(this.cols - 1, Math.floor((r.x + r.width + FOOT_HALF_W) / C));
      const r0 = Math.max(0, Math.floor(r.y / C)),
        r1 = Math.min(this.rows - 1, Math.floor((r.y + r.height + FOOT_H) / C));
      for (let cy = r0; cy <= r1; cy++)
        for (let cx = c0; cx <= c1; cx++) {
          const px = cx * C + C / 2,
            py = cy * C + C / 2;
          if (px + FOOT_HALF_W > r.x && px - FOOT_HALF_W < r.x + r.width && py > r.y && py - FOOT_H < r.y + r.height)
            this.blocked[cy * this.cols + cx] = 1;
        }
    }
    // keep off the map edges
    for (let cx = 0; cx < this.cols; cx++) this.blocked[cx] = this.blocked[(this.rows - 1) * this.cols + cx] = 1;
    for (let cy = 0; cy < this.rows; cy++) this.blocked[cy * this.cols] = this.blocked[cy * this.cols + this.cols - 1] = 1;
  }

  free(cx: number, cy: number) {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows && !this.blocked[cy * this.cols + cx];
  }

  /** the nearest free cell to a point (searching outward), or null */
  nearestFree(x: number, y: number, radius = 12): [number, number] | null {
    const cx = Math.floor(x / C),
      cy = Math.floor(y / C);
    for (let r = 0; r <= radius; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.free(cx + dx, cy + dy)) return [cx + dx, cy + dy];
    return null;
  }

  /** a walking route from one point to another, as smoothed waypoints (cell centres), or null if unreachable */
  path(from: { x: number; y: number }, to: { x: number; y: number }): Phaser.Math.Vector2[] | null {
    const s = this.nearestFree(from.x, from.y),
      g = this.nearestFree(to.x, to.y);
    if (!s || !g) return null;
    const N = this.cols * this.rows,
      idx = (x: number, y: number) => y * this.cols + x;
    const gScore = new Float32Array(N).fill(Infinity),
      came = new Int32Array(N).fill(-1),
      closed = new Uint8Array(N);
    const heap: [number, number][] = []; // [f, index], a binary min-heap
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      for (let k = heap.length - 1; k > 0; ) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ; ) {
          const l = 2 * k + 1,
            r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const h = (x: number, y: number) => {
      const dx = Math.abs(x - g[0]),
        dy = Math.abs(y - g[1]);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    const start = idx(s[0], s[1]),
      goal = idx(g[0], g[1]);
    gScore[start] = 0;
    push(h(s[0], s[1]), start);
    while (heap.length) {
      const [, cur] = pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % this.cols,
        cy = (cur / this.cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx,
          ny = cy + dy;
        if (!this.free(nx, ny)) continue;
        if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue; // no corner cutting
        const ni = idx(nx, ny),
          cost = gScore[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (cost < gScore[ni]) {
          gScore[ni] = cost;
          came[ni] = cur;
          push(cost + h(nx, ny), ni);
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells: [number, number][] = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push([i % this.cols, (i / this.cols) | 0]);
    cells.reverse();
    // smooth: from each kept cell, jump to the farthest cell still in a clear straight line
    const out: [number, number][] = [cells[0]];
    for (let i = 0; i < cells.length - 1; ) {
      let j = cells.length - 1;
      while (j > i + 1 && !this.clear(cells[i], cells[j])) j--;
      out.push(cells[j]);
      i = j;
    }
    return out.slice(1).map(([x, y]) => new Phaser.Math.Vector2(x * C + C / 2, y * C + C / 2));
  }

  /** every cell along the straight line between two cells is free (sampled at half-cell steps) */
  private clear(a: [number, number], b: [number, number]) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 0; k <= steps; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / steps,
        y = a[1] + ((b[1] - a[1]) * k) / steps;
      // the feet box spans a cell either side: check the neighbours the line brushes past
      if (!this.free(Math.round(x), Math.round(y)) || !this.free(Math.floor(x), Math.floor(y)) || !this.free(Math.ceil(x), Math.ceil(y)))
        return false;
    }
    return true;
  }
}
