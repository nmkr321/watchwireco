# Design notes from the owner
Every design decision builds on these. The editor reads this before each post; the approver checks it.
Add each new owner praise or critique here (dated, one line). Newest last.

## What the owner liked (do more of this)
- 2026-11-20 GTA post: real gameplay images + the real watch cut out in a gold medallion with a gold arrow and ring on the wrist. "MUCH better."
- 2026-11-20 Tiered "Build your collection": three choices per tier (A/B/C) the viewer picks from.
- 2026-11-20 Photo-led slides with a short all-caps headline underneath, like the reference accounts.

## What the owner disliked (never again)
- 2026-11-20 Slide 1 headline sitting too low: every block centred and balanced.
- 2026-11-20 White boxes behind watch photos: cut the background out, use the gold medallion.
- 2026-11-20 Watches you can't see in the photo: zoom toward the wrist; arrow and ring on the watch.
- 2026-11-20 Random stray shapes or rectangles on dark slides: no element that isn't aligned to the text or centred.
- 2026-11-20 Stories that go photo-less and dull at the end: keep images through the last beats (at least every other slide).
- 2026-11-20 Pre-picked lists with nothing to do, or random watches with a huge price spread: give choices and a clear niche.
- 2026-11-20 Game posts without in-game gameplay; celebrity posts without the celebrity.
- 2026-11-20 Too much text: headlines 2-6 words, body 15 words max.
- 2026-11-20 Spotted slides: the watch in the medallion must clearly be the watch on that wrist. If the in-game/photo watch doesn't visibly match (strap, bezel, shape), drop the slide. (GTA Submariner slide removed.)
- 2026-11-20 Comparisons (WYR, X vs Y): put BOTH watches on the cover, side by side with a gold "or" (A-cover photo + photo2). Liked.
- 2026-11-20 No "e.g." on slides or captions; write "Like this: 1B · 2A · 3C". Collection format: owner likes it a lot.
- 2026-11-21 (engine, from the owner's 20 Nov rule) Watch product photos now have their plain studio background removed automatically (src/cutout.mjs) and sit on black; the cream panel behind single watch photos is gone.
- 2026-11-21: Owner: a slide like "$33,600 retail, not resale / resale not checked" gives readers no reason to act. Celebrity posts use a Watch Spotlight slide and a "Your call: wear it or pass? Comment WEAR or PASS" slide; hedges go in the caption, never a slide of their own.
- 2026-11-22: Owner: posts that break up the feed visually (Pattinson as Bond, the GTA post: people/scenes instead of a product on black) are good; mix them in. Every watch named on a cover must appear in a photo in the post.
- 2026-11-25: Owner: our posts are bland, "a black screen with gold words"; every liked reference has an attention-grabbing photo cover. Loves @watchesofcelebrities "Watches spotted at the 2026 F1 Las Vegas GP": celebrities cut out in front of giant watch faces, bold headline. New covers: EVENT (people cut out over watch faces), PERSON + WATCHES, full-bleed PHOTO, WATCHES ON STAGE; per-post colour backdrop; no text-only covers.
- 2026-11-25: owner loved the chronograph post's movement shot (slide 2), but it should have been the cover: lead with the most attention-grabbing picture. WATCH EXPLAINED covers = the movement/mechanism close-up.
- 2026-11-26: owner: design problems should be caught before the approver. The renderer now measures every slide (overflow, overlap, cut-off footer, text on black, cover text over 40% of the photo), shrinks text up to 28% to fit, and sends what's left to the editor.
- 2026-11-26: Owner: posts are often super hard to read. Plain words: one normal sentence per slide, no reference numbers/codes/sources/dates on slides (caption + footer only), explain or drop technical words. Covers like @luxurywatchmedia/@liveforwatches: one huge tight photo (~70%), 3-5 word twist headline, one short fact line.
- 2026-11-27: Owner loved the AP scratch-story post ('perfect'). Covers: a question or dare that pulls people in ('Try To Scratch This AP's Bezel'). Last slide: a follow page ('Like this one? Follow for more.'); comment question in the caption.
- 2026-11-27: AP post looked grainy on Instagram. Cause: a 1440x960 shrunk copy stretched 1.4x to fill the tall cover. Covers need a photo at least 1080 wide and 1350 tall (or a tall photo); the downloader now grabs the full-size original and the pre-check flags small covers.
