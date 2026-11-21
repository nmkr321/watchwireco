#!/usr/bin/env node
// The Watch Wire engine. Connects: watcher → editor → approver → queue → publisher.
//
//   node src/run.js tick            watcher + process new breaking candidates + publish anything due
//   node src/run.js make <file>     run editor + approver on one candidate or idea file
//   node src/run.js publish-due     publish approved posts whose time has come
//   node src/run.js plan            plan tomorrow's midday + evening ideas (queue/ideas)
//   node src/run.js make-ideas      make + approve the planned ideas
//   node src/run.js status          show the queue
//
// Claude is only called when there is something to make or approve.
// Every Claude call has a spending cap (WW_EDITOR_BUDGET / WW_APPROVER_BUDGET, USD).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { publishPost } from "./publish.js";
import { lint } from "./lint.js";
import { publishTrialReel } from "./reel.js";
import { collectInsights, plannerHint, dailySummary } from "./insights.js";
import { scout, scoutDue, scoutHint } from "./scout.js";
import { loadEnv } from "./publish.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(ROOT, "..");
const Q = (d) => path.join(ROOT, "queue", d);
// Git does not keep empty folders, so create them on every run (needed on GitHub).
for (const d of ["ideas", "candidates", "drafts", "approved", "rejected", "posted", "hold"]) fs.mkdirSync(Q(d), { recursive: true });
for (const d of ["state", "logs"]) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
const schedule = JSON.parse(fs.readFileSync(path.join(ROOT, "config/schedule.json"), "utf8"));
const CLAUDE = process.env.CLAUDE_BIN || "claude";
const EDITOR_BUDGET = process.env.WW_EDITOR_BUDGET || "0.6";
const APPROVER_BUDGET = process.env.WW_APPROVER_BUDGET || "0.6";
// Cheapest model for every role (Haiku 5.5: $0.10 in / $0.50 out per 1M tokens). Override with WW_MODEL.
const MODEL = process.env.WW_MODEL || "claude-haiku-5-5";
const TRIAGE_MODEL = process.env.WW_TRIAGE_MODEL || MODEL;
// The approver is the judge: owner chose Sonnet for it on 2026-11-20 (Haiku changed its mind between rounds).
const APPROVER_MODEL = process.env.WW_APPROVER_MODEL || "claude-sonnet-5-5";
// Token efficiency: effort per role (override with env). Editor/approver need judgment; planner/triage don't.
const EFFORT = { editor: process.env.WW_EDITOR_EFFORT || "low", approver: process.env.WW_APPROVER_EFFORT || "medium",
  planner: process.env.WW_PLANNER_EFFORT || "low", triage: "low" };

const log = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(ROOT, "logs/engine.log"), line + "\n");
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const move = (file, to) => { const dest = path.join(Q(to), path.basename(file)); fs.renameSync(file, dest); return dest; };

function notify(text) {
  // Optional phone alert. Set WW_NOTIFY_CMD to any command that reads the message from stdin.
  if (!process.env.WW_NOTIFY_CMD) return;
  spawnSync("sh", ["-c", process.env.WW_NOTIFY_CMD], { input: text });
}

function claude(args, prompt, label) {
  const full = args.includes("--model") ? args : ["--model", MODEL, ...args];
  const before = snapshot();
  const res = spawnSync(CLAUDE, ["-p", prompt, ...full], { cwd: WORKSPACE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000 });
  restore(before, label.split(" ")[0]);
  fs.appendFileSync(path.join(ROOT, "logs/claude.log"), `\n===== ${new Date().toISOString()} ${label}\n${res.stdout || ""}\n${res.stderr || ""}\n`);
  // one cost line per AI call (plan-usage equivalent in USD), so the weekly report can show where tokens go
  try { const e = JSON.parse(res.stdout); if (e.total_cost_usd != null) fs.appendFileSync(path.join(ROOT, "logs/costs.tsv"), `${new Date().toISOString()}\t${label}\t${full[full.indexOf("--model") + 1]}\t${e.total_cost_usd.toFixed(4)}\t${e.num_turns || ""}\n`); } catch {}
  if (res.status !== 0) {
    let why = (res.stderr || "") + " " + (res.error ? res.error.message : "");
    try { const e = JSON.parse(res.stdout); why = `${e.terminal_reason || ""} ${e.result || ""} ${why}`; } catch { why += " " + (res.stdout || "").slice(0, 400); }
    throw new Error(`${label} failed (exit ${res.status}): ${why.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[hidden]").trim().slice(0, 600)}`);
  }
  return res.stdout;
}
function parseResult(stdout) {
  // --output-format json returns an envelope; structured output lives in .structured_output or .result
  const env = JSON.parse(stdout);
  if (env.structured_output) return env.structured_output;
  const txt = String(env.result || "");
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// ---------- triage: cheap yes/no before spending on a full carousel ----------
function triage(candidate) {
  const schema = JSON.stringify({
    type: "object", required: ["post", "format", "reason"],
    properties: { post: { type: "boolean" }, format: { type: "string" }, reason: { type: "string" } }
  });
  const prompt = `You triage breaking news for The Watch Wire, a luxury watch news Instagram page for enthusiasts and collectors.
Decide if this story deserves an immediate breaking post. Say yes only for real news a collector would care about today
(major brand moves, record auction results, notable launches, price changes, industry data, big celebrity watch moments).
Say no for reviews, opinion pieces, minor microbrand launches, sponsored content, or anything already old.
Format must be one of: NEWS, NEW RELEASES, AUCTIONS, MARKET, CELEBRITY.

Story: ${candidate.title}
Sources: ${candidate.sources.map((s) => `${s.source} (${s.domain}, ${s.tier}) ${s.published}`).join(" | ")}`;
  const out = claude(["--model", TRIAGE_MODEL, "--output-format", "json", "--json-schema", schema, "--max-budget-usd", "0.03", "--effort", EFFORT.triage], prompt, `triage ${candidate.id}`);
  return parseResult(out);
}

// ---------- make: editor then approver ----------
function nextSlot(lane) {
  const now = new Date();
  const slots = schedule.slots.filter((s) => lane === "any" || s.lane === lane);
  for (let d = 0; d < 3; d++) for (const s of slots) {
    const [h, m] = s.time.split(":").map(Number);
    const t = new Date(now); t.setDate(now.getDate() + d); t.setHours(h, m, 0, 0);
    if (t > now) return t.toISOString();
  }
  return new Date(now.getTime() + 3600e3).toISOString();
}

// The editor may only write inside its project and draft folders. If it changes shared
// engine files (templates, scripts, agent rules, config), put them back.
const SHARED = ["templates", "src", "config", "FORMATS.md", "example", "../.claude/agents"].map((p) => path.join(ROOT, p));
function snapshot() {
  const files = new Map();
  const walk = (p) => { if (!fs.existsSync(p)) return; if (fs.statSync(p).isDirectory()) fs.readdirSync(p).forEach((f) => walk(path.join(p, f))); else files.set(p, fs.readFileSync(p)); };
  SHARED.forEach(walk);
  return files;
}
function restore(before, who) {
  const after = snapshot();
  for (const [f, buf] of before) if (!after.has(f) || !after.get(f).equals(buf)) { fs.writeFileSync(f, buf); log(`${who} changed ${path.relative(ROOT, f)}; restored`); }
  for (const f of after.keys()) if (!before.has(f)) { fs.rmSync(f); log(`${who} added ${path.relative(ROOT, f)}; removed`); }
}

// what the editor/approver need for THIS post only: its format row from FORMATS.md + relevant lessons (no file reads)
function formatBrief(format = "") {
  let row = "", lessons = "";
  try { row = fs.readFileSync(path.join(ROOT, "FORMATS.md"), "utf8").split("\n").find((l) => l.startsWith("| ") && l.toUpperCase().includes(format.toUpperCase().split(" ")[0])) || ""; } catch {}
  try { lessons = fs.readFileSync(LESSONS, "utf8").split("\n").filter((l) => /^- \[(any|[^\]]*)\]/.test(l) && (/\[any\]/.test(l) || l.toUpperCase().includes(`[${format.toUpperCase()}]`))).slice(-12).join("\n"); } catch {}
  return `\nFormat recipe (| format | hook | slides | recipe |): ${row.trim()}\nLessons (never repeat):\n${lessons}`;
}

export function make(file) {
  const item = readJson(file);
  const draftDir = path.join(Q("drafts"), item.id);
  fs.mkdirSync(draftDir, { recursive: true });
  writeJson(path.join(draftDir, "input.json"), item);
  const existing = path.join(draftDir, "draft.json");
  const resume = fs.existsSync(existing) && readJson(existing).status === "ready";
  if (resume) log(`resuming finished draft: ${item.title}`);
  else log(`editor start: ${item.title}`);

  if (!resume) claude(["--agent", "watch-wire-editor", "--effort", EFFORT.editor, "--max-budget-usd", EDITOR_BUDGET,
    "--allowedTools", "Bash Read Write Edit Glob Grep WebFetch WebSearch", "--disallowedTools", "Bash(git:*)", "--permission-mode", "acceptEdits",
    "--output-format", "json"],
    `Make one Watch Wire carousel. Input file: ${path.join(draftDir, "input.json")}. Draft folder (write draft.json here): ${draftDir}. Lane: ${item.lane}. ${item.format ? "Format: " + item.format + "." : ""}` + formatBrief(item.format) +
    (item.previous_attempts?.length ? ` This is attempt ${item.previous_attempts.length + 1}. Earlier attempts failed for these reasons; do not repeat them (find other trusted sources or a different angle on the same topic if needed): ${JSON.stringify(item.previous_attempts)}` : ""),
    `editor ${item.id}`);

  const draftFile = path.join(draftDir, "draft.json");
  if (!fs.existsSync(draftFile)) throw new Error("editor finished without draft.json");
  const draft = readJson(draftFile);
  if (draft.status === "ready") {
    // trust the files, not the editor's word: the project must exist and pass the check
    const pdir = path.resolve(WORKSPACE, draft.project_dir || "");
    const chk = spawnSync("node", [path.join(WORKSPACE, "Content Creation/bin/content-creation.js"), "validate", pdir], { encoding: "utf8" });
    if (!draft.project_dir || !fs.existsSync(path.join(pdir, "carousel.json")) || chk.status !== 0 || !/PASS/.test(chk.stdout)) {
      draft.status = "stopped";
      draft.stop_reason = `editor said ready but the project ${draft.project_dir || "(none)"} is missing or fails the check`;
    }
  }
  if (draft.status !== "ready") {
    log(`editor stopped: ${draft.stop_reason}`);
    item.status = "stopped"; item.stop_reason = draft.stop_reason; writeJson(file, item); move(file, "rejected");
    notify(`Watch Wire: draft stopped. ${item.title}\n${draft.stop_reason}`);
    return;
  }

  const schema = JSON.stringify({
    type: "object", required: ["decision", "post_timing", "reason"],
    properties: {
      decision: { enum: ["approve", "revise", "reject"] }, post_timing: { enum: ["now", "next_slot", "hold"] },
      soft_scores: { type: "object" }, hard_gate_failures: { type: "array", items: { type: "string" } },
      fixes: { type: "array", items: { type: "string" } }, reason: { type: "string" }
    }
  });
  const makePreviews = () => {
    const pv = path.join(draftDir, "previews"); fs.rmSync(pv, { recursive: true, force: true }); fs.mkdirSync(pv);
    const out = path.resolve(WORKSPACE, readJson(draftFile).project_dir, "output");
    for (const f of fs.readdirSync(out).filter((x) => x.endsWith(".png"))) {
      const src = path.join(out, f), dst = path.join(pv, f.replace(".png", ".jpg"));
      // macOS has sips; Linux (GitHub) uses ImageMagick
      const r = spawnSync("sips", ["-Z", "540", "-s", "format", "jpeg", src, "--out", dst]);
      if (r.error || r.status !== 0) spawnSync("convert", [src, "-resize", "540x540", "-quality", "80", dst]);
    }
  };
  // free pre-check before the paid approver: if the editor left known mistakes, it fixes them first (one cheap round)
  let pre = lint(path.resolve(WORKSPACE, draft.project_dir), item.format);
  if (pre.length) {
    log(`pre-check: ${pre.length} problem(s), editor fixes them before review`);
    claude(["--agent", "watch-wire-editor", "--effort", EFFORT.editor, "--max-budget-usd", EDITOR_BUDGET,
      "--allowedTools", "Bash Read Write Edit Glob Grep WebFetch WebSearch", "--disallowedTools", "Bash(git:*)", "--permission-mode", "acceptEdits", "--output-format", "json"],
      `Fix the Watch Wire draft in ${draftDir} (project ${draft.project_dir}). The free pre-check found: ${JSON.stringify(pre)}. Fix exactly these, run node watch-wire-engine/src/steps.js finish on the project until it says PASS, then update draft.json.`,
      `editor-precheck ${item.id}`);
    pre = lint(path.resolve(WORKSPACE, draft.project_dir), item.format);
  }
  let verdict;
  for (let round = 1; round <= 3; round++) {
    makePreviews();
    verdict = parseResult(claude(["--model", APPROVER_MODEL, "--agent", "watch-wire-approver", "--effort", EFFORT.approver, "--max-budget-usd", APPROVER_BUDGET,
      "--allowedTools", "Read Glob Grep Bash WebFetch", "--disallowedTools", "Bash(git:*)", "--output-format", "json", "--json-schema", schema],
      `Review this Watch Wire draft and decide. Draft folder: ${draftDir}` + formatBrief(item.format) + (pre.length ? `\nThe free pre-check still flags (check these; some may be false alarms): ${JSON.stringify(pre)}` : ""), `approver ${item.id} r${round}`));
    writeJson(path.join(draftDir, `verdict-${round}.json`), verdict);
    log(`approver r${round}: ${verdict.decision} (${verdict.reason})`);
    if (round === 1 && verdict.decision !== "approve") learn(item, [...(verdict.hard_gate_failures || []), ...(verdict.fixes || [])]);
    if (verdict.decision !== "revise" || round === 3) break;
    claude(["--agent", "watch-wire-editor", "--effort", EFFORT.editor, "--max-budget-usd", EDITOR_BUDGET,
      "--allowedTools", "Bash Read Write Edit Glob Grep WebFetch WebSearch", "--disallowedTools", "Bash(git:*)", "--permission-mode", "acceptEdits", "--output-format", "json"],
      `Revise the Watch Wire draft in ${draftDir} (project ${draft.project_dir}). Apply exactly these fixes, then run node watch-wire-engine/src/steps.js finish on the project until it says PASS, then update draft.json: ${JSON.stringify(verdict.fixes)}`,
      `editor-revise ${item.id}`);
  }

  if (verdict.decision === "approve") {
    const when = item.post_at ? item.post_at : verdict.post_timing === "now" && item.lane === "breaking" ? new Date().toISOString() : nextSlot(item.lane === "breaking" ? "news" : item.lane);
    // keep a copy of the finished slides + caption in the (git-tracked) queue: projects/ is not saved between cloud runs
    const src = path.resolve(WORKSPACE, draft.project_dir), post = path.join(draftDir, "post");
    fs.mkdirSync(path.join(post, "output"), { recursive: true });
    for (const f of fs.readdirSync(path.join(src, "output")).filter((x) => x.endsWith(".png"))) fs.copyFileSync(path.join(src, "output", f), path.join(post, "output", f));
    fs.copyFileSync(path.join(src, "caption.json"), path.join(post, "caption.json"));
    try { fs.copyFileSync(path.join(src, "slides.json"), path.join(post, "slides.json")); } catch {}   // for alt text and later edits
    Object.assign(item, { status: "approved", scheduled_for: when, draft_dir: path.relative(WORKSPACE, draftDir), project_dir: draft.project_dir, post_dir: path.relative(WORKSPACE, post), verdict });
    writeJson(file, item); move(file, "approved");
    notify(`Watch Wire approved: ${draft.headline}\nPosting ${verdict.post_timing === "now" ? "now" : "at " + when}\n${verdict.reason}`);
  } else {
    Object.assign(item, { status: verdict.decision === "revise" ? "rejected-after-revision" : "rejected", verdict, draft_dir: path.relative(WORKSPACE, draftDir) });
    writeJson(file, item); move(file, "rejected");
    notify(`Watch Wire rejected: ${draft.headline}\n${verdict.reason}`);
  }
}


// headlines the hourly news scan saw in the last 24 hours (posted or not)
function recentHeadlines() {
  const out = [];
  for (const d of ["candidates", "rejected", "hold", "approved", "posted"]) for (const f of fs.readdirSync(Q(d)).filter((x) => x.endsWith(".json"))) {
    try { const i = readJson(path.join(Q(d), f)); if (i.lane === "breaking" && Date.now() - Date.parse(i.found_at) < 864e5) out.push(i.title); } catch {}
  }
  return out.slice(-15);
}

// is there already a scheduled (non-breaking) post for this calendar day in any queue folder?
function plannedFor(day) {
  const key = day.toDateString();
  return ["ideas", "approved", "posted", "rejected", "hold"].some((d) => fs.readdirSync(Q(d)).filter((x) => x.endsWith(".json"))
    .some((f) => { try { const o = readJson(path.join(Q(d), f)); return o.lane !== "breaking" && !/^UNRESOLVED/.test(o.title || "") && o.post_at && new Date(o.post_at).toDateString() === key; } catch { return false; } }));
}

// ideas the approver rejected in the last 7 days, so the planner doesn't suggest them again
function recentRejects() {
  return fs.readdirSync(Q("rejected")).filter((x) => x.endsWith(".json")).map((f) => { try { return readJson(path.join(Q("rejected"), f)); } catch { return {}; } })
    .filter((i) => i.lane !== "breaking" && !i.backup_for && Date.now() - Date.parse(i.found_at) < 7 * 864e5)
    .map((i) => `${i.title}: ${String(i.verdict?.reason || i.stop_reason || "").slice(0, 90)}`).slice(-12);
}

// ---------- plan: create tomorrow's midday + evening ideas ----------
function plan(opts = {}) {
  const posted = fs.readdirSync(Q("posted")).concat(fs.readdirSync(Q("approved"))).filter((f) => f.endsWith(".json"))
    .map((f) => { try { return readJson(path.join(Q(fs.existsSync(path.join(Q("posted"), f)) ? "posted" : "approved"), f)).title; } catch { return ""; } }).filter(Boolean).slice(-40);
  // before noon New York (the overnight run) plans today; after noon plans tomorrow
  const day = new Date(Date.now() + ((opts.today || new Date().getHours() < 12) ? 0 : 864e5));
  const dayOfYear = Math.floor((day - new Date(day.getFullYear(), 0, 0)) / 864e5);
  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  // a late-starting scheduled run (GitHub can delay by an hour+) must not plan a day that is already planned
  if (!opts.slots && plannedFor(day)) { log(`plan: ${dayKey} is already planned, nothing to do`); return; }
  const slotDefs = opts.slots || (schedule.overrides || {})[dayKey] || schedule.slots;
  // one format per slot, picked so no two neighbouring posts share a type
  const lastFmt = fs.readdirSync(Q("posted")).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(Q("posted"), f))).sort((a, b) => Date.parse(a.posted_at) - Date.parse(b.posted_at)).pop()?.format;
  const used = new Set(); let prev = lastFmt;
  const slots = slotDefs.map((s, i) => {
    const pool = s.formats.filter((f) => f !== prev && !(s.lane === "rotation" && used.has(f)));
    const format = (pool.length ? pool : s.formats)[(dayOfYear + i) % (pool.length || s.formats.length)];
    used.add(format); prev = format;
    const [h, m] = s.time.split(":").map(Number); const t = new Date(day); t.setHours(h, m, 0, 0);
    return { lane: s.lane, format, time: s.time, post_at: t.toISOString() };
  });
  const schema = JSON.stringify({ type: "object", required: ["ideas"], properties: { ideas: { type: "array", minItems: slots.length, maxItems: slots.length, items: {
    type: "object", required: ["slot", "title", "hook", "why", "sources_to_check"],
    properties: { slot: { type: "integer" }, title: { type: "string" }, hook: { type: "string" },
      why: { type: "string" }, sources_to_check: { type: "array", items: { type: "string" } } } } } } });
  const prompt = `Read watch-wire-engine/FORMATS.md only.
Plan ${slots.length} Watch Wire posts for ${day.toDateString()}, one per slot (slot = its number):
${slots.map((s, i) => `${i + 1}. ${s.time} ${s.format}${s.lane === "news" ? " (built from the news headlines below; if none fit, a MARKET or NEW RELEASES post from official sources)" : ""}${s.lane === "history" ? " with a tension hook in The Dial style (a person who changed watchmaking, or the story behind one famous watch; an 'On This Day' anniversary if a real one exists)" : ""}`).join("\n")}
Value test for every idea: why would someone save, share or comment? Make each one useful (a clear use or buyer, e.g. "watches for a suit", "first luxury watch under $5K"), timely or interactive. Lists need one use case and a tight price band (roughly within 2x). Seasonal angles for this month (optional: at most ONE of the day's ideas may use one, only if it genuinely fits; most days none): ${JSON.stringify((() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "config/seasons.json"), "utf8"))[String(day.getMonth() + 1)] || []; } catch { return []; } })())}
Use each format's hook pattern. Pictures must match the subject (celebrity → the celebrity, game → gameplay, otherwise the watch). Photo formats: name every watch by brand, model and exact reference, with current US retail prices you can source; for CELEBRITY pick a watch a trusted outlet reported the person wearing. Every idea provable from primary or trusted sources; list the exact URLs or source names to check. No two ideas about the same watch.
News headlines from the last day: ${JSON.stringify(recentHeadlines())}
Do not repeat any of these recent posts: ${JSON.stringify(posted)}
Do not plan these again; they were rejected in the last week (title: reason): ${JSON.stringify(recentRejects())}` + plannerHint() + scoutHint();
  const out = parseResult(claude(["--output-format", "json", "--json-schema", schema, "--max-budget-usd", String(Math.max(0.3, slotDefs.length * 0.06)), "--effort", EFFORT.planner, "--allowedTools", "Read WebSearch WebFetch"], prompt, "planner"));
  const stamp = new Date().toISOString().slice(0, 10);
  for (const idea of out.ideas) {
    const s = slots[(idea.slot || 1) - 1] || slots[0];
    const id = `${stamp}-${s.time.replace(":", "")}-${idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    writeJson(path.join(Q("ideas"), `${id}.json`), { id, status: "idea", found_at: new Date().toISOString(), lane: s.lane, format: s.format, post_at: s.post_at, ...idea,
      sources: idea.sources_to_check.map((x) => ({ title: x, link: /^https?:/.test(x) ? x : "", source: x, tier: "to-verify" })) });
    log(`planned ${s.time} [${s.format}] ${idea.title}`);
  }
}


// ---------- learning: turn approver rejections into general rules for the editor ----------
const LESSONS = path.join(ROOT, "state/lessons.md");
function learn(item, reasons) {
  try {
    const known = fs.existsSync(LESSONS) ? fs.readFileSync(LESSONS, "utf8").split("\n").filter((l) => l.startsWith("- ")).slice(-20) : [];
    const schema = JSON.stringify({ type: "object", required: ["lessons"], properties: { lessons: { type: "array", maxItems: 2, items: { type: "string" } } } });
    const out = parseResult(claude(["--model", MODEL, "--output-format", "json", "--json-schema", schema, "--max-budget-usd", "0.03", "--effort", "low", "--allowedTools", "Read"],
      `The Watch Wire approver sent back a ${item.format || ""} post. Its reasons: ${JSON.stringify(reasons).slice(0, 2500)}
Write at most 2 short general rules (under 25 words each) that would stop the editor making this kind of mistake on FUTURE posts. Not about this post's specifics. The engine runs unattended: never write rules that tell the editor to hold, stop or wait for the owner; rules must say how to get it right. Skip any rule already covered here: ${JSON.stringify(known)}. Return an empty list if nothing new.`, `learn ${item.id}`));
    const add = (out.lessons || []).map((l) => `- [${item.format || "any"}] ${l.trim().replace(/^[-\s]*(\d{4}-\d{2}-\d{2}\s*)?(\[[^\]]*\]\s*)*/, "")}`);
    if (!add.length) return;
    const head = "# Lessons from the approver\nThe editor reads this before every post. Written automatically from rejections; newest last.\n\n";
    fs.writeFileSync(LESSONS, head + [...known, ...add].slice(-20).join("\n") + "\n");
    log(`learned: ${add.map((l) => l.slice(2)).join(" | ")}`);
  } catch (e) { log(`learn failed: ${e.message.slice(0, 120)}`); }
}

// ---------- make with retries: a rejected post is made again (with the reasons), then a backup fills the slot ----------
const MAX_ATTEMPTS = Number(process.env.WW_MAX_ATTEMPTS || 3);
export function makeWithRetries(file) {
  const home = path.dirname(file), name = path.basename(file);
  const me = readJson(file);
  const newer = ["approved", "ideas"].flatMap((d) => fs.readdirSync(Q(d)).filter((x) => x.endsWith(".json")).map((x) => { try { return readJson(path.join(Q(d), x)); } catch { return {}; } })).find((o) => o.replaces === me.id);
  if (newer) { me.status = "replaced"; me.replaced_by = newer.id; writeJson(file, me); move(file, "hold"); log(`skipped (replaced by ${newer.id}): ${me.title}`); return false; }
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    try { make(path.join(home, name)); } catch (e) { log(`attempt ${n} error: ${e.message.slice(0, 200)}`); }
    if (fs.existsSync(path.join(Q("approved"), name))) return true;
    const rej = path.join(Q("rejected"), name);
    const src = fs.existsSync(rej) ? rej : path.join(home, name);
    if (!fs.existsSync(src)) return false;
    const item = readJson(src);
    if (item.triage && item.status === "skipped") return false;           // triage said "not a post"
    const v = item.verdict || {};
    const reasons = [item.stop_reason, v.reason, ...(v.hard_gate_failures || []), ...(v.fixes || [])].filter(Boolean).map((r) => String(r).slice(0, 300));
    learn(item, reasons);
    if (n === MAX_ATTEMPTS) { backup(item); return false; }
    log(`retry ${n + 1}/${MAX_ATTEMPTS}: ${item.title}`);
    fs.rmSync(path.join(Q("drafts"), item.id), { recursive: true, force: true });
    for (const k of ["verdict", "stop_reason", "draft_dir", "project_dir", "post_dir"]) delete item[k];
    item.status = "idea";
    item.previous_attempts = [...(item.previous_attempts || []), reasons.join(" / ").slice(0, 600)];
    writeJson(path.join(home, name), item);
    if (src !== path.join(home, name)) fs.rmSync(src, { force: true });
  }
  return false;
}

// fail fast (no AI): can the library still fill a library-only backup format? Counts priced watches not used
// in posts from the last 3 days or still queued. Any error → assume yes (today's behaviour).
function libraryCanFill(format) {
  try {
    const lib = readJson(path.join(ROOT, "library/index.json")).filter((e) => e.kind === "watch" && e.price?.amount && fs.existsSync(path.join(WORKSPACE, e.file)));
    let used = "";
    for (const d of ["approved", "ideas", "posted"]) for (const f of fs.readdirSync(Q(d)).filter((x) => x.endsWith(".json"))) {
      const o = readJson(path.join(Q(d), f));
      if (d === "posted" && Date.now() - Date.parse(o.posted_at) > 3 * 864e5) continue;
      used += JSON.stringify(o);
      try { used += fs.readFileSync(path.join(WORKSPACE, o.post_dir || "", "caption.json"), "utf8"); } catch {}
    }
    const free = lib.filter((e) => !used.includes(e.ref)).map((e) => e.price.amount).sort((a, b) => a - b);
    if (format === "WOULD YOU RATHER") return free.some((p, i) => free[i + 1] && free[i + 1] <= p * 1.1);
    if (format === "BUILD YOUR COLLECTION") return free.length >= 9;
    if (format === "LISTICLE") return free.some((p) => free.filter((q) => q >= p && q <= p * 2).length >= 4);
    return true;
  } catch { return true; }
}

// a slot that still has no post gets an evergreen backup built from library data (verified prices + photos)
function backup(item) {
  const rej = path.join(Q("rejected"), `${item.id}.json`);
  if (fs.existsSync(rej)) { const r = readJson(rej); r.gave_up = true; writeJson(rej, r); }
  if (item.backup_for || item.lane === "breaking" || !item.post_at) { log(`gave up: ${item.title}`); return; }
  const id = `${item.id}-backup`;
  // pick a type different from every post within 4 hours of this slot (never the same type back to back)
  const t = Date.parse(item.post_at), near = new Set();
  for (const d of ["approved", "ideas", "posted"]) for (const f of fs.readdirSync(Q(d)).filter((x) => x.endsWith(".json"))) {
    try { const o = readJson(path.join(Q(d), f)); const ot = Date.parse(o.scheduled_for || o.post_at || o.posted_at);
      if (o.id !== item.id && Math.abs(ot - t) < 4 * 3600e3) near.add(o.format); } catch {}
  }
  // library formats first: they reuse verified prices and photos and pass far more often (STORY BEHIND needs 7+
  // exact-reference photos, which the library rarely has). A same type nearby beats an empty slot.
  const lib = ["LISTICLE", "WOULD YOU RATHER", "BUILD YOUR COLLECTION"].filter((f) => libraryCanFill(f));
  // celebrity posts do best (owner): a failed celebrity slot gets another celebrity first
  const format = item.format === "CELEBRITY" ? "CELEBRITY" : lib.find((f) => !near.has(f)) || lib[0] || "STORY BEHIND";
  const how = {
    "CELEBRITY": `A DIFFERENT celebrity from the failed post (${item.title}). One trusted outlet naming the watch is enough, credited by name. If a celebrity has no usable photo, switch to another celebrity.`,
    "STORY BEHIND": "Pick a different subject from the failed post: the story behind one famous watch or watchmaker, told only with facts from the brand's own history pages or two trusted outlets. Photos via photo.js (official or free-licence).",
    "LISTICLE": "Must pass the value test in FORMATS.md: one clear use case or buyer and a tight price band (e.g. 'holiday gift watches under $5K', 'watches for a suit under $10K'),  Prices and photos from watch-wire-engine/library or official pages. No watches used in today's approved posts.",
    "WOULD YOU RATHER": "Same money pair from watch-wire-engine/library (verified prices within 10%), watches not used today.",
    "BUILD YOUR COLLECTION": "Tiered collection from watch-wire-engine/library, watches not used today." }[format];
  writeJson(path.join(Q("ideas"), `${id}.json`), { id, lane: item.lane, status: "idea", found_at: new Date().toISOString(), post_at: item.post_at, backup_for: item.id,
    format, title: `Backup ${format} for the slot of: ${item.title}`, hook: "", why: `Backup post. ${how}`, sources: [] });
  log(`backup for ${item.post_at}: making it now (${item.title})`);
  makeWithRetries(path.join(Q("ideas"), `${id}.json`));   // backup_for stops it from queueing another backup
}

function reviveRejected() {
// a scheduled post that was rejected (and still has attempts left) goes back to ideas to be made again
  for (const f of fs.readdirSync(Q("rejected")).filter((x) => x.endsWith(".json"))) {
    const it = readJson(path.join(Q("rejected"), f));
    const due = it.post_at && Date.parse(it.post_at) - Date.now() < 3 * 3600e3 && Date.now() - Date.parse(it.post_at) < 3 * 3600e3;
    if (!due || it.status === "skipped" || it.gave_up || (it.previous_attempts || []).length >= MAX_ATTEMPTS - 1) continue;
    const v = it.verdict || {};
    it.previous_attempts = [...(it.previous_attempts || []), [it.stop_reason, v.reason, ...(v.fixes || [])].filter(Boolean).join(" / ").slice(0, 600)];
    for (const k of ["verdict", "stop_reason", "draft_dir", "project_dir", "post_dir"]) delete it[k];
    it.status = "idea";
    fs.rmSync(path.join(Q("drafts"), it.id), { recursive: true, force: true });
    writeJson(path.join(Q("ideas"), f), it); fs.rmSync(path.join(Q("rejected"), f));
    log(`remaking rejected scheduled post: ${it.title}`);
  }
}

// ---------- tidy (weekly): condense lessons, write the cost report ----------
function tidy() {
  // 1) lessons: merge duplicates, drop stale ones, keep 12 short rules
  try {
    const cur = fs.readFileSync(LESSONS, "utf8").split("\n").filter((l) => l.startsWith("- "));
    if (cur.length > 8) {
      const schema = JSON.stringify({ type: "object", required: ["rules"], properties: { rules: { type: "array", maxItems: 12, items: { type: "string" } } } });
      const out = parseResult(claude(["--output-format", "json", "--json-schema", schema, "--max-budget-usd", "0.05", "--effort", "low", "--allowedTools", "Read"],
        `Condense these editor lessons into at most 12 rules, each "[FORMAT or any] rule" under 22 words. Merge duplicates, drop ones that contradict each other or tell the editor to stop and wait. Keep the most useful.\n${cur.join("\n")}`, "tidy-lessons"));
      if ((out.rules || []).length) fs.writeFileSync(LESSONS, "# Lessons from the approver\nThe engine passes the relevant ones to the editor (condensed weekly).\n\n" + out.rules.map((r) => `- ${r.replace(/^-\s*/, "")}`).join("\n") + "\n");
      log(`tidy: lessons ${cur.length} -> ${(out.rules || []).length}`);
    }
  } catch (e) { log(`tidy lessons failed: ${e.message.slice(0, 120)}`); }
  // 2) cost report for the last 7 days (no AI)
  const f = path.join(ROOT, "logs/costs.tsv");
  if (!fs.existsSync(f)) return;
  const since = Date.now() - 7 * 864e5, rows = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => l.split("\t")).filter((r) => Date.parse(r[0]) > since);
  const sum = (xs) => xs.reduce((a, r) => a + Number(r[3] || 0), 0);
  const by = (key) => Object.entries(rows.reduce((m, r) => { const k = key(r); (m[k] ||= []).push(r); return m; }, {})).map(([k, xs]) => [k, sum(xs), xs.length]).sort((a, b) => b[1] - a[1]);
  const posts = by((r) => r[1].split(" ").slice(1).join(" ").replace(/ r\d+$/, "") || "(other)");
  const postedN = fs.readdirSync(Q("posted")).filter((x) => x.endsWith(".json")).map((x) => readJson(path.join(Q("posted"), x))).filter((p) => Date.parse(p.posted_at) > since).length;
  const md = [`# Cost report (${new Date().toISOString().slice(0, 10)}, last 7 days)`, "Plan-usage equivalent in USD (not a bill).", "",
    `- Total: $${sum(rows).toFixed(2)} over ${rows.length} AI calls; ${postedN} posts published, $${(sum(rows) / Math.max(1, postedN)).toFixed(2)} per published post`,
    "", "## By role", ...by((r) => r[1].split(" ")[0]).map(([k, c, n]) => `- ${k}: $${c.toFixed(2)} (${n} calls, $${(c / n).toFixed(3)} each)`),
    "", "## Most expensive posts", ...posts.slice(0, 8).map(([k, c, n]) => `- ${k}: $${c.toFixed(2)} (${n} calls)`),
    "", "Ideas to cut: posts with many calls mean retries or review rounds; check their lessons and the rules behind them."].join("\n");
  fs.writeFileSync(path.join(ROOT, "state/costs.md"), md + "\n");
  log(`tidy: cost report written ($${sum(rows).toFixed(2)} in 7 days)`);
}

async function makeIdeas({ selfPlan = false } = {}) {
  // GitHub sometimes skips the scheduled plan run: if nothing is planned for today yet, plan first (overnight runs only)
  if (selfPlan && new Date().getHours() < 12) {
    if (!plannedFor(new Date())) { log("no posts planned for today yet (plan run was skipped?): planning now"); try { await collectInsights(log); } catch {} plan(); }
  }
  reviveRejected();
  // earliest post first, and save after each one so the publisher sees it while the rest are still being made
  const ideas = fs.readdirSync(Q("ideas")).filter((x) => x.endsWith(".json"))
    .map((f) => { let t = ""; try { t = readJson(path.join(Q("ideas"), f)).post_at || ""; } catch {} return [t || "9", f]; }).sort().map(([, f]) => f);
  for (const f of ideas) {
    try { makeWithRetries(path.join(Q("ideas"), f)); } catch (e) { log(`error on idea ${f}: ${e.message}`); }
    if (process.env.GITHUB_ACTIONS) spawnSync("bash", [path.join(ROOT, "src/save.sh"), f.replace(/\.json$/, "")], { stdio: "inherit" });
  }
}

// ---------- publish ----------
async function publishDue({ breakingOnly = false } = {}) {
  const posted = fs.readdirSync(Q("posted")).map((f) => readJson(path.join(Q("posted"), f)));
  const today = new Date().toDateString();
  const lastPost = posted.map((p) => Date.parse(p.posted_at)).sort().pop() || 0;
  // oldest due first; at most one post per run and 20+ minutes apart, so late posts never go out in a burst
  const due = fs.readdirSync(Q("approved")).filter((x) => x.endsWith(".json")).map((f) => [readJson(path.join(Q("approved"), f)).scheduled_for || "", f]).sort().map(([, f]) => f);
  let postedThisRun = 0;
  for (const f of due) {
    const file = path.join(Q("approved"), f);
    const item = readJson(file);
    if (Date.parse(item.scheduled_for) > Date.now()) continue;
    if (breakingOnly && item.lane !== "breaking") continue;
    if (item.lane !== "breaking" && (postedThisRun || Date.now() - lastPost < 20 * 60e3)) { log(`spacing: ${item.id} waits for the next check`); continue; }
    // a newer version of this post exists (owner/editor replaced it): don't publish the old one
    const replacedBy = ["approved", "ideas"].flatMap((d) => fs.readdirSync(Q(d)).filter((x) => x.endsWith(".json")).map((x) => { try { return readJson(path.join(Q(d), x)); } catch { return {}; } })).find((o) => o.replaces === item.id);
    if (replacedBy) { item.status = "replaced"; item.replaced_by = replacedBy.id; writeJson(file, item); move(file, "hold"); log(`replaced, not posting: ${item.title}`); continue; }
    const breakingToday = posted.filter((p) => p.lane === "breaking" && new Date(p.posted_at).toDateString() === today).length;
    if (item.lane === "breaking" && breakingToday >= schedule.breaking.max_per_day) { log(`breaking cap reached, holding ${item.id}`); continue; }
    if (Date.now() - lastPost < schedule.breaking.min_minutes_between_posts * 60e3 && item.lane === "breaking") { log(`too soon after last post, holding ${item.id}`); continue; }
    let result;
    try { result = await publishPost(item, { live: schedule.auto_publish === true }); }
    catch (e) {
      // keep it queued and try at the next check; after 3 failed checks, hold it and tell the owner
      item.publish_failures = (item.publish_failures || 0) + 1; item.last_publish_error = e.message.slice(0, 200); writeJson(file, item);
      log(`publish failed (${item.publish_failures}/3) for ${item.id}: ${e.message.slice(0, 160)}`);
      if (item.publish_failures >= 3) { move(file, "hold"); notify(`Watch Wire: could not publish "${item.title}" after 3 tries, moved to hold: ${e.message.slice(0, 120)}`); }
      continue;
    }
    Object.assign(item, { status: result.live ? "posted" : "ready-to-post", posted_at: new Date().toISOString(), publish: result });
    // optional: the same slides as a trial Reel (shown to non-followers first; off unless trial_reels.enabled)
    if (result.live && schedule.trial_reels?.enabled && item.lane !== "breaking") {
      try { item.trial_reel = await publishTrialReel(item); log(`trial reel posted for ${item.id}`); }
      catch (e) { item.trial_reel = { error: e.message.slice(0, 200) }; log(`trial reel failed for ${item.id}: ${e.message.slice(0, 160)}`); }
    }
    writeJson(file, item); move(file, "posted"); postedThisRun++;
    log(`${result.live ? "POSTED" : "DRY RUN (auto_publish is off)"}: ${item.title} ${result.permalink || ""}`);
    notify(`Watch Wire ${result.live ? "posted" : "ready to post (auto-publish off)"}: ${item.title}`);
  }
}

function status() {
  for (const d of ["ideas", "candidates", "drafts", "approved", "rejected", "posted"]) {
    const files = fs.readdirSync(Q(d)).filter((f) => !f.startsWith("."));
    console.log(`${d.padEnd(11)} ${files.length}`);
    if (d !== "drafts") for (const f of files.slice(-5)) { try { const i = readJson(path.join(Q(d), f)); console.log(`   - ${i.title}${i.scheduled_for ? "  → " + i.scheduled_for : ""}`); } catch {} }
  }
}

async function tick() {
  const w = spawnSync(process.execPath, [path.join(ROOT, "src/watcher.js")], { encoding: "utf8" });
  if (w.stdout.trim()) log(`watcher: ${w.stdout.trim().split("\n")[0]}`);
  for (const f of fs.readdirSync(Q("candidates")).filter((x) => x.endsWith(".json")).slice(0, 2)) {
    const file = path.join(Q("candidates"), f);
    const c = readJson(file);
    try {
      const t = triage(c);
      log(`triage: ${t.post ? "YES" : "no"} [${t.format}] ${c.title} (${t.reason})`);
      if (!t.post) { c.status = "skipped"; c.triage = t; writeJson(file, c); move(file, "rejected"); continue; }
      c.format = t.format; writeJson(file, c);
      makeWithRetries(file);
    } catch (e) { log(`error on ${c.id}: ${e.message}`); }
  }
  await publishDue({ breakingOnly: true });          // breaking news goes out as soon as it is approved
}

const [cmd, arg] = process.argv.slice(2);
const lockFile = path.join(ROOT, "state/run.lock");
if (["tick", "make", "make-ideas"].includes(cmd)) {
  if (fs.existsSync(lockFile) && Date.now() - fs.statSync(lockFile).mtimeMs < 45 * 60e3) { console.log("another run is in progress"); process.exit(0); }
  fs.writeFileSync(lockFile, String(process.pid));
}
try {
  if (cmd === "tick") await tick();
  else if (cmd === "make") makeWithRetries(path.resolve(arg));
  else if (cmd === "publish-due") await publishDue();
  else if (cmd === "plan") {
    loadEnv();
    await collectInsights(log).catch((e) => log(`insights failed: ${e.message}`));
    const bad = await dailySummary(log).catch(() => "");
    if (bad) notify(`Watch Wire: Instagram token ${bad}`);
    if (scoutDue()) await scout(log).catch((e) => log(`scout failed: ${e.message}`));   // other accounts, every 2 days
    plan();
  }
  else if (cmd === "insights") { loadEnv(); await collectInsights(log); await dailySummary(log); }
  else if (cmd === "scout") await scout(log);
  else if (cmd === "tidy") tidy();
  else if (cmd === "plan-now") {            // plan-now "19:05 NEWS,20:05 CELEBRITY": extra posts for today at these times
    const slotsArg = (process.argv[3] || process.env.WW_SLOTS || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
      const [time, ...f] = x.split(" "); const format = f.join(" ");
      return { time, lane: /STORY|HISTORY/.test(format) ? "history" : /NEWS|RELEASES|MARKET/.test(format) ? "news" : "rotation", formats: [format] };
    });
    plan({ today: true, slots: slotsArg });
    await makeIdeas();
  }
  else if (cmd === "make-ideas") { loadEnv(); await makeIdeas({ selfPlan: true }); }
  else if (cmd === "status") status();
  else console.log("usage: node src/run.js tick | make <file> | publish-due | status");
} finally {
  if (["tick", "make", "make-ideas"].includes(cmd)) fs.rmSync(lockFile, { force: true });
}
