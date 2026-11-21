// Trial Reels from finished carousels (Instagram's official "trial reels": shown to non-followers first,
// not on the profile grid). Off unless config/schedule.json has "trial_reels": {"enabled": true}.
//   node src/reel.js <queue/posted/x.json> --dry   → only builds the mp4 (for a look), posts nothing
// Video: each slide ~2.8 s on a 1080x1920 frame (slide centred on a blurred copy of itself).
// Music: Instagram's own music library via Meta's Audio API (audio_configuration with an audio_id), so the Reel
// shows the song like any in-app Reel. Tracks are listed in config/schedule.json trial_reels.music (find ids with
// `node src/reel.js --search "Chopin Nocturne"`). Fallback: a file from assets/music/tracks.json mixed into the video.
// Upload goes straight to Instagram (resumable upload), so no public hosting is needed.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./publish.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(ROOT, "..");
const host = () => process.env.GRAPH_HOST || "graph.facebook.com", ver = () => process.env.GRAPH_VERSION || "v21.0";

const MUSIC = path.join(ROOT, "assets/music");
// the same post always gets the same track; different posts rotate through the list
export function pickLibraryTrack(item) {
  let list = []; try { list = JSON.parse(fs.readFileSync(path.join(ROOT, "config/schedule.json"), "utf8")).trial_reels?.music || []; } catch {}
  if (!list.length) return null;
  const h = [...String(item.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return list[h % list.length];
}

export function pickTrack(item) {
  let list = []; try { list = JSON.parse(fs.readFileSync(path.join(MUSIC, "tracks.json"), "utf8")).filter((t) => fs.existsSync(path.join(MUSIC, t.file))); } catch {}
  if (!list.length) return null;
  const h = [...String(item.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return list[h % list.length];
}

export function buildReel(item, secsPerSlide = 2.8, { silent = false } = {}) {
  const out = path.join(path.resolve(WORKSPACE, item.post_dir || item.project_dir), "output");
  const slides = fs.readdirSync(out).filter((f) => /^slide-\d+\.png$/.test(f)).sort().map((f) => path.join(out, f));
  if (slides.length < 2) throw new Error("no slides for the reel");
  const mp4 = path.join(path.dirname(out), "reel.mp4");
  const inputs = slides.flatMap((s) => ["-loop", "1", "-t", String(secsPerSlide), "-i", s]);
  const per = slides.map((_, i) => `[${i}:v]split[a${i}][b${i}];[a${i}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:3,eq=brightness=-0.25[bg${i}];` +
    `[b${i}]scale=1080:-2[fg${i}];[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[v${i}]`).join(";");
  const filter = `${per};${slides.map((_, i) => `[v${i}]`).join("")}concat=n=${slides.length}:v=1:a=0[v]`;
  const T = secsPerSlide * slides.length, track = silent ? null : pickTrack(item);
  const audioIn = track ? ["-stream_loop", "-1", "-i", path.join(MUSIC, track.file)] : ["-f", "lavfi", "-t", String(T), "-i", "anullsrc=r=44100:cl=stereo"];
  const audioF = track ? `;[${slides.length}:a]atrim=0:${T},asetpts=N/SR/TB,afade=t=in:d=0.8,afade=t=out:st=${(T - 1.8).toFixed(1)}:d=1.8,volume=${track.volume || 0.7}[aud]` : "";
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, ...audioIn,
    "-filter_complex", filter + audioF, "-map", "[v]", "-map", track ? "[aud]" : `${slides.length}:a`, "-t", String(T), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || "").slice(-300)}`);
  return { mp4, track };
}

async function api(p, params) {
  const res = await fetch(`https://${host()}/${ver()}/${p}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN }) });
  const j = await res.json(); if (!res.ok || j.error) throw new Error(`Graph ${p}: ${j.error?.message || res.status}`); return j;
}

// caption: the carousel's caption with a pointer to the full post
export async function publishTrialReel(item) {
  loadEnv();
  const lib = pickLibraryTrack(item);
  const { mp4, track } = buildReel(item, 2.8, { silent: !!lib });   // library music replaces any mixed-in file
  let cap = JSON.parse(fs.readFileSync(path.join(path.resolve(WORKSPACE, item.post_dir || item.project_dir), "caption.json"), "utf8")).text;
  if (track?.credit) cap = cap.includes("Follow @watchwireco") ? cap.replace(/\n*Follow @watchwireco/, `\n\nMusic: ${track.credit}\n\nFollow @watchwireco`) : `${cap}\n\nMusic: ${track.credit}`;
  // "trial" (default): shown to non-followers first, not on the grid. "normal": a regular Reel on the grid.
  // Instagram refused trial Reels for this account on 2026-11-21 (error 2207081), so the owner can pick "normal".
  let mode = "trial"; try { mode = JSON.parse(fs.readFileSync(path.join(ROOT, "config/schedule.json"), "utf8")).trial_reels?.mode || "trial"; } catch {}
  const c = await api(`${process.env.IG_USER_ID}/media`, { media_type: "REELS", upload_type: "resumable", caption: cap,
    ...(mode === "normal" ? { share_to_feed: "true" } : { trial_params: JSON.stringify({ graduation_strategy: "MANUAL" }) }),
    // the clickable audio label under the Reel (an audio page others can open and reuse); can only be set once
    ...(lib ? { audio_configuration: JSON.stringify({ audio_id: lib.audio_id, audio_volume: 100, video_volume: 1 }) }
      : track ? { audio_name: `${track.title} · ${track.artist || "The Watch Wire"}` } : {}) });
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
  return { media_id: pub.id, trial: mode !== "normal", music: lib ? `${lib.title} (${lib.artist})` : track?.title || null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, flag] = process.argv.slice(2);
  if (file === "--search") {      // find Instagram library music: node src/reel.js --search "Chopin Nocturne"
    loadEnv();
    const j = await fetch(`https://${host()}/v22.0/ig_audio?audio_type=music&search_query=${encodeURIComponent(flag || "")}&user_id=${process.env.IG_USER_ID}&access_token=${process.env.IG_ACCESS_TOKEN}`).then((r) => r.json());
    for (const a of j.audio || []) console.log(`${a.audio_id}  ${a.title} · ${a.display_artist}  ${Math.round(a.duration_in_ms / 1000)}s`);
    process.exit(0);
  }
  const item = JSON.parse(fs.readFileSync(file, "utf8"));
  if (flag === "--dry") { const b = buildReel(item); console.log("built", b.mp4, "music:", b.track?.title || "none"); }
  else console.log("posting needs the engine with trial_reels.enabled; use --dry to just build the video");
}
