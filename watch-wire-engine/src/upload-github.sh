#!/bin/sh
# Uploads one file to the public GitHub repo and prints its raw https URL (last line).
# Usage: sh src/upload-github.sh <file>
set -e
REPO="${WW_SLIDES_REPO:-nmkr321/watchwire-slides}"
f="$1"
[ -f "$f" ] || { echo "no such file: $f" >&2; exit 1; }
name="$(date +%Y-%m-%d)/$(date +%H%M%S)-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')-$(basename "$f")"
tmp="$(mktemp)"
printf '{"message":"slide %s","content":"' "$name" > "$tmp"
base64 < "$f" | tr -d '\n' >> "$tmp"
printf '"}' >> "$tmp"
gh api -X PUT "repos/$REPO/contents/slides/$name" --input "$tmp" --jq .content.path >/dev/null
rm -f "$tmp"
echo "https://raw.githubusercontent.com/$REPO/main/slides/$name"
