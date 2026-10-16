/* ═══════════════════════════════════════════════════════════════════════
   THE CATALOGUE — what the house sells, and what the photograph does.

   Deliberately dependency-free. Everything the page needs in order to
   *read* lives here: the five compositions, their notes and their lines,
   and the names of the five movements.

   This matters more than it looks. The flacon and the pixel field both
   need three.js, which is 687 KB; if the page imported them statically
   and that one file failed to arrive, the whole module would fail and
   the page would lose its products, its register, its seal — everything,
   silently. Content imports this; only the moving parts are loaded
   dynamically, and only they can fail.
   ═══════════════════════════════════════════════════════════════════════ */

/* The five. Colours are the house palette, sampled against the campaign
   photography. Sovereign is the bottle in the campaign frame. */
export const DOMAINS = [
  { num: 'I',   name: 'Kingdom',   theme: 'Quiet Authority',
    lacquer: 0x171310, juice: 0x2a211b, gloss: 0.34,
    notes: ['Vanilla', 'Salt', 'Cannabis', 'Sandalwood'],
    line: 'For those whose presence speaks before they do.',
    world: 'Dark walnut, black stone, and morning fog.' },
  { num: 'II',  name: 'Sovereign', theme: 'Refined Indulgence',
    lacquer: 0x5b3a25, juice: 0x7a4a22, gloss: 0.38,
    notes: ['Pomegranate', 'Orchard Fruits', 'Cocoa', 'Rum'],
    line: 'Luxury without excess.',
    world: 'A private library. Leather, espresso, and dark woods.' },
  { num: 'III', name: 'Celestial', theme: 'Light Beyond Reach',
    lacquer: 0x2e5e8e, juice: 0x3f79ad, gloss: 0.30,
    notes: ['Orange', 'Lemon', 'Jasmine', 'Amber', 'Musk'],
    line: 'A quiet brilliance that never asks to be seen.',
    world: 'Blue hour, open sky, and glass architecture.' },
  { num: 'IV',  name: 'Crown',     theme: 'Comfort Elevated',
    lacquer: 0xe9dfcd, juice: 0xd8c4a2, gloss: 0.42,
    notes: ['Vanilla', 'Cocoa', 'Amber', 'Sugar', 'Tonka Bean'],
    line: 'Confidence wrapped in comfort.',
    world: 'Cashmere, cream stone, and soft candlelight.' },
  { num: 'V',   name: 'Empire',    theme: 'Magnetic Arrival',
    lacquer: 0xd9732a, juice: 0xc9571a, gloss: 0.36,
    notes: ['Peach', 'Blood Orange', 'Rum'],
    line: 'Every entrance deserves a signature.',
    world: 'Golden sunset over a modern city.' }
];

/* The five movements of the pixel field. Named here so the index can be
   built, and read, before — or without — the field itself. */
export const MOVEMENTS = [
  { id: 'frame',   num: 'I',   name: 'Frame',    note: 'Every pixel at home' },
  { id: 'sillage', num: 'II',  name: 'Sillage',  note: 'The springs let go' },
  { id: 'relief',  num: 'III', name: 'Relief',   note: 'Luminance becomes depth' },
  { id: 'five',    num: 'IV',  name: 'The Five', note: 'Sorted into the collection' },
  { id: 'flacon',  num: 'V',   name: 'Flacon',   note: 'One bottle, lit by its own pixels' }
];

/* How the object should stand when each detail of the flacon is named. */
export const DETAIL_MOVES = [
  { spin: 0.00, open: 1.00, tilt: -0.10, level: 0.45 },   // the stone
  { spin: 0.10, open: 0.85, tilt: -0.22, level: 0.45 },   // the collar
  { spin: 0.00, open: 0.00, tilt:  0.00, level: 0.45 },   // the monogram
  { spin: 1.57, open: 0.00, tilt:  0.06, level: 0.45 },   // the squircle
  { spin: 0.70, open: 0.00, tilt: -0.05, level: 0.45 },   // the lacquer
  { spin: 0.25, open: 1.00, tilt:  0.26, level: 0.80 }    // the pour
];
