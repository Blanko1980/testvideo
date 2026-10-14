/*
 * DESIGN OFFICES — MUNICH CAMPUS KÖNIGSPLATZ
 * 30-second spot, built from code only: every frame is drawn on a <canvas>,
 * every sound is synthesised with the Web Audio API. No images, no samples.
 *
 * Everything is a pure function of time, so the same code drives the live
 * player (index.html) and the frame-exact offline render (render/render.mjs).
 */
(function (global) {
  'use strict';

  // ───────────────────────────────────────────────────────────── constants ──
  const W = 1920, H = 1080, DUR = 30, FPS = 30;
  const BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4;          // 30 s = 15 bars

  const C = {
    bg: '#0A0D18', bg2: '#121a30', ink: '#F5F0E6', gold: '#F3B54A',
    coral: '#FF5B4F', teal: '#2FD1BC', violet: '#7C6CFF', navy: '#1B2440',
  };
  const SANS = '"Spot Sans", Inter, system-ui, sans-serif';
  const SERIF = '"Spot Serif", Georgia, "Times New Roman", serif';
  const MONO = '"Spot Mono", "DejaVu Sans Mono", monospace';
  const D2R = Math.PI / 180;

  // ─────────────────────────────────────────────────────────────── helpers ──
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    inCubic: x => x * x * x,
    outCubic: x => 1 - Math.pow(1 - x, 3),
    inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuint: x => 1 - Math.pow(1 - x, 5),
    inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inOutExpo: x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
    outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    outElastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  };
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function mix(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return `rgb(${r},${g},${bl})`;
  }
  function font(ctx, fam, size, weight = 400, style = 'normal', spacing = 0) {
    ctx.font = `${style} ${weight} ${size}px ${fam}`;
    ctx.letterSpacing = spacing + 'px';
  }

  /* Per-letter masked reveal: letters rise out of an invisible slot. */
  function revealText(ctx, str, x, y, t, t0, o = {}) {
    const size = o.size || 100, stagger = o.stagger ?? 0.03, dur = o.dur ?? 0.55;
    const align = o.align || 'left', ease = o.ease || E.outExpo;
    if (t < t0) return 0;
    font(ctx, o.fam || SANS, size, o.weight || 800, o.style || 'normal', o.spacing || 0);
    const total = ctx.measureText(str).width;
    let x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.save();
    if (o.mask !== false) {
      ctx.beginPath();
      ctx.rect(x0 - size, y - size * 1.12, total + size * 2, size * 1.5);
      ctx.clip();
    }
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const base = (o.alpha ?? 1) * ctx.globalAlpha;
    for (let i = 0; i < str.length; i++) {
      const p = ease(prog(t, t0 + i * stagger, t0 + i * stagger + dur));
      if (p <= 0) continue;
      const cx = x0 + ctx.measureText(str.slice(0, i)).width;
      ctx.globalAlpha = base * clamp(p * 1.4);
      ctx.fillText(str[i], cx, y + (1 - p) * size * 1.15);
    }
    ctx.restore();
    return total;
  }

  /* Draw a polyline only up to fraction p of its length. Returns head point. */
  function strokePartial(ctx, pts, p, len) {
    if (p <= 0) return null;
    let target = len * p, acc = 0;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const seg = Math.hypot(bx - ax, by - ay);
      if (acc + seg >= target) {
        const k = (target - acc) / seg;
        const hx = ax + (bx - ax) * k, hy = ay + (by - ay) * k;
        ctx.lineTo(hx, hy);
        ctx.stroke();
        return [hx, hy];
      }
      ctx.lineTo(bx, by);
      acc += seg;
    }
    ctx.stroke();
    return null;
  }
  const polyLen = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

  // ──────────────────────────────────────────────── shared timing (A + V) ──
  const T = {
    type1: Array.from({ length: 9 }, (_, i) => 0.62 + i * 0.105),   // "Big ideas"
    type2: Array.from({ length: 10 }, (_, i) => 2.02 + i * 0.094),  // "need room."
    drop: 4.0,
    blocks: [4.5, 5.0, 5.5, 6.0],
    counter: [5.0, 6.8],
    wipe1: 8.0,
    pins: [10.2, 10.45, 10.7, 10.95],
    gate: 11.3,
    words: [12, 13, 14, 15, 16],
    strobe: [17, 17.25, 17.5, 17.75],
    globe: 18,
    arcStart: i => 18.75 + i * 0.27,
    arcDur: 0.8,
    dusk: 22,
    lights: 22.15,
    clink: 24.5,
    final: 26,
  };
  // Counter ticks: one tick per displayed "step" of the ease-out count.
  T.ticks = Array.from({ length: 26 }, (_, k) => {
    const v = k / 25; return lerp(T.counter[0], T.counter[1], 1 - Math.pow(1 - v, 1 / 5));
  });

  // ───────────────────────────────────────────────────── precomputed data ──
  const R0 = mulberry32(1980);

  // Explosion sparks for the drop.
  const SPARKS = Array.from({ length: 280 }, () => {
    const a = R0() * Math.PI * 2;
    return {
      a, sp: 300 + R0() * 1500, life: 0.5 + R0() * 1.0, w: 1 + R0() * 3,
      col: [C.gold, C.ink, C.coral, C.teal][Math.floor(R0() * 4)], len: 10 + R0() * 50,
    };
  });

  // Grain tiles.
  let GRAIN = null;
  function makeGrain() {
    if (typeof document === 'undefined') return [];
    const tiles = [];
    const r = mulberry32(7);
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const id = g.createImageData(256, 256);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.floor(r() * 255);
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
        id.data[i + 3] = 20;
      }
      g.putImageData(id, 0, 0);
      tiles.push(c);
    }
    return tiles;
  }

  // Campus blocks — Brienner Str. 45 a–d, arranged around a courtyard.
  const BLOCKS = [
    { x0: -125, x1: 125, y0: -150, y1: -88, h: 86, label: '45a' },
    { x0: 82, x1: 145, y0: -78, y1: 92, h: 112, label: '45b' },
    { x0: -125, x1: 62, y0: 102, y1: 160, h: 72, label: '45c' },
    { x0: -148, x1: -84, y0: -78, y1: 86, h: 124, label: '45d' },
  ];
  BLOCKS.forEach((b, bi) => {
    const r = mulberry32(100 + bi);
    b.lit = Array.from({ length: 600 }, () => (r() < 0.82 ? 5.0 + r() * 2.4 : 99));
  });
  const WALKERS = Array.from({ length: 9 }, (_, i) => {
    const r = mulberry32(300 + i);
    return { cx: -10 + r() * 20, cy: 5 + r() * 20, rx: 22 + r() * 40, ry: 18 + r() * 45, w: (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9), ph: r() * 6.28, col: [C.coral, C.teal, C.ink, C.gold][i % 4] };
  });

  // Propyläen at Königsplatz — line drawing, local coords (ground y = 0).
  const PROP = (function () {
    const P = [];
    const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    P.push({ pts: [[-960, 0], [960, 0]], w: 2 });
    P.push({ pts: R(-345, 0, 345, -12) });
    P.push({ pts: R(-322, -12, 322, -24) });
    P.push({ pts: R(-300, -24, 300, -36) });
    for (const cx of [-250, -150, -50, 50, 150, 250]) {
      P.push({ pts: [[cx - 19, -36], [cx - 15, -296], [cx + 15, -296], [cx + 19, -36], [cx - 19, -36]], fill: true });
      P.push({ pts: [[cx - 6, -42], [cx - 5, -290]], w: 1, a: 0.45 });
      P.push({ pts: [[cx + 6, -42], [cx + 5, -290]], w: 1, a: 0.45 });
      P.push({ pts: [[cx - 15, -296], [cx - 25, -306], [cx + 25, -306], [cx + 15, -296]] });
      P.push({ pts: R(cx - 27, -306, cx + 27, -314) });
    }
    P.push({ pts: R(-292, -314, 292, -340) });
    P.push({ pts: R(-292, -340, 292, -372) });
    for (let x = -276; x <= 276; x += 46) {
      P.push({ pts: [[x - 6, -345], [x - 6, -367]], w: 1.3, a: 0.8 });
      P.push({ pts: [[x + 6, -345], [x + 6, -367]], w: 1.3, a: 0.8 });
    }
    P.push({ pts: R(-308, -372, 308, -386) });
    P.push({ pts: [[-308, -386], [0, -470], [308, -386]] });
    P.push({ pts: [[-266, -394], [0, -455], [266, -394], [-266, -394]], w: 1.2, a: 0.6 });
    for (const s of [-1, 1]) {
      const X = x => x * s;
      const inner = y => 330 + (15 * -y) / 430, outer = y => 560 - (15 * -y) / 430;
      P.push({ pts: [[X(330), 0], [X(345), -430], [X(545), -430], [X(560), 0]], fill: true });
      P.push({ pts: R(X(337), -430, X(553), -446) });
      P.push({ pts: R(X(352), -446, X(538), -458) });
      P.push({ pts: [[X(inner(-360)), -360], [X(outer(-360)), -360]], w: 1.4 });
      P.push({ pts: [[X(inner(-408)), -408], [X(outer(-408)), -408]], w: 1.4 });
      for (let x = 362; x < 530; x += 19) {
        P.push({ pts: [[X(x), -402], [X(x + 5), -380], [X(x), -366]], w: 1, a: 0.55 });
      }
      const arc = [[X(418), 0], [X(418), -112]];
      for (let k = 0; k <= 12; k++) { const a = Math.PI - (Math.PI * k) / 12; arc.push([X(445 + 27 * Math.cos(a)), -112 - 27 * Math.sin(a)]); }
      arc.push([X(472), 0]);
      P.push({ pts: arc });
      P.push({ pts: R(X(428), -228, X(462), -292), w: 1.4 });
      P.push({ pts: [[X(300), -200], [X(331), -200]], w: 1.4 });
    }
    P.forEach((p, i) => { p.len = polyLen(p.pts); p.s = (i / P.length) * 0.72; });
    return P;
  })();
  const PINS = [
    { x: 240, y: 470, label: 'GLYPTOTHEK', side: 1 },
    { x: 1680, y: 430, label: 'LENBACHHAUS', side: -1 },
    { x: 200, y: 680, label: 'PINAKOTHEKEN', side: 1 },
    { x: 1720, y: 660, label: 'LMU', side: -1 },
  ];

  // Montage.
  const WORDS = [
    { w: 'PITCH.', sub: 'Win the room.', bg: C.coral, fg: C.bg, m: 'spot' },
    { w: 'BRAINSTORM.', sub: 'Think out loud.', bg: C.violet, fg: C.ink, m: 'notes' },
    { w: 'WORKSHOP.', sub: 'Build it together.', bg: C.teal, fg: C.bg, m: 'table' },
    { w: 'LAUNCH.', sub: 'Go public.', bg: C.gold, fg: C.bg, m: 'launch' },
    { w: 'CELEBRATE.', sub: 'Raise a glass.', bg: C.ink, fg: C.bg, m: 'confetti' },
  ];
  const STROBE = ['Coworking.', 'Offices.', 'Meeting rooms.', 'Event spaces.'];
  const NOTES = (() => {
    const r = mulberry32(42), out = [];
    while (out.length < 16) {
      const x = 80 + r() * (W - 160), y = 80 + r() * (H - 160);
      if (y > H * 0.3 && y < H * 0.72) continue;              // keep the word clear
      out.push({ x, y, s: 90 + r() * 70, rot: (r() - 0.5) * 0.45, col: [C.ink, C.gold, C.coral, C.teal][Math.floor(r() * 4)], d: r() * 0.4 });
    }
    return out;
  })();
  const STREAKS = Array.from({ length: 46 }, (_, i) => { const r = mulberry32(500 + i); return { x: r() * W, y: r(), len: 80 + r() * 260, w: 1 + r() * 3 }; });
  const CONFETTI = Array.from({ length: 190 }, (_, i) => {
    const r = mulberry32(900 + i), left = i % 2 === 0;
    const ang = (left ? -60 : -120) * D2R + (r() - 0.5) * 0.7;
    const sp = 1300 + r() * 1100;
    return { x: left ? -20 : W + 20, y: H + 20, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, rot: r() * 6, vr: (r() - 0.5) * 18, w: 10 + r() * 14, h: 6 + r() * 8, col: [C.coral, C.teal, C.violet, C.gold, C.bg][Math.floor(r() * 5)], d: r() * 0.15 };
  });

  // Globe.
  // Fibonacci sphere; LAND_MASK marks the points that fall on land
  // (baked from Natural Earth 1:50m coastlines, one bit per point).
  const LAND_MASK = 'AEBASAwoCQEwASRm4kasme2jr3+3t/7+3P+f21t/b2rvz4mpuT8lJ+bclJyZkxNydl7Oztl5OTtnZ+XsnJyVk7Nyct7OyslxOSsnZ+XsmJiRk7NiYlbOiMlROSMr5uXkrJyREyNyUlbMyogZMSknZkWEvJiUEbNiUlZMyghZMSkjZ+WkrJyUkZJyUlLOykhJOSkpBeWkpByUlZJSUFJKykBJKSgJJSWgpISEhbISUFJCwlBZCQgKJSGgrASEgrIQEBCKQkBICQgJRSEgJBSEgIISEBKKQlBICQhBISEoNAWEoJAUEIICQlBICgBBISkgBAWgohIUAIIKUBEICkBBBagIBAWgogAUgIIKUREIKkRBAagIBRWiIgQUiIoTUDACKkBBCCgQBSWgYAQUiIoSUAAKCkBBCCgABQWgIBQUgIIQUCAKCkVBiCgABYWiQBQUiAIQUSAKCkUBiCgQBYSiQEQUiAoRUSAqCkWBiCgQFYKiQEQUiAoBUSAiBESBgCgQFQKiQEQMiAIBUSAiBESBgAgQAQKgQEAEgAABEAAABECAAAgAAAIgAAAEAAAgEAAAAAAAEAgAAAIAAAAEAAAAEAAAAAAAAAgAAAAAAAAEAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgJESkhJSUk5bi8lpeXs/P7/l7f///';
  const SPHERE = (() => {
    const N = 4200, pts = [], ga = Math.PI * (3 - Math.sqrt(5));
    const bits = typeof atob === 'function' ? atob(LAND_MASK) : Buffer.from(LAND_MASK, 'base64').toString('binary');
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = i * ga;
      const land = (bits.charCodeAt(i >> 3) >> (i & 7)) & 1;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r, land]);
    }
    return pts;
  })();
  const CITIES = [
    ['LONDON', 51.51, -0.13], ['NEW YORK', 40.71, -74.0], ['PARIS', 48.86, 2.35], ['DUBAI', 25.2, 55.27],
    ['SÃO PAULO', -23.55, -46.63], ['STOCKHOLM', 59.33, 18.07], ['MUMBAI', 19.08, 72.88], ['MADRID', 40.42, -3.7],
  ];
  const MUC = [48.137, 11.575];
  const v3 = (lat, lon) => { const la = lat * D2R, lo = lon * D2R; return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; };
  function rotG(v, lam, phi) {
    const [x, y, z] = v, cl = Math.cos(-lam), sl = Math.sin(-lam);
    const x1 = x * cl + z * sl, z1 = -x * sl + z * cl;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  }

  // Dusk.
  const STARS = Array.from({ length: 170 }, (_, i) => { const r = mulberry32(1200 + i); return { x: r() * W, y: r() * H * 0.55, s: 0.6 + r() * 1.8, ph: r() * 6.28, d: r() }; });
  const SKY_BACK = (() => {
    const r = mulberry32(77), b = []; let x = -300;
    while (x < W + 600) { const w = 50 + r() * 130; b.push({ x, w, h: 40 + r() * 150, gable: r() < 0.3 }); x += w + r() * 10; }
    return b;
  })();
  const SKY_MID = (() => {
    const r = mulberry32(78), b = []; let x = -300;
    while (x < W + 600) { const w = 70 + r() * 150; b.push({ x, w, h: 30 + r() * 90, gable: r() < 0.5 }); x += w; }
    return b;
  })();
  const DUST = Array.from({ length: 70 }, (_, i) => { const r = mulberry32(1500 + i); return { x: r() * W, y: r() * H, s: 0.8 + r() * 2.2, v: 10 + r() * 40, ph: r() * 6.28 }; });

  // ─────────────────────────────────────────────────────────────── scenes ──
  function background(ctx, t) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 50, W * 0.5, H * 0.5, W * 0.7);
    g.addColorStop(0, hexA('#1a2344', 0.55 * prog(t, 0, 1.2)));
    g.addColorStop(1, 'rgba(10,13,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 0–4.6 s · "Big ideas need room." — the cramped box, then the drop.
  function sceneIntro(ctx, t) {
    if (t >= 4.7) return;
    const s1 = 168, s2 = 200;
    const sq = t < 4 ? E.inCubic(prog(t, 3.0, 3.97)) : 1;
    const boom = prog(t, 4.0, 4.55);
    let shx = 0, shy = 0;
    if (t > 3.0 && t < 4.0) { const r = mulberry32(Math.floor(t * 60)); const a = 11 * sq; shx = (r() - 0.5) * 2 * a; shy = (r() - 0.5) * 2 * a; }

    ctx.save();
    ctx.translate(W / 2 + shx, 545 + shy);

    // the "room" label — every agency knows this room
    if (t > 2.95 && t < 4.0) {
      const fl = t < 3.15 ? (Math.floor(t * 40) % 2) : 1;
      font(ctx, MONO, 24, 500, 'normal', 4);
      ctx.fillStyle = hexA(C.coral, 0.9 * fl);
      ctx.textAlign = 'left';
      const bw = 560 * (1 - 0.26 * sq);
      ctx.fillText('MEETING ROOM 3B  ·  6 m²  ·  14 PEOPLE', -bw + 8, -262 * (1 - 0.12 * sq) - 18);
    }

    // text
    ctx.save();
    const zs = 1 + 7 * E.outCubic(boom);
    ctx.scale((1 - 0.24 * sq * (1 - boom)) * zs, (1 - 0.1 * sq * (1 - boom)) * zs);
    ctx.globalAlpha = Math.pow(1 - boom, 3);
    font(ctx, SANS, s1, 900, 'normal', -5);
    const L1 = 'Big ideas', w1 = ctx.measureText(L1).width;
    const n1 = T.type1.filter(x => t >= x).length;
    ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(L1.slice(0, n1), -w1 / 2, -40);
    const c1x = -w1 / 2 + ctx.measureText(L1.slice(0, n1)).width;
    font(ctx, SERIF, s2, 400, 'italic', 0);
    const L2 = 'need room.', w2 = ctx.measureText(L2).width;
    const n2 = T.type2.filter(x => t >= x).length;
    ctx.fillStyle = C.gold;
    ctx.fillText(L2.slice(0, n2), -w2 / 2, 158);
    const c2x = -w2 / 2 + ctx.measureText(L2.slice(0, n2)).width;
    const typing = (t > 0.6 && t < 1.6) || (t > 2.0 && t < 3.0);
    if (t > 0.3 && t < 3.6 && (typing || (t * 2.4) % 1 < 0.55)) {
      ctx.fillStyle = n2 > 0 || t > 1.95 ? C.gold : C.ink;
      if (n2 > 0 || t > 1.95) ctx.fillRect(c2x + 10, 158 - s2 * 0.62, 9, s2 * 0.7);
      else ctx.fillRect(c1x + 12, -40 - s1 * 0.72, 11, s1 * 0.76);
    }
    ctx.restore();

    // the cramped box
    if (t > 2.9) {
      const bw = 560 * (1 - 0.26 * sq), bh = 262 * (1 - 0.12 * sq), cy = 20;
      const d = E.outExpo(boom) * 1100;
      const pDraw = E.inOutCubic(prog(t, 2.9, 3.3));
      ctx.strokeStyle = C.coral; ctx.lineWidth = 7; ctx.lineCap = 'square';
      ctx.globalAlpha = 1 - boom;
      const edges = [
        [[-bw, cy - bh - d], [bw, cy - bh - d]],
        [[bw + d, cy - bh], [bw + d, cy + bh]],
        [[bw, cy + bh + d], [-bw, cy + bh + d]],
        [[-bw - d, cy + bh], [-bw - d, cy - bh]],
      ];
      edges.forEach((e, i) => {
        const p = clamp(pDraw * 4 - i);
        if (p > 0) { ctx.beginPath(); ctx.moveTo(e[0][0], e[0][1]); ctx.lineTo(lerp(e[0][0], e[1][0], p), lerp(e[0][1], e[1][1], p)); ctx.stroke(); }
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // 4–8 s · the campus pops up: 18,000 m².
  function isoCam(t) {
    const p = prog(t, 4, 8.1);
    return { th: lerp(-0.98, -0.52, E.inOutCubic(p)), tilt: 0.64, s: lerp(2.15, 2.45, E.outCubic(p)), cx: W * 0.7, cy: H * 0.6 };
  }
  function iso(cam, x, y, z) {
    const c = Math.cos(cam.th), s = Math.sin(cam.th);
    const rx = x * c - y * s, ry = x * s + y * c;
    return [cam.cx + rx * cam.s, cam.cy + (ry * Math.sin(cam.tilt) - z * Math.cos(cam.tilt)) * cam.s, ry];
  }
  function quad(ctx, a, b, c, d) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); }

  function sceneCampus(ctx, t) {
    if (t < 4.0 || t >= 8.0) return;
    const cam = isoCam(t);
    const cth = Math.cos(cam.th), sth = Math.sin(cam.th);

    // ground grid growing out from the courtyard
    const gr = 520 * E.outCubic(prog(t, 4.0, 5.0));
    ctx.lineWidth = 1;
    for (let k = -440; k <= 440; k += 40) {
      const a = 0.11 * (1 - Math.abs(k) / 520);
      ctx.strokeStyle = hexA(C.ink, a);
      const len = Math.min(440, gr);
      if (Math.abs(k) > gr) continue;
      let p0 = iso(cam, k, -len, 0), p1 = iso(cam, k, len, 0);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      p0 = iso(cam, -len, k, 0); p1 = iso(cam, len, k, 0);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    // radar ring
    if (t < 5.4) {
      ctx.strokeStyle = hexA(C.teal, 0.5 * (1 - prog(t, 4.6, 5.4)));
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 64; k++) { const a = (k / 64) * Math.PI * 2; const p = iso(cam, Math.cos(a) * gr, Math.sin(a) * gr, 0); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
    }

    // courtyard
    const cyA = E.outCubic(prog(t, 5.8, 6.6));
    if (cyA > 0) {
      quad(ctx, iso(cam, -80, -84, 0), iso(cam, 78, -84, 0), iso(cam, 78, 98, 0), iso(cam, -80, 98, 0));
      ctx.fillStyle = hexA(C.teal, 0.13 * cyA); ctx.fill();
      ctx.setLineDash([6, 6]); ctx.strokeStyle = hexA(C.teal, 0.5 * cyA); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    }

    // buildings, sorted back-to-front
    const order = BLOCKS.map((b, i) => ({ b, i, d: iso(cam, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0)[2] })).sort((a, b) => a.d - b.d);
    const light = [-0.55, 0.83];
    for (const { b, i } of order) {
      const k = prog(t, T.blocks[i], T.blocks[i] + 0.6);
      const hh = b.h * E.outBack(k);
      const g = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
      // footprint
      quad(ctx, ...g.map(p => iso(cam, p[0], p[1], 0)));
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.strokeStyle = hexA(C.gold, 0.5 * clamp(gr / 300)); ctx.lineWidth = 1.2; ctx.stroke();
      if (hh < 0.5) continue;
      const faces = [[0, 1, 0, -1], [1, 2, 1, 0], [2, 3, 0, 1], [3, 0, -1, 0]]
        .map(([a, c, nx, ny]) => ({ a, c, nx, ny, ry: nx * sth + ny * cth, rx: nx * cth - ny * sth }))
        .filter(f => f.ry > 0)
        .sort((f1, f2) => f1.ry - f2.ry);
      let wi = 0;
      for (const f of faces) {
        const A = g[f.a], B = g[f.c];
        const br = 0.5 + 0.5 * (f.rx * light[0] + f.ry * light[1]);
        quad(ctx, iso(cam, A[0], A[1], 0), iso(cam, B[0], B[1], 0), iso(cam, B[0], B[1], hh), iso(cam, A[0], A[1], hh));
        ctx.fillStyle = mix('#0f1530', '#2c3a6e', br); ctx.fill();
        ctx.strokeStyle = hexA(C.ink, 0.5); ctx.lineWidth = 1.3; ctx.stroke();
        // windows
        const elen = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const cols = Math.floor((elen - 10) / 15), rows = Math.floor((b.h - 14) / 14);
        for (let r = 0; r < rows; r++) {
          const z0 = 8 + r * 14;
          if (z0 + 8 > hh) break;
          for (let cI = 0; cI < cols; cI++) {
            const u0 = (8 + cI * 15) / elen, u1 = (8 + cI * 15 + 7) / elen;
            const lt = b.lit[(wi++) % b.lit.length];
            const on = t > lt;
            const fl = on ? clamp((t - lt) * 6) : 0;
            const P = (u, z) => iso(cam, lerp(A[0], B[0], u), lerp(A[1], B[1], u), z);
            quad(ctx, P(u0, z0), P(u1, z0), P(u1, z0 + 8), P(u0, z0 + 8));
            ctx.fillStyle = on ? hexA(C.gold, 0.25 + 0.65 * fl) : 'rgba(255,255,255,0.05)';
            ctx.fill();
          }
        }
      }
      quad(ctx, ...g.map(p => iso(cam, p[0], p[1], hh)));
      ctx.fillStyle = mix('#2a3768', '#3d4c86', 0.5); ctx.fill();
      ctx.strokeStyle = hexA(C.ink, 0.75); ctx.lineWidth = 1.5; ctx.stroke();
      // label
      const la = prog(t, T.blocks[i] + 0.35, T.blocks[i] + 0.7);
      if (la > 0) {
        const p = iso(cam, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, hh + 6);
        ctx.strokeStyle = hexA(C.gold, la); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - 46 * E.outCubic(la)); ctx.stroke();
        ctx.fillStyle = hexA(C.gold, la); ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, 7); ctx.fill();
        font(ctx, MONO, 20, 500, 'normal', 2);
        ctx.textAlign = 'center'; ctx.fillStyle = hexA(C.ink, la);
        ctx.fillText(b.label.toUpperCase(), p[0], p[1] - 54 * E.outCubic(la));
      }
    }

    // courtyard life: trees and people
    const treeK = [[0, 6, 6.3], [-38, 52, 6.45], [44, -40, 6.6]];
    for (const [x, y, t0] of treeK) {
      const k = E.outBack(prog(t, t0, t0 + 0.45));
      if (k <= 0) continue;
      const b0 = iso(cam, x, y, 0), top = iso(cam, x, y, 16 * k);
      ctx.strokeStyle = hexA(C.ink, 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
      const c = iso(cam, x, y, 26 * k);
      ctx.fillStyle = hexA(C.teal, 0.85); ctx.beginPath(); ctx.arc(c[0], c[1], 15 * k * cam.s * 0.55, 0, 7); ctx.fill();
    }
    const wa = prog(t, 6.2, 6.8);
    if (wa > 0) {
      for (const w of WALKERS) {
        const a = w.ph + w.w * t * 1.2;
        const p = iso(cam, w.cx + Math.cos(a) * w.rx * 0.8, w.cy + Math.sin(a) * w.ry * 0.8, 2);
        ctx.fillStyle = hexA(w.col, wa); ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7); ctx.fill();
      }
    }

    // copy
    const x = 130;
    revealText(ctx, 'MUNICH  ·  CAMPUS KÖNIGSPLATZ', x, 335, t, 4.35, { fam: MONO, size: 24, weight: 500, spacing: 5, color: C.gold, stagger: 0.012, dur: 0.4 });
    if (t >= T.counter[0]) {
      const v = Math.round((18000 * E.outQuint(prog(t, T.counter[0], T.counter[1]))) / 10) * 10;
      const str = v.toLocaleString('en-US');
      const pop = 1 + 0.06 * (1 - E.outCubic(prog(t, T.counter[1], T.counter[1] + 0.35))) * (t > T.counter[1] ? 1 : 0);
      ctx.save();
      ctx.translate(x, 530); ctx.scale(pop, pop);
      const enter = E.outExpo(prog(t, 5.0, 5.4));
      ctx.globalAlpha = enter;
      font(ctx, SANS, 158, 900, 'normal', -6);
      ctx.fillStyle = C.ink; ctx.textAlign = 'left';
      ctx.fillText(str, 0, (1 - enter) * 60);
      const sw = ctx.measureText('18,000').width;
      font(ctx, SERIF, 128, 400, 'italic', 0);
      ctx.fillStyle = C.gold;
      ctx.fillText('m²', sw + 18, (1 - enter) * 60);
      ctx.restore();
    }
    revealText(ctx, 'of creative campus', x, 625, t, 6.55, { size: 56, weight: 700, spacing: -1, stagger: 0.015 });
    revealText(ctx, 'in the heart of Munich.', x, 705, t, 6.85, { fam: SERIF, style: 'italic', weight: 400, size: 66, color: hexA(C.ink, 0.85), stagger: 0.015 });
  }

  function wipe(ctx, t, tm, col1, col2) {
    const p = prog(t, tm - 0.3, tm + 0.3);
    if (p <= 0 || p >= 1) return;
    const e = E.inOutCubic(p);
    const band = (cx, w, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 + 260, 0); ctx.lineTo(cx + w / 2 + 260, 0);
      ctx.lineTo(cx + w / 2 - 260, H); ctx.lineTo(cx - w / 2 - 260, H); ctx.closePath(); ctx.fill();
    };
    band(lerp(-1.6 * W, 2.6 * W, e) - 340, 2.5 * W, col2);
    band(lerp(-1.6 * W, 2.6 * W, e), 2.5 * W, col1);
  }

  // 8–12 s · Königsplatz: the Propyläen drawn in light.
  function sceneKoenigsplatz(ctx, t) {
    if (t < 8.0 || t >= 12.0) return;
    const p = prog(t, 8.0, 10.4);
    const pe = E.outCubic(p);
    const zp = prog(t, T.gate, 12.0);
    const k0 = lerp(0.97, 1.05, prog(t, 8, T.gate));
    const zoom = Math.exp(E.inCubic(zp) * Math.log(16));
    const focal = [0, -170];
    const groundY = 850;
    const fx = lerp(W / 2, W / 2, zp), fy = lerp(groundY + focal[1] * k0, H / 2, E.inOutCubic(zp));

    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(k0 * zoom, k0 * zoom);
    ctx.translate(-focal[0], -focal[1]);

    // sun
    const sp = E.inOutCubic(prog(t, 8.1, 9.5));
    const sunG = ctx.createRadialGradient(0, -330, 10, 0, -330, 330);
    sunG.addColorStop(0, hexA(C.gold, 0.22 * sp)); sunG.addColorStop(1, hexA(C.gold, 0));
    ctx.fillStyle = sunG; ctx.beginPath(); ctx.arc(0, -330, 330, 0, 7); ctx.fill();
    ctx.strokeStyle = hexA(C.gold, 0.35); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -330, 300, Math.PI / 2, Math.PI / 2 + sp * Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, -330, 300, 0, 7); ctx.clip();
    for (let i = 0; i < 7; i++) {
      const y = -250 + i * 34, a = clamp(sp * 7 - i);
      ctx.strokeStyle = hexA(C.gold, 0.18 * a); ctx.lineWidth = 3 + i * 1.6;
      ctx.beginPath(); ctx.moveTo(-320, y); ctx.lineTo(320, y); ctx.stroke();
    }
    ctx.restore();

    // structure
    const fillA = 0.09 * prog(t, 10.0, 10.8);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const heads = [];
    for (const path of PROP) {
      const lp = clamp((pe - path.s) / 0.28);
      if (lp <= 0) continue;
      if (path.fill && fillA > 0) {
        ctx.beginPath(); path.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
        ctx.fillStyle = hexA(C.gold, fillA); ctx.fill();
      }
      ctx.strokeStyle = hexA(C.gold, path.a ?? 1);
      ctx.lineWidth = (path.w || 2.6) / Math.sqrt(zoom);
      ctx.shadowColor = hexA(C.gold, 0.8); ctx.shadowBlur = zoom > 2 ? 0 : 10;
      const h = strokePartial(ctx, path.pts, E.inOutCubic(lp), path.len);
      if (h) heads.push(h);
    }
    ctx.shadowBlur = 0;
    for (const h of heads.slice(-6)) {
      const g = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], 16);
      g.addColorStop(0, 'rgba(255,245,215,1)'); g.addColorStop(1, 'rgba(243,181,74,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h[0], h[1], 16, 0, 7); ctx.fill();
    }
    ctx.restore();

    // copy & neighbourhood
    ctx.save();
    ctx.globalAlpha = 1 - prog(t, T.gate, T.gate + 0.3);
    revealText(ctx, 'Königsplatz, Munich.', W / 2, 205, t, 9.35, { fam: SERIF, style: 'italic', weight: 400, size: 132, align: 'center', stagger: 0.025 });
    revealText(ctx, 'MAXVORSTADT  ·  KUNSTAREAL  ·  U2 AT THE DOOR', W / 2, 965, t, 9.9, { fam: MONO, size: 26, weight: 500, spacing: 7, align: 'center', color: C.gold, stagger: 0.01, dur: 0.4 });
    PINS.forEach((pin, i) => {
      const k = prog(t, T.pins[i], T.pins[i] + 0.5);
      if (k <= 0) return;
      const e = E.outBack(k);
      ctx.strokeStyle = hexA(C.teal, 0.9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pin.x, pin.y, 13 * e, 0, 7); ctx.stroke();
      ctx.fillStyle = C.teal; ctx.beginPath(); ctx.arc(pin.x, pin.y, 4.5 * e, 0, 7); ctx.fill();
      const ring = prog(t, T.pins[i], T.pins[i] + 0.8);
      ctx.strokeStyle = hexA(C.teal, 0.6 * (1 - ring)); ctx.beginPath(); ctx.arc(pin.x, pin.y, 13 + 40 * E.outCubic(ring), 0, 7); ctx.stroke();
      ctx.strokeStyle = hexA(C.ink, 0.35); ctx.lineWidth = 1;
      const lx = pin.x + pin.side * 24, ex = lx + pin.side * 60 * E.outCubic(k);
      ctx.beginPath(); ctx.moveTo(lx, pin.y); ctx.lineTo(ex, pin.y); ctx.stroke();
      revealText(ctx, pin.label, ex + pin.side * 12, pin.y + 8, t, T.pins[i] + 0.1, { fam: MONO, size: 22, weight: 500, spacing: 3, align: pin.side > 0 ? 'left' : 'right', stagger: 0.012, dur: 0.35 });
    });
    ctx.restore();

    // iris into the montage
    const ir = prog(t, 11.78, 12.0);
    if (ir > 0) { ctx.fillStyle = C.coral; ctx.beginPath(); ctx.arc(W / 2, H / 2, E.inOutCubic(ir) * 1200, 0, 7); ctx.fill(); }
  }

  // 12–18 s · kinetic montage for agency life.
  function motif(ctx, m, lt, wd, t) {
    const fg = wd.fg;
    if (m === 'spot') {
      const cx = W / 2 + Math.sin(lt * 3.2 - 1) * 260;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,255,255,0.38)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx - 30, -10); ctx.lineTo(cx + 30, -10); ctx.lineTo(cx + 420, H); ctx.lineTo(cx - 420, H); ctx.closePath(); ctx.fill();
      const hs = [110, 160, 135, 225, 300];
      hs.forEach((h, i) => {
        const k = E.outBack(prog(lt, 0.12 + i * 0.06, 0.5 + i * 0.06));
        ctx.fillStyle = i === 4 ? C.ink : hexA(C.bg, 0.85);
        ctx.fillRect(1440 + i * 64, 1000 - h * k, 46, h * k);
      });
      const ap = E.outCubic(prog(lt, 0.4, 0.8));
      ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.lineCap = 'round';
      strokePartial(ctx, [[1440, 900], [1530, 840], [1590, 860], [1700, 720], [1760, 650]], ap, 380);
    } else if (m === 'notes') {
      NOTES.forEach((n, i) => {
        const k = E.outBack(prog(lt, n.d * 0.6, n.d * 0.6 + 0.3));
        if (k <= 0) return;
        ctx.save(); ctx.translate(n.x, n.y + Math.sin(t * 3 + i) * 5); ctx.rotate(n.rot); ctx.scale(k, k);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-n.s / 2 + 6, -n.s / 2 + 8, n.s, n.s);
        ctx.fillStyle = n.col; ctx.fillRect(-n.s / 2, -n.s / 2, n.s, n.s);
        ctx.strokeStyle = hexA(C.bg, 0.4); ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(-n.s * 0.32, -n.s * 0.2 + l * n.s * 0.2); ctx.lineTo(n.s * (0.32 - (l === 2 ? 0.25 : 0)), -n.s * 0.2 + l * n.s * 0.2); ctx.stroke(); }
        ctx.restore();
      });
    } else if (m === 'table') {
      const cx = W / 2, cy = H / 2 + 40, rx = 640, ry = 210;
      ctx.strokeStyle = hexA(fg, 0.35); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + E.outCubic(prog(lt, 0, 0.45)) * Math.PI * 2); ctx.stroke();
      const seats = 10, pts = [];
      for (let i = 0; i < seats; i++) {
        const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
        pts.push([cx + Math.cos(a) * (rx + 70), cy + Math.sin(a) * (ry + 60)]);
      }
      const pairs = [[0, 4], [1, 6], [2, 8], [3, 7], [5, 9], [0, 6], [4, 9]];
      pairs.forEach(([a, b], i) => {
        const k = E.outCubic(prog(lt, 0.3 + i * 0.05, 0.6 + i * 0.05));
        if (k <= 0) return;
        ctx.strokeStyle = hexA(fg, 0.25); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(lerp(pts[a][0], pts[b][0], k), lerp(pts[a][1], pts[b][1], k)); ctx.stroke();
      });
      pts.forEach((q, i) => {
        const k = E.outBack(prog(lt, 0.1 + i * 0.035, 0.4 + i * 0.035));
        ctx.fillStyle = i % 3 === 0 ? C.ink : C.bg;
        ctx.beginPath(); ctx.arc(q[0], q[1], 24 * k, 0, 7); ctx.fill();
      });
    } else if (m === 'launch') {
      STREAKS.forEach(s => {
        const y = ((s.y * (H + 500) + lt * 2800) % (H + 500)) - 300;
        ctx.strokeStyle = hexA(C.bg, 0.28); ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x, y + s.len); ctx.stroke();
      });
      const br = prog(lt, 0, 0.6);
      ctx.strokeStyle = hexA(C.ink, 0.8 * (1 - br)); ctx.lineWidth = 20 * (1 - br);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 100 + E.outExpo(br) * 900, 0, 7); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const y = 360 - ((lt * 700 + i * 110) % 330);
        if (y < 130) continue;
        ctx.strokeStyle = hexA(C.bg, 0.9); ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(1640, y + 60); ctx.lineTo(1700, y); ctx.lineTo(1760, y + 60); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(160, y + 60 + 500); ctx.lineTo(220, y + 500); ctx.lineTo(280, y + 60 + 500); ctx.stroke();
      }
    } else if (m === 'confetti') {
      CONFETTI.forEach(c => {
        const tt = lt - c.d;
        if (tt <= 0) return;
        const drag = Math.exp(-1.6 * tt);
        const x = c.x + (c.vx * (1 - drag)) / 1.6;
        const y = c.y + (c.vy * (1 - drag)) / 1.6 + 620 * tt * tt;
        ctx.save(); ctx.translate(x, y); ctx.rotate(c.rot + c.vr * tt);
        ctx.scale(1, Math.cos(tt * 9 + c.rot));
        ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      });
    }
  }

  function sceneMontage(ctx, t) {
    if (t < 12 || t >= 18) return;
    if (t < 17) {
      const i = Math.min(4, Math.floor(t - 12)), lt = t - 12 - i, wd = WORDS[i];
      ctx.fillStyle = i === 0 ? C.coral : WORDS[i - 1].bg;
      ctx.fillRect(0, 0, W, H);
      const p = i === 0 ? 1 : E.outExpo(clamp(lt / 0.22));
      const dir = i % 2 ? -1 : 1, off = (1 - p) * (W + 700) * dir;
      ctx.fillStyle = wd.bg;
      ctx.beginPath();
      ctx.moveTo(off - 350, 0); ctx.lineTo(off + W + 350, 0); ctx.lineTo(off + W + 350 - 300 * dir, H); ctx.lineTo(off - 350 - 300 * dir, H);
      ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(off - 350, 0); ctx.lineTo(off + W + 350, 0); ctx.lineTo(off + W + 350 - 300 * dir, H); ctx.lineTo(off - 350 - 300 * dir, H);
      ctx.clip();
      motif(ctx, wd.m, lt, wd, t);
      const push = 1 + 0.045 * lt;
      ctx.translate(W / 2, H / 2); ctx.scale(push, push); ctx.translate(-W / 2, -H / 2);
      font(ctx, SANS, 250, 900, 'normal', -8);
      const fit = Math.min(250, (1560 / ctx.measureText(wd.w).width) * 250);
      revealText(ctx, wd.w, W / 2, H / 2 + fit * 0.3, lt, 0.04, { size: fit, weight: 900, spacing: -8 * (fit / 250), align: 'center', color: wd.fg, stagger: 0.022, dur: 0.38 });
      revealText(ctx, wd.sub, W / 2, H / 2 + fit * 0.3 + 115, lt, 0.24, { fam: SERIF, style: 'italic', weight: 400, size: 66, align: 'center', color: wd.fg, alpha: 0.85, stagger: 0.012, dur: 0.4 });
      ctx.restore();
      font(ctx, MONO, 22, 500, 'normal', 4);
      ctx.fillStyle = hexA(wd.fg, 0.75); ctx.textAlign = 'left';
      ctx.fillText(`0${i + 1} / 05`, 80, 90);
      ctx.textAlign = 'right';
      ctx.fillText('ONE CAMPUS. EVERY STAGE OF THE IDEA.', W - 80, 90);
    } else {
      const i = Math.min(3, Math.floor((t - 17) / 0.25)), lt = t - 17 - i * 0.25;
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      const e = E.outExpo(clamp(lt / 0.12));
      const dir = i % 2 ? -1 : 1;
      ctx.save();
      ctx.translate(W / 2 + (1 - e) * 60 * dir, H / 2 + 50);
      const sc = 1.1 - 0.1 * e; ctx.scale(sc, sc);
      font(ctx, SANS, 160, 900, 'normal', -5);
      ctx.fillStyle = C.ink; ctx.textAlign = 'center';
      ctx.fillText(STROBE[i], 0, 0);
      ctx.restore();
      const uw = E.outExpo(clamp(lt / 0.2)) * 520;
      ctx.fillStyle = [C.gold, C.coral, C.teal, C.violet][i];
      ctx.fillRect(W / 2 - uw / 2, H / 2 + 110, uw, 10);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k <= i ? C.gold : hexA(C.ink, 0.25);
        ctx.fillRect(W / 2 - 66 + k * 36, H - 120, 24, 6);
      }
    }
  }

  // 18–22 s · global teams, one Munich address.
  function sceneGlobe(ctx, t) {
    if (t < 18 || t >= 22.05) return;
    background(ctx, 10);
    const ent = E.outBack(prog(t, 18.0, 18.75));
    const rp = E.outCubic(prog(t, 18.0, 21.0));
    const lam = lerp(-75, MUC[1], rp) * D2R, phi = lerp(8, 40, rp) * D2R;
    let gx = W * 0.665, gy = H * 0.52, R = 400 * (0.55 + 0.45 * ent);

    const zp = prog(t, 21.35, 22.0);
    const muc = rotG(v3(MUC[0], MUC[1]), lam, phi);
    const mx = gx + muc[0] * R, my = gy - muc[1] * R;
    const zoom = Math.exp(E.inExpo(zp) * Math.log(40));

    ctx.save();
    const tx = lerp(mx, W / 2, E.inOutCubic(zp)), ty = lerp(my, H / 2, E.inOutCubic(zp));
    ctx.translate(tx, ty); ctx.scale(zoom, zoom); ctx.translate(-mx, -my);

    // atmosphere
    const at = ctx.createRadialGradient(gx, gy, R * 0.9, gx, gy, R * 1.35);
    at.addColorStop(0, hexA(C.teal, 0.22)); at.addColorStop(1, hexA(C.teal, 0));
    ctx.fillStyle = at; ctx.beginPath(); ctx.arc(gx, gy, R * 1.35, 0, 7); ctx.fill();
    const body = ctx.createRadialGradient(gx - R * 0.35, gy - R * 0.4, R * 0.1, gx, gy, R);
    body.addColorStop(0, '#1d2a55'); body.addColorStop(1, '#0b1024');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(gx, gy, R, 0, 7); ctx.fill();

    // graticule
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = hexA(C.ink, 0.1);
    const line = gen => { ctx.beginPath(); let on = false; for (let k = 0; k <= 72; k++) { const v = rotG(gen(k / 72), lam, phi); if (v[2] > 0) { const x = gx + v[0] * R, y = gy - v[1] * R; on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false; } ctx.stroke(); };
    for (let la = -60; la <= 60; la += 30) line(u => v3(la, -180 + u * 360));
    for (let lo = -180; lo < 180; lo += 30) line(u => v3(-90 + u * 180, lo));

    // dot sphere: land bright, ocean faint
    for (const q of SPHERE) {
      const v = rotG(q, lam, phi);
      if (v[2] <= 0) continue;
      const land = q[3];
      const s = (land ? 2.2 + 2.0 * v[2] : 1.1 + 0.6 * v[2]) / Math.sqrt(zoom);
      ctx.fillStyle = land ? `rgba(245,240,230,${0.25 + 0.7 * v[2]})` : `rgba(140,160,255,${0.05 + 0.12 * v[2]})`;
      ctx.fillRect(gx + v[0] * R - s / 2, gy - v[1] * R - s / 2, s, s);
    }

    // arcs to Munich
    const b = v3(MUC[0], MUC[1]);
    const arrivals = [];
    CITIES.forEach((c, i) => {
      const t0 = T.arcStart(i), a = v3(c[1], c[2]);
      const hp = E.inOutCubic(prog(t, t0, t0 + T.arcDur));
      if (hp <= 0) return;
      arrivals.push(t0 + T.arcDur);
      const om = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
      const col = [C.gold, C.teal, C.coral][i % 3];
      ctx.strokeStyle = hexA(col, hp >= 1 ? 0.55 : 0.95); ctx.lineWidth = 2.6 / Math.sqrt(zoom); ctx.lineCap = 'round';
      ctx.beginPath();
      let on = false, head = null;
      const N = 60;
      for (let k = 0; k <= N * hp; k++) {
        const s = k / N;
        const f1 = Math.sin((1 - s) * om) / Math.sin(om), f2 = Math.sin(s * om) / Math.sin(om);
        const lift = 1 + 0.32 * Math.sin(Math.PI * s) * (om / Math.PI) + 0.004;
        let v = [(a[0] * f1 + b[0] * f2) * lift, (a[1] * f1 + b[1] * f2) * lift, (a[2] * f1 + b[2] * f2) * lift];
        v = rotG(v, lam, phi);
        const vis = v[2] > 0 || v[0] * v[0] + v[1] * v[1] > 1;
        const x = gx + v[0] * R, y = gy - v[1] * R;
        if (vis) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; head = [x, y]; } else on = false;
      }
      ctx.stroke();
      if (head && hp < 1) {
        const g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 14);
        g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(head[0], head[1], 14, 0, 7); ctx.fill();
      }
      const cv = rotG(a, lam, phi);
      if (cv[2] > 0.05) {
        const x = gx + cv[0] * R, y = gy - cv[1] * R, k = E.outBack(prog(t, t0, t0 + 0.3));
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4.5 * k, 0, 7); ctx.fill();
        font(ctx, MONO, 16, 500, 'normal', 2);
        ctx.fillStyle = hexA(C.ink, 0.75 * clamp(cv[2] * 3) * (1 - zp)); ctx.textAlign = 'left';
        ctx.fillText(c[0], x + 9, y - 8);
      }
    });

    // Munich
    if (muc[2] > 0) {
      for (const ta of arrivals) {
        const rp2 = prog(t, ta, ta + 0.8);
        if (rp2 <= 0 || rp2 >= 1) continue;
        ctx.strokeStyle = hexA(C.gold, 0.8 * (1 - rp2)); ctx.lineWidth = 2 / Math.sqrt(zoom);
        ctx.beginPath(); ctx.arc(mx, my, 8 + 56 * E.outCubic(rp2), 0, 7); ctx.stroke();
      }
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 26);
      g.addColorStop(0, hexA(C.gold, 0.9)); g.addColorStop(1, hexA(C.gold, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(mx, my, 6, 0, 7); ctx.fill();
      const la = prog(t, 18.8, 19.3) * (1 - zp * 3);
      if (la > 0) {
        font(ctx, SERIF, 44, 400, 'italic');
        ctx.fillStyle = hexA(C.ink, la); ctx.textAlign = 'left';
        ctx.fillText('München', mx + 22, my + 54);
      }
    }
    ctx.restore();

    // copy
    ctx.save();
    ctx.globalAlpha = 1 - prog(t, 21.3, 21.6);
    revealText(ctx, 'Global teams.', 120, 440, t, 18.3, { size: 112, weight: 900, spacing: -4, stagger: 0.022 });
    revealText(ctx, 'One address.', 120, 565, t, 18.6, { fam: SERIF, style: 'italic', weight: 400, size: 128, color: C.gold, stagger: 0.022 });
    const rows = [['U2', 'Königsplatz — right at the door', 19.55], ['Hbf', 'Munich Central Station — 0.7 km', 19.85]];
    rows.forEach(([badge, txt, t0], i) => {
      const k = E.outExpo(prog(t, t0, t0 + 0.5));
      if (k <= 0) return;
      const y = 680 + i * 72;
      ctx.globalAlpha = (1 - prog(t, 21.3, 21.6)) * k;
      ctx.fillStyle = i === 0 ? C.teal : C.gold;
      const bw = i === 0 ? 62 : 74;
      ctx.beginPath(); ctx.roundRect(120 - (1 - k) * 30, y - 34, bw, 44, 8); ctx.fill();
      font(ctx, SANS, 24, 800, 'normal', 0);
      ctx.fillStyle = C.bg; ctx.textAlign = 'center';
      ctx.fillText(badge, 120 + bw / 2 - (1 - k) * 30, y - 4);
      font(ctx, SANS, 32, 500, 'normal', 0);
      ctx.fillStyle = hexA(C.ink, 0.85); ctx.textAlign = 'left';
      ctx.fillText(txt, 120 + bw + 22, y - 2);
    });
    ctx.restore();

    // iris to dusk
    const ir = prog(t, 21.7, 22.0);
    if (ir > 0) {
      const r = E.inCubic(ir) * 1300;
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(1, r));
      g.addColorStop(0, '#FFE1A6'); g.addColorStop(0.6, '#F7B358'); g.addColorStop(1, '#E2566A');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, 7); ctx.fill();
    }
  }

  // 22–26 s · rooftop at dusk.
  function onionTower(ctx, x, w, top, base) {
    ctx.rect(x, top, w, base - top);
    ctx.moveTo(x - 2, top);
    ctx.bezierCurveTo(x - 8, top - w * 0.55, x + w * 0.2, top - w * 0.9, x + w / 2, top - w * 1.25);
    ctx.bezierCurveTo(x + w * 0.8, top - w * 0.9, x + w + 8, top - w * 0.55, x + w + 2, top);
    ctx.closePath();
    ctx.rect(x + w / 2 - 3, top - w * 1.25 - 26, 6, 28);
  }
  function wineGlass(ctx, x, y, rot, fillCol) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1.25, 1.25);
    const bowl = new Path2D();
    bowl.moveTo(-48, -230); bowl.bezierCurveTo(-56, -150, -40, -110, 0, -104);
    bowl.bezierCurveTo(40, -110, 56, -150, 48, -230); bowl.closePath();
    ctx.save(); ctx.clip(bowl);
    const lg = ctx.createLinearGradient(0, -180, 0, -100);
    lg.addColorStop(0, '#FFD27A'); lg.addColorStop(1, fillCol);
    ctx.fillStyle = lg; ctx.fillRect(-70, -176 + Math.sin(rot * 20) * 4, 140, 100);
    ctx.restore();
    ctx.strokeStyle = hexA(C.ink, 0.9); ctx.lineWidth = 3.5;
    ctx.stroke(bowl);
    ctx.beginPath(); ctx.moveTo(0, -104); ctx.lineTo(0, -12); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -8, 34, 7, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-34, -210); ctx.quadraticCurveTo(-38, -160, -24, -132); ctx.stroke();
    ctx.restore();
  }

  function sceneDusk(ctx, t) {
    if (t < 22 || t >= 26.05) return;
    const lt = t - 22, hz = 830;
    const zoom = 1 + 0.05 * E.inCubic(prog(t, 24.8, 26));
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);

    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#140F33'); sky.addColorStop(0.45, '#4B2465'); sky.addColorStop(0.75, '#D9506A'); sky.addColorStop(1, '#F7B358');
    ctx.fillStyle = sky; ctx.fillRect(-100, -100, W + 200, H + 200);
    // stars
    for (const s of STARS) {
      const a = prog(lt, 0.3 + s.d * 1.5, 1.2 + s.d * 1.5) * (0.5 + 0.5 * Math.sin(t * 3 + s.ph)) * (1 - s.y / (H * 0.6));
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(255,248,230,${a})`; ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    // sun
    const sy = hz - 40 + lt * 14, sx = W * 0.71;
    const glow = ctx.createRadialGradient(sx, sy, 20, sx, sy, 520);
    glow.addColorStop(0, 'rgba(255,215,140,0.65)'); glow.addColorStop(1, 'rgba(255,140,100,0)');
    ctx.fillStyle = glow; ctx.fillRect(sx - 520, sy - 520, 1040, 1040);
    const sg = ctx.createLinearGradient(0, sy - 120, 0, sy + 120);
    sg.addColorStop(0, '#FFE4A8'); sg.addColorStop(1, '#FF7E5A');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 118, 0, 7); ctx.fill();

    // back skyline (+ Olympiaturm)
    ctx.save(); ctx.translate(-lt * 10, 0);
    ctx.fillStyle = '#5A2A62';
    ctx.beginPath();
    for (const b of SKY_BACK) {
      ctx.rect(b.x, hz - b.h, b.w - 4, b.h + 10);
      if (b.gable) { ctx.moveTo(b.x, hz - b.h); ctx.lineTo(b.x + b.w / 2, hz - b.h - 34); ctx.lineTo(b.x + b.w - 4, hz - b.h); }
    }
    const ox = 330;
    ctx.moveTo(ox - 12, hz); ctx.lineTo(ox - 5, hz - 420); ctx.lineTo(ox + 5, hz - 420); ctx.lineTo(ox + 12, hz);
    ctx.ellipse(ox, hz - 330, 34, 12, 0, 0, 7);
    ctx.rect(ox - 26, hz - 352, 52, 18);
    ctx.rect(ox - 2, hz - 520, 4, 110);
    ctx.fill();
    ctx.restore();

    // mid skyline: Theatinerkirche + Frauenkirche
    ctx.save(); ctx.translate(-lt * 20, 0);
    ctx.fillStyle = '#331A45';
    ctx.beginPath();
    for (const b of SKY_MID) {
      ctx.rect(b.x, hz - b.h, b.w, b.h + 10);
      if (b.gable) { ctx.moveTo(b.x, hz - b.h); ctx.lineTo(b.x + b.w / 2, hz - b.h - 40); ctx.lineTo(b.x + b.w, hz - b.h); }
    }
    const th = 640;
    onionTower(ctx, th - 120, 46, hz - 230, hz);
    onionTower(ctx, th + 74, 46, hz - 230, hz);
    ctx.rect(th - 80, hz - 150, 160, 150);
    ctx.moveTo(th - 60, hz - 150); ctx.arc(th, hz - 170, 60, Math.PI, 0); ctx.rect(th - 66, hz - 175, 132, 30);
    ctx.rect(th - 6, hz - 270, 12, 45);
    const fk = 1180;
    ctx.rect(fk - 150, hz - 150, 300, 150);
    ctx.moveTo(fk - 150, hz - 150); ctx.lineTo(fk, hz - 255); ctx.lineTo(fk + 150, hz - 150);
    onionTower(ctx, fk - 128, 72, hz - 320, hz);
    onionTower(ctx, fk + 56, 72, hz - 320, hz);
    ctx.fill();
    // city lights
    const r = mulberry32(5);
    for (let i = 0; i < 70; i++) {
      const x = r() * (W + 400) - 100, y = hz - 10 - r() * 80, on = lt > 0.5 + r() * 2;
      if (on) { ctx.fillStyle = hexA(C.gold, 0.55 + 0.3 * r()); ctx.fillRect(x, y, 3, 3); }
    }
    ctx.restore();

    // terrace foreground
    ctx.save(); ctx.translate(-lt * 34, 0);
    const fl = ctx.createLinearGradient(0, 905, 0, H);
    fl.addColorStop(0, '#1A0F26'); fl.addColorStop(1, '#09060f');
    ctx.fillStyle = '#140B1E'; ctx.fillRect(-200, hz, W + 600, H);
    ctx.fillStyle = fl; ctx.fillRect(-200, 960, W + 600, H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-200, 900, W + 600, 6);
    ctx.fillStyle = '#0d0815';
    ctx.fillRect(-200, 896, W + 600, 8);
    for (let x = -200; x < W + 400; x += 120) ctx.fillRect(x, 896, 7, 70);
    // planters
    for (const px of [140, 1820]) {
      ctx.fillStyle = '#0d0815';
      ctx.beginPath(); ctx.moveTo(px - 70, 960); ctx.lineTo(px + 70, 960); ctx.lineTo(px + 55, 1060); ctx.lineTo(px - 55, 1060); ctx.fill();
      ctx.fillStyle = '#1d3a35';
      for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(px - 50 + k * 17, 900 - (k % 3) * 40, 20, 70, (k - 3) * 0.25, 0, 7); ctx.fill(); }
    }
    // string lights
    const poles = [-60, 620, 1300, 1980, 2660];
    poles.forEach(x => { ctx.fillStyle = '#0d0815'; ctx.fillRect(x - 4, 520, 8, 400); });
    let bi = 0;
    for (let s = 0; s < poles.length - 1; s++) {
      const x0 = poles[s], x1 = poles[s + 1];
      const sway = Math.sin(t * 1.4 + s) * 8;
      ctx.strokeStyle = 'rgba(20,12,30,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) { const u = k / 30; const x = lerp(x0, x1, u), y = 530 + 130 * 4 * u * (1 - u) + sway * Math.sin(Math.PI * u); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      for (let k = 1; k < 14; k++) {
        const u = k / 14, x = lerp(x0, x1, u), y = 534 + 130 * 4 * u * (1 - u) + sway * Math.sin(Math.PI * u);
        const on = clamp((t - (T.lights + bi * 0.022)) * 8);
        bi++;
        if (on > 0) {
          const g = ctx.createRadialGradient(x, y + 6, 0, x, y + 6, 30);
          g.addColorStop(0, `rgba(255,214,140,${0.55 * on})`); g.addColorStop(1, 'rgba(255,180,90,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 30, y - 24, 60, 60);
        }
        ctx.fillStyle = on > 0 ? `rgba(255,236,190,${0.4 + 0.6 * on})` : '#2a1c38';
        ctx.beginPath(); ctx.ellipse(x, y + 6, 4.5, 6, 0, 0, 7); ctx.fill();
      }
    }
    ctx.restore();

    // glasses + clink
    const enter = E.outCubic(prog(t, 22.5, 23.4));
    const tc = T.clink;
    const toward = E.inCubic(prog(t, tc - 0.32, tc)) - 0.35 * E.outCubic(prog(t, tc, tc + 0.35)) * (t > tc ? 1 : 0);
    const gyy = 1000 + (1 - enter) * 420;
    wineGlass(ctx, 870 + 18 * toward, gyy, 0.08 * toward, '#F3B54A');
    wineGlass(ctx, 1070 - 18 * toward, gyy, -0.08 * toward, '#FF8A5B');
    const sp = prog(t, tc, tc + 0.6);
    if (sp > 0 && sp < 1) {
      const cx = 970, cy = gyy - 285;
      ctx.strokeStyle = `rgba(255,244,214,${1 - sp})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r0 = 20 + 60 * E.outExpo(sp), r1 = r0 + 30 * (1 - sp);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
      }
    }

    // copy
    const words = [['Rooftop.', 22.4], ['Courtyard.', 22.75], ['Café.', 23.1]];
    let xx = 130;
    for (const [w, t0] of words) { xx += revealText(ctx, w, xx, 230, t, t0, { size: 64, weight: 800, spacing: -1, stagger: 0.018 }) + 26; }
    revealText(ctx, 'From first draft', 130, 380, t, 23.7, { fam: SERIF, style: 'italic', weight: 400, size: 124, stagger: 0.02 });
    revealText(ctx, 'to final toast.', 130, 500, t, 24.05, { fam: SERIF, style: 'italic', weight: 400, size: 124, color: '#FFD27A', stagger: 0.02 });
    ctx.restore();

    // dusk deepens + flash out
    ctx.fillStyle = `rgba(10,13,24,${0.22 * prog(t, 23, 26)})`; ctx.fillRect(0, 0, W, H);
    const fo = prog(t, 25.82, 26.0);
    if (fo > 0) { ctx.fillStyle = `rgba(255,246,228,${E.inCubic(fo)})`; ctx.fillRect(0, 0, W, H); }
  }

  // 26–30 s · end card.
  function sceneEnd(ctx, t) {
    if (t < 26) return;
    background(ctx, 10);
    const g = ctx.createRadialGradient(W / 2, 470, 10, W / 2, 470, 900);
    g.addColorStop(0, hexA(C.gold, 0.13 * prog(t, 26, 27))); g.addColorStop(1, hexA(C.gold, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const d of DUST) {
      const y = (((d.y - (t - 26) * d.v) % H) + H) % H;
      ctx.fillStyle = hexA(C.gold, 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + d.ph)) * prog(t, 26.2, 27));
      ctx.beginPath(); ctx.arc(d.x + Math.sin(t + d.ph) * 10, y, d.s, 0, 7); ctx.fill();
    }

    // emblem: four blocks around a courtyard (45 a–d)
    font(ctx, SANS, 118, 700, 'normal', -3);
    const wm = 'Design Offices', ww = ctx.measureText(wm).width;
    const emS = 54, gap = 14, emW = emS * 2 + gap;
    const total = emW + 46 + ww, x0 = W / 2 - total / 2, cy = 470;
    const from = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([i, j], k) => {
      const e = E.outExpo(prog(t, 26.0 + k * 0.07, 26.6 + k * 0.07));
      const x = x0 + i * (emS + gap) + (1 - e) * from[k][0] * 700;
      const y = cy - emW / 2 - 12 + j * (emS + gap) + (1 - e) * from[k][1] * 500;
      ctx.save(); ctx.translate(x + emS / 2, y + emS / 2); ctx.rotate((1 - e) * 2 * from[k][0]);
      ctx.fillStyle = k === 1 ? C.gold : C.ink;
      ctx.fillRect(-emS / 2, -emS / 2, emS, emS);
      ctx.restore();
    });
    const cg = prog(t, 26.55, 27.0);
    if (cg > 0) {
      const ccx = x0 + emW / 2, ccy = cy - 12;
      const gg = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, 40);
      gg.addColorStop(0, hexA(C.teal, 0.9 * cg)); gg.addColorStop(1, hexA(C.teal, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ccx, ccy, 40, 0, 7); ctx.fill();
    }
    revealText(ctx, wm, x0 + emW + 46, cy + 30, t, 26.3, { size: 118, weight: 700, spacing: -3, stagger: 0.025 });
    revealText(ctx, 'Munich Campus Königsplatz', W / 2, cy + 120, t, 26.75, { fam: SERIF, style: 'italic', weight: 400, size: 70, color: C.gold, align: 'center', stagger: 0.015 });
    const lw = E.inOutCubic(prog(t, 27.0, 27.6)) * 760;
    ctx.fillStyle = hexA(C.ink, 0.3); ctx.fillRect(W / 2 - lw / 2, cy + 165, lw, 2);
    revealText(ctx, 'BRIENNER STR. 45 A–D  ·  80333 MÜNCHEN', W / 2, cy + 225, t, 27.2, { fam: MONO, size: 26, weight: 500, spacing: 5, align: 'center', color: hexA(C.ink, 0.8), stagger: 0.008, dur: 0.4 });
    revealText(ctx, 'designoffices.de', W / 2, cy + 290, t, 27.4, { size: 40, weight: 600, align: 'center', color: C.ink, stagger: 0.012 });
    revealText(ctx, 'Big ideas need room. We have 18,000 m² of it.', W / 2, 940, t, 27.9, { fam: SERIF, style: 'italic', weight: 400, size: 48, align: 'center', color: hexA(C.ink, 0.75), stagger: 0.008, dur: 0.5 });
  }

  function fx(ctx, t) {
    // drop: shockwave, sparks, flash
    if (t >= 4.0 && t < 5.6) {
      const dt = t - 4.0;
      const k = prog(t, 4.0, 4.7);
      ctx.strokeStyle = hexA(C.ink, 0.8 * (1 - k)); ctx.lineWidth = 40 * (1 - k);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, E.outExpo(k) * 1300, 0, 7); ctx.stroke();
      ctx.lineCap = 'round';
      for (const s of SPARKS) {
        if (dt > s.life) continue;
        const d = (s.sp * (1 - Math.exp(-3 * dt))) / 3;
        const x = W / 2 + Math.cos(s.a) * d, y = H / 2 + Math.sin(s.a) * d + 120 * dt * dt;
        const a = 1 - dt / s.life;
        ctx.strokeStyle = hexA(s.col, a); ctx.lineWidth = s.w;
        const tl = s.len * Math.exp(-3 * dt);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(s.a) * tl, y - Math.sin(s.a) * tl); ctx.stroke();
      }
      const f = 1 - prog(t, 4.0, 4.22);
      if (f > 0) { ctx.fillStyle = `rgba(255,248,235,${f * f * f})`; ctx.fillRect(0, 0, W, H); }
    }
    // small flash on the end-card hit
    if (t >= 26 && t < 26.4) { ctx.fillStyle = `rgba(255,246,228,${1 - E.outCubic(prog(t, 26, 26.4))})`; ctx.fillRect(0, 0, W, H); }
    // flash into the dusk
    if (t >= 22 && t < 22.2) { ctx.fillStyle = `rgba(255,236,200,${0.5 * Math.pow(1 - prog(t, 22, 22.2), 2)})`; ctx.fillRect(0, 0, W, H); }
  }

  function post(ctx, t) {
    if (!GRAIN) GRAIN = makeGrain();
    if (GRAIN.length) {
      const tile = GRAIN[Math.floor(t * 24) % 4];
      ctx.save(); ctx.globalCompositeOperation = 'overlay';
      for (let y = 0; y < H; y += 256) for (let x = 0; x < W; x += 256) ctx.drawImage(tile, x, y);
      ctx.restore();
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const fin = prog(t, 29.3, 30) + (1 - prog(t, 0, 0.35));
    if (fin > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp(fin)})`; ctx.fillRect(0, 0, W, H); }
  }

  function draw(ctx, t) {
    t = clamp(t, 0, DUR);
    ctx.save();
    ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    background(ctx, t);
    sceneIntro(ctx, t);
    sceneCampus(ctx, t);
    sceneKoenigsplatz(ctx, t);
    wipe(ctx, t, T.wipe1, C.gold, C.coral);
    sceneMontage(ctx, t);
    sceneGlobe(ctx, t);
    sceneDusk(ctx, t);
    sceneEnd(ctx, t);
    fx(ctx, t);
    post(ctx, t);
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════ AUDIO ══
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const CH = {
    Am: { pad: [57, 60, 64, 67], bass: 33, arp: [57, 60, 64, 69, 72, 76] },
    F: { pad: [53, 57, 60, 64], bass: 29, arp: [53, 57, 60, 65, 69, 72] },
    C: { pad: [55, 60, 64, 67], bass: 36, arp: [55, 60, 64, 67, 72, 76] },
    G: { pad: [55, 59, 62, 67], bass: 31, arp: [55, 59, 62, 67, 71, 74] },
    Cmaj9: { pad: [48, 55, 59, 62, 64, 71], bass: 36, arp: [60, 64, 67, 71, 74, 79] },
  };
  const chordAt = t => {
    const bar = Math.floor(t / BAR);
    if (bar < 12) return ['Am', 'F', 'C', 'G'][bar % 4];
    if (bar === 12) return t < 25 ? 'F' : 'G';
    return 'Cmaj9';
  };

  /** Schedules the whole soundtrack on any BaseAudioContext, starting at 0. */
  function buildAudio(ac) {
    const sr = ac.sampleRate;
    const rnd = mulberry32(2024);

    const master = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
    const hpf = ac.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 32; hpf.Q.value = 0.7;
    master.connect(hpf); hpf.connect(comp); comp.connect(limiter); limiter.connect(ac.destination);
    master.gain.setValueAtTime(0.6, 0);
    master.gain.setValueAtTime(0.6, 28.4);
    master.gain.linearRampToValueAtTime(0.0, 29.95);

    // reverb (synthetic impulse response)
    const ir = ac.createBuffer(2, Math.floor(sr * 3.2), sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch), r = mulberry32(31 + ch);
      for (let i = 0; i < d.length; i++) { const x = i / d.length; d[i] = (r() * 2 - 1) * Math.pow(1 - x, 3.4) * (i < sr * 0.012 ? i / (sr * 0.012) : 1); }
    }
    const verb = ac.createConvolver(); verb.buffer = ir;
    const verbIn = ac.createGain(); const verbOut = ac.createGain(); verbOut.gain.value = 0.55;
    verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(master);

    // dotted-eighth delay
    const dly = ac.createDelay(2); dly.delayTime.value = BEAT * 0.75;
    const fb = ac.createGain(); fb.gain.value = 0.36;
    const dlpf = ac.createBiquadFilter(); dlpf.type = 'lowpass'; dlpf.frequency.value = 3000;
    const dlyIn = ac.createGain(); const dlyOut = ac.createGain(); dlyOut.gain.value = 0.5;
    dlyIn.connect(dly); dly.connect(dlpf); dlpf.connect(fb); fb.connect(dly); dlpf.connect(dlyOut); dlyOut.connect(master); dlyOut.connect(verbIn);

    const bus = (g, dest = master) => { const n = ac.createGain(); n.gain.value = g; n.connect(dest); return n; };
    const drums = bus(0.9);
    const duck = bus(1);
    const music = bus(0.62, duck);
    const sfx = bus(0.8);

    const noiseBuf = ac.createBuffer(1, sr * 2, sr);
    { const d = noiseBuf.getChannelData(0), r = mulberry32(99); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }

    const env = (param, t, a, peak, d, floor = 0.0001) => {
      param.setValueAtTime(floor, t);
      param.linearRampToValueAtTime(peak, t + a);
      param.exponentialRampToValueAtTime(floor, t + a + d);
    };
    const osc = (type, f, t, stop) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o; };
    const noise = (t, stop) => { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, rnd() * 1.5); s.stop(stop); return s; };
    const filt = (type, f, q = 1) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gainN = () => { const g = ac.createGain(); g.gain.value = 0; return g; };
    const panN = p => { const s = ac.createStereoPanner(); s.pan.value = p; return s; };
    const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };

    // ── drums ──
    const kicks = [];
    function kick(t, v = 1) {
      kicks.push(t);
      const o = osc('sine', 160, t, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
      const g = gainN(); env(g.gain, t, 0.002, v, 0.44);
      chain(o, g, drums);
      const n = noise(t, t + 0.03), ng = gainN(); env(ng.gain, t, 0.001, 0.22 * v, 0.018);
      chain(n, filt('highpass', 2500), ng, drums);
    }
    function clap(t, v = 1) {
      const n = noise(t, t + 0.4), g = gainN();
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.011, 0.022].forEach(o => { g.gain.setValueAtTime(0.55 * v, t + o); g.gain.exponentialRampToValueAtTime(0.06 * v, t + o + 0.01); });
      g.gain.setValueAtTime(0.5 * v, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      const out = chain(n, filt('bandpass', 1400, 1.1), g);
      out.connect(drums);
      const s = ac.createGain(); s.gain.value = 0.35; out.connect(s); s.connect(verbIn);
    }
    function snare(t, v = 1) {
      const n = noise(t, t + 0.2), g = gainN(); env(g.gain, t, 0.001, 0.45 * v, 0.13);
      chain(n, filt('bandpass', 2300, 0.8), g, drums);
      const o = osc('triangle', 190, t, t + 0.12); const og = gainN(); env(og.gain, t, 0.001, 0.3 * v, 0.08);
      chain(o, og, drums);
      const s = ac.createGain(); s.gain.value = 0.2; g.connect(s); s.connect(verbIn);
    }
    function hat(t, v = 1, open = false) {
      const n = noise(t, t + 0.3), g = gainN(); env(g.gain, t, 0.001, 0.16 * v, open ? 0.22 : 0.035);
      chain(n, filt('highpass', 7800), panN((rnd() - 0.5) * 0.5), g, drums);
    }
    function crash(t, v = 1) {
      const n = noise(t, t + 2.4), g = gainN(); env(g.gain, t, 0.002, 0.22 * v, 2.2);
      const out = chain(n, filt('highpass', 4500), g);
      out.connect(drums);
      const s = ac.createGain(); s.gain.value = 0.4; out.connect(s); s.connect(verbIn);
    }

    // ── tonal ──
    function bass(t, m, dur, v = 1) {
      const f = mtof(m + 12);
      const o1 = osc('sawtooth', f, t, t + dur + 0.05), o2 = osc('sine', mtof(m), t, t + dur + 0.05);
      const lp = filt('lowpass', 900, 5);
      lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.16);
      const g = gainN();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32 * v, t + 0.006);
      g.gain.setValueAtTime(0.32 * v, t + dur - 0.03); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const g2 = gainN(); g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(0.3 * v, t + 0.006);
      g2.gain.setValueAtTime(0.3 * v, t + dur - 0.03); g2.gain.linearRampToValueAtTime(0.0001, t + dur);
      chain(o1, lp, g, music); chain(o2, g2, music);
    }
    function pad(t, notes, dur, v = 1, cut = 2000) {
      const lp = filt('lowpass', cut * 0.4, 0.7);
      lp.frequency.setValueAtTime(cut * 0.4, t); lp.frequency.exponentialRampToValueAtTime(cut, t + Math.min(1.2, dur));
      const g = gainN();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2 * v / Math.sqrt(notes.length), t + 0.35);
      g.gain.setValueAtTime(0.2 * v / Math.sqrt(notes.length), t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
      g.connect(music);
      const s = ac.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(verbIn);
      lp.connect(g);
      notes.forEach((m, i) => {
        [-8, 7].forEach((det, j) => {
          const o = osc('sawtooth', mtof(m), t, t + dur + 1);
          o.detune.value = det;
          chain(o, panN(j ? 0.35 : -0.35), lp);
        });
      });
    }
    function pluck(t, m, v = 1, pan = 0) {
      const o = osc('square', mtof(m), t, t + 0.5);
      const lp = filt('lowpass', 4000, 6);
      lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
      const g = gainN(); env(g.gain, t, 0.003, 0.11 * v, 0.32);
      const out = chain(o, lp, panN(pan), g);
      out.connect(music);
      const d = ac.createGain(); d.gain.value = 0.5; out.connect(d); d.connect(dlyIn);
      const r = ac.createGain(); r.gain.value = 0.3; out.connect(r); r.connect(verbIn);
    }
    function stab(t, notes, v = 1, dur = 0.45) {
      const lp = filt('lowpass', 5000, 2);
      lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      const g = gainN(); env(g.gain, t, 0.004, 0.22 * v, dur);
      lp.connect(g); g.connect(music);
      const s = ac.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(verbIn);
      const d = ac.createGain(); d.gain.value = 0.25; g.connect(d); d.connect(dlyIn);
      notes.forEach(m => [-10, 10].forEach(det => { const o = osc('sawtooth', mtof(m + 12), t, t + dur + 0.1); o.detune.value = det; o.connect(lp); }));
    }
    function bell(t, m, v = 1, dest = sfx, dur = 1.6) {
      const f = mtof(m);
      [[1, 1], [2, 0.32], [3.01, 0.14], [4.2, 0.06]].forEach(([r, a]) => {
        const o = osc('sine', f * r, t, t + dur + 0.1); const g = gainN(); env(g.gain, t, 0.002, 0.16 * v * a, dur / r);
        chain(o, g, dest);
        const s = ac.createGain(); s.gain.value = 0.7; g.connect(s); s.connect(verbIn);
      });
    }

    // ── sfx ──
    function typeClick(t, big = false) {
      const n = noise(t, t + 0.06), g = gainN(); env(g.gain, t, 0.001, big ? 0.5 : 0.38, 0.03);
      chain(n, filt('bandpass', 2600 + rnd() * 2200, 2.5), panN((rnd() - 0.5) * 0.3), g, sfx);
      const o = osc('sine', big ? 140 : 180 + rnd() * 40, t, t + 0.06), og = gainN(); env(og.gain, t, 0.001, 0.3, 0.035);
      chain(o, og, sfx);
    }
    function riser(t0, t1, v = 1) {
      const n = noise(t0, t1 + 0.02);
      const bp = filt('bandpass', 300, 2.2);
      bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(7500, t1);
      const g = gainN(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5 * v, t1 - 0.01); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.015);
      const out = chain(n, bp, g); out.connect(sfx);
      const s = ac.createGain(); s.gain.value = 0.5; out.connect(s); s.connect(verbIn);
      const o = osc('sawtooth', 110, t0, t1 + 0.02); o.frequency.exponentialRampToValueAtTime(880, t1);
      const og = gainN(); og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.09 * v, t1 - 0.01); og.gain.linearRampToValueAtTime(0.0001, t1 + 0.015);
      chain(o, filt('lowpass', 2500), og, sfx);
    }
    function impact(t, v = 1) {
      const o = osc('sine', 75, t, t + 2); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
      const g = gainN(); env(g.gain, t, 0.003, 0.9 * v, 1.7); chain(o, g, sfx);
      const n = noise(t, t + 1.4), ng = gainN(); env(ng.gain, t, 0.002, 0.5 * v, 1.1);
      const out = chain(n, filt('lowpass', 900, 0.7), ng); out.connect(sfx);
      const s = ac.createGain(); s.gain.value = 0.8; out.connect(s); s.connect(verbIn);
    }
    function whoosh(t, dur, v = 1, p0 = -0.8, p1 = 0.8) {
      const n = noise(t, t + dur + 0.05);
      const bp = filt('bandpass', 400, 1.3);
      bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(2800, t + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(500, t + dur);
      const pn = panN(p0); pn.pan.setValueAtTime(p0, t); pn.pan.linearRampToValueAtTime(p1, t + dur);
      const g = gainN(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * v, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const out = chain(n, bp, pn, g); out.connect(sfx);
      const s = ac.createGain(); s.gain.value = 0.3; out.connect(s); s.connect(verbIn);
    }
    function swish(t, v = 1) {
      const n = noise(t, t + 0.15), bp = filt('bandpass', 2000, 1.5);
      bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(9000, t + 0.1);
      const g = gainN(); env(g.gain, t, 0.015, 0.35 * v, 0.09);
      chain(n, bp, g, sfx);
    }
    function tick(t, f = 2200, v = 1) {
      const o = osc('square', f, t, t + 0.03), g = gainN(); env(g.gain, t, 0.001, 0.05 * v, 0.02);
      chain(o, filt('lowpass', 6000), g, sfx);
    }
    function pop(t, v = 1) {
      const o = osc('sine', 200, t, t + 0.2); o.frequency.exponentialRampToValueAtTime(720, t + 0.08);
      const g = gainN(); env(g.gain, t, 0.002, 0.35 * v, 0.12); chain(o, g, sfx);
      const o2 = osc('sine', 110, t, t + 0.25); o2.frequency.exponentialRampToValueAtTime(45, t + 0.2);
      const g2 = gainN(); env(g2.gain, t, 0.002, 0.6 * v, 0.2); chain(o2, g2, sfx);
    }
    function scribble(t0, t1, v = 1) {
      const n = noise(t0, t1 + 0.05), bp = filt('bandpass', 2600, 0.9), g = gainN();
      g.gain.setValueAtTime(0.0001, t0);
      for (let t = t0; t < t1; t += 0.045) g.gain.linearRampToValueAtTime((0.03 + rnd() * 0.07) * v, t);
      g.gain.linearRampToValueAtTime(0.0001, t1 + 0.04);
      chain(n, bp, g, sfx);
    }
    function clink(t) {
      [2093, 3136, 4186, 5274, 6645, 8020].forEach((f, i) => {
        [0, 0.035].forEach((o, j) => {
          const os = osc('sine', f * (1 + (rnd() - 0.5) * 0.01), t + o, t + o + 1.4), g = gainN();
          env(g.gain, t + o, 0.001, (j ? 0.03 : 0.08) / (1 + i * 0.3), 1.2 / (1 + i * 0.4));
          chain(os, g, sfx);
          const s = ac.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(verbIn);
        });
      });
    }
    function tension(t0, t1) {
      const lp = filt('lowpass', 200, 3);
      lp.frequency.setValueAtTime(200, t0); lp.frequency.exponentialRampToValueAtTime(1800, t1);
      const g = gainN(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t1 - 0.02); g.gain.linearRampToValueAtTime(0.0001, t1);
      [55, 58.3, 82.4].forEach(f => { const o = osc('sawtooth', f, t0, t1 + 0.02); o.frequency.exponentialRampToValueAtTime(f * 1.5, t1); o.connect(lp); });
      chain(lp, g, sfx);
    }

    // ═════════════ arrangement ═════════════
    // intro: warm pad, a heartbeat, typing
    pad(0.0, CH.Am.pad, 1.9, 0.75, 900);
    pad(2.0, CH.F.pad, 1.9, 0.85, 1300);
    [0.0, 1.0, 2.0, 2.5].forEach(t => kick(t, 0.35));
    T.type1.forEach((t, i) => typeClick(t, i === 3));
    T.type2.forEach((t, i) => typeClick(t, i === 4));
    bell(1.62, 76, 0.35); bell(3.0, 81, 0.25);
    scribble(2.9, 3.3, 1.2);
    tension(3.0, 3.97);
    riser(2.3, 3.97, 0.9);
    for (let t = 3.0; t < 3.97;) { const k = prog(t, 3.0, 3.97); snare(t, 0.3 + 0.7 * k); t += k < 0.5 ? BEAT / 4 : BEAT / 8; }

    // the drop
    impact(4.0, 1.0); crash(4.0, 1.2);

    // groove 4–22 s
    for (let t = 4.0; t < 22 - 1e-6; t += BEAT) {
      kick(t, 1);
      hat(t + BEAT / 2, 0.9, Math.floor((t - 4) / BEAT) % 4 === 3);
      if (t >= 12) { hat(t + BEAT / 4, 0.4); hat(t + (3 * BEAT) / 4, 0.4); }
      const beatInBar = Math.round((t % BAR) / BEAT);
      if (t >= 8 && (beatInBar === 1 || beatInBar === 3)) clap(t, 0.9);
    }
    const bassPat = [0, 0, 12, 0, 0, 12, 0, 7];
    for (let t = 4.0; t < 22 - 1e-6; t += BEAT / 2) {
      const step = Math.round((t % BAR) / (BEAT / 2));
      bass(t, CH[chordAt(t)].bass + bassPat[step], BEAT / 2 - 0.02, step % 2 ? 0.75 : 1);
    }
    for (let bar = 2; bar < 11; bar++) { const t = bar * BAR, ch = CH[chordAt(t)]; pad(t, ch.pad, BAR - 0.1, 0.85, 2400); }
    const arpPat = [0, 2, 4, 2, 1, 3, 5, 3];
    for (let t = 8.0; t < 26 - 1e-6; t += BEAT / 4) {
      const s = Math.round(t / (BEAT / 4));
      const ch = CH[chordAt(t)];
      const m = ch.arp[arpPat[s % 8]];
      const quiet = t >= 22 ? 0.75 : 1;
      if (t >= 25.5) continue;
      pluck(t, m, quiet * (s % 4 === 0 ? 1 : 0.7), Math.sin(s * 0.7) * 0.5);
    }

    // scene SFX
    T.blocks.forEach((t, i) => pop(t, 0.9 + i * 0.05));
    T.ticks.forEach((t, i) => tick(t, 1800 + i * 40, 1));
    bell(6.8, 88, 0.45);
    [6.3, 6.45, 6.6].forEach((t, i) => bell(t, 84 + i * 3, 0.18));
    whoosh(7.6, 0.75, 1.1, -0.9, 0.9);
    bell(8.05, 69, 0.4); bell(8.05, 76, 0.3);
    scribble(8.1, 10.5, 0.9);
    T.pins.forEach((t, i) => bell(t, [81, 84, 88, 91][i], 0.35));
    riser(11.1, 11.95, 0.8);
    whoosh(11.3, 0.7, 1.0, 0, 0);

    // montage hits
    T.words.forEach((t, i) => {
      if (i > 0) whoosh(t - 0.18, 0.26, 0.9, i % 2 ? 0.8 : -0.8, i % 2 ? -0.8 : 0.8);
      stab(t, CH[chordAt(t)].pad, 1.0);
      if (i === 0) { crash(t, 0.9); impact(t, 0.55); }
    });
    // confetti pops for CELEBRATE
    for (let k = 0; k < 10; k++) { const t = 16.02 + k * 0.035; const o = osc('triangle', 600 + rnd() * 900, t, t + 0.05), g = gainN(); env(g.gain, t, 0.001, 0.05, 0.04); chain(o, g, sfx); }
    T.strobe.forEach(t => { swish(t - 0.02, 1); stab(t, CH.G.pad, 0.7, 0.18); });

    // globe
    impact(18.0, 0.45); crash(18.0, 0.6);
    CITIES.forEach((c, i) => {
      const t0 = T.arcStart(i);
      swish(t0, 0.35);
      bell(t0 + T.arcDur, [72, 76, 79, 83, 84, 88, 91, 96][i], 0.32);
    });
    riser(21.1, 21.98, 0.9);
    whoosh(21.4, 0.6, 1.0, 0, 0);

    // rooftop breakdown 22–26
    pad(22.0, CH.G.pad.map(m => m + 0), 1.95, 0.9, 1800);
    pad(24.0, CH.F.pad, 0.95, 0.9, 2000);
    pad(25.0, CH.G.pad, 0.95, 0.9, 2600);
    bell(22.0, 79, 0.35); bell(22.0, 86, 0.25);
    [0, 1, 2, 3, 4, 5, 6, 7].forEach(k => bell(T.lights + k * 0.1, [72, 74, 76, 79, 81, 84, 86, 88][k], 0.16));
    [22.4, 22.75, 23.1].forEach(t => swish(t, 0.6));
    for (let t = 22.0; t < 24; t += BEAT / 2) hat(t + BEAT / 4, 0.35);
    for (let t = 24.0; t < 25.5; t += BEAT) kick(t, 0.85);
    for (let t = 24.0; t < 25.5; t += BEAT / 2) bass(t, CH[chordAt(t)].bass + (Math.round(t / (BEAT / 2)) % 2 ? 12 : 0), BEAT / 2 - 0.02, 0.8);
    clink(T.clink);
    riser(24.9, 25.97, 1.0);
    for (let t = 25.0; t < 25.94;) { const k = prog(t, 25.0, 25.94); snare(t, 0.25 + 0.75 * k); t += k < 0.5 ? BEAT / 4 : BEAT / 8; }

    // finale
    impact(26.0, 1.0); crash(26.0, 1.1); kick(26.0, 1);
    pad(26.0, CH.Cmaj9.pad, 3.0, 1.1, 3200);
    bass(26.0, 36, 2.6, 0.9);
    stab(26.0, CH.Cmaj9.pad.slice(1, 5), 1.0, 0.9);
    [0, 1, 2, 3].forEach(k => tick(26.0 + k * 0.07, 3200 - k * 300, 3));
    CH.Cmaj9.arp.forEach((m, k) => bell(26.5 + k * 0.11, m + 12, 0.32));
    bell(27.3, 84, 0.45, sfx, 2.4); bell(27.3, 91, 0.3, sfx, 2.4);

    // sidechain duck on the music bus
    kicks.sort((a, b) => a - b).forEach(k => {
      duck.gain.setValueAtTime(1, k);
      duck.gain.linearRampToValueAtTime(0.4, k + 0.008);
      duck.gain.linearRampToValueAtTime(1, k + 0.24);
    });
  }

  async function renderAudio(sampleRate = 48000) {
    const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    const ac = new OAC(2, Math.ceil(sampleRate * DUR), sampleRate);
    buildAudio(ac);
    return ac.startRendering();
  }

  function encodeWav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
    ws(36, 'data'); out.setUint32(40, len * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = clamp(data[c][i], -1, 1); out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return out.buffer;
  }

  global.Spot = { W, H, DUR, FPS, draw, buildAudio, renderAudio, encodeWav, T };
})(typeof window !== 'undefined' ? window : globalThis);
