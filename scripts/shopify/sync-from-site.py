"""Keep the Shopify theme in step with the site.

    python3 -I scripts/shopify/sync-from-site.py web/index.html web/shopify

The site is the source of truth for the issue's design. This copies its
stylesheet, scripts and photographs into the theme, and regenerates the
sections whose markup has nothing a merchant needs to edit (contents, the
print, the contact sheet, the covers), rewriting every ./assets/ path to
Shopify's asset_url. The sections a merchant edits — cover, belief, the
five worlds, register, colophon, header, footer — are written by hand in
Liquid and are left alone.

Shopify themes have no folders under assets/, so photo/x.webp becomes x.webp.
"""
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
for f in ('issue.js', 'halftone.js', 'pixelfield.js', 'catalogue.js'):
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
    return fragment


def block(start, end):
    i = html.index(start)
    j = html.index(end, i)
    return html[i:j].rstrip()


SECTIONS = {
    'domain-contents': ('<section class="contents wrap" id="contents"', '<!-- ═══ the belief', 'Contents'),
    'domain-print': ('<div class="print-intro wrap">', '<!-- ═══ contact sheet', 'The print'),
    'domain-contact': ('<section class="contact wrap" id="contact"', '<!-- ═══ the covers', 'Contact sheet'),
    'domain-covers': ('<section class="covers wrap" id="covers"', '<!-- ═══ the register', 'The covers'),
}
for name, (start, end, label) in SECTIONS.items():
    body = liquidize(block(start, end))
    out = ('{%- comment -%}\n  Generated from web/index.html by scripts/shopify/sync-from-site.py —\n'
           '  edit the site and sync rather than editing this file.\n{%- endcomment -%}\n'
           + body + '\n\n{% schema %}\n{ "name": "' + label + '", "tag": "div", "class": "domain-section" }\n{% endschema %}\n')
    open(os.path.join(theme, 'sections', name + '.liquid'), 'w', encoding='utf-8').write(out)

print(f'synced: css {len(issue_css)} chars · 4 scripts · {n} photographs · {len(SECTIONS)} sections')
