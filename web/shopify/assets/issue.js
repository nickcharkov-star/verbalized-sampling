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
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const el = id && document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  scrollToEl(el);
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
    const v = still ? 0 : clamp(vel / 40, -1, 1);
    const k = (1 - intro) * 1.0 + Math.abs(v) * 0.32;
    const key = k.toFixed(3) + v.toFixed(2);
    if (key === last) return;
    last = key;
    c.style.transform = `translate3d(${(-0.05 * k).toFixed(4)}em, ${(0.022 * k + v * 0.008).toFixed(4)}em, 0)`;
    m.style.transform = `translate3d(${(0.04 * k).toFixed(4)}em, ${(-0.03 * k - v * 0.01).toFixed(4)}em, 0)`;
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
    x += dir * (0.45 + Math.min(14, Math.abs(vel)) * 0.55);
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

/* ── the press: the cover photograph, printed and pulled into register ─ */
const press = $('[data-press]');
if (press) (async () => {
  const shot = $('.shot', press), img = $('img', press), cv = $('[data-press-canvas]', press);
  if (!img.complete) await new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
  if (!img.naturalWidth) return;
  const { createHalftone } = await import('./halftone.js');
  const paper = [0xec / 255, 0xe6 / 255, 0xdc / 255];
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
const worlds = $('[data-worlds]');
if (worlds) {
  const arts = $$('[data-world]', worlds);
  const stage = $$('[data-stage]', worlds);
  const num = $('[data-stage-num]', worlds), cap = $('[data-stage-cap]', worlds), no = $('[data-stage-frame-no]', worlds);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const paper = hex('#ece6dc');
  const tints = arts.map(a => hex(a.dataset.tint || '#ece6dc'));
  let active = -1, lastBg = '';
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
      }
    }
    // the paper takes the colour of the world it is in, and gives it back
    const enter = clamp((vh - r.top) / (vh * 0.7), 0, 1);
    const leave = clamp(r.bottom / (vh * 0.8), 0, 1);
    const w = Math.min(enter, leave);
    const i0 = Math.floor(f), i1 = Math.min(i0 + 1, tints.length - 1), k = f - i0;
    const tint = [0, 1, 2].map(j => lerp(tints[i0][j], tints[i1][j], k));
    const bg = 'rgb(' + [0, 1, 2].map(j => Math.round(lerp(paper[j], tint[j], w))).join(',') + ')';
    if (bg !== lastBg) {
      lastBg = bg;
      document.body.style.backgroundColor = bg;
      bar?.style.setProperty('--bar-bg', bg);
    }
  });
}

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
  const step = d => { top = (top + d + N) % N; place(); };
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
    tilt.ty = ((e.clientX - r.left) / r.width - 0.5) * 10;
    tilt.tx = -((e.clientY - r.top) / r.height - 0.5) * 8;
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

/* hooks for the test bench */
window.__issue = { get field () { return field; }, MOVEMENTS };
