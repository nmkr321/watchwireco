# The Watch Wire (@watchwireco)

An automated luxury-watch news Instagram account. The owner is not a developer,
so explain things in plain steps.

- `watch-wire-engine/`: the posting engine. Start with its `README.md`.
  `node src/run.js status` shows the queue. Strategy is in `PLAYBOOK.md`, and the
  short format brief is in `FORMATS.md`.
- `.claude/agents/watch-wire-editor.md` and `watch-wire-approver.md` are the two AI roles.
  The editor, planner and triage run on Haiku 5.5 (`WW_MODEL`); the approver runs on Sonnet 5.5 (`WW_APPROVER_MODEL`), chosen by the owner 2026-11-20.
- `Content Creation/`: the carousel agents and their CLI (TheVibeFounder; keep the credits).
- `The-Watch-Wire-Brand-Guide.md` is the brand source. `watch-wire-kit/` holds the brand kit.
- Secrets live only in `watch-wire-engine/.env` (Instagram token, IDs, upload command).
  Never print, paste or commit them.
- Nothing posts unless `auto_publish` is true in `config/schedule.json` or the owner
  says so. Ask before any live post, DM or public action.
- When the owner overrules the approver, add a dated line to `watch-wire-engine/state/owner-taste.md`.

## The cloud is the source of truth
Everything runs on GitHub Actions (repo `nmkr321/watchwireco`): an hourly news scan, a
publisher every 15 minutes, and the nightly content maker. The bot commits after every run, so:
1. Always `git pull --rebase` before looking at or changing anything.
2. After a change: commit and `git push` right away, or the cloud won't see it.
3. Never make posts on this computer (`run.js make`); start cloud runs instead:
   `gh workflow run engine.yml -R nmkr321/watchwireco -f command=make-ideas` (or `tick`, `plan`, `publish-due`).

## Common owner requests
- **See what's queued:** `node watch-wire-engine/src/run.js status`. Approved posts are in
  `watch-wire-engine/queue/approved/` (`scheduled_for` is UTC). Their slides are in
  `watch-wire-engine/queue/drafts/<id>/post/output/`; show them as images.
- **Cancel a post:** move its JSON from `queue/approved/` to `queue/hold/`, then commit and push.
- **Change a post's time:** edit `scheduled_for` (UTC, New York + 5h in winter), then commit and push.
- **Change a post's text or slides:** edit `Content Creation/projects/<id>/slides.json`, re-render with
  `watch-wire-engine/templates/render.mjs`, copy the PNGs into `queue/drafts/<id>/post/output/`,
  update `post/caption.json`, then commit and push. Or move it back to `queue/ideas/` with the change
  written in its `why` field and start a `make-ideas` cloud run.
- **Ask for a new post:** add an idea JSON to `queue/ideas/` (see existing ones for the shape, with
  `post_at` in UTC), commit, push, and start `make-ideas`.
- **Add an image permission:** add an entry to `watch-wire-engine/state/permissions.json` (who, what it covers, exact credit line, date, where the proof email is). The engine only uses images credited to a source listed there.
- **Owner design feedback (praise or critique):** add a dated line to `watch-wire-engine/state/design-notes.md`; all future designs build on it.
- **What the approver keeps catching:** `watch-wire-engine/state/lessons.md`. The owner's taste is in `state/owner-taste.md`.
