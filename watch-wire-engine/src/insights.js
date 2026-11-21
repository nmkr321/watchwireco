// Learning loop (no AI): read how each published post did and summarise it for the planner.
// Snapshots at about 1 day and 7 days after posting are stored on the post's queue file (insights.d1 / insights.d7),
// and state/performance.md gets a short table by format and by time slot.
// Likes/comments work with the current token. Reach, saves, shares and views need the
// instagram_manage_insights permission on the token; until then those columns stay empty.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTED = path.join(ROOT, "queue/posted");
const OUT = path.join(ROOT, "state/performance.md");
const base = () => `https://${process.env.GRAPH_HOST || "graph.facebook.com"}/${process.env.GRAPH_VERSION || "v21.0"}`;
const get = async (p) => { const r = await fetch(`${base()}/${p}${p.includes("?") ? "&" : "?"}access_token=${process.env.IG_ACCESS_TOKEN}`); return r.json(); };

async function snapshot(mediaId) {
  const snap = { at: new Date().toISOString() };
  const basic = await get(`${mediaId}?fields=like_count,comments_count`);
  if (basic.error) return null;
  snap.likes = basic.like_count ?? null; snap.comments = basic.comments_count ?? null;
  const ins = await get(`${mediaId}/insights?metric=reach,saved,shares,views,total_interactions`);
  if (ins.error) snap.insights_error = ins.error.message.slice(0, 80);
  else for (const m of ins.data || []) snap[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
  return snap;
}

export async function collectInsights(log = console.log) {
  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID) { log("insights: no Instagram token, skipped"); return; }
  const now = Date.now(), files = fs.readdirSync(POSTED).filter((f) => f.endsWith(".json"));
  let n = 0;
  for (const f of files) {
    const file = path.join(POSTED, f), p = JSON.parse(fs.readFileSync(file, "utf8"));
    const id = p.publish?.media_id, age = now - Date.parse(p.posted_at);
    if (!id || !p.publish?.live) continue;
    p.insights ||= {};
    const want = age > 7 * 864e5 && !p.insights.d7 ? "d7" : age > 864e5 && !p.insights.d1 ? "d1" : null;
    if (!want) continue;
    try { const s = await snapshot(id); if (s) { p.insights[want] = s; fs.writeFileSync(file, JSON.stringify(p, null, 2)); n++; } } catch {}
  }
  try { const a = await get(`${process.env.IG_USER_ID}?fields=followers_count,media_count`);
    if (a.followers_count != null) fs.appendFileSync(path.join(ROOT, "logs/followers.tsv"), `${new Date().toISOString()}\t${a.followers_count}\t${a.media_count}\n`); } catch {}
  writeReport();
  log(`insights: ${n} new snapshot(s); report in state/performance.md`);
}

// score: saves and shares count most (Instagram ranks on sends and saves per reach), then comments, then likes
const score = (s) => (s.shares || 0) * 4 + (s.saved || 0) * 3 + (s.comments || 0) * 2 + (s.likes || 0);

export function writeReport() {
  const rows = fs.readdirSync(POSTED).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(POSTED, f), "utf8")))
    .filter((p) => p.insights && (p.insights.d7 || p.insights.d1)).map((p) => ({ p, s: p.insights.d7 || p.insights.d1 }));
  const nyHour = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: true });
  const group = (key) => Object.entries(rows.reduce((m, r) => { const k = key(r); (m[k] ||= []).push(r); return m; }, {}))
    .map(([k, xs]) => [k, xs.length, xs.reduce((a, r) => a + score(r.s), 0) / xs.length]).sort((a, b) => b[2] - a[2]);
  const hasReach = rows.some((r) => r.s.reach != null);
  const md = ["# How posts are doing", `Updated ${new Date().toISOString().slice(0, 10)} from ${rows.length} posts. Score = 4×shares + 3×saves + 2×comments + likes (per post, day-1 or day-7 numbers).`,
    hasReach ? "" : "Reach, saves and shares are not available yet: the Instagram token needs the instagram_manage_insights permission. Likes and comments only for now.", "",
    "## By format", ...group((r) => r.p.format || "?").map(([k, n, sc]) => `- ${k}: score ${sc.toFixed(1)} (${n} posts)`),
    "", "## By posting time (New York)", ...group((r) => nyHour(r.p.posted_at)).map(([k, n, sc]) => `- ${k}: score ${sc.toFixed(1)} (${n} posts)`),
    "", "## Best posts", ...rows.sort((a, b) => score(b.s) - score(a.s)).slice(0, 5).map((r) => `- ${r.p.title} [${r.p.format}]: ${r.s.likes ?? 0} likes, ${r.s.comments ?? 0} comments${r.s.saved != null ? `, ${r.s.saved} saves, ${r.s.shares} shares, ${r.s.reach} reach` : ""}`)];
  fs.writeFileSync(OUT, md.join("\n") + "\n");
}

// one short line the planner gets, so it leans towards what works (empty until there is data)
export function plannerHint() {
  try {
    const txt = fs.readFileSync(OUT, "utf8"); const fm = txt.split("## By format")[1]?.split("##")[0].trim().split("\n").filter(Boolean) || [];
    const n = Number((txt.match(/from (\d+) posts/) || [])[1] || 0);
    if (n < 8 || fm.length < 2) return "";
    return `\nWhat has worked best so far (from our own post results, ${n} posts): ${fm.slice(0, 3).map((l) => l.slice(2)).join("; ")}. Weakest: ${fm.slice(-1)[0].slice(2)}. Lean towards the strong formats' angles within the given slots.`;
  } catch { return ""; }
}
