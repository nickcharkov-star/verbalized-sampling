/* ═══════════════════════════════════════════════════════════════════════
   THE STUDIO — make the issue yours.

   The page is set by six numbers (a world, day or night, type size,
   contrast, motion, grain). The boot script in the page applies them
   before the first paint; this module is the panel that changes them,
   remembers them for this browser, and writes them into a link.

   "Describe your evening" reads a sentence against the house's own notes
   and rooms — no model, no network: a word list the five worlds were
   written from, so what it picks can always be explained.
   ═══════════════════════════════════════════════════════════════════════ */

const NAMES = { paper: 'Paper', kingdom: 'Kingdom', sovereign: 'Sovereign', celestial: 'Celestial', crown: 'Crown', empire: 'Empire' };

/* each world's vocabulary: its notes, its room, its hour */
const LEXICON = {
  kingdom: 'night dark black smoke smoky salt sea stone fog quiet cannabis sandalwood wood woods forest rain storm late midnight city silence authority mystery walnut',
  sovereign: 'library leather book books chocolate cocoa rum whisky whiskey cognac pomegranate autumn fireplace velvet espresso coffee wine red dinner rich indulgence orchard',
  celestial: 'blue sky sea ocean air fresh clean citrus lemon orange jasmine morning cool cold ice water bright amber musk spring linen breeze',
  crown: 'vanilla cream soft warm cozy cosy comfort home blanket sugar sweet tonka honey milk cashmere ivory sunday bath bed',
  empire: 'summer sunset sun peach blood party dance club arrival hot heat golden beach holiday bold loud entrance terrace'
};
const NIGHT = 'night late midnight evening dark moon bar club dinner candle candles after';
const DAY = 'morning day sun sunday brunch noon afternoon bright breakfast daylight';
const GRAIN = 'film grain paper vintage analog analogue old print texture photograph';
const CALM = 'calm still quiet slow soft peace rest gentle';
const LIVELY = 'party dance fast loud wild energy club';

const words = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
const hits = (ws, list) => {
  const vocab = list.split(' ');
  return ws.reduce((n, w) => n + (vocab.some(v => v === w || (w.length > 3 && v.length > 3 && (w.startsWith(v) || v.startsWith(w)))) ? 1 : 0), 0);
};

export function read (sentence, current) {
  const ws = words(sentence);
  const scores = Object.entries(LEXICON).map(([k, list]) => [k, hits(ws, list)]).sort((a, b) => b[1] - a[1]);
  const [best, n] = scores[0];
  const night = hits(ws, NIGHT), day = hits(ws, DAY);
  if (!n && !night && !day) return null;
  const p = { ...current };
  if (n) p.world = best;
  if (night > day) p.light = 'night'; else if (day > night) p.light = 'day';
  if (hits(ws, GRAIN)) p.grain = Math.max(p.grain, 45);
  if (hits(ws, CALM)) p.motion = Math.min(p.motion, 35);
  if (hits(ws, LIVELY)) p.motion = 100;
  return p;
}

export function describe (p) {
  const bits = [NAMES[p.world], p.light === 'night' ? 'at night' : 'by day'];
  if (p.grain >= 30) bits.push('with grain');
  if (p.motion <= 40) bits.push('held still');
  return bits.join(', ');
}

export function createStudio ({ onChange = () => {}, still = false } = {}) {
  const S = window.__dbStudio;
  const panel = document.querySelector('[data-studio]');
  const opener = document.querySelector('[data-studio-open]');
  if (!S || !panel) return null;
  const $ = (sel, r = panel) => r.querySelector(sel);
  const $$ = (sel, r = panel) => [...r.querySelectorAll(sel)];
  const note = $('[data-studio-note]');
  const say = t => { if (note) note.textContent = t; };
  let open = false;

  /* ── state → page, storage and controls ─────────────────────────── */
  function set (next, why) {
    const p = S.clean(next);
    Object.assign(S.prefs, p);          // the object issue.js reads, kept by reference
    S.apply(S.prefs);
    S.save(S.prefs);
    sync();
    onChange(S.prefs, why);
  }
  function fill (input) {
    const a = +input.min, b = +input.max;
    input.style.setProperty('--fill', ((+input.value - a) / (b - a) * 100).toFixed(1) + '%');
  }
  const outs = {
    world: p => NAMES[p.world],
    type: p => p.type + '%',
    contrast: p => p.contrast ? (p.contrast < 30 ? 'Soft' : p.contrast > 70 ? 'Sharp' : 'Even') + ' · ' + p.contrast : 'As drawn',
    motion: p => (still ? 'Off for this device' : p.motion ? p.motion + '%' : 'Still'),
    grain: p => p.grain ? p.grain + '%' : 'None'
  };
  function sync () {
    const p = S.prefs;
    $$('[data-set="world"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === p.world)));
    $$('[data-set="light"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === p.light)));
    for (const k of ['type', 'contrast', 'motion', 'grain']) {
      const input = $(`input[data-set="${k}"]`);
      if (input && document.activeElement !== input) input.value = k === 'contrast' && !p.contrast ? 96 : p[k];
      if (input) fill(input);
    }
    for (const [k, f] of Object.entries(outs)) { const o = $(`[data-out="${k}"]`); if (o) o.textContent = f(p); }
  }

  /* ── the controls ──────────────────────────────────────────────── */
  panel.addEventListener('click', e => {
    const b = e.target.closest('button[data-set]');
    if (b) { set({ ...S.prefs, [b.dataset.set]: b.dataset.value }, b.dataset.set); return; }
    const r = e.target.closest('[data-remix]');
    if (r) { set(S.decode(r.dataset.remix), 'remix'); say(`${r.querySelector('b').textContent}: ${describe(S.prefs)}.`); return; }
    const act = e.target.closest('[data-studio-act]')?.dataset.studioAct;
    if (act === 'reset') { set(S.defaults, 'reset'); say('Back to the issue as printed.'); }
    if (act === 'shuffle') shuffle();
    if (act === 'share') share();
    if (e.target.closest('[data-studio-close]')) close();
  });
  panel.addEventListener('input', e => {
    const input = e.target.closest('input[data-set]');
    if (!input) return;
    fill(input);
    set({ ...S.prefs, [input.dataset.set]: +input.value }, input.dataset.set);
  });
  const motion = $('input[data-set="motion"]');
  if (still && motion) motion.disabled = true;

  function shuffle () {
    const others = S.worlds.filter(w => w !== S.prefs.world);
    const pick = a => a[Math.floor(Math.random() * a.length)];
    set({
      ...S.prefs,
      world: pick(others),
      light: Math.random() < 0.45 ? 'night' : 'day',
      contrast: pick([0, 0, 24, 60, 96]),
      grain: pick([0, 15, 30, 50]),
      type: pick([98, 100, 100, 104])
    }, 'shuffle');
    say(`Shuffled: ${describe(S.prefs)}.`);
  }

  async function share () {
    let url;
    try {
      const u = new URL(location.href);
      u.searchParams.set('studio', S.encode(S.prefs));
      u.hash = '';
      url = u.toString();
    } catch (e) { say('This browser cannot make the link.'); return; }
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied. Whoever opens it gets this issue.');
    } catch (e) {
      say(url);                          // shown whole, to copy by hand
    }
  }

  /* ── describe your evening ─────────────────────────────────────── */
  const mood = $('[data-mood]');
  mood?.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('input', mood), out = $('[data-mood-read]', mood);
    const p = read(input.value, S.prefs);
    if (!p) { out.textContent = 'Nothing in that yet. Try a smell, a room or a time of day.'; return; }
    set(p, 'mood');
    out.textContent = `Read as ${describe(S.prefs)}.`;
  });

  /* ── open and close ────────────────────────────────────────────── */
  function show (v) {
    open = v;
    panel.classList.toggle('is-open', v);
    opener?.setAttribute('aria-expanded', String(v));
    if (v) setTimeout(() => $('[data-set="world"][aria-pressed="true"]')?.focus({ preventScroll: true }), 60);
  }
  function close () { if (!open) return; show(false); opener?.focus({ preventScroll: true }); }
  opener?.addEventListener('click', () => (open ? close() : show(true)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) close(); });
  document.addEventListener('pointerdown', e => {
    if (open && !panel.contains(e.target) && !opener?.contains(e.target)) close();
  });

  sync();
  return { get open () { return open; }, show, close, set, get prefs () { return S.prefs; } };
}
