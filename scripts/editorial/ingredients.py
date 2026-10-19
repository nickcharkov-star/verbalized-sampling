"""Ingredient close-ups, lifted from the catalogue photographs.

    python3 -I scripts/editorial/ingredients.py <originals> <out-dir> [sheet.jpg]

Every catalogue frame is staged with the composition's own notes around the
bottle: salt and cannabis beside Kingdom, pomegranate beside Sovereign, and
so on. These are those props, cropped — a 4:5 window from the outer third
of the frame, which never reaches the bottle (it stands in the middle 40%).
Only notes the house lists are cut; a prop that is not a note stays in the
photograph. Pixels are resampled, never regraded.
"""
import os
import sys

from PIL import Image, ImageFilter

SOURCES = {
    'kingdom': 'DB_Kingdom_Catalogue_S231_4x5.jpg',
    'sovereign': 'DB_Sovereign_Catalogue_S228_4x5.jpg',
    'celestial': 'DB_Celestial_Catalogue_S227_4x5.jpg',
    'crown': 'DB_Crown_Catalogue_S229_4x5.jpg',
    'empire': 'DB_Empire_Catalogue_S230_4x5.jpg',
}
# world, note, centre of the window as a fraction of the frame
CUTS = [
    ('kingdom', 'cannabis', 0.15, 0.44), ('kingdom', 'salt', 0.15, 0.70), ('kingdom', 'sandalwood', 0.85, 0.55),
    ('sovereign', 'rum', 0.15, 0.41), ('sovereign', 'cocoa', 0.15, 0.61), ('sovereign', 'pomegranate', 0.85, 0.60),
    ('celestial', 'amber', 0.15, 0.55), ('celestial', 'jasmine', 0.15, 0.71), ('celestial', 'orange', 0.85, 0.53),
    ('crown', 'vanilla', 0.15, 0.47), ('crown', 'sugar', 0.15, 0.72), ('crown', 'tonka', 0.85, 0.70),
    ('empire', 'peach', 0.15, 0.54), ('empire', 'blood-orange', 0.85, 0.58),
]
FW, FH = 0.30, 0.30          # the window: 324 × 405 px of a 1080 × 1350 frame, i.e. 4:5


def cut(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for world, note, cx, cy in CUTS:
        im = Image.open(os.path.join(src_dir, SOURCES[world])).convert('RGB')
        W, H = im.size
        w, h = round(FW * W), round(FH * H)
        x0 = min(max(0, round(cx * W - w / 2)), W - w)
        y0 = min(max(0, round(cy * H - h / 2)), H - h)
        # never into the bottle's middle 40%
        assert x0 + w <= 0.30 * W + 1 or x0 >= 0.70 * W - 1, (world, note)
        crop = im.crop((x0, y0, x0 + w, y0 + h))
        fn = f'note-{world}-{note}-{w}.webp'
        crop.save(os.path.join(out_dir, fn), 'WEBP', quality=82, method=6)
        made.append((world, note, fn, crop))
    return made


if __name__ == '__main__':
    made = cut(sys.argv[1], sys.argv[2])
    for world, note, fn, crop in made:
        print(f'{world:10s} {note:13s} {fn}  {os.path.getsize(os.path.join(sys.argv[2], fn)) // 1024} KB')
    if len(sys.argv) > 3:
        tw, th = 162, 202
        sheet = Image.new('RGB', (tw * 7, th * 2), 'white')
        for i, (_, _, _, c) in enumerate(made):
            sheet.paste(c.resize((tw, th)), ((i % 7) * tw, (i // 7) * th))
        sheet.save(sys.argv[3], quality=86)
