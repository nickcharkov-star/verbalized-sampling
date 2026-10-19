# autocut

Prompt-driven editorial video assembly. You describe the film in a sentence; it
analyses the rushes, writes an edit decision list, and renders finished masters
in every aspect ratio you need.

```bash
autocut auto "20s vertical Reels teaser, moody and slow, open on the model, \
tagline: \"it's yours\", brand: \"DOMAIN BLACK\"" --rushes ./rushes --out ./out
```

```
out/
  domain_black.edl.json        the cut, as editable JSON
  domain_black_9x16.mp4        the master
  domain_black.manifest.json   what was delivered, from which plan
  shots.json                   every shot found, with why it was typed that way
```

Everything runs locally on **ffmpeg**. No cloud editing service, no OpenCV, no
numpy. An LLM is optional and never touches the timing.

---

## Why it is built this way

Automatic editors usually fail in one of two ways: they cut to a fixed template
and every film looks the same, or they hand the whole timeline to a model and
you get a render that is one hallucinated timestamp away from garbage.

autocut splits the problem:

| Stage | Decides | Determinism |
|---|---|---|
| `ingest` | what each shot contains | measured from pixels |
| `brief` | what the director asked for | parsed, rule-based |
| `plan` | which shot goes where, for how long | deterministic; an LLM may *propose* selection |
| `render` | the actual file | pure ffmpeg |

The model, when enabled, only ever answers *"which shot for which beat"*.
Durations, the beat grid, transitions, safe areas and validation stay in code.
A bad suggestion costs you a worse cut, never a broken render.

---

## Install

```bash
pip install -e ".[video]"     # or just make sure `ffmpeg` is on PATH
```

autocut looks for ffmpeg in this order: `$AUTOCUT_FFMPEG`, then `ffmpeg` on
`PATH`, then the static build inside the `imageio-ffmpeg` wheel. `ffprobe` is
used when present and worked around when it is not.

---

## The four stages

### 1. `analyze` — what have we got?

```bash
autocut analyze ./rushes -o shots.json --print
```

Scene-change detection splits every source file into shots. Each shot is then
described from three 48×48 thumbnails decoded straight out of ffmpeg, in pure
Python — a 40-clip ingest is seconds, not minutes.

Composition is read through a **border-prior background model**: the outer ring
of a frame is almost always backdrop, so anything far enough from the ring's
colour is subject. That one step is what separates a bottle on sand from a face
against the same sand. An absolute skin-hue test cannot, because in this
category the set *is* skin-coloured — warm plaster, linen and sand all sit in
the same hue band as skin.

Each shot gets a role — `talent`, `gesture`, `product`, `macro`, `texture`,
`logo` — plus the scores for every other role and a confidence.

**What this classifier can and cannot do.** Measured on a 13-shot fragrance
set: 10/13 exactly right, 12/13 right to within a family. It reliably separates
*structure* — empty backdrop, object in a field, person in frame. It is not a
subject detector, and two splits are genuinely hard at this resolution:

- `talent` vs `gesture` (a face and a pair of hands are photometrically similar)
- a raked, warm, shadow-striped wall can read as skin

So when a role has to be right, lock it. Two ways, both first-class:

```bash
# 1. name the rushes the way an editor would — the stem is read as a hint
#    A012_product_02.mov, B003-model-01.mp4, hands_take4.mov

# 2. or override explicitly
echo '{"plate02_wide": "gesture", "A012_product_02": "product"}' > roles.json
autocut analyze ./rushes -o shots.json --roles roles.json
```

A filename hint is a strong prior, not an override: emphatic pixels still win.
An explicit override always wins, and sets confidence to 1.

### 2. the brief — one sentence, parsed

```python
from autocut.brief import parse
parse('Cut a 20s vertical Reels teaser, moody and slow, open on the model, '
      'no logo cards, tagline: "it\'s yours", 92 bpm')
```

Recognised: duration (`20s`, `30-second`), aspect (`vertical`, `square`,
`reels`, `16:9`…), pace (`punchy` / `unhurried`), mood (`moody`, `clean`,
`filmic` → grade intensity), copy (`tagline:`, `endcard:`, or the first quoted
phrase), structure (`open on the model`, `end on the bottle`, `no logo cards`),
tempo (`92 bpm`), frame rate, and the style pack.

Parsing is offline and deterministic. CLI flags override anything it inferred.

### 3. `plan` — the cut

```bash
autocut plan "20s vertical teaser, slow" --shots shots.json -o cut.edl.json --print
```

```
domain_black  [editorial_luxury]  9:16 1080x1920 @30fps  20.00s  92bpm
    0.00–  2.80    — hook      talent   push_slow   plate01_wide.mp4 [1.05–3.85]
    2.80–  4.60    — world     texture  drift_left  plate02_ground.mp4 [1.90–3.70]
    ...
    7.27– 10.47 ◇16f reveal    product  push_slow   plate04_select.mp4 [0.95–4.15]
   17.00– 20.00 ◇16f endcard   logo     static      endcard_logo.mp4 [0.62–3.62]
   14.40+2.77 TITLE (tagline) “it's yours”
```

What the planner does:

- **Fits the arc to the duration.** The style pack's beats are allocated by
  water-filling — proportional to weight, clamped to each beat's own min/max,
  residual redistributed — then snapped to the musical grid. Long briefs repeat
  the middle movements; short briefs shed the cheapest expendable beats. Held
  beats (hook, reveal, resolve, end card) are never dropped: they are the spine.
- **Lands on the exact duration.** A :15 that runs 15.4s is a reject, so after
  transitions are settled the cut is conformed to whole frames and to the sold
  length, flexible beats absorbing the difference first.
- **Picks shots** on role fit, exposure and structure, freshness (a reuse costs,
  a *recent* reuse costs more), source alternation, and role confidence —
  weighted higher on held beats, because the spine should not rest on a guess.
- **Rations dissolves.** Hard cuts are the default. The pack's dissolve budget
  is spent on the highest-priority beats, and no dissolve may eat more than a
  third of either neighbour.
- **Places supers where the subject is not.** The analyser knows roughly where
  the subject mass sits, so a lower third that would land across a bottle goes
  to the top instead.

Ask for several cuts and pick:

```bash
autocut plan "20s vertical teaser" --shots shots.json --variants 4
```

### 4. `render` — the file

```bash
autocut render cut.edl.json -o master.mp4 --aspect 9:16 --aspect 1:1 --aspect 16:9
```

Three passes, each cacheable:

1. **segments** — trim, speed ramp, reframe to canvas, camera move. zoompan is
   fed a 1.6× supersampled frame, because at low zoom factors its integer crop
   origin visibly stutters.
2. **assembly** — runs of hard cuts are concatenated; dissolves are xfaded
   between the groups they separate.
3. **finish** — grade, grain, vignette, supers and the mix, applied to the whole
   programme at once so the look is consistent.

Segments are content-addressed, so re-planning and re-rendering only re-encodes
what actually changed.

**Sound.** Pass `--music bed.wav` (trimmed, faded, loudness-normalised to the
pack's target), or let autocut synthesise a warm drone with a sub swell anchored
to the reveal beat. `--silent` for no audio.

**Reframing across aspects.** Cropping a vertical take into a landscape master
throws away two thirds of the picture and blows up what is left — the hero ends
up an unreadable detail. So `--reframe auto` (the default) measures how much of
each source frame a crop would keep, and when that falls below 45% it insets the
whole frame on a blurred, darkened plate made from itself, camera move intact.
`--reframe fill` always crops, `--reframe fit` always insets.

An inset preserves the image but cannot invent picture: a 9:16 take in a 16:9
master is a pillar, however tastefully plated. The real fix is wider rushes for
wide deliverables — autocut just refuses to destroy the shot in the meantime.

**Type.** Rendered with libass where available — it does real letter-spacing,
which a luxury wordmark lives or dies on — falling back to `drawtext`, and
finally to rendering without supers plus a warning. Many static ffmpeg builds
ship one and not the other, so the backend is probed, not assumed.

---

## Style packs

A pack is the house grammar as data: tempo curve, beat arc, dissolve budget,
grade, grain, typography, mix. Adding a house style is a JSON file in
`autocut/packs/`, not a code change.

```bash
autocut styles
```

`editorial_luxury` — fragrance-house editorial. 92bpm, negative space, held
frames, hard cuts with dissolves reserved for the reveal and resolve, warm sand
grade with lifted film blacks and protected skin, wide-tracked serif wordmark.

`kinetic_launch` — the same grammar at 124bpm with shorter holds and a punchier
grade, to show that pacing is data.

The tempo curve is what makes a cut feel edited rather than chopped:

```json
"tempo_curve": [[0.0, 1.55], [0.18, 1.15], [0.45, 0.78], [0.66, 0.70], [0.80, 1.25], [1.0, 1.85]]
```

Slow open, accelerate through the middle, hold the resolve. Values multiply the
beat length at that point in the film.

---

## Optional: planning with verbalized sampling

With an LLM configured, `--llm` elicits *k* distinct edit plans with their own
probabilities — the repository's own [verbalized
sampling](../README.md) — instead of one answer collapsed to the mode. Each
candidate is compiled and validated through the same deterministic path; any
that fails is dropped.

```bash
autocut plan "20s vertical teaser, slow and moody" --shots shots.json --llm --variants 4
```

```
eliciting edit plans via verbalized sampling
variant 1: 9 clips · 20.00s · confidence 0.41 · cut.edl.json
variant 2: 9 clips · 20.00s · confidence 0.29 · cut_v2.edl.json
```

With no model available it says so and falls back to deterministic variants, so
`--llm` is always safe to pass:

```
! verbalized_sampling unavailable (No module named 'pydantic'); using deterministic variants
```

---

## The EDL is the handoff

`*.edl.json` is plain, readable JSON. Change a shot, nudge an in-point, retime a
super, then re-render — the unchanged segments come from cache. This is the
point at which a human editor takes over from the machine, and nothing about it
is opaque.

```json
{
  "schema": "autocut.edl/1",
  "clips": [
    {"id": "c01", "source": "rushes/plate01_wide.mp4", "src_in": 1.05, "src_out": 3.85,
     "role": "talent", "beat": "hook", "motion": "push_slow", "speed": 1.0,
     "transition": "cut", "crop": "face", "duration": 2.8}
  ],
  "titles": [{"text": "it's yours", "start": 14.4, "duration": 2.77,
              "kind": "tagline", "position": "upper"}]
}
```

A super takes the pack's colour unless it carries its own `"color"` (hex,
optionally `@alpha`, e.g. `"#171513"`): ink type for a pale frame, set
without the dark shadow. Anything that is not hex is ignored.

---

## No rushes yet?

```bash
autocut demo --out ./rushes                      # synthesised from nothing
autocut demo --out ./rushes --stills ./campaign  # moving rushes from stills
```

`--stills` turns each still into a wide take, a macro select and a backdrop
select — enough material for the planner to build a real arc from. Neither mode
is a substitute for a shoot; both are enough to prove the pipeline.

---

## Python API

```python
from autocut import auto_edit

auto_edit("20s vertical teaser, slow and moody", rushes="./rushes", out="./out")
```

Or stage by stage:

```python
from autocut import ingest_rushes, parse_brief, plan_cut, render_edl, RenderConfig, StylePack

shots = ingest_rushes("./rushes")
brief = parse_brief('20s vertical teaser, tagline: "it\'s yours"')
pack  = StylePack.load(brief.style)
edl   = plan_cut(shots, brief, pack)

render_edl(edl, pack, "master_9x16.mp4", RenderConfig())
render_edl(edl.retarget("16:9"), pack, "master_16x9.mp4", RenderConfig())
```

---

## Tests

```bash
pytest tests/autocut -q
```

The end-to-end tests render real files at low resolution and skip themselves
when ffmpeg is missing. Everything else — brief parsing, arc fitting, transition
rationing, duration conforming, filtergraph construction, ASS generation — runs
in well under a second and needs nothing installed.
