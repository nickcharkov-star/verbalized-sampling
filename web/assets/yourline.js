/* ═══════════════════════════════════════════════════════════════════════
   YOUR LINE — the house's type, your words, beside the real bottle.

   A small poster press. The visitor sets a line; it is drawn in Bodoni
   (or Jost capitals) on the bottle's own lacquer, beside that bottle's
   catalogue photograph, with a running head like the issue's. Two kinds
   of motion, both typographic: Echo (the line repeated as a fading
   outline that breathes) and Trail (the line following the pointer, or
   its own slow path, with copies left behind).

   The photograph is drawn whole, at 4:5, exactly as shot. The type has a
   box of its own and is clipped to it, so it can never cross the bottle.

   Everything is drawn in the format's own pixels (1080 wide) and scaled:
   the preview, the kept image and the kept clip are the same drawing.
   ═══════════════════════════════════════════════════════════════════════ */

import { DOMAINS, photo } from './catalogue.js';

export const FORMATS = { story: [1080, 1920], post: [1080, 1350], square: [1080, 1080] };
const INK = '#171513', PAPER = '#f5f1ea';
const FACES = {
  italic: px => `italic 400 ${px}px "Bodoni Moda", Didot, Georgia, serif`,
  roman: px => `400 ${px}px "Bodoni Moda", Didot, Georgia, serif`,
  caps: px => `500 ${px}px "Jost", Futura, "Avenir Next", sans-serif`
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function createLine (section, { still = false, motion = () => 1, save, tink = () => {}, world } = {}) {
  const canvas = section.querySelector('[data-line-canvas]');
  const form = section.querySelector('[data-line-form]');
  const stage = section.querySelector('[data-line-stage]');
  if (!canvas || !form || !canvas.getContext) return null;
  const g = canvas.getContext('2d');
  if (!g) return null;

  const st = {
    text: 'It’s Yours.', world: DOMAINS.some(d => d.key === world) ? world : 'empire',
    face: 'italic', motion: still ? 'still' : 'echo', size: 1, echo: 6,
    format: 'story', bottle: true, clear: false
  };
  const note = section.querySelector('[data-line-note]');
  const say = t => { if (note) note.textContent = t; };
  const dom = () => DOMAINS.find(d => d.key === st.world);

  /* ── the photographs, fetched as they are first wanted ──────────── */
  const photos = {};
  function picture (key) {
    if (photos[key]) return photos[key];
    const im = new Image();
    im.decoding = 'async';
    // ask for a readable copy so the frame can be kept; a server without
    // CORS refuses that outright, so fall back to a plain one to preview
    im.crossOrigin = 'anonymous';
    im.onerror = () => { if (im.crossOrigin) { im.crossOrigin = null; im.src = photo(key, 1080) + ''; } };
    im.onload = () => kick();
    im.src = photo(key, 1080);
    photos[key] = im;
    return im;
  }
  picture(st.world);

  /* ── where things go, in the format's own pixels ────────────────── */
  function layout (W, H) {
    const f = st.format, m = W * 0.075, withBottle = st.bottle && !st.clear;
    const head = H * (f === 'story' ? 0.045 : 0.06), foot = H - H * (f === 'story' ? 0.03 : 0.04);
    if (!withBottle) return { text: [m, H * 0.15, W - 2 * m, H * 0.7], plate: null, head, foot };
    if (f === 'square') {
      const pw = W * 0.42, ph = pw * 1.25, px = W - m - pw;
      return { text: [m, H * 0.14, px - W * 0.045 - m, H * 0.72], plate: [px, (H - ph) / 2 + H * 0.02, pw, ph], head, foot };
    }
    const pw = W * (f === 'story' ? 0.78 : 0.56), ph = pw * 1.25;
    const py = H * (f === 'story' ? 0.925 : 0.915) - ph;
    const ty = H * (f === 'story' ? 0.1 : 0.12);
    return { text: [m, ty, W - 2 * m, py - ty - H * 0.03], plate: [(W - pw) / 2, py, pw, ph], head, foot };
  }

  /* ── the line, broken to fit its box ───────────────────────────── */
  function setLines (ctx, box) {
    const text = (st.text.trim() || 'It’s Yours.');
    const caps = st.face === 'caps';
    const body = caps ? text.toUpperCase() : text;
    let px = box[2] * (caps ? 0.085 : 0.115) * st.size * (st.format === 'square' ? 1.25 : 1) * (st.motion === 'trail' ? 0.72 : 1);
    for (let tries = 0; tries < 24; tries++) {
      ctx.font = FACES[st.face](px);
      if ('letterSpacing' in ctx) ctx.letterSpacing = caps ? `${(px * 0.12).toFixed(1)}px` : '0px';
      const lines = [];
      let cur = '';
      for (const w of body.split(/\s+/)) {
        const next = cur ? cur + ' ' + w : w;
        if (cur && ctx.measureText(next).width > box[2]) { lines.push(cur); cur = w; } else cur = next;
      }
      if (cur) lines.push(cur);
      const lh = px * (caps ? 1.15 : 1.02);
      const wide = Math.max(...lines.map(l => ctx.measureText(l).width));
      if ((lines.length * lh <= box[3] && wide <= box[2]) || px < 18) return { lines, px, lh, h: lines.length * lh, w: wide };
      px *= 0.92;
    }
    return { lines: [body], px, lh: px, h: px, w: box[2] };
  }

  /* ── the trail: where the line is, and where it has been ─────────── */
  const trail = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, last: -1e9, hist: [] };
  function stepTrail (t, dt, auto) {
    const pointed = !auto && performance.now() - trail.last < 1400;
    const ax = 0.5 + 0.3 * Math.sin(t * 0.55), ay = 0.5 + 0.24 * Math.sin(t * 0.83 + 1.1);
    const tx = pointed ? trail.tx : ax, ty = pointed ? trail.ty : ay;
    const k = 1 - Math.exp(-dt * 5.5);
    trail.x = lerp(trail.x, tx, k); trail.y = lerp(trail.y, ty, k);
    trail.hist.unshift([trail.x, trail.y]);
    if (trail.hist.length > 120) trail.hist.length = 120;
  }

  /* ── the drawing ───────────────────────────────────────────────── */
  function draw (ctx, W, H, t, scale = 1) {
    const d = dom();
    const light = d.key === 'crown';
    const ink = light ? INK : PAPER;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const L = layout(W, H);
    if (!st.clear) {
      ctx.fillStyle = d.lacquer;
      ctx.fillRect(0, 0, W, H);
      // the running head and the foot, as on every page of the issue
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.78;
      ctx.font = `500 ${Math.round(W * 0.019)}px "Jost", Futura, sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(W * 0.0062).toFixed(1)}px`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText('DOMAIN BLACK', W * 0.075, L.head);
      ctx.textAlign = 'right'; ctx.fillText(`Nº ${d.num} — ${d.name.toUpperCase()}`, W * 0.925, L.head);
      ctx.textAlign = 'center'; ctx.globalAlpha = 0.6;
      ctx.font = `400 ${Math.round(W * 0.017)}px "Jost", Futura, sans-serif`;
      ctx.fillText('DOMAINBLACK.SHOP', W / 2, L.foot);
      ctx.globalAlpha = 1;
    }
    if (L.plate) {
      const im = picture(d.key);
      const [x, y, w, h] = L.plate;
      if (im.complete && im.naturalWidth) ctx.drawImage(im, x, y, w, h);     // the photograph, whole
      else { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, y, w, h); }
    }

    // the type, in its own box and never outside it
    const box = L.text;
    const T = setLines(ctx, box);
    ctx.save();
    ctx.beginPath(); ctx.rect(box[0], box[1], box[2], box[3]); ctx.clip();
    ctx.textBaseline = 'alphabetic';
    const block = (ox, oy, alpha, outline) => {
      ctx.globalAlpha = alpha;
      T.lines.forEach((ln, i) => {
        const y = oy + T.px * 0.82 + i * T.lh;
        if (outline) ctx.strokeText(ln, ox, y); else ctx.fillText(ln, ox, y);
      });
    };
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, T.px / 70);
    const amp = motion();
    if (st.motion === 'trail') {
      ctx.textAlign = 'center';
      // the line travels through the free space of its box and never past it
      const at = ([nx, ny]) => [
        box[0] + T.w / 2 + nx * Math.max(0, box[2] - T.w),
        box[1] + ny * Math.max(0, box[3] - T.h)
      ];
      const n = st.echo, gap = 4;
      for (let i = n; i >= 1; i--) {
        const h = trail.hist[Math.min(trail.hist.length - 1, i * gap)] || [trail.x, trail.y];
        const [x, y] = at(h);
        block(x, y, 0.5 * Math.pow(1 - i / (n + 1), 1.4), true);
      }
      const [x, y] = at([trail.x, trail.y]);
      block(x, y, 1, false);
    } else {
      ctx.textAlign = 'left';
      const x0 = box[0], y0 = box[1] + (box[3] - T.h) / 2;
      if (st.motion === 'echo') {
        const n = st.echo, u = T.px * 0.075;
        for (let i = n; i >= 1; i--) {
          const dx = i * u * 0.7 * Math.sin(t * 0.9 + i * 0.45) * amp;
          const dy = i * u * (0.55 + 0.35 * Math.sin(t * 0.7) * amp);
          block(x0 + dx, y0 + dy, 0.55 * Math.pow(1 - i / (n + 1), 1.5), true);
        }
      }
      block(x0, y0, 1, false);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ── the preview: drawn at the size it is shown, only while seen ─── */
  let scale = 0.5, raf = 0, visible = true, t = 0, last = 0, dirty = true;
  function fit () {
    const [W, H] = FORMATS[st.format];
    // the shown size comes from CSS and this ratio alone, never from the
    // pixel size below, so resizing the pixels cannot resize the box again
    canvas.style.aspectRatio = `${W} / ${H}`;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const shown = r.width ? r.width * dpr : 540;
    const w = Math.round(clamp(shown, W * 0.25, W)), h = Math.round(w * H / W);
    if (Math.abs(canvas.width - w) > 1 || Math.abs(canvas.height - h) > 1) { canvas.width = w; canvas.height = h; }
    scale = canvas.width / W;
    dirty = true; kick();
  }
  function frame (now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = st.motion !== 'still' && motion() > 0;
    if (moving) t += dt * (0.35 + 0.65 * motion());
    if (st.motion === 'trail') stepTrail(t, dt, false);
    if (moving || dirty) {
      const [W, H] = FORMATS[st.format];
      draw(g, W, H, t, scale);
      dirty = false;
    }
    if (visible && (moving || dirty)) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function kick () { if (!raf) raf = requestAnimationFrame(frame); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }, { rootMargin: '100px' }).observe(canvas);
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(fit) : null;
  ro ? ro.observe(canvas) : addEventListener('resize', fit);

  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect(), [W, H] = FORMATS[st.format];
    const L = layout(W, H), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    trail.tx = clamp((x - L.text[0]) / L.text[2], 0, 1);
    trail.ty = clamp((y - L.text[1]) / L.text[3], 0, 1);
    trail.last = performance.now();
    if (st.motion === 'trail') kick();
  });

  /* ── the form ──────────────────────────────────────────────────── */
  const outs = {
    world: () => dom().name, size: () => Math.round(st.size * 100) + '%', echo: () => String(st.echo)
  };
  function sync () {
    form.querySelectorAll('button[data-line]').forEach(b => b.setAttribute('aria-pressed', String(st[b.dataset.line] === b.dataset.value)));
    for (const [k, f] of Object.entries(outs)) { const o = form.querySelector(`[data-line-out="${k}"]`); if (o) o.textContent = f(); }
    const count = form.querySelector('[data-line-count]');
    if (count) count.textContent = `${st.text.length} / 48`;
    form.querySelectorAll('input[type=range][data-line]').forEach(i => i.style.setProperty('--fill', ((i.value - i.min) / (i.max - i.min) * 100).toFixed(1) + '%'));
    const echo = form.querySelector('[data-line="echo"]');
    if (echo) echo.disabled = st.motion === 'still';
    canvas.setAttribute('aria-label', `Your line, “${st.text.trim() || 'It’s Yours.'}”, set ${st.clear ? 'on a clear ground' : `on ${dom().name}’s lacquer`}${st.bottle && !st.clear ? ' beside the bottle' : ''}.`);
  }
  function change (k, v) {
    st[k] = v;
    if (k === 'world') { picture(v); tink(1 + DOMAINS.findIndex(d => d.key === v) * 0.06, 0.03); }
    sync();
    if (k === 'format') fit(); else { dirty = true; kick(); }
  }
  form.addEventListener('click', e => {
    const b = e.target.closest('button[data-line]');
    if (b) change(b.dataset.line, b.dataset.value);
    const act = e.target.closest('[data-line-act]');
    if (act) (act.dataset.lineAct === 'clip' ? keepClip : keepImage)(act);
  });
  form.addEventListener('input', e => {
    const i = e.target;
    if (i.name === 'text') change('text', i.value.slice(0, 48));
    else if (i.dataset.line === 'size') change('size', i.value / 100);
    else if (i.dataset.line === 'echo') change('echo', +i.value);
    else if (i.type === 'checkbox') change(i.dataset.line, i.checked);
  });
  form.addEventListener('submit', e => e.preventDefault());

  /* ── keeping it ────────────────────────────────────────────────── */
  const fileName = ext => `DomainBlack_YourLine_${dom().name}_${st.format}.${ext}`;
  function offscreen () {
    const [W, H] = FORMATS[st.format];
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return [c, c.getContext('2d'), W, H];
  }
  function keepImage (button) {
    const [c, ctx, W, H] = offscreen();
    draw(ctx, W, H, t, 1);
    save(() => new Promise((res, rej) => {
      try { c.toBlob(b => (b ? res(b) : rej(new Error('blank'))), 'image/png'); } catch (e) { rej(e); }
    }), fileName('png'), say, button);
  }
  const REC = typeof MediaRecorder === 'function' && HTMLCanvasElement.prototype.captureStream
    ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported?.(m))
    : null;
  const clipBtn = form.querySelector('[data-line-act="clip"]');
  if (clipBtn && REC) clipBtn.hidden = false;
  function keepClip (button) {
    if (!REC) return;
    const [c, ctx, W, H] = offscreen();
    const SECONDS = 5;
    say('Recording five seconds…');
    save(() => new Promise((res, rej) => {
      let rec;
      try { rec = new MediaRecorder(c.captureStream(30), { mimeType: REC, videoBitsPerSecond: 8e6 }); } catch (e) { rej(e); return; }
      const parts = [];
      rec.ondataavailable = e => e.data.size && parts.push(e.data);
      rec.onstop = () => (parts.length ? res(new Blob(parts, { type: REC.split(';')[0] })) : rej(new Error('empty')));
      let t0 = 0, tt = t;
      const run = now => {
        if (!t0) t0 = now;
        const el = (now - t0) / 1000;
        tt = t + el * (st.motion === 'still' ? 0 : 1);
        if (st.motion === 'trail') stepTrail(tt, 1 / 30, true);
        draw(ctx, W, H, tt, 1);
        if (el < SECONDS) requestAnimationFrame(run); else rec.stop();
      };
      draw(ctx, W, H, t, 1);
      rec.start(250);
      requestAnimationFrame(run);
    }), fileName(REC.includes('mp4') ? 'mp4' : 'webm'), say, button);
  }

  /* ── go ───────────────────────────────────────────────────────── */
  const faces = document.fonts?.load
    ? Promise.all([FACES.italic(48), FACES.roman(48), FACES.caps(48)].map(f => document.fonts.load(f).catch(() => null)))
    : Promise.resolve();
  faces.then(() => { dirty = true; kick(); });
  stage?.classList.add('is-live');
  sync();
  fit();
  return {
    state: st,
    set: (k, v) => change(k, v),
    draw: (ctx, W, H, tt = t) => draw(ctx, W, H, tt, 1),
    layout: (W, H) => layout(W, H),
    get scale () { return scale; },
    keepImage, keepClip, formats: FORMATS, canClip: !!REC
  };
}
