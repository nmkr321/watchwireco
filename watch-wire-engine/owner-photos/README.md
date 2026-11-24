# Owner photos

Drop a celebrity watch photo here and the engine makes a post from it within the hour.

1. **Name the file after the person:** `tom-brady.jpg` (or `tom-brady--rolex-daytona.jpg`).
2. **Optional:** add a text file with the same name (`tom-brady.txt`):
   ```
   credit: Photo: @tombrady
   watch: Rolex Day-Date 228238
   from: https://link-to-where-you-got-it
   ```
   Leave `credit:` out to post with no credit line.
3. **Upload it:** on github.com/nmkr321/watchwireco, open `watch-wire-engine/owner-photos`, then
   **Add file → Upload files**, drag the photo in, and press **Commit changes**. Or just send it to Claude.

The next hourly run builds the post (design, caption, watch spotlight, vote) and schedules it in the next
free slot at least 3 hours ahead. Used photos move to `used/`.

You choose these photos, and you're responsible for having the right to post them.
