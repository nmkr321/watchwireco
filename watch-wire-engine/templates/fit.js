// Layout check + auto-fit, runs inside every rendered slide (owner 2026-11-25: most approver send-backs were
// mechanical layout problems). It shrinks text that doesn't fit (down to 72% of its size), then reports what is
// still wrong in document.title as "WWFIT <json>", which render.mjs reads back. No AI, no cost.
window.addEventListener("load", () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(fit, 50)));
function fit() {
  const S = document.querySelector(".s"); if (!S) return;
  const T = S.dataset.t || "";
  const MAIN = ".box,.cov,.spotbox,.heroband,.dmid,.dp,.dh,.cta,.p3,.duo,.q,.num,.kick,.dtag,.lbl";
  const SHRINK = "h1,h2,.h,.body,.num,.dh,.dp,.meta,.note,.list li,td,th,.b,.m,.pr,.kick";
  const CHROME = { ".wm": "the logo", ".handle": "the @handle", ".foot": "the footer", ".credit": "the photo credit", ".swipe": "the swipe arrows", ".wmd": "the wordmark", ".mono": "the WW mark" };
  const words = (el) => (el.innerText || "").trim().split(/\s+/).filter(Boolean).length;
  const name = (el) => { const c = (el.className || "").toString().split(" ")[0] || el.tagName.toLowerCase();
    return ({ h: "headline", h1: "headline", h2: "second headline line", body: "body text", num: "big number", dh: "headline", dp: "text", meta: "sub-line", note: "note", lbl: "label", kick: "kicker", td: "table", th: "table" })[c] || c; };
  // line boxes trimmed to the visible glyphs (a font's line box is taller than its letters; Oswald at 250px adds ~60px air)
  const rects = (el) => { const r = document.createRange(); r.selectNodeContents(el); const f = parseFloat(getComputedStyle(el).fontSize) || 16;
    return [...r.getClientRects()].filter((x) => x.width > 2 && x.height > 2).map((x) => { const t = Math.max(0, (x.height - f * 0.9) / 2);
      return { left: x.left, right: x.right, top: x.top + t, bottom: x.bottom - t }; }); };
  const hit = (a, b, pad = 0) => a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && el.getBoundingClientRect().height > 0; };

  function problems() {
    const out = [];
    const texts = [...S.querySelectorAll(SHRINK)].filter(visible);
    // 1) wider than its box or the slide's side margins
    for (const el of texts) {
      const wide = el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).display !== "inline";
      const off = rects(el).some((r) => r.left < 28 || r.right > 1052);
      if (wide || off) out.push({ el, kind: "wide", msg: `${name(el)} is too wide and gets cut off at the side` });
    }
    // 2) text running into fixed parts (footer, logo, credit, swipe arrows)
    for (const [sel, label] of Object.entries(CHROME)) for (const c of S.querySelectorAll(sel)) {
      if (!visible(c)) continue; const cr = rects(c); if (!cr.length) continue;
      for (const el of texts) if (!c.contains(el) && rects(el).some((r) => cr.some((q) => hit(r, q, 10))))
        out.push({ el, kind: "chrome", msg: `${name(el)} runs into ${label}` });
    }
    // 3) text from two different blocks overlapping each other
    const blocks = [...S.querySelectorAll(MAIN)].filter((b) => visible(b) && !b.parentElement.closest(MAIN));
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i].querySelectorAll(SHRINK).length ? [...blocks[i].querySelectorAll(SHRINK)] : [blocks[i]];
      const b = blocks[j].querySelectorAll(SHRINK).length ? [...blocks[j].querySelectorAll(SHRINK)] : [blocks[j]];
      for (const x of a) for (const y of b) if (rects(x).some((r) => rects(y).some((q) => hit(r, q, 6))))
        out.push({ el: x, kind: "overlap", msg: `${name(x)} overlaps the ${name(y)}` });
    }
    // 4) off the bottom or top of the slide
    for (const el of texts) if (rects(el).some((r) => r.bottom > 1350 - 30 || r.top < 20)) out.push({ el, kind: "off", msg: `${name(el)} runs off the slide` });
    return out;
  }

  // auto-fit: shrink only the text that has a problem, a little at a time
  const base = new Map();
  for (let step = 0; step < 10; step++) {
    const p = problems().filter((x) => x.el.matches(SHRINK)); if (!p.length) break;
    let changed = false;
    for (const el of new Set(p.map((x) => x.el))) {
      // shrink the whole block the text lives in, so headline and body stay in proportion
      const block = el.closest(MAIN) || el;
      for (const t of [block, ...block.querySelectorAll(SHRINK)].filter((t) => t.matches(SHRINK))) {
        const fs = parseFloat(getComputedStyle(t).fontSize); if (!base.has(t)) base.set(t, fs);
        if (fs * 0.94 >= base.get(t) * 0.72) { t.style.fontSize = (fs * 0.94).toFixed(1) + "px"; changed = true; }
      }
    }
    if (!changed) break;
  }

  const left = problems(), out = [], seen = new Set();
  for (const x of left) {
    const n = words(x.el), keep = Math.max(2, Math.floor(n * 0.7));
    const fix = n > 2 ? ` → shorten the ${name(x.el)} to about ${keep} words (now ${n})` : ` → use a shorter ${name(x.el)}`;
    const m = x.msg + fix; if (!seen.has(m)) { seen.add(m); out.push(m); }
  }
  // too much text over a photo: a cover/photo text block taller than ~40% of the slide hides the picture
  for (const b of S.querySelectorAll(".cov,.spotbox,.heroband")) {
    const hasPic = [...S.querySelectorAll(".photo,.hero,.sp2,.bg,.strips,.dials,.row")].some(visible);
    const h = Math.max(0, ...[...b.querySelectorAll(SHRINK)].flatMap((t) => rects(t)).map((r) => r.bottom)) - Math.min(1350, ...[...b.querySelectorAll(SHRINK)].flatMap((t) => rects(t)).map((r) => r.top));
    if (hasPic && h > 540) { const n = words(b); out.push(`the text block covers too much of the picture (${Math.round(h / 13.5)}% of the slide) → cut the headline/sub-line to about ${Math.max(3, Math.floor(n * 0.55))} words in total (now ${n})`); }
  }
  // footer source cut off by the ellipsis
  const fs0 = S.querySelector(".foot span");
  if (fs0 && fs0.scrollWidth > fs0.clientWidth + 2) {
    const t = fs0.innerText.trim(), keep = Math.floor(t.length * fs0.clientWidth / fs0.scrollWidth) - 2;
    out.push(`footer source is cut off ("${t.slice(0, 40)}…") → shorten this slide's source to ${keep} characters or fewer`);
  }
  // text on black: no picture at all (the owner's most repeated design complaint)
  const pics = [...S.querySelectorAll("img,div,svg")].some((el) => {
    const r = el.getBoundingClientRect(); if (r.width < 160 || r.height < 160) return false;
    return el.tagName === "IMG" || /url\(/.test(getComputedStyle(el).backgroundImage);
  });
  if (!pics && !/^(cta|D-body|A-number|A-table)$/.test(T)) out.push(`text on black: this slide has no picture → add a photo (A-photo, or the watch it talks about) or merge it into another slide`);
  for (const [t, b] of base) if (parseFloat(t.style.fontSize) < b - 0.5) { document.body.dataset.shrunk = "1"; break; }
  document.title = "WWFIT " + JSON.stringify({ issues: out, shrunk: document.body.dataset.shrunk === "1" });
}
