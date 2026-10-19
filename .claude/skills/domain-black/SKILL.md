---
name: domain-black
description: House rules for any work on the Domain Black fragrance brand in this repository — the website (web/), the Shopify theme (web/shopify/), the editorial photo scripts (scripts/editorial/) and the theme sync (scripts/shopify/). Use before changing any of them, and whenever the task involves Domain Black photography, the product, the site or the store.
---

# Domain Black — house rules

- **The product is photographed, never drawn.** Use the house's photographs.
  Never render, sketch, regrade or "improve" a bottle, a cap or the db
  monogram. Edits happen around the product: crop, type, layout, motion.
  A transition may pass through a halftone or dots; the resting state is
  always the photograph.
- **The photographs are in Google Drive** (`Nick's Deliverables_Marketing`).
  Pull them to disk with the `drive-files` skill. Originals are not
  committed; web derivatives are (`scripts/editorial/derive.py`).
- **The site is the source of truth.** `web/index.html` and `web/assets/`
  first, then `python3 -I scripts/shopify/sync-from-site.py web/index.html web/shopify`,
  then `bash scripts/build-shopify-zip.sh`.
- **The look:** paper `#ece6dc`, ink `#171513`; Bodoni Moda for what is
  read, Jost for what is operated; Pinyon Script only for "It's Yours.".
  The page is an issue of a magazine: running heads, folios, plates.
- **Testing:** walk the page at 1440×900 and 390×844 and look at the
  screenshots. Measure horizontal overflow against
  `documentElement.clientWidth` and `visualViewport.width` — on a phone
  `innerWidth` grows with the overflow and hides it. Run the degrade cases
  (no WebGL, each module blocked, CDN down, reduced motion, no JS).
- **Video from stills** (`autocut`, style `still_motion`, or by hand with
  `scripts/editorial/teasers.py`): the first frame is a bottle, never a
  blank plate; one composition per film; supers sit only where the frame
  is dark and empty (never across the product, salt, or a pale backdrop);
  a 16:9 still is placed whole on the night ground rather than cropped
  through a bottle. Pull a 2 fps contact strip and crop every super at full
  size before calling a cut finished.
- **Motion is a lean, not a chase:** magnetic pulls ease off toward a
  ceiling of about 14 px; nothing moves under reduced motion.
- **After a session with corrections, run `/retro`.**
