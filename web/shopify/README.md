# Domain Black — Shopify theme

A complete Shopify Online Store 2.0 theme built around one idea: **a flacon is
a bearer instrument.** Not a bottle you buy — a lot you hold, recorded in a
register, issued to whoever carries it.

The look is engraved security printing: guilloché rosettes, a bearer strip of
facts, a share register, a struck seal. Modern new money, raised by old money.

**Nothing about the product changes.** The five flacons, their names, prices
and photography are the merchant's; the theme only frames them.

---

## What is in here

```
assets/      domain-black.css   the whole visual system, one file
             domain-black.js    guilloché engraving + motion
layout/      theme.liquid       the page frame
             password.liquid    the pre-launch page
sections/    domain-certificate the hero: engraved rosette + bearer strip
             domain-five        the five lots, each in a guilloché vignette
             domain-register    the share register, driven by inventory
             domain-seal        the struck seal + sign-up form
             header / footer
             main-*             product, collection, cart, search, page, blog,
                                article, 404, collections list
snippets/    domain-scripts     the motion libraries, in one place
templates/   *.json             which sections each page shows
             customers/*        account, login, register, orders, addresses
config/      settings_schema    colours, engraving strength, motion
locales/     en.default.json
```

## Install

**As a whole theme**

1. Zip the contents of this folder (the folder's *contents*, not the folder).
   `domain-black-theme.zip` next to this README is already that zip.
2. Shopify admin → **Online Store → Themes → Add theme → Upload zip file**.
3. **Customize** to set the collection and the copy. Preview before publishing.

**As sections dropped into a theme you already use** (Dawn and any other OS 2.0
theme)

1. Copy `assets/domain-black.css`, `assets/domain-black.js` into `assets/`.
2. Copy `sections/domain-certificate.liquid`, `domain-five.liquid`,
   `domain-register.liquid`, `domain-seal.liquid` into `sections/`.
3. Copy `snippets/domain-scripts.liquid` into `snippets/`, and add
   `{% render 'domain-scripts' %}` before `</body>` in `layout/theme.liquid`.
4. Theme editor → **Add section** → the four show up under their own names.

Each `domain-*` section loads the stylesheet itself, so it works dropped into a
theme whose layout knows nothing about it. Inside this theme the layout loads
it too; a repeated `<link>` to the same file costs nothing.

## Setting it up

In **Customize**:

- **Certificate hero** — eyebrow, wordmark, tagline, standfirst, and the four
  columns of the bearer strip. The issue number counts up on load.
- **The Five** — choose the collection. Product images are used **as-is**,
  held inside an engraved vignette; nothing is cropped or recoloured.
- **The Register** — choose the collection, set the run size and the column
  headings. Inventory drives the "of run" column; anything unavailable reads
  *Closed* in oxblood.
- **Seal** — the sign-up form posts to Shopify customers and tags them
  `newsletter`.

### Optional product metafields

Set these under **Settings → Custom data → Products** and the register and
product pages fill themselves in. Without them the theme falls back to product
type, publish year and the section-wide run size — so it is never required.

| Namespace & key | Type | Shows as |
|---|---|---|
| `domain.accord` | Single line text | The Accord column, and the lot note |
| `domain.vintage` | Single line text | The Vintage column |
| `domain.swatch` | Colour | The square beside each lot name |
| `domain.run` | Integer | Overrides the run size for that one lot |

## How the engraving works

`domain-black.js` draws a hypotrochoid swept with a slowly precessing phase —
which is how an engine-turning lathe actually cuts a rosette. Each plate is
engraved once to an offscreen bitmap at device resolution; the live effect comes
from compositing two plates turning against each other, so the moiré is real
interference rather than an animated filter. It costs two `drawImage` calls a
frame instead of a hundred thousand line segments.

It is drawn, not photographed, so it is sharp at any size, weighs nothing, and
recolours from theme settings.

## Motion, and doing without it

GSAP and Lenis load from a CDN in `snippets/domain-scripts.liquid`. Both are
**optional at runtime**. If a CDN is blocked, the page still renders and reads
correctly: every reveal animates *from* its resting state, so the resting state
is what a visitor without the libraries sees, and smooth scroll falls back to
the browser's own. `prefers-reduced-motion` is honoured throughout — the rosette
stops turning and nothing slides.

For production, self-host instead: upload `gsap.min.js`, `ScrollTrigger.min.js`
and `lenis.min.js` to **Assets** and swap the three `<script src>` values in
`snippets/domain-scripts.liquid` for `{{ 'gsap.min.js' | asset_url }}` and so
on. The snippet has a comment saying the same.

## What was checked before this was shared

Run from the repository root:

```
npm run theme:check     # structural check, exits non-zero on a problem
npm run theme:preview   # renders the theme to .preview/ against mock store data
npm run theme:zip       # checks, then rebuilds domain-black-theme.zip
```

It checks that every required file exists, every JSON file parses, every Liquid
file parses, every `{% schema %}` is valid JSON, every `section.settings.*` the
Liquid reads is one the editor can actually set, every section a template orders
exists, and every `{% render %}` and `{% section %}` points at a real file.

`theme:preview` renders the sections offline against mock store data, including
stand-in photography, so the whole page can be loaded in a browser without a
store. The index and product pages were checked that way in Chromium at
1440×900 and 390×844: no console errors, no failed requests, no horizontal
overflow, with and without the motion libraries present.

## Known limits

- The theme has not been run against a live store from this environment — the
  Shopify connector was not authorised and the storefront was unreachable, so
  the checks above are structural and visual, not a live install.
- Copy and the five lot names in the previews are placeholders. Replace them
  with the real ones in **Customize**; the products themselves are untouched.
