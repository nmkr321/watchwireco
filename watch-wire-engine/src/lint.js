#!/usr/bin/env node
// Free pre-checks (no AI) for a finished project, run before the paid approver.
// They catch the mistakes the approver rejected most often, so the editor fixes them itself.
//   node watch-wire-engine/src/lint.js <project dir> [FORMAT]   → prints problems, exit 1 if any
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// slide-count range per format (FORMATS.md / editor rules)
const COUNTS = { NEWS: [5, 6], MARKET: [5, 6], "NEW RELEASES": [6, 8], AUCTIONS: [6, 8], CELEBRITY: [5, 7], "WOULD YOU RATHER": [4, 5],
  "BUILD YOUR COLLECTION": [5, 6], "STORY BEHIND": [7, 10], HISTORY: [7, 10], STORY: [7, 10], LISTICLE: [4, 10] };
const words = (s) => String(s || "").replace(/\[\[|\]\]/g, "").trim().split(/\s+/).filter(Boolean).length;
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
// "$8,350" → "8350"; "$25K" → "25000"; "9.1%" → "9.1"
const norm = (n) => { const m = n.replace(/[$,\s]/g, "").match(/^([\d.]+)([kKmM]?)/); if (!m) return n;
  const v = Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1); return String(Math.round(v * 100) / 100); };
const numbersIn = (s) => (String(s).match(/\$\s?\d[\d,]*(\.\d+)?\s?[kKmM]?\b|\b\d+(\.\d+)?%|CHF\s?\d[\d,.]*/g) || []).map((x) => x.trim());

export function lint(P, format = "") {
  const out = [];
  const f = (n) => path.join(P, n);
  if (!fs.existsSync(f("slides.json"))) return ["slides.json is missing"];
  const spec = readJson(f("slides.json")), slides = spec.slides || [];
  let caption = ""; try { caption = readJson(f("caption.json")).text || ""; } catch { out.push("caption.json is missing or broken"); }
  const fmt = (format || slides[0]?.tag || "").toUpperCase();
  const range = COUNTS[fmt] || Object.entries(COUNTS).find(([k]) => fmt.startsWith(k))?.[1];

  // shape
  if (range && (slides.length < range[0] || slides.length > range[1])) out.push(`${fmt} needs ${range[0]}–${range[1]} slides; this has ${slides.length}`);
  if (slides.length && slides[slides.length - 1].t !== "cta") out.push("the last slide must be the cta slide");
  const fams = new Set(slides.filter((s) => s.t !== "cta").map((s) => String(s.t)[0]));
  if (fams.size > 1) out.push("templates A and D are mixed; use one");

  // text limits and banned wording
  slides.forEach((s, i) => {
    const n = `slide ${i + 1}`;
    if (s.headline && (words(s.headline) < 2 || words(s.headline) > 6) && s.t !== "D-cover") out.push(`${n}: headline must be 2–6 words (has ${words(s.headline)})`);
    if (s.t === "D-cover" && words(s.headline) > 10) out.push(`${n}: cover headline is too long (${words(s.headline)} words, keep it under 11)`);
    if (s.body && words(s.body) > 15) out.push(`${n}: body must be 15 words max (has ${words(s.body)})`);
    if ((String(s.headline || "") + String(s.line1 || "") + String(s.line2 || "") + String(s.body || "")).split("[[").length > 2) out.push(`${n}: at most one [[highlight]]`);
  });
  const allText = JSON.stringify(slides) + " " + caption;
  if (/\be\.g\.|\beg\.?\s/i.test(allText)) out.push('"e.g." is not allowed; write "Like this: …"');

  // photos: credited, never repeated, both watches on a comparison cover
  // comparisons and collections show the cover's watches again on purpose
  const reuseOk = /WOULD YOU RATHER|SAME MONEY|COLLECTION/.test(fmt);
  const seen = new Map();
  slides.forEach((s, i) => {
    for (const k of ["photo", "photo2"]) if (s[k]) {
      if (!s.credit) out.push(`slide ${i + 1}: photo has no credit`);
      if (seen.has(s[k]) && !reuseOk) out.push(`slide ${i + 1}: repeats the photo from slide ${seen.get(s[k])}; use a different picture or drop the slide`);
      else seen.set(s[k], i + 1);
    }
  });
  // photo rights must be on record (photo.js --project registers each photo in assets/manifest.json)
  if (seen.size) { let n = 0; try { n = (readJson(f("assets/manifest.json")).assets || []).length; } catch {}
    if (!n) out.push("photos are not registered: fetch every photo with photo.js ... --project <P> so its rights are recorded"); }
  if (fmt.startsWith("WOULD YOU RATHER") || fmt === "SAME MONEY") {
    if (slides[0]?.t === "A-cover" && !slides[0].photo2) out.push("comparison cover needs both watches (photo and photo2)");
  }

  // caption
  if (!/Follow @watchwireco for daily watch news\.\s*$/.test(caption)) out.push('caption must end with "Follow @watchwireco for daily watch news."');
  if (!/source/i.test(caption)) out.push("caption needs a source line");
  if ((caption.match(/#[A-Za-z0-9_]+/g) || []).length > 5) out.push("caption has more than 5 hashtags (Instagram's limit)");
  if (!/\?|\bcomment/i.test(caption.split("Follow @watchwireco")[0])) out.push("caption needs one question or comment prompt for readers before the Follow line (it brings comments)");
  if (/\$\s?\d/.test(caption) && !/(20\d\d|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(caption)) out.push("caption has prices but no date for them");

  // every price / percentage must appear in the research (the approver's most common rejection)
  let research = "";
  for (const r of ["research-work/evidence.json", "research-work/analysis.json", "research.json"]) { try { research += fs.readFileSync(f(r), "utf8"); } catch {} }
  if (research) {
    const known = new Set(numbersIn(research).map(norm));
    const plain = research.replace(/,/g, "");
    const missing = new Set();
    for (const n of numbersIn(JSON.stringify(slides) + " " + caption)) {
      const v = norm(n);
      if (!known.has(v) && !plain.includes(v)) missing.add(n);
    }
    if (missing.size) out.push(`numbers not found in the research files (add a sourced claim or remove them): ${[...missing].slice(0, 6).join(", ")}`);
  }

  // per-slide sources: a slide with its own price must name its own source when the post uses several outlets
  const outlets = String(spec.source || "").replace(/^Source:\s*/i, "").split(/,|·|&| and /).map((x) => x.trim()).filter(Boolean);
  if (outlets.length > 2) slides.forEach((s, i) => {
    const own = s.source || s.footLeft;
    if (["A-photo", "A-number"].includes(s.t) && /\$\s?\d/.test(JSON.stringify(s)) && !own) out.push(`slide ${i + 1}: has a price, so set its own "source" (just that slide's outlet)`);
  });
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [P, fmt] = process.argv.slice(2);
  const probs = lint(path.resolve(P), fmt || "");
  if (probs.length) { console.log(`PRE-CHECK FAILED (${probs.length}):\n` + probs.map((p) => `- ${p}`).join("\n")); process.exit(1); }
  console.log("PRE-CHECK PASS");
}
