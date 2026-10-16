/* Renders the five flacons to flat product images, so the showcase can use
   the actual bottle without opening five WebGL contexts on the page.
   Run after any change to web/assets/flacon.js:
       node scripts/render-flacons.mjs                                   */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import pw from '/opt/node-tools/node_modules/playwright/index.js';

const ROOT = join(process.cwd(), 'web');
const OUT = join(ROOT, 'assets');
const PORT = 8749;
const W = 660, H = 820;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mjs': 'text/javascript' };

const PAGE = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}canvas{display:block;width:${W}px;height:${H}px}</style>
<canvas id="c"></canvas>
<script type="importmap">{"imports":{"three":"/assets/three.module.min.js"}}</script>
<script type="module">
import { createFlacon, DOMAINS } from '/assets/flacon.js';
const f = createFlacon(document.getElementById('c'));
window.__f = f; window.__n = DOMAINS.length;
f.setZoom(0.74);                       // fill the plate, it is a product shot
window.__pose = (i, spin) => {
  f.setDomain(i, true);                // instant: a still has nothing to fade
  f.state.domain = i;
  f.state.spin = spin; f.state.spinV = 0;
  f.state.tiltX = 0.045; f.state.tiltY = 0; f.setOpen(0);
  f.state.surf = 0; f.state.surfV = 0; f.state.surfX = 0; f.state.surfXV = 0;
};
window.__ready = !!f;
</script>`;

const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE);
  }
  try {
    const buf = await readFile(join(ROOT, url.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': TYPES[extname(url)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });

const names = await page.evaluate(() => window.__f.DOMAINS.map(d => d.name.toLowerCase()));
await mkdir(OUT, { recursive: true });

// each lot gets its own angle, so the five read as a set of photographs
// rather than one render recoloured five times
const ANGLES = [-0.30, 0.00, 0.34, -0.14, 0.52];

for (let i = 0; i < names.length; i++) {
  await page.evaluate(([i, a]) => window.__pose(i, a), [i, ANGLES[i]]);
  await page.waitForTimeout(700);                     // let the colour settle
  const shot = await page.locator('#c').screenshot({ omitBackground: true });
  const file = join(OUT, `flacon-${names[i]}.png`);
  await writeFile(file, shot);
  console.log(`✓ ${names[i].padEnd(10)} ${(shot.length / 1024).toFixed(0)} KB  →  ${file}`);
}

if (errs.length) { console.log('ERRORS:', errs.join(' | ')); }
await browser.close();
server.close();
process.exit(errs.length ? 1 : 0);
