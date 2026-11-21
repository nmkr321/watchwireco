#!/usr/bin/env node
// Removes a plain studio background (white, cream, light grey) from a watch photo, so it sits cleanly on
// our black slides instead of in a light box. Flood-fills from the image edges only, so a white dial
// enclosed by the case is never touched. Uses headless Chrome (no extra libraries).
//   node src/cutout.mjs <in.jpg|png|webp> <out.png>    → prints "cut", "kept" (background not plain) or an error
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");

export function cutout(input, output, tol = 26) {
  const src = path.resolve(input), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cut-"));
  const html = path.join(tmp, "c.html");
  fs.writeFileSync(html, `<html><body><img id="i" src="file://${src}"><pre id="o"></pre><script>
const im = document.getElementById("i");
im.onload = () => { try {
  const w = im.naturalWidth, h = im.naturalHeight, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, w, h), p = d.data;
  // background colour = median of the border pixels; must be light and fairly uniform
  const border = []; for (let x = 0; x < w; x += 3) border.push((x) * 4, ((h - 1) * w + x) * 4); for (let y = 0; y < h; y += 3) border.push((y * w) * 4, (y * w + w - 1) * 4);
  const lum = (i) => (p[i] + p[i + 1] + p[i + 2]) / 3;
  const sorted = border.map((i) => [lum(i), i]).sort((a, b) => a[0] - b[0]); const bi = sorted[sorted.length >> 1][1];
  const [br, bg, bb] = [p[bi], p[bi + 1], p[bi + 2]];
  const near = (i) => Math.abs(p[i] - br) <= ${tol} && Math.abs(p[i + 1] - bg) <= ${tol} && Math.abs(p[i + 2] - bb) <= ${tol} && p[i + 3] > 0;
  const plain = border.filter(near).length / border.length;
  if ((br + bg + bb) / 3 < 150 || plain < 0.6) { document.getElementById("o").textContent = "KEPT"; return; }
  // region growing: a pixel joins the background if it is light and grey-ish (close to the border colour, wide
  // tolerance for gradients/shadows) AND changes smoothly from its neighbour (stops at the watch's edges)
  const loose = (i) => Math.abs(p[i] - br) <= ${tol} * 2.2 && Math.abs(p[i + 1] - bg) <= ${tol} * 2.2 && Math.abs(p[i + 2] - bb) <= ${tol} * 2.2;
  const smooth = (i, j) => Math.abs(p[i] - p[j]) <= 7 && Math.abs(p[i + 1] - p[j + 1]) <= 7 && Math.abs(p[i + 2] - p[j + 2]) <= 7;
  const seen = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) st.push(x, -1, (h - 1) * w + x, -1); for (let y = 0; y < h; y++) st.push(y * w, -1, y * w + w - 1, -1);
  let removed = 0;
  while (st.length) { const from = st.pop(), k = st.pop(); if (seen[k]) continue;
    const ok = from < 0 ? near(k * 4) : (near(k * 4) || (loose(k * 4) && smooth(k * 4, from * 4)));
    if (!ok) continue; seen[k] = 1; p[k * 4 + 3] = 0; removed++;
    const x = k % w, y = (k / w) | 0; if (x > 0) st.push(k - 1, k); if (x < w - 1) st.push(k + 1, k); if (y > 0) st.push(k - w, k); if (y < h - 1) st.push(k + w, k); }
  // safety: if almost nothing or almost everything went, keep the original
  if (removed < w * h * 0.08 || removed > w * h * 0.93) { document.getElementById("o").textContent = "KEPT"; return; }
  // soften the edge: half-transparent for pixels next to removed background that are still close in colour
  for (let k = 0; k < w * h; k++) if (p[k * 4 + 3] && ((k % w > 0 && !p[(k - 1) * 4 + 3]) || (k % w < w - 1 && !p[(k + 1) * 4 + 3]))) {
    const i = k * 4; if (Math.abs(p[i] - br) <= ${tol * 2} && Math.abs(p[i + 1] - bg) <= ${tol * 2} && Math.abs(p[i + 2] - bb) <= ${tol * 2}) p[i + 3] = 110; }
  g.putImageData(d, 0, 0); document.getElementById("o").textContent = "CUT " + c.toDataURL("image/png");
} catch (e) { document.getElementById("o").textContent = "ERR " + e.message; } };
im.onerror = () => { document.getElementById("o").textContent = "ERR load"; };
</script></body></html>`);
  const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--disable-web-security", "--virtual-time-budget=8000", "--dump-dom", "file://" + html], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const m = (r.stdout || "").match(/<pre id="o">([^<]*)<\/pre>/);
  const out = m ? m[1] : "";
  if (out.startsWith("CUT data:image/png;base64,")) { fs.writeFileSync(output, Buffer.from(out.slice(26), "base64")); return "cut"; }
  if (out === "KEPT") return "kept";
  throw new Error(`cutout failed: ${out || (r.stderr || "").slice(-200)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [i, o] = process.argv.slice(2);
  try { console.log(cutout(i, o)); } catch (e) { console.log(e.message); process.exit(1); }
}
