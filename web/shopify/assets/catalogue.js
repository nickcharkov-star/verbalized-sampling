/* ═══════════════════════════════════════════════════════════════════════
   THE CATALOGUE — what the house sells, and which photographs show it.

   Dependency-free on purpose. Everything the page needs in order to *read*
   lives here, so a moving part that fails to load can never take the
   products, the register or the contact sheet down with it.
   ═══════════════════════════════════════════════════════════════════════ */

/* The five. `lacquer` is sampled from the lit side of each bottle in its
   catalogue photograph; `tint` is that lacquer laid thinly over the paper,
   for the page behind its chapter. */
export const DOMAINS = [
  { key: 'kingdom',   num: 'I',   name: 'Kingdom',   theme: 'Quiet Authority',
    lacquer: '#1d1d1d', tint: '#e6e3dd', frame: 'S231', detail: 'logo-macro',
    detailCaption: 'The monogram, close — frame S094',
    notes: ['Vanilla', 'Salt', 'Cannabis', 'Sandalwood'],
    line: 'For those whose presence speaks before they do.',
    world: 'Dark walnut, black stone, and morning fog.' },
  { key: 'sovereign', num: 'II',  name: 'Sovereign', theme: 'Refined Indulgence',
    lacquer: '#7e3d23', tint: '#ede0d6', frame: 'S228', detail: 'trio',
    detailCaption: 'Sovereign, Crown and Kingdom on plaster — frame S182',
    notes: ['Pomegranate', 'Orchard Fruits', 'Cocoa', 'Rum'],
    line: 'Luxury without excess.',
    world: 'A private library. Leather, espresso, and dark woods.' },
  { key: 'celestial', num: 'III', name: 'Celestial', theme: 'Light Beyond Reach',
    lacquer: '#223076', tint: '#e2e3ea', frame: 'S227', detail: 'travel',
    detailCaption: 'The 10 ml, in daylight — frame S219',
    notes: ['Orange', 'Lemon', 'Jasmine', 'Amber', 'Musk'],
    line: 'A quiet brilliance that never asks to be seen.',
    world: 'Blue hour, open sky, and glass architecture.' },
  { key: 'crown',     num: 'IV',  name: 'Crown',     theme: 'Comfort Elevated',
    lacquer: '#ebe6db', tint: '#f1ece3', frame: 'S229', detail: 'crown-copper',
    detailCaption: 'Crown against copper — frame S146',
    notes: ['Vanilla', 'Cocoa', 'Amber', 'Sugar', 'Tonka Bean'],
    line: 'Confidence wrapped in comfort.',
    world: 'Cashmere, cream stone, and soft candlelight.' },
  { key: 'empire',    num: 'V',   name: 'Empire',    theme: 'Magnetic Arrival',
    lacquer: '#db440d', tint: '#f1e0d4', frame: 'S230', detail: 'empire-blocks',
    detailCaption: 'Empire on terracotta, against the sky — frame S042',
    notes: ['Peach', 'Blood Orange', 'Rum'],
    line: 'Every entrance deserves a signature.',
    world: 'Golden sunset over a modern city.' }
];

export const PRICE_20 = '$40';
export const SHOP = 'https://domainblack.shop/';

/* The shoot, as the contact sheet lays it out. `select` frames get a
   grease-pencil ring — the editor's picks. */
export const SHEET = [
  { key: 'logo-macro',      frame: 'S094', title: 'Monogram, macro',          select: true },
  { key: 'fog-stone',       frame: 'S187', title: 'Kingdom on fog stone' },
  { key: 'silver-symmetry', frame: 'S095', title: 'Silver symmetry' },
  { key: 'in-hand',         frame: 'S026', title: 'Kingdom, in hand',         select: true },
  { key: 'amber-negative',  frame: 'S110', title: 'Amber negative space' },
  { key: 'trio',            frame: 'S182', title: 'Three on plaster' },
  { key: 'droplets-ice',    frame: 'S036', title: 'Monogram through ice',     select: true },
  { key: 'silver-fog',      frame: 'S092', title: 'Silver fog' },
  { key: 'duo',             frame: 'S015', title: 'Duo, monochrome' },
  { key: 'travel',          frame: 'S219', title: 'The 10 ml' },
  { key: 'empire-flare',    frame: 'S043', title: 'Empire, sun flare',        select: true },
  { key: 'glass-plinth',    frame: 'S130', title: 'Glass plinth' },
  { key: 'white-liquid',    frame: 'S126', title: 'White liquid' },
  { key: 'crown-copper',    frame: 'S146', title: 'Crown, copper' },
  { key: 'tube',            frame: 'S221', title: 'Travel tube' },
  { key: 'horizon',         frame: 'S213', title: 'Kingdom at the horizon' }
];

/* The five movements of the print. Named here so the index can be built,
   and read, before — or without — the field itself. */
export const MOVEMENTS = [
  { id: 'frame',   num: 'I',   name: 'The Plate', note: 'Every dot where the photograph put it' },
  { id: 'sillage', num: 'II',  name: 'Sillage',   note: 'The springs let go' },
  { id: 'relief',  num: 'III', name: 'Relief',    note: 'Darkness becomes depth' },
  { id: 'five',    num: 'IV',  name: 'The Five',  note: 'Each dot finds its own lacquer' },
  { id: 'celestial', num: 'V', name: 'Celestial', note: 'The dots regroup into one bottle’s photograph' }
];

/* src for a photograph at a width. The site keeps the derivatives in
   ./assets/photo/; a Shopify theme has no folders under assets/, so the
   theme sets DB_PHOTO_BASE to its own asset URL before this runs. */
export const photo = (key, w) =>
  `${globalThis.DB_PHOTO_BASE ?? './assets/photo/'}${key}-${w}.webp`;
