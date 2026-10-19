/* Checks the whole theme the way an upload would: the required files exist,
   every JSON file parses, every Liquid file parses, every {% schema %} is
   valid JSON, and every setting the Liquid reads is one the editor can set. */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { makeEngine } from './lib/shopify-liquid-env.mjs';

const THEME = process.argv[2];
const engine = makeEngine('/assets/', join(THEME, 'snippets'));
const problems = [];
const note = (f, m) => problems.push(`${f}: ${m}`);

/* Shopify will not accept a theme without these. */
const REQUIRED = [
  'layout/theme.liquid', 'config/settings_schema.json', 'locales/en.default.json',
  'templates/index.json', 'templates/product.json', 'templates/collection.json',
  'templates/page.json', 'templates/blog.json', 'templates/article.json',
  'templates/cart.json', 'templates/search.json', 'templates/404.json',
  'templates/list-collections.json'
];
for (const f of REQUIRED) if (!existsSync(join(THEME, f))) note(f, 'required file is missing');

const walk = (dir) => existsSync(dir)
  ? readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    })
  : [];

const files = ['layout', 'sections', 'snippets', 'templates', 'config', 'locales']
  .flatMap((d) => walk(join(THEME, d)));

const SCHEMA = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
const sectionSchemas = new Map();

for (const path of files) {
  const rel = relative(THEME, path);
  const src = readFileSync(path, 'utf8');

  if (extname(path) === '.json') {
    try { JSON.parse(src); } catch (e) { note(rel, `invalid JSON — ${e.message}`); }
    continue;
  }
  if (extname(path) !== '.liquid') continue;

  try { engine.parse(src); }
  catch (e) { note(rel, `Liquid will not parse — ${e.message.split('\n')[0]}`); continue; }

  const m = src.match(SCHEMA);
  if (rel.startsWith('sections/')) {
    if (!m) { note(rel, 'a section needs a {% schema %} block'); continue; }
    let schema;
    try { schema = JSON.parse(m[1]); }
    catch (e) { note(rel, `{% schema %} is not valid JSON — ${e.message}`); continue; }
    if (!schema.name) note(rel, '{% schema %} has no "name"');
    sectionSchemas.set(rel.replace(/^sections\//, '').replace(/\.liquid$/, ''), schema);

    const declared = new Set((schema.settings || []).filter((s) => s.id).map((s) => s.id));
    const seen = new Set();
    for (const u of src.matchAll(/section\.settings\.([a-z0-9_]+)/g)) {
      if (!declared.has(u[1]) && !seen.has(u[1])) { seen.add(u[1]); note(rel, `reads section.settings.${u[1]}, which {% schema %} never declares`); }
    }
  } else if (m) {
    note(rel, '{% schema %} is only allowed in sections/');
  }
}

/* every section a template orders must exist, and every setting it overrides
   must be one that section declares */
for (const path of files.filter((p) => relative(THEME, p).startsWith('templates/') && p.endsWith('.json'))) {
  const rel = relative(THEME, path);
  let tpl;
  try { tpl = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
  for (const [key, node] of Object.entries(tpl.sections || {})) {
    const schema = sectionSchemas.get(node.type);
    if (!schema) { note(rel, `orders section "${node.type}", which does not exist in sections/`); continue; }
    const declared = new Set((schema.settings || []).filter((s) => s.id).map((s) => s.id));
    for (const id of Object.keys(node.settings || {})) {
      if (!declared.has(id)) note(rel, `sets "${id}" on ${node.type}, which that section does not declare`);
    }
  }
  for (const key of tpl.order || []) {
    if (!(tpl.sections || {})[key]) note(rel, `"order" names "${key}", which is not in "sections"`);
  }
}

/* the layout must emit the two things Shopify injects */
const layout = readFileSync(join(THEME, 'layout/theme.liquid'), 'utf8');
for (const token of ['content_for_header', 'content_for_layout']) {
  if (!layout.includes(token)) note('layout/theme.liquid', `must output {{ ${token} }}`);
}

/* every {% render %} / {% section %} must point at a file that exists */
for (const path of files.filter((p) => p.endsWith('.liquid'))) {
  const rel = relative(THEME, path);
  const src = readFileSync(path, 'utf8');
  for (const u of src.matchAll(/\{%-?\s*render\s+'([^']+)'/g)) {
    if (!existsSync(join(THEME, 'snippets', `${u[1]}.liquid`))) note(rel, `renders snippet '${u[1]}', which does not exist`);
  }
  for (const u of src.matchAll(/\{%-?\s*section\s+'([^']+)'/g)) {
    if (!existsSync(join(THEME, 'sections', `${u[1]}.liquid`))) note(rel, `includes section '${u[1]}', which does not exist`);
  }
}

console.log(`checked ${files.length} files, ${sectionSchemas.size} sections`);
if (problems.length) { console.log('\n✗ problems:'); for (const p of problems) console.log('  -', p); process.exit(1); }
console.log('✓ theme is structurally sound');
