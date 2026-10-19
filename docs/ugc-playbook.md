# Domain Black — UGC playbook

What makes creator content sell a luxury fragrance, and three films to
shoot for Domain Black, with the exact way to cut them here.

## What the research says

- **Creator-led beats polished.** Audiences tune out content that lacks
  sincerity, and are sceptical of a creator who promotes several competing
  scents at once ([Shopify, 2026](https://www.shopify.com/blog/tiktok-ugc)).
  Creator-led posts outperform brand edits; *get ready with me*, layering
  and list formats work well ([Scento, 2026](https://www.scento.com/blog/fragrance-marketing-trends-influencers-2026)).
- **Make the invisible visible.** The creators who make fragrance look
  expensive match props to the notes, keep something moving, use macro
  texture shots, hold a cohesive palette and light softly
  ([TikTok: fragrance UGC examples](https://www.tiktok.com/discover/fragrance-ugc-example)).
  Domain Black's catalogue already does this: every bottle is shot beside
  its own notes. The phone versions should too.
- **Small creators and trial sizes.** Smaller creators and sampling convert
  better than raw reach ([Scento](https://www.scento.com/blog/fragrance-marketing-trends-influencers-2026)).
  The 10 ml is the product for this.
- **Measure orders, not views.** Track cost per acquisition, conversion and
  trial-to-full-bottle rate; do not scale a video because it gets clicks
  without orders ([Scento](https://www.scento.com/blog/fragrance-marketing-trends-influencers-2026),
  [eva.guru](https://eva.guru/blog/how-to-leverage-user-generated-content-for-tiktok-shop/)).

The specific view counts that circulate for fragrance on TikTok are
unsourced; none are used here.

## The rules for every Domain Black UGC film

1. **Shot on a phone, by a person.** No studio light, no grade. The
   bottle's lacquer and the gold monogram must read as they do in hand —
   autocut's `ugc_raw` style applies no colour correction for this reason.
2. **The hook is in the first second**, and it is an action, not a logo:
   a cap coming off, a pour over ice, a hand reaching into a pocket.
3. **One composition per film.** A creator holding all five reads as an ad.
4. **The notes are in shot.** Kingdom with salt and dark wood; Sovereign
   with pomegranate and a glass of rum; Celestial with an orange and
   jasmine; Crown with vanilla and something sweet; Empire with peach,
   blood orange and ice.
5. **Say it plainly.** Captions in the creator's own words. The brand line
   "It's yours." can close the film — once.
6. **Vertical 9:16, 1080 × 1920, 30 fps, 12–25 seconds.** Keep type out of
   the top 13% and the bottom 24% (the platform's own controls live there).

## Three films

### 1. "The one people ask about" — Kingdom, get-ready-with-me · 15–20 s
| Beat | Shot | On screen |
|---|---|---|
| 0–1 s | Hand takes Kingdom out of a coat pocket, close | "the one people ask about" |
| 1–4 s | Thumb lifts the black stone cap; macro on the gold monogram | — |
| 4–8 s | Two sprays: wrist, neck. Mirror. | "vanilla · salt · sandalwood" |
| 8–13 s | Jacket on, keys, door | — |
| 13–17 s | Bottle set down on a dark surface, held still | "Kingdom — Domain Black" |

### 2. "Served cold" — Empire, what-it-smells-like · 12–15 s
| Beat | Shot | On screen |
|---|---|---|
| 0–1 s | Rum poured over ice beside the orange bottle | "if a sunset was a fragrance" |
| 1–5 s | Halved peach, blood-orange slices, condensation on the glass | "peach · blood orange · rum" |
| 5–9 s | Spray into the air, walk through it | — |
| 9–13 s | Bottle on the bar, ice melting beside it | "Empire. Every entrance deserves a signature." |

### 3. "Which one are you?" — the five, list format · 20–25 s
| Beat | Shot | On screen |
|---|---|---|
| 0–1.5 s | All five on a shelf, a hand sweeping across them | "which one are you" |
| 1.5–17 s | Each bottle picked up in turn, ~3 s each | "Kingdom — quiet authority" … "Empire — magnetic arrival" |
| 17–22 s | The 10 ml dropped into a bag | "start with the 10 ml" |

A comment prompt ("tell me yours") belongs in the caption, not the video.

## Cutting them here

Attach the clips to the conversation (Google Drive's connector cannot carry
video: a 7 MB clip was refused as too large to pass through). Then:

```bash
python3 -m autocut auto "15 second vertical get ready with me, hook on the pocket, end on the bottle" \
  --style ugc_raw --aspect 9:16 --brand "DOMAIN BLACK" --product "KINGDOM" \
  --tagline "the one people ask about" --rushes ./clips --out ./out
```

`ugc_raw` cuts hard on the beat, holds the hook and the reveal, adds no
grade, vignette or grain, and keeps type inside the safe area. The edit is
written to `autocut.edl.json` first, so a cut can be changed by hand and
re-rendered without re-analysing the footage.

## Not UGC

The three 9:16 teasers delivered with Issue Nº 01 (Empire 18 s, Kingdom
18 s, the five 20 s) are cut by hand from the campaign *stills*
(`scripts/editorial/teasers.py`, rendered by autocut in the `still_motion`
style: slow pushes, hard cuts, one dissolve, no grade). Each opens on a
bottle, sets its lines only over dark, empty parts of the frame, and closes
on the wordmark and "It's Yours." They are brand motion for the feed and
stories, made from the photography; they are not creator content and
should not be posted as if they were.
