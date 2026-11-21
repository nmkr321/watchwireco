#!/usr/bin/env node
// Is the engine still learning? (free, no AI)
//   learningAlerts()  → nightly: list of loops that went quiet (added to state/daily.md, phone alert if set up)
//   learningReport()  → weekly: state/learning.md, this week vs last week + what the engine learned
//   node src/learning.js   → prints both
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
const read = (f) => { try { return fs.readFileSync(P(f), "utf8"); } catch { return ""; } };
const json = (f) => { try { return JSON.parse(read(f)); } catch { return null; } };
const H = 3600e3, D = 24 * H;
const ago = (t) => (t ? Date.now() - Date.parse(t) : Infinity);
const items = (d) => { try { return fs.readdirSync(P("queue", d)).filter((f) => f.endsWith(".json")).map((f) => json(path.join("queue", d, f)) || {}); } catch { return []; } };
const lastLine = (txt, re) => txt.split("\n").filter((l) => re.test(l)).pop() || "";

export function learningAlerts() {
  const out = [];
  const scout = json("logs/scout.json");
  if (!scout?.posts?.length) out.push(`Scout has no data${scout?.failed?.[0] ? ` (${scout.failed[0].slice(0, 90)})` : ""}: other accounts aren't being studied. Usual fix: token needs pages_read_engagement.`);
  else if (ago(scout.ran_at) > 4 * D) out.push(`Scout last ran ${Math.round(ago(scout.ran_at) / D)} days ago (should be every 2).`);
  const fol = lastLine(read("logs/followers.tsv"), /^\d{4}-/).split("\t")[0];
  if (ago(fol) > 2 * D) out.push(`Our post results haven't been recorded for ${fol ? Math.round(ago(fol) / D) + " days" : "ever"} (nightly insights step).`);
  if (!/reach|saved|shares/.test(read("state/performance.md"))) out.push("Our results use likes and comments only: token needs instagram_manage_insights for reach, saves and shares.");
  const scan = lastLine(read("logs/engine.log"), /watcher:/).split(" ")[0];
  if (ago(scan) > 6 * H) out.push(`News scan last ran ${scan ? Math.round(ago(scan) / H) + "h" : "never"} ago (should be hourly).`);
  const late = items("approved").filter((i) => ago(i.scheduled_for) > 2 * H);
  if (late.length) out.push(`${late.length} approved post(s) are over 2 hours late to publish.`);
  if (/PROBLEM/i.test(read("state/daily.md"))) out.push("Instagram token problem (see state/daily.md).");
  return out;
}

export function learningReport() {
  const now = Date.now(), inWeek = (t, w = 0) => { const a = now - Date.parse(t); return a >= w * 7 * D && a < (w + 1) * 7 * D; };
  const costs = read("logs/costs.tsv").trim().split("\n").map((l) => l.split("\t")).filter((r) => r[3]);
  const week = (w) => {
    const posted = items("posted").filter((i) => i.publish?.live && inWeek(i.posted_at, w)).length;
    const rejected = items("rejected").filter((i) => inWeek(i.found_at, w)).length;
    const cost = costs.filter((r) => inWeek(r[0], w)).reduce((s, r) => s + Number(r[3]), 0);
    return { posted, rejected, cost, per: posted ? cost / posted : 0, rate: posted + rejected ? rejected / (posted + rejected) : 0 };
  };
  const a = week(0), b = week(1);
  const arrow = (x, y, lowerIsBetter) => (y === 0 ? "" : x === y ? " (same)" : (x < y) === lowerIsBetter ? " (better)" : " (worse)");
  // what the engine learned since the last report
  const snap = json("logs/learning.json") || { lessons: [] };
  const lessons = read("state/lessons.md").split("\n").filter((l) => l.startsWith("- "));
  const fresh = lessons.filter((l) => !snap.lessons.includes(l));
  const dated = (f) => read(f).split("\n").filter((l) => { const m = l.match(/^- (\d{4}-\d\d-\d\d)/); return m && now - Date.parse(m[1]) < 7 * D; }).length;
  const fol = read("logs/followers.tsv").trim().split("\n").map((l) => l.split("\t")).filter((r) => /^\d{4}/.test(r[0]));
  const folThen = fol.filter((r) => now - Date.parse(r[0]) >= 7 * D).pop() || fol[0], folNow = fol[fol.length - 1];
  const scoutTop = (read("state/scout.md").split("## Formats")[1] || "").split("\n").find((l) => l.startsWith("- ")) || "";
  const best = (read("state/performance.md").split("## Best")[1] || "").split("\n").find((l) => l.startsWith("- ")) || "";
  const alerts = learningAlerts();
  const md = [`# Is it learning? (week to ${new Date().toISOString().slice(0, 10)})`,
    alerts.length ? `\n## Needs attention\n${alerts.map((x) => `- ${x}`).join("\n")}` : "\n## Needs attention\n- Nothing: every loop has fresh data.",
    `\n## This week vs last week`,
    `- Posts live: ${a.posted} (last week ${b.posted})${arrow(a.posted, b.posted, false)}`,
    `- Reject rate: ${Math.round(a.rate * 100)}% (last week ${Math.round(b.rate * 100)}%)${arrow(a.rate, b.rate, true)}`,
    `- AI cost: $${a.cost.toFixed(2)}, $${a.per.toFixed(2)} per live post (last week $${b.per.toFixed(2)})${arrow(a.per, b.per, true)}`,
    folNow ? `- Followers: ${folNow[1]} (a week ago ${folThen?.[1] ?? "?"})` : "",
    `\n## What it learned`,
    `- New lessons from rejects: ${fresh.length}${fresh.length ? "\n" + fresh.slice(0, 5).map((l) => `  ${l}`).join("\n") : ""}`,
    `- Your notes this week: ${dated("state/owner-taste.md")} taste, ${dated("state/design-notes.md")} design`,
    scoutTop ? `- Other accounts' best format now: ${scoutTop.slice(2)}` : "- Other accounts: no scout data yet",
    best ? `- Our best post: ${best.slice(2, 160)}` : "- Our best post: not enough results yet"].filter((l) => l !== "");
  fs.writeFileSync(P("state/learning.md"), md.join("\n") + "\n");
  fs.mkdirSync(P("logs"), { recursive: true });
  fs.writeFileSync(P("logs/learning.json"), JSON.stringify({ at: new Date().toISOString(), lessons }));
  return md.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(learningReport());
