# Domain Black — Shopify theme

**Issue Nº 01 — The Five Worlds.** The store front as a printed magazine:
ivory paper (Crown's lacquer), ink (Kingdom's), Bodoni Moda and Jost, and
the house's own campaign photography placed as plates, never recoloured.

The theme runs the same page, the same stylesheet and the same script as
the published site. `scripts/shopify/sync-from-site.py` copies them in.

## The issue, page by page

| Page | Section | What happens |
|---|---|---|
| p. 01 | `domain-cover` | The masthead is three overprinted plates — Celestial blue, Empire orange, Kingdom black — pulled into register as the page opens, slipping slightly whenever it scrolls. The lineup photograph is printed as four halftone screens, out of register, then handed back as itself. Hold the pointer over it to see the dots. |
| p. 02 | `domain-contents` | The contents; on a desktop the page under each entry follows the pointer. |
| p. 04 | `domain-belief` | The founder's letter. The pull quote is inked word by word as it is read. |
| p. 08 | `domain-worlds` | Five chapters. The catalogue photograph holds still and wipes to each world as its chapter arrives; the paper takes on that world's tint. Under each, **In the glass**: the notes, as close crops of that world's own photograph (never the bottle), pouring in one after another. One block per world, each with an optional **product** — the button, price and (optionally) the photograph then come from the store. |
| p. 18 | `domain-night` | **After Hours.** The page goes dark. Empire stands behind cold glass: the mist gathers around the ingredients, drops run and gather, and a pass of the hand (or a drag on a phone) wipes it, after which it mists back over like breath. The bottle itself is always left clear. Choose the **product behind the glass** and the button goes to it. Below, three night plates: two bottles set small in a field of black, and the monogram. |
| p. 22 | `domain-print` | The lineup drawn live as ~200,000 halftone dots (WebGL 2). Scroll moves it through five movements; the last regroups every dot into the Celestial photograph. Drag to push, press to pull. |
| p. 28 | `domain-contact` | A contact sheet of sixteen frames from the shoot, with china-marker rings on the picks, a loupe, and a lightbox. |
| p. 34 | `domain-covers` | Five magazine covers in a stack you can deal from (drag, arrows, keys). |
| p. 38 | `domain-register` | Every composition in one table. Rows can be linked to products. |
| p. 40 | `domain-colophon` | The seal (a ring of type around a photograph of the real monogram), a **real newsletter form** (Shopify customer form, tagged `newsletter`), and the colophon. |

Every photograph is the retoucher's file, cropped and sized for the web.
Nothing in the theme draws a bottle.

## Install

1. Online Store → Themes → Add theme → **Upload zip file** → `domain-black-theme.zip`.
2. Customize. The home page arrives filled in with the five worlds.
3. On each **World** block in *Five worlds*, choose the product. The button
   then goes to it and the price comes from the store. Tick *Use the
   product's featured image* to replace the bundled photograph (4:5 fits
   without cropping).
4. Do the same on the *Register* rows if you want them linked.
5. Navigation → give the header a `main-menu` and the footer a `footer` menu.

### Optional product metafields

Collection and product pages read `domain.accord` (text) and
`domain.vintage` (text) when they exist, and fall back gracefully when not.

## Moving between pages

The store opts in to cross-document view transitions (`@view-transition`).
Follow a product from the five worlds and the page turns while the
photograph you clicked travels to the product page's plate. Browsers
without support simply load the next page.

## Sound

The header offers a **Sound** switch (*Header → Offer sound*). It is off on
every visit until pressed; then the notes ring like a struck glass as they
pour in, and wiping the glass on p. 18 makes a soft rub. Nothing is
downloaded: every sound is synthesised in the browser.

## Motion, WebGL, and doing without either

- **No library is required.** The press and the print are written directly
  against WebGL. Lenis (smooth scrolling) is optional and loads from
  jsDelivr; *Theme settings → Motion* turns it off.
- **Reduced motion** is respected everywhere: no press run, no smooth
  scroll, no page turns, no cursor or magnetic buttons, type fully inked,
  photographs shown developed, and the glass misted but still: no drops
  run, and nothing wipes itself.
- **Without WebGL** the cover shows its photograph, p. 18 shows Empire
  without glass, and p. 22 shows the lineup as a plain plate with one line
  of explanation.
- The three heavy modules (press, print, glass) are loaded with `import()`,
  so a failed request costs the page its animation and never its content.

## What was checked before this was shared

- The theme was rendered offline section by section (`scripts/preview-shopify-theme.mjs`)
  and validated (`scripts/validate-shopify-theme.mjs`): every Liquid file parses,
  every schema is valid JSON, every setting read is declared.
- The rendered home page was walked at 1440 × 900 and 390 × 844: no console
  errors, no failed requests, no horizontal overflow at any stop, the
  masthead fits its measure, the print runs (199,660 dots desktop, 90,000 phone).
- The same page was loaded with WebGL disabled, with `pixelfield.js`,
  `halftone.js`, `catalogue.js` and the CDN each blocked, with reduced motion,
  and with JavaScript off. In every case all five worlds, sixteen frames, five
  covers and five register rows are present and the cover photograph shows.
- Storefront templates (product, collection, cart, search, 404, page,
  collections list) render without errors.

## Known limits

- The bundled photographs are web derivatives (WebP, 480–1920 px). Replace
  them with your own by choosing images in the editor, or re-export from the
  originals with `scripts/editorial/derive.py`.
- The magazine covers are images with type set into them, made by
  `scripts/editorial/covers.py`; change their wording there and re-export.
