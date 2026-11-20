#!/usr/bin/env node
// The Watch Wire news watcher. No AI, no dependencies.
// Checks Google News for each query, keeps only stories from trusted domains,
// groups the same story across outlets, scores it, and writes new candidates
// to queue/candidates/. Run every few minutes.
//
//   node src/watcher.js            check and write candidates
//   node src/watcher.js --dry      check and print, write nothing

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config/sources.json"), "utf8"));
if (process.env.WW_LOOKBACK) cfg.lookback = process.env.WW_LOOKBACK;
const SEEN_FILE = path.join(ROOT, "state/seen.json");
const DRY = process.argv.includes("--dry");
const THRESHOLD = Number(process.env.WW_THRESHOLD || 6);

const tierOf = {};
for (const [tier, domains] of Object.entries(cfg.trusted_domains)) for (const d of domains) tierOf[d] = tier;
const TIER_POINTS = { primary: 5, watch_press: 3, major_news: 3 };

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function trustedTier(domain) {
  if (tierOf[domain]) return tierOf[domain];
  const parent = Object.keys(tierOf).find((d) => domain.endsWith("." + d));
  return parent ? tierOf[parent] : null;
}
function decode(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}
function normTitle(t) {
  return t.toLowerCase().replace(/ - [^-]+$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function keyOf(t) {
  // story key: the 6 longest meaningful words, sorted; groups near-identical headlines
  const stop = new Set(["the", "and", "for", "with", "this", "that", "from", "its", "new", "watch", "watches"]);
  return normTitle(t).split(" ").filter((w) => w.length > 3 && !stop.has(w))
    .sort((a, b) => b.length - a.length).slice(0, 6).sort().join("-");
}

async function fetchQuery(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${cfg.lookback}`)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "user-agent": "watch-wire-watcher/1.0" } });
  if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => {
    const srcUrl = (b.match(/<source url="([^"]+)"/) || [])[1] || "";
    return {
      title: tag(b, "title").replace(/ - [^-]+$/, ""),
      link: tag(b, "link"),
      published: tag(b, "pubDate"),
      source: tag(b, "source"),
      domain: domainOf(srcUrl),
      query: q
    };
  });
}

// Publisher RSS feeds give real article links. Google News links are encoded redirects
// that agents cannot open, so each candidate link is swapped for the publisher's link when found.
async function fetchFeed(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (watch-wire-watcher)" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => ({ title: tag(b, "title"), link: tag(b, "link"),
    summary: (tag(b, "content:encoded") || tag(b, "description")).replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 700) }))
    .filter((i) => /^https:\/\//.test(i.link));
}

function score(story) {
  const text = story.title.toLowerCase();
  const tiers = story.items.map((i) => TIER_POINTS[i.tier] || 0);
  let s = Math.max(...tiers);
  s += Math.min(story.domains.length - 1, 3);               // corroboration across outlets
  if (cfg.big_names.some((n) => text.includes(n))) s += 2;
  if (cfg.breaking_keywords.some((k) => text.includes(k))) s += 1;
  const ageMin = (Date.now() - Date.parse(story.first_seen_published)) / 60000;
  if (ageMin <= 60) s += 1;
  return s;
}

async function main() {
  const seen = fs.existsSync(SEEN_FILE) ? JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")) : {};
  const all = [];
  const errors = [];
  for (const q of cfg.google_news_queries) {
    try { all.push(...await fetchQuery(q)); } catch (e) { errors.push(e.message); }
    await new Promise((r) => setTimeout(r, 400)); // be polite
  }
  const WATCH_WORDS = [...cfg.big_names, "watch", "horolog", "timepiece", "chronograph", "tourbillon", "wristwatch"];
  const isWatchStory = (i) => {
    const t = i.title.toLowerCase();
    if (i.tier === "watch_press") return true;
    if (/^(watch|watch live|watch now)\b[: ]/.test(t) || /\| (closing bell|video)/.test(t)) return false; // "Watch: video" headlines
    return WATCH_WORDS.filter((w) => w !== "watch").some((w) => t.includes(w)) || /\bwatch(es|maker|making)?\b/.test(t.replace(/^watch\b/, ""));
  };
  const trusted = all.map((i) => ({ ...i, tier: trustedTier(i.domain) })).filter((i) => i.tier && isWatchStory(i));

  const stories = new Map();
  const words = (t) => new Set(normTitle(t).split(" ").filter((w) => w.length > 3));
  const similar = (a, b) => { const A = words(a), B = words(b); const inter = [...A].filter((w) => B.has(w)).length; return inter / Math.min(A.size, B.size) >= 0.5; };
  for (const i of trusted) {
    let k = keyOf(i.title);
    if (!k) continue;
    const match = [...stories.values()].find((st) => similar(st.title, i.title));
    if (match) k = match.key;
    const s = stories.get(k) || { key: k, title: i.title, items: [], domains: [], first_seen_published: i.published };
    if (!s.domains.includes(i.domain)) { s.items.push(i); s.domains.push(i.domain); }
    if (Date.parse(i.published) < Date.parse(s.first_seen_published)) s.first_seen_published = i.published;
    if (i.tier === "primary") s.title = i.title; // prefer the official headline
    stories.set(k, s);
  }

  const direct = [];
  for (const u of cfg.direct_feeds || []) {
    try { direct.push(...await fetchFeed(u)); } catch (e) { errors.push(e.message); }
  }
  const resolve = (i) => {
    if (!/news\.google\.com/.test(i.link)) return i;
    const hit = direct.find((d) => domainOf(d.link).endsWith(i.domain) && similar(d.title, i.title));
    return hit ? { ...i, link: hit.link, feed_summary: hit.summary } : { ...i, link_note: "Google News redirect; search the exact title on the outlet's site" };
  };
  for (const st of stories.values()) st.items = st.items.map(resolve);

  const fresh = [];
  for (const s of stories.values()) {
    s.score = score(s);
    if (seen[s.key]) continue;
    if (s.score >= THRESHOLD) fresh.push(s);
  }
  fresh.sort((a, b) => b.score - a.score);

  const stamp = new Date().toISOString();
  if (DRY) {
    console.log(`checked ${cfg.google_news_queries.length} queries · ${all.length} items · ${trusted.length} from trusted sources · ${stories.size} stories`);
    const top = [...stories.values()].sort((a, b) => b.score - a.score).slice(0, 15);
    for (const s of top) console.log(`${s.score >= THRESHOLD ? "★" : " "} [${s.score}] ${s.title}  (${s.domains.join(", ")}) links ${s.items.filter((i) => !i.link_note).length}/${s.items.length}`);
    if (errors.length) console.log("errors:", errors.join("; "));
    return;
  }
  for (const s of fresh) {
    const id = `${stamp.slice(0, 16).replace(/[-:T]/g, "")}-${s.key.slice(0, 40)}`;
    fs.writeFileSync(path.join(ROOT, "queue/candidates", `${id}.json`), JSON.stringify({
      id, lane: "breaking", status: "candidate", found_at: stamp,
      title: s.title, score: s.score, sources: s.items.map(({ title, link, link_note, feed_summary, source, domain, tier, published }) => ({ title, link, link_note, feed_summary, source, domain, tier, published }))
    }, null, 2));
    seen[s.key] = stamp;
  }
  // mark lower-scoring stories as seen too, so they never re-trigger
  for (const s of stories.values()) seen[s.key] ||= stamp;
  // forget keys older than 7 days
  for (const [k, t] of Object.entries(seen)) if (Date.now() - Date.parse(t) > 7 * 864e5) delete seen[k];
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
  fs.appendFileSync(path.join(ROOT, "logs/watcher.log"),
    `${stamp} items=${all.length} trusted=${trusted.length} stories=${stories.size} new_candidates=${fresh.length}${errors.length ? " errors=" + errors.length : ""}\n`);
  console.log(`${fresh.length} new candidate(s)`);
  for (const s of fresh) console.log(`★ [${s.score}] ${s.title} (${s.domains.join(", ")})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
