// Trial Reels from finished carousels (Instagram's official "trial reels": shown to non-followers first,
// not on the profile grid). Off unless config/schedule.json has "trial_reels": {"enabled": true}.
//   node src/reel.js <queue/posted/x.json> --dry   → only builds the mp4 (for a look), posts nothing
// Video: each slide ~2.8 s on a 1080x1920 frame (slide centred on a blurred copy of itself), silent track.
// Upload goes straight to Instagram (resumable upload), so no public hosting is needed.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./publish.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(ROOT, "..");
const host = () => process.env.GRAPH_HOST || "graph.facebook.com", ver = () => process.env.GRAPH_VERSION || "v21.0";

export function buildReel(item, secsPerSlide = 2.8) {
  const out = path.join(path.resolve(WORKSPACE, item.post_dir || item.project_dir), "output");
  const slides = fs.readdirSync(out).filter((f) => /^slide-\d+\.png$/.test(f)).sort().map((f) => path.join(out, f));
  if (slides.length < 2) throw new Error("no slides for the reel");
  const mp4 = path.join(path.dirname(out), "reel.mp4");
  const inputs = slides.flatMap((s) => ["-loop", "1", "-t", String(secsPerSlide), "-i", s]);
  const per = slides.map((_, i) => `[${i}:v]split[a${i}][b${i}];[a${i}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:3,eq=brightness=-0.25[bg${i}];` +
    `[b${i}]scale=1080:-2[fg${i}];[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[v${i}]`).join(";");
  const filter = `${per};${slides.map((_, i) => `[v${i}]`).join("")}concat=n=${slides.length}:v=1:a=0[v]`;
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-f", "lavfi", "-t", String(secsPerSlide * slides.length), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", filter, "-map", "[v]", "-map", `${slides.length}:a`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || "").slice(-300)}`);
  return mp4;
}

async function api(p, params) {
  const res = await fetch(`https://${host()}/${ver()}/${p}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN }) });
  const j = await res.json(); if (!res.ok || j.error) throw new Error(`Graph ${p}: ${j.error?.message || res.status}`); return j;
}

// caption: the carousel's caption with a pointer to the full post
export async function publishTrialReel(item) {
  loadEnv();
  const mp4 = buildReel(item);
  const cap = JSON.parse(fs.readFileSync(path.join(path.resolve(WORKSPACE, item.post_dir || item.project_dir), "caption.json"), "utf8")).text;
  const c = await api(`${process.env.IG_USER_ID}/media`, { media_type: "REELS", upload_type: "resumable", caption: cap,
    trial_params: JSON.stringify({ graduation_strategy: "MANUAL" }) });
  const bytes = fs.readFileSync(mp4);
  const up = await fetch(`https://rupload.facebook.com/ig-api-upload/${ver()}/${c.id}`, { method: "POST",
    headers: { Authorization: `OAuth ${process.env.IG_ACCESS_TOKEN}`, offset: "0", file_size: String(bytes.length) }, body: bytes }).then((x) => x.json());
  if (!up.success) throw new Error(`reel upload failed: ${JSON.stringify(up).slice(0, 160)}`);
  for (let i = 0; i < 40; i++) {
    const s = await fetch(`https://${host()}/${ver()}/${c.id}?fields=status_code&access_token=${process.env.IG_ACCESS_TOKEN}`).then((x) => x.json());
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR") throw new Error("reel processing failed");
    await new Promise((r) => setTimeout(r, 5000));
  }
  const pub = await api(`${process.env.IG_USER_ID}/media_publish`, { creation_id: c.id });
  return { media_id: pub.id, trial: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, flag] = process.argv.slice(2);
  const item = JSON.parse(fs.readFileSync(file, "utf8"));
  if (flag === "--dry") console.log("built", buildReel(item));
  else console.log("posting needs the engine with trial_reels.enabled; use --dry to just build the video");
}
