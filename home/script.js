/* =====================================================================
   Odyssey — Trojan Horse home page
   No dependencies, no network. Works straight from file://.

   Flow:  idle ──hit──▶ hit1 ──hit──▶ hit2 ──hit──▶ breaking ──▶ open
          ──(~1s beat on the doorway, automatic)──▶ entering ──▶ done
   Entering = zooming through the doorway, then navigating to MAIN_PAGE.
   ===================================================================== */

// MAIN PAGE — the Island Warrior game (game/index.html).
const MAIN_PAGE = 'game/';

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = $('#scene');
  const horse = $('#horse');
  const reveal = $('#reveal');
  const title = $('#title');
  const hint = $('#hint');
  const flash = $('#flash');
  const cursor = $('#cursor');

  let state = 'idle';
  let hits = 0;

  /* ===================================================================
     1. PIXEL-ART HORSE
     Built from rectangles on a 96×80 grid; 1 grid unit = 1 "pixel".
     The horse faces right and stands on a wheeled siege platform.
     =================================================================== */
  const VB = '0 0 96 80';
  const PAL = {
    outline: '#1a0f08',
    woodD: '#5a3418', wood: '#8a5428', woodL: '#a96c34', woodH: '#d39750',
    nail: '#e8c27a', mane: '#3b2010', maneL: '#6e4020',
    iron: '#3b3b44', ironL: '#7a7a8a', rope: '#c9a35a', eye: '#f5e0b0',
  };

  // Draw order matters: tail → legs → body → neck/head → mane → platform.
  const PARTS = [
    { x: 12, y: 30, w: 6,  h: 6,  kind: 'mane' },      // tail
    { x: 10, y: 34, w: 5,  h: 10, kind: 'mane' },
    { x: 9,  y: 42, w: 4,  h: 6,  kind: 'mane' },
    { x: 21, y: 49, w: 6,  h: 17, kind: 'leg' },       // legs
    { x: 31, y: 49, w: 6,  h: 17, kind: 'leg' },
    { x: 61, y: 49, w: 6,  h: 17, kind: 'leg' },
    { x: 70, y: 49, w: 6,  h: 17, kind: 'leg' },
    { x: 17, y: 28, w: 60, h: 22, kind: 'body' },      // barrel
    { x: 62, y: 20, w: 16, h: 10, kind: 'body' },      // neck (stepped)
    { x: 66, y: 13, w: 15, h: 9,  kind: 'body' },
    { x: 70, y: 6,  w: 14, h: 9,  kind: 'body' },      // head
    { x: 80, y: 9,  w: 12, h: 8,  kind: 'body' },      // snout
    { x: 72, y: 2,  w: 4,  h: 5,  kind: 'body' },      // ear
    { x: 60, y: 18, w: 5,  h: 6,  kind: 'mane' },      // mane along the neck
    { x: 64, y: 11, w: 5,  h: 6,  kind: 'mane' },
    { x: 68, y: 4,  w: 4,  h: 6,  kind: 'mane' },
    { x: 10, y: 65, w: 76, h: 6,  kind: 'platform' },
  ];
  const WHEELS = { xs: [17, 32, 62, 78], y: 73, r: 5 };

  // Jagged break line the two halves split along.
  const SPLIT = [[48, -2], [50, 8], [46, 16], [51, 24], [45, 32], [50, 40],
                 [46, 48], [51, 56], [47, 64], [50, 72], [48, 84]];

  // Crack paths (all inside the silhouette clip), revealed in stages.
  // The trunk segments follow SPLIT; hit-1 cracks are generated at the
  // strike point by impactCracks().
  const CRACKS = {
    // Hit 2: the damage spreads across the barrel.
    spread: [
      'M50 40 L45 32 L51 24 L46 16',
      'M50 40 L46 48 L51 56',
      'M45 32 L39 30 L34 33 L28 31 L22 34',
      'M50 40 L56 37 L61 41 L68 38 L74 43',
      'M46 48 L40 45 L35 48 L29 46',
    ],
    // Hit 3: the rest races out along the split, right before it bursts.
    final: [
      'M46 16 L50 8 L48 -2',
      'M51 56 L47 64 L50 72 L48 82',
      'M56 37 L60 31 L65 27 L69 20 L73 14 L78 11',
      'M47 66 L40 68 L30 67 L20 69',
      'M50 69 L58 67 L68 69 L80 67',
    ],
  };

  // Deterministic PRNG so the wood grain is identical on every load.
  let seed = 1337;
  const srand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function buildHorseArt() {
    const out = [];
    const r = (x, y, w, h, c) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);

    // Filled pixel circle, row by row.
    const disc = (cx, cy, rad, c) => {
      for (let y = Math.floor(cy - rad); y < Math.ceil(cy + rad); y++) {
        const dy = y + 0.5 - cy;
        const half = Math.round(Math.sqrt(Math.max(0, rad * rad - dy * dy)));
        if (half > 0) r(cx - half, y, half * 2, 1, c);
      }
    };

    const fill = {
      // Horizontal planks with seams, staggered butt joints and nails.
      body(p) {
        for (let y = p.y, i = 0; y < p.y + p.h; y += 3, i++) {
          const h = Math.min(3, p.y + p.h - y);
          r(p.x, y, p.w, h, i % 2 ? PAL.wood : PAL.woodL);
          if (h === 3) r(p.x, y + 2, p.w, 1, PAL.woodD);
          for (let x = p.x + (i % 2 ? 4 : 9); x < p.x + p.w - 2; x += 10 + ((srand() * 5) | 0)) {
            r(x, y, 1, Math.min(2, h), PAL.woodD);
            if (srand() < 0.5) r(x + 1, y, 1, 1, PAL.nail);
          }
        }
        r(p.x, p.y, p.w, 1, PAL.woodH);
      },
      // Vertical boards, an iron band and a dark hoof.
      leg(p) {
        for (let x = p.x, i = 0; x < p.x + p.w; x += 2, i++) r(x, p.y, 2, p.h, i % 2 ? PAL.wood : PAL.woodL);
        r(p.x + 2, p.y, 1, p.h, PAL.woodD);
        r(p.x, p.y + p.h - 7, p.w, 2, PAL.iron);
        r(p.x, p.y + p.h - 7, p.w, 1, PAL.ironL);
        r(p.x, p.y + p.h - 3, p.w, 3, PAL.woodD);
      },
      // Rope-like strands.
      mane(p) {
        r(p.x, p.y, p.w, p.h, PAL.mane);
        for (let x = p.x + 1; x < p.x + p.w; x += 2) r(x, p.y + (x % 3), 1, p.h - (x % 3), PAL.maneL);
      },
      // Heavy siege platform with iron-banded ends.
      platform(p) {
        r(p.x, p.y, p.w, p.h, PAL.woodD);
        r(p.x, p.y, p.w, 1, PAL.woodL);
        r(p.x, p.y + 3, p.w, 1, PAL.outline);
        for (let x = p.x + 6; x < p.x + p.w - 2; x += 8) r(x, p.y + 1, 1, 2, PAL.outline);
        for (const bx of [p.x, p.x + p.w - 4]) {
          r(bx, p.y, 4, p.h, PAL.iron);
          r(bx + 1, p.y + 1, 1, 1, PAL.ironL);
          r(bx + 1, p.y + 4, 1, 1, PAL.ironL);
        }
      },
    };

    // Pass 1: a 1px outline around every part gives one clean silhouette.
    for (const p of PARTS) r(p.x - 1, p.y - 1, p.w + 2, p.h + 2, PAL.outline);
    // Pass 2: fills.
    for (const p of PARTS) fill[p.kind](p);

    // Face: eye, nostril, mouth, rope bridle.
    r(77, 9, 2, 2, PAL.outline); r(77, 9, 1, 1, PAL.eye);
    r(89, 11, 1, 1, PAL.outline);
    r(84, 15, 8, 1, PAL.woodD);
    r(80, 9, 1, 8, PAL.rope); r(80, 12, 12, 1, PAL.rope);

    // The hidden hatch in the belly — where the soldiers wait.
    const hx = 39, hy = 33, hw = 14, hh = 13;
    r(hx, hy, hw, 1, PAL.outline); r(hx, hy + hh - 1, hw, 1, PAL.outline);
    r(hx, hy, 1, hh, PAL.outline); r(hx + hw - 1, hy, 1, hh, PAL.outline);
    r(hx + 1, hy + 2, 4, 1, PAL.iron); r(hx + 1, hy + hh - 3, 4, 1, PAL.iron);
    r(hx + hw - 4, hy + 5, 2, 2, PAL.ironL);

    // Wheels in front of the platform.
    for (const cx of WHEELS.xs) {
      const cy = WHEELS.y, R = WHEELS.r;
      disc(cx, cy, R + 1, PAL.outline);
      disc(cx, cy, R, PAL.iron);
      disc(cx, cy, R - 1.5, PAL.woodD);
      r(cx - R + 1, cy - 1, (R - 1) * 2, 2, PAL.wood);
      r(cx - 1, cy - R + 1, 2, (R - 1) * 2, PAL.wood);
      r(cx - 1, cy - 1, 2, 2, PAL.ironL);
    }
    return out.join('');
  }

  function buildHorse() {
    const art = buildHorseArt();
    const pts = (arr) => arr.map((p) => p.join(',')).join(' ');
    const leftPoly = pts([[-20, -2], ...SPLIT, [-20, 84]]);
    const rightPoly = pts([[116, -2], ...SPLIT, [116, 84]]);

    // Silhouette = union of all parts; keeps cracks on the wood.
    const sil = PARTS.map((p) => `<rect x="${p.x - 1}" y="${p.y - 1}" width="${p.w + 2}" height="${p.h + 2}"/>`)
      .concat(WHEELS.xs.map((x) => `<rect x="${x - 6}" y="${WHEELS.y - 6}" width="12" height="12"/>`))
      .join('');
    const crackPath = (d, cls) =>
      `<path class="crack-dark ${cls}" d="${d}" pathLength="1"/><path class="crack-glow ${cls}" d="${d}" pathLength="1"/>`;
    const cracks = CRACKS.spread.map((d) => crackPath(d, 'spread')).join('') +
                   CRACKS.final.map((d) => crackPath(d, 'final')).join('');

    const svg = (cls, inner) =>
      `<svg class="${cls}" viewBox="${VB}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${inner}</svg>`;

    horse.innerHTML =
      svg('half half-left',
        `<defs><clipPath id="clip-left"><polygon points="${leftPoly}"/></clipPath></defs>` +
        `<g clip-path="url(#clip-left)">${art}</g>`) +
      svg('half half-right',
        `<defs><clipPath id="clip-right"><polygon points="${rightPoly}"/></clipPath></defs>` +
        `<g clip-path="url(#clip-right)">${art}</g>`) +
      svg('cracks',
        `<defs><clipPath id="clip-sil">${sil}</clipPath></defs>` +
        `<g clip-path="url(#clip-sil)">${cracks}<g class="impacts"></g></g>`);
  }

  // Is an art-space point (viewBox units) on the horse's silhouette?
  function onHorse(ax, ay) {
    const inRect = (x, y, w, h) => ax >= x && ax < x + w && ay >= y && ay < y + h;
    return PARTS.some((p) => inRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2)) ||
           WHEELS.xs.some((x) => inRect(x - 6, WHEELS.y - 6, 12, 12));
  }

  // A few short, jagged radial cracks around a strike point (art space).
  // They're appended into the silhouette-clipped group, so they stay on the wood.
  function impactCracks(ax, ay, count, reach) {
    const group = horse.querySelector('.impacts');
    const NS = group.namespaceURI;            // the SVG namespace
    const start = rand(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      let a = start + (i / count) * Math.PI * 2 + rand(-0.35, 0.35);
      let x = ax, y = ay, d = `M${ax.toFixed(1)} ${ay.toFixed(1)}`;
      const segs = 2 + ((Math.random() * 2) | 0);
      const len = rand(reach * 0.6, reach);
      for (let k = 0; k < segs; k++) {
        a += rand(-0.6, 0.6);
        x += Math.cos(a) * (len / segs);
        y += Math.sin(a) * (len / segs);
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      for (const cls of ['crack-dark', 'crack-glow']) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('class', `${cls} impact`);
        path.setAttribute('d', d);
        path.setAttribute('pathLength', '1');
        path.style.animationDelay = `${i * 0.03}s`;
        group.appendChild(path);
      }
    }
  }

  /* ===================================================================
     2. BACKGROUND: stars (drawn once per resize), twinkles, dust motes
     =================================================================== */
  function drawStars() {
    const c = $('#stars');
    const w = innerWidth, h = innerHeight, d = Math.min(devicePixelRatio || 1, 2);
    c.width = w * d; c.height = h * d;
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    const n = Math.round((w * h) / 4500);
    for (let i = 0; i < n; i++) {
      const y = Math.pow(Math.random(), 1.6) * h * 0.62;
      g.globalAlpha = rand(0.3, 1) * Math.max(0, 1 - y / (h * 0.7));
      g.fillStyle = pick(['#ffffff', '#cfe0ff', '#ffe8c0']);
      const s = Math.random() < 0.85 ? 1 : 2;
      g.fillRect(Math.round(rand(0, w)), Math.round(y), s, s);
    }
  }

  function spawnAmbient() {
    const tw = $('#twinkles');
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'tw';
      s.style.cssText = `left:${rand(2, 98)}%;top:${rand(2, 45)}%;--d:${rand(1.5, 4)}s;--delay:${-rand(0, 4)}s`;
      tw.appendChild(s);
    }
    if (reduceMotion) return;
    const motes = $('#motes');
    for (let i = 0; i < 26; i++) {
      const m = document.createElement('span');
      m.className = 'mote';
      const d = rand(9, 18);
      m.style.cssText = `left:${rand(0, 100)}%;bottom:${rand(0, 35)}%;--sz:${pick([2, 2, 3, 4])}px;` +
        `--d:${d}s;--delay:${-rand(0, d)}s;--dx:${rand(-6, 6)}vw`;
      motes.appendChild(m);
    }
  }

  /* ===================================================================
     3. PARTICLES (planks, dust, sparks) on one canvas.
     The rAF loop only runs while particles are alive.
     =================================================================== */
  const fx = $('#fx');
  const ctx = fx.getContext('2d');
  let particles = [];
  let fxRaf = 0, lastT = 0;

  function sizeFx() {
    const d = Math.min(devicePixelRatio || 1, 2);
    fx.width = innerWidth * d; fx.height = innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  function startFx() {
    if (fxRaf) return;
    lastT = performance.now();
    fxRaf = requestAnimationFrame(tickFx);
  }

  function tickFx(now) {
    const dt = Math.min((now - lastT) / 1000, 1 / 30);
    lastT = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }

      if (p.type === 'dust') {
        p.vx *= 1 - 1.8 * dt;
        p.vy = p.vy * (1 - 1.8 * dt) - 25 * dt;      // drifts up as it slows
        p.size += p.grow * dt;
      } else {
        p.vy += p.g * dt;
        if (p.y > p.ground && p.vy > 0) {               // bounce, then settle
          p.y = p.ground;
          p.vy *= -0.3; p.vx *= 0.55; p.vr *= 0.5;
          if (Math.abs(p.vy) < 60) { p.vy = 0; p.vr = 0; }
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;

      const fade = Math.min(1, (p.max - p.life) / 0.6);
      if (p.type === 'dust') {
        ctx.globalAlpha = fade * 0.5 * (1 - p.life / p.max) + 0.05;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.type === 'spark') {
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else {                                         // plank
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = PAL.outline;
        ctx.fillRect(-p.w / 2 - 1, -p.h / 2 - 1, p.w + 2, p.h + 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fillStyle = p.edge;
        ctx.fillRect(-p.w / 2, p.h / 2 - p.u * 0.5, p.w, p.u * 0.5);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    fxRaf = particles.length ? requestAnimationFrame(tickFx) : 0;
  }

  // Burst of wooden planks + dust from the horse body.
  function spawnDebris() {
    const b = horse.getBoundingClientRect();
    const u = b.width / 96;                 // screen px per art pixel
    const k = b.height / 600;               // velocity scale
    const cx = b.left + 48 * u;
    const solid = PARTS.filter((p) => p.kind !== 'mane');
    const area = solid.reduce((s, p) => s + p.w * p.h, 0);
    const pickPart = () => {
      let t = Math.random() * area;
      for (const p of solid) { t -= p.w * p.h; if (t <= 0) return p; }
      return solid[0];
    };

    const planks = reduceMotion ? 12 : 48;
    for (let i = 0; i < planks; i++) {
      const part = pickPart();
      const x = b.left + rand(part.x, part.x + part.w) * u;
      const y = b.top + rand(part.y, part.y + part.h) * u;
      const out = (x - cx) / (b.width / 2);   // -1 … 1, away from the split
      particles.push({
        type: 'plank', x, y, u,
        vx: (out * rand(250, 650) + rand(-90, 90)) * k,
        vy: -rand(250, 850) * k,
        g: 1900 * k,
        rot: rand(0, Math.PI), vr: rand(-14, 14),
        w: Math.round(rand(3, 9)) * u, h: Math.round(rand(1, 2)) * u,
        color: pick([PAL.wood, PAL.woodL, PAL.woodL, PAL.woodH, PAL.woodD]),
        edge: PAL.woodD,
        ground: b.top + rand(70, 82) * u,
        life: 0, max: rand(2.4, 3.4),
      });
    }

    const dust = reduceMotion ? 15 : 80;
    for (let i = 0; i < dust; i++) {
      particles.push({
        type: 'dust',
        x: cx + rand(-22, 22) * u, y: b.top + rand(26, 72) * u,
        vx: rand(-1, 1) * 260 * k, vy: rand(-140, 40) * k,
        g: 0, rot: 0, vr: 0,
        size: rand(1, 2.5) * u, grow: rand(1, 3) * u,
        color: pick(['#c8aa78', '#a08260', '#e6d2aa']),
        life: 0, max: rand(1.2, 2.4),
      });
    }
    startFx();
  }

  // Small spark burst where the sword hits.
  function spawnSparks(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), s = rand(150, 480);
      particles.push({
        type: 'spark', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
        g: 900, rot: 0, vr: 0, ground: Infinity,
        size: pick([2, 3, 3, 4]),
        color: pick(['#fff3c4', '#ffd35e', '#ff9a2a']),
        life: 0, max: rand(0.3, 0.6),
      });
    }
    startFx();
  }

  // size: 'sm' | 'md' | 'lg'
  function shake(size) {
    if (reduceMotion) return;
    scene.classList.remove('shake-sm', 'shake-md', 'shake-lg');
    void scene.offsetWidth;                  // restart the animation
    scene.classList.add('shake-' + size);
  }
  scene.addEventListener('animationend', (e) => {
    if (e.target === scene) scene.classList.remove('shake-sm', 'shake-md', 'shake-lg');
    if (e.target === horse) horse.classList.remove('wobble');
  });

  // Hit 2: a couple of planks work loose near the strike point and drop off.
  function spawnLoosePlanks(x, y) {
    const b = horse.getBoundingClientRect();
    const u = b.width / 96;
    const k = b.height / 600;
    const n = reduceMotion ? 1 : 3;
    for (let i = 0; i < n; i++) {
      particles.push({
        type: 'plank', x: x + rand(-4, 4) * u, y: y + rand(-3, 3) * u, u,
        vx: rand(-160, 160) * k, vy: -rand(120, 320) * k,
        g: 1900 * k,
        rot: rand(0, Math.PI), vr: rand(-8, 8),
        w: Math.round(rand(3, 6)) * u, h: u,
        color: pick([PAL.wood, PAL.woodL, PAL.woodH]),
        edge: PAL.woodD,
        ground: b.top + rand(70, 82) * u,
        life: 0, max: rand(1.8, 2.6),
      });
    }
    startFx();
  }

  /* ===================================================================
     4. THE BREAK — three sword hits (clicks on the horse, or Enter/Space).
        hit 1: impact cracks + sparks · hit 2: cracks spread, planks loosen
        hit 3: the full break, then the automatic zoom into Ithaca.
     =================================================================== */
  const HINTS = ['', 'Again \u2014 the wood is cracking', 'One more hit!'];
  const ENTER_DELAY = 1000;                   // beat held on the open doorway

  function setHint(text) {
    hint.textContent = `\u2694 ${text} \u2694`;
  }

  // (x, y) = screen point of the strike; (ax, ay) = same point in art space.
  function strike(x, y, ax, ay) {
    if (state !== 'idle' && state !== 'hit1' && state !== 'hit2') return;
    hits++;
    spawnSparks(x, y);

    if (hits === 1) {
      state = 'hit1';
      horse.classList.add('hit1');
      impactCracks(ax, ay, 5, 7);
      shake('sm');
      setHint(HINTS[1]);
    } else if (hits === 2) {
      state = 'hit2';
      horse.classList.add('hit2');
      impactCracks(ax, ay, 6, 10);
      shake('md');
      spawnLoosePlanks(x, y);
      if (!reduceMotion) {
        horse.classList.remove('wobble');
        void horse.offsetWidth;               // restart the wobble
        horse.classList.add('wobble');
      }
      setHint(HINTS[2]);
    } else {
      breakHorse();
    }
  }

  function breakHorse() {
    state = 'breaking';

    hint.classList.add('gone');
    horse.classList.remove('wobble');
    horse.classList.add('cracking');          // the remaining cracks race across
    horse.setAttribute('aria-disabled', 'true');
    shake('sm');

    setTimeout(() => {                        // ...then it bursts
      shake('lg');
      spawnDebris();
      horse.classList.add('broken');          // halves fall apart
      reveal.classList.add('open');           // glowing doorway opens
    }, 330);

    setTimeout(() => {                        // title appears last
      title.classList.add('show');
      title.removeAttribute('aria-hidden');
      horse.tabIndex = -1;
      horse.blur();
      state = 'open';
      setTimeout(enterIthaca, ENTER_DELAY);   // brief beat, then walk through
    }, 1450);
  }

  horse.addEventListener('click', (e) => {
    const b = horse.getBoundingClientRect();
    const keyboard = e.detail === 0 && !e.clientX && !e.clientY;
    const x = keyboard ? b.left + b.width / 2 : e.clientX;
    const y = keyboard ? b.top + b.height * 0.5 : e.clientY;
    const ax = ((x - b.left) / b.width) * 96;
    const ay = ((y - b.top) / b.height) * 80;
    // Swings that miss the wood (empty space in the horse's box) don't count.
    if (!keyboard && !onHorse(ax, ay)) return;
    strike(x, y, ax, ay);
  });
  horse.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      // Land each keyboard blow somewhere on the barrel.
      const ax = rand(26, 70), ay = rand(32, 46);
      const b = horse.getBoundingClientRect();
      strike(b.left + (ax / 96) * b.width, b.top + (ay / 80) * b.height, ax, ay);
    }
  });

  /* ===================================================================
     5. ENTERING — zoom through the doorway, then go to MAIN_PAGE.
        Runs automatically once the doorway has been revealed.
     =================================================================== */
  function enterIthaca() {
    if (state !== 'open') return;
    state = 'entering';
    scene.classList.add('entering');

    setTimeout(() => flash.classList.add('on'), 850);
    setTimeout(() => {
      // Navigate while the flash is at full brightness, so the light
      // carries straight into the next page.
      state = 'done';
      window.location.href = MAIN_PAGE;
    }, 1350);
  }

  /* ===================================================================
     6. CUSTOM CURSOR — xiphos follows the mouse, swings on click.
     =================================================================== */
  const swing = cursor.querySelector('.swing');
  let mx = -100, my = -100, curRaf = 0;
  const placeCursor = () => {
    curRaf = 0;
    cursor.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
  };
  const trackPointer = (e) => {
    if (e.pointerType === 'touch') return;
    mx = e.clientX; my = e.clientY;
    cursor.classList.add('on');
    if (!curRaf) curRaf = requestAnimationFrame(placeCursor);
  };
  window.addEventListener('pointermove', trackPointer, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    trackPointer(e);
    if (e.pointerType === 'touch') return;
    swing.classList.remove('go');
    void swing.offsetWidth;                   // restart swing on rapid clicks
    swing.classList.add('go');
  });
  document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('on'));

  /* ===================================================================
     7. BOOT
     =================================================================== */
  buildHorse();
  drawStars();
  sizeFx();
  spawnAmbient();

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { drawStars(); sizeFx(); }, 120);
  });
})();
