---
name: editorial-covers
description: Turn product photographs into magazine-style editorial pieces — covers with a masthead that runs behind the product, double-page spreads, lookbook captions — without altering the product, its colour or its logo. Use when asked to "edit photos in editorial / magazine style", make covers or spreads, or present a launch as an issue of a magazine, especially when the user insists the product must look exactly as it does in hand.
---

# Editorial covers

The rule that decides everything: **the product's pixels are the
retoucher's pixels.** No regrade over the bottle, no relight, no redraw, no
"cleaned-up" logo. The edit happens around the product — type, layout,
crop, placement — and in how the frame is presented. A user who holds the
real bottle will see any drift in its colour at once.

`scripts/editorial/covers.py` and `spreads.py` are the reference.

## The cover

- **Masthead behind the subject.** Set the masthead, then lay the top of
  the product back over it. Cut the cap out with the `photo-cutout` skill
  (a graph cut seeded with an ellipse inside the cap, everything outside a
  larger ellipse as definitely background); only its top edge has to be
  clean, because only the top crosses the letters. Paste the *original
  photo* through the feathered mask — the cap on the cover is the photo.
- **Ink or paper.** Choose the type colour from the measured lightness of
  the band it sits on, not by taste: mean luminance over the masthead area
  above ~0.42 → ink, below → paper.
- **Cover lines over the reflection, not the product.** A shallow shade
  ramp over the tabletop reflection buys legibility; stop it above the
  bottle's base.
- **Pillow has no tracking.** Place glyphs one by one, and treat "Nº" as a
  single sign or it gets pulled apart. Bodoni Moda's italic has no W–o or
  W–e kern pair: set the W by hand (≈ −16 px at 84 px), and on the web wrap
  it in a span with negative letter-spacing.
- **Fonts**: the Google Fonts CSS API with a plain `curl` user agent hands
  back TTFs; ask for a specific `opsz` to get the display cut.

## Spreads

- A lineup spread: the photograph across the gutter, captions under each
  bottle at that bottle's own x in the frame.
- A letter spread: the photograph full-bleed on the left page, the text set
  on the right with a three-line drop cap and a pull quote.

## On the web

The covers are artwork with type in them, fine as images. Everything else
— headings, captions, prices — stays live HTML. Photographs placed on the
page keep their colour; motion can pass through a halftone or a dot field
as a *transition*, but the resting state is always the photograph itself.

## Check

Open each output at full size and look at the cap edge where it crosses
the letters, the bottom block's legibility on the lightest cover, and every
line of tracked type for collisions.
