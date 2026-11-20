#!/usr/bin/env node
// Photo fetcher for The Watch Wire. No AI tokens: plain web requests.
// Prints one short JSON line the editor pastes into slides.json.
//
//   node watch-wire-engine/src/photo.js watch <brand-page-url> --brand Rolex --ref 126610LN [--project <P>]
//   node watch-wire-engine/src/photo.js person "Ryan Reynolds" [--project <P>]
//   node watch-wire-engine/src/photo.js commons "Omega Speedmaster Professional" [--ref 311.30] [--project <P>]
//   node watch-wire-engine/src/photo.js find "126610LN"          (library only, no download)
//
// watch:   official brand product/press page → the page's own product image (JSON-LD, og:image).
//          Checks the page names the reference. Rights "official", credit "Image: <Brand>".
// person:  Wikipedia's lead photo, free licence only (CC0 / CC BY / CC BY-SA / public domain),
//          licence and photographer read from Wikimedia Commons. Rights "licensed".
// commons: free-licensed photo search on Wikimedia Commons (vintage/history watches).
// --project <P> also registers the photo in that carousel project (CC media-register).
// Everything is cached in watch-wire-engine/library/ so a model is downloaded once.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(ENGINE, "..");
const LIB = path.join(ENGINE, "library");
const INDEX = path.join(LIB, "index.json");
const UA = "WatchWireEngine/1.0 (+https://github.com/nmkr321/watchwireco)";
const FREE = /^(cc0|cc[- ]by(-sa)?( \d(\.\d)?)?|public domain|pd\b|pd-)/i;

const [cmd, arg, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : ""; };
const out = (o) => { console.log(JSON.stringify(o)); process.exit(o.ok === false ? 1 : 0); };
const fail = (why) => out({ ok: false, error: why });
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const strip = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const lib = () => { try { return JSON.parse(fs.readFileSync(INDEX, "utf8")); } catch { return []; } };
function save(entry) {
  const all = lib().filter((e) => e.file !== entry.file);
  all.push(entry);
  fs.writeFileSync(INDEX, JSON.stringify(all, null, 1) + "\n");
}

async function get(url, as = "text", tries = 2) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: as === "text" ? "text/html,application/json" : "image/*" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (r.status === 429 && tries > 1) {           // the site asked us to slow down: wait as told (max 60s), try once more
    const wait = Math.min(60, Number(r.headers.get("retry-after")) || 20);
    await new Promise((ok) => setTimeout(ok, wait * 1000));
    return get(url, as, tries - 1);
  }
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).hostname}${r.status === 403 || r.status === 429 ? " (site blocks automated readers; use another official page)" : ""}`);
  return as === "text" ? r.text() : { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "" };
}

function size(file) {
  for (const [bin, args, re] of [["sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], /pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/], ["identify", ["-format", "%w %h", file + "[0]"], /(\d+) (\d+)/]]) {
    try { const m = execFileSync(bin, args, { stdio: ["ignore", "pipe", "ignore"] }).toString().match(re); if (m) return [+m[1], +m[2]]; } catch {}
  }
  return [0, 0];
}

async function download(url, name) {
  const { buf, type } = await get(url, "bin");
  if (!/^image\//.test(type) && buf.length < 2000) throw new Error("not an image");
  const ext = /png/.test(type) ? ".png" : /webp/.test(type) ? ".webp" : /avif/.test(type) ? ".avif" : ".jpg";
  fs.mkdirSync(path.join(LIB, "img"), { recursive: true });
  const file = path.join(LIB, "img", slug(name) + ext);
  for (const x of [".png", ".jpg", ".webp", ".avif"]) if (x !== ext) fs.rmSync(path.join(LIB, "img", slug(name) + x), { force: true });
  fs.writeFileSync(file, buf);
  const [w, h] = size(file);
  if (w && Math.min(w, h) < 500) { fs.rmSync(file); throw new Error(`image too small (${w}x${h}); find a bigger official image`); }
  return { file: path.relative(ROOT, file), w, h };
}

function register(entry) {
  const P = opt("project");
  if (!P) return "";
  const cli = path.join(ROOT, "Content Creation/bin/content-creation.js");
  const res = execFileSync("node", [cli, "media-register", P, "--url", entry.source, "--file", path.join(ROOT, entry.file),
    "--usage", entry.usage, "--rights", entry.rights, "--kind", entry.kind, "--title", entry.title, "--creator", entry.creator], { cwd: ROOT }).toString();
  return (res.match(/asset-\d+|"id":\s*"([^"]+)"/) || [])[0]?.replace(/"id":\s*"|"/g, "") || "registered";
}

const done = (e) => out({ ok: true, photo: e.file, credit: e.credit, caption_credit: e.caption_credit || e.credit, rights: e.rights, ref_on_page: e.ref_on_page, ref_in_image_name: e.ref_in_image_name, price: e.price || null, size: e.w ? `${e.w}x${e.h}` : "?", cached: !!e.cached, asset_id: register(e) });

// ---------- watch: official brand page ----------
async function watch(url, brand, ref) {
  if (!url || !brand || !ref) fail("usage: watch <official-url> --brand <Brand> --ref <reference>");
  const hit = lib().find((e) => e.kind === "watch" && norm(e.ref) === norm(ref) && fs.existsSync(path.join(ROOT, e.file)));
  if (hit && hit.price && !rest.includes("--refresh")) return done({ ...hit, cached: true });
  const html = await get(url);
  const ref_on_page = norm(strip(html)).includes(norm(ref)) || norm(url).includes(norm(ref));
  const dec = (u) => u.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");
  const abs = (u) => { const x = new URL(dec(u), url); for (const k of ["w", "h", "width", "height", "wid", "hei", "size"]) x.searchParams.delete(k); return x.toString(); };
  const found = [];
  let price = null;
  for (const m of html.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o) => { if (!o || typeof o !== "object") return;
        if (/product/i.test(o["@type"])) { if (o.image) found.push(...[].concat(o.image).map((x) => x.url || x));
          const of = [].concat(o.offers || [])[0]; const pr = of && (of.price || of.lowPrice || of.priceSpecification?.price);
          if (pr && !price) price = { amount: Number(String(pr).replace(/[^0-9.]/g, "")), currency: of.priceCurrency || of.priceSpecification?.priceCurrency || "" }; }
        Object.values(o).forEach(walk); };
      walk(JSON.parse(m[1]));
    } catch {}
  }
  for (const k of ["og:image:secure_url", "og:image", "twitter:image"]) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    if (m) found.push(m[1]);
  }
    const r = norm(ref).replace(/^m/, "");
  if (!price) { const a = html.match(/<meta[^>]+(?:product:price:amount|og:price:amount)["'][^>]*content=["']([\d.,]+)/i), c = html.match(/<meta[^>]+(?:product:price:currency|og:price:currency)["'][^>]*content=["']([A-Z]{3})/i);
    if (a) price = { amount: Number(a[1].replace(/,/g, "")), currency: c ? c[1] : "" }; }
  if (price && !(price.amount > 50)) price = null;
  // main product image (JSON-LD / og) first, then gallery images named with the reference
  for (const m of html.matchAll(/(?:src|data-src|srcset|href)=["']([^"'\s]+\.(?:png|jpe?g|webp|avif)[^"'\s]*)/gi)) if (norm(m[1]).includes(r)) found.push(m[1]);
  const bad = /logo|icon|favicon|banner|sprite|placeholder|opengraph\/default|share-default/i;
  const ranked = [...new Set(found.filter((x) => typeof x === "string" && !bad.test(x)).map(abs))]
    .sort((a, b) => /side|back|clasp|detail|caseback|profile|wrist/i.test(a) - /side|back|clasp|detail|caseback|profile|wrist/i.test(b));
  if (!ranked.length) fail("no product image on that page (only logos/banners); try an official retailer page or the brand press release");
  let last = "", wide = null;
  for (const u of ranked.slice(0, 8)) {
    try {
      const d = await download(u, `${brand}-${ref}`);
      if (d.w && d.w / d.h > 1.7 && !norm(u).includes(r)) { wide = wide || u; last = "only a wide banner image"; continue; }
      const e = { kind: "watch", brand, ref, title: `${brand} ${ref}`, source: url, image_url: u, ...d, ref_on_page, ref_in_image_name: norm(u).includes(r), price: price ? { ...price, source: url, date: new Date().toISOString().slice(0, 10) } : null,
        rights: "official", creator: brand, credit: `Image: ${brand}`, usage: `${brand} ${ref} official product image, credited`, fetched: new Date().toISOString().slice(0, 10) };
      save(e);
      return done(e);
    } catch (err) { last = err.message; }
  }
  fail(`could not download the page image: ${last}`);
}

// ---------- press: brand ambassador / campaign photo (person wearing the watch) ----------
// Only the brand's own newsroom, press release or campaign page (or an official
// retailer page republishing it). Checks the page names the person.
async function press(url, brand, person) {
  if (!url || !brand || !person) fail('usage: press <brand-news-url> --brand <Brand> --person "Full Name"');
  const html = await get(url);
  const text = norm(strip(html));
  const last = norm(person.split(" ").slice(-1)[0]);
  if (!text.includes(last)) fail(`page does not mention ${person}; use the brand's own announcement for this ambassador`);
  const dec = (u) => u.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, "&");
  const found = [];
  for (const k of ["og:image:secure_url", "og:image", "twitter:image"]) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    if (m) found.push(m[1]);
  }
  for (const m of html.matchAll(/(?:src|data-src)=["']([^"'\s]+\.(?:png|jpe?g|webp)[^"'\s]*)/gi)) if (norm(m[1]).includes(last)) found.push(m[1]);
  const bad = /logo|icon|favicon|sprite|placeholder|opengraph\/default/i;
  const ranked = [...new Set(found.filter((x) => !bad.test(x)).map((u) => new URL(dec(u), url).toString()))];
  if (!ranked.length) fail("no campaign image on that page");
  let why = "";
  for (const u of ranked.slice(0, 5)) {
    try {
      const d = await download(u, `press-${brand}-${person}`);
      const e = { kind: "press", brand, title: `${person} for ${brand}`, person, source: url, image_url: u, ...d, ref_on_page: null,
        rights: "official", creator: brand, credit: `Image: ${brand}`, usage: `${brand} campaign/press image of ${person}, credited`, fetched: new Date().toISOString().slice(0, 10) };
      save(e);
      return out({ ok: true, photo: e.file, credit: e.credit, rights: e.rights, size: `${d.w}x${d.h}`, note: "Read the file: confirm it shows the person and the watch", asset_id: register(e) });
    } catch (err) { why = err.message; }
  }
  fail(`could not download the campaign image: ${why}`);
}

// ---------- gallery: official media page (e.g. Rockstar's GTA VI site, a brand newsroom) ----------
// Downloads the page's large images into library/img/<slug>/ and builds one numbered contact
// sheet (sheet.png) so the editor can pick frames by looking at a single image.
//   photo.js gallery <official-url> --owner "Rockstar Games" --slug rockstar-vi [--max 80]
async function gallery(url, owner, slugName) {
  if (!url || !owner) fail('usage: gallery <official-url> --owner "Name" --slug short-name');
  const dir = path.join(LIB, "img", slug(slugName || owner));
  const sheet = path.join(dir, "sheet.png");
  if (fs.existsSync(sheet) && !rest.includes("--refresh")) {
    const n = fs.readdirSync(dir).filter((f) => /^\d+\./.test(f)).length;
    return out({ ok: true, cached: true, sheet: path.relative(ROOT, sheet), images: n, credit: `Image: ${owner}`, use: `${path.relative(ROOT, dir)}/<number>.jpg` });
  }
  const html = (await get(url)).replace(/&amp;/g, "&");
  // Each picture appears once with all its sizes (srcset "url 640w, url 2560w" or ?imwidth=).
  // Group by file and keep only the biggest version, so we download each picture once.
  const best = new Map();
  const add = (raw, w) => {
    let u; try { u = new URL(raw, url); } catch { return; }
    if (!/\.(jpe?g|png|webp)$/i.test(u.pathname) || /logo|icon|favicon|sprite|button|badge|FOB_|edition|pre-load|background\./i.test(u.pathname)) return;
    const width = w || Number(u.searchParams.get("imwidth") || u.searchParams.get("w") || u.searchParams.get("width") || 0);
    const key = u.origin + u.pathname, cur = best.get(key);
    if (!cur || width > cur.width) best.set(key, { u: u.toString(), width });
  };
  for (const m of html.matchAll(/srcset="([^"]+)"/gi)) for (const part of m[1].split(",")) { const [src, w] = part.trim().split(/\s+/); add(src, parseInt(w) || 0); }
  for (const m of html.matchAll(/(https:\/\/[^"'\s\\]+|\/[^"'\s\\]+)\.(?:jpe?g|png|webp)(?:\?[^"'\s\\]*)?/gi)) add(m[0], 0);
  const urls = [...best.values()].sort((x, y) => y.width - x.width).map((x) => x.u);
  fs.mkdirSync(dir, { recursive: true });
  const max = Number(opt("max") || 12), kept = [], seen = new Set();
  for (const u of urls) {
    if (kept.length >= max) break;
    try {
      const { buf, type } = await get(u, "bin");
      if (!/^image\//.test(type)) continue;
      const hash = crypto.createHash("sha1").update(buf).digest("hex");
      if (seen.has(hash)) continue;
      seen.add(hash);
      const ext = /png/.test(type) ? ".png" : /webp/.test(type) ? ".webp" : ".jpg";
      const f = path.join(dir, `${String(kept.length + 1).padStart(2, "0")}${ext}`);
      fs.writeFileSync(f, buf);
      const [w, h] = size(f);
      if (w && Math.min(w, h) < 700) { fs.rmSync(f); continue; }
      kept.push({ file: path.relative(ROOT, f), image_url: u, w, h });
    } catch {}
  }
  if (!kept.length) fail("no large images on that page");
  // contact sheet: numbered thumbnails, rendered with the same Chrome the slides use
  const CHROME = process.env.CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
  const cells = kept.map((k, i) => `<div style="position:relative;width:240px;height:150px;margin:3px;background:#222 center/cover url('file://${path.join(ROOT, k.file)}')"><b style="position:absolute;left:4px;top:4px;background:#C8A96A;color:#000;font:700 20px Arial;padding:1px 6px">${i + 1}</b></div>`).join("");
  const rows = Math.ceil(kept.length / 4);
  fs.writeFileSync(path.join(dir, "sheet.html"), `<html><body style="margin:0;background:#000;display:flex;flex-wrap:wrap;width:984px">${cells}</body></html>`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", `--window-size=984,${rows * 156 + 4}`, `--screenshot=${sheet}`, "file://" + path.join(dir, "sheet.html")], { stdio: "ignore" });
  fs.rmSync(path.join(dir, "sheet.html"));
  for (const k of kept) save({ kind: "gallery", title: `${owner} image ${path.basename(k.file)}`, source: url, ...k, ref_on_page: null, rights: "official", creator: owner, credit: `Image: ${owner}`, usage: `${owner} official media image, credited`, fetched: new Date().toISOString().slice(0, 10) });
  out({ ok: true, sheet: path.relative(ROOT, sheet), images: kept.length, credit: `Image: ${owner}`, use: `${path.relative(ROOT, dir)}/<number>.jpg`, note: "Read sheet.png once and pick by number" });
}

// ---------- credited: article images whose own credit line names an owner we have permission from ----------
// Only for owners listed in state/owner-taste.md as having given permission (e.g. Rockstar Games).
// Takes images credited to that owner ALONE; an image co-credited to anyone else is skipped.
//   photo.js credited <article-url> --credit Rockstar --owner "Rockstar Games" --slug gta6-esquire
async function credited(url, word, owner, slugName) {
  if (!url || !word || !owner) fail('usage: credited <article-url> --credit Rockstar --owner "Rockstar Games" --slug name');
  const taste = fs.existsSync(path.join(ENGINE, "state/owner-taste.md")) ? fs.readFileSync(path.join(ENGINE, "state/owner-taste.md"), "utf8") : "";
  if (!new RegExp(`${owner}[^\\n]*permission|permission[^\\n]*${owner}`, "i").test(taste)) fail(`no owner permission for ${owner} in state/owner-taste.md`);
  const html = (await get(url)).replace(/&amp;/g, "&");
  const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  const dir = path.join(LIB, "img", slug(slugName || `${owner}-${host}`));
  fs.mkdirSync(dir, { recursive: true });
  const found = [];
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const src = (m[0].match(/src="([^"]+)"/) || [])[1]; if (!src) continue;
    const alt = (m[0].match(/alt="([^"]*)"/) || [])[1] || "";
    const after = strip(html.slice(m.index + m[0].length, m.index + m[0].length + 400));
    const creditLine = after.split(/\s{2,}| (?=[A-Z][a-z]+ [A-Z])/)[0].slice(0, 60);       // text right under the image
    if (!after.toLowerCase().startsWith(word.toLowerCase()) || /^\s*(\/|,|&|and\b)/i.test(after.slice(word.length))) continue;   // credited to the owner alone
    const next = after.slice(word.length).split("<")[0].trim().slice(0, 80);                 // usually the next heading
    const u = new URL(src, url); for (const k of ["resize", "crop", "w", "width"]) u.searchParams.delete(k);
    found.push({ u: u.toString(), alt, next, creditLine });
  }
  if (!found.length) fail(`no images credited only to ${word} on that page`);
  const kept = [];
  for (const [i, f] of found.slice(0, 10).entries()) {
    try {
      const d = await download(f.u, `${path.basename(dir)}/${String(i + 1).padStart(2, "0")}`);
      const e = { kind: "credited", title: `${owner} image ${i + 1}: ${f.alt.slice(0, 80)}`, about: f.next, source: url, image_url: f.u, ...d,
        rights: "licensed", creator: owner, credit: `Image: ${owner}, via ${host[0].toUpperCase() + host.slice(1)}`, usage: `${owner} image used with owner-stated permission, credited`, fetched: new Date().toISOString().slice(0, 10) };
      save(e); kept.push({ photo: e.file, shows: f.alt.slice(0, 70), next_heading: f.next.slice(0, 50) });
    } catch {}
  }
  out({ ok: true, credit: `Image: ${owner}, via ${host[0].toUpperCase() + host.slice(1)}`, images: kept });
}

// ---------- Wikimedia Commons licence lookup ----------
async function commonsInfo(fileTitles) {
  const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1600", titles: fileTitles.join("|") });
  const j = JSON.parse(await get("https://commons.wikimedia.org/w/api.php?" + q));
  return (j.query?.pages || []).map((p) => {
    const ii = p.imageinfo?.[0]; if (!ii) return null;
    const m = ii.extmetadata || {}; const v = (k) => strip(m[k]?.value);
    return { title: p.title, url: ii.thumburl || ii.url, page: ii.descriptionurl, w: ii.width, h: ii.height,
      license: v("LicenseShortName"), license_url: v("LicenseUrl"), artist: v("Artist") || v("Credit") || "Unknown", desc: v("ImageDescription").slice(0, 200), nonfree: v("NonFree") === "true" };
  }).filter(Boolean);
}
const isFree = (i) => !i.nonfree && FREE.test(i.license) && Math.min(i.w, i.h) >= 500;
const ccCredit = (i) => ({ credit: `Photo: ${i.artist.slice(0, 40)} / ${i.license}`, caption_credit: `Photo: ${i.artist} / ${i.license}${i.license_url ? ` (${i.license_url})` : ""} via Wikimedia Commons` });

// ---------- person: Wikipedia lead photo, free licence only ----------
async function person(name) {
  if (!name) fail('usage: person "Full Name"');
  const hit = lib().find((e) => e.kind === "person" && norm(e.title) === norm(name) && fs.existsSync(path.join(ROOT, e.file)));
  if (hit && !rest.includes("--refresh")) return done({ ...hit, cached: true });
  const base = { action: "query", format: "json", formatversion: "2", redirects: "1", prop: "pageimages|description|pageprops", piprop: "name", pilicense: "free" };
  let j = JSON.parse(await get("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ ...base, titles: name })));
  let page = j.query?.pages?.[0];
  if (!page || page.missing || page.pageprops?.disambiguation !== undefined) {
    j = JSON.parse(await get("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ ...base, generator: "search", gsrsearch: name, gsrlimit: "1" })));
    page = j.query?.pages?.[0];
  }
  if (!page || page.missing) fail(`no Wikipedia page for "${name}"`);
  if (norm(page.title).indexOf(norm(name).slice(0, 6)) < 0) fail(`closest page is "${page.title}" (${page.description || ""}); check the name`);
  if (!page.pageimage) fail(`"${page.title}" has no free-licence photo; use the watch's press photo instead`);
  const [i] = await commonsInfo(["File:" + page.pageimage]);
  if (!i || !isFree(i)) fail(`photo for "${page.title}" is not free to reuse (${i?.license || "unknown"}); use the watch's press photo instead`);
  const d = await download(i.url, `person-${page.title}`);
  const e = { kind: "person", title: page.title, who: page.description || "", source: i.page, image_url: i.url, ...d, ref_on_page: null,
    rights: "licensed", creator: i.artist, license: i.license, ...ccCredit(i), usage: `Portrait of ${page.title}, ${i.license}, credited`, fetched: new Date().toISOString().slice(0, 10) };
  save(e);
  out({ ok: true, photo: e.file, who: `${e.title}: ${e.who}`, credit: e.credit, caption_credit: e.caption_credit, rights: e.rights, size: `${e.w}x${e.h}`, asset_id: register(e) });
}

// ---------- commons: free watch photos ----------
async function commons(query, ref) {
  if (!query) fail('usage: commons "search words" [--ref X]');
  const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", list: "search", srnamespace: "6", srsearch: query + " filetype:bitmap", srlimit: "12" });
  const j = JSON.parse(await get("https://commons.wikimedia.org/w/api.php?" + q));
  const titles = (j.query?.search || []).map((s) => s.title);
  if (!titles.length) fail("nothing on Wikimedia Commons for that search");
  const infos = (await commonsInfo(titles)).filter(isFree)
    .filter((i) => ref ? norm(i.title + i.desc).includes(norm(ref)) : query.split(/\s+/).slice(0, 2).every((w) => norm(i.title + i.desc).includes(norm(w))));
  if (!infos.length) fail(`no free-licence match${ref ? ` naming ${ref}` : ""}; use an official brand page instead`);
  const i = infos[0];
  const d = await download(i.url, `commons-${i.title.replace(/^File:/, "").replace(/\.\w+$/, "")}`);
  const e = { kind: "commons", title: i.title, ref: ref || "", source: i.page, image_url: i.url, ...d, ref_on_page: ref ? true : null,
    rights: "licensed", creator: i.artist, license: i.license, ...ccCredit(i), usage: `${i.title} (${i.license}), credited`, fetched: new Date().toISOString().slice(0, 10) };
  save(e);
  out({ ok: true, photo: e.file, title: i.title, about: i.desc.slice(0, 120), credit: e.credit, caption_credit: e.caption_credit, rights: e.rights, size: `${e.w}x${e.h}`, other_matches: infos.length - 1, asset_id: register(e) });
}

function find(q) {
  const n = norm(q);
  out({ ok: true, matches: lib().filter((e) => norm([e.ref, e.title, e.brand].join(" ")).includes(n)).slice(0, 5).map((e) => ({ photo: e.file, title: e.title, credit: e.credit, source: e.source, price: e.price || null })) });
}

fs.mkdirSync(LIB, { recursive: true });
try {
  if (cmd === "watch") await watch(arg, opt("brand"), opt("ref"));
  else if (cmd === "person") await person(arg);
  else if (cmd === "press") await press(arg, opt("brand"), opt("person"));
  else if (cmd === "gallery") await gallery(arg, opt("owner"), opt("slug"));
  else if (cmd === "credited") await credited(arg, opt("credit"), opt("owner"), opt("slug"));
  else if (cmd === "commons") await commons(arg, opt("ref"));
  else if (cmd === "find") find(arg);
  else fail("commands: watch <url> --brand B --ref R | person \"Name\" | commons \"words\" [--ref R] | find \"words\"   (add --project <P> to register)");
} catch (err) { fail(err.message.slice(0, 200)); }
