/* Renders the Domain Black Shopify sections offline, in the order
   templates/index.json declares, against mock store data — so the theme is
   proved to parse, render, and lay out before anyone installs it. */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine } from './lib/shopify-liquid-env.mjs';

const THEME = process.argv[2];
const OUT = process.argv[3];
const engine = makeEngine('./assets/');

/* ── mock store ──────────────────────────────────────────────────────── */
const LOTS = [
  ['Ember',  'Bitter orange, labdanum', 'MMXXVI', '#e2542a', 40, 24000, true,  '#a8360f', '#f07a4e'],
  ['Noir',   'Haitian vetiver, smoke',  'MMXXVI', '#1d1715', 12, 26000, true,  '#000000', '#4a3f3a'],
  ['Bone',   'Orris butter, ambrette',  'MMXXV',  '#ece3d6',  0, 24000, false, '#b9ab98', '#ffffff'],
  ['Cobalt', 'Juniper, sea salt, fig',  'MMXXVI', '#2b4fb0', 74, 24000, true,  '#16296a', '#4a6fd0'],
  ['Cacao',  'Tonka, suede, cocoa',     'MMXXV',  '#5c3a2a',  6, 28000, true,  '#321d13', '#8a5c42']
];

/* Stand-in photography. A real store supplies its own; these exist so the
   theme can be rendered and looked at without one. */
const flacon = (lo, body, hi, i) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
<defs>
<linearGradient id="b${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lo}"/><stop offset=".34" stop-color="${body}"/><stop offset=".62" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
<linearGradient id="c${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${body}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
<linearGradient id="k${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f6f18"/><stop offset=".3" stop-color="#e8cf72"/><stop offset=".55" stop-color="#c9a227"/><stop offset="1" stop-color="#8a6a16"/></linearGradient>
</defs>
<path d="M150 28c34 0 62 17 62 40 0 16-13 25-28 28-12 2-20 6-34 6s-22-4-34-6c-15-3-28-12-28-28 0-23 28-40 62-40z" fill="url(#c${i})"/>
<ellipse cx="128" cy="52" rx="20" ry="9" fill="#fff" opacity=".2"/>
<rect x="128" y="100" width="44" height="12" rx="2" fill="url(#k${i})"/>
<rect x="124" y="112" width="52" height="9" rx="2" fill="url(#k${i})"/>
<rect x="62" y="121" width="176" height="248" rx="10" fill="url(#b${i})"/>
<rect x="62" y="121" width="30" height="248" rx="10" fill="#000" opacity=".18"/>
<rect x="104" y="131" width="18" height="228" rx="9" fill="#fff" opacity=".13"/>
<g fill="url(#k${i})" opacity=".95">
<path d="M126 196c-13 0-23 10-23 23s10 23 23 23c6 0 11-2 15-6v5h13v-74h-13v33c-4-3-9-4-15-4zm2 12c7 0 12 5 12 11s-5 11-12 11-12-5-12-11 5-11 12-11z"/>
<path d="M166 167v74h13v-5c4 4 9 6 15 6 13 0 23-10 23-23s-10-23-23-23c-6 0-11 1-15 4v-33zm28 41c7 0 12 5 12 11s-5 11-12 11-12-5-12-11 5-11 12-11z"/>
<rect x="140" y="160" width="4" height="88" transform="rotate(16 142 204)"/></g></svg>`;

const products = LOTS.map(([name, accord, vintage, swatch, qty, price, available]) => ({
  title: `The ${name}`,
  handle: name.toLowerCase(),
  url: `/products/${name.toLowerCase()}`,
  type: 'Extrait de parfum',
  price,
  available,
  published_at: '2026-02-01',
  featured_image: { src: `./fixtures/${name.toLowerCase()}.svg`, alt: `The ${name} flacon` },
  variants: [{ inventory_quantity: qty }],
  metafields: { domain: { accord, vintage, swatch, run: name === 'Bone' || name === 'Cacao' ? '90' : null } }
}));

const scope = {
  product: products[0],
  collection: { title: 'The Five', products, products_count: products.length, description: '' },
  cart: { item_count: 0, items: [], total_price: 0 },
  customer: null,
  template: { name: process.env.DB_TEMPLATE || 'index' },
  request: { locale: { iso_code: 'en' } },
  collections: { 'the-five': { title: 'The Five', products } },
  shop: { name: 'Domain Black', url: 'https://domainblack.shop' },
  settings: {},
  routes: { root_url: '/', cart_url: '/cart', search_url: '/search',
            all_products_collection_url: '/collections/all',
            account_register_url: '/account/register',
            account_addresses_url: '/account/addresses',
            account_logout_url: '/account/logout' }
};

const declaredHas = (schema, id) => (schema.settings || []).some((s) => s.id === id);

/* ── render each section the template asks for ───────────────────────── */
const TEMPLATE = process.env.DB_TEMPLATE || 'index';
const tpl = JSON.parse(readFileSync(join(THEME, `templates/${TEMPLATE}.json`), 'utf8'));
const order = tpl.order || Object.keys(tpl.sections);
const problems = [];
let body = '';

const queue = [
  ['__header', { type: 'header', settings: {} }],
  ...order.map((k) => [k, tpl.sections[k]]),
  ['__footer', { type: 'footer', settings: {} }]
];

for (const [key, node] of queue) {
  const file = join(THEME, 'sections', `${node.type}.liquid`);
  const src = readFileSync(file, 'utf8');

  // The schema block is the contract with the theme editor: it must be JSON.
  const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!m) { problems.push(`${node.type}: no {% schema %} block`); continue; }
  let schema;
  try { schema = JSON.parse(m[1]); }
  catch (e) { problems.push(`${node.type}: schema is not valid JSON — ${e.message}`); continue; }

  // Settings default to the schema's own defaults, then the template overrides.
  const settings = {};
  for (const s of schema.settings || []) {
    if (s.id !== undefined && s.default !== undefined) settings[s.id] = s.default;
  }
  Object.assign(settings, node.settings || {});
  // A fresh install has no collection chosen; pass one in to exercise the
  // merchant path with real product photography.
  if (process.env.DB_COLLECTION && declaredHas(schema, 'collection')) {
    settings.collection = process.env.DB_COLLECTION;
  }

  // Every id the Liquid reads must exist in the schema, or the editor can
  // never set it and the storefront silently renders a blank.
  const declared = new Set((schema.settings || []).filter((s) => s.id).map((s) => s.id));
  for (const used of src.matchAll(/section\.settings\.([a-z0-9_]+)/g)) {
    if (!declared.has(used[1])) problems.push(`${node.type}: section.settings.${used[1]} is used but not declared in {% schema %}`);
  }

  try {
    body += await engine.parseAndRender(src, {
      ...scope,
      section: { id: key, settings, blocks: node.blocks ? Object.values(node.blocks) : [] }
    });
    body += '\n';
    console.log(`✓ ${node.type.padEnd(22)} ${(schema.settings || []).length} settings, rendered`);
  } catch (e) {
    problems.push(`${node.type}: render failed — ${e.message.split('\n')[0]}`);
  }
}

/* ── wrap it the way a theme's layout/theme.liquid would ─────────────── */
const html = `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Domain Black — theme preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&family=Jost:wght@200;300;400;500&family=Pinyon+Script&display=swap">
<link rel="stylesheet" href="./assets/domain-black.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
</head>
<body class="template-${TEMPLATE}">
${body}
<script src="./assets/domain-black.js" defer></script>
</body>
</html>`;

mkdirSync(join(OUT, 'assets'), { recursive: true });
mkdirSync(join(OUT, 'fixtures'), { recursive: true });
LOTS.forEach(([name, , , , , , , lo, hi], i) => {
  const [, , , body] = LOTS[i];
  writeFileSync(join(OUT, 'fixtures', `${name.toLowerCase()}.svg`), flacon(lo, body, hi, i));
});
for (const f of readdirSync(join(THEME, 'assets'))) {
  copyFileSync(join(THEME, 'assets', f), join(OUT, 'assets', f));
}
writeFileSync(join(OUT, `${TEMPLATE}.html`), html);

if (problems.length) {
  console.log('\n✗ problems:');
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log(`\n✓ ${TEMPLATE} rendered to ${join(OUT, TEMPLATE + '.html')} (${html.length} bytes)`);
