#!/bin/sh
# Makes a Claude plan token and saves it straight into the GitHub repo's secrets.
# Run it yourself in the Terminal app:  sh ~/watchwireco/watch-wire-engine/src/set-claude-secret.sh
# The token is never printed or copied; the temporary file is deleted at the end.
set -e
REPO="${1:-nmkr321/watchwireco}"
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

echo "Step 1: a browser page will open. Sign in and approve, then come back here."
script -q "$LOG" claude setup-token

TOKEN="$(python3 - "$LOG" <<'PY'
import re, sys
raw = open(sys.argv[1], "rb").read().decode("utf8", "ignore")
raw = re.sub(r"\x1b\[[0-9;?]*[ -/]*[@-~]", "", raw)      # colours and cursor codes
raw = re.sub(r"\x1b\][^\x07]*\x07", "", raw)
lines = [l.strip() for l in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
best = ""
for i, l in enumerate(lines):
    if "sk-ant-oat" not in l:
        continue
    tok = re.search(r"sk-ant-oat[A-Za-z0-9_-]*", l).group(0)
    for nxt in lines[i + 1:]:                              # join wrapped lines
        if nxt and re.fullmatch(r"[A-Za-z0-9_-]+", nxt):
            tok += nxt
        else:
            break
    if len(tok) > len(best):
        best = tok
print(best)
PY
)"

LEN=$(printf %s "$TOKEN" | wc -c | tr -d ' ')
if [ "$LEN" -lt 80 ]; then
  echo "Could not read a full token (length $LEN). Nothing was saved. Please try again."
  exit 1
fi
printf %s "$TOKEN" | gh secret set CLAUDE_CODE_OAUTH_TOKEN -R "$REPO"
echo "Done: saved a $LEN-character Claude token to $REPO. You can close this window."
