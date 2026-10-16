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
  // [name, accord, vintage, swatch, qty, price(cents), available, theme, line]
  ['Kingdom',   'Vanilla, Salt, Cannabis, Sandalwood',  'MMXXVI', '#171310', 40, 4000, true,
   'Quiet Authority',    'For those whose presence speaks before they do.'],
  ['Sovereign', 'Pomegranate, Orchard Fruits, Cocoa, Rum', 'MMXXVI', '#5b3a25', 12, 4000, true,
   'Refined Indulgence', 'Luxury without excess.'],
  ['Celestial', 'Orange, Lemon, Jasmine, Amber, Musk',  'MMXXVI', '#2e5e8e', 74, 4000, true,
   'Light Beyond Reach', 'A quiet brilliance that never asks to be seen.'],
  ['Crown',     'Vanilla, Cocoa, Amber, Sugar, Tonka Bean', 'MMXXV', '#e9dfcd', 0, 4000, false,
   'Comfort Elevated',   'Confidence wrapped in comfort.'],
  ['Empire',    'Peach, Blood Orange, Rum',             'MMXXV',  '#d9732a',  6, 4000, true,
   'Magnetic Arrival',   'Every entrance deserves a signature.']
];

const products = LOTS.map(([name, accord, vintage, swatch, qty, price, available, theme, line]) => ({
  title: name,
  handle: name.toLowerCase(),
  url: `/products/${name.toLowerCase()}`,
  type: 'Extrait de parfum',
  price, available,
  published_at: '2026-02-01',
  // the house's own renders stand in for merchant photography; a real store
  // supplies its own, and the section uses whatever it finds as-is
  featured_image: { src: `./assets/flacon-${name.toLowerCase()}.png`, alt: `The ${name} flacon` },
  variants: [{ inventory_quantity: qty }],
  metafields: { domain: { accord, vintage, swatch, theme, line,
                          run: available ? null : '90' } }
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
  // an image_picker is empty until a merchant chooses one; stand one in so
  // the preview exercises the populated path rather than the empty state
  for (const s of schema.settings || []) {
    if (s.type === 'image_picker' && s.id && settings[s.id] === undefined) {
      settings[s.id] = { src: './assets/campaign-sovereign.png', alt: 'Campaign photograph', width: 270, height: 480 };
    }
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
<script type="importmap">{ "imports": { "three": "./assets/three.module.min.js" } }</script>
<script type="module" src="./assets/domain-black.js"></script>
</body>
</html>`;

mkdirSync(join(OUT, 'assets'), { recursive: true });
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
