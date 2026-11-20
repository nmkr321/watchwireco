#!/usr/bin/env bash
# Save content only (never engine code) back to the repo: queue, photo library, state, logs.
# Used at the end of every cloud run and after each post a long run finishes.
cd "$(git rev-parse --show-toplevel)" || exit 1
git config user.name "watch-wire-bot"
git config user.email "watch-wire-bot@users.noreply.github.com"
git add -A watch-wire-engine/queue watch-wire-engine/library watch-wire-engine/state watch-wire-engine/logs
git diff --cached --quiet && exit 0
git commit -q -m "engine: ${CMD:-run} ${1:-} $(date -u +%FT%RZ)"
# another lane may have saved meanwhile: merge (this run's files win on a clash) and retry
for i in 1 2 3 4 5; do
  git pull -q --rebase -X theirs origin main && git push -q origin HEAD:main && exit 0
  git rebase --abort 2>/dev/null; sleep $((i * 7))
done
echo "could not save after 5 tries"; exit 1
