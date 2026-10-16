---
name: photo-cutout
description: Cut a subject out of a single photograph with no machine-learning model — a GrabCut built on numpy and scipy's max-flow. Use when asked to remove a background, isolate a product or person, make a transparent PNG from a photo, separate a photograph into layers (subject / object / setting), or build a silhouette mask for an effect, and there is no OpenCV, no rembg, and no network to fetch a model from. Covers the colour models, the contrast-sensitive smoothness term, recovering the cut from the residual graph, and the seeding that decides whether it works.
---

# Photo cutout without a model

For one hero photograph a graph cut beats a segmentation network: it is
exact where the colours separate, it is inspectable when it fails, and it
needs nothing but numpy and scipy. `scripts/lib/grabcut.py` in this
repository is the implementation.

```python
from grabcut import grabcut
fg = grabcut(rgb, probably_fg, definitely_bg=forbid, iters=4, k=5)
```

Three iterations over a 270×480 frame takes about 7 seconds.

## How it decides

| term | what it costs |
|---|---|
| **unary** | `-log P(colour)` under a Gaussian mixture, one fitted to the current foreground and one to the current background |
| **pairwise** | `γ·exp(-β‖Δcolour‖²)` between 4-neighbours — alike neighbours are expensive to separate, neighbours across an edge are cheap |
| **cut** | `scipy.sparse.csgraph.maximum_flow`, then a walk of the residual graph from the source |

Then refit the mixtures on the new labels and cut again. That loop is what
turns a rough rectangle into an outline that follows hair.

## The parts that are easy to get wrong

**β must come from the image.** Set it to `1 / (2·mean‖Δcolour‖²)` over the
whole frame. Hard-code it and the same γ that works on a bright studio shot
cuts a dark interior to ribbons.

**Recovering the cut.** `maximum_flow` returns the flow, not the labels.
Subtract it from the capacity matrix and breadth-first search from the source
over edges with residual capacity left; everything reachable is foreground.

**Capacities are integers.** Scale the float costs by a few hundred and clip
to int32. Too small a scale quantises the unary term into uselessness.

**Hard constraints need a capacity larger than any sum of neighbour weights,**
not `inf` — `9·γ·scale` is enough for a 4-neighbourhood. `inf` overflows the
int32 matrix.

**Work in Lab, not RGB.** Skin and warm wood are far apart in Lab and
adjacent in RGB.

**Mixtures: k-means++ init, no EM.** GrabCut initialises its mixtures exactly
this way, and EM on top buys little while adding a loop that can diverge.
Floor the variances (`+4.0`) or a flat component explodes.

## Seeding is most of the result

The rectangle is not a formality. Give it:

- **`probably_fg`** — generous around the subject. A union of boxes beats one
  box when a limb reaches out of the torso.
- **`definitely_bg`** — everything well outside. Without it the colour model
  will happily claim a wall that happens to match a sweater.

## When colour genuinely cannot separate

Check first, before blaming the cut: cluster the image in Lab + position and
look at the cluster map as a false-colour image. On one portrait, hair and a
dark bookshelf landed in the same cluster — no colour-only method was ever
going to split them, and the fix was a `definitely_bg` box, not a better γ.

## Separating two things inside the foreground

A graph cut gives you subject-vs-background. To split the subject again — a
product out of the hand holding it — use the geometry you already have plus a
perceptual rule, not another cut:

```python
box     = (xs >= x0) & (xs <= x1) & (ys >= y0) & (ys <= y1)
lacquer = box & (L < 34) & (A < 17)       # dark, only mildly red
gold    = box & (L >= 34) & (B > 20)      # dark-ish but strongly yellow
```

Skin at a normal exposure is *lighter and markedly redder for its lightness*
than dark lacquer. `L` alone keeps fingers; `a/L` together separates them.
Finish with `binary_closing` → largest connected component →
`binary_fill_holes`.

## Always look at the mask

Composite the result over the darkened original and open the image. Every
failure in practice was visible in one glance and invisible in the numbers:
a drop shadow included, a finger kept, a silhouette rounded off. The
foreground fraction tells you nothing — 51% of the frame was both the right
answer once and badly wrong another time.
