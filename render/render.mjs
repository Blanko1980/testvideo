// Frame-exact offline render of the spot to MP4 (H.264 + AAC).
//
//   npm run render                      → out/design-offices-koenigsplatz-30s.mp4
//   npm run render -- --stills 4.2,13   → out/still-4.20.png, out/still-13.00.png
//   npm run render -- --audio-only      → re-renders the soundtrack, remuxes the existing MP4
//
// Every frame is drawn by spot.js at an exact timestamp, and the soundtrack is
// rendered with an OfflineAudioContext, so the result is identical on every run.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const stills = opt('--stills')?.split(',').map(Number);
const fps = Number(opt('--fps') || 30);
const outFile = path.resolve(opt('--out') || path.join(outDir, 'design-offices-koenigsplatz-30s.mp4'));

// tiny static server (fonts don't load reliably from file://)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html?render`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(url);
await page.evaluate(() => window.SpotRender.ready);

const run = (cmd, argv) => new Promise((res, rej) =>
  spawn(cmd, argv, { stdio: 'inherit' }).on('close', c => (c ? rej(new Error(`${cmd} exited ${c}`)) : res())));

const grab = async t => Buffer.from((await page.evaluate(t => window.SpotRender.frame(t), t)).split(',')[1], 'base64');

try {
  if (stills) {
    for (const t of stills) {
      const f = path.join(outDir, `still-${t.toFixed(2)}.png`);
      fs.writeFileSync(f, await grab(t));
      console.log('wrote', path.relative(root, f));
    }
  } else {
    console.log('rendering soundtrack…');
    const wav = path.join(outDir, 'soundtrack.wav');
    fs.writeFileSync(wav, Buffer.from(await page.evaluate(() => window.SpotRender.wav()), 'base64'));

    if (args.includes('--audio-only')) {
      const tmp = outFile.replace(/\.mp4$/, '.tmp.mp4');
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', outFile, '-i', wav, '-map', '0:v', '-map', '1:a',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', tmp]);
      fs.renameSync(tmp, outFile);
      console.log(`remuxed ${path.relative(root, outFile)}`);
      process.exitCode = 0;
    } else {

    const total = Math.round(30 * fps);
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-tune', 'animation',
      '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest',
      outFile,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg exited ' + c)) : res())));

    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      const png = await grab(i / fps);
      if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 30 === 0) process.stdout.write(`\rframe ${i}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    ff.stdin.end();
    await done;
    console.log(`\nwrote ${path.relative(root, outFile)}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
