"""Web derivatives of the campaign photography, for the issue.

    python3 -I scripts/editorial/derive.py <originals-dir> <out-dir>

Nothing here changes what the product looks like. A photograph is cropped,
resampled and compressed; its colour is left exactly as the retoucher
delivered it. The one finishing step is a light unsharp mask after the
downscale, which every web export needs and which moves no hue.
"""
import json
import os
import sys

from PIL import Image, ImageFilter

# name -> (source file, crop box in source pixels or None, widths)
CATALOGUE = {
    'lineup':          ('DB_FiveWorlds_Lineup_S003_16x9.jpg', None, (1920, 1280, 800)),
    'kingdom':         ('DB_Kingdom_Catalogue_S231_4x5.jpg', None, (1080, 720)),
    'sovereign':       ('DB_Sovereign_Catalogue_S228_4x5.jpg', None, (1080, 720)),
    'celestial':       ('DB_Celestial_Catalogue_S227_4x5.jpg', None, (1080, 720)),
    'crown':           ('DB_Crown_Catalogue_S229_4x5.jpg', None, (1080, 720)),
    'empire':          ('DB_Empire_Catalogue_S230_4x5.jpg', None, (1080, 720)),
    # the rest of the shoot, for the contact sheet and the chapters
    'in-hand':         ('DB_Kingdom_InHand_S026_4x5.jpg', None, (1080, 480)),
    'logo-macro':      ('DB_Kingdom_LogoMacro_S094_4x5.jpg', None, (1080, 480)),
    'logo-macro-cool': ('DB_Kingdom_LogoMacroCool_S102_4x5.jpg', None, (1080, 480)),
    'fog-stone':       ('DB_Kingdom_FogStone_S187_4x5.jpg', None, (1080, 480)),
    'silver-symmetry': ('DB_Kingdom_SilverSymmetry_S095_4x5.jpg', None, (1080, 480)),
    'silver-fog':      ('DB_Kingdom_SilverFog_S092_4x5.jpg', None, (1080, 480)),
    'silver-negative': ('DB_Kingdom_SilverNegativeSpace_S118_4x5.jpg', None, (1080, 480)),
    'amber-negative':  ('DB_Kingdom_AmberNegativeSpace_S110_4x5.jpg', None, (1080, 480)),
    'white-liquid':    ('DB_Kingdom_WhiteLiquid_S126_4x5.jpg', None, (1080, 480)),
    'dutch-angle':     ('DB_Kingdom_DutchAngle_S106_4x5.jpg', None, (1080, 480)),
    'glass-plinth':    ('DB_Kingdom_GlassPlinth_S130_4x5.jpg', None, (1080, 480)),
    'droplets-ice':    ('DB_Kingdom_DropletsIce_S036_4x5.jpg', None, (1080, 480)),
    'horizon':         ('DB_Kingdom_Horizon_S213_4x5.jpg', None, (1080, 480)),
    'trio':            ('DB_Trio_Natural_S182_4x5.jpg', None, (1080, 480)),
    'duo':             ('DB_Duo_Monochrome_S015_4x5.jpg', None, (1080, 480)),
    'travel':          ('DB_Celestial_10ML_S219_4x5.jpg', None, (1080, 480)),
    'tube':            ('DB_Packaging_Tube_S221_4x5.jpg', None, (1080, 480)),
    'crown-copper':    ('DB_Crown_Copper_S146_4x5.jpg', None, (1080, 480)),
    'empire-blocks':   ('DB_Empire_TerracottaBlocks_S042_4x5.jpg', None, (1080, 480)),
    'empire-flare':    ('DB_Empire_SunFlare_S043_4x5.jpg', None, (1080, 480)),
}


def export(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for name, (src, box, widths) in CATALOGUE.items():
        im = Image.open(os.path.join(src_dir, src)).convert('RGB')
        if box:
            im = im.crop(box)
        files = []
        for w in widths:
            w = min(w, im.width)
            h = round(im.height * w / im.width)
            out = im if w == im.width else im.resize((w, h), Image.LANCZOS)
            if w < im.width:
                out = out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=40, threshold=2))
            fn = f'{name}-{w}.webp'
            out.save(os.path.join(out_dir, fn), 'WEBP', quality=80 if w > 900 else 78, method=6)
            files.append({'w': w, 'h': h, 'file': fn,
                          'kb': round(os.path.getsize(os.path.join(out_dir, fn)) / 1024)})
        manifest[name] = {'source': src, 'crop': box, 'files': files}
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    return manifest


if __name__ == '__main__':
    m = export(sys.argv[1], sys.argv[2])
    total = sum(f['kb'] for v in m.values() for f in v['files'])
    for k, v in m.items():
        print(f"{k:18s}", '  '.join(f"{f['w']}w {f['kb']}KB" for f in v['files']))
    print('total', total, 'KB')
