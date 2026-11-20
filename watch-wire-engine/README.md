# Watch Wire engine

Finds watch news, makes carousels with the Content Creation agents, has an
approver agent check them on your behalf, and queues or posts them to @watchwireco.

Read `PLAYBOOK.md` for the content strategy.

## Commands

```bash
node src/watcher.js --dry          # see what the watcher finds right now (no AI, free)
node src/run.js tick               # watcher + triage + make/approve breaking news + publish due posts
node src/run.js plan               # plan tomorrow's midday + evening posts
node src/run.js make-ideas         # make + approve the planned posts
node src/run.js status             # what's in the queue
```

Folders under `queue/`: `ideas` → `candidates` → `drafts` → `approved` → `posted` (or `rejected`).

## Cost controls

- The watcher uses no AI. It runs every 10 minutes for free.
- Every AI step runs on the cheapest model, Haiku 5.5. Change it with `WW_MODEL`.
- Triage runs only for stories that pass the source and score filters (cap 3¢).
- Every editor run is capped at `WW_EDITOR_BUDGET` (default $0.60), and every approver run at `WW_APPROVER_BUDGET` (default $0.25).
- At most 2 candidates are processed per tick, and a lock stops overlapping runs.
- Token savers:
  - The editor never writes slide HTML. It writes a short `slides.json`, and `templates/render.mjs` draws the slides.
  - The editor reads only `FORMATS.md` (short brief) and copies file shapes from `example/` instead of reading the workspace docs.
  - The approver reviews 540px previews instead of full-size slides.
  - Effort is set per role: approver `medium`; editor, planner and triage `low`. Change it with `WW_EDITOR_EFFORT` and the other `WW_*_EFFORT` settings.
  - A finished draft is resumed, never rebuilt.

## Turning on the schedule (Mac)

The engine only runs while the Mac is awake. To start it:

```bash
cp launchd/*.plist ~/Library/LaunchAgents/ && for f in ~/Library/LaunchAgents/com.watchwire.*.plist; do launchctl load "$f"; done
```

To stop it:

```bash
for f in ~/Library/LaunchAgents/com.watchwire.*.plist; do launchctl unload "$f"; done
```

To run it with the Mac off, move the same commands to a cloud machine or a Claude Code scheduled cloud agent.

## Connecting Instagram (one-time, done by the owner)

1. **Professional account.** In the Instagram app on @watchwireco: Profile → ☰ → Settings and activity → Account type and tools → Switch to professional account → Business → category "Media/news company".
2. **Meta developer app (done).** The app is "Watch Wire Engine" (1694864905367663), and it uses "API setup with Unified login" with the "Instagram API (Unified Login)" configuration. @watchwireco is an Instagram Tester. Its system-user token never expires and works on `GRAPH_HOST=graph.facebook.com`. To replace the token: open Use cases → Customize → API setup with Unified login → Generate token, tick "I understand", then Copy.
3. **Image hosting (done).** Instagram downloads each slide from a public https URL. `src/upload-github.sh` uploads each slide to the public repo github.com/nmkr321/watchwire-slides (signed in with `gh`) and prints its raw URL. `.env` already has `PUBLIC_UPLOAD_CMD` set to it. Anyone with a link can see an uploaded slide, but slides only go up when a post is published.
4. Copy `.env.example` to `.env` and fill it in yourself. Never paste the token into chat.
5. Set `"auto_publish": true` in `config/schedule.json`.

Until then, approved posts land in `queue/posted/` marked "ready to post", with the slides in each project's `output/` folder.

## Teaching the approver your taste

When you overrule the approver, add a dated line to `state/owner-taste.md` saying what you decided and why. It reads that file before every decision.
