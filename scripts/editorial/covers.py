"""Five magazine covers — one per composition — from the catalogue shots.

    python3 -I scripts/editorial/covers.py <originals> <caps> <fonts> <out>

The photograph is the cover, untouched. Type is set over it, and the
masthead sits *behind* the stone cap: the cap is lifted out of the frame
with a graph cut (`<caps>/<name>-cap.png`, from scripts/lib/grabcut.py)
and laid back on top of the letters. The bottle, the cap and the monogram
are the retoucher's pixels, exactly. The only thing added to the frame is
a shallow shade over the tabletop reflection, so the cover lines read.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, M = 1080, 1350, 44
PAPER, INK = (243, 239, 232), (21, 19, 18)

COVERS = [
    ('kingdom',   'DB_Kingdom_Catalogue_S231_4x5.jpg',   'I',   'Kingdom',   'Quiet Authority',
     ['Vanilla', 'Salt', 'Cannabis', 'Sandalwood']),
    ('sovereign', 'DB_Sovereign_Catalogue_S228_4x5.jpg', 'II',  'Sovereign', 'Refined Indulgence',
     ['Pomegranate', 'Orchard Fruits', 'Cocoa', 'Rum']),
    ('celestial', 'DB_Celestial_Catalogue_S227_4x5.jpg', 'III', 'Celestial', 'Light Beyond Reach',
     ['Orange', 'Lemon', 'Jasmine', 'Amber', 'Musk']),
    ('crown',     'DB_Crown_Catalogue_S229_4x5.jpg',     'IV',  'Crown',     'Comfort Elevated',
     ['Vanilla', 'Cocoa', 'Amber', 'Sugar', 'Tonka Bean']),
    ('empire',    'DB_Empire_Catalogue_S230_4x5.jpg',    'V',   'Empire',    'Magnetic Arrival',
     ['Peach', 'Blood Orange', 'Rum']),
]


def tracked(draw, xy, text, font, fill, track, anchor='l'):
    """Letter-spaced text. Pillow has no tracking, so place glyphs one by one.
    'Nº' is one sign, and is never pulled apart."""
    x, y = xy
    text = text.replace('Nº', '\0')
    widths = [draw.textlength('Nº' if c == '\0' else c, font=font) for c in text]
    total = sum(widths) + track * (len(text) - 1)
    if anchor == 'r':
        x -= total
    elif anchor == 'm':
        x -= total / 2
    for c, w in zip(text, widths):
        draw.text((x, y), 'Nº' if c == '\0' else c, font=font, fill=fill, anchor='ls')
        x += w + track
    return total


def fit_size(draw, text, path, width):
    lo, hi = 20, 600
    while hi - lo > 1:
        mid = (lo + hi) // 2
        f = ImageFont.truetype(path, mid)
        l, t, r, b = draw.textbbox((0, 0), text, font=f, anchor='ls')
        lo, hi = (mid, hi) if r - l <= width else (lo, mid)
    return lo


def cover(src, cap_png, fonts, num, name, theme, notes):
    photo = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
    arr = np.asarray(photo).astype(np.float32)

    # is the sky over the cap light enough to want ink rather than paper?
    top = arr[90:340, 60:1020].mean(axis=2) / 255.0
    ink = top.mean() > 0.42
    fg = INK if ink else PAPER

    # shade the tabletop reflection — below the bottle only, never on it
    shade = np.zeros((H, W), np.float32)
    ys = np.arange(H, dtype=np.float32)
    ramp = np.clip((ys - 1040) / 230.0, 0, 1) ** 1.4
    shade[:] = ramp[:, None] * (0.30 if ink else 0.62)
    base = arr * (1 - shade[..., None]) + (np.array(PAPER if ink else (0, 0, 0)) * shade[..., None])
    page = Image.fromarray(base.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(page)

    serif = os.path.join(fonts, 'BodoniModa-96-400.ttf')
    serif_i = os.path.join(fonts, 'BodoniModa-96-400i.ttf')
    sans = os.path.join(fonts, 'Jost-500.ttf')
    sans_r = os.path.join(fonts, 'Jost-400.ttf')
    script = os.path.join(fonts, 'PinyonScript.ttf')

    # the band
    small = ImageFont.truetype(sans, 19)
    tracked(d, (M, 64), 'ISSUE Nº 01', small, fg, 5.5)
    tracked(d, (W / 2, 64), 'AUTUMN 2026', small, fg, 5.5, 'm')
    tracked(d, (W - M, 64), 'THE FIVE WORLDS', small, fg, 5.5, 'r')

    # the masthead, sized to the measure
    size = fit_size(d, 'DOMAIN', serif, W - 2 * M)
    mast = ImageFont.truetype(serif, size)
    l, t, r, b = d.textbbox((0, 0), 'DOMAIN', font=mast, anchor='ls')
    base_y = 318
    d.text((W / 2 - (l + r) / 2, base_y), 'DOMAIN', font=mast, fill=fg, anchor='ls')
    tracked(d, (W - M, base_y + 46), 'BLACK', ImageFont.truetype(sans, 24), fg, 15, 'r')

    # the cap goes back on top of the letters, at its own pixels
    cap = Image.open(cap_png).convert('L').resize((W, H), Image.LANCZOS)
    cap = cap.filter(ImageFilter.GaussianBlur(0.7))
    page.paste(photo, (0, 0), cap)

    # the cover lines
    d = ImageDraw.Draw(page)
    tracked(d, (M, 1128), f'Nº {num} — {theme.upper()}', ImageFont.truetype(sans, 19), fg, 4.8)
    d.text((M - 4, 1222), name, font=ImageFont.truetype(serif_i, 104), fill=fg, anchor='ls')
    d.text((M, 1272), '  ·  '.join(notes), font=ImageFont.truetype(sans_r, 23), fill=fg, anchor='ls')
    tracked(d, (W - M, 1128), '20 ML — $40', ImageFont.truetype(sans, 19), fg, 4.8, 'r')
    d.text((W - M, 1222), 'It’s Yours.', font=ImageFont.truetype(script, 70), fill=fg, anchor='rs')
    d.line([(M, 1300), (W - M, 1300)], fill=fg, width=1)
    tracked(d, (M, 1327), 'DOMAINBLACK.SHOP', ImageFont.truetype(sans, 15), fg, 4)
    tracked(d, (W - M, 1327), 'EAU DE PARFUM', ImageFont.truetype(sans, 15), fg, 4, 'r')
    return page


if __name__ == '__main__':
    raw, caps, fonts, out = sys.argv[1:5]
    os.makedirs(out, exist_ok=True)
    for key, f, num, name, theme, notes in COVERS:
        page = cover(os.path.join(raw, f), os.path.join(caps, f'{key}-cap.png'), fonts, num, name, theme, notes)
        page.save(os.path.join(out, f'DomainBlack_Cover_{num}_{name}.jpg'), quality=92, subsampling=0)
        print('cover', num, name)
