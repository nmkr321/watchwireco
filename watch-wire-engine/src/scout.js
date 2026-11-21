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

// Hot topics: subjects that several accounts posted about in the last 7 days (like "james bond" in Nov 2026:
// 4 accounts in 5 days). Free: word pairs/words seen across 3+ accounts, minus everyday watch words.
const STOP = new Set("the a an and or of to in on for with at by from is are was this that it its our your you we new watch watches time just more first one two will has have be not but all out up how what who which when about into than as so if can get got best year years day week today here there their his her they them very most every big small black white blue green gold steel limited edition collection".split(" "));
// brands are always being posted about, so on their own they aren't news
const BRANDS = new Set("rolex omega tudor seiko oris cartier patek philippe audemars piguet vacheron constantin jaeger lecoultre iwc breitling tag heuer hublot zenith panerai longines tissot hamilton casio grand nomos chopard bulgari blancpain breguet moser richard mille sinn citizen timex swatch baltic doxa ulysse nardin girard perregaux glashutte lange sohne parmigiani piaget bvlgari".split(" "));
export function hotTopics(posts, days = 7) {
  const recent = posts.filter((p) => Date.now() - Date.parse(p.timestamp) < days * 864e5);
  const df = new Map(), acc = new Map(), lift = new Map(), ex = new Map();
  for (const p of posts) {
    const raw = (p.text || p.first_line || "").replace(/[#@]\w+/g, " ");
    const caps = new Set((raw.match(/\b[A-Z][a-zA-Z0-9']+/g) || []).map((x) => x.toLowerCase()));   // proper names only
    const w = raw.toLowerCase().match(/[a-z0-9']+/g) || [];
    const ok = (t) => t.length > 1 && !STOP.has(t) && caps.has(t);
    const terms = new Set([...w.filter((t) => t.length > 2 && ok(t) && !BRANDS.has(t)),
      ...w.slice(1).map((t, i) => `${w[i]} ${t}`).filter((b) => b.split(" ").every(ok) && !b.split(" ").every((t) => BRANDS.has(t)))]);
    for (const t of terms) { df.set(t, (df.get(t) || 0) + 1);
      if (!recent.includes(p)) continue;
      (acc.get(t) || acc.set(t, new Set()).get(t)).add(p.handle); (lift.get(t) || lift.set(t, []).get(t)).push(p.lift); if (!ex.has(t) || p.lift > ex.get(t).lift) ex.set(t, p); }
  }
  let out = [...acc].filter(([t, a]) => a.size >= 3 && df.get(t) / posts.length < 0.12)
    .map(([t, a]) => ({ topic: t, accounts: a.size, lift: +avg(lift.get(t)).toFixed(2), example: ex.get(t) }))
    .sort((x, y) => (y.accounts + (y.topic.includes(" ") ? 1 : 0)) - (x.accounts + (x.topic.includes(" ") ? 1 : 0)) || y.lift - x.lift);
  // prefer "james bond" over "bond" when they cover the same posts
  out = out.filter((o) => !out.some((b) => b !== o && b.topic.includes(" ") && b.topic.split(" ").includes(o.topic) && b.accounts >= o.accounts - 1));
  return out.slice(0, 6);
}

export function scoutDue(hours = 20) {
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
      question: /\?/.test(x.caption || ""), words: (x.caption || "").split(/\s+/).filter(Boolean).length, hashtags: ((x.caption || "").match(/#\w+/g) || []).length,
      licensed_audio: x.media_product_type === "REELS" ? !x.media_url : null, first_line: (x.caption || "").split("\n")[0].slice(0, 110), text: (x.caption || "").slice(0, 300), permalink: x.permalink, timestamp: x.timestamp });
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
  const top = [...posts].sort((a, b) => b.lift - a.lift).slice(0, 12), hot = hotTopics(posts);
  const pct = (x) => `${x >= 1 ? "+" : ""}${Math.round((x - 1) * 100)}%`;
  const md = [`# Scout: what works on other watch accounts`,
    `Last run ${new Date().toISOString().slice(0, 16)}Z · ${posts.length} posts from ${accounts.length} accounts. "Lift" = a post's likes + 2×comments vs that account's usual post (1.0 = usual).`,
    failed.length ? `Couldn't read: ${failed.join("; ")}` : "",
    `\n## Hot topics this week (3+ accounts posting about the same thing: cover these fast)`,
    ...(hot.length ? hot.map((h) => `- ${h.topic}: ${h.accounts} accounts, lift ${h.lift} · best: @${h.example.handle} "${h.example.first_line.slice(0, 90)}" ${h.example.permalink}`) : ["- none right now"]),
    `\n## Formats (avg lift, posts)`, ...fmt.map(([k, v, n]) => `- ${k}: ${v.toFixed(2)} (${n})`),
    `\n## Post types`, ...type.map(([k, v, n]) => `- ${k}: ${v.toFixed(2)} (${n})`),
    `\n## Best times (New York)`, ...hours.slice(0, 4).map(([k, v, n]) => `- ${k}: ${v.toFixed(2)} (${n})`),
    `\n## Caption`, `- With a question: ${q[0].toFixed(2)} · without: ${q[1].toFixed(2)}`,
    `\n## Music on Reels`, reels.length ? `- ${lic.length} of ${reels.length} Reels likely use licensed/popular music (Instagram hides their video file). Lift with it: ${avg(lic.map((p) => p.lift)).toFixed(2)} · original/no music: ${avg(orig.map((p) => p.lift)).toFixed(2)}` : "- no Reels seen",
    `\n## Top posts to learn from`, ...top.map((p) => `- ${p.lift.toFixed(1)}× @${p.handle} ${p.type} ${p.format}: "${p.first_line}" ${p.permalink}`),
    `\n## Accounts`, ...accounts.map((a) => `- @${a.handle}: ${a.followers} followers, ${a.posts} posts read`)].filter((l) => l !== "");
  fs.writeFileSync(OUT, md.join("\n") + "\n");
  log(`scout: ${posts.length} posts from ${accounts.length} accounts; best format ${fmt[0]?.[0]} ${fmt[0] ? pct(fmt[0][1]) : ""}`);
  return { fmt, type, hours, q, hot, lic: lic.length, reels: reels.length };
}

// for the editor, about THIS format only (2-3 short lines, free): how the winning posts of this format look
export function scoutEditorHint(format = "") {
  try {
    const r = JSON.parse(fs.readFileSync(RAW, "utf8")); if (Date.now() - Date.parse(r.ran_at) > 7 * 864e5) return "";
    const f = (r.posts || []).filter((p) => p.format === format.toUpperCase());
    const win = f.filter((p) => p.lift >= 1.3).sort((a, b) => b.lift - a.lift), rest = f.filter((p) => p.lift < 1.3);
    if (win.length < 2) return "";
    const pc = (a, k) => Math.round(100 * a.filter((p) => p[k]).length / a.length);
    const w = (a) => Math.round(avg(a.map((p) => p.words || 0)));
    return `\nWhat wins for ${format} on other watch accounts now (scout): captions ~${w(win)} words${rest.length ? ` (others ~${w(rest)})` : ""}, ${pc(win, "question")}% ask a question; ` +
      `mostly ${win.filter((p) => p.type === "CAROUSEL").length >= win.length / 2 ? "carousels" : "Reels"}. Best openers: ${[...new Map(win.map((p) => [p.first_line, p])).values()].slice(0, 2).map((p) => `"${p.first_line.slice(0, 80)}"`).join(" / ")}. Borrow the angle, never the words.`;
  } catch { return ""; }
}

// short lines for the planner prompt (free: no extra AI call)
export function scoutHint() {
  try {
    const t = fs.readFileSync(OUT, "utf8"); if (!/## Formats/.test(t)) return "";
    const sec = (h) => (t.split(`## ${h}`)[1] || "").split("##")[0].trim().split("\n").filter((l) => l.startsWith("- ")).slice(0, 3).map((l) => l.slice(2)).join("; ");
    const hot = sec("Hot topics this week (3+ accounts posting about the same thing: cover these fast)");
    return (hot && !/none right now/.test(hot) ? `\nHOT TOPICS other watch accounts are all posting about this week (scout): ${hot.replace(/ · best:.*?(;|$)/g, "$1")}. Plan at least one post on the top hot topic today unless we already posted on it in the last 3 days; use our own angle (the watch, the price, a vote).` : "") +
      `\nWhat is working on other watch accounts right now (scout, lift vs their usual post): formats ${sec("Formats")}. Times ${sec("Best times (New York)")}. ${sec("Caption")}. Copy the patterns of the top posts; lean the plan toward the strongest formats.`;
  } catch { return ""; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scout().then((r) => { if (r) console.log(fs.readFileSync(OUT, "utf8")); }).catch((e) => { console.error(e.message); process.exit(1); });
}
