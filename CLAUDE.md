# The Watch Wire (@watchwireco)

An automated luxury-watch news Instagram account. The owner is not a developer,
so explain things in plain steps.

- `watch-wire-engine/`: the posting engine. Start with its `README.md`.
  `node src/run.js status` shows the queue. Strategy is in `PLAYBOOK.md`, and the
  short format brief is in `FORMATS.md`.
- `.claude/agents/watch-wire-editor.md` and `watch-wire-approver.md` are the two AI roles.
  All roles run on Haiku 5.5 (`WW_MODEL` in `src/run.js`).
- `Content Creation/`: the carousel agents and their CLI (TheVibeFounder; keep the credits).
- `The-Watch-Wire-Brand-Guide.md` is the brand source. `watch-wire-kit/` holds the brand kit.
- Secrets live only in `watch-wire-engine/.env` (Instagram token, IDs, upload command).
  Never print, paste or commit them.
- Nothing posts unless `auto_publish` is true in `config/schedule.json` or the owner
  says so. Ask before any live post, DM or public action.
- When the owner overrules the approver, add a dated line to `watch-wire-engine/state/owner-taste.md`.
