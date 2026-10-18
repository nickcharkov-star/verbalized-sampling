"""Two double-page spreads for the issue.

    python3 -I scripts/editorial/spreads.py <originals> <fonts> <out>

  · The Five Worlds — the lineup, run across the gutter, captioned under
    each bottle the way a lookbook is.
  · The Belief — the in-hand frame on the left page, the founder's letter
    set on the right.

As with the covers, the photographs are placed, never retouched.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from covers import INK, PAPER, tracked  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

W, H, M = 2160, 1350, 64
RULE = (21, 19, 18)


def font(fonts, name, size):
    return ImageFont.truetype(os.path.join(fonts, name), size)


def wrap(draw, text, f, width):
    lines, line = [], ''
    for word in text.split():
        t = (line + ' ' + word).strip()
        if draw.textlength(t, font=f) <= width:
            line = t
        else:
            lines.append(line)
            line = word
    return lines + [line]


def five_worlds(raw, fonts):
    page = Image.new('RGB', (W, H), PAPER)
    photo = Image.open(os.path.join(raw, 'DB_FiveWorlds_Lineup_S003_16x9.jpg')).convert('RGB')
    ph = round(photo.height * W / photo.width)          # 1215
    page.paste(photo.resize((W, ph), Image.LANCZOS), (0, 0))
    d = ImageDraw.Draw(page)
    s = W / photo.width

    small = font(fonts, 'Jost-500.ttf', 17)
    tracked(d, (M, 58), 'ISSUE Nº 01', small, PAPER, 4.2)
    tracked(d, (W - M, 58), 'P. 08 — 09', small, PAPER, 4.2, 'r')
    # Bodoni Moda italic carries no W–o kern pair; set it by hand
    head = font(fonts, 'BodoniModa-96-400i.ttf', 84)
    d.text((M - 3, 148), 'The Five W', font=head, fill=PAPER, anchor='ls')
    d.text((M - 3 + d.textlength('The Five W', font=head) - 16, 148), 'orlds', font=head, fill=PAPER, anchor='ls')

    # captions under each bottle, at each bottle's own x in the frame
    caps = [(355, 'II', 'Sovereign', 'Refined Indulgence'),
            (655, 'IV', 'Crown', 'Comfort Elevated'),
            (875, 'I', 'Kingdom', 'Quiet Authority'),
            (1270, 'III', 'Celestial', 'Light Beyond Reach'),
            (1685, 'V', 'Empire', 'Magnetic Arrival')]
    y0 = ph
    d.line([(M, y0 + 22), (W - M, y0 + 22)], fill=RULE, width=1)
    for x, num, name, theme in caps:
        cx = x * s
        tracked(d, (cx, y0 + 52), f'Nº {num}', font(fonts, 'Jost-500.ttf', 15), INK, 3.6, 'm')
        d.text((cx, y0 + 92), name, font=font(fonts, 'BodoniModa-96-400i.ttf', 34), fill=INK, anchor='ms')
        tracked(d, (cx, y0 + 116), theme.upper(), font(fonts, 'Jost-400.ttf', 12), INK, 2.6, 'm')
    return page


LETTER = [
    'Domain Black began with a simple belief: fragrance is worn to be remembered, '
    'not to be noticed.',
    'Every composition in the House is built the same way — a mood first, a material '
    'second, a scent last. It is why the five do not smell like variations on one '
    'another. They are five rooms, not five shades.',
    'We believe fragrance is more than scent. It is presence, memory, and identity '
    'made tangible.',
]


def belief(raw, fonts):
    page = Image.new('RGB', (W, H), PAPER)
    photo = Image.open(os.path.join(raw, 'DB_Kingdom_InHand_S026_4x5.jpg')).convert('RGB')
    page.paste(photo.resize((W // 2, H), Image.LANCZOS), (0, 0))
    d = ImageDraw.Draw(page)
    x0, x1 = W // 2 + 120, W - 150
    small = font(fonts, 'Jost-500.ttf', 17)
    tracked(d, (W - M, 58), 'THE BELIEF', small, INK, 4.2, 'r')
    tracked(d, (x0, 210), 'FROM THE FOUNDER', small, INK, 4.2)

    quote = font(fonts, 'BodoniModa-96-400i.ttf', 66)
    y = 310
    for ln in ['We create fragrance', 'to reveal what is', 'already known.']:
        d.text((x0 - 4, y), ln, font=quote, fill=INK, anchor='ls')
        y += 78
    y += 36
    d.line([(x0, y), (x0 + 80, y)], fill=RULE, width=1)
    y += 64

    body = font(fonts, 'BodoniModa-11-400.ttf', 27)
    cap = font(fonts, 'BodoniModa-96-400.ttf', 132)
    first = True
    for para in LETTER:
        width = x1 - x0
        if first:
            # a three-line drop cap
            d.text((x0 - 4, y + 66), para[0], font=cap, fill=INK, anchor='ls')
            indent = d.textlength(para[0], font=cap) + 14
            rest = para[1:]
            lines = wrap(d, rest, body, width - indent)
            for i, ln in enumerate(lines):
                if i == 3:
                    lines = lines[:3] + wrap(d, ' '.join(lines[3:]), body, width)
                    break
            for i, ln in enumerate(lines):
                d.text((x0 + (indent if i < 3 else 0), y), ln, font=body, fill=INK, anchor='ls')
                y += 42
            first = False
        else:
            for ln in wrap(d, para, body, width):
                d.text((x0, y), ln, font=body, fill=INK, anchor='ls')
                y += 42
        y += 22

    y += 30
    tracked(d, (x0, y), 'KAMAALA EMMANUEL — FOUNDER', font(fonts, 'Jost-500.ttf', 16), INK, 4)
    d.text((x0 - 2, y + 92), 'It’s Yours.', font=font(fonts, 'PinyonScript.ttf', 64), fill=INK, anchor='ls')
    tracked(d, (W - M, H - 40), 'DOMAIN BLACK — P. 05', small, INK, 4.2, 'r')
    tracked(d, (M, H - 40), 'KINGDOM, IN HAND — S026', small, PAPER, 4.2)
    return page


if __name__ == '__main__':
    raw, fonts, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    five_worlds(raw, fonts).save(os.path.join(out, 'DomainBlack_Spread_FiveWorlds.jpg'), quality=92, subsampling=0)
    belief(raw, fonts).save(os.path.join(out, 'DomainBlack_Spread_TheBelief.jpg'), quality=92, subsampling=0)
    print('spreads done')
