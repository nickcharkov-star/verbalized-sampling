# Domain Black — design system, Issue Nº 01

The tokens live at the top of `web/index.html` (`:root`) and are copied
into the Shopify theme by `scripts/shopify/sync-from-site.py`. This page
explains them.

## Tear-down: what the previous build got wrong

| Flaw | Why it mattered | What changed |
|---|---|---|
| The phone cover was a 16:9 strip 200 px tall | Most visitors arrive from Instagram and TikTok, on a phone | A tall 4:5 frame that pans across all five bottles — Sovereign first, the centre as the page settles, Empire as you scroll |
| Notes were a line of text | Fragrance is invisible; the notes are the only thing a screen can show | Every world has an *In the glass* row: its notes, cut from its own catalogue photograph |
| One mood, all light | A luxury house needs a night as well as a day | *After Hours*: the page dims into black, a pane of cold glass you wipe with the pointer, and a stark night edit |
| Buttons changed colour and nothing else | Feedback without weight reads as cheap | Magnetic buttons on a damped spring, a cursor with mass that names what it is over, a 0.97 press |
| Long jumps were long scrolls | Jumping through the contents felt like a scroll, not a turned page | A view transition: the old page sinks, the new one rises over it |
| Type sizes were set one rule at a time | Twelve near-identical sizes, no system | One fluid modular scale and one fluid spacing matrix |
| No sound | Half the senses unused | Glass and ice, synthesised in the browser, off until asked for |

## Colour

| Token | Value | Source |
|---|---|---|
| `--paper` | `#ece6dc` | Crown's ivory lacquer, taken down to paper |
| `--paper-2` | `#e1d9cc` | the bed a plate sits on |
| `--sheet` | `#f5f1ea` | the contact sheet's lighter stock |
| `--ink` | `#171513` | Kingdom's black |
| `--ink-2` | `#5a534b` | secondary type, 6:1 on paper |
| `--foil` / `--foil-lit` | `#9a7440` / `#d9b77a` | the monogram's gold, for paper and for black |
| `--night` / `--night-2` | `#0c0a09` / `#171412` | After Hours |
| `--pencil` | `#c2322a` | the editor's china marker — contact sheet only |
| lacquers | `#1d1d1d` `#7e3d23` `#223076` `#ebe6db` `#db440d` | Kingdom, Sovereign, Celestial, Crown, Empire — sampled from the lit side of each bottle |

## Type

Bodoni Moda (a high-contrast Didone with an optical-size axis, 6–96) for
everything read; Jost (geometric, Futura's lineage) for everything
operated; Pinyon Script for "It's Yours." and nothing else. Both are
variable: `font-optical-sizing: auto` lets Bodoni thicken its hairlines at
small sizes, and the masthead's weight axis follows scroll speed.

A fluid modular scale, ×1.2 at 320 px rising to ×1.333 at 1440 px, body
16 → 18 px. `--t-m2` (labels) through `--t-8` (the Five Worlds heading).

## Space

One fluid matrix, 320 → 1440 px: `--s-3xs` 4→5 px, `--s-2xs` 8→10, `--s-xs`
12→15, `--s-s` 16→20, `--s-m` 24→30, `--s-l` 32→40, `--s-xl` 48→60,
`--s-2xl` 64→80, `--s-3xl` 96→120, `--s-4xl` 128→192.

## Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.23,1,.32,1)` | anything arriving |
| `--ease-io` | `cubic-bezier(.77,0,.175,1)` | anything travelling on screen |
| `--ease-pour` | `cubic-bezier(.34,1.4,.64,1)` | the notes settling, with a little overshoot |
| `--d-press` | 160 ms | a press |
| `--d-ui` | 240 ms | state changes |
| `--d-reveal` | 900 ms | type and plates arriving |
| `--d-plate` | 1500 ms | a photograph developing from halftone |

Springs (JavaScript): magnetic buttons k = 190, c = 17; the cursor ring
k = 260, c = 24. Nothing uses ease-in. With reduced motion, nothing moves
on its own: no press run, no smooth scroll, no parallax, no page turns,
type fully inked and photographs developed.

## Systems

- **The press** — `assets/halftone.js`. Four CMYK screens out of register,
  pulled in, handed back to the photograph. The loupe shows the dots.
- **The print** — `assets/pixelfield.js`. One dot per pixel; five movements.
- **Cold glass** — `assets/glass.js`. Frost, drops that run and leave clear
  trails, a pointer that wipes, mist that returns. The bottle is clear at rest.
- **The page** — `assets/issue.js`. One clock for everything that follows
  the scroll; inked type; developing plates; chapter wipes and paper tints;
  the night; magnetic buttons; the cursor; page turns; sound.
