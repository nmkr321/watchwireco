# The Watch Wire content playbook

How @watchwireco plans, makes, approves and posts content. The engine and the
agents read this file, so keep it current. v1.0 · 20 Nov 2026.

## 1. What performs (audit of reference accounts, 19 Nov 2026)

Sample: the latest 5–12 posts from @luxurywatchmedia, @liveforwatches, @watchnews,
@watches, @thewatchmenu and @watchmaestro.dubai. Likes are hidden on the two
favorites, so their ranking uses comments + reposts.

| Rank | Topic | Evidence | Why it works |
|---|---|---|---|
| 1 | **CELEBRITY / pop culture** | Top or 2nd on every account using it: "Bond's next watch: Omega or JLC?" (199 comments, ~10× median), Zverev's $460K Jacob & Co, Khabib's collection, "The Luxury Watches of GTA 6" (2.1K likes, ~11× median), Drake/Jay-Z spotted posts | Famous name + watch + price or question |
| 2 | **WOULD YOU RATHER** | "Same money. Which Rolex?", "Expensive or affordable" (2.2K, ~11× median), "choose one" posts at ~2× median | Easy to comment on |
| 3 | **LISTICLE / explainer** | "A. Lange & Söhne explained" (108 C+R, ~5× median, highest repost ratio) | People save and share guides |
| 4 | **Breaking NEW RELEASES** (hyped references only) | AP Royal Oak Mini reel: 10.9K likes, 5.1K shares, 246K views; GPHG winners ~6× median | Speed on big news |
| — | Weak | Dealer promos (20–57 likes), generic mood posts, single-watch spotlights, minor launches, history without a hook (the Royal Oak 1972 story was @liveforwatches' worst) | No tension, no reason to stop |

**Headline patterns in the winners:**
- **Celebrity + watch + twist:** "Bond's Next Watch: Omega or JLC?"
- **Number shock:** "$460,000", "4.5 billion years old", "1 of 75", "100 watches"
- **Binary question:** "Same Money. Which Rolex?"
- **Explainer or pop culture:** "Every X, Explained" / "The Watches of [pop-culture thing]"

**Formats:**
- **Carousels** win for media accounts, so they're our main format.
- **Reels** reach furthest for hyped new releases and wrist shots, so we'll add them later.
- **Single images** underperform. Don't use them.

**History lesson:** history only works with a hook that creates tension, like The
Dial style: "Rolex Started As A London Import Company. Here's How It Became Rolex."
A date and a fact on their own ("In 1972, AP introduced the Royal Oak") flops.

**Volume:** @luxurywatchmedia posts 3–5 a day. Our 2–3 a day plus breaking news is in that range.

## 2. The daily plan

| Slot | Time (ET) | Lane | Formats, weighted by performance |
|---|---|---|---|
| Morning | 08:30 | news | NEWS / NEW RELEASES from the watcher; otherwise CELEBRITY news |
| Midday | 12:30 | rotation | CELEBRITY ×2, WOULD YOU RATHER ×2, LISTICLE ×2, MARKET/AUCTIONS ×1 per week |
| Evening | 19:30 | history | HISTORY with a tension hook (On This Day · How It Started · The Story Behind) |
| Breaking | any time | breaking | Approved breaking news; max 3 a day, 90 min apart, not 23:30–06:30 |

**Breaking-news rule:** only hyped brands and references, record results, price
changes, official data or big celebrity moments. Reviews, awards round-ups, minor
launches and dealer stories are skipped. The triage step enforces this.

## 3. Where ideas come from

| Rhythm | Source | Feeds which lane |
|---|---|---|
| Every 5 min | Watcher: Google News for 22 brand and topic searches, filtered to trusted domains only (`config/sources.json`) | breaking, news |
| Daily | Celebrity spotting: sports (NBA tunnel, F1, tennis, UFC), red carpets, music. Pop-culture moments (films, games, launches) and their watches | CELEBRITY, LISTICLE |
| Weekly | Two watches in the same price bracket with a debate; "Every [brand/collection], explained" list | WOULD YOU RATHER, LISTICLE |
| Monthly | FH Swiss exports (published dates on fhs.swiss); WatchCharts market update; auction results | MARKET, AUCTIONS |
| Yearly calendar | Watches and Wonders (Geneva, 5–11 Apr 2027); Phillips/Christie's/Sotheby's spring and fall sales (Geneva, Hong Kong, New York); GPHG (Nov); Oscars/Grammys/Met Gala/Wimbledon/F1 | Event weeks switch the whole schedule to coverage |
| Evergreen stock | History bank: brand origins, famous references, dated anniversaries ("On This Day") | HISTORY; keep about 30 ready |

**Idea test** (every idea must pass before it gets made):
- **Would a collector stop?** Name, number, question or tension in the hook.
- **Can we prove it?** A primary source, or two trusted outlets.
- **Which format and template?** A for news, data and debates; D for stories and history.

## 4. The production line

```text
watcher (no AI) ──► triage (Haiku, <1¢) ──► editor agent ──► approver agent ──► queue ──► publisher
                     skip noise              research → hook →    acts as owner:     slot or   Instagram
                                             carousel → caption   8 hard gates +     "now"     Graph API
                                                                  taste score
```

- **Editor** (`.claude/agents/watch-wire-editor.md`): runs the four Content Creation
  agents in order. It uses the research agent's automation mode when no browser exists.
- **Approver** (`.claude/agents/watch-wire-approver.md`): stands in for the owner.
  Its hard gates are facts traced to sources, a primary source or two trusted
  outlets, brand rules, photo credits, a caption that matches the slides, and no
  duplicates. Soft score needed: 17/25 or more. It can send a post back to the
  editor once for fixes.
- **Owner taste file** (`state/owner-taste.md`): every time you overrule the
  approver, add a line here. The approver reads it first, so it learns your taste.

## 5. Approval and posting modes

- `auto_publish: false` (now): approved posts go to `queue/posted/` as "ready to post".
  You post them by hand.
- `auto_publish: true`: approved posts publish through Instagram's official API at
  their slot. Breaking news publishes immediately.
