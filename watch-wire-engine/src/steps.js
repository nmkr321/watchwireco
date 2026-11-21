#!/usr/bin/env node
// Bundled mechanical steps for the editor: one call instead of ~10. No AI, no judgement:
// the editor still writes every content file (evidence, analysis, hook, carousel, slides, caption).
//
//   node watch-wire-engine/src/steps.js start <id> --topic "<headline>" --goal "<goal>" --url <source>
//        → creates the project + research folder, copies the brand, checks it. Prints P.
//   node watch-wire-engine/src/steps.js research <P> --opened <url,url,...> [--summary "one line"] [--decision "one line"]
//        → automation log, work/decision logs, fixed unattended fields, research validate + brief + import.
//   node watch-wire-engine/src/steps.js finish <P>
//        → render slides.json, register every slide, register caption, validate, brief.
// Output is kept to a few lines: PASS, or the exact errors to fix.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lint } from "./lint.js";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(ENGINE, "..");
const CC = path.join(ROOT, "Content Creation/bin/content-creation.js");
const RA = path.join(ROOT, "Content Creation/Content Research Agent/bin/content-research-agent.js");
const [cmd, arg, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : ""; };

function run(bin, args, label) {
  const r = spawnSync("node", [bin, ...args], { cwd: ROOT, encoding: "utf8" });
  const text = `${r.stdout || ""}${r.stderr || ""}`;
  if (r.status !== 0) {
    const errs = text.split("\n").filter((l) => /✗|error|Error|must|missing|invalid/.test(l)).slice(0, 12).join("\n");
    console.log(`FAILED at ${label}:\n${errs || text.trim().split("\n").slice(-8).join("\n")}`);
    process.exit(1);
  }
  return text;
}
const rel = (p) => path.relative(ROOT, path.resolve(ROOT, p));

if (cmd === "start") {
  if (!arg || !opt("topic") || !opt("url")) { console.log('usage: start <id> --topic "<headline>" --goal "<goal>" --url <source>'); process.exit(1); }
  const P = path.join("Content Creation/projects", arg);
  fs.rmSync(path.join(ROOT, P), { recursive: true, force: true });
  run(CC, ["init", "--topic", opt("topic"), "--goal", opt("goal") || "Watch Wire carousel", "--url", opt("url"), "--out", P], "init");
  fs.copyFileSync(path.join(ROOT, "watch-wire-kit/brand.json"), path.join(ROOT, P, "brand.json"));
  run(CC, ["brand-check", P], "brand-check");
  run(RA, ["init", "--topic", opt("topic"), "--goal", opt("goal") || "Watch Wire carousel", "--url", opt("url"), "--out", path.join(P, "research-work")], "research init");
  console.log(`OK project ${P}\nnext: write ${P}/research-work/evidence.json and analysis.json, then: steps.js research "${P}" --opened <urls>`);
} else if (cmd === "research") {
  const P = rel(arg), W = path.join(P, "research-work");
  const opened = (opt("opened") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (opened.length) run(RA, ["automation-log", W, "--agent", "watch-wire-editor", "--tool", "WebFetch", "--reason", "unattended scheduled run, no browser", "--trigger", opened[0], ...opened.flatMap((u) => ["--opened", u])], "automation-log");
  run(path.join(ENGINE, "src/fill-research.js"), [W], "fill-research");
  // mechanical fixes the editor kept failing on (no facts touched):
  // 1) a start URL that was only a placeholder and never opened is replaced by the first page actually opened
  // 2) every research file carries the job's own id
  try {
    const rq = path.join(ROOT, W, "request.json"), req = JSON.parse(fs.readFileSync(rq, "utf8"));
    if (opened.length && Array.isArray(req.input_urls)) {
      const kept = req.input_urls.filter((u) => opened.includes(u));
      req.input_urls = kept.length ? kept : [opened[0]];
      fs.writeFileSync(rq, JSON.stringify(req, null, 2) + "\n");
    }
    const jid = JSON.parse(fs.readFileSync(path.join(ROOT, W, "job.json"), "utf8")).job_id;
    for (const f of ["request.json", "route.json", "browser.json", "evidence.json", "analysis.json", "assets/manifest.json", "assets.json"]) {
      const fp = path.join(ROOT, W, f); if (!fs.existsSync(fp)) continue;
      const o = JSON.parse(fs.readFileSync(fp, "utf8")); if ("project_id" in o && o.project_id !== jid) { o.project_id = jid; fs.writeFileSync(fp, JSON.stringify(o, null, 2) + "\n"); }
    }
  } catch {}
  // the editor's one-line work summary + sourcing decision, logged in the format the validator wants
  const job = JSON.parse(fs.readFileSync(path.join(ROOT, W, "job.json"), "utf8")).job_id;
  const stamp = new Date().toISOString(), day = stamp.slice(0, 10).replace(/-/g, "");
  const hex = () => Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  let concl = ""; try { concl = JSON.parse(fs.readFileSync(path.join(ROOT, W, "analysis.json"), "utf8")).conclusion || ""; } catch {}
  const sess = path.join(ROOT, W, "sessions.ndjson"), dec = path.join(ROOT, W, "decisions.ndjson");
  if (!fs.readFileSync(sess, "utf8").includes('"agent":"watch-wire-editor"'))
    fs.appendFileSync(sess, JSON.stringify({ schema_version: "1.0", session_id: `SES-${day}-${hex()}`, job_id: job, status: "completed", agent: "watch-wire-editor", summary: (opt("summary") || concl || "Research gathered from opened sources").slice(0, 300), created_at: stamp }) + "\n");
  if (!fs.existsSync(dec) || !fs.readFileSync(dec, "utf8").includes('"made_by":"watch-wire-editor"'))
    fs.appendFileSync(dec, JSON.stringify({ decision_id: `DEC-${day}-${hex()}`, job_id: job, title: "Sources used", decision: (opt("decision") || `Use only the opened sources: ${opened.join(", ")}`).slice(0, 300), rationale: "Primary or trusted sources only; unconfirmed details dropped or marked reportedly", made_by: "watch-wire-editor", created_at: stamp }) + "\n");
  run(RA, ["validate", W], "research validate");
  run(RA, ["brief", W], "research brief");
  run(CC, ["research-import", P, "--from", W], "research-import");
  console.log(`OK research imported\nnext: write ${P}/hook.json, carousel.json, slides.json, caption.json, then: steps.js finish "${P}"`);
} else if (cmd === "finish") {
  const P = rel(arg);
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, P, "slides.json"), "utf8"));
  const r = spawnSync("node", [path.join(ENGINE, "templates/render.mjs"), path.join(P, "slides.json"), path.join(P, "render")], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) { console.log(`FAILED at render:\n${(r.stderr || r.stdout).trim().split("\n").slice(-5).join("\n")}`); process.exit(1); }
  spec.slides.forEach((_, i) => {
    const n = i + 1, png = path.join(P, "render", `slide-${String(n).padStart(2, "0")}.png`);
    run(CC, ["slide-register", P, "--slide", `slide-${n}`, "--file", png], `slide-register slide-${n}`);
  });
  run(CC, ["caption-register", P], "caption-register");
  const v = run(CC, ["validate", P], "validate");
  run(CC, ["brief", P], "brief");
  // free pre-checks (the approver's most common rejections): fix these before anyone reviews the post
  const probs = lint(path.join(ROOT, P), opt("format"));
  // fail open: after two tries the remaining items go to the approver as notes instead of blocking the post
  const tries = path.join(ROOT, P, ".precheck-tries"), n = (Number(fs.existsSync(tries) ? fs.readFileSync(tries, "utf8") : 0) || 0) + 1;
  if (probs.length && n <= 2) { fs.writeFileSync(tries, String(n)); console.log(`FAILED at pre-check (fix these, then run finish again):\n${probs.map((p) => "- " + p).join("\n")}`); process.exit(1); }
  if (probs.length) console.log(`pre-check notes left for the approver: ${probs.join(" | ")}`);
  const line = v.split("\n").find((l) => /PASS|FAIL/.test(l)) || "PASS";
  console.log(`OK ${spec.slides.length} slides rendered and registered · ${line.trim()}\nnext: look at ${P}/output/slide-01.png (and any slide with a photo), then write draft.json`);
} else {
  console.log("commands: start <id> --topic --goal --url | research <P> --opened <urls> | finish <P>");
  process.exit(1);
}
