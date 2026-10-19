"""Keep the Shopify theme in step with the site.

    python3 -I scripts/shopify/sync-from-site.py web/index.html web/shopify

The site is the source of truth for the issue's design. This copies its
stylesheet, scripts and photographs into the theme, and regenerates the
sections whose markup has little a merchant needs to edit (contents, after
hours, the print, your line, the contact sheet, the covers), the notes
snippet the five worlds render and the Studio's two snippets, rewriting
every ./assets/ path to
Shopify's asset_url. The sections a merchant edits — cover, belief, the
five worlds, register, colophon, header, footer — are written by hand in
Liquid and are left alone.

Shopify themes have no folders under assets/, so photo/x.webp becomes x.webp.
"""
import json
import os
import re
import shutil
import sys

site_html, theme = sys.argv[1], sys.argv[2]
site_dir = os.path.dirname(site_html)
html = open(site_html, encoding='utf-8').read()

# ── stylesheet: the issue's CSS above the marker, the storefront's below ──
MARK = '/* ═══ STOREFRONT — below this line is written for the theme only ═══ */'
css_path = os.path.join(theme, 'assets', 'domain-black.css')
issue_css = html[html.index('<style>') + len('<style>'):html.index('</style>')].strip()
store_css = ''
if os.path.exists(css_path):
    old = open(css_path, encoding='utf-8').read()
    if MARK in old:
        store_css = old[old.index(MARK) + len(MARK):]
head = ('/* Generated from web/index.html by scripts/shopify/sync-from-site.py.\n'
        '   Edit the site, then sync; edit only below the STOREFRONT marker here. */\n')
open(css_path, 'w', encoding='utf-8').write(head + issue_css + '\n\n' + MARK + store_css)

# ── scripts and photographs ─────────────────────────────────────────────
SCRIPTS = ('issue.js', 'halftone.js', 'pixelfield.js', 'glass.js', 'studio.js', 'yourline.js', 'catalogue.js')
for f in SCRIPTS:
    shutil.copyfile(os.path.join(site_dir, 'assets', f), os.path.join(theme, 'assets', f))
photos = os.path.join(site_dir, 'assets', 'photo')
n = 0
for f in sorted(os.listdir(photos)):
    if f.endswith('.webp'):
        shutil.copyfile(os.path.join(photos, f), os.path.join(theme, 'assets', f))
        n += 1


def liquidize(fragment):
    """./assets/photo/x.webp and ./assets/x → {{ 'x' | asset_url }}"""
    fragment = re.sub(r"\./assets/photo/([a-z0-9-]+\.webp)", r"{{ '\1' | asset_url }}", fragment)
    fragment = re.sub(r"\./assets/([a-z0-9.-]+)", r"{{ '\1' | asset_url }}", fragment)
    # on the store itself, "shop" means the store's own catalogue
    fragment = fragment.replace('href="https://domainblack.shop/" target="_blank" rel="noopener"',
                                'href="{{ routes.all_products_collection_url }}"')
    return fragment


def block(start, end):
    i = html.index(start)
    j = html.index(end, i)
    return html[i:j].rstrip()


# Per-section changes for the store: (find, replace) pairs applied after
# liquidize, and the settings the merchant gets in the editor.
SHOP_FOR_PRODUCT = ('href="{{ routes.all_products_collection_url }}"',
                    'href="{% if section.settings.product != blank %}{{ section.settings.product.url }}'
                    '{% else %}{{ routes.all_products_collection_url }}{% endif %}"')
EXTRA = {
    'domain-night': ([SHOP_FOR_PRODUCT],
                     [{'type': 'product', 'id': 'product', 'label': 'Product behind the glass',
                       'info': 'The button goes to it. Leave empty to send people to the catalogue.'}]),
}

SECTIONS = {
    'domain-contents': ('<section class="contents wrap" id="contents"', '<!-- ═══ the belief', 'Contents'),
    'domain-night': ('<section class="night" id="night"', '<!-- ═══ the print', 'After hours'),
    'domain-print': ('<div class="print-intro wrap">', '<!-- ═══ your line', 'The print'),
    'domain-line': ('<section class="line wrap" id="line"', '<!-- ═══ contact sheet', 'Your line'),
    'domain-contact': ('<section class="contact wrap" id="contact"', '<!-- ═══ the covers', 'Contact sheet'),
    'domain-covers': ('<section class="covers wrap" id="covers"', '<!-- ═══ the register', 'The covers'),
}
for name, (start, end, label) in SECTIONS.items():
    body = liquidize(block(start, end))
    swaps, settings = EXTRA.get(name, ([], []))
    for a, b in swaps:
        assert a in body, f'{name}: nothing to replace for {a}'
        body = body.replace(a, b)
    schema = {'name': label, 'tag': 'div', 'class': 'domain-section'}
    if settings:
        schema['settings'] = settings
    out = ('{%- comment -%}\n  Generated from web/index.html by scripts/shopify/sync-from-site.py —\n'
           '  edit the site and sync rather than editing this file.\n{%- endcomment -%}\n'
           + body + '\n\n{% schema %}\n' + json.dumps(schema, ensure_ascii=False) + '\n{% endschema %}\n')
    open(os.path.join(theme, 'sections', name + '.liquid'), 'w', encoding='utf-8').write(out)

# ── the Studio: its boot script (for the head, so a night issue never
# flashes paper) and its panel (for the end of the body) ────────────────
def whole(start, end):
    i = html.index(start)
    j = html.index(end, i) + len(end)
    return html[i:j]


SNIPPETS = {
    'domain-studio-boot': (whole('<script data-studio-boot>', '</script>'),
                           'The visitor\'s issue, applied before the first paint. Render in <head>.'),
    'domain-studio': (whole('<aside class="studio"', '</aside>'),
                      'The Studio panel. Render once, before </body>; the header opens it.'),
}
for name, (body, what) in SNIPPETS.items():
    assert '{{' not in body and '{%' not in body, name
    out = ('{%- comment -%}\n  Generated from web/index.html by scripts/shopify/sync-from-site.py.\n  '
           + what + '\n{%- endcomment -%}\n' + liquidize(body) + '\n')
    open(os.path.join(theme, 'snippets', name + '.liquid'), 'w', encoding='utf-8').write(out)

# ── the notes in each world's glass, as a snippet the worlds section renders ──
# Each note is a crop of that world's own catalogue photograph
# (scripts/editorial/ingredients.py), so it belongs to the bundled key.
NOTE = re.compile(r'note-([a-z]+)-([a-z-]+)-324\.webp"[^>]*alt="([^"]*)"></span><figcaption>([^<]*)</figcaption>')
worlds = {}
for key, note, alt, label in NOTE.findall(html):
    assert '|' not in alt + label and ';' not in alt + label
    worlds.setdefault(key, []).append(f'{note}|{label}|{alt}')
lines = ['{%- comment -%}',
         '  Generated from web/index.html by scripts/shopify/sync-from-site.py.',
         '  The notes "in the glass" for one world: render \'domain-notes\', key: \'kingdom\'.',
         '  Each is a crop of that world\'s catalogue photograph, never a drawing.',
         '{%- endcomment -%}',
         '{%- case key -%}']
for key, notes in worlds.items():
    lines.append(f"  {{%- when '{key}' -%}}{{%- assign notes = '{';'.join(notes)}' | split: ';' -%}}")
lines += ["  {%- else -%}{%- assign notes = '' | split: ';' -%}",
          '{%- endcase -%}',
          '{%- if notes.size > 0 -%}',
          '<div class="pour" data-pour>',
          '  <p class="kicker">{{ heading | default: \'In the glass\' | escape }}</p>',
          '  <div class="pour-row">',
          '    {%- for n in notes -%}{%- assign f = n | split: \'|\' -%}',
          '    <figure class="note" style="--i:{{ forloop.index0 }}"><span class="plate sheen"><img src="{{ \'note-\' | append: key | append: \'-\' | append: f[0] | append: \'-324.webp\' | asset_url }}" width="324" height="405" loading="lazy" decoding="async" alt="{{ f[2] | escape }}"></span><figcaption>{{ f[1] | escape }}</figcaption></figure>',
          '    {%- endfor -%}',
          '  </div>',
          '</div>',
          '{%- endif -%}']
os.makedirs(os.path.join(theme, 'snippets'), exist_ok=True)
open(os.path.join(theme, 'snippets', 'domain-notes.liquid'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

print(f'synced: css {len(issue_css)} chars · {len(SCRIPTS)} scripts · {n} photographs · {len(SECTIONS)} sections · '
      f'notes for {len(worlds)} worlds · {len(SNIPPETS)} studio snippets')
