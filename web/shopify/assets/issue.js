/* ═══════════════════════════════════════════════════════════════════════
   ISSUE Nº 01 — the page's moving parts.

   Everything here enhances a page that already reads without it. The two
   heavy pieces, the press on the cover and the print on p. 22, are loaded
   with dynamic import(), so a failed request can cost the page its
   animation but never its content.

   One clock drives everything that follows the scroll. Each part reads
   the layout once per frame and writes only transforms, clip-paths and
   colours.
   ═══════════════════════════════════════════════════════════════════════ */

import { MOVEMENTS, photo } from './catalogue.js';

const root = document.documentElement;
root.classList.add('js');

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 4);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* the visitor's issue (set by the boot script, changed by the Studio):
   motion is read live, so the Studio's slider reaches every moving part */
const prefs = window.__dbStudio?.prefs || { motion: 100 };
const M = () => (still ? 0 : prefs.motion / 100);
const hex = h => { h = String(h).trim(); return /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null; };
const token = name => hex(getComputedStyle(root).getPropertyValue(name)) || [0xec, 0xe6, 0xdc];

/* ── smooth scroll, if the library arrived and motion is welcome ──── */
let lenis = null;
if (!still && typeof window.Lenis === 'function') {
  try { lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true }); } catch (e) { lenis = null; }
}
function scrollToY (y) {
  if (lenis) lenis.scrollTo(y, { duration: 1.2 });
  else scrollTo({ top: y, behavior: still ? 'auto' : 'smooth' });
}
function scrollToEl (el) {
  const top = el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(root).fontSize) * 3.4 + 8);
  scrollToY(Math.max(0, top));
}
function barOffset () { return parseFloat(getComputedStyle(root).fontSize) * 3.4 + 8; }
/* a long jump is a page turned, not a scroll: the old page sinks back, the
   new one rises over it (a same-document view transition, where supported) */
function turnTo (el) {
  const top = Math.max(0, el.getBoundingClientRect().top + scrollY - barOffset());
  const far = Math.abs(top - scrollY) > innerHeight * 1.5;
  if (M() > 0.2 && far && typeof document.startViewTransition === 'function') {
    let done = false;
    const jump = () => {
      if (done) return;
      done = true;
      if (lenis) lenis.scrollTo(top, { immediate: true, force: true }); else scrollTo(0, top);
    };
    const vt = document.startViewTransition(jump);
    // a slow device may take seconds to photograph the old page: past a
    // moment, drop the turn and simply arrive — a click is never left waiting
    const late = setTimeout(() => { vt.skipTransition?.(); jump(); }, 450);
    vt.updateCallbackDone?.finally(() => clearTimeout(late));
  } else scrollToEl(el);
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const el = id && document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  turnTo(el);
  try { history.replaceState(null, '', '#' + id); } catch (err) { /* a sandboxed frame may refuse */ }
});

/* ── the clock ───────────────────────────────────────────────────── */
const tickers = [];
let vh = innerHeight, vel = 0, lastY = scrollY;
addEventListener('resize', () => { vh = innerHeight; });
function frame (t) {
  if (lenis) lenis.raf(t);
  const y = scrollY;
  vel = lerp(vel, y - lastY, 0.18);
  lastY = y;
  for (const f of tickers) f(t, y);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* is an element anywhere near the screen? cheap gate for per-frame work */
function nearby (el, margin = 0.5) {
  const r = el.getBoundingClientRect();
  return r.bottom > -vh * margin && r.top < vh * (1 + margin);
}

/* ── the bar: solid once the cover has gone, folio, reading progress ─ */
const bar = $('#bar');
const folio = $('[data-folio]');
const progress = $('[data-progress]');
const pages = $$('[data-page]');
let shownFolio = '';
tickers.push((t, y) => {
  bar?.classList.toggle('is-solid', y > 24);
  const max = root.scrollHeight - vh;
  progress?.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
  let page = '01';
  for (const s of pages) if (s.getBoundingClientRect().top < vh * 0.42) page = s.dataset.page;
  if (page !== shownFolio && folio) { folio.textContent = page; shownFolio = page; }
});

/* ── the masthead: three plates, pulled into register ─────────────── */
const mast = $('[data-mast]');
if (mast) {
  const [c, m] = $$('.ink', mast);
  const t0 = performance.now();
  let last = '';
  tickers.push(t => {
    const intro = still ? 1 : easeOut(clamp((t - t0 - 120) / 1500, 0, 1));
    const v = still ? 0 : clamp(vel / 40, -1, 1) * M();
    const k = (1 - intro) * 1.0 + Math.abs(v) * 0.32;
    const key = k.toFixed(3) + v.toFixed(2);
    if (key === last) return;
    last = key;
    c.style.transform = `translate3d(${(-0.05 * k).toFixed(4)}em, ${(0.022 * k + v * 0.008).toFixed(4)}em, 0)`;
    m.style.transform = `translate3d(${(0.04 * k).toFixed(4)}em, ${(-0.03 * k - v * 0.01).toFixed(4)}em, 0)`;
    // the ink spreads a little when the page is moving: the weight axis follows speed
    mast.style.fontVariationSettings = `"wght" ${Math.round(400 + Math.min(1, Math.abs(v)) * 180)}`;
  });
}

/* ── the ribbon: the five names, driven by how fast you scroll ─────── */
const track = $('[data-marquee]');
if (track && !still) {
  let x = 0, dir = -1;
  tickers.push(() => {
    if (!nearby(track, 0.2)) return;
    const half = track.scrollWidth / 2;
    if (Math.abs(vel) > 0.4) dir = vel > 0 ? -1 : 1;
    x += dir * (0.45 + Math.min(14, Math.abs(vel)) * 0.55) * (0.2 + 0.8 * M());
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
  });
}

/* ── type the press has not reached yet sits in pale ink ──────────── */
const inked = $$('[data-ink]').map(el => {
  const words = [];
  const walk = node => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const s = document.createElement('span');
          s.className = 'w'; s.textContent = part;
          frag.append(s); words.push(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    }
  };
  walk(el);
  return { el, words, n: -1 };
});
if (!still) {
  tickers.push(() => {
    for (const it of inked) {
      const r = it.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const p = clamp((vh * 0.92 - r.top) / (vh * 0.5 + r.height * 0.5), 0, 1);
      const n = Math.round(p * it.words.length);
      if (n === it.n) continue;
      it.n = n;
      it.words.forEach((w, i) => w.classList.toggle('on', i < n));
    }
  });
} else inked.forEach(it => it.words.forEach(w => w.classList.add('on')));

/* ── plates develop from halftone into the photograph ─────────────── */
const plates = $$('.plate[data-develop]');
function develop (p) {
  p.classList.add('is-developed');
  const img = $('img', p);
  const done = () => p.classList.add('is-clear');
  img?.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 2600);           // a transition that never ran still ends
}
if (still || !('IntersectionObserver' in window) || !CSS.supports?.('mask-image', 'none') && !CSS.supports?.('-webkit-mask-image', 'none')) {
  plates.forEach(p => p.classList.add('is-developed', 'is-clear'));
} else {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { develop(e.target); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -10% 0px' });
  plates.forEach(p => io.observe(p));
}

/* ── the phone cover: a tall frame that pans across all five bottles —
      Sovereign first, then the middle as the page settles, then Empire
      as you scroll away ─────────────────────────────────────────────── */
const phone = matchMedia('(max-width: 700px)').matches;
const panner = { follow: null };
if (phone) {
  const coverEl = $('#cover'), shotImg = $('[data-press] .shot img');
  const t0 = performance.now();
  let last = -1;
  tickers.push(t => {
    if (!coverEl || !shotImg) return;
    const r = coverEl.getBoundingClientRect();
    if (r.bottom < 0) return;
    const intro = still ? 1 : clamp((t - t0) / 2600, 0, 1);
    const settle = intro < 1 ? 0.15 + 0.35 * (intro * intro * (3 - 2 * intro)) : 0.5;
    const away = clamp(-r.top / Math.max(1, r.height * 0.8), 0, 1);
    const pan = settle + away * 0.38 * M();
    if (Math.abs(pan - last) < 0.0005) return;
    last = pan;
    shotImg.style.setProperty('--pan', (pan * 100).toFixed(2) + '%');
    panner.follow?.(pan);
  });
}

/* ── the press: the cover photograph, printed and pulled into register ─ */
const press = $('[data-press]');
if (press) (async () => {
  const shot = $('.shot', press), img = $('img', press), cv = $('[data-press-canvas]', press);
  if (!img.complete) await new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
  if (!img.naturalWidth) return;
  const { createHalftone } = await import('./halftone.js');
  const paper = token('--paper').map(c => c / 255);     // the press prints on the issue's own paper
  let ht = createHalftone(cv, img, { paper });
  if (!ht) {
    // the theme serves its images from a CDN: try a CORS copy before giving up
    const anon = await new Promise(res => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = img.currentSrc || img.src;
    });
    if (anon) ht = createHalftone(cv, anon, { paper });
  }
  if (!ht) return;
  press.classList.add('is-pressing');
  if (!still) ht.print();
  if (phone) panner.follow = x => ht.focus(x);

  const at = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  if (fine) {
    shot.addEventListener('pointermove', e => { const [x, y] = at(e); ht.loupe(x, y, true); });
    shot.addEventListener('pointerleave', () => ht.loupe(0, 0, false));
  } else {
    let hold = 0;
    shot.addEventListener('pointerdown', e => {
      const [x, y] = at(e);
      hold = setTimeout(() => ht.loupe(x, y, true), 160);
    });
    shot.addEventListener('pointermove', e => { if (ht.state.loupeT) { const [x, y] = at(e); ht.loupe(x, y, true); } });
    const off = () => { clearTimeout(hold); ht.loupe(0, 0, false); };
    shot.addEventListener('pointerup', off);
    shot.addEventListener('pointercancel', off);
    shot.addEventListener('pointerleave', off);
  }
})().catch(() => {});

/* ── contents: the page under each entry, following the pointer ───── */
const toc = $('[data-toc]'), preview = $('[data-toc-preview]');
if (toc && preview && fine) {
  let tx = 0, ty = 0, x = 0, y = 0, on = false, px = 0;
  toc.addEventListener('pointerover', e => {
    const a = e.target.closest('a[data-preview]');
    if (!a) return;
    const src = photo(...a.dataset.preview.match(/^(.*)-(\d+)$/).slice(1));
    if (!preview.src.endsWith(src.replace(/^\.\//, ''))) preview.src = src;
    if (!on) { x = tx; y = ty; }
    on = true; preview.classList.add('is-on');
  });
  toc.addEventListener('pointerleave', () => { on = false; preview.classList.remove('is-on'); });
  addEventListener('pointermove', e => {
    // keep the plate on screen: a fixed element past the edge still widens the page
    const w = preview.offsetWidth || 250;
    tx = Math.min(e.clientX + 28, innerWidth - w - 12);
    ty = clamp(e.clientY - 120, 60, innerHeight - w * 1.25 - 12);
  }, { passive: true });
  tickers.push(() => {
    if (!on && !preview.classList.contains('is-on')) return;
    const nx = lerp(x, tx, 0.16), ny = lerp(y, ty, 0.16);
    const rot = clamp((nx - x) * 0.35, -9, 9);
    px = lerp(px, rot, 0.2);
    x = nx; y = ny;
    preview.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${px.toFixed(2)}deg)`;
  });
}

/* ── five worlds: the photograph wipes to each world, the paper tints ─ */
const ground = { rgb: token('--paper') };
const worlds = $('[data-worlds]');
if (worlds) {
  const arts = $$('[data-world]', worlds);
  const stage = $$('[data-stage]', worlds);
  const num = $('[data-stage-num]', worlds), cap = $('[data-stage-cap]', worlds), no = $('[data-stage-frame-no]', worlds);
  // by day each chapter tints the paper; by night it warms the dark with its lacquer
  let paper, tints;
  const relook = () => {
    paper = token('--paper');
    const night = root.dataset.light === 'night';
    tints = arts.map(a => {
      const lac = hex(getComputedStyle(a).getPropertyValue('--lac')) || paper;
      return night ? paper.map((c, j) => lerp(c, lac[j], 0.14)) : (hex(a.dataset.tint) || paper);
    });
  };
  relook();
  document.addEventListener('db:studio', relook);
  let active = -1;
  const frameEl = $('[data-stage-frame]', worlds);
  tickers.push(() => {
    const r = worlds.getBoundingClientRect();
    const inside = r.top < vh && r.bottom > 0;
    // how far each chapter has come on: 0 below the fold … 1 at the top
    const ps = arts.map((a, i) => i === 0 ? 1 : clamp((vh * 0.78 - a.getBoundingClientRect().top) / (vh * 0.55), 0, 1));
    const f = ps.slice(1).reduce((s, p) => s + p, 0);
    if (inside) {
      stage.forEach((im, i) => {
        if (!i) return;
        const p = still ? (ps[i] > 0.5 ? 1 : 0) : easeOut(ps[i]);
        im.style.setProperty('--wipe', ((1 - p) * 100).toFixed(2) + '%');
        im.style.setProperty('--z', (1 + (1 - p) * 0.08).toFixed(4));
      });
      const a = Math.round(f);
      if (a !== active && arts[a]) {
        active = a;
        const d = arts[a].dataset;
        if (num) num.textContent = d.num;
        if (cap) cap.textContent = d.name + ', catalogue';
        if (no) no.textContent = d.frame;
        // a pass of light across the new photograph, as across a turned page
        if (frameEl && M() > 0 && a > 0) { frameEl.classList.remove('is-lit'); void frameEl.offsetWidth; frameEl.classList.add('is-lit'); }
      }
    }
    // the paper takes the colour of the world it is in, and gives it back
    const enter = clamp((vh - r.top) / (vh * 0.7), 0, 1);
    const leave = clamp(r.bottom / (vh * 0.8), 0, 1);
    const w = Math.min(enter, leave);
    const i0 = Math.floor(f), i1 = Math.min(i0 + 1, tints.length - 1), k = f - i0;
    const tint = [0, 1, 2].map(j => lerp(tints[i0][j], tints[i1][j], k));
    ground.rgb = [0, 1, 2].map(j => lerp(paper[j], tint[j], w));
  });
} else document.addEventListener('db:studio', () => { ground.rgb = token('--paper'); });

/* ── after hours: the lights go down as the chapter comes up ────────── */
const nightSec = $('[data-night]');
const NIGHT = [12, 10, 9];
let lastBg = '';
tickers.push(() => {
  let nw = 0;
  if (nightSec) {
    const r = nightSec.getBoundingClientRect();
    const enter = clamp((vh * 0.95 - r.top) / (vh * 0.55), 0, 1);
    const leave = clamp((r.bottom - vh * 0.15) / (vh * 0.5), 0, 1);
    nw = Math.min(enter, leave);
    nw = nw * nw * (3 - 2 * nw);
  }
  const rgb = ground.rgb.map((c, j) => Math.round(lerp(c, NIGHT[j], nw)));
  const bg = `rgb(${rgb.join(',')})`;
  if (bg === lastBg) return;
  lastBg = bg;
  document.body.style.backgroundColor = bg;
  bar?.style.setProperty('--bar-bg', bg);
  root.classList.toggle('is-night', nw > 0.5);
});

/* ── the print: the lineup, taken apart to its dots ─────────────── */
const printSec = $('[data-pixels]');
const printCanvas = $('[data-pixelfield]');
const movesEl = $('[data-moves]');
let field = null;
function printSpan () {
  if (!printSec) return null;
  const top = printSec.getBoundingClientRect().top + scrollY;
  const total = printSec.offsetHeight - vh;
  return total > 10 ? { top, total } : null;
}
function printProgress () {
  if (!printSec) return null;
  const r = printSec.getBoundingClientRect();
  const total = r.height - vh;
  return total > 10 ? clamp(-r.top / total, 0, 1) : null;
}
function fallback (why) {
  if (!printSec) return;
  printSec.setAttribute('data-fallback', '');
  const p = $('[data-fallback-why]', printSec);
  if (p && why) p.textContent = why;
}
if (movesEl) {
  movesEl.innerHTML = MOVEMENTS.map((m, i) =>
    `<li><button type="button" data-mv="${i}" aria-current="${i === 0}"><span class="mv-n">${m.num}</span><span class="mv-t">${m.name}</span></button></li>`
  ).join('');
  movesEl.addEventListener('click', e => {
    const b = e.target.closest('[data-mv]');
    if (!b) return;
    const i = +b.dataset.mv;
    const span = printSpan();
    if (!span) { field?.setMovement(i); return; }
    scrollToY(span.top + (i / (MOVEMENTS.length - 1)) * span.total + 2);
  });
}
let shownMove = -1;
function moveLabels (i) {
  if (i === shownMove) return;
  shownMove = i;
  const m = MOVEMENTS[i];
  if (!m) return;
  const set = (s, v) => { const el = $(s); if (el) el.textContent = v; };
  set('[data-mv-num]', m.num); set('[data-mv-name]', m.name); set('[data-mv-note]', m.note);
  $$('[data-mv]').forEach(b => b.setAttribute('aria-current', String(+b.dataset.mv === i)));
}
if (printSec && printCanvas) {
  const go = async () => {
    try {
      const { createPixelField } = await import('./pixelfield.js');
      field = createPixelField(printCanvas, {
        photo: photo('lineup', 800),
        second: photo('celestial', 720),
        paper: true, pointSize: 0.034
      });
      if (!field) { fallback(); return; }
      const api = await field.ready;
      if (!api) { field = null; fallback('The photograph could not be read, so here it is as it was printed.'); return; }
      const out = $('[data-pf-count]');
      if (out) out.textContent = api.state.count.toLocaleString('en-US') + ' dots';
    } catch (e) {
      field = null;
      fallback('The print could not be loaded. Here is the photograph it is made from.');
    }
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '60% 0px' });
    io.observe(printSec);
  } else go();
  tickers.push(() => {
    const p = printProgress();
    if (p === null) return;
    const v = p * (MOVEMENTS.length - 1);
    field?.scrub(v);
    moveLabels(Math.round(v));
  });
}

/* ── contact sheet: rings, a loupe, and the frame opened whole ─────── */
const sheet = $('[data-sheet]');
if (sheet) {
  const frames = $$('.frame', sheet);
  // grease pencil: a loop that never quite closes, different every time
  const ringPath = seed => {
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pts = [];
    const a0 = rnd() * Math.PI * 2, turns = 1.06 + rnd() * 0.08, N = 72;
    const se = v => Math.sign(v) * Math.pow(Math.abs(v), 0.55);   // squarish, like a hand around a frame
    for (let i = 0; i <= N; i++) {
      const a = a0 + (i / N) * Math.PI * 2 * turns;
      const drift = 1 + (i / N) * 0.035 + (rnd() - 0.5) * 0.012;
      pts.push([50 + se(Math.cos(a)) * 48.5 * drift, 50 + se(Math.sin(a)) * 48.5 * drift]);
    }
    return 'M' + pts.map(p => p.map(v => v.toFixed(2)).join(' ')).join(' L');
  };
  frames.forEach((f, i) => {
    if (!f.hasAttribute('data-select')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ring'); svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ringPath(i + 3)); p.setAttribute('pathLength', '1');
    svg.append(p);
    $('button', f).append(svg);
  });
  if (still || !('IntersectionObserver' in window)) frames.forEach(f => f.classList.add('is-ringed'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-ringed'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -20% 0px' });
    frames.forEach(f => f.hasAttribute('data-select') && io.observe(f));
  }

  // the loupe — the full frame, held under glass at 2.4×
  const loupe = $('[data-loupe]');
  if (loupe && fine) {
    let cur = null, lx = 0, ly = 0, tx = 0, ty = 0;
    sheet.addEventListener('pointerover', e => {
      const b = e.target.closest('button[data-full]');
      if (!b || b === cur) return;
      cur = b;
      loupe.style.backgroundImage = `url("${b.dataset.full}")`;
      loupe.classList.add('is-on');
    });
    sheet.addEventListener('pointerleave', () => { cur = null; loupe.classList.remove('is-on'); });
    sheet.addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      if (!cur) return;
      const r = cur.getBoundingClientRect();
      const Z = 2.4, W = r.width * Z, H = r.height * Z;
      const fx = clamp((e.clientX - r.left) / r.width, 0, 1), fy = clamp((e.clientY - r.top) / r.height, 0, 1);
      loupe.style.backgroundSize = `${W}px ${H}px`;
      loupe.style.backgroundPosition = `${(-fx * W + 100).toFixed(1)}px ${(-fy * H + 100).toFixed(1)}px`;
      if (!e.target.closest('button[data-full]')) { cur = null; loupe.classList.remove('is-on'); }
    });
    tickers.push(() => {
      if (!loupe.classList.contains('is-on')) { lx = tx; ly = ty; return; }
      lx = lerp(lx, tx, 0.35); ly = lerp(ly, ty, 0.35);
      loupe.style.transform = `translate3d(${(lx - 100).toFixed(1)}px, ${(ly - 100).toFixed(1)}px, 0)`;
    });
  }

  // the lightbox
  const lb = $('#lightbox');
  const buttons = $$('button[data-full]', sheet);
  let at = 0;
  const show = i => {
    at = (i + buttons.length) % buttons.length;
    const b = buttons[at];
    $('#lbImg').src = b.dataset.full;
    $('#lbImg').alt = $('img', b).alt;
    $('#lbNo').textContent = b.dataset.no;
    $('#lbTitle').textContent = b.dataset.title;
    $('#lbPos').textContent = `${at + 1} of ${buttons.length}`;
  };
  if (lb && typeof lb.showModal === 'function') {
    sheet.addEventListener('click', e => {
      const b = e.target.closest('button[data-full]');
      if (!b) return;
      show(buttons.indexOf(b));
      lb.showModal();
      lenis?.stop();
      loupe?.classList.remove('is-on');
    });
    lb.addEventListener('click', e => {
      const c = e.target.closest('[data-lb]');
      if (c) { if (c.dataset.lb === 'close') lb.close(); else show(at + +c.dataset.lb); return; }
      if (e.target === lb) lb.close();
    });
    lb.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') show(at + 1);
      if (e.key === 'ArrowLeft') show(at - 1);
    });
    lb.addEventListener('close', () => { lenis?.start(); buttons[at]?.focus(); });
  }
}

/* ── the covers: a stack you can deal from ───────────────────────── */
const stack = $('[data-covers]');
if (stack) {
  const cards = $$('[data-cv]', stack);
  const count = $('[data-cv-count]');
  const N = cards.length;
  let top = 0, drag = null, tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const place = () => {
    cards.forEach((c, i) => {
      const n = (i - top + N) % N;
      c.style.zIndex = String(N - n);
      c.setAttribute('aria-hidden', String(n !== 0));
      if (n === 0 && drag) return;
      const tiltT = n === 0 ? ` rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)` : '';
      c.style.transform =
        `translate3d(${n * 5.5}%, ${-n * 2.6}%, ${-n * 70}px) rotate(${n * 2.4}deg)${tiltT}`;
      c.style.opacity = n > 3 ? '0' : '1';
      c.style.filter = n ? `brightness(${1 - n * 0.06})` : 'none';
    });
    if (count) count.textContent = `${top + 1} / ${N}`;
  };
  const step = d => { top = (top + d + N) % N; place(); sound.tink(0.9 + top * 0.04, 0.03); };
  place();
  $$('[data-cv-step]').forEach(b => b.addEventListener('click', () => step(+b.dataset.cvStep)));
  stack.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
  });
  stack.addEventListener('pointerdown', e => {
    const c = cards[top];
    if (!c.contains(e.target)) return;
    drag = { x0: e.clientX, t0: performance.now(), dx: 0, c };
    c.classList.add('is-dragging');
    c.setPointerCapture?.(e.pointerId);
  });
  stack.addEventListener('pointermove', e => {
    if (drag) {
      drag.dx = e.clientX - drag.x0;
      drag.c.style.transform = `translate3d(${drag.dx}px, 0, 0) rotate(${(drag.dx * 0.04).toFixed(2)}deg)`;
      return;
    }
    if (!fine || still) return;
    const r = stack.getBoundingClientRect();
    tilt.ty = ((e.clientX - r.left) / r.width - 0.5) * 10 * M();
    tilt.tx = -((e.clientY - r.top) / r.height - 0.5) * 8 * M();
  });
  const release = () => {
    if (!drag) return;
    const { dx, t0, c } = drag;
    const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
    c.classList.remove('is-dragging');
    drag = null;
    if (Math.abs(dx) > stack.clientWidth * 0.22 || (v > 0.5 && Math.abs(dx) > 20)) {
      // dealt: the card flies off its side, then goes to the back
      c.style.transform = `translate3d(${Math.sign(dx) * 130}%, -4%, 0) rotate(${Math.sign(dx) * 16}deg)`;
      sound.tink(0.8, 0.04);
      setTimeout(() => step(dx < 0 ? 1 : -1), still ? 0 : 260);
    } else place();
  };
  stack.addEventListener('pointerup', release);
  stack.addEventListener('pointercancel', release);
  stack.addEventListener('pointerleave', () => { tilt.tx = 0; tilt.ty = 0; });
  if (fine && !still) {
    tickers.push(() => {
      if (drag) return;
      const dx = tilt.tx - tilt.x, dy = tilt.ty - tilt.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.01) return;
      tilt.x += dx * 0.12; tilt.y += dy * 0.12;
      place();
    });
  }
}

/* ── the seal's ring of type turns as the page ends; the monogram,
      which is a photograph of the real one, stays upright ──────────── */
const seal = $('[data-seal]'), ring = $('[data-seal-ring]');
if (seal && ring && !still) {
  tickers.push(() => {
    if (!nearby(seal, 0.2)) return;
    const r = seal.getBoundingClientRect();
    const p = (vh - r.top) / (vh + r.height);
    ring.style.transform = `rotate(${(p * 120 - 40).toFixed(2)}deg)`;
  });
}

/* ── sound: glass and ice, synthesised, off until asked for ──────── */
const sound = (() => {
  const btn = $('[data-sound]');
  let ctx = null, on = false, noise = null, noiseGain = null, lastTink = 0;
  function start () {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // a bed of filtered noise that a wipe across the glass turns up
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2600; band.Q.value = 0.8;
    noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
    noise.connect(band).connect(noiseGain).connect(ctx.destination);
    noise.start();
  }
  function set (v) {
    on = v;
    btn?.setAttribute('aria-pressed', String(on));
    if (on) { start(); ctx?.resume?.(); tink(1.0); } else ctx?.suspend?.();
  }
  // a glass struck lightly: three inharmonic partials, each decaying
  function tink (pitch = 1, level = 0.05) {
    if (!on || !ctx) return;
    const now = ctx.currentTime;
    if (now - lastTink < 0.09) return;
    lastTink = now;
    for (const [f, a, d] of [[2093, 1, 0.9], [2797, 0.55, 0.6], [3951, 0.3, 0.4]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * pitch;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(level * a, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d);
      o.connect(g).connect(ctx.destination);
      o.start(now); o.stop(now + d + 0.05);
    }
  }
  function rub (amount) {
    if (!on || !ctx || !noiseGain) return;
    const now = ctx.currentTime;
    noiseGain.gain.cancelScheduledValues(now);
    noiseGain.gain.setTargetAtTime(Math.min(0.05, amount * 1.2), now, 0.02);
    noiseGain.gain.setTargetAtTime(0, now + 0.08, 0.12);
  }
  // always off at load: a browser only lets sound start from a click anyway
  btn?.addEventListener('click', () => set(!on));
  return { tink, rub, get on () { return on; } };
})();

/* ── in the glass: the notes pour in when their chapter arrives ───── */
const pours = $$('[data-pour]');
if (still || !('IntersectionObserver' in window)) pours.forEach(p => p.classList.add('is-poured'));
else {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-poured');
    io.unobserve(e.target);
    $$('.note', e.target).forEach((n, i) => setTimeout(() => sound.tink(1 + i * 0.12, 0.03), 120 + i * 90));
  }), { rootMargin: '0px 0px -12% 0px' });
  pours.forEach(p => io.observe(p));
}

/* ── depth: each plate's photograph drifts against its frame ──────── */
const deep = $$('[data-parallax]').map(el => ({ el, img: $('img', el), last: '' })).filter(d => d.img);
if (!still && deep.length) {
  tickers.push(() => {
    for (const d of deep) {
      const r = d.el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      const p = clamp((r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
      const v = (-p * 3.5 * M()).toFixed(2) + '%';
      if (v !== d.last) { d.last = v; d.img.style.setProperty('--py', v); }
    }
  });
}

/* ── after hours: cold glass over the Empire photograph ───────────── */
const pane = $('[data-glass]');
let glass = null;
if (pane) {
  const go = async () => {
    try {
      const img = $('img', pane), cv = $('[data-glass-canvas]', pane);
      if (!img.complete) await new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
      if (!img.naturalWidth) return;
      const { createGlass } = await import('./glass.js');
      glass = createGlass(cv, img, {
        still, aspect: 1.25, clear: [0.5, 0.47, 0.22, 0.33],
        onWipe: d => sound.rub(d)
      });
      if (!glass) return;
      pane.classList.add('is-cold');
      // a phone has no pointer passing over the glass: wipe one stroke for it
      if (!fine && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver(es => {
          if (es[0].intersectionRatio > 0.55) { io.disconnect(); setTimeout(() => glass.demo(), 500); }
        }, { threshold: [0, 0.55, 1] });
        io.observe(pane);
      }
    } catch (e) { /* the photograph stays as it is */ }
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '80% 0px' });
    io.observe(pane);
  } else go();
}

/* ── weight: buttons lean toward the pointer, on a spring ─────────── */
const magnets = (fine && !still) ? $$('[data-magnetic]').map(el => ({
  el, inner: el.querySelector(':scope > i, :scope > span'),
  k: parseFloat(el.dataset.magnetic) || 0.35,
  x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, hot: false
})) : [];
if (magnets.length) {
  addEventListener('pointermove', e => {
    for (const m of magnets) {
      const r = m.el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const reach = Math.max(r.width, r.height) / 2 + 36;
      const hot = Math.hypot(dx, dy) < reach && M() > 0;
      if (hot && !m.hot) sound.tink(1.35, 0.025);
      m.hot = hot;
      // a lean, not a chase: the pull eases off toward a small ceiling
      const lim = Math.min(14, Math.max(r.width, r.height) * 0.12) * M() + 1e-6;
      m.tx = hot ? lim * Math.tanh(dx * m.k / lim) : 0;
      m.ty = hot ? lim * Math.tanh(dy * m.k / lim) : 0;
    }
  }, { passive: true });
  let lastT = 0;
  tickers.push(t => {
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    for (const m of magnets) {
      // a damped spring: it overshoots a little when let go, then settles
      m.vx += ((m.tx - m.x) * 190 - m.vx * 17) * dt;
      m.vy += ((m.ty - m.y) * 190 - m.vy * 17) * dt;
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (Math.abs(m.x) + Math.abs(m.y) + Math.abs(m.vx) + Math.abs(m.vy) < 0.02 && !m.hot) {
        if (m.el.style.transform) { m.el.style.transform = ''; if (m.inner) m.inner.style.transform = ''; }
        continue;
      }
      m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
      if (m.inner) m.inner.style.transform = `translate3d(${(m.x * 0.45).toFixed(2)}px, ${(m.y * 0.45).toFixed(2)}px, 0)`;
    }
  });
}

/* ── the cursor: a point, and a ring with weight that names what it is over ─ */
const cursor = $('.cursor');
if (cursor && fine && !still) {
  root.classList.add('has-cursor');
  const ringEl = $('.cursor-ring', cursor), dot = $('.cursor-dot', cursor), label = $('[data-cursor-label]', cursor);
  let px = -100, py = -100, rx = -100, ry = -100, rvx = 0, rvy = 0, shown = '';
  addEventListener('pointermove', e => {
    px = e.clientX; py = e.clientY;
    const over = e.target.closest?.('[data-cursor]');
    const text = over ? over.dataset.cursor : '';
    if (text !== shown) { shown = text; label.textContent = text; cursor.classList.toggle('is-label', !!text); }
  }, { passive: true });
  addEventListener('pointerdown', () => cursor.classList.add('is-down'));
  addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  document.addEventListener('pointerleave', () => { px = py = -100; });
  let lastT = 0;
  tickers.push(t => {
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    rvx += ((px - rx) * 260 - rvx * 24) * dt;
    rvy += ((py - ry) * 260 - rvy * 24) * dt;
    rx += rvx * dt; ry += rvy * dt;
    dot.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    ringEl.style.translate = `${rx.toFixed(1)}px ${ry.toFixed(1)}px`;
  });
}

/* ── between pages: the photograph you clicked becomes the product page's
      (a cross-document view transition, on a store that opts in) ──────── */
let handed = null;
function hand (el) {
  if (handed) handed.style.viewTransitionName = '';
  handed = el;
  if (el) el.style.viewTransitionName = 'db-plate';
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href*="/products/"]');
  const world = a && a.closest('[data-world]');
  if (!world) return;
  const i = $$('[data-world]').indexOf(world);
  const staged = $$('[data-stage]')[i];
  hand(staged && staged.offsetParent ? staged : $('.world-photo img', world));
});
addEventListener('pageshow', () => hand(null));   // back from the product page

/* ── keeping a frame: through the viewer's own save dialog where the page
      is framed by one (claude.ai), otherwise as an ordinary download ─── */
let saver;
function saveCap () {
  if (saver === undefined) {
    saver = (window.claude && typeof window.claude.use === 'function')
      ? Promise.race([window.claude.use('downloads'), new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null)
      : Promise.resolve(null);
  }
  return saver;
}
async function keep (filename, blob) {
  if (!blob) throw new Error('nothing to keep');
  const dl = await saveCap();
  if (dl) { await dl.save({ filename, data: blob }); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
async function keepFrom (make, filename, say, button) {
  if (button) button.disabled = true;
  try {
    await keep(filename, await make());
    say('Kept as ' + filename + '.');
    sound.tink(1.2, 0.04);
  } catch (e) {
    say(e && e.code === 'declined' ? 'Not kept.' : 'This browser would not hand the frame over.');
  } finally { if (button) button.disabled = false; }
}
const css = rgb => `rgb(${rgb.join(',')})`;

/* ── the tools: dials beside a plate, and a frame you can keep ──────── */
function tool (name, { dial, act }) {
  const el = $(`[data-tool="${name}"]`);
  if (!el) return;
  const btn = $('[data-tool-toggle]', el), panel = $('[data-tool-panel]', el), note = $('[data-tool-note]', el);
  const say = t => { if (note) note.textContent = t; };
  btn?.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
  });
  $$('input[data-dial]', el).forEach(input => {
    const out = $(`[data-dial-out="${input.dataset.dial}"]`, el);
    const fill = () => input.style.setProperty('--fill', ((input.value - input.min) / (input.max - input.min) * 100).toFixed(1) + '%');
    fill();
    input.addEventListener('input', () => {
      fill();
      if (out) out.textContent = input.value + '%';
      dial(input.dataset.dial, input.value / 100, say);
    });
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-tool-act]');
    if (b) act(b.dataset.toolAct, say, b);
  });
}
const noGlass = say => say('The glass needs WebGL, which this browser is not offering.');
tool('glass', {
  dial: (k, v, say) => (glass ? glass.set({ [k]: v }) : noGlass(say)),
  act: (a, say, b) => {
    if (!glass) return noGlass(say);
    if (a === 'mist') { glass.mistOver(); sound.rub(0.04); say('Breathed on. Wipe it again.'); }
    if (a === 'wipe') { glass.wipeClean(); sound.rub(0.05); say('Wiped clean. It mists back the way breath does.'); }
    if (a === 'keep') keepFrom(() => glass.snapshot(), 'DomainBlack_AfterHours_Empire.png', say, b);
  }
});
tool('print', {
  dial: (k, v) => { if (k === 'dot') field?.setDot(v); if (k === 'swirl') field?.setSwirl(v); },
  act: (a, say, b) => {
    if (a !== 'keep') return;
    const m = MOVEMENTS[field ? field.movement() : 0];
    keepFrom(() => (field ? field.snapshot(css(token('--paper'))) : null),
      `DomainBlack_ThePrint_${(m ? m.name : 'Plate').replace(/[^A-Za-z]+/g, '')}.png`, say, b);
  }
});

/* ── your line: the house's type, your words, beside the bottle ────── */
const lineSec = $('[data-line]');
let line = null;
if (lineSec) {
  const go = () => import('./yourline.js').then(({ createLine }) => {
    line = createLine(lineSec, {
      still,
      motion: M,
      world: prefs.world,
      tink: (p, l) => sound.tink(p, l),
      save: (make, name, say, button) => keepFrom(make, name, say, button)
    });
  }).catch(() => { /* the still plate and its caption stay */ });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '60% 0px' });
    io.observe(lineSec);
  } else go();
}

/* ── the studio: the issue, made yours ─────────────────────────────── */
let studio = null;
import('./studio.js').then(({ createStudio }) => {
  studio = createStudio({
    still,
    onChange: (p, why) => {
      lastBg = '';                                   // repaint the ground in the new paper
      document.dispatchEvent(new CustomEvent('db:studio', { detail: { prefs: p, why } }));
      sound.tink(why === 'light' && p.light === 'night' ? 0.75 : 1.1, 0.03);
    }
  });
  if (!studio) throw new Error('no studio');
}).catch(() => { const b = $('[data-studio-open]'); if (b) b.style.display = 'none'; });

/* hooks for the test bench */
window.__issue = { get field () { return field; }, get glass () { return glass; }, get studio () { return studio; }, get line () { return line; }, keep, MOVEMENTS };
