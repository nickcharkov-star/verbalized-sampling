"""Three 9:16 teasers from the campaign stills, cut by hand.

    python3 scripts/editorial/teasers.py <work dir> [empire kingdom five]

<work dir> holds the Drive originals, one folder per film, and the rushes
autocut builds from them (python3 -m autocut demo --stills <work>/stills-X
--out <work>/rushes-X). Rushes are numbered in file-name order:

  stills-empire   DB_Empire_Catalogue_S230, _SunFlare_S043, _TerracottaBlocks_S042
  stills-kingdom  DB_Kingdom_Catalogue_S231, _DropletsIce_S036, _FogStone_S187,
                  _InHand_S026, _LogoMacro_S094, _SilverSymmetry_S095
  stills-five     the five catalogues (S227–S231), the lineup S003, the trio S182

The auto planner once chose a blank stand-in plate for a hook; an editor
would not, so these edits are written out shot by shot and rendered with
autocut. Every shot is an untouched photograph (no grade); the only plate
built here is the whole lineup set on the night ground, so no bottle is cut
by the edge of a vertical frame.
"""
import os
import subprocess
import sys

sys.path.insert(0, os.getcwd())
from autocut.plan import EDL, Clip, Title  # noqa: E402
from autocut.style import StylePack  # noqa: E402

U = sys.argv[1]
ONLY = set(sys.argv[2:])            # render just these, e.g. empire
BEAT = 60 / 84                      # still_motion runs at 84 bpm


def lineup_plate():
    src = os.path.join(U, 'stills-five', 'DB_FiveWorlds_Lineup_S003_16x9.jpg')
    dest = os.path.join(U, 'rushes-five', 'lineup_plate.mp4')
    if os.path.exists(dest):
        return dest
    # placed at 2x then pushed in by 3.5% over six seconds; the night ground
    # is the After Hours colour, so the plate sits on the brand's own black
    graph = ("[0:v]scale=2160:-2:flags=lanczos,setsar=1[p];"
             "[1:v][p]overlay=0:(H*0.42)-(h/2),"
             "zoompan=z='1+0.035*on/180':x='iw/2-(iw/zoom/2)':y='ih*0.42-(ih/zoom*0.42)':d=1:s=1080x1920:fps=30,"
             "setsar=1,format=yuv420p[v]")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-t', '6', '-i', src,
                    '-f', 'lavfi', '-i', 'color=c=0x0C0A09:s=2160x3840:r=30:d=6',
                    '-filter_complex', graph, '-map', '[v]', '-t', '6', '-r', '30',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', dest],
                   check=True)
    return dest


def night_card():
    """The end card's ground: the After Hours black, eight seconds, a breath of grain."""
    dest = os.path.join(U, 'night_card.mp4')
    if not os.path.exists(dest):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0C0A09:s=1080x1920:r=30:d=8',
                        '-vf', 'noise=alls=2:allf=t,setsar=1,format=yuv420p',
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', dest], check=True)
    return dest


def cut(name, shots, titles, seconds):
    """shots: (rush, beats, motion, transition); titles: (text, start, dur, kind, pos[, colour])"""
    if ONLY and name not in ONLY:
        return
    clips = []
    for i, (rush, beats, motion, trans) in enumerate(shots):
        src = rush if os.path.isabs(rush) else os.path.join(U, f'rushes-{name}', rush + '.mp4')
        dur = beats * BEAT
        clips.append(Clip(id=f'c{i + 1:02d}', source=src, src_in=0.4, src_out=round(0.4 + dur, 4),
                          role='product', beat='hand', motion=motion,
                          transition=trans, transition_frames=14 if trans == 'dissolve' else 0))
    edl = EDL(project=f'teaser-{name}', style='still_motion', fps=30, aspect='9:16',
              width=1080, height=1920, bpm=84, grade_intensity=0.0, clips=clips,
              titles=[Title(*t[:2], duration=t[2], kind=t[3], position=t[4], color=(t[5:] or [''])[0]) for t in titles],
              audio=dict(StylePack.load('still_motion').audio, bpm=84), meta={'brief': f'{name} teaser, cut by hand from the campaign stills'})
    # end on the beat the brief asked for
    edl.clips[-1].src_out = round(edl.clips[-1].src_out + (seconds - edl.duration), 4)
    assert abs(edl.duration - seconds) < 1 / 30, edl.duration
    out = os.path.join(U, f'cut-{name}')
    os.makedirs(out, exist_ok=True)
    path = edl.save(os.path.join(out, 'teaser.edl.json'))
    for s, e, c in edl.timeline():
        print(f'  {name} {s:6.2f}–{e:6.2f} {os.path.basename(c.source)} {c.motion}')
    subprocess.run([sys.executable, '-m', 'autocut', '--quiet', 'render', path,
                    '-o', os.path.join(out, f'DomainBlack_{name.capitalize()}_Teaser_9x16.mp4'), '--clean'],
                   check=True)


END = night_card()

cut('empire', [
    ('plate01_wide',   4, 'push_slow',  'cut'),       # citrus and ice: the hook
    ('plate01_select', 2, 'push',       'cut'),
    ('plate02_wide',   3, 'push_slow',  'cut'),       # into the light
    ('plate02_select', 2, 'push',       'cut'),
    ('plate03_wide',   3, 'drift_left', 'cut'),
    ('plate03_select', 2, 'push',       'cut'),
    ('plate01_wide',   4, 'pull',       'cut'),       # back to the bottle
    (END,              5, 'static',     'dissolve'),
], [
    ('Served cold.',             0.5,  2.1, 'tagline', 'upper'),
    ('EMPIRE · Nº V',            0.9,  1.7, 'product', 'lower'),   # over the dark reflection
    ('Peach, blood orange, rum', 11.7, 1.9, 'tagline', 'upper'),
    ('Domain Black',             14.5, 1.5, 'endcard', 'center'),
    ('It’s Yours.',              16.2, 1.7, 'endcard', 'center'),
], 18.0)

cut('kingdom', [
    ('plate05_wide',   4, 'push_slow',  'cut'),       # the monogram: the hook, no type
    ('plate03_wide',   3, 'drift_left', 'cut'),       # fog stone
    ('plate03_select', 2, 'push',       'cut'),
    ('plate04_wide',   4, 'push_slow',  'cut'),       # in hand
    ('plate01_select', 2, 'push',       'cut'),
    ('plate01_wide',   5, 'pull',       'cut'),       # the bottle, whole
    (END,              5, 'static',     'dissolve'),
], [
    # both lines sit in the dark above the cap, clear of the salt below
    ('Quiet authority.',          10.95, 1.5, 'tagline', 'upper'),
    ('KINGDOM · Nº I',            12.6,  1.15, 'product', 'upper'),
    ('Domain Black',              14.5,  1.5, 'endcard', 'center'),
    ('It’s Yours.',               16.2,  1.7, 'endcard', 'center'),
], 18.0)

PLATE = lineup_plate()
cut('five', [
    (PLATE,            4, 'static',     'cut'),       # all five, whole: the hook
    ('plate05_wide',   3, 'push_slow',  'cut'),       # Kingdom
    ('plate06_wide',   3, 'push_slow',  'cut'),       # Sovereign
    ('plate01_wide',   3, 'push_slow',  'cut'),       # Celestial
    ('plate02_wide',   3, 'push_slow',  'cut'),       # Crown
    ('plate03_wide',   3, 'push_slow',  'cut'),       # Empire
    (PLATE,            3, 'static',     'cut'),
    (END,              6, 'static',     'dissolve'),
], [
    ('The Five Worlds',        0.4,  2.2, 'tagline', 'upper'),
    ('Kingdom',                3.1,  1.7, 'tagline', 'upper'),
    ('Sovereign',              5.25, 1.7, 'tagline', 'upper'),
    ('Celestial',              7.4,  1.7, 'tagline', 'upper'),
    ('Crown',                  9.55, 1.7, 'tagline', 'upper', '#171513'),   # ink on ivory
    ('Empire',                 11.7, 1.7, 'tagline', 'upper'),
    ('Five rooms, one house.', 13.8, 1.4, 'tagline', 'lower'),
    ('Domain Black',           15.9, 1.7, 'endcard', 'center'),
    ('It’s Yours.',            17.8, 2.0, 'endcard', 'center'),
], 20.0)
