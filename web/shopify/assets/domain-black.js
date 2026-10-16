/* ═══════════════════════════════════════════════════════════════════════
   DOMAIN BLACK — theme behaviour

   Liquid renders every word and every photograph. This file only draws
   what cannot be written down: the engraving, the sloshing rules, the
   sillage, and the flacon in three dimensions.

   Everything here degrades. The flacon needs WebGL; the reveals need
   GSAP; the smooth scroll needs Lenis. With none of them the page is
   still the page, because every reveal animates *from* its resting
   state — so the resting state is what a visitor without them sees.
   ═══════════════════════════════════════════════════════════════════════ */
/* The only static import is the catalogue, which depends on nothing.
   three.js is 687 KB; importing the flacon and the pixel field statically
   meant one failed request took this whole module down with it — and with
   it every reveal, the seal, the engraving, the sloshing rules. They are
   loaded dynamically below, after the page already reads, so a failure
   costs exactly the thing that failed. */
import { MOVEMENTS } from './catalogue.js';

function showFallback (sel, why) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.setAttribute('data-fallback', '');
  const p = el.querySelector('.stage-fallback p, .pixels-fallback p');
  if (p && why) p.textContent = why;
}

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root  = document.documentElement;
const DPR   = Math.min(devicePixelRatio || 1, 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $     = (s, r = document) => r.querySelector(s);
const $$    = (s, r = document) => [...r.querySelectorAll(s)];

/* ── film grain ───────────────────────────────────────────────────────
   Campaign photography is rarely as large as a hero wants it to be.
   Grain is what lets a frame be shown big without pretending to be
   sharper than it is. */
(function grain () {
  const c = document.createElement('canvas');
  c.width = c.height = 180;
  const g = c.getContext('2d');
  if (!g) return;
  const d = g.createImageData(180, 180);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 26;
  }
  g.putImageData(d, 0, 0);
  try { root.style.setProperty('--grain', `url("${c.toDataURL()}")`); } catch (e) {}
})();

/* ── the hero: her world changes when she opens it ───────────────────
   One custom property, --open, drives the photograph's warmth, the
   sillage, the glow on the tagline and the stone lifting off the 3D
   flacon. The merchant supplies the photograph; the mask is centred on
   wherever they say the flacon sits in it. */
let openTarget = 0, openNow = 0, openPinned = false;
const setOpen = v => { openTarget = clamp(v, 0, 1); };

const hero  = $('[data-hero]');
const frame = $('[data-frame]');

if (hero && hero.dataset.shot) {
  // Absolute, deliberately. A relative url() inside a custom property is
  // resolved against the stylesheet that declares it, and this theme's CSS
  // lives in assets/ — so "./assets/x.png" would be fetched from
  // assets/assets/x.png. Shopify's own asset_url is already absolute; this
  // keeps a local preview honest too.
  const shotAbs = new URL(hero.dataset.shot, location.href).href;
  root.style.setProperty('--shot', `url("${shotAbs}")`);
}
if (hero) {
  // where the flacon sits in the photograph, as a percentage
  if (hero.dataset.fx) root.style.setProperty('--fx', hero.dataset.fx + '%');
  if (hero.dataset.fy) root.style.setProperty('--fy', hero.dataset.fy + '%');
}
if (frame) {
  const pop = () => { openPinned = true; setOpen(1); };
  frame.addEventListener('click', pop);
  frame.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pop(); }
  });
}

/* ── sillage ──────────────────────────────────────────────────────── */
(function sillage () {
  const cv = $('[data-sillage]');
  if (!cv) return;
  const g = cv.getContext('2d');
  if (!g) return;
  let w = 0, h = 0, live = true;
  const parts = [];
  const fx = parseFloat(hero?.dataset.fx ?? 23.5) / 100;
  const fy = parseFloat(hero?.dataset.fy ?? 53) / 100;

  const size = () => {
    w = cv.width = Math.round((cv.clientWidth || 300) * DPR);
    h = cv.height = Math.round((cv.clientHeight || 533) * DPR);
  };
  size();
  addEventListener('resize', size, { passive: true });

  const spawn = () => ({
    x: w * (fx + (Math.random() - 0.5) * 0.10),
    y: h * (fy - 0.06 + Math.random() * 0.05),
    r: (0.7 + Math.random() * 2.2) * DPR,
    vy: -(0.10 + Math.random() * 0.30) * DPR,
    vx: (Math.random() - 0.5) * 0.10 * DPR,
    a: 0, life: 0, max: 220 + Math.random() * 260,
    sway: Math.random() * Math.PI * 2
  });

  function frameLoop () {
    requestAnimationFrame(frameLoop);
    if (!live) return;
    const open = parseFloat(getComputedStyle(root).getPropertyValue('--open')) || 0;
    g.clearRect(0, 0, w, h);
    if (open < 0.04) { parts.length = 0; return; }
    if (parts.length < 46 * open) parts.push(spawn());
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life++; p.sway += 0.012;
      p.x += p.vx + Math.sin(p.sway) * 0.16 * DPR;
      p.y += p.vy; p.vy *= 0.9985;
      const k = p.life / p.max;
      p.a = Math.sin(Math.min(1, k) * Math.PI) * 0.5 * open;
      if (k >= 1 || p.y < -20) { parts.splice(i, 1); continue; }
      const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
      rg.addColorStop(0, `rgba(226,196,152,${p.a})`);
      rg.addColorStop(1, 'rgba(226,196,152,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2); g.fill();
    }
  }
  if (!still) requestAnimationFrame(frameLoop);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(e => { live = e[0].isIntersecting; }).observe(cv);
  }
})();

/* ── the photograph, taken apart ──────────────────────────────────
   Scroll position through the tall section *is* the movement index, so
   the sequence runs with no animation library at all. A movement button
   scrolls to its position, which keeps one source of truth. */
const pixelsSec = $('[data-pixels]');
const pfCanvas  = $('[data-pixelfield]');
const movesEl   = $('[data-moves]');
let pf = null;

if (movesEl) {
  movesEl.innerHTML = MOVEMENTS.map((m, i) =>
    '<li><button type="button" data-mv="' + i + '" aria-current="' + (i === 0) + '">' +
      '<span class="mv-n">' + m.num + '</span>' +
      '<span class="mv-t">' + m.name + '</span>' +
      '<span class="mv-d">' + m.note + '</span>' +
    '</button></li>').join('');
}

/* Progress comes from the section's own viewport rect, not from scrollY:
   getBoundingClientRect is right whichever element actually scrolled. */
function pixelsProgress () {
  if (!pixelsSec) return null;
  const r = pixelsSec.getBoundingClientRect();
  const total = r.height - innerHeight;
  if (total <= 10) return null;
  return clamp(-r.top / total, 0, 1);
}
function pixelsSpan () {
  if (!pixelsSec) return null;
  const r = pixelsSec.getBoundingClientRect();
  const total = r.height - innerHeight;
  return total > 10 ? { top: r.top + scrollY, total } : null;
}

if (pfCanvas && pixelsSec) (async () => {
  const shot = pixelsSec.dataset.shot;
  const shape = pixelsSec.dataset.shape || pixelsSec.dataset.shapeAsset;
  if (!shot) {
    showFallback('[data-pixels]', 'Choose a campaign photograph in the theme editor.');
    return;
  }
  try {
    const { createPixelField } = await import('./pixelfield.js');
    pf = createPixelField(pfCanvas, {
      photo: new URL(shot, location.href).href,
      shape: shape ? new URL(shape, location.href).href : null
    });
    if (!pf) {
      showFallback('[data-pixels]',
        'This movement needs WebGL 2 with float render targets, which this browser does not offer. Everything else on this page reads the same.');
      return;
    }
    const api = await pf.ready;
    if (!api) {
      pf = null;
      showFallback('[data-pixels]',
        'The campaign photograph could not be read, so there is nothing to take apart here.');
      return;
    }
    const out = $('[data-pf-count]');
    if (out) out.textContent = api.state.count.toLocaleString() + ' particles';
  } catch (e) {
    pf = null;
    showFallback('[data-pixels]',
      'The pixel field could not be loaded. Everything else on this page reads the same.');
  }
})();

if (movesEl) {
  movesEl.addEventListener('click', e => {
    const b = e.target.closest('[data-mv]');
    if (!b) return;
    const i = +b.dataset.mv;
    const span = pixelsSpan();
    if (!span) { if (pf) pf.setMovement(i); return; }
    const y = span.top + (i / (MOVEMENTS.length - 1)) * span.total;
    if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.1 });
    else scrollTo({ top: y, behavior: still ? 'auto' : 'smooth' });
  });
}

let shownMove = -1;
function updateMoveLabels (i) {
  if (i === shownMove) return;
  shownMove = i;
  const m = MOVEMENTS[i]; if (!m) return;
  const set = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
  set('[data-mv-num]', m.num); set('[data-mv-name]', m.name); set('[data-mv-note]', m.note);
  $$('[data-mv]').forEach(b => b.setAttribute('aria-current', String(+b.dataset.mv === i)));
}

/* ── the sloshing rules ───────────────────────────────────────────────
   A meniscus drawn across the page, pushed by how fast you are
   scrolling. It overshoots and settles, because liquid does. */
const liquids = $$('[data-liquid]')
  .map(cv => { const g = cv.getContext('2d'); return g ? { cv, g, phase: Math.random() * 100, live: true } : null; })
  .filter(Boolean);

let scrollV = 0, lastY = scrollY;

function drawLiquid (L, t) {
  const { cv, g } = L;
  const w = cv.width = Math.round((cv.clientWidth || 800) * DPR);
  const h = cv.height = Math.round((cv.clientHeight || 76) * DPR);
  g.clearRect(0, 0, w, h);

  const mid = h * 0.52;
  const amp = (2.2 + Math.min(16, Math.abs(scrollV) * 0.5)) * DPR;
  const tilt = clamp(scrollV * 0.22, -10, 10) * DPR;
  const at = (u) => mid
    + Math.sin(u * 7.2 + t * 0.9 + L.phase) * amp
    + Math.sin(u * 17.5 - t * 1.6 + L.phase) * amp * 0.34
    + (u - 0.5) * tilt;

  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 6 * DPR) g.lineTo(x, at(x / w));
  g.lineTo(w, h); g.closePath();
  const fill = g.createLinearGradient(0, mid - amp * 2, 0, h);
  fill.addColorStop(0, 'rgba(216,181,137,.16)');
  fill.addColorStop(1, 'rgba(216,181,137,0)');
  g.fillStyle = fill; g.fill();

  g.beginPath();
  for (let x = 0; x <= w; x += 4 * DPR) { const y = at(x / w); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.strokeStyle = 'rgba(226,196,152,.5)';
  g.lineWidth = 1 * DPR;
  g.stroke();
}

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => {
    es.forEach(e => { const L = liquids.find(l => l.cv === e.target); if (L) L.live = e.isIntersecting; });
  }, { rootMargin: '80px' });
  liquids.forEach(L => io.observe(L.cv));
}

/* ── guilloché ────────────────────────────────────────────────────────
   A hypotrochoid swept with a precessing phase, which is how an
   engine-turning lathe cuts a rosette. Engraved once to an offscreen
   bitmap at device resolution, then shared by every plate on the page. */
function engrave (size, o) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return c;
  const mid = size / 2;
  const scale = mid * 0.96 / (Math.abs(o.R - o.r) + Math.abs(o.d));
  g.translate(mid, mid);
  g.lineWidth = o.weight;
  g.lineJoin = 'round';
  for (let p = 0; p < o.turns; p++) {
    const k = p / o.turns;
    const dd = o.d * (1 + k * o.spread);
    const ph = k * o.precess;
    g.strokeStyle = 'rgba(216,181,137,' + (o.alpha * (1 - k * 0.45)).toFixed(3) + ')';
    g.beginPath();
    for (let i = 0; i <= o.steps; i++) {
      const t = (i / o.steps) * Math.PI * 2 * o.wraps;
      const a = (o.R - o.r) * Math.cos(t + ph) + dd * Math.cos(((o.R - o.r) / o.r) * t + ph);
      const b = (o.R - o.r) * Math.sin(t + ph) - dd * Math.sin(((o.R - o.r) / o.r) * t + ph);
      if (i === 0) g.moveTo(a * scale, b * scale); else g.lineTo(a * scale, b * scale);
    }
    g.stroke();
  }
  // cleared through the middle, the way a certificate vignette is
  g.globalCompositeOperation = 'destination-out';
  const hole = g.createRadialGradient(0, 0, 0, 0, 0, mid * 0.40);
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(0.62, 'rgba(0,0,0,.92)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole;
  g.beginPath(); g.arc(0, 0, mid * 0.40, 0, Math.PI * 2); g.fill();
  return c;
}

const plates = $$('[data-plate]');
if (plates.length) {
  const plate = engrave(Math.round(520 * DPR), {
    R: 170, r: 31, d: 97, turns: 13, wraps: 13, steps: 900,
    spread: 0.07, precess: Math.PI * 2, alpha: 0.30, weight: 0.85
  });
  const paint = cv => {
    const g = cv.getContext('2d'); if (!g) return;
    cv.width = Math.round((cv.clientWidth || 220) * DPR);
    cv.height = Math.round((cv.clientHeight || 290) * DPR);
    const side = Math.max(cv.width, cv.height) * 1.1;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(plate, (cv.width - side) / 2, (cv.height - side) / 2, side, side);
  };
  requestAnimationFrame(() => plates.forEach(paint));
  addEventListener('resize', () => plates.forEach(paint), { passive: true });
}

/* ── the seal's teeth, struck rather than drawn by hand ─────────────── */
const teeth = $('[data-seal-teeth]');
if (teeth) {
  let m = '';
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, L = i % 6 === 0 ? 9 : 5;
    m += '<line x1="' + (100 + Math.cos(a) * 70).toFixed(2) +
         '" y1="' + (100 + Math.sin(a) * 70).toFixed(2) +
         '" x2="' + (100 + Math.cos(a) * (70 + L)).toFixed(2) +
         '" y2="' + (100 + Math.sin(a) * (70 + L)).toFixed(2) +
         '" stroke="#d8b589" stroke-width="' + (i % 6 === 0 ? 1.1 : 0.6) +
         '" opacity="' + (i % 6 === 0 ? 0.9 : 0.5) + '"/>';
  }
  teeth.innerHTML = m;
}

/* ── the flacon ───────────────────────────────────────────────────── */
const stage = $('[data-stage]');
const canvas3d = $('[data-flacon]');
let flacon = null;

if (canvas3d) (async () => {
  try {
    const { createFlacon } = await import('./flacon.js');
    flacon = createFlacon(canvas3d);
    if (flacon) { flacon.setDomain(+(canvas3d.dataset.domain || 1), true); return; }
    showFallback('[data-stage]',
      'This browser cannot run WebGL, so the flacon does not turn here. Everything else on this page reads the same.');
  } catch (e) {
    showFallback('[data-stage]',
      'The 3D flacon could not be loaded. Everything else on this page reads the same.');
  }
})();

/* Each detail row carries the move it wants the object to make, so a
   merchant can add, remove or reorder them in the theme editor and the
   object still answers. */
let moveTo = null, moveT = 0;
$$('[data-spec]').forEach(row => {
  const go = () => {
    $$('[data-spec]').forEach(r => r.setAttribute('aria-current', String(r === row)));
    if (!flacon) return;
    moveTo = {
      spin:  parseFloat(row.dataset.spin  ?? 0),
      open:  parseFloat(row.dataset.open  ?? 0),
      tilt:  parseFloat(row.dataset.tilt  ?? 0),
      level: parseFloat(row.dataset.level ?? 0.45)
    };
    moveT = 0;
    flacon.state.spinV = 0;
  };
  row.addEventListener('mouseenter', go);
  row.addEventListener('click', go);
  row.addEventListener('focus', go);
  row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
});

/* ── choosing a world recolours the object ────────────────────────── */
const rail = $('[data-rail]');
function chooseWorld (el, spin) {
  if (!el || !rail) return;
  $$('[data-world]', rail).forEach(c => c.setAttribute('aria-current', String(c === el)));
  if (flacon && el.dataset.i != null) { flacon.setDomain(+el.dataset.i); if (spin) flacon.spinBy(spin); }
}
if (rail) {
  rail.addEventListener('click', e => chooseWorld(e.target.closest('[data-world]'), 0.010));
  // Whichever card is nearest the rail's centre is the one the object
  // wears. Scoped to the rail, which is its own scroller — a ScrollTrigger
  // pointed at it would need a scrollerProxy to behave.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      let best = null, bestRatio = 0.55;
      for (const e of entries) if (e.intersectionRatio > bestRatio) { bestRatio = e.intersectionRatio; best = e.target; }
      if (best) chooseWorld(best, 0);
    }, { root: rail, threshold: [0.55, 0.75, 0.95] });
    $$('[data-world]', rail).forEach(c => io.observe(c));
  }
}

/* ── one loop drives everything that is always moving ─────────────── */
let t0 = performance.now();
(function tick (now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
  const t = now / 1000;

  const y = scrollY;
  scrollV += ((y - lastY) - scrollV) * Math.min(1, dt * 12);
  lastY = y;
  scrollV *= Math.pow(0.12, dt);
  if (flacon) flacon.nudge(scrollV * 0.5);

  openNow += (openTarget - openNow) * Math.min(1, dt * (openPinned ? 2.6 : 7));
  root.style.setProperty('--open', openNow.toFixed(4));
  if (flacon && !moveTo) flacon.setOpen(openNow * 0.82);

  if (flacon && moveTo) {
    moveT = Math.min(1, moveT + dt * 1.25);
    const k = moveT * moveT * (3 - 2 * moveT);
    const s = flacon.state;
    const d = ((moveTo.spin - s.spin) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    s.spin += d * k * 0.12;
    s.tiltX += (moveTo.tilt - s.tiltX) * k * 0.12;
    flacon.setOpen(s.open + (moveTo.open - s.open) * k * 0.12);
    flacon.setLevel(s.level + (moveTo.level - s.level) * k * 0.12);
    if (moveT >= 1 && Math.abs(d) < 0.02) moveTo = null;
  }

  // the photograph's movement is just where you are in its section
  if (pf) {
    const p = pixelsProgress();
    if (p !== null) {
      pf.scrub(p * (MOVEMENTS.length - 1));
      updateMoveLabels(pf.movement());
    }
  }

  if (!still) liquids.forEach(L => { if (L.live) drawLiquid(L, t); });
})(t0);
liquids.forEach(L => drawLiquid(L, 0));   // never blank before motion starts

/* ═══ motion, where the libraries arrived ═══════════════════════════ */
if (!still && typeof window.Lenis !== 'undefined') {
  const lenis = new window.Lenis({ lerp: 0.078, wheelMultiplier: 0.92 });
  window.__lenis = lenis;
  if (typeof window.gsap !== 'undefined' && window.gsap.ticker) {
    if (window.ScrollTrigger) lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add(t => lenis.raf(t * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}

if (still || typeof window.gsap === 'undefined') {
  // No GSAP: show the hero part-warmed, so the page is never stuck
  // half-told for someone whose CDN is blocked.
  setOpen(still ? 1 : 0.18);
} else {
  const gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  // split only once motion is certain; at rest this is ordinary text
  $$('[data-word]').forEach(w => {
    const txt = w.textContent; w.textContent = '';
    for (const ch of txt) {
      const s = document.createElement('span');
      s.className = 'ch'; s.textContent = ch; w.appendChild(s);
    }
  });

  if ($('.wordmark .ch')) {
    gsap.timeline()
      .from('.wordmark .ch', { yPercent: 52, opacity: 0, duration: 1.15, ease: 'power3.out', stagger: 0.03 })
      .from('[data-frame]', { opacity: 0, scale: 0.94, duration: 1.3, ease: 'power3.out' }, 0.1)
      .from('.hero-sub', { opacity: 0, y: 10, duration: 0.8, ease: 'power2.out' }, 0.5)
      .from('.hero-say', { opacity: 0, duration: 1.2, ease: 'power2.out' }, 0.75)
      .from('.hero-note', { opacity: 0, y: 8, duration: 0.9, ease: 'power2.out' }, 0.95)
      .from('.scroll-cue', { opacity: 0, duration: 1, ease: 'power2.out' }, 1.15);
  }

  if (window.ScrollTrigger) {
    const ST = window.ScrollTrigger;

    if (hero) {
      ST.create({
        trigger: hero, start: 'top top', end: 'bottom top', scrub: true,
        onUpdate: self => { if (!openPinned) setOpen(self.progress * 2.1); }
      });
    }

    gsap.utils.toArray('[data-fade]').forEach(el => {
      gsap.from(el, { y: 18, opacity: 0, duration: 0.9, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });

    gsap.utils.toArray('[data-line]').forEach((el, i) => {
      gsap.from(el, { yPercent: 108, duration: 1.05, ease: 'power3.out', delay: i * 0.08,
        scrollTrigger: { trigger: el.closest('section') || el, start: 'top 72%', once: true } });
    });

    gsap.utils.toArray('[data-world]').forEach((el, i) => {
      gsap.from(el, { y: 26, opacity: 0, duration: 0.85, ease: 'power2.out', delay: (i % 5) * 0.06,
        scrollTrigger: { trigger: rail || el, start: 'top 78%', once: true } });
    });

    gsap.utils.toArray('.reg-table tbody tr').forEach((el, i) => {
      gsap.from(el, { opacity: 0, x: -12, duration: 0.6, ease: 'power2.out', delay: i * 0.05,
        scrollTrigger: { trigger: el.closest('table'), start: 'top 86%', once: true } });
    });

    gsap.utils.toArray('.seal .ink').forEach((p, i) => {
      const len = p.getTotalLength ? p.getTotalLength() : 600;
      gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', delay: i * 0.12,
          scrollTrigger: { trigger: '.seal', start: 'top 82%', once: true } });
    });
    if (teeth) {
      gsap.from('[data-seal-teeth] line', {
        opacity: 0, duration: 0.5, stagger: { each: 0.008, from: 'random' },
        scrollTrigger: { trigger: '.seal', start: 'top 82%', once: true } });
    }

    if (flacon && stage) {
      ST.create({
        trigger: stage.closest('section') || stage, start: 'top 70%', end: 'bottom 40%', scrub: 0.6,
        onUpdate: self => { if (!moveTo) flacon.setOpen(Math.sin(self.progress * Math.PI)); }
      });
    }
  }
}
