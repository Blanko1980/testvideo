// Frame-accurate export: renders every frame + the offline soundtrack in headless Chromium,
// then muxes them with ffmpeg into an MP4.
//
//   node render.mjs                       → dist/schloss-drehna-spot.mp4 (1080p30)
//   node render.mjs --fps 60              → 60 fps
//   node render.mjs --stills 3.5,12,25    → PNG stills only (dist/still-*.png)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { readFile } from 'fs/promises';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.execPath, '../../lib/node_modules/playwright')); }

const root = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const FPS = +(args.fps || 30);
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    res.writeHead(200, { 'content-type': types[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.error('page error:', e));
page.on('console', m => m.type() === 'error' && console.error('console:', m.text()));
await page.goto(`http://localhost:${port}/index.html`);
await page.evaluate(async () => { await Promise.all(Spot.fonts.map(f => document.fonts.load(f))); await document.fonts.ready; });

async function frame(t, type = 'image/jpeg', q = 0.95) {
  const b64 = await page.evaluate(([t, type, q]) => {
    const c = document.getElementById('c'); Spot.render(c.getContext('2d'), t);
    return c.toDataURL(type, q).split(',')[1];
  }, [t, type, q]);
  return Buffer.from(b64, 'base64');
}

if (args.stills) {
  for (const s of args.stills.split(',')) {
    writeFileSync(join(out, `still-${(+s).toFixed(2)}.png`), await frame(+s, 'image/png'));
    console.log('still', s);
  }
} else {
  console.log('rendering soundtrack…');
  const wavB64 = await page.evaluate(async () => {
    const buf = await SpotAudio.render(), ab = SpotAudio.toWav(buf);
    let s = ''; const u = new Uint8Array(ab);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const wav = join(out, 'schloss-drehna-soundtrack.wav');
  writeFileSync(wav, Buffer.from(wavB64, 'base64'));

  const mp4 = join(out, 'schloss-drehna-spot.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 20), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '256k', '-shortest', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(30 * FPS), t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const buf = await frame(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % FPS === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', c => (c ? j(new Error('ffmpeg ' + c)) : r())));
  console.log('wrote', mp4);
}
await browser.close();
server.close();
