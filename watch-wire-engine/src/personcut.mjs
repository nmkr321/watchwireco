#!/usr/bin/env node
// Cuts a person out of a photo (transparent PNG) for celebrity/event covers. Free, runs locally
// (@imgly/background-removal-node). Cached by file content. If the library is missing, returns null
// and the caller uses the plain photo.
//   node src/personcut.mjs <in.jpg> [out.png]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const CACHE = path.join(os.tmpdir(), "ww-people");
export async function personCut(file) {
  try {
    const key = createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
    const out = path.join(CACHE, key + ".png");
    if (fs.existsSync(out)) return out;
    const { removeBackground } = await import("@imgly/background-removal-node");
    const blob = await removeBackground(pathToFileURL(path.resolve(file)).href, { output: { format: "image/png" } });
    fs.mkdirSync(CACHE, { recursive: true });
    let buf = Buffer.from(await blob.arrayBuffer());
    try { const sharp = (await import("sharp")).default; buf = await sharp(buf).trim().png().toBuffer(); } catch {}   // drop empty margins
    fs.writeFileSync(out, buf);
    return out;
  } catch (e) { if (process.env.WW_DEBUG) console.error("personcut:", e.message); return null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await personCut(process.argv[2]);
  if (r && process.argv[3]) fs.copyFileSync(r, process.argv[3]);
  console.log(r ? "cut" : "unavailable");
}
