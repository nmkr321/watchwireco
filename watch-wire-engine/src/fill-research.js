#!/usr/bin/env node
// Fills the fixed fields every unattended research run needs, so the editor does not
// spend tokens on them: social discovery is always "skipped (automation mode)" on the
// engine. Only adds missing fields; never touches claims, sources or conclusions.
//   node watch-wire-engine/src/fill-research.js <P>/research-work
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: fill-research.js <research-work-dir>"); process.exit(1); }
const file = path.join(dir, "analysis.json");
const a = JSON.parse(fs.readFileSync(file, "utf8"));
const s = (a.specialist ||= {});
const skip = ["x.com", "digg.com", "reddit.com"];
const set = (k, v) => { if (s[k] === undefined || (Array.isArray(s[k]) && !s[k].length) || s[k] === "") s[k] = v; };
set("topic_scope", a.scope || a.conclusion || "Watch Wire carousel topic");
set("sample_definition", "Primary and trusted sources named in evidence.json");
set("time_window", new Date().toISOString().slice(0, 10));
set("claim_ranking_method", "Official sources first, else one named article or post");
set("stopping_rule", "Stop when every on-slide fact has one named source");
const have = new Set((s.signal_counts || []).map((c) => c.platform));
s.signal_counts = [...(s.signal_counts || []), ...skip.filter((p) => !have.has(p)).map((platform) => ({ platform, unique_authors: 0, qualifying_posts: 0 }))];
set("platform_findings", skip.map((p) => `${p}: skipped (automation mode, no browser)`));
set("firsthand_signals", []);
set("narrative_patterns", ["Not assessed: unattended run uses primary and trusted sources only"]);
set("disagreements", []);
set("verification_source_ids", []);
set("coverage_gaps", ["Social discovery skipped in automation mode"]);
fs.writeFileSync(file, JSON.stringify(a, null, 2) + "\n");
console.log("filled unattended-run fields in", file);
