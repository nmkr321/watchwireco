#!/usr/bin/env node
// Scout (free, no AI): every 2 days, looks at what is working on other watch accounts and tells the planner.
// Uses Instagram's official Business Discovery read (public posts of other business/creator accounts: type,
// likes, comments, time, caption). Needs the token permissions instagram_basic + pages_read_engagement.
//   node src/scout.js         → writes state/scout.md (+ logs/scout.json), prints a short summary
// Each post is scored against ITS OWN account's median ("lift"), so big accounts don't drown out small ones.
// Music: the API omits media_url for Reels with copyrighted audio, so "no media_url" ≈ licensed/popular music.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./publish.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "state/scout.md"), RAW = path.join(ROOT, "logs/scout.json");
const host = () => process.env.GRAPH_HOST || "graph.facebook.com", ver = () => process.env.GRAPH_VERSION || "v21.0";

// our own formats, guessed from the caption (free; rough but consistent)
const FORMATS = [
  ["CELEBRITY", /\b(spotted|wearing|wore|wears|on the wrist of|red carpet|celebrit|oscars|met gala|grammys|nba|f1|ufc)\b/i],
  ["WOULD YOU RATHER", /would you rather|which (one|would you)|pick one|this or that|\bor\b[^.?!]{0,40}\?/i],
  ["AUCTIONS", /\b(auction|hammer|sold for|lot \d|phillips|christie|sotheby)/i],
  ["NEW RELEASES", /\b(new|introduc|launch|unveil|debut|just dropped|release)/i],
  ["LISTICLE", /\b(top|best) \d+|\b\d+ (watches|picks|ways)|under \$\d/i],
  ["MARKET", /\b(price|market|resale|retail|msrp|value)\b/i],
  ["HISTORY", /\b(history|story|in 19\d\d|since 1\d\d\d|origin|legend)/i],
];
const fmtOf = (c = "") => (FORMATS.find(([, re]) => re.test(c)) || ["OTHER"])[0];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const nyHour = (t) => Number(new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })) % 24;

export function scoutDue(hours = 44) {
  try { const r = JSON.parse(fs.readFileSync(RAW, "utf8")); return !r.posts?.length || Date.now() - Date.parse(r.ran_at) > hours * 3600e3; } catch { return true; }
}

export async function scout(log = console.log) {
  loadEnv();
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config/scout.json"), "utf8"));
  const posts = [], accounts = [], failed = [];
  for (const h of cfg.accounts) {
    const f = `business_discovery.username(${h}){username,followers_count,media.limit(${cfg.posts_per_account || 30}){media_type,media_product_type,like_count,comments_count,timestamp,caption,permalink,media_url}}`;
    let j; try { j = await fetch(`https://${host()}/${ver()}/${process.env.IG_USER_ID}?fields=${encodeURIComponent(f)}&access_token=${process.env.IG_ACCESS_TOKEN}`).then((r) => r.json()); }
    catch (e) { failed.push(`${h} (${e.message})`); continue; }
    if (j.error) { failed.push(`${h} (${j.error.message.slice(0, 80)})`); if (j.error.code === 10) break; continue; }   // code 10 = token lacks permission: same for all
    const b = j.business_discovery, m = (b.media?.data || []).filter((x) => x.like_count != null);
    const eng = (x) => (x.like_count + 2 * (x.comments_count || 0)) / Math.max(1, b.followers_count) * 100;
    const med = median(m.map(eng)) || 1e-9;
    accounts.push({ handle: h, followers: b.followers_count, posts: m.length, median_eng: +med.toFixed(3) });
    for (const x of m) posts.push({ handle: h, type: x.media_product_type === "REELS" ? "REEL" : x.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : "IMAGE",
      format: fmtOf(x.caption), lift: +(eng(x) / med).toFixed(2), likes: x.like_count, comments: x.comments_count || 0, hour: nyHour(x.timestamp),
      question: /\?/.test(x.caption || ""), hashtags: ((x.caption || "").match(/#\w+/g) || []).length,
      licensed_audio: x.media_product_type === "REELS" ? !x.media_url : null, first_line: (x.caption || "").split("\n")[0].slice(0, 110), permalink: x.permalink, timestamp: x.timestamp });
  }
  fs.mkdirSync(path.dirname(RAW), { recursive: true });
  fs.writeFileSync(RAW, JSON.stringify({ ran_at: new Date().toISOString(), accounts, failed, posts }, null, 1));
  if (!posts.length) {
    const why = failed[0] || "no accounts listed";
    fs.writeFileSync(OUT, `# Scout: what works on other watch accounts\nLast run ${new Date().toISOString().slice(0, 16)}Z: no data. ${why}\n` +
      (/permission/i.test(why) ? "Fix: regenerate the Instagram token with pages_read_engagement (and instagram_manage_insights) ticked.\n" : ""));
    log(`scout: no data (${why})`); return null;
  }
  const by = (key) => Object.entries(posts.reduce((a, p) => ((a[p[key]] ||= []).push(p.lift), a), {}))
    .map(([k, v]) => [k, avg(v), v.length]).filter(([, , n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  const fmt = by("format"), type = by("type");
  const hours = Object.entries(posts.reduce((a, p) => { const b = `${String(p.hour - (p.hour % 3)).padStart(2, "0")}:00–${String(p.hour - (p.hour % 3) + 3).padStart(2, "0")}:00`; (a[b] ||= []).push(p.lift); return a; }, {}))
    .map(([k, v]) => [k, avg(v), v.length]).filter(([, , n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  const q = [avg(posts.filter((p) => p.question).map((p) => p.lift)), avg(posts.filter((p) => !p.question).map((p) => p.lift))];
  const reels = posts.filter((p) => p.type === "REEL"), lic = reels.filter((p) => p.licensed_audio), orig = reels.filter((p) => p.licensed_audio === false);
  const top = [...posts].sort((a, b) => b.lift - a.lift).slice(0, 12);
  const pct = (x) => `${x >= 1 ? "+" : ""}${Math.round((x - 1) * 100)}%`;
  const md = [`# Scout: what works on other watch accounts`,
    `Last run ${new Date().toISOString().slice(0, 16)}Z · ${posts.length} posts from ${accounts.length} accounts. "Lift" = a post's likes + 2×comments vs that account's usual post (1.0 = usual).`,
    failed.length ? `Couldn't read: ${failed.join("; ")}` : "",
    `\n## Formats (avg lift, posts)`, ...fmt.map(([k, v, n]) => `- ${k}: ${v.toFixed(2)} (${n})`),
    `\n## Post types`, ...type.map(([k, v, n]) => `- ${k}: ${v.toFixed(2)} (${n})`),
    `\n## Best times (New York)`, ...hours.slice(0, 4).map(([k, v, n]) => `- ${k}: ${v.toFixed(2)} (${n})`),
    `\n## Caption`, `- With a question: ${q[0].toFixed(2)} · without: ${q[1].toFixed(2)}`,
    `\n## Music on Reels`, reels.length ? `- ${lic.length} of ${reels.length} Reels likely use licensed/popular music (Instagram hides their video file). Lift with it: ${avg(lic.map((p) => p.lift)).toFixed(2)} · original/no music: ${avg(orig.map((p) => p.lift)).toFixed(2)}` : "- no Reels seen",
    `\n## Top posts to learn from`, ...top.map((p) => `- ${p.lift.toFixed(1)}× @${p.handle} ${p.type} ${p.format}: "${p.first_line}" ${p.permalink}`),
    `\n## Accounts`, ...accounts.map((a) => `- @${a.handle}: ${a.followers} followers, ${a.posts} posts read`)].filter((l) => l !== "");
  fs.writeFileSync(OUT, md.join("\n") + "\n");
  log(`scout: ${posts.length} posts from ${accounts.length} accounts; best format ${fmt[0]?.[0]} ${fmt[0] ? pct(fmt[0][1]) : ""}`);
  return { fmt, type, hours, q, lic: lic.length, reels: reels.length };
}

// short lines for the planner prompt (free: no extra AI call)
export function scoutHint() {
  try {
    const t = fs.readFileSync(OUT, "utf8"); if (!/## Formats/.test(t)) return "";
    const sec = (h) => (t.split(`## ${h}`)[1] || "").split("##")[0].trim().split("\n").filter((l) => l.startsWith("- ")).slice(0, 3).map((l) => l.slice(2)).join("; ");
    return `\nWhat is working on other watch accounts right now (scout, lift vs their usual post): formats ${sec("Formats")}. Times ${sec("Best times (New York)")}. ${sec("Caption")}. Copy the patterns of the top posts; lean the plan toward the strongest formats.`;
  } catch { return ""; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scout().then((r) => { if (r) console.log(fs.readFileSync(OUT, "utf8")); }).catch((e) => { console.error(e.message); process.exit(1); });
}
