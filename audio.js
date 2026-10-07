/*
 * SCHLOSS DREHNA — soundtrack & sound design, synthesised from scratch with the Web Audio API.
 * 120 BPM · D minor → F major. Every hit is locked to the picture via Spot.timeline.
 *
 * SpotAudio.render() → Promise<AudioBuffer> (rendered offline, deterministic)
 * SpotAudio.toWav(buffer) → ArrayBuffer (16-bit PCM)
 */
(function () {
  'use strict';
  const SR = 48000, DUR = 30, BEAT = 0.5, BAR = 2;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function build(ac) {
    const rnd = mulberry32(2024);

    // ── buffers
    const noiseBuf = ac.createBuffer(1, SR * 2, SR);
    { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    const brownBuf = ac.createBuffer(1, SR * 4, SR);
    { const d = brownBuf.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (rnd() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }
    function ir(seconds, decay) {
      const b = ac.createBuffer(2, SR * seconds, SR);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, decay); }
      return b;
    }

    // ── mix bus
    const master = ac.createGain(); master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const hpf = ac.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 28;
    master.connect(hpf).connect(comp).connect(ac.destination);

    const reverb = ac.createConvolver(); reverb.buffer = ir(3.2, 2.6);
    const revOut = ac.createGain(); revOut.gain.value = 0.5; reverb.connect(revOut).connect(master);

    const delay = ac.createDelay(2); delay.delayTime.value = 0.375;
    const fb = ac.createGain(); fb.gain.value = 0.38;
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
    const delOut = ac.createGain(); delOut.gain.value = 0.32;
    delay.connect(dlp).connect(fb).connect(delay); dlp.connect(delOut); delOut.connect(master); delOut.connect(reverb);

    const drums = ac.createGain(); drums.gain.value = 0.9; drums.connect(master);
    const music = ac.createGain(); music.gain.value = 0.8; music.connect(master);   // ducked by the kick in the drop
    const sfx = ac.createGain(); sfx.gain.value = 0.85; sfx.connect(master);

    // route a node to a bus with optional pan / sends
    function out(node, bus, { pan = 0, rev = 0, del = 0, gain = 1 } = {}) {
      const g = ac.createGain(); g.gain.value = gain;
      const p = ac.createStereoPanner(); p.pan.value = pan;
      node.connect(g).connect(p).connect(bus);
      if (rev) { const s = ac.createGain(); s.gain.value = rev; p.connect(s).connect(reverb); }
      if (del) { const s = ac.createGain(); s.gain.value = del; p.connect(s).connect(delay); }
      return g;
    }
    function noise(t, dur, buf = noiseBuf) {
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
      s.start(t, rnd() * 1.5); s.stop(t + dur + 0.05); return s;
    }
    function osc(type, f, t, dur) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t + dur + 0.05); return o; }
    function adsr(t, a, peak, dur, rel) {
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + Math.max(a, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
      return g;
    }
    function perc(t, peak, decay) { const g = ac.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay); return g; }
    function filt(type, f, Q = 0.7) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }

    // ── drums
    function kick(t, v = 1, bus = drums) {
      const o = osc('sine', 150, t, 0.6);
      o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      const g = perc(t, v, 0.5); o.connect(g); out(g, bus);
      const n = noise(t, 0.02), ng = perc(t, 0.25 * v, 0.015); n.connect(filt('highpass', 2500)).connect(ng); out(ng, bus);
    }
    function clap(t, v = 1, pan = 0) {
      for (let k = 0; k < 3; k++) {
        const n = noise(t + k * 0.011, 0.05), g = perc(t + k * 0.011, 0.55 * v, 0.03);
        n.connect(filt('bandpass', 1300, 1.2)).connect(g); out(g, drums, { pan, rev: 0.25 });
      }
      const n = noise(t + 0.033, 0.3), g = perc(t + 0.033, 0.45 * v, 0.22);
      n.connect(filt('bandpass', 1500, 0.9)).connect(g); out(g, drums, { pan, rev: 0.4 });
    }
    function snare(t, v = 1) {
      const n = noise(t, 0.2), g = perc(t, 0.5 * v, 0.14); n.connect(filt('bandpass', 2200, 0.8)).connect(g); out(g, drums, { rev: 0.2 });
      const o = osc('triangle', 210, t, 0.1); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); const og = perc(t, 0.35 * v, 0.08); o.connect(og); out(og, drums);
    }
    function hat(t, v = 1, open = false, pan = 0.2) {
      const n = noise(t, open ? 0.35 : 0.06), g = perc(t, 0.22 * v, open ? 0.28 : 0.045);
      n.connect(filt('highpass', 7800)).connect(g); out(g, drums, { pan });
    }
    function shaker(t, v = 1) {
      const n = noise(t, 0.08), g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09 * v, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      n.connect(filt('bandpass', 6500, 1.5)).connect(g); out(g, drums, { pan: -0.3 });
    }
    function crash(t, v = 1) {
      const n = noise(t, 2.2), g = perc(t, 0.35 * v, 2.0);
      n.connect(filt('highpass', 5000)).connect(g); out(g, drums, { rev: 0.5, pan: 0.15 });
    }

    // ── tonal instruments
    function bass(t, m, dur, v = 1, cut = 900) {
      const f = mtof(m), o1 = osc('sawtooth', f, t, dur + 0.1), o2 = osc('sine', f / 2, t, dur + 0.1);
      const lp = filt('lowpass', cut, 6);
      lp.frequency.setValueAtTime(cut * 2.8, t); lp.frequency.exponentialRampToValueAtTime(cut * 0.45, t + Math.min(0.22, dur));
      const g = adsr(t, 0.005, 0.32 * v, dur * 0.85, 0.06), sg = adsr(t, 0.005, 0.5 * v, dur * 0.85, 0.06);
      o1.connect(lp).connect(g); out(g, music); o2.connect(sg); out(sg, music);
    }
    function pad(t, notes, dur, v = 1, { cutoff = 1400, attack = 0.9, release = 1.4, rev = 0.55 } = {}) {
      const lp = filt('lowpass', cutoff * 0.5, 0.6);
      lp.frequency.setValueAtTime(cutoff * 0.5, t); lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.6);
      const g = adsr(t, attack, 0.06 * v, dur, release);
      notes.forEach((m, i) => {
        for (const det of [-9, 0, 9]) {
          const o = osc('sawtooth', mtof(m), t, dur + release + 0.1); o.detune.value = det + (rnd() - 0.5) * 4;
          const pan = ac.createStereoPanner(); pan.pan.value = ((i / Math.max(1, notes.length - 1)) - 0.5) * 0.8 + det / 40;
          o.connect(pan).connect(lp);
        }
      });
      lp.connect(g); out(g, music, { rev });
    }
    function bell(t, m, v = 1, { pan = 0, rev = 0.45, del = 0.25, decay = 1.6, ratio = 3.5 } = {}) {
      const f = mtof(m), car = osc('sine', f, t, decay + 0.2), mod = osc('sine', f * ratio, t, decay + 0.2);
      const mg = ac.createGain(); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6);
      mod.connect(mg).connect(car.frequency);
      const g = perc(t, 0.16 * v, decay); car.connect(g); out(g, music, { pan, rev, del });
    }
    function pluck(t, m, v = 1, { pan = 0, del = 0.3, rev = 0.25 } = {}) {
      const f = mtof(m), o = osc('triangle', f, t, 0.5), o2 = osc('sine', f * 2, t, 0.3);
      const g = perc(t, 0.16 * v, 0.42), g2 = perc(t, 0.06 * v, 0.15);
      o.connect(g); o2.connect(g2); out(g, music, { pan, del, rev }); out(g2, music, { pan, del, rev });
    }
    function lead(t, m, dur, v = 1, pan = 0) {
      const f = mtof(m), lp = filt('lowpass', 1800, 4);
      lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(1300, t + 0.18);
      const g = adsr(t, 0.004, 0.085 * v, dur * 0.8, 0.08);
      for (const [type, det] of [['sawtooth', -7], ['square', 7], ['sawtooth', 1200]]) {
        const o = osc(type, f, t, dur + 0.15); o.detune.value = det; o.connect(lp);
      }
      lp.connect(g); out(g, music, { pan, del: 0.35, rev: 0.25 });
    }
    function stab(t, notes, v = 1) {
      const lp = filt('lowpass', 3200, 2); lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
      const g = perc(t, 0.07 * v, 0.24);
      notes.forEach((m, i) => { for (const det of [-12, 12]) { const o = osc('sawtooth', mtof(m), t, 0.3); o.detune.value = det; o.connect(lp); } });
      lp.connect(g); out(g, music, { rev: 0.3, del: 0.15 });
    }

    // ── sound design
    function ping(t, kind, pan, m) {
      const v = 0.8;
      if (kind === 'MAIL') { // swoosh + blip
        const n = noise(t, 0.2), bp = filt('bandpass', 1200, 2), g = perc(t, 0.12, 0.16);
        bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(5000, t + 0.14);
        n.connect(bp).connect(g); out(g, sfx, { pan });
        bell(t + 0.05, m, 0.7 * v, { pan, rev: 0.15, del: 0.05, decay: 0.35, ratio: 2 });
      } else if (kind === 'CALENDAR') { // two-tone ding
        bell(t, m, 0.9 * v, { pan, rev: 0.15, del: 0.08, decay: 0.45, ratio: 1 });
        bell(t + 0.08, m + 5, 0.8 * v, { pan, rev: 0.15, del: 0.08, decay: 0.5, ratio: 1 });
      } else if (kind === 'CHAT') { // pop
        const o = osc('sine', mtof(m), t, 0.12); o.frequency.setValueAtTime(mtof(m) * 1.6, t); o.frequency.exponentialRampToValueAtTime(mtof(m) * 0.9, t + 0.07);
        const g = perc(t, 0.3 * v, 0.1); o.connect(g); out(g, sfx, { pan, del: 0.06 });
      } else if (kind === 'CLIENT') { // knock-knock marimba
        for (const dt of [0, 0.09]) { const o = osc('sine', mtof(m - 12), t + dt, 0.2), o2 = osc('sine', mtof(m - 12) * 3.9, t + dt, 0.08);
          const g = perc(t + dt, 0.32 * v, 0.18), g2 = perc(t + dt, 0.08, 0.05); o.connect(g); o2.connect(g2); out(g, sfx, { pan }); out(g2, sfx, { pan }); }
      } else { // VIDEO: square bleep
        const o = osc('square', mtof(m), t, 0.12), lp = filt('lowpass', 2400), g = perc(t, 0.1 * v, 0.1);
        o.connect(lp).connect(g); out(g, sfx, { pan, del: 0.1 });
      }
    }
    function tick(t, hi, v = 1) {
      const n = noise(t, 0.03), g = perc(t, 0.22 * v, 0.018);
      n.connect(filt('bandpass', hi ? 4200 : 3000, 6)).connect(g); out(g, sfx, { pan: hi ? 0.25 : -0.25 });
    }
    function riser(t0, t1, v = 1, f0 = 300, f1 = 9000) {
      const n = noise(t0, t1 - t0), bp = filt('bandpass', f0, 3), g = ac.createGain();
      bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t1);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.28 * v, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
      n.connect(bp).connect(g); out(g, sfx, { rev: 0.3 });
      const o = osc('sawtooth', 110, t0, t1 - t0), lp = filt('lowpass', 1200), og = ac.createGain();
      o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1);
      og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.05 * v, t1 - 0.02); og.gain.linearRampToValueAtTime(0, t1);
      o.connect(lp).connect(og); out(og, sfx, { rev: 0.3, del: 0.2 });
    }
    function reverseSwell(t0, t1, v = 1) {
      const n = noise(t0, t1 - t0), g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4 * v, t1 - 0.005); g.gain.linearRampToValueAtTime(0, t1);
      n.connect(filt('highpass', 3500)).connect(g); out(g, sfx, { pan: 0 });
    }
    function whoosh(t, dur, v = 1, dir = 1) {
      const n = noise(t, dur), bp = filt('bandpass', 400, 1.6), g = ac.createGain(), p = ac.createStereoPanner();
      bp.frequency.setValueAtTime(dir > 0 ? 300 : 4000, t); bp.frequency.exponentialRampToValueAtTime(dir > 0 ? 4500 : 250, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * v, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      p.pan.setValueAtTime(dir > 0 ? 0.7 : -0.7, t); p.pan.linearRampToValueAtTime(dir > 0 ? -0.7 : 0.7, t + dur);
      n.connect(bp).connect(g).connect(p).connect(sfx);
    }
    function boom(t, v = 1) {
      const o = osc('sine', 70, t, 3); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.6);
      const g = perc(t, 0.9 * v, 2.6); o.connect(g); out(g, sfx, { rev: 0.2 });
      const n = noise(t, 1.5), lp = filt('lowpass', 900), ng = perc(t, 0.4 * v, 1.2);
      lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.2);
      n.connect(lp).connect(ng); out(ng, sfx, { rev: 0.6 });
    }
    function glitchBurst(t0, t1) {
      for (let t = t0; t < t1; t += 1 / 32 * 2) {
        const o = osc('square', 200 + rnd() * 2400, t, 0.03), g = perc(t, 0.06, 0.025);
        o.connect(g); out(g, sfx, { pan: rnd() * 2 - 1 });
      }
    }
    function chirp(t, v = 1, pan = 0) {
      const n = 2 + Math.floor(rnd() * 3), base = 2800 + rnd() * 1800;
      for (let k = 0; k < n; k++) {
        const s = t + k * (0.07 + rnd() * 0.04), o = osc('sine', base, s, 0.1);
        o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * 1.7, s + 0.035); o.frequency.exponentialRampToValueAtTime(base * 1.15, s + 0.07);
        const g = adsr(s, 0.008, 0.05 * v, 0.04, 0.03); o.connect(g); out(g, sfx, { pan, rev: 0.45 });
      }
    }
    function ambience(t0, t1, v = 1) {
      const n = noise(t0, t1 - t0, brownBuf), lp = filt('lowpass', 520), g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12 * v, t0 + 1.2);
      g.gain.setValueAtTime(0.12 * v, t1 - 1); g.gain.exponentialRampToValueAtTime(0.0001, t1);
      const lfo = osc('sine', 0.23, t0, t1 - t0), lg = ac.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(lp.frequency);
      n.connect(lp).connect(g); out(g, sfx, { rev: 0.2 });
      // water lapping
      const n2 = noise(t0, t1 - t0), bp = filt('bandpass', 900, 0.9), g2 = ac.createGain(); g2.gain.value = 0;
      const lfo2 = osc('sine', 0.6, t0, t1 - t0), lg2 = ac.createGain(); lg2.gain.value = 0.018 * v; lfo2.connect(lg2).connect(g2.gain);
      n2.connect(bp).connect(g2); out(g2, sfx, { pan: 0.2, rev: 0.3 });
    }
    function scribble(t0, t1, v = 1) { // pen on paper while the blueprint draws
      const n = noise(t0, t1 - t0), bp = filt('bandpass', 2600, 1.5), g = ac.createGain(); g.gain.value = 0;
      const lfo = osc('square', 9, t0, t1 - t0), lg = ac.createGain(); lg.gain.value = 0.02 * v; lfo.connect(lg).connect(g.gain);
      const env = ac.createGain(); env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(1, t0 + 0.4); env.gain.setValueAtTime(1, t1 - 0.4); env.gain.exponentialRampToValueAtTime(0.0001, t1);
      n.connect(bp).connect(g).connect(env); out(env, sfx, { pan: -0.2, rev: 0.2 });
    }
    function splat(t, v = 1, pan = 0) {
      const n = noise(t, 0.4), lp = filt('lowpass', 1400, 2), g = perc(t, 0.6 * v, 0.28);
      lp.frequency.setValueAtTime(2800, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
      n.connect(lp).connect(g); out(g, sfx, { pan, rev: 0.25 });
      const o = osc('sine', 320, t, 0.2); o.frequency.exponentialRampToValueAtTime(70, t + 0.16); const og = perc(t, 0.4 * v, 0.18); o.connect(og); out(og, sfx, { pan });
    }
    function sprayCan(t0, t1) {
      for (const [dt, f] of [[-0.36, 3100], [-0.24, 3400], [-0.12, 2900]]) { // the rattle
        const n = noise(t0 + dt, 0.05), g = perc(t0 + dt, 0.3, 0.04); n.connect(filt('bandpass', f, 9)).connect(g); out(g, sfx, { pan: -0.3 });
      }
      const n = noise(t0, t1 - t0), bp = filt('bandpass', 5200, 0.7), g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.05); g.gain.setValueAtTime(0.3, t1 - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t1);
      const p = ac.createStereoPanner(); p.pan.setValueAtTime(-0.6, t0); p.pan.linearRampToValueAtTime(0.5, t1);
      n.connect(bp).connect(g).connect(p).connect(sfx);
    }
    function rewind(t0, t1) {
      for (let t = t0, k = 0; t < t1; t += 0.045, k++) {
        const o = osc('sawtooth', 1800 - k * 90, t, 0.05), lp = filt('lowpass', 3000), g = perc(t, 0.05, 0.04);
        o.frequency.exponentialRampToValueAtTime(Math.max(120, 900 - k * 60), t + 0.04);
        o.connect(lp).connect(g); out(g, sfx, { pan: Math.sin(k) * 0.6 });
      }
    }
    function sparkle(t0, t1, notes, density = 0.08, v = 1) {
      for (let t = t0; t < t1; t += density * (0.6 + rnd() * 0.8)) bell(t, notes[Math.floor(rnd() * notes.length)], 0.35 * v, { pan: rnd() * 1.6 - 0.8, rev: 0.6, del: 0.3, decay: 1.2, ratio: 4.01 });
    }

    // ══════════════════════════════════════ THE SCORE
    const T = (window.Spot && Spot.timeline) || { NOTIF_TIMES: [], CARDS: [] };

    // ACT 1 · the noise (0 – 6 s): pulse bass on D, accelerating pings & ticks, riser, collapse
    for (let t = 0; t < 5.5; t += t < 4 ? 0.25 : 0.125) {
      const op = t / 5.5;
      bass(t, 26, t < 4 ? 0.2 : 0.11, 0.25 + 0.7 * op * op, 220 + 1200 * op * op);
    }
    pad(0, [50, 57, 62, 63], 5.6, 0.4, { cutoff: 900, attack: 3.5, release: 0.3, rev: 0.4 }); // D–A–D–Eb: uneasy
    for (let t = 0; t < 5.5; t += t < 2 ? 0.5 : t < 4 ? 0.25 : 0.125) tick(t, Math.round(t / 0.125) % 2 === 0, 0.7 + t / 8);
    const PING_NOTES = [74, 77, 79, 81, 84, 86, 81, 79];
    T.CARDS.forEach((c, i) => ping(c.t0, c.app, (c.x / 1920 - 0.5) * 1.4, PING_NOTES[i % PING_NOTES.length]));
    for (let k = 0; k < 4; k++) kick(2 + k * 0.5, 0.55);
    for (let k = 0; k < 6; k++) kick(4 + k * 0.25, 0.5 + k * 0.06);
    for (let k = 0; k < 7; k++) clap(2 + k * 0.5 + 0.25, 0.25);
    riser(2.5, 5.5, 0.9);
    glitchBurst(5.5, 5.95);
    reverseSwell(5.0, 6.0, 1.1);

    // ACT 2 · here. (6 – 8 s) — silence, then air
    boom(6.0, 0.9);
    [65, 69, 72, 76, 79].forEach((m, i) => bell(6.02 + i * 0.07, m, 0.8, { rev: 0.8, del: 0.35, decay: 3.2, pan: (i - 2) * 0.3 }));
    pad(6.0, [53, 57, 60, 64, 67], 2.2, 0.55, { cutoff: 1600, attack: 1.0, release: 1.2 });
    whoosh(6.05, 1.3, 0.6, 1);
    ambience(6.0, 19.6, 1);
    chirp(6.9, 0.8, 0.6); chirp(7.6, 0.7, -0.5); chirp(8.6, 0.6, 0.4);

    // ACT 3 · the castle draws itself (8 – 14 s): pads + bell arpeggio + pen
    const castleChords = [
      [7.5, [58, 62, 65, 69], [46]],      // Bbmaj7
      [10, [57, 60, 65, 69], [45]],      // F/A
      [12, [55, 58, 62, 65], [43]],      // Gm7
      [13, [55, 60, 64, 67], [48]],      // C
    ];
    castleChords.forEach(([t, ch, b], i) => {
      const dur = (castleChords[i + 1] ? castleChords[i + 1][0] : 14) - t;
      pad(t, ch, dur, 0.75, { cutoff: 1500 + i * 300, attack: i === 0 ? 0.6 : 0.3, release: 0.9 });
      bass(t, b[0], dur * 0.95, 0.35, 300);
    });
    {
      const arp = { 7.5: [70, 74, 77, 81], 10: [69, 72, 77, 81], 12: [67, 70, 74, 77], 13: [67, 72, 76, 79] };
      const keys = Object.keys(arp).map(Number);
      for (let t = 7.5; t < 14; t += 0.125) {
        const k = keys.filter(x => x <= t + 1e-6).pop(), ch = arp[k], step = Math.round((t - 7.5) / 0.125);
        const m = ch[step % 4] + (Math.floor(step / 4) % 2 ? 12 : 0);
        pluck(t, m, 0.4 + 0.35 * Math.min(1, (t - 7.5) / 3), { pan: (step % 2 ? 0.35 : -0.35), del: 0.25 });
      }
    }
    scribble(7.4, 10.2, 1);
    for (let i = 0; i < 12; i++) tick(7.6 + i * 0.22, i % 2, 0.35);
    riser(9.2, 11.0, 0.45, 600, 6000);
    sparkle(11.0, 12.2, [81, 84, 86, 89, 93], 0.09, 0.8);
    for (let k = 0; k < 6; k++) kick(10 + k * 0.5, 0.28);
    for (let t = 12; t < 14; t += 0.5) { kick(t, 0.45); hat(t + 0.25, 0.5); }

    // ACT 4 · the park grows (14 – 18 s): groove creeps in, marimba pops, counters, build
    const parkChords = [[14, [57, 60, 62, 65], 38], [16, [58, 62, 65, 69], 46]];   // Dm7 → Bbmaj7
    parkChords.forEach(([t, ch, b]) => { pad(t, ch, 2, 0.8, { cutoff: 2200, attack: 0.15, release: 0.5 }); for (let k = 0; k < 8; k++) bass(t + k * 0.25, b + (k % 4 === 3 ? 12 : 0), 0.2, 0.45, 500); });
    for (let t = 14; t < 18; t += 0.5) kick(t, 0.6);
    for (let t = 14; t < 17; t += 1) clap(t + 0.5, 0.5);
    for (let t = 14; t < 18; t += 0.125) shaker(t, (Math.round(t * 8) % 2 ? 0.6 : 1));
    for (let t = 14.25; t < 18; t += 0.5) hat(t, 0.55);
    {
      const pops = [74, 77, 79, 81, 84, 81, 79, 86, 89, 86, 84, 81];
      for (let i = 0; i < 12; i++) pluck(14.05 + i * 0.125, pops[i], 0.7, { pan: (i % 2 ? 0.5 : -0.5), del: 0.15, rev: 0.3 });
    }
    chirp(14.3, 0.7, -0.6); chirp(15.1, 0.6, 0.7);
    // counters
    [[16.0, 0.8], [16.3, 0.8], [16.6, 0.8]].forEach(([t0, d], j) => {
      for (let t = t0; t < t0 + d; t += 0.0625) { const o = osc('sine', 1500 + (t - t0) / d * 900 + j * 200, t, 0.03), g = perc(t, 0.03, 0.02); o.connect(g); out(g, sfx, { pan: (j - 1) * 0.6 }); }
      bell(t0 + d, 81 + j * 3, 0.8, { pan: (j - 1) * 0.6, decay: 0.8, ratio: 2 });
    });
    for (let t = 17; t < 17.875; t += t < 17.5 ? 0.125 : 0.0625) snare(t, 0.4 + (t - 17) * 0.8);
    riser(16.4, 17.875, 1.0, 250, 11000);

    // ACT 5 · the drop: street-art soul + montage (18 – 24 s)
    boom(18.0, 0.8); crash(18.0, 1.2);
    splat(18.0, 1, -0.6); splat(18.25, 0.9, 0.6); splat(18.5, 0.8, 0.4); splat(18.75, 0.7, 0);
    sprayCan(18.85, 19.58);
    const dropChords = [[18, [62, 65, 69], 38], [19, [58, 62, 65], 34], [20, [60, 65, 69], 41], [21, [60, 64, 67], 36],
                        [22, [62, 65, 69], 38], [23, [58, 62, 65], 34], [23.5, [60, 64, 67], 36]];
    for (let t = 18; t < 24; t += 0.5) {
      kick(t, 1);
      // side-chain pump on the music bus
      music.gain.setValueAtTime(0.35, t); music.gain.linearRampToValueAtTime(0.85, t + 0.22);
      hat(t + 0.25, 0.9, true, 0.25);
      hat(t + 0.125, 0.4); hat(t + 0.375, 0.4);
      if (Math.round((t - 18) / 0.5) % 2 === 1) clap(t, 1);
    }
    music.gain.setValueAtTime(0.85, 24);
    dropChords.forEach(([t, ch, root], i) => {
      const end = dropChords[i + 1] ? dropChords[i + 1][0] : 24;
      for (let s = t; s < end - 0.01; s += 0.25) {
        const step = Math.round((s - 18) / 0.25);
        bass(s, root + ([0, 12, 0, 7][step % 4] || 0), 0.22, 0.85, 700);
        if (step % 2 === 1) stab(s, ch.map(m => m + 12), 1);
      }
    });
    const HOOK = [
      [69, null, 74, 72, 69, null, 65, 67], [69, null, 72, 74, 77, 76, 74, 72],
      [69, null, 74, 72, 69, null, 65, 67], [72, 74, 76, 77, 79, 77, 76, 74],
      [81, null, 79, 77, 76, null, 74, 72], [74, 76, 77, null, 81, null, 79, null],
    ];
    HOOK.forEach((bar, b) => bar.forEach((m, k) => { if (m) lead(18 + b + k * 0.125 * 1, m, 0.12, 0.9, k % 2 ? 0.2 : -0.2); }));
    // one whoosh per montage card
    for (let k = 0; k < (T.MONTAGE_N || 8); k++) whoosh(20 + k * 0.5 - 0.06, 0.2, 0.7, k % 2 ? -1 : 1);
    rewind(23.5, 23.95);
    reverseSwell(23.0, 24.0, 1);

    // ACT 6 · end card (24 – 30 s): the night, the castle, the promise
    boom(24.0, 1); crash(24.0, 0.8);
    [62, 65, 69, 72, 77].forEach((m, i) => bell(24.02 + i * 0.06, m, 0.7, { rev: 0.8, del: 0.3, decay: 3, pan: (i - 2) * 0.3 }));
    pad(24, [46, 58, 62, 65, 69, 72], 2, 1.1, { cutoff: 2600, attack: 0.05, release: 1.2 });  // Bbmaj9
    bass(24, 34, 1.9, 0.6, 400);
    pad(26, [48, 57, 60, 64, 65, 67], 1.6, 1.1, { cutoff: 2600, attack: 0.3, release: 1.0 });  // F/C
    bass(26, 36, 1.5, 0.55, 400);
    pad(27.5, [41, 53, 57, 60, 64, 67, 69], 2.1, 1.25, { cutoff: 3000, attack: 0.15, release: 1.6 }); // Fmaj9 — home
    bass(27.5, 29, 2.0, 0.6, 400);
    for (const t of [24, 25, 26, 27]) kick(t, 0.5);
    for (let t = 24.5; t < 27.5; t += 1) clap(t, 0.35);
    for (let t = 24; t < 27.5; t += 0.25) hat(t + 0.125, 0.35);
    { const arp = [77, 81, 84, 88, 89, 88, 84, 81]; for (let i = 0; i < 24; i++) pluck(24 + i * 0.125, arp[i % 8] - (i >= 16 ? 0 : 0), 0.5 * (1 - i / 30), { pan: i % 2 ? 0.4 : -0.4, del: 0.3 }); }
    bell(26.0, 81, 1, { decay: 2.4, rev: 0.7, ratio: 2 }); bell(26.0, 69, 0.8, { decay: 2.4, rev: 0.7, ratio: 2 }); kick(26.0, 0.6);
    // CTA shimmer
    [77, 81, 84, 88, 91, 93].forEach((m, i) => bell(27.5 + i * 0.05, m, 0.6, { rev: 0.7, del: 0.35, decay: 2.5, pan: (i - 2.5) * 0.25 }));
    sparkle(27.6, 29.2, [84, 88, 89, 91, 93, 96], 0.12, 0.6);
    boom(27.5, 0.45);
    ambience(24.0, 30, 0.8);
    for (let k = 0; k < 4; k++) chirp(24.6 + k * 1.2, 0.3, (k % 2 ? 0.7 : -0.7)); // crickets-ish
    // breaths: hard gaps right before the two big hits
    master.gain.setValueAtTime(0.9, 5.94); master.gain.linearRampToValueAtTime(0.0001, 5.955); master.gain.setValueAtTime(0.0001, 5.995); master.gain.linearRampToValueAtTime(0.9, 6.0);
    master.gain.setValueAtTime(0.9, 17.86); master.gain.linearRampToValueAtTime(0.0001, 17.875); master.gain.setValueAtTime(0.0001, 17.995); master.gain.linearRampToValueAtTime(0.9, 18.0);
    // master fade
    master.gain.setValueAtTime(0.9, 28.6); master.gain.linearRampToValueAtTime(0.0001, 29.98);
  }

  async function render() {
    const ac = new OfflineAudioContext(2, SR * DUR, SR);
    build(ac);
    const buf = await ac.startRendering();
    // normalise to -1 dBFS
    let peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
    const k = peak > 0 ? 0.89 / peak : 1;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
    return buf;
  }

  function toWav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, bytes = 44 + n * ch * 2, ab = new ArrayBuffer(bytes), v = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, bytes - 8, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, buf.sampleRate, true);
    v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return ab;
  }

  window.SpotAudio = { render, toWav, SR, DUR };
})();
