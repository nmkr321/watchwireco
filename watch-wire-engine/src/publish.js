// Instagram publisher for The Watch Wire, using Instagram's official Graph API
// (content publishing for Business/Creator accounts). Carousel flow:
//   1. one media container per slide (image_url + is_carousel_item=true)
//   2. a CAROUSEL container with the children and the caption
//   3. media_publish
// Instagram fetches each image from a public URL, so slides must be uploaded to
// public hosting first (see uploadSlides below).
//
// Settings come from watch-wire-engine/.env (never commit it):
//   IG_USER_ID=...            Instagram professional account id
//   IG_ACCESS_TOKEN=...       long-lived token with instagram_content_publish
//   GRAPH_VERSION=v21.0       Graph API version
//   GRAPH_HOST=graph.instagram.com  (Instagram Login) or graph.facebook.com (Facebook Login)
//   PUBLIC_UPLOAD_CMD=...     command that uploads a file and prints its public URL
//                             (e.g. an rclone / aws s3 cp / gh release upload wrapper)

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(ROOT, "..");
// post_dir (saved in the queue at approval, so a later cloud run still has the slides) wins over project_dir
const projectDir = (item) => path.resolve(WORKSPACE, item.post_dir || item.project_dir);

export function loadEnv() {
  const f = path.join(ROOT, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function slideFiles(item) {
  const out = path.join(projectDir(item), "output");
  return fs.readdirSync(out).filter((f) => /^slide-\d+\.png$/.test(f)).sort().map((f) => path.join(out, f));
}
function captionText(item) {
  const c = JSON.parse(fs.readFileSync(path.join(projectDir(item), "caption.json"), "utf8"));
  return c.text;
}

// one plain description per slide, from the slide text (slides.json saved next to the post), no AI
export function altTexts(item, n) {
  try {
    const spec = JSON.parse(fs.readFileSync(path.join(projectDir(item), "slides.json"), "utf8"));
    const clean = (x) => String(x || "").replace(/\[\[|\]\]/g, "").replace(/\s+/g, " ").trim();
    return spec.slides.slice(0, n).map((s, i) => {
      if (s.t === "cta") return "The Watch Wire: follow @watchwireco for daily watch news.";
      const opt = (o) => o ? `${clean(o.brand)} ${clean(o.model)} ${clean(o.price)}`.trim() : "";
      const bits = [clean(s.tag), clean(s.label), clean(s.line1), clean(s.line2), clean(s.headline), clean(s.kicker), clean(s.number),
        s.left ? `${opt(s.left)} or ${opt(s.right)}` : "", (s.options || []).map(opt).join("; "), clean(s.body || s.text)].filter(Boolean);
      return `Slide ${i + 1}: ${bits.join(". ")}`.slice(0, 990);
    });
  } catch { return []; }
}

function uploadSlides(files) {
  const cmd = process.env.PUBLIC_UPLOAD_CMD;
  if (!cmd) throw new Error("PUBLIC_UPLOAD_CMD is not set, so slides cannot be given public URLs");
  return files.map((f) => {
    const r = spawnSync("sh", ["-c", `${cmd} "$1"`, "upload", f], { encoding: "utf8" });
    const url = (r.stdout || "").trim().split("\n").pop();
    if (r.status !== 0 || !/^https:\/\//.test(url)) throw new Error(`upload failed for ${path.basename(f)}: ${r.stderr}`);
    return url;
  });
}

async function graph(pathPart, params) {
  const v = process.env.GRAPH_VERSION || "v21.0";
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN });
  const res = await fetch(`https://${process.env.GRAPH_HOST || "graph.instagram.com"}/${v}/${pathPart}`, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Graph API ${pathPart}: ${json.error?.message || res.status}`);
  return json;
}
async function waitReady(id) {
  const v = process.env.GRAPH_VERSION || "v21.0";
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://${process.env.GRAPH_HOST || "graph.instagram.com"}/${v}/${id}?fields=status_code&access_token=${process.env.IG_ACCESS_TOKEN}`).then((x) => x.json());
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR") throw new Error(`container ${id} failed`);
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error(`container ${id} not ready in time`);
}

export async function publishPost(item, { live = false } = {}) {
  loadEnv();
  const files = slideFiles(item);
  const caption = captionText(item);
  if (files.length < 2 || files.length > 10) throw new Error(`carousel needs 2–10 slides, found ${files.length}`);
  const plan = { slides: files.map((f) => path.basename(f)), caption_chars: caption.length };
  if (!live) return { live: false, plan, note: "auto_publish is off: slides and caption are ready to post by hand" };
  if (!process.env.IG_USER_ID || !process.env.IG_ACCESS_TOKEN) throw new Error("IG_USER_ID / IG_ACCESS_TOKEN missing in .env");

  const urls = uploadSlides(files);
  const children = [];
  const alts = altTexts(item, urls.length);
  for (const [i, image_url] of urls.entries()) {
    // alt text helps accessibility and search; if Instagram ever refuses it, post the slide without it
    let c;
    try { c = await graph(`${process.env.IG_USER_ID}/media`, { image_url, is_carousel_item: "true", ...(alts[i] ? { alt_text: alts[i] } : {}) }); }
    catch (e) { if (!alts[i]) throw e; c = await graph(`${process.env.IG_USER_ID}/media`, { image_url, is_carousel_item: "true" }); }
    children.push(c.id);
  }
  for (const id of children) await waitReady(id);
  const carousel = await graph(`${process.env.IG_USER_ID}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
  await waitReady(carousel.id);
  // Instagram sometimes answers media_publish with "unexpected error" although the post went live.
  // So after an error: look for it on the account first, retry only if it isn't there (never post twice).
  for (let attempt = 1; ; attempt++) {
    try {
      const pub = await graph(`${process.env.IG_USER_ID}/media_publish`, { creation_id: carousel.id });
      return { live: true, media_id: pub.id, permalink: await permalink(pub.id), plan };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 20000));
      const found = await findRecent(caption);
      if (found) return { live: true, media_id: found.id, permalink: found.permalink || null, plan, note: `went live despite: ${e.message.slice(0, 120)}` };
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
}

// a post on the account from the last 15 minutes with this caption (used after a publish error)
async function findRecent(caption) {
  try {
    const v = process.env.GRAPH_VERSION || "v21.0";
    const r = await fetch(`https://${process.env.GRAPH_HOST || "graph.instagram.com"}/${v}/${process.env.IG_USER_ID}/media?fields=id,caption,timestamp,permalink&limit=5&access_token=${process.env.IG_ACCESS_TOKEN}`).then((x) => x.json());
    const head = caption.slice(0, 80);
    return (r.data || []).find((m) => (m.caption || "").slice(0, 80) === head && Date.now() - Date.parse(m.timestamp) < 15 * 60e3) || null;
  } catch { return null; }
}

// the post's public link (instagram.com/p/...), for logs and the owner
export async function permalink(mediaId) {
  loadEnv();
  try {
    const v = process.env.GRAPH_VERSION || "v21.0";
    const r = await fetch(`https://${process.env.GRAPH_HOST || "graph.instagram.com"}/${v}/${mediaId}?fields=permalink&access_token=${process.env.IG_ACCESS_TOKEN}`).then((x) => x.json());
    return r.permalink || null;
  } catch { return null; }
}
