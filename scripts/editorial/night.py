"""The night edit — stark plates for the After Hours spread.

    python3 -I scripts/editorial/night.py <originals> <fonts> <out-dir> [web/assets/photo]

With the fourth argument it also writes the web derivatives of the three
plates the After Hours spread uses (Kingdom, Sovereign, the monogram), at
540 and 1080 wide, the way derive.py writes every other photograph.

Intellectual minimalism, done with placement alone: each bottle is cut from
its catalogue frame as one precise rectangle and set small in a field of
black, with two lines of type at the corners. The monogram plate is a band
of the macro frame across the middle. The photograph inside every frame is
the retoucher's, resampled and nothing else.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from covers import tracked  # noqa: E402

W, H, M = 1080, 1350, 64
NIGHT, PAPER = (12, 10, 9), (236, 230, 220)
WORLDS = [
    ('kingdom', 'DB_Kingdom_Catalogue_S231_4x5.jpg', 'I', 'Kingdom'),
    ('sovereign', 'DB_Sovereign_Catalogue_S228_4x5.jpg', 'II', 'Sovereign'),
    ('celestial', 'DB_Celestial_Catalogue_S227_4x5.jpg', 'III', 'Celestial'),
    ('crown', 'DB_Crown_Catalogue_S229_4x5.jpg', 'IV', 'Crown'),
    ('empire', 'DB_Empire_Catalogue_S230_4x5.jpg', 'V', 'Empire'),
]


def corners(d, fonts, tl, bl, br, tr=None, fill=PAPER):
    f = ImageFont.truetype(os.path.join(fonts, 'Jost-500.ttf'), 18)
    tracked(d, (M, M + 14), tl, f, fill, 5)
    if tr:
        tracked(d, (W - M, M + 14), tr, f, fill, 5, 'r')
    tracked(d, (M, H - M), bl, f, fill, 5)
    tracked(d, (W - M, H - M), br, f, fill, 5, 'r')


def object_plate(raw, fonts, file, num, name):
    photo = Image.open(os.path.join(raw, file)).convert('RGB')
    pw, ph = photo.size
    # the bottle and a breath of its own darkness around it
    win = photo.crop((round(0.27 * pw), round(0.17 * ph), round(0.73 * pw), round(0.79 * ph)))
    tw = round(W * 0.44)
    th = round(win.height * tw / win.width)
    win = win.resize((tw, th), Image.LANCZOS).filter(ImageFilter.UnsharpMask(0.6, 40, 2))
    page = Image.new('RGB', (W, H), NIGHT)
    page.paste(win, ((W - tw) // 2, round(H * 0.47 - th / 2)))
    d = ImageDraw.Draw(page)
    corners(d, fonts, 'DOMAIN BLACK', f'Nº {num} — {name.upper()}', 'EAU DE PARFUM', 'AFTER HOURS')
    return page


def monogram_plate(raw, fonts):
    photo = Image.open(os.path.join(raw, 'DB_Kingdom_LogoMacro_S094_4x5.jpg')).convert('RGB')
    pw, ph = photo.size
    band = photo.crop((0, round(0.50 * ph), pw, round(0.93 * ph)))      # the monogram, whole
    bh = round(band.height * W / band.width)
    band = band.resize((W, bh), Image.LANCZOS)
    page = Image.new('RGB', (W, H), NIGHT)
    page.paste(band, (0, round(H * 0.46 - bh / 2)))
    d = ImageDraw.Draw(page)
    corners(d, fonts, 'DOMAIN BLACK', 'IT’S YOURS.', 'THE MONOGRAM, S094', 'AFTER HOURS')
    return page


ON_THE_SITE = ('kingdom', 'sovereign', 'monogram')


def web(page, key, photo_dir):
    for w in (540, 1080):
        out = page if w == page.width else page.resize((w, round(page.height * w / page.width)), Image.LANCZOS)
        out.save(os.path.join(photo_dir, f'night-{key}-{w}.webp'), 'WEBP', quality=80 if w > 900 else 78, method=6)


if __name__ == '__main__':
    raw, fonts, out = sys.argv[1:4]
    photo_dir = sys.argv[4] if len(sys.argv) > 4 else None
    os.makedirs(out, exist_ok=True)
    plates = [(key, f'DomainBlack_Night_{num}_{name}.jpg', object_plate(raw, fonts, file, num, name))
              for key, file, num, name in WORLDS]
    plates.append(('monogram', 'DomainBlack_Night_Monogram.jpg', monogram_plate(raw, fonts)))
    for key, fn, page in plates:
        page.save(os.path.join(out, fn), quality=92, subsampling=0)
        if photo_dir and key in ON_THE_SITE:
            web(page, key, photo_dir)
    print(f'night edit: {len(plates)} plates' + (f', {2 * len(ON_THE_SITE)} web derivatives' if photo_dir else ''))
