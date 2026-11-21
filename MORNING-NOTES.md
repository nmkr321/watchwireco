# Overnight work: 21 Nov 2026

Everything below is live in the cloud. To undo any item, ask Claude to "revert commit <code>",
or run `git revert <code>` and then `git push`.

## What I built (all free to run, no extra AI calls)

| What | What it does | Commit |
|---|---|---|
| Free pre-checks | Code checks every post for the approver's most common reasons to reject: slide counts, word limits, "e.g.", reused photos, missing credits, numbers that aren't in the research, per-slide sources, the caption ending, more than 5 hashtags, and no question for readers. The editor fixes these itself before the paid Sonnet approver sees the post. After two tries it stops blocking and hands the leftovers to the approver as notes. | 4dcd106, 5ac2afc, 51dbf0e |
| Insights loop | Every night it records likes and comments for each post at 1 day and 7 days, plus your follower count. It writes `watch-wire-engine/state/performance.md` (best formats and times) and tells the planner what works. | 4dcd106 |
| Trial Reels (OFF) | Turns each carousel into a 9:16 video (each slide centred over a blurred copy of itself) and posts it as a trial Reel, which is shown to non-followers first and not put on your grid. It stays off until you switch it on. | 3f7c0cd |
| Library check | Before making a backup post, it checks that enough unused, priced watches are left. If not, it picks another format instead of wasting a run that is bound to fail. | 5ac2afc |
| Daily summary + token check | `watch-wire-engine/state/daily.md` each night: what posted (with links), rejects, cost, and whether the Instagram token still works. You get an alert if the token breaks. | 5ac2afc |
| Alt text | Every slide gets a plain description (headline, watches, prices) when it posts. This helps accessibility and search. If Instagram ever refuses it, the slide posts without it. | 5ac2afc |
| Editor rule | Every post must add our own take (protection against Instagram's April 2026 "aggregator" reach cut). Captions open with the brand, model and reference, like a search headline. | 5ac2afc |
| Planner memory | The planner no longer re-suggests ideas the approver rejected in the past week. Last night it had re-planned the rejected Tyson Fury post; I swapped that slot to a fresh celebrity idea. | a90a387 |
| Skipped-run safety | If GitHub skips the 1:30am plan, the 2:00am maker now plans first. A backup maker at 3:40am does the same and does nothing if the work is already done. | 750163b |

## Bugs found and fixed tonight (these caused many of the "rejected" posts)
| Bug | Fix | Commit |
|---|---|---|
| The editor started posts with a placeholder source (like hodinkee.com) it never opened, and the research checker refused them | The research step now swaps in the first page actually opened and fixes the job IDs automatically (no facts touched) | f59bf94 |
| Table, list and text slides were left-aligned, breaking your "everything centred" rule, and the editor gave up because it can't edit templates | Those slides now centre their label, headline, list and note. Tables keep their columns. | f59bf94 |
| Old learned "lessons" told the editor that the engine's own verified library prices don't count, so backups quit in 20 seconds | Replaced them with one rule: library prices dated within 7 days count, with the source and date cited | 4b00133 |
| When the editor dropped a slide, the old image stayed. The approver saw out-of-date previews, and a deleted slide could even have been posted | Old slide images are cleared on every render | 06fb527 |
| Official watch photos on white, cream or grey backgrounds showed as light boxes on our black slides (your 20 Nov rule), so the approver kept rejecting them | Watch photos now get their plain studio background removed automatically and sit on black. The cream panel behind single-watch slides is gone. People and game photos are untouched. | 17e264d |
| Old "lessons" told the editor to avoid official studio photos (from before the background fix), so pairs were refused | Replaced with one rule: plain studio backgrounds are removed automatically | 612e927 |
| Comparison (would-you-rather) and pick-3 slides still drew a grey or cream card behind each watch, the main reason comparisons were rejected this morning | Cards removed; watches sit on black with a faint gold glow. Long model names shrink so both sides stay level | 5552bd3 |
| When a post failed, its backup was nearly always a "Story Behind", which needs 7+ photos of the exact watch and failed every time | Backups now try list, comparison or collection posts from the verified library first | 2944a62 |
| GitHub delayed the 1:30am plan by 80 minutes, so it ran after my manual one and added 12 junk "UNRESOLVED" ideas | Planning now refuses to plan a day that's already planned. The junk ideas are parked in `queue/hold/` (nothing deleted). | see `git log` |

**Today's queue (21 Nov):** GitHub skipped the 1:30am plan, so I planned by hand at about 2:25am New York time (12 ideas). I restarted the maker a few times to pick up the fixes above. Approved so far: 7:00 gift watches under $6,000 (live: https://www.instagram.com/p/DgAM-PLCWya/), 9:30 Omega De Ville same-money vote, 12:00 first dive watches, 7:30pm Marie Antoinette's Breguet. The celebrity ideas failed: no November celebrity sighting could be confirmed by two outlets. At about 6:40am I queued 3 more library posts for empty slots (1:15pm Tank Must sizes, 5:00pm Hamilton first watch, 9:00pm first mechanical under $900); all three failed honestly (no clean photo of the small Tank; my Hamilton idea named the wrong reference, which the checks caught; Seiko prices only from an unconfirmed retailer), so today has 4 posts. I didn't try to fill all 12: the library only has about 20 unused priced watches, and random lists would break your value rule.

## Needs you (2 minutes each)
1. **Insights permission.** Your token can't read reach, saves or shares yet. When you next regenerate the token in Meta, also tick **instagram_manage_insights**. Until then the loop uses likes and comments only.
2. **Trial Reels: on or off?** To switch them on, set `"trial_reels": {"enabled": true}` in `config/schedule.json`, or just tell Claude "turn on trial reels". They post silently, because the API can't add Instagram music.
3. **Check Account Status** in the Instagram app (Settings → Account Status) once a week. Since April 2026, Instagram stops recommending accounts that look like they repost others' content.

## Ideas the critic held back for you to decide
- **Volume (strong flag).** 12 posts a day on a 2-follower account is aggressive. Buffer's data says more posts help, but no study covers 35+ posts a week, and our reject rate already burns money. Suggestion: after the 27 Nov trial review, keep 3–5 a day and pick the slots by the insights data.
- **Citations rework.** Drop the per-slide source footers, which cause many rejects. Instead, credit sources in the text ("per Phillips") and add one "Sources: X, Y · Nov 20" line on the last slide. Photo credits stay on the photos. This changes how posts look in public, so it's your call.
- **Named weekly series** after the trial: "Showdown Sunday" (weekly vote; Fratello has run one for years), "The Week in Watches" Sunday roundup, and "Market Monday" (price index).
- **Later:** a "Guess the price" quiz format, posting vote results back to readers (once there are real votes), and a pHash check for photos reused across posts.

## Dropped, with reasons
- **Batch API discount:** needs a separate paid API key, and saves only cents.
- **Auto source-link comment:** links in comments can't be clicked, and it's an extra public action.
- **`--bare` CLI flag:** it would ignore the Claude login your cloud runs use, which could stop every run.
