/*
 * SCHLOSS DREHNA — 30" spot for international communication agencies.
 * Every pixel is generated in code: no footage, no images, no stock.
 *
 * The whole film is a pure function of time: Spot.render(ctx, t).
 * That makes the browser player and the frame-accurate MP4 export identical.
 */
(function () {
  'use strict';

  const W = 1920, H = 1080, DURATION = 30, BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4;
  const TAU = Math.PI * 2;

  // ───────────────────────────────────────────── math & easing
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    inCubic: x => x * x * x,
    outCubic: x => 1 - Math.pow(1 - x, 3),
    inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuint: x => 1 - Math.pow(1 - x, 5),
    outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
    outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    outElastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * TAU / 3) + 1),
  };
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const vnoise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

  // ───────────────────────────────────────────── color
  const hex = c => { if (Array.isArray(c)) return c; const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { a = hex(a); b = hex(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
  const rgba = (c, a = 1) => { c = hex(c); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; };

  // keyframed values (numbers or colors / arrays thereof), smooth between keys
  function keyed(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, a] = keys[i - 1], [t1, b] = keys[i];
        const u = E.inOutSine((t - t0) / (t1 - t0));
        return interp(a, b, u);
      }
    }
    return keys[keys.length - 1][1];
  }
  function interp(a, b, u) {
    if (typeof a === 'number') return lerp(a, b, u);
    if (typeof a === 'string') return mix(a, b, u);
    if (Array.isArray(a) && typeof a[0] === 'number') return a.map((v, i) => lerp(v, b[i], u));
    return a.map((v, i) => interp(v, b[i], u));
  }

  const PAL = {
    ink: '#0B0F1A', navy: '#111A33', cream: '#F6EEDD', gold: '#E8B04A', goldPale: '#FFE3A1',
    pink: '#FF3D7F', cyan: '#22D3EE', lime: '#B6F53B', violet: '#A78BFA', orange: '#FF8A00',
    wall: '#ECDDBA', wallShade: '#D3BF95', trim: '#FAF3E2', roof: '#A9482F', roofDark: '#7E321F',
    copper: '#62A690', arch: '#24343A', copperDark: '#3F7A68', win: '#2D3B50', door: '#4F3322', stone: '#A0968A',
    stoneDark: '#7B7266', meadow: '#7FA55A', grass: '#3E5E33',
  };
  const NEON = [PAL.pink, PAL.cyan, PAL.lime, PAL.violet];

  // ───────────────────────────────────────────── canvas helpers
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const spriteCache = new Map();
  function glowSprite(color) {
    const key = String(color);
    if (spriteCache.has(key)) return spriteCache.get(key);
    const c = mk(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.25, rgba(color, 0.55));
    gr.addColorStop(0.6, rgba(color, 0.12)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    spriteCache.set(key, c); return c;
  }
  function glow(ctx, x, y, r, color, a = 1) {
    if (a <= 0.003 || r <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function poly(ctx, pts, close = true) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  }
  function polyLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  // strokes the first `frac` of a polyline; returns the pen-tip point
  function strokePartial(ctx, pts, frac, len) {
    if (frac <= 0) return null;
    len = len || polyLen(pts);
    const target = len * Math.min(frac, 1);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    let acc = 0, tip = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot(x1 - x0, y1 - y0);
      if (acc + d >= target) { const f = d ? (target - acc) / d : 0; tip = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]; ctx.lineTo(tip[0], tip[1]); break; }
      ctx.lineTo(x1, y1); acc += d; tip = pts[i];
    }
    ctx.stroke(); return tip;
  }
  function bez(p0, p1, p2, p3, n = 14) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  const arcPts = (cx, cy, r, a0, a1, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  function archPts(cx, top, w, h) {
    const r = w / 2;
    return [[cx - r, top + h], [cx - r, top + r], ...arcPts(cx, top + r, r, Math.PI, TAU, 12), [cx + r, top + h], [cx - r, top + h]];
  }
  function setFont(ctx, font, ls = 0) { ctx.font = font; if ('letterSpacing' in ctx) ctx.letterSpacing = ls + 'px'; }

  // text that rises out of an invisible mask
  function riseText(ctx, s, x, y, p, { font, size, color = '#fff', align = 'left', ls = 0, alpha = 1, shadow = 0 }) {
    if (p <= 0 || alpha <= 0) return;
    ctx.save(); setFont(ctx, font, ls); ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(s).width + 40;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x - 20;
    ctx.beginPath(); ctx.rect(x0, y - size * 1.05, w, size * 1.4); ctx.clip();
    ctx.globalAlpha = alpha;
    if (shadow) { ctx.shadowColor = `rgba(0,0,0,${shadow})`; ctx.shadowBlur = 24; ctx.shadowOffsetY = 4; }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y + (1 - E.outQuint(p)) * size * 1.2);
    ctx.restore();
  }
  // letter-by-letter reveal (centered)
  function staggerText(ctx, s, cx, y, t, t0, { font, color = '#fff', ls = 0, step = 0.03, dur = 0.5, rise = 30, fill = null }) {
    ctx.save(); setFont(ctx, font, ls); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const total = ctx.measureText(s).width - ls;
    let x = cx - total / 2;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], pre = ctx.measureText(s.slice(0, i)).width;
      const p = E.outCubic(seg(t, t0 + i * step, t0 + i * step + dur));
      if (p > 0) {
        ctx.globalAlpha = p; ctx.fillStyle = fill || color;
        ctx.fillText(ch, x + pre, y + (1 - p) * rise);
      }
    }
    ctx.restore();
    return total;
  }

  // ───────────────────────────────────────────── shared timeline (also drives the audio)
  // Notifications: quarter notes, then eighths, then sixteenths — the stress literally speeds up.
  const NOTIF_TIMES = [0.5, 1.0, 1.5];
  for (let i = 0; i < 8; i++) NOTIF_TIMES.push(2 + i * BEAT / 2);
  for (let i = 0; i < 12; i++) NOTIF_TIMES.push(4 + i * BEAT / 4);

  const APPS = {
    MAIL: { c: '#3B82F6', l: '@' }, CALENDAR: { c: '#EF4444', l: '31' }, CHAT: { c: '#8B5CF6', l: '#' },
    CLIENT: { c: '#F59E0B', l: 'C' }, VIDEO: { c: '#10B981', l: '▶' },
  };
  const MESSAGES = [
    ['CLIENT', 'Can we make the logo bigger?'], ['CALENDAR', 'Brainstorm moved to 7:30 AM'], ['CHAT', "Where's the deck??"],
    ['MAIL', 'Re: Re: Fwd: FINAL_v7_REAL.pdf'], ['CALENDAR', 'Room 3B is double-booked'], ['CHAT', 'Quick call? (2 hrs)'],
    ['CLIENT', 'Love it. Can it pop more?'], ['MAIL', 'Budget update (again)'], ['CHAT', 'Pitch moved to TOMORROW'],
    ['VIDEO', 'You are on mute.'], ['CALENDAR', 'Workshop: basement room B2'], ['CHAT', '47 unread messages'],
    ['MAIL', 'Out of office: forever'], ['CLIENT', 'Small change: everything'], ['CHAT', 'Coffee machine broken'],
    ['CALENDAR', 'Kick-off for the kick-off'], ['MAIL', 'Need 12 big ideas by EOD'], ['CHAT', 'Is the wifi down?'],
    ['VIDEO', 'Your connection is unstable'], ['CLIENT', 'Can we see more options?'], ['CHAT', '@channel URGENT!!!'],
    ['MAIL', 'Deck_v23_final_final.key'], ['CALENDAR', 'No rooms available'],
  ];
  const CARDS = (() => {
    const r = mulberry32(7);
    const fixed = [[560, 330], [1340, 430], [820, 760]];
    return NOTIF_TIMES.map((t0, i) => {
      const [app, msg] = MESSAGES[i % MESSAGES.length];
      const [x, y] = fixed[i] || [300 + r() * 1320, 150 + r() * 790];
      return { t0, app, msg, x, y, rot: (r() - 0.5) * 0.16, spin: r() < 0.5 ? -1 : 1, i };
    });
  })();

  const HEAD_A = [['DEADLINES.', 2.0], ['DECKS.', 2.5], ['DOUBLE-BOOKED', 3.0], ['ROOMS.', 3.5]];
  const HEAD_B = [['WHERE DO', 4.0], ['BIG IDEAS', 4.5], ['BREATHE?', 5.0]];

  const MONTAGE = [
    { word: 'BRAINSTORM', bg: PAL.pink, fg: '#fff', icon: 'bulb' },
    { word: 'PITCH', bg: PAL.cyan, fg: PAL.ink, icon: 'chart' },
    { word: 'SWIM', bg: '#4F46E5', fg: '#fff', icon: 'swim' },
    { word: 'SAUNA', bg: PAL.orange, fg: '#fff', icon: 'sauna' },
    { word: 'KARAOKE', bg: PAL.lime, fg: PAL.ink, icon: 'mic' },
    { word: 'RIDE', bg: '#7C3AED', fg: '#fff', icon: 'bike' },
    { word: 'FEAST', bg: PAL.gold, fg: PAL.ink, icon: 'glass' },
    { word: 'REPEAT.', bg: PAL.ink, fg: PAL.gold, icon: 'loop' },
  ];
  const MONTAGE_T0 = 20;

  // ───────────────────────────────────────────── camera & light
  // [t, scale, focusX, focusY, screenX, screenY] — world focus point lands on screen point
  const CAM = [
    [6.0, 1.0, 960, 520, 960, 560],
    [7.6, 0.985, 900, 450, 1040, 600],
    [14.0, 1.06, 900, 450, 1040, 600],
    [15.8, 0.92, 960, 520, 1000, 600],
    [17.95, 0.945, 960, 520, 1000, 600],
    [18.0, 0.95, 960, 480, 1150, 610],
    [20.0, 1.0, 960, 480, 1150, 610],
    [23.9, 1.0, 960, 480, 1150, 610],
    [24.0, 0.84, 960, 500, 960, 745],
    [30.0, 0.875, 960, 500, 960, 745],
  ];
  function camAt(t) {
    if (t <= CAM[0][0]) return CAM[0].slice(1);
    for (let i = 1; i < CAM.length; i++) {
      if (t <= CAM[i][0]) {
        const a = CAM[i - 1], b = CAM[i], u = E.inOutCubic((t - a[0]) / (b[0] - a[0]));
        return a.slice(1).map((v, k) => lerp(v, b[k + 1], u));
      }
    }
    return CAM[CAM.length - 1].slice(1);
  }
  const camMatrix = c => [c[0], 0, 0, c[0], c[3] - c[1] * c[0], c[4] - c[2] * c[0]];
  const camY = (c, wy) => c[4] + (wy - c[2]) * c[0];

  const SKY = [
    [6.0, ['#131B38', '#56497A', '#EE955A']],
    [9.0, ['#2B5A9A', '#82A6D3', '#F6CF9C']],
    [12.0, ['#2D71BE', '#8DC2EB', '#E6F0EF']],
    [15.0, ['#3466AE', '#9ABFE0', '#F4E1B8']],
    [17.4, ['#3A4B91', '#D7897C', '#FFC37A']],
    [18.4, ['#1D1D52', '#76397A', '#EE7A5A']],
    [19.6, ['#0A0F2C', '#24204F', '#56306B']],
    [24.0, ['#050918', '#0E1736', '#1C2A58']],
  ];
  const LIGHT = [[6, 0.62], [9, 0.92], [12, 1.0], [16, 0.97], [17.6, 0.86], [18.5, 0.6], [19.6, 0.4], [24, 0.42]];
  const WARM = [[6, 0.5], [9, 0.12], [15, 0.1], [17.5, 0.55], [18.6, 0.45], [20, 0.0]];
  const NIGHT = [[6, 0.35], [8.5, 0.0], [17.0, 0.0], [18.6, 0.45], [19.8, 1.0]];
  function lightAt(t) { return { light: keyed(LIGHT, t), warm: keyed(WARM, t), night: keyed(NIGHT, t) }; }
  function lit(c, L, k = 1) {
    let x = mix(c, [255, 168, 92], L.warm * 0.22 * k);
    x = x.map(v => v * lerp(1, L.light, k));
    return mix(x, [16, 24, 58], L.night * 0.42 * k);
  }

  // ───────────────────────────────────────────── castle (Schloss Fürstlich Drehna, stylised elevation)
  const GROUND = 760, WATER = 785;
  function scrollGable(cx, baseY, hws, th) {
    const L = [];
    for (let k = 0; k < hws.length - 1; k++) {
      const y0 = baseY - k * th, y1 = y0 - th, xa = cx - hws[k], xb = cx - hws[k + 1];
      L.push([xa, y0], [xa, y0 - th * 0.28]);
      L.push(...bez([xa, y0 - th * 0.28], [xa - th * 0.32, y0 - th * 0.78], [xb + th * 0.05, y0 - th * 0.55], [xb, y1], 12).slice(1));
    }
    const last = hws[hws.length - 1], yt = baseY - (hws.length - 1) * th;
    L.push(...arcPts(cx, yt, last, Math.PI, TAU * 0.75, 10));
    const R = L.slice().reverse().map(([x, y]) => [2 * cx - x, y]);
    return [...L, ...R.slice(1)];
  }
  const CASTLE = (() => {
    const S = []; // {pts, fill, line, win, bp}
    const add = (pts, fill, o = {}) => S.push(Object.assign({ pts, fill, bp: true, len: polyLen(pts) }, o));

    // retaining wall of the moat island
    add(rectPts(470, GROUND, 1470, WATER + 4), 'stone');
    // tower body
    add(rectPts(1180, 300, 1300, GROUND), 'wallShade');
    // right wing
    add(rectPts(1300, 590, 1420, GROUND), 'wallShade');
    add([[1292, 592], [1428, 592], [1398, 540], [1322, 540], [1292, 592]], 'roof');
    // main block + roof
    add(rectPts(700, 500, 1180, GROUND), 'wall');
    add([[684, 502], [1196, 502], [1148, 398], [732, 398], [684, 502]], 'roof');
    add(rectPts(756, 372, 778, 430), 'roofDark'); add(rectPts(1106, 372, 1128, 430), 'roofDark');
    for (const dx of [850, 1030]) {
      add([[dx - 26, 478], [dx - 26, 446], [dx, 418], [dx + 26, 446], [dx + 26, 478], [dx - 26, 478]], 'trim');
      add(rectPts(dx - 10, 446, dx + 10, 472), 'win', { win: true });
    }
    add(rectPts(690, 494, 1190, 506), 'trim', { bp: false });
    add(rectPts(700, 578, 1180, 584), 'trim', { bp: false });
    add(rectPts(700, 650, 1180, 656), 'trim', { bp: false });
    // left wing with Renaissance scroll gable
    add(rectPts(540, 450, 720, GROUND), 'wall');
    add(scrollGable(630, 452, [92, 68, 44, 22], 52), 'wall');
    add(rectPts(534, 446, 726, 456), 'trim', { bp: false });
    add([[630, 270], [626, 252], [630, 238], [634, 252], [630, 270]], 'trim');
    for (const k of [0, 1, 2]) {
      const y = 452 - k * 52 - 52 * 0.28, hw = [92, 68, 44][k];
      for (const sgn of [-1, 1]) add([[630 + sgn * hw - 5, y], [630 + sgn * hw, y - 22], [630 + sgn * hw + 5, y]], 'trim');
    }
    add(arcPts(630, 395, 16, 0, TAU, 20), 'win', { win: true });
    // tower cornice + welsche Haube (bulbous copper cap) + lantern + spire
    add(rectPts(1172, 290, 1308, 302), 'trim');
    const cx = 1240;
    const capR = [[cx + 64, 291], ...bez([cx + 64, 291], [cx + 84, 262], [cx + 44, 236], [cx + 18, 224], 14).slice(1), [cx + 16, 216]];
    const capL = capR.slice().reverse().map(([x, y]) => [2 * cx - x, y]);
    add([...capL, ...capR, capL[0]], 'copper');
    add(rectPts(cx - 15, 186, cx + 15, 216), 'trim');
    add([[cx - 17, 187], ...bez([cx - 17, 187], [cx - 16, 170], [cx - 6, 164], [cx, 160], 8).slice(1),
         ...bez([cx, 160], [cx + 6, 164], [cx + 16, 170], [cx + 17, 187], 8).slice(1), [cx - 17, 187]], 'copper');
    add([[cx, 160], [cx, 104]], null, { open: true });
    add([[cx, 108], [cx + 30, 114], [cx, 122]], 'gold');
    add(arcPts(cx, 362, 22, 0, TAU, 24), 'trim');
    add(rectPts(cx - 6, 196, cx + 6, 210), 'win', { win: true });
    // windows
    for (let i = 0; i < 8; i++) {
      const x = 940 + (i - 3.5) * 56;
      add(rectPts(x - 13, 522, x + 13, 562), 'win', { win: true });
      add(rectPts(x - 13, 598, x + 13, 638), 'win', { win: true });
      if (i !== 3 && i !== 4) add(archPts(x, 676, 26, 48), 'win', { win: true });
    }
    add(archPts(940, 668, 64, 92), 'door');
    for (const x of [598, 662]) for (const y of [478, 548, 618, 690]) add(y === 690 ? archPts(x, y - 4, 24, 44) : rectPts(x - 12, y, x + 12, y + 38), 'win', { win: true });
    for (const y of [430, 530, 630]) add(archPts(cx, y, 22, 42), 'win', { win: true });
    for (const x of [1336, 1386]) for (const y of [612, 684]) add(rectPts(x - 12, y, x + 12, y + 38), 'win', { win: true });
    // bridge over the moat
    add(rectPts(296, 734, 486, 743), 'trim');
    add(rectPts(300, 743, 482, WATER + 6), 'stone');
    add([[326, WATER + 6], ...arcPts(362, 794, 36, Math.PI, TAU, 14), [398, WATER + 6], [326, WATER + 6]], 'arch');
    add([[422, WATER + 6], ...arcPts(448, 794, 26, Math.PI, TAU, 10), [474, WATER + 6], [422, WATER + 6]], 'arch');
    return S;
  })();
  const CASTLE_BP = CASTLE.filter(s => s.bp);
  const WIN_SEEDS = CASTLE.map((s, i) => hash(i * 3.7 + 1));

  function drawCastle(ctx, t, L) {
    if (t < 7.3) return;
    const bp = seg(t, 7.35, 10.3);
    const fillP = E.inOutCubic(seg(t, 9.5, 11.3));
    const lineFade = 1 - seg(t, 11.0, 12.2);
    const sweepX = lerp(440, 1500, fillP);
    const nightWin = t >= 17.4;
    const beat = Math.floor((t - 18) / BEAT);
    const mapOn = t >= 18 && t < 20.2 ? 1 : 0;
    const pulse = mapOn ? Math.exp(-((t - 18) % BEAT) * 5) : 0;

    // painted castle — revealed by a sweep from left to right
    if (fillP > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, sweepX, H + 200); ctx.clip();
      for (let i = 0; i < CASTLE.length; i++) {
        const s = CASTLE[i];
        if (!s.fill) { ctx.strokeStyle = rgba(lit('#3A3A3A', L), 1); ctx.lineWidth = 3; poly(ctx, s.pts, false); ctx.stroke(); continue; }
        let col = PAL[s.fill] || s.fill;
        if (s.win) {
          const on = nightWin ? E.outCubic(seg(t, 17.4 + WIN_SEEDS[i] * 1.6, 17.6 + WIN_SEEDS[i] * 1.6)) : 0;
          const flick = 0.92 + 0.08 * Math.sin(t * 7 + i * 3);
          ctx.fillStyle = rgba(mix(lit(col, L), '#FFC56A', on * flick));
        } else if (s.fill === 'roof' || s.fill === 'copper') {
          const b = s.pts.reduce((m, p) => [Math.min(m[0], p[1]), Math.max(m[1], p[1])], [1e9, -1e9]);
          const g = ctx.createLinearGradient(0, b[0], 0, b[1]);
          g.addColorStop(0, rgba(lit(mix(col, '#ffffff', 0.12), L))); g.addColorStop(1, rgba(lit(mix(col, '#000000', 0.18), L)));
          ctx.fillStyle = g;
        } else if (s.fill === 'wall' || s.fill === 'wallShade') {
          const b = s.pts.reduce((m, p) => [Math.min(m[0], p[1]), Math.max(m[1], p[1])], [1e9, -1e9]);
          const g = ctx.createLinearGradient(0, b[0], 0, b[1]);
          g.addColorStop(0, rgba(lit(col, L))); g.addColorStop(1, rgba(lit(mix(col, '#8a7a5a', 0.25), L)));
          ctx.fillStyle = g;
        } else ctx.fillStyle = rgba(lit(col, L));
        poly(ctx, s.pts); ctx.fill();
        if (s.fill === 'roof') { // tile courses
          ctx.save(); poly(ctx, s.pts); ctx.clip();
          ctx.strokeStyle = rgba(lit(PAL.roofDark, L), 0.35); ctx.lineWidth = 1.5;
          for (let y = 380; y < 600; y += 9) { ctx.beginPath(); ctx.moveTo(600, y); ctx.lineTo(1450, y); ctx.stroke(); }
          ctx.restore();
        }
        if (s.fill === 'stone') {
          ctx.save(); poly(ctx, s.pts); ctx.clip();
          ctx.strokeStyle = rgba(lit(PAL.stoneDark, L), 0.5); ctx.lineWidth = 1.2;
          for (let y = 744; y < 800; y += 9) { ctx.beginPath(); ctx.moveTo(280, y); ctx.lineTo(1480, y); ctx.stroke();
            for (let x = 280 + ((y / 9) % 2) * 14; x < 1480; x += 28) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 9); ctx.stroke(); } }
          ctx.restore();
        }
        // eaves shadow + sun rim
        ctx.strokeStyle = rgba(lit('#5A4630', L), 0.45); ctx.lineWidth = 1.4; poly(ctx, s.pts); ctx.stroke();
      }
      // shadow under main cornice and tower cornice
      ctx.fillStyle = rgba('#000', 0.12 * L.light);
      ctx.fillRect(700, 506, 480, 8); ctx.fillRect(1180, 302, 120, 8); ctx.fillRect(540, 456, 180, 8);
      // the side of the tower that faces away from the sun
      ctx.fillStyle = rgba('#000', 0.08); ctx.fillRect(1180, 302, 26, 458);
      // night window glow
      if (nightWin) {
        for (let i = 0; i < CASTLE.length; i++) {
          const s = CASTLE[i]; if (!s.win) continue;
          const on = E.outCubic(seg(t, 17.4 + WIN_SEEDS[i] * 1.6, 17.6 + WIN_SEEDS[i] * 1.6));
          const c = s.pts.reduce((m, p) => [m[0] + p[0] / s.pts.length, m[1] + p[1] / s.pts.length], [0, 0]);
          glow(ctx, c[0], c[1], 46, '#FFB347', on * 0.35);
        }
      }
      ctx.restore();
    }

    // blueprint: golden construction lines
    if (lineFade > 0) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const gp = E.outExpo(seg(t, 7.3, 8.3));
      ctx.strokeStyle = rgba(PAL.goldPale, 0.22 * lineFade); ctx.lineWidth = 1;
      for (const y of [GROUND, 500, 398, 300, 452]) { ctx.beginPath(); ctx.moveTo(960 - 1400 * gp, y); ctx.lineTo(960 + 1400 * gp, y); ctx.stroke(); }
      for (const x of [540, 720, 940, 1180, 1300, 1420]) { ctx.beginPath(); ctx.moveTo(x, GROUND + 40 - 760 * gp); ctx.lineTo(x, GROUND + 40); ctx.stroke(); }
      // dimension ticks + annotation
      ctx.fillStyle = rgba(PAL.goldPale, 0.7 * lineFade * gp);
      setFont(ctx, '300 15px Inter', 3);
      ctx.fillText('ELEVATION · SCHLOSS FÜRSTLICH DREHNA', 540, GROUND + 70);
      ctx.fillText('1 : 100', 1340, GROUND + 70);
      const N = CASTLE_BP.length;
      for (let i = 0; i < N; i++) {
        const s = CASTLE_BP[i];
        const t0 = 7.4 + (i / N) * 2.3, p = E.inOutCubic(seg(t, t0, t0 + (s.win ? 0.35 : 0.8)));
        if (p <= 0) continue;
        ctx.strokeStyle = rgba(PAL.gold, 0.18 * lineFade); ctx.lineWidth = 7;
        strokePartial(ctx, s.pts, p, s.len);
        ctx.strokeStyle = rgba(PAL.goldPale, 0.95 * lineFade); ctx.lineWidth = 1.8;
        const tip = strokePartial(ctx, s.pts, p, s.len);
        if (tip && p < 1) glow(ctx, tip[0], tip[1], 18, PAL.goldPale, 0.9 * lineFade);
      }
      ctx.restore();
    }

    // projection mapping at the drop: the architecture becomes a light show
    if (mapOn) {
      const fade = 1 - seg(t, 19.7, 20.2);
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (let i = 0; i < CASTLE_BP.length; i++) {
        const s = CASTLE_BP[i];
        const col = NEON[(i + beat) % NEON.length];
        const a = (0.55 + 0.45 * pulse) * fade;
        ctx.strokeStyle = rgba(col, 0.22 * a); ctx.lineWidth = 12; poly(ctx, s.pts, false); ctx.stroke();
        ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 3; poly(ctx, s.pts, false); ctx.stroke();
        if (s.win && (i + beat) % 3 === 0) { ctx.fillStyle = rgba(col, 0.75 * a); poly(ctx, s.pts); ctx.fill(); }
      }
      // light sweep across the façade, once per bar
      const sx = lerp(450, 1500, ((t - 18) % BAR) / BAR);
      const g = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.35 * fade})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sx - 120, 100, 240, GROUND - 100);
      ctx.restore();
    }

    // end card: a slow golden light runs along the silhouette
    if (t > 25.2) {
      const p = seg(t, 25.2, 27.6);
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < CASTLE_BP.length; i += 1) {
        const s = CASTLE_BP[i]; if (s.win) continue;
        const local = clamp(p * 1.6 - i / CASTLE_BP.length * 0.6);
        if (local <= 0 || local >= 1) continue;
        ctx.strokeStyle = rgba(PAL.goldPale, 0.5 * Math.sin(local * Math.PI)); ctx.lineWidth = 2;
        strokePartial(ctx, s.pts, local, s.len);
      }
      ctx.restore();
    }
  }

  // ───────────────────────────────────────────── nature
  const TREELINE = (() => { const p = []; for (let x = -700; x <= 2620; x += 18) p.push([x, 702 - 38 - 26 * vnoise(x * 0.011) - 14 * vnoise(x * 0.043 + 9) - 8 * Math.abs(vnoise(x * 0.12 + 3))]); return p; })();
  const CLUMPS = (() => {
    const r = mulberry32(11), out = [];
    const groups = [[150, 520, 7], [1440, 1760, 8], [560, 700, 2], [1330, 1440, 2]];
    for (const [a, b, n] of groups) for (let i = 0; i < n; i++) {
      const x = lerp(a, b, (i + r() * 0.6) / n), big = 38 + r() * 40, poplar = r() < 0.25;
      const blobs = poplar ? [[0, -big * 1.4, big * 0.42, big * 1.25]] :
        Array.from({ length: 6 }, () => [(r() - 0.5) * big * 1.1, -big * (0.7 + r() * 0.8), big * (0.45 + r() * 0.3), 0]);
      out.push({ x, y: GROUND + 2 + r() * 8, big, blobs, poplar, hue: r(), t0: 14.05 + (x < 960 ? (520 - x) / 520 : (x - 1300) / 500) * 0.8 + r() * 0.15 });
    }
    return out.sort((a, b) => a.y - b.y);
  })();
  const GREENS = ['#4F7F3A', '#5E9444', '#3F6E35', '#6FA14E', '#2F5A2E'];

  function drawClumps(ctx, t, L) {
    for (const c of CLUMPS) {
      const p = E.outBack(seg(t, c.t0, c.t0 + 0.55));
      if (p <= 0) continue;
      const sway = Math.sin(t * 1.4 + c.x * 0.01) * 2;
      ctx.fillStyle = rgba(lit('#4A3A28', L)); ctx.fillRect(c.x - 3, c.y - c.big * 0.6 * p, 6, c.big * 0.6 * p);
      c.blobs.forEach((b, k) => {
        const col = lit(GREENS[(k + Math.floor(c.hue * 5)) % GREENS.length], L);
        ctx.fillStyle = rgba(col);
        ctx.beginPath();
        if (b[3]) ctx.ellipse(c.x + sway, c.y + b[1] * p, b[2] * p, b[3] * p, 0, 0, TAU);
        else ctx.arc(c.x + b[0] * p + sway * (k / 6), c.y + b[1] * p, b[2] * p, 0, TAU);
        ctx.fill();
      });
      // sunlit highlight
      ctx.fillStyle = rgba(lit('#A9CF6A', L), 0.25 * L.light * p);
      ctx.beginPath(); ctx.arc(c.x + c.big * 0.15 + sway, c.y - c.big * 1.1 * p, c.big * 0.3 * p, 0, TAU); ctx.fill();
    }
  }

  function makeTree(seed, depth) {
    const r = mulberry32(seed);
    function node(d, len) {
      const n = { len, ang: 0, d, kids: [], leaves: [] };
      if (d < depth) {
        const k = d < 1 ? 2 : r() < 0.28 ? 3 : 2;
        for (let i = 0; i < k; i++) {
          const c = node(d + 1, len * (0.7 + r() * 0.12));
          c.ang = (i - (k - 1) / 2) * (0.42 + r() * 0.28) + (r() - 0.5) * 0.25;
          n.kids.push(c);
        }
      } else {
        const m = 3 + Math.floor(r() * 3);
        for (let i = 0; i < m; i++) n.leaves.push({ ox: (r() - 0.5) * 40, oy: (r() - 0.5) * 40, rad: 12 + r() * 16, col: Math.floor(r() * GREENS.length), dl: r() });
      }
      return n;
    }
    const root = node(0, 1); root.depth = depth; return root;
  }
  const TREES = [
    { tree: makeTree(21, 8), x: 70, y: 885, size: 175, lean: 0.12, t0: 14.0 },
    { tree: makeTree(37, 8), x: 1850, y: 885, size: 185, lean: -0.14, t0: 14.25 },
  ];
  function drawTree(ctx, T, t, L) {
    const D = T.tree.depth, grow = seg(t, T.t0, T.t0 + 1.7);
    if (grow <= 0) return;
    const leafBuckets = GREENS.map(() => []);
    const trunk = rgba(lit('#3B2B1E', L));
    ctx.strokeStyle = trunk; ctx.lineCap = 'round';
    (function rec(n, x, y, a, w) {
      const st = (n.d / (D + 1)) * 0.7, g = E.outCubic(clamp((grow - st) / 0.22));
      if (g <= 0) return;
      const sway = Math.sin(t * 1.2 + n.d * 0.8 + T.x) * 0.012 * n.d;
      const ang = a + n.ang + sway, len = n.len * T.size * g;
      const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      for (const k of n.kids) rec(k, x2, y2, ang, w * 0.7);
      for (const lf of n.leaves) {
        const lp = E.outBack(clamp((grow - 0.72 - lf.dl * 0.18) / 0.16));
        if (lp > 0) leafBuckets[lf.col].push([x2 + lf.ox, y2 + lf.oy, lf.rad * lp]);
      }
    })(T.tree, T.x, T.y, T.lean, 30);
    leafBuckets.forEach((b, i) => {
      if (!b.length) return;
      ctx.fillStyle = rgba(lit(GREENS[i], L));
      ctx.beginPath(); for (const [x, y, r] of b) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill();
    });
  }

  const CLOUDS = (() => {
    const r = mulberry32(5);
    return Array.from({ length: 7 }, (_, i) => ({ x: r() * 2400 - 200, y: 120 + r() * 300, s: 0.6 + r() * 0.8, v: 6 + r() * 12,
      puffs: Array.from({ length: 6 }, () => [(r() - 0.5) * 220, (r() - 0.5) * 40, 40 + r() * 50]) }));
  })();
  const STARS = (() => { const r = mulberry32(3); return Array.from({ length: 260 }, () => [r() * W, r() * 700, 0.4 + r() * 1.5, r() * 10]); })();
  const BIRDS = Array.from({ length: 6 }, (_, i) => ({ t0: 8.4 + i * 0.25 + hash(i) * 0.4, y: 200 + hash(i + 9) * 140, s: 0.7 + hash(i + 3) * 0.5 }));
  const FLIES = Array.from({ length: 46 }, (_, i) => [hash(i * 1.3) * 2000 - 40, 640 + hash(i * 2.1) * 300, hash(i * 3.7) * 10]);
  const REEDS = (() => { const r = mulberry32(17), o = []; for (let i = 0; i < 70; i++) { const left = i < 35; o.push([left ? -200 + r() * 720 : 1400 + r() * 720, 0, 30 + r() * 60, r() * 6]); } return o; })();

  function bankY(x) { // top edge of the near banks (world coords)
    const l = x < 960;
    const u = l ? x : 1920 - x;
    if (u < 200) return 830; if (u > 620) return 2000;
    return 830 + Math.pow((u - 200) / 420, 2.2) * 260;
  }

  // ───────────────────────────────────────────── world render
  let wc = null, wctx = null, tmp = null, tctx = null, tmpR = null, tmpC = null, grain = null, vig = null;
  function ensureBuffers() {
    if (wc) return;
    wc = mk(W, H); wctx = wc.getContext('2d');
    tmp = mk(W, H); tctx = tmp.getContext('2d');
    tmpR = mk(W, H); tmpC = mk(W, H);
    grain = mk(256, 256);
    const g = grain.getContext('2d'), id = g.createImageData(256, 256), r = mulberry32(99);
    for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
    vig = mk(W, H);
    const v = vig.getContext('2d'), gr = v.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    v.fillStyle = gr; v.fillRect(0, 0, W, H);
  }

  function sunPos(t) {
    const u = (t - 5.8) / 13.4;
    return [1580 - 520 * u, 800 - 600 * Math.sin(Math.PI * clamp(u, 0, 1))];
  }

  function drawSkyAndWorld(ctx, t) {
    const cam = camAt(t), L = lightAt(t), [top, mid, hor] = keyed(SKY, t);
    const hy = camY(cam, 700);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, hy + 60);
    g.addColorStop(0, rgba(top)); g.addColorStop(0.6, rgba(mid)); g.addColorStop(1, rgba(hor));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // stars
    if (L.night > 0.02) {
      ctx.fillStyle = '#fff';
      for (const [x, y, r, ph] of STARS) {
        const a = L.night * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + ph)));
        ctx.globalAlpha = a * clamp(1 - y / (hy + 20)); ctx.fillRect(x, y, r, r);
      }
      ctx.globalAlpha = 1;
    }
    // moon
    const moonA = seg(t, 19.2, 20.5);
    if (moonA > 0) {
      const MX = 1490, MY = 215;
      glow(ctx, MX, MY, 260, '#A9BCFF', 0.35 * moonA);
      glow(ctx, MX, MY, 90, '#FFF8E8', 0.6 * moonA);
      ctx.fillStyle = rgba('#FFFDF5', moonA); ctx.beginPath(); ctx.arc(MX, MY, 46, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#E4DCC8', 0.55 * moonA);
      for (const [dx, dy, r] of [[-12, -8, 9], [10, 12, 7], [14, -14, 5]]) { ctx.beginPath(); ctx.arc(MX + dx, MY + dy, r, 0, TAU); ctx.fill(); }
    }
    // sun
    if (t < 19.5) {
      const [sx, sy] = sunPos(t);
      const a = 1 - L.night;
      glow(ctx, sx, sy, 520, mix('#FFB061', '#FFF1C9', L.light - 0.6), 0.55 * a);
      glow(ctx, sx, sy, 160, '#FFF4D6', 0.9 * a);
      ctx.fillStyle = rgba('#FFF8E6', a); ctx.beginPath(); ctx.arc(sx, sy, 46, 0, TAU); ctx.fill();
    }
    // clouds
    for (const c of CLOUDS) {
      const x = ((c.x + t * c.v) % 2500) - 300;
      const col = mix(mix('#FFFFFF', hor, 0.45), top, L.night * 0.7);
      ctx.fillStyle = rgba(mix(col, top, 0.35), 0.4 - L.night * 0.25);
      ctx.beginPath();
      for (const [dx, dy, r] of c.puffs) { ctx.moveTo(x + dx * c.s + r * c.s, c.y + dy * c.s + 12); ctx.arc(x + dx * c.s, c.y + dy * c.s + 12, r * c.s, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = rgba(col, 0.55 - L.night * 0.35);
      ctx.beginPath();
      for (const [dx, dy, r] of c.puffs) { ctx.moveTo(x + dx * c.s + r * c.s, c.y + dy * c.s); ctx.arc(x + dx * c.s, c.y + dy * c.s, r * c.s, 0, TAU); }
      ctx.fill();
    }
    // birds
    if (t > 8 && t < 17) {
      ctx.strokeStyle = rgba(lit('#2A2A35', L), 0.8); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (const b of BIRDS) {
        const u = (t - b.t0) / 7; if (u < 0 || u > 1) continue;
        const x = lerp(-80, 2000, u), y = b.y + Math.sin(u * 9) * 18, f = Math.sin(t * 14 + b.t0 * 9) * 9 * b.s;
        ctx.beginPath(); ctx.moveTo(x - 14 * b.s, y - f); ctx.quadraticCurveTo(x - 6 * b.s, y - 3, x, y); ctx.quadraticCurveTo(x + 6 * b.s, y - 3, x + 14 * b.s, y - f); ctx.stroke();
      }
    }

    // ── world space
    ctx.setTransform(...camMatrix(cam));
    // far forest (aerial perspective)
    ctx.fillStyle = rgba(mix(lit('#3E5E46', L), hor, 0.38));
    poly(ctx, [[-700, 720], ...TREELINE, [2620, 720]]); ctx.fill();
    // meadow
    const mg = ctx.createLinearGradient(0, 690, 0, WATER);
    mg.addColorStop(0, rgba(mix(lit(PAL.meadow, L), hor, 0.25))); mg.addColorStop(1, rgba(lit('#5E8A45', L)));
    ctx.fillStyle = mg; ctx.fillRect(-1200, 690, 4400, WATER - 690 + 10);
    drawClumps(ctx, t, L);
    drawCastle(ctx, t, L);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { cam, L, hor, top };
  }

  function drawWorldComposite(ctx, t) {
    ensureBuffers();
    const { cam, L, hor, top } = drawSkyAndWorld(wctx, t);
    const Ys = Math.round(camY(cam, WATER));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(wc, 0, 0, W, Ys, 0, 0, W, Ys);
    // water: mirrored, rippled strips
    const wcol = mix(lit('#1F4C5E', L), top, 0.35);
    ctx.fillStyle = rgba(wcol); ctx.fillRect(0, Ys, W, H - Ys);
    for (let y = Ys; y < H; y += 2) {
      const d = y - Ys, src = Ys - d - 2;
      if (src < 0) break;
      const amp = 1.5 + d * 0.035;
      const dx = Math.sin(d * 0.11 - t * 3.1) * amp + Math.sin(d * 0.031 + t * 1.3) * amp * 0.7;
      ctx.drawImage(wc, 0, src, W, 2, dx, y, W, 2);
    }
    const wg = ctx.createLinearGradient(0, Ys, 0, H);
    wg.addColorStop(0, rgba(wcol, 0.28)); wg.addColorStop(1, rgba(mix(wcol, '#000', 0.4), 0.78));
    ctx.fillStyle = wg; ctx.fillRect(0, Ys, W, H - Ys);
    // glints of sun / moon on water
    const day = 1 - L.night;
    const [sx] = t < 19.5 ? sunPos(t) : [1490];
    const gl = t < 19.5 ? day : seg(t, 19.6, 21) * 0.6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const y = Ys + 6 + Math.pow(hash(i), 1.4) * (H - Ys);
      const w = 10 + hash(i + 5) * 60 * (1 + (y - Ys) / 300);
      const x = sx + (hash(i + 2) - 0.5) * (80 + (y - Ys) * 0.9) + Math.sin(t * 2 + i) * 10;
      const a = gl * 0.35 * (0.5 + 0.5 * Math.sin(t * 6 + i * 1.7));
      ctx.fillStyle = `rgba(255,236,190,${a})`; ctx.fillRect(x - w / 2, y, w, 2);
    }
    ctx.restore();
    // waterline edge
    ctx.fillStyle = rgba('#000', 0.18); ctx.fillRect(0, Ys, W, 3);

    // ── foreground (not reflected)
    ctx.setTransform(...camMatrix(cam));
    for (const side of [-1, 1]) {
      const pts = [];
      for (let u = -900; u <= 640; u += 20) { const x = side < 0 ? u : 1920 - u; pts.push([x, bankY(x) + vnoise(u * 0.03 + side * 7) * 6]); }
      pts.push([side < 0 ? 640 : 1280, 1500], [side < 0 ? -900 : 2820, 1500]);
      const bg = ctx.createLinearGradient(0, 820, 0, 1100);
      bg.addColorStop(0, rgba(lit('#4C7438', L))); bg.addColorStop(1, rgba(lit('#1E3320', L)));
      ctx.fillStyle = bg; poly(ctx, pts); ctx.fill();
    }
    ctx.strokeStyle = rgba(lit('#5B7D3A', L)); ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const [x, , h, ph] of REEDS) {
      const by = bankY(x) + 6; if (by > 1200) continue;
      const bend = Math.sin(t * 1.6 + ph) * 8;
      ctx.beginPath(); ctx.moveTo(x, by); ctx.quadraticCurveTo(x + bend * 0.3, by - h * 0.6, x + bend, by - h); ctx.stroke();
    }
    for (const T of TREES) drawTree(ctx, T, t, L);
    // fireflies
    if (L.night > 0.3) {
      for (const [x0, y0, ph] of FLIES) {
        const x = x0 + vnoise(t * 0.4 + ph) * 60, y = y0 + vnoise(t * 0.5 + ph + 20) * 40;
        const a = (L.night - 0.3) * (0.5 + 0.5 * Math.sin(t * 3 + ph * 4));
        glow(ctx, x, y, 22, '#D8FF7A', a * 0.9);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { cam, L, Ys };
  }

  // ───────────────────────────────────────────── scene 1: the noise
  function drawCard(ctx, c, s, a) {
    const app = APPS[c.app];
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(s, s); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(-236, -40, 480, 100, 22); ctx.fill();
    ctx.fillStyle = '#F5F6F9'; ctx.beginPath(); ctx.roundRect(-240, -50, 480, 100, 22); ctx.fill();
    ctx.fillStyle = app.c; ctx.beginPath(); ctx.arc(-186, 0, 28, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; setFont(ctx, '800 22px Inter'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(app.l, -186, 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    setFont(ctx, '600 15px Inter', 2); ctx.fillStyle = '#8A90A0'; ctx.fillText(c.app, -144, -12);
    setFont(ctx, '300 15px Inter'); ctx.textAlign = 'right'; ctx.fillText('now', 214, -12); ctx.textAlign = 'left';
    setFont(ctx, '600 23px Inter'); ctx.fillStyle = '#121826'; ctx.fillText(c.msg, -144, 22);
    ctx.restore();
  }

  function drawNoise(ctx, t) {
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, W, H);
    const collapse = E.inExpo(seg(t, 5.5, 5.96));
    // dot grid
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 40; x < W; x += 48) for (let y = 30; y < H; y += 48) ctx.fillRect(x, y, 2, 2);
    // racing clock
    const clockA = (1 - collapse) * 0.9;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 - collapse, 1 - collapse);
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * clockA})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 420, 0, TAU); ctx.stroke();
    for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r0 = i % 5 ? 400 : 380; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * 412, Math.sin(a) * 412); ctx.stroke(); }
    const spin = Math.pow(t, 2.4) * 0.35;
    ctx.strokeStyle = `rgba(232,176,74,${0.45 * clockA})`; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(spin) * 330, -Math.cos(spin) * 330); ctx.stroke();
    ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(spin / 12) * 220, -Math.cos(spin / 12) * 220); ctx.stroke();
    ctx.restore();
    // racing digital time
    const mins = Math.floor(lerp(9 * 60, 23 * 60 + 59, E.inCubic(seg(t, 0.3, 5.5))));
    setFont(ctx, '600 26px Inter', 3); ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - collapse)})`;
    ctx.fillText(`TUESDAY  ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, 60, 70);
    const unread = CARDS.filter(c => t >= c.t0).length * 7 + Math.floor(t * 3);
    ctx.textAlign = 'right'; ctx.fillStyle = `rgba(255,80,90,${0.9 * (1 - collapse)})`;
    ctx.fillText(`● ${unread > 99 ? '99+' : unread} UNREAD`, W - 60, 70); ctx.textAlign = 'left';

    // cards
    const shown = CARDS.filter(c => t >= c.t0);
    shown.forEach((c, k) => {
      const age = t - c.t0, later = shown.length - 1 - k;
      const pop = E.outBack(clamp(age / 0.22));
      let s = pop * (1 - 0.018 * later), x = c.x, y = c.y;
      const jit = Math.sin(t * 40 + c.i) * seg(t, 3.5, 5.5) * 3;
      const cc = Object.assign({}, c, { x: lerp(x + jit, W / 2, collapse), y: lerp(y, H / 2, collapse), rot: c.rot + collapse * c.spin * 3 });
      drawCard(ctx, cc, s * (1 - collapse), clamp(1 - later * 0.025) * clamp(age / 0.06));
    });

    // headline over a darkening veil
    const veil = E.outCubic(seg(t, 1.95, 2.15)) * 0.74 * (1 - collapse);
    if (veil > 0) { ctx.fillStyle = `rgba(8,10,20,${veil})`; ctx.fillRect(0, 0, W, H); }
    const group = t < 4 ? HEAD_A : HEAD_B, size = 150, lh = 150;
    const y0 = H / 2 - ((group.length - 1) * lh) / 2 + size * 0.36;
    if (t >= 2) {
      group.forEach(([w, t0], i) => {
        if (t < t0) return;
        const p = E.outExpo(seg(t, t0, t0 + 0.16));
        const sc = lerp(1.7, 1, p) * (1 - collapse);
        ctx.save(); ctx.translate(W / 2, y0 + i * lh - size * 0.36); ctx.scale(sc, sc);
        ctx.translate(lerp(0, 0, collapse), 0);
        setFont(ctx, `800 ${size}px Inter`, -5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = p;
        ctx.fillStyle = w === 'BREATHE?' ? PAL.gold : '#FFFFFF';
        if (w === 'DOUBLE-BOOKED' || w === 'ROOMS.') ctx.fillStyle = '#FFFFFF';
        ctx.fillText(w, 0, 0);
        if (w === 'DOUBLE-BOOKED') { // a doubled ghost: double-booked, literally
          ctx.globalAlpha = 0.35 * p; ctx.fillStyle = PAL.pink; ctx.fillText(w, 8 + Math.sin(t * 30) * 4, 6);
        }
        ctx.restore();
      });
    }
    // the singularity
    const dot = seg(t, 5.8, 6.0);
    if (dot > 0) { glow(ctx, W / 2, H / 2, 40 + dot * 160, PAL.goldPale, dot); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 6 + dot * 6, 0, TAU); ctx.fill(); }
  }

  // ───────────────────────────────────────────── splats & spray (street-art soul)
  const SPLATS = [
    { x: 260, y: 900, R: 170, c: PAL.pink, t0: 18.0, seed: 1 },
    { x: 1700, y: 170, R: 140, c: PAL.cyan, t0: 18.25, seed: 2 },
    { x: 1560, y: 980, R: 90, c: PAL.lime, t0: 18.5, seed: 3 },
    { x: 980, y: 90, R: 60, c: PAL.violet, t0: 18.75, seed: 4 },
  ];
  function splat(ctx, s, t) {
    const p = E.outExpo(seg(t, s.t0, s.t0 + 0.12));
    if (p <= 0) return;
    const fade = 1 - seg(t, 19.6, 20.0);
    const r = mulberry32(s.seed * 99), N = 56, pts = [];
    for (let i = 0; i < N; i++) {
      let rr = s.R * (0.78 + r() * 0.22);
      if (r() < 0.22) rr *= 1.25 + r() * 0.55;
      const a = i / N * TAU; pts.push([s.x + Math.cos(a) * rr * p, s.y + Math.sin(a) * rr * p]);
    }
    ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = s.c;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (i === 0) ctx.moveTo(m[0], m[1]); else ctx.quadraticCurveTo(a[0], a[1], m[0], m[1]);
    }
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU, d = s.R * (1.2 + r() * 1.3) * p, rr = s.R * (0.03 + r() * 0.08);
      ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, rr, 0, TAU); ctx.fill();
    }
    // drips
    for (let i = 0; i < 4; i++) {
      const x = s.x + (r() - 0.5) * s.R * 1.2, len = s.R * (0.6 + r()) * E.outCubic(seg(t, s.t0 + 0.1, s.t0 + 1.4));
      ctx.fillRect(x - 5, s.y + s.R * 0.5, 10, len); ctx.beginPath(); ctx.arc(x, s.y + s.R * 0.5 + len, 8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawStreetArtText(ctx, t) {
    const out = 1 - seg(t, 19.7, 20.0);
    riseText(ctx, 'Renaissance walls.', 120, 220, seg(t, 18.15, 18.6), { font: '400 92px "Playfair Display"', size: 92, color: PAL.cream, alpha: out, shadow: 0.45 });
    // spray-painted line
    const p = seg(t, 18.85, 19.55);
    if (p > 0) {
      ctx.save(); ctx.translate(126, 360); ctx.rotate(-0.045);
      setFont(ctx, '400 128px "Permanent Marker"'); const w = ctx.measureText('Street-art soul.').width;
      ctx.beginPath(); ctx.rect(-20, -140, (w + 40) * p, 220); ctx.clip();
      ctx.globalAlpha = out;
      ctx.fillStyle = 'rgba(20,4,30,0.55)'; ctx.fillText('Street-art soul.', 7, 8);
      ctx.fillStyle = PAL.pink; ctx.fillText('Street-art soul.', 0, 0);
      ctx.restore();
      // overspray mist at the nozzle
      if (p < 1) {
        const hx = 126 + w * p, hy = 330;
        ctx.fillStyle = rgba(PAL.pink, 0.55 * out);
        for (let i = 0; i < 90; i++) {
          const a = hash(i + Math.floor(t * 60) * 0.37) * TAU, d = Math.pow(hash(i * 1.9 + t * 13), 2) * 70;
          ctx.fillRect(hx + Math.cos(a) * d, hy + Math.sin(a) * d * 1.3, 2.5, 2.5);
        }
      }
      // drips
      ctx.fillStyle = rgba(PAL.pink, out);
      for (let i = 0; i < 7; i++) {
        const dx = 60 + hash(i + 40) * (w - 80), tp = 18.85 + (dx / w) * 0.7 + 0.15;
        const len = (20 + hash(i + 41) * 70) * E.outCubic(seg(t, tp, tp + 1));
        if (len > 1) { ctx.fillRect(126 + dx - 3, 372 - dx * 0.045, 6, len); ctx.beginPath(); ctx.arc(126 + dx, 372 - dx * 0.045 + len, 5, 0, TAU); ctx.fill(); }
      }
    }
  }

  // ───────────────────────────────────────────── scene 5: the montage
  function icon(ctx, kind, p, t, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const P = pts => strokePartial(ctx, pts, p);
    switch (kind) {
      case 'bulb': {
        P([...arcPts(0, -40, 72, Math.PI * 0.78, Math.PI * 2.22, 40), [36, 34], [-36, 34], [-46, 10]]);
        P([[-30, 60], [30, 60]]); P([[-20, 84], [20, 84]]);
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.48, pulse = 0.5 + 0.5 * Math.sin(t * 24);
          const r0 = 98, r1 = 120 + pulse * 22;
          P([[Math.cos(a) * r0, -40 + Math.sin(a) * r0], [Math.cos(a) * r1, -40 + Math.sin(a) * r1]]);
        }
        break;
      }
      case 'chart': {
        P(rectPts(-120, -110, 120, 50)); P([[0, 50], [0, 110]]); P([[-60, 110], [60, 110]]);
        const g = E.outBack(p);
        [[-80, 50], [-30, 80], [20, 110], [70, 140]].forEach(([x, h]) => P([[x, 30], [x, 30 - h * 0.85 * g]]));
        break;
      }
      case 'swim': {
        for (let k = 0; k < 3; k++) {
          const pts = []; for (let x = -130; x <= 130; x += 8) pts.push([x, -10 + k * 50 + Math.sin(x * 0.05 - t * 9 + k) * 12]);
          P(pts);
        }
        P(arcPts(-30, -78, 20, 0, TAU, 20));
        P([[-80, -40], [-30, -52], [40, -78]]);
        break;
      }
      case 'sauna': {
        for (let k = -1; k <= 1; k++) {
          const pts = []; for (let y = 40; y >= -120; y -= 8) pts.push([k * 60 + Math.sin(y * 0.06 + t * 8 + k) * 14, y - ((t * 120) % 16)]);
          P(pts);
        }
        P([[-130, 80], [130, 80]]); P([[-100, 80], [-100, 120]]); P([[100, 80], [100, 120]]);
        break;
      }
      case 'mic': {
        P(arcPts(0, -70, 50, 0, TAU, 30));
        P([[-26, -20], [-16, 90], [16, 90], [26, -20]]);
        P([[-40, -82], [40, -82]]); P([[-46, -60], [46, -60]]);
        for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
          const r = 90 + k * 34 + Math.sin(t * 20) * 4;
          P(arcPts(0, -70, r, s > 0 ? -0.5 : Math.PI - 0.5, s > 0 ? 0.5 : Math.PI + 0.5, 12));
        }
        break;
      }
      case 'bike': {
        for (const cx of [-90, 90]) {
          P(arcPts(cx, 50, 58, 0, TAU, 36));
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4 + t * 9; P([[cx - Math.cos(a) * 56, 50 - Math.sin(a) * 56], [cx + Math.cos(a) * 56, 50 + Math.sin(a) * 56]]); }
        }
        P([[-90, 50], [-25, -30], [55, -30], [90, 50]]); P([[-25, -30], [10, 50], [-90, 50]]); P([[10, 50], [55, -30]]);
        P([[-42, -54], [-6, -54]]); P([[55, -30], [42, -68], [74, -68]]);
        break;
      }
      case 'glass': {
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(s * 60, 0); ctx.rotate(s * -0.18 * E.outBack(p));
          P([[-46, -100], [-42, -50], ...arcPts(0, -50, 42, Math.PI, 0, 16).reverse().map(([x, y]) => [x, y + 2 * (y + 50)]), [46, -100]]);
          P([[0, -8], [0, 80]]); P([[-38, 80], [38, 80]]);
          ctx.restore();
        }
        if (p > 0.8) for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.4; P([[Math.cos(a) * 40, -140 + Math.sin(a) * 30], [Math.cos(a) * 70, -140 + Math.sin(a) * 60]]); }
        break;
      }
      case 'loop': {
        ctx.rotate(t * 5);
        for (const s of [0, Math.PI]) {
          const a0 = s + 0.25, a1 = s + Math.PI - 0.25;
          P(arcPts(0, 0, 100, a0, a1, 24));
          const ex = Math.cos(a1) * 100, ey = Math.sin(a1) * 100, tg = a1 + Math.PI / 2;
          P([[ex + Math.cos(tg - 2.5) * 40, ey + Math.sin(tg - 2.5) * 40], [ex, ey], [ex + Math.cos(tg + 2.5) * 40, ey + Math.sin(tg + 2.5) * 40]]);
        }
        break;
      }
    }
    ctx.restore();
  }

  function drawMontage(ctx, t) {
    const lt = t - MONTAGE_T0, i = clamp(Math.floor(lt / BEAT), 0, MONTAGE.length - 1), bt = lt - i * BEAT;
    const prev = MONTAGE[i - 1], cur = MONTAGE[i];
    ctx.fillStyle = prev ? prev.bg : '#120E2A'; ctx.fillRect(0, 0, W, H);
    // diagonal wipe
    const wp = E.outExpo(clamp(bt / 0.16));
    const x0 = lerp(W + 500, -500, wp);
    ctx.fillStyle = cur.bg; poly(ctx, [[x0, 0], [W + 600, 0], [W + 600, H], [x0 - 360, H]]); ctx.fill();
    // giant outlined echo word scrolling behind
    ctx.save(); ctx.beginPath(); poly(ctx, [[x0, 0], [W + 600, 0], [W + 600, H], [x0 - 360, H]]); ctx.clip();
    setFont(ctx, '800 380px Inter', -10); ctx.textBaseline = 'middle';
    ctx.strokeStyle = rgba(cur.fg, 0.14); ctx.lineWidth = 3;
    const ew = ctx.measureText(cur.word + '  ').width;
    for (let r = -1; r < 3; r++) ctx.strokeText(cur.word + '  ', -((lt * 700) % ew) + r * ew, r % 2 ? 160 : 930);
    // stripes on the beat
    ctx.fillStyle = rgba(cur.fg, 0.08);
    for (let k = 0; k < 6; k++) ctx.fillRect(-200 + k * 380 + ((lt * 300) % 380), 0, 60, H);
    // icon + word
    const ip = E.outCubic(clamp((bt - 0.03) / 0.3));
    ctx.save(); ctx.translate(W / 2, 360); const ps = E.outBack(clamp(bt / 0.22)); ctx.scale(ps, ps);
    icon(ctx, cur.icon, ip, t, cur.fg); ctx.restore();
    const sp = E.outExpo(clamp(bt / 0.14));
    ctx.save(); ctx.translate(W / 2, 700); ctx.scale(lerp(1.5, 1, sp), lerp(1.5, 1, sp));
    setFont(ctx, '800 190px Inter', -6); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let g = 2; g >= 1; g--) { ctx.globalAlpha = (1 - sp) * 0.25; ctx.fillStyle = cur.fg; ctx.fillText(cur.word, (1 - sp) * g * 40, 0); }
    ctx.globalAlpha = 1; ctx.fillStyle = cur.fg; ctx.fillText(cur.word, 0, 0);
    ctx.restore();
    // footer
    setFont(ctx, '600 24px Inter', 6); ctx.fillStyle = rgba(cur.fg, 0.85); ctx.textAlign = 'left';
    ctx.fillText('ALL UNDER ONE CASTLE ROOF', 80, H - 70);
    ctx.textAlign = 'right'; ctx.fillText(`${String(i + 1).padStart(2, '0')} / ${String(MONTAGE.length).padStart(2, '0')}`, W - 80, H - 70);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ───────────────────────────────────────────── overlays per act
  function sideShade(ctx, a) {
    if (a <= 0) return;
    ctx.save(); ctx.translate(420, 270); ctx.scale(2.1, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
    g.addColorStop(0, `rgba(6,10,24,${0.5 * a})`); g.addColorStop(0.55, `rgba(6,10,24,${0.32 * a})`); g.addColorStop(1, 'rgba(6,10,24,0)');
    ctx.fillStyle = g; ctx.fillRect(-420, -400, 840, 800); ctx.restore();
  }
  function label(ctx, s, x, y, p, color = PAL.goldPale, alpha = 1) {
    if (p <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 48 * E.outCubic(p), y - 8); ctx.stroke();
    setFont(ctx, '600 21px Inter', 6); const w = ctx.measureText(s).width;
    ctx.beginPath(); ctx.rect(x + 64, y - 30, (w + 10) * E.outCubic(seg(p, 0.2, 1)), 44); ctx.clip();
    ctx.fillStyle = color; ctx.fillText(s, x + 64, y);
    ctx.restore();
  }

  function drawCastleText(ctx, t) {
    const out = 1 - seg(t, 13.55, 13.95), shift = -60 * E.inCubic(seg(t, 13.55, 13.95));
    if (t < 10.4 || out <= 0) return;
    sideShade(ctx, seg(t, 10.4, 11) * out);
    ctx.save(); ctx.translate(shift, 0);
    label(ctx, 'SCHLOSS FÜRSTLICH DREHNA', 120, 150, seg(t, 10.5, 11.2), PAL.goldPale, out);
    riseText(ctx, 'A Renaissance castle', 120, 250, seg(t, 10.75, 11.3), { font: '400 84px "Playfair Display"', size: 84, color: '#fff', alpha: out, shadow: 0.35 });
    riseText(ctx, 'built for big ideas.', 120, 345, seg(t, 10.95, 11.5), { font: 'italic 400 84px "Playfair Display"', size: 84, color: PAL.goldPale, alpha: out, shadow: 0.35 });
    riseText(ctx, 'Halfway between Berlin and Dresden.', 124, 410, seg(t, 11.35, 11.9), { font: '300 28px Inter', size: 28, color: '#fff', alpha: out * 0.92, shadow: 0.4 });
    ctx.restore();
  }

  function drawParkText(ctx, t) {
    const out = 1 - seg(t, 15.6, 15.95);
    if (t < 14.2 || out <= 0) return;
    sideShade(ctx, seg(t, 14.2, 14.6) * out);
    label(ctx, 'A LANDSCAPE PARK BY PETER JOSEPH LENNÉ', 120, 150, seg(t, 14.25, 15.0), PAL.goldPale, out);
    riseText(ctx, 'Think outside', 120, 250, seg(t, 14.45, 15.0), { font: '400 84px "Playfair Display"', size: 84, color: '#fff', alpha: out, shadow: 0.35 });
    riseText(ctx, 'the meeting room.', 120, 345, seg(t, 14.65, 15.2), { font: 'italic 400 84px "Playfair Display"', size: 84, color: PAL.goldPale, alpha: out, shadow: 0.35 });
  }

  const STATS = [
    { n: 53, unit: '', l1: 'BEDROOMS', l2: 'TO SLEEP ON IT', t0: 16.0 },
    { n: 100, unit: '', l1: 'PARTICIPANTS', l2: 'MAX. CAPACITY', t0: 16.3 },
    { n: 55, unit: 'min', l1: 'TO THE AIRPORTS', l2: 'BERLIN BER & DRESDEN', t0: 16.6 },
  ];
  function drawStats(ctx, t) {
    if (t < 15.95 || t > 18) return;
    const out = E.inCubic(seg(t, 17.6, 17.95));
    STATS.forEach((s, i) => {
      const p = E.outCubic(seg(t, s.t0, s.t0 + 0.4)), cx = 560 + i * 400, y = 905 + (1 - p) * 60 + out * 240;
      if (p <= 0) return;
      ctx.save(); ctx.globalAlpha = p;
      ctx.fillStyle = 'rgba(8,12,28,0.62)'; ctx.beginPath(); ctx.roundRect(cx - 180, y - 120, 360, 200, 20); ctx.fill();
      ctx.strokeStyle = 'rgba(255,227,161,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      const v = Math.round(s.n * E.outCubic(seg(t, s.t0, s.t0 + 0.8)));
      setFont(ctx, '700 104px "Playfair Display"'); ctx.textAlign = 'center'; ctx.fillStyle = PAL.gold;
      if (s.unit) {
        const nw = ctx.measureText(String(s.n)).width; setFont(ctx, '600 30px Inter', 1); const uw = ctx.measureText(s.unit).width;
        const x0 = cx - (nw + 10 + uw) / 2;
        ctx.textAlign = 'left'; ctx.fillText(s.unit, x0 + nw + 10, y);
        setFont(ctx, '700 104px "Playfair Display"'); ctx.textAlign = 'right'; ctx.fillText(v, x0 + nw, y); ctx.textAlign = 'center';
      } else ctx.fillText(v, cx, y);
      setFont(ctx, '600 20px Inter', 5); ctx.fillStyle = '#fff'; ctx.fillText(s.l1, cx, y + 40);
      setFont(ctx, '300 17px Inter', 3); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(s.l2, cx, y + 64);
      ctx.restore();
    });
  }

  const DUST = Array.from({ length: 70 }, (_, i) => [hash(i * 4.1) * W, hash(i * 2.3) * 520 + 40, hash(i * 7.7) * 10, 1 + hash(i) * 2.5]);
  function drawEndCard(ctx, t) {
    if (t < 24) return;
    // top & bottom veils for legibility
    ctx.save(); ctx.translate(W / 2, 270); ctx.scale(2.4, 1);
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 330);
    g.addColorStop(0, 'rgba(3,6,16,0.6)'); g.addColorStop(1, 'rgba(3,6,16,0)');
    ctx.fillStyle = g; ctx.fillRect(-400, -330, 800, 660); ctx.restore();
    g = ctx.createLinearGradient(0, 860, 0, H);
    g.addColorStop(0, 'rgba(3,6,16,0)'); g.addColorStop(1, 'rgba(3,6,16,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 860, W, 220);
    // gold dust
    for (const [x, y, ph, r] of DUST) {
      const a = seg(t, 24.4, 25.4) * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.5 + ph), 3));
      glow(ctx, x + Math.sin(t * 0.3 + ph) * 20, y - (t - 24) * 6, r * 5, PAL.goldPale, a * 0.5);
    }
    staggerText(ctx, 'Your next big idea', W / 2, 168, t, 24.25, { font: '400 78px "Playfair Display"', color: '#fff', step: 0.028, dur: 0.6 });
    // shimmering gold line
    ctx.save(); setFont(ctx, 'italic 400 100px "Playfair Display"');
    const sw = ctx.measureText('deserves a castle.').width;
    const sh = ((t - 24.8) * 0.45) % 1.4 - 0.2;
    const gg = ctx.createLinearGradient(W / 2 - sw / 2, 0, W / 2 + sw / 2, 0);
    gg.addColorStop(0, PAL.gold); gg.addColorStop(clamp(sh - 0.12), PAL.gold); gg.addColorStop(clamp(sh), '#FFF6DC'); gg.addColorStop(clamp(sh + 0.12), PAL.gold); gg.addColorStop(1, PAL.gold);
    ctx.restore();
    staggerText(ctx, 'deserves a castle.', W / 2, 282, t, 24.85, { font: 'italic 400 100px "Playfair Display"', fill: gg, step: 0.03, dur: 0.6 });
    // divider + wordmark
    const dp = E.inOutCubic(seg(t, 25.9, 26.5));
    ctx.strokeStyle = rgba(PAL.gold, 0.9); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W / 2 - 230 * dp, 326); ctx.lineTo(W / 2 + 230 * dp, 326); ctx.stroke();
    if (dp > 0) { ctx.fillStyle = PAL.gold; ctx.save(); ctx.translate(W / 2, 326); ctx.rotate(Math.PI / 4); ctx.fillRect(-5 * dp, -5 * dp, 10 * dp, 10 * dp); ctx.restore(); }
    staggerText(ctx, 'SCHLOSS DREHNA', W / 2, 382, t, 26.0, { font: '800 44px Inter', color: '#fff', ls: 16, step: 0.035, dur: 0.45, rise: 16 });
    staggerText(ctx, "by Châteauform'", W / 2, 424, t, 26.45, { font: 'italic 400 30px "Playfair Display"', color: PAL.cream, step: 0.02, dur: 0.5, rise: 10 });
    // facts + CTA
    const fp = E.outCubic(seg(t, 26.9, 27.4));
    ctx.save(); ctx.globalAlpha = fp; setFont(ctx, '300 25px Inter', 1); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText('53 rooms   ·   up to 100 participants   ·   55 min from Berlin & Dresden airports', W / 2, 958 + (1 - fp) * 20);
    ctx.restore();
    const cp = E.outBack(seg(t, 27.5, 27.95));
    if (cp > 0) {
      ctx.save(); ctx.translate(W / 2, 1020); ctx.scale(cp, cp);
      setFont(ctx, '600 27px Inter', 2); const s1 = 'Book your creative retreat', s2 = 'chateauform.com';
      const w1 = ctx.measureText(s1).width; setFont(ctx, '800 27px Inter', 2); const w2 = ctx.measureText(s2).width;
      const pw = w1 + w2 + 130;
      ctx.fillStyle = 'rgba(11,15,26,0.75)'; ctx.beginPath(); ctx.roundRect(-pw / 2, -34, pw, 68, 34); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.roundRect(-pw / 2, -34, pw, 68, 34); ctx.clip();
      const sx = lerp(-pw, pw, ((t - 27.9) / 1.2) % 1.6);
      const sg = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0);
      sg.addColorStop(0, 'rgba(255,240,200,0)'); sg.addColorStop(0.5, 'rgba(255,240,200,0.28)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = sg; ctx.fillRect(-pw / 2, -34, pw, 68); ctx.restore();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      setFont(ctx, '600 27px Inter', 2); ctx.fillStyle = '#fff'; ctx.fillText(s1, -pw / 2 + 40, 1);
      ctx.fillStyle = PAL.gold; ctx.fillText('→', -pw / 2 + 50 + w1, 1);
      setFont(ctx, '800 27px Inter', 2); ctx.fillText(s2, -pw / 2 + 90 + w1, 1);
      ctx.restore();
    }
  }

  // ───────────────────────────────────────────── post
  function chromaGlitch(ctx, amount, seed) {
    ensureBuffers();
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'copy'; tctx.drawImage(ctx.canvas, 0, 0); tctx.globalCompositeOperation = 'source-over';
    const r = tmpR.getContext('2d'), c = tmpC.getContext('2d');
    for (const [g, col] of [[r, '#ff0000'], [c, '#00ffff']]) {
      g.globalCompositeOperation = 'copy'; g.drawImage(tmp, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tmpR, -amount, 0); ctx.drawImage(tmpC, amount, 0);
    ctx.globalCompositeOperation = 'source-over';
    // slice displacement
    tctx.globalCompositeOperation = 'copy'; tctx.drawImage(ctx.canvas, 0, 0); tctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 9; i++) {
      const y = hash(seed + i * 3.1) * H, h = 8 + hash(seed + i * 5.3) * 70, dx = (hash(seed + i * 7.7) - 0.5) * amount * 6;
      ctx.drawImage(tmp, 0, y, W, h, dx, y, W, h);
    }
    ctx.restore();
  }

  function glitchAmount(t) {
    let a = 0;
    if (t > 5.45 && t < 5.98) a = 6 + 26 * seg(t, 5.45, 5.98);
    const imp = (t0, amp, d) => (t >= t0 && t < t0 + d ? amp * (1 - (t - t0) / d) : 0);
    a += imp(18.0, 26, 0.22) + imp(23.88, 18, 0.12);
    for (let k = 0; k < 8; k++) a += imp(20 + k * BEAT, 7, 0.06);
    return a;
  }
  function shakeAt(t) {
    let a = 0;
    if (t < 5.95) a += 5 * Math.pow(seg(t, 3, 5.9), 2);
    const imp = (t0, amp, d) => (t >= t0 && t < t0 + d ? amp * Math.pow(1 - (t - t0) / d, 2) : 0);
    a += imp(18.0, 22, 0.6) + imp(24.0, 10, 0.6) + imp(6.0, 6, 0.4);
    for (let k = 0; k < 8; k++) a += imp(20 + k * BEAT, 6, 0.18);
    return a;
  }

  // ───────────────────────────────────────────── master render
  function render(ctx, t) {
    ensureBuffers();
    t = clamp(t, 0, DURATION - 1e-4);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    const sh = shakeAt(t);
    if (sh > 0.01) {
      const k = 1 + sh / 400;
      ctx.translate(W / 2 + vnoise(t * 37) * sh, H / 2 + vnoise(t * 41 + 5) * sh); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2);
    }
    const base = ctx.getTransform();

    if (t < 6.0) {
      drawNoise(ctx, t);
    } else if (t < 20.0) {
      // iris opening from the golden dot
      const ir = E.inOutCubic(seg(t, 6.0, 7.5)) * 1200;
      if (ir < 1150) {
        ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.max(ir, 0.01), 0, TAU); ctx.clip();
        drawWorldComposite(ctx, t); ctx.setTransform(base); ctx.restore();
        ctx.strokeStyle = rgba(PAL.goldPale, 0.9); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.max(ir, 0.01), 0, TAU); ctx.stroke();
        glow(ctx, W / 2, H / 2, 60 + ir * 0.3, PAL.goldPale, 0.6 * (1 - ir / 1150));
      } else { drawWorldComposite(ctx, t); ctx.setTransform(base); }
      // "Here."
      const ha = E.outCubic(seg(t, 6.3, 6.8)) * (1 - seg(t, 7.3, 7.8));
      if (ha > 0) {
        ctx.save(); setFont(ctx, 'italic 400 170px "Playfair Display"', lerp(0, 18, seg(t, 6.3, 7.8)));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = ha;
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30;
        ctx.fillStyle = PAL.cream; ctx.fillText('Here.', W / 2, H / 2 - 10); ctx.restore();
      }
      drawCastleText(ctx, t);
      drawParkText(ctx, t);
      drawStats(ctx, t);
      if (t >= 18) { for (const s of SPLATS) splat(ctx, s, t); drawStreetArtText(ctx, t); }
    } else if (t < 24.0) {
      drawMontage(ctx, t);
      // the loop icon opens into the night
      const ir = E.inCubic(seg(t, 23.7, 24.0)) * 1250;
      if (ir > 1) {
        ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 360, ir, 0, TAU); ctx.clip();
        drawWorldComposite(ctx, t + (24 - t) + 0.001); ctx.setTransform(base); ctx.restore();
        ctx.strokeStyle = PAL.gold; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, 360, ir, 0, TAU); ctx.stroke();
      }
    } else {
      drawWorldComposite(ctx, t); ctx.setTransform(base);
      drawEndCard(ctx, t);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ga = glitchAmount(t);
    if (ga > 0.5) chromaGlitch(ctx, ga, Math.floor(t * 30));

    // impact flashes
    const flash = (t0, a, d) => (t >= t0 && t < t0 + d ? a * (1 - (t - t0) / d) : 0);
    const fl = flash(6.0, 0.9, 0.35) + flash(18.0, 0.55, 0.25) + flash(24.0, 0.45, 0.35);
    if (fl > 0) { ctx.fillStyle = `rgba(255,246,225,${fl})`; ctx.fillRect(0, 0, W, H); }

    // film grain + vignette
    ctx.save();
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.07;
    const pat = ctx.createPattern(grain, 'repeat');
    const f = Math.floor(t * 24);
    pat.setTransform(new DOMMatrix().translate(hash(f) * 256, hash(f + 0.5) * 256));
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.drawImage(vig, 0, 0);

    // fade in / out
    const fade = Math.max(1 - seg(t, 0, 0.35), seg(t, 29.45, 30));
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  window.Spot = {
    W, H, DURATION, BPM, BEAT, BAR, render,
    timeline: { NOTIF_TIMES, CARDS: CARDS.map(c => ({ t0: c.t0, app: c.app, x: c.x })), MONTAGE_T0, MONTAGE_N: MONTAGE.length },
    fonts: ['400 80px "Playfair Display"', 'italic 400 80px "Playfair Display"', '700 80px "Playfair Display"',
      '400 80px "Permanent Marker"', '300 20px Inter', '600 20px Inter', '800 20px Inter'],
  };
})();
