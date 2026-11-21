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
