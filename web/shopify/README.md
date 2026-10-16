# Domain Black — Shopify theme

A complete Shopify Online Store 2.0 theme for a modern fragrance house.
Five compositions, one house. Nothing about the product changes: the flacons,
their names, prices and photography stay the merchant's — the theme only
frames them.

It is the same code as the standalone site in `web/`. The stylesheet and the
behaviour file are shared verbatim, so the two can never drift apart.

---

## What makes it different

**The campaign photograph turns on.** The hero holds one photograph twice —
cold, and warmed. A visitor presses the flacon (or simply scrolls) and the
warm copy is revealed outward from the bottle, sillage rising off it, the
whole room behind warming with it. One custom property, `--open`, drives all
of it: the mask, the particles, the glow on the tagline and the stone lifting
off the 3D flacon. The merchant tells the theme where in their photograph the
flacon sits, so the warmth blooms from the right place.

**No mock-ups.** Nothing on this theme draws a bottle that was not
photographed. Where there is no pack shot, a composition's plate is its own
lacquer colour and its words — never an illustration standing in for the
product. Drop the real photography into **Five Worlds** and it takes the
plate as-is.

**No 3D library.** The pixel field is 35 KB of raw WebGL 2. It used to lean
on three.js — 671 KB for a renderer, four render targets, two programs and a
perspective matrix, about five percent of the library. The simulation was
always raw GLSL; only the plumbing was borrowed.

**The photograph is taken apart, pixel by pixel.** One particle per pixel of
the campaign shot — a 270 × 480 image is 129,600 of them — simulated entirely
on the GPU in ping-pong float textures. Scroll position through the section
*is* the movement index, so the sequence runs with no animation library at
all. Five movements: the frame held together by a spring per particle;
diffusion on curl noise; a relief where each pixel is pushed along z by its
own luminance; the pixels sorted into whichever of the five house colours
they most resemble, each pile shaped like a flacon; and all of them
reassembled into one bottle. Dragging pushes the field aside, pressing pulls
it back in. On a portrait screen the five piles stack rather than shrinking
into thumbnails.

**The rules slosh.** The horizontal rules between sections are a meniscus
pushed by scroll speed. They overshoot and settle, because liquid does.

**The engraving is drawn, not photographed.** A hypotrochoid swept with a
precessing phase — how an engine-turning lathe actually cuts a rosette —
engraved once to an offscreen bitmap at device resolution and shared by every
plate on the page. Sharp at any size, weighs nothing, recolours from theme
settings.

---

## What is in here

```
assets/      domain-black.css      the whole visual system, one file
             domain-black.js       behaviour: engraving, sillage, liquid, motion
             catalogue.js          the five compositions, dependency-free
             pixelfield.js         the photograph as a GPU particle field
             flacon-silhouette.png the flacon, cut from the campaign frame
             campaign-sovereign.png a campaign photograph to start from
layout/      theme.liquid          the page frame
             password.liquid       the pre-launch page
sections/    domain-hero           the campaign photograph, and opening it
             domain-pixels         that photograph, taken apart to pixels
             domain-campaign       the photograph shown whole, unaltered
             domain-five           Five Worlds, from a collection
             domain-register       the register table
             domain-rule           a sloshing rule, to drop between sections
             domain-seal           the struck seal and the sign-up
             header / footer
             main-*                product, collection, cart, search, page,
                                   blog, article, 404, collections list
snippets/    domain-scripts        the import map and the libraries
templates/   *.json                which sections each page shows
             customers/*           account, login, register, orders, addresses
config/      settings_schema       colours, engraving strength, motion
locales/     en.default.json
```

## Install

**As a whole theme**

1. `domain-black-theme.zip` next to this README is the upload.
2. Shopify admin → **Online Store → Themes → Add theme → Upload zip file**.
3. **Customize** to choose the campaign photograph, the collection and the
   copy. Preview before publishing.

**As sections dropped into a theme you already use** (Dawn, or any OS 2.0 theme)

1. Copy `assets/domain-black.css`, `domain-black.js`, `catalogue.js`,
   `pixelfield.js` and `flacon-silhouette.png` into `assets/`.
2. Copy the `domain-*.liquid` sections into `sections/`.
3. Copy `snippets/domain-scripts.liquid` into `snippets/`, add
   `{% render 'domain-scripts' %}` before `</body>` and
   `{{ 'domain-black.css' | asset_url | stylesheet_tag }}` in `<head>`.
4. Theme editor → **Add section** → they appear under their own names.

## Setting it up

In **Customize**:

- **Hero · campaign** — choose the photograph, then drag the two position
  sliders until the marker sits on the flacon in your shot. That is where the
  world warms from.
- **The photograph · pixels** — choose the photograph and how much scrolling
  the five movements take. The final movement reassembles into the flacon cut
  from the campaign frame; supply your own transparent PNG to override it.
- **The campaign** — the photograph again, shown whole and unaltered.
  lift, tip and fill it wants, so adding your own detail is a block, not a
  code change.
- **Five Worlds** — choose the collection. Product images are used as-is
  inside an engraved plate; nothing is cropped or recoloured.
- **The Register** — inventory drives the run column; anything unavailable
  reads *Closed* in oxblood.
- **Sloshing rule** — drop between sections; set height and strength.
- **Seal** — the sign-up posts to Shopify customers, tagged `newsletter`.

### Optional product metafields

Set these under **Settings → Custom data → Products**. Each has a fallback, so
none is required.

| Namespace & key | Type | Shows as |
|---|---|---|
| `domain.theme` | Single line text | The disposition under the name ("Quiet Authority") |
| `domain.accord` | Single line text | The note list, comma separated |
| `domain.line` | Single line text | The one line of copy under the notes |
| `domain.world` | Single line text | The room it evokes, under the line |
| `domain.swatch` | Colour | The card's hover edge, and the register swatch |
| `domain.vintage` | Single line text | The Vintage column |
| `domain.run` | Integer | Overrides the run size for that one lot |

## Motion, WebGL, and doing without either

**Nothing on the page depends on anything that can fail.** The pixel field
is imported *dynamically*, and only once its section is within reach of the
viewport. Only the catalogue is
imported statically, and it depends on nothing. If the pixel field never
arrives, the products, the register, the engraving, the seal and every reveal
are still there, and the section that lost something says what and why. A
static import put all of that behind one request, and a page that lost it
lost everything, silently.

The pixel field needs **WebGL 2 with float render targets** and probes for
it before touching a context, so a browser without it gets a line of text and
no console error. There is no library to fetch, from a CDN or anywhere else. Where WebGL is missing the object is
replaced by a line of text and the rest of the page is unchanged — the theme
probes for WebGL before constructing a renderer, so nothing logs an error on
the way.

GSAP and Lenis load from a CDN in `snippets/domain-scripts.liquid` and are
**optional at runtime**. Every reveal animates *from* its resting state, so
the resting state is what a visitor without them sees; smooth scroll falls
back to the browser's own. `prefers-reduced-motion` is honoured throughout —
the flacon stops turning, the rules hold still, and the hero shows warmed
rather than waiting to be opened.

For production, self-host GSAP and Lenis too: upload `gsap.min.js`,
`ScrollTrigger.min.js` and `lenis.min.js` to **Assets** and swap the three
`<script src>` values in the snippet for `{{ 'gsap.min.js' | asset_url }}`
and so on.

## What was checked before this was shared

From the repository root:

```
npm run theme:check     # structural check, exits non-zero on a problem
npm run theme:preview   # renders the theme to .preview/ against mock data
npm run theme:zip       # checks, then rebuilds domain-black-theme.zip
node scripts/render-flacons.mjs   # re-render the five after a flacon change
```

`theme:check` verifies every required file exists, every JSON and Liquid file
parses, every `{% schema %}` is valid JSON, every `section.settings.*` the
Liquid reads is one the editor can actually set, every section a template
orders exists, and every `{% render %}` and `{% section %}` points at a real
file.

`theme:preview` renders the theme offline against a mock store, so the whole
page can be loaded in a browser without one. It was then checked in Chromium
at 1440×900 and 390×844, twice: no console errors, no failed requests, no
horizontal overflow, and nothing left invisible after a full scroll — with
the motion libraries present, with them blocked, and with WebGL disabled.

Each movement of the pixel field is screenshot separately from a bench page
and looked at — a particle system cannot be checked any other way. Most of its
bugs were only ever visible that way: a silhouette whose thickness came from
distance-to-centre and domed every shape into a ball; and, in the move off
three.js, blending left enabled for the simulation passes, which blended each
new velocity against the old using an alpha of zero and discarded every write,
so the photograph sat perfectly still in all five movements.

The suite includes a check that loads the page with the pixel field blocked
and asserts that all five products with their prices, all five register rows,
the seal's 72 teeth, the movement index and the engraved plates are still
present, and that the section which lost something has said so.

A fault that only the theme could show up: `--shot` holds a URL, and a
relative `url()` inside a custom property resolves against the stylesheet that
declares it. With the CSS inline on the standalone site that was harmless;
in the theme, where the CSS lives in `assets/`, it resolved to
`assets/assets/…` and the photograph 404'd. The URL is made absolute now.

## Known limits

- Not run against a live store from this environment — the Shopify connector
  was not authorised and the storefront was unreachable, so these checks are
  structural and visual, not a live install.
- ES modules need the page served over http(s). Shopify always does; opening
  the standalone `web/index.html` from `file://` will not load the flacon.
