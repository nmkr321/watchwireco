#!/usr/bin/env node
// Watch Wire slide renderer. The editor writes a short slides.json; this file owns
// all HTML/CSS so the brand stays exact and the editor spends almost no tokens on design.
//
//   node templates/render.mjs <slides.json> <out-dir>
//
// slides.json: { "source": "Source line for every slide", "slides": [ {...}, ... ] }
// Each slide has "t" (template) plus fields. Text fields accept [[word]] = champagne highlight.
//
//   A-cover   tag, line1, line2, meta, photo?, credit?          news cover (photo fades to jet)
//   A-number  tag, number, label, headline, body?                big stat
//   A-table   label, headline, cols:[a,b,c], rows:[[a,b,c],..], hl?:rowIndex, note?, body?
//   A-list    label, headline, items:[text,..], body?            boxed list
//   A-text    label, headline, body                              plain explainer
//   A-wyr     tag, left:{brand,model,price?,photo?}, right:{...}, prompt?   would you rather / same money
//   A-photo   label, headline, photo, credit, body?, fit?        big photo on top + caps headline band (fit:"cover" for people/lifestyle shots; default shows the whole watch on ivory)
//   A-pick3   label, headline, options:[{brand, model, price, photo},x3], credit?   one tier: 3 choices A/B/C
//   A-spotted label, headline, photo (person/game shot), watch (watch image), wrist:{x,y} (% of the photo where the watch is), zoom?, credit, body?
//             → shot zoomed toward the wrist, watch cut out in a gold medallion, gold arrow + ring on the wrist
//   D-cover   tag, headline, photo?, credit?                          story cover (title case)
//   D-body    kicker, text, photo?, credit?                               story beat
//   cta       line1?, line2?, body?                              closing slide (always last)
// photo = local file path or https URL. credit = "Image: Brand". Any slide may set its own `source` (its footer).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CHROME = process.env.CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const [specFile, outDir] = process.argv.slice(2);
if (!specFile || !outDir) { console.error("usage: render.mjs <slides.json> <out-dir>"); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
const slides = spec.slides;
fs.mkdirSync(path.join(outDir, "html"), { recursive: true });

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hl = (s = "") => esc(s).replace(/\[\[(.+?)\]\]/g, '<span class="hl">$1</span>');
// photo paths: https URL, path relative to slides.json, or path from the project root (watch-wire-engine/library/...)
const img = (p) => {
  if (!p) return "";
  if (/^https?:/.test(p)) return p;
  const f = [path.resolve(path.dirname(specFile), p), path.resolve(p)].find((x) => fs.existsSync(x));
  if (!f) { console.error(`photo not found: ${p} (fetch it with watch-wire-engine/src/photo.js)`); process.exit(1); }
  return "file://" + f;
};

const CSS = `
:root{--jet:#0B0B0C;--ink:#17171A;--ivory:#F4EFE6;--smoke:#9B968C;--ch:#C8A96A;
--n:'Oswald','Arial Narrow',Impact,sans-serif;--st:'Poppins','Helvetica Neue',Arial,sans-serif;--m:'Playfair Display',Georgia,serif;--b:'Inter',Helvetica,Arial,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden;background:var(--jet);color:var(--ivory);font-family:var(--b)}
.s{position:relative;width:1080px;height:1350px;overflow:hidden}
.wm{position:absolute;left:48px;top:52px;font:700 32px var(--n);letter-spacing:.06em;z-index:3}.wm b{color:var(--ch);font-weight:700}
.handle{position:absolute;right:48px;top:58px;font:600 20px var(--b);letter-spacing:.16em;color:var(--smoke);z-index:3}
.foot span{white-space:nowrap}.foot span:first-child{overflow:hidden;text-overflow:ellipsis;min-width:0}.foot span:last-child{flex:none}.foot{position:absolute;left:48px;right:48px;bottom:48px;display:flex;justify-content:space-between;gap:24px;font:600 18px var(--b);letter-spacing:.16em;color:var(--smoke);text-transform:uppercase;z-index:3}
.credit{position:absolute;right:48px;bottom:84px;font:400 16px var(--b);color:rgba(244,239,230,.5);z-index:3}
.tag{display:inline-block;background:var(--ch);color:var(--jet);font:700 26px var(--n);letter-spacing:.16em;padding:8px 24px;border-radius:4px}
.hl{color:var(--ch)}
.lbl{font:600 22px var(--b);letter-spacing:.16em;color:var(--smoke);text-transform:uppercase}
.h{font:700 80px/1.05 var(--n);text-transform:uppercase;margin-top:22px;text-wrap:balance}
.body{font:400 34px/1.45 var(--b);color:#d8d2c7;margin-top:40px}
.box{position:absolute;left:48px;right:48px;top:170px}.box.mid{top:50%;transform:translateY(-50%);max-height:1060px}
.photo{position:absolute;inset:0 0 auto 0;height:920px;background:#141312 center 25%/cover no-repeat}.photo::before{content:"";position:absolute;inset:0 0 auto 0;height:240px;background:linear-gradient(rgba(11,11,12,.8),transparent)}
.fade{position:absolute;left:0;right:0;top:560px;height:420px;background:linear-gradient(transparent,var(--jet))}
.pcredit{top:100px;bottom:auto;font-size:18px;color:rgba(244,239,230,.85);text-shadow:0 1px 6px rgba(0,0,0,.9)}
.cov{position:absolute;left:48px;right:48px;bottom:150px;text-align:center;z-index:2}.cov.mid{top:50%;bottom:auto;transform:translateY(-50%)}
.cov h1{font:700 118px/1 var(--n);text-transform:uppercase;margin-top:28px;text-wrap:balance}
.cov h2{font:700 96px/1.04 var(--n);color:var(--ch);text-transform:uppercase;text-wrap:balance}
.meta{font:600 20px var(--b);letter-spacing:.16em;color:var(--smoke);margin-top:32px;text-transform:uppercase}
.num{font:700 250px/1 var(--n);color:var(--ch);text-align:center;margin-top:300px}
table{width:100%;border-collapse:separate;border-spacing:0 12px;margin-top:44px}.tight table{border-spacing:0 6px;margin-top:24px}.tight td{padding:14px 22px;font-size:26px}.tight th{padding:0 22px}.tight td:first-child{white-space:nowrap}.tight td:last-child{white-space:nowrap}
th{font:600 18px var(--b);letter-spacing:.16em;color:var(--smoke);text-transform:uppercase;text-align:right;padding:0 30px}th:first-child{text-align:left}
td{background:var(--ink);padding:26px 30px;font:500 30px var(--b);color:var(--smoke);text-align:right}
td:first-child{border-radius:6px 0 0 6px;font:700 40px var(--n);text-transform:uppercase;color:var(--ivory);text-align:left}
td:last-child{border-radius:0 6px 6px 0;font:700 44px var(--n);color:var(--ivory)}
tr.on td:last-child{color:var(--ch)}
.note{font:400 24px/1.45 var(--b);color:var(--smoke);margin-top:24px}
.list{list-style:none;margin-top:44px;display:grid;gap:14px}.list li{background:var(--ink);padding:28px 32px;border-radius:6px;font:600 34px/1.3 var(--b)}
.duo{position:absolute;top:50%;transform:translateY(-44%);left:0;right:0;display:flex;justify-content:space-around;align-items:flex-start;text-align:center}.duo .or{margin-top:170px}
.duo .w{width:380px}.duo .pic{width:380px;height:440px;background:var(--ink) center/contain no-repeat;border-radius:6px}
.duo p{font:600 24px var(--b);letter-spacing:.14em;color:var(--smoke);margin-top:20px;text-transform:uppercase}.duo p span{display:block;font:700 60px/1.05 var(--n);color:var(--ivory);letter-spacing:.02em;margin-top:6px}.duo p em{display:block;font:600 30px var(--b);font-style:normal;color:var(--ch);letter-spacing:.06em;margin-top:10px}
.or{font:600 88px var(--m);color:var(--ch)}
.q{position:absolute;top:150px;left:0;right:0;text-align:center}
.sp2{position:absolute;inset:0 0 auto 0;height:900px;overflow:hidden;background:#141312}.sp2 img{position:absolute;left:0;top:0;transform-origin:0 0}
.sp2::before{content:"";position:absolute;inset:0 0 auto 0;height:220px;background:linear-gradient(rgba(11,11,12,.85),transparent);z-index:1}
.sp2::after{content:"";position:absolute;left:0;right:0;bottom:0;height:360px;background:linear-gradient(transparent,var(--jet));z-index:1}
.medal{position:absolute;width:330px;height:330px;border-radius:50%;z-index:3;background:radial-gradient(circle at 50% 38%,#2a2520 0%,#141210 62%,#0b0b0c 100%);
  box-shadow:0 0 0 6px var(--ch),0 0 0 9px rgba(11,11,12,.85),0 0 0 11px rgba(200,169,106,.45),0 24px 60px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center}
.medal img{width:76%;height:76%;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(0,0,0,.6))}
.arw{position:absolute;left:0;top:0;z-index:2;overflow:visible}
.spot{position:absolute;inset:0 0 auto 0;height:860px;background:#141312 center 22%/cover no-repeat}.spot::before{content:"";position:absolute;inset:0 0 auto 0;height:240px;background:linear-gradient(rgba(11,11,12,.85),transparent)}.spot::after{content:"";position:absolute;left:0;right:0;bottom:0;height:380px;background:linear-gradient(transparent,var(--jet))}
.inset{position:absolute;right:48px;top:470px;width:340px;height:340px;border-radius:8px;background:#F4EFE6 center/82% no-repeat;background-blend-mode:multiply;box-shadow:0 18px 50px rgba(0,0,0,.55);border:3px solid var(--ch);z-index:2}
.spotbox{position:absolute;left:48px;right:48px;bottom:150px;z-index:2}
.hero{position:absolute;left:0;right:0;top:130px;height:770px;background:#F4EFE6 center/contain no-repeat;background-blend-mode:multiply;background-origin:content-box;padding:50px 90px 90px}.hero.cover{background-blend-mode:normal;top:0;height:900px;padding:0;background-color:#141312;background-size:cover;background-position:center 30%}
.hero.cover::before{content:"";position:absolute;inset:0 0 auto 0;height:200px;background:linear-gradient(rgba(11,11,12,.85),transparent)}.hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:160px;background:linear-gradient(transparent,var(--jet))}
.heroband{position:absolute;left:48px;right:48px;top:870px;bottom:120px;display:flex;flex-direction:column;justify-content:center;text-align:center;z-index:2}.heroband .h{margin-top:12px}.heroband .body{margin-top:18px;font-size:30px}
.p3{position:absolute;left:36px;right:36px;top:380px;display:flex;gap:24px}.p3 .o{flex:1;text-align:center}
.p3 .pic{height:540px;border-radius:8px;background:#F4EFE6 center/contain no-repeat;background-blend-mode:multiply;background-origin:content-box;padding:28px;position:relative}
.p3 .let{position:absolute;left:14px;top:14px;width:54px;height:54px;border-radius:50%;background:var(--ch);color:var(--jet);font:700 32px/54px var(--n)}
.p3 .b{font:600 20px var(--b);letter-spacing:.14em;color:var(--smoke);text-transform:uppercase;margin-top:22px}
.p3 .m{font:700 40px/1.05 var(--n);text-transform:uppercase;margin-top:6px;text-wrap:balance}.p3 .pr{font:600 28px var(--b);color:var(--ch);margin-top:10px}
.single{width:100%;height:640px;background:var(--ink) center/contain no-repeat;border-radius:6px;margin-top:36px}
.bg{position:absolute;inset:0;background:#2a2622 center/cover no-repeat}.ov{position:absolute;inset:0;background:rgba(11,11,12,.6)}
.mono{position:absolute;top:72px;left:0;right:0;text-align:center;font:600 54px var(--m);z-index:2}
.dh{position:absolute;top:330px;left:56px;right:56px;text-align:center;font:700 104px/1.03 var(--st);letter-spacing:-.02em;text-wrap:balance;z-index:2}
.arr{position:absolute;top:1000px;left:50%;margin-left:-34px;width:68px;height:68px;border:3px solid var(--ivory);border-radius:50%;text-align:center;font:600 36px/60px var(--b);z-index:2}
.wmd{position:absolute;bottom:72px;left:0;right:0;text-align:center;font:600 36px var(--m);letter-spacing:.06em;z-index:2}
.dtag{position:absolute;top:220px;left:0;right:0;text-align:center;z-index:2}.dmid{position:absolute;top:50%;left:56px;right:56px;transform:translateY(-50%);text-align:center;z-index:2}.dmid .kick{position:static;margin-bottom:34px}.dmid .dp{position:static;margin:0}
.kick{position:absolute;top:240px;left:0;right:0;text-align:center;font:600 22px var(--b);letter-spacing:.24em;color:var(--ch);text-transform:uppercase;z-index:2}
.dp{position:absolute;top:330px;left:110px;right:110px;text-align:center;font:600 56px/1.3 var(--st);z-index:2}
.cta{position:absolute;top:430px;left:80px;right:80px;text-align:center}.cta h1{font:700 104px/1.02 var(--n);text-transform:uppercase}
.cta p{font:400 34px/1.45 var(--b);color:#c9c3b8;margin-top:30px}
.btn{display:inline-block;margin-top:60px;border:2px solid var(--ch);color:var(--ch);font:700 30px var(--n);letter-spacing:.12em;padding:18px 40px;border-radius:4px}`;

const HEAD = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Poppins:wght@600;700&family=Playfair+Display:wght@600&family=Inter:wght@400;500;600&display=block"><style>${CSS}</style></head><body>`;
const WM = `<div class="wm">THE WATCH <b>WIRE</b></div><div class="handle">@WATCHWIRECO</div>`;

function render(s, i) {
  const page = `${String(i + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  const foot = (left = (s.source || spec.source) ? "Source: " + String(s.source || spec.source).replace(/^\s*sources?:\s*/i, "") : "") => `<div class="foot"><span>${esc(left)}</span><span>${page}</span></div>`;
  let credit = s.credit ? `<div class="credit">${esc(s.credit)}</div>` : "";
  switch (s.t) {
    case "A-cover": if (s.photo && s.credit) credit = `<div class="credit pcredit">${esc(s.credit)}</div>`;
      return `${s.photo ? `<div class="photo" style="background-image:url('${img(s.photo)}')"></div><div class="fade"></div>` : ""}${WM}
      <div class="cov${s.photo ? "" : " mid"}"><span class="tag">${esc(s.tag)}</span><h1>${hl(s.line1)}</h1>${s.line2 ? `<h2>${hl(s.line2)}</h2>` : ""}${s.meta ? `<div class="meta">${esc(s.meta)}</div>` : ""}</div>${credit}${foot(s.footLeft || "Swipe →")}`;
    case "A-number": return `${WM}<div class="q">${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ""}</div><div class="num">${hl(s.number)}</div>
      <div class="lbl" style="text-align:center;margin-top:14px">${esc(s.label)}</div><div class="box" style="top:720px;text-align:center"><div class="h">${hl(s.headline)}</div>${s.body ? `<p class="body">${hl(s.body)}</p>` : ""}</div>${foot()}`;
    case "A-table": return `${WM}<div class="box mid"><div class="lbl">${esc(s.label)}</div><div class="h">${hl(s.headline)}</div>
      <table class="${s.tight ? "tight" : ""}"><tr>${s.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${s.rows.map((r, k) => `<tr class="${k === s.hl ? "on" : ""}">${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>
      ${s.note ? `<p class="note">${hl(s.note)}</p>` : ""}${s.body ? `<p class="body">${hl(s.body)}</p>` : ""}</div>${foot()}`;
    case "A-list": return `${WM}<div class="box mid"><div class="lbl">${esc(s.label)}</div><div class="h">${hl(s.headline)}</div>
      <ul class="list">${s.items.map((x) => `<li>${hl(x)}</li>`).join("")}</ul>${s.body ? `<p class="body">${hl(s.body)}</p>` : ""}</div>${foot()}`;
    case "A-text": return `${WM}<div class="box mid"><div class="lbl">${esc(s.label)}</div><div class="h">${hl(s.headline)}</div><p class="body">${hl(s.body)}</p></div>${foot()}`;
    case "A-wyr": { const side = (x) => `<div class="w"><div class="pic" style="background-image:url('${img(x.photo)}')"></div><p>${esc(x.brand)}<span>${esc(x.model)}</span>${x.price ? `<em>${esc(x.price)}</em>` : ""}</p></div>`;
      return `${WM}<div class="q"><span class="tag">${esc(s.tag || "WOULD YOU RATHER")}</span></div><div class="duo">${side(s.left)}<div class="or">or</div>${side(s.right)}</div>${credit}${foot(s.prompt || "Vote in the comments")}`; }
    case "A-pick3": return `${WM}<div class="box" style="top:150px;text-align:center"><div class="lbl">${esc(s.label)}</div><div class="h" style="font-size:72px">${hl(s.headline)}</div></div>
      <div class="p3">${(s.options || []).slice(0, 3).map((o, k) => `<div class="o"><div class="pic" style="background-image:url('${img(o.photo)}')"><span class="let">${"ABC"[k]}</span></div><div class="b">${esc(o.brand)}</div><div class="m">${esc(o.model)}</div><div class="pr">${esc(o.price)}</div></div>`).join("")}</div>${credit}${foot(s.footLeft || "Pick one · comment below")}`;
    case "A-spotted": {
      // game/person shot zoomed toward the wrist, the real watch cut out in a gold medallion, a gold arrow to the wrist
      const w = s.wrist || { x: 50, y: 50 }, z = s.zoom || 1.12;
      return `<div class="sp2"><img id="g" src="${img(s.photo)}"></div><svg class="arw" id="arw" width="1080" height="900"></svg><div class="medal" id="medal"><img id="cut" src="${img(s.watch)}"></div>${WM}
      <div class="spotbox"><div class="lbl">${esc(s.label || "Spotted wearing")}</div><div class="h">${hl(s.headline)}</div>${s.body ? `<p class="body" style="margin-top:20px">${hl(s.body)}</p>` : ""}</div><div class="credit pcredit">${esc(s.credit || "")}</div>${foot()}
      <script>
      (function(){
        const W=1080,H=900,wx=${Number(w.x) / 100},wy=${Number(w.y) / 100},z=${Number(z)};
        const g=document.getElementById("g"), cut=document.getElementById("cut"), medal=document.getElementById("medal"), svg=document.getElementById("arw");
        function place(){
          const iw=g.naturalWidth, ih=g.naturalHeight, sc=Math.max(W/iw,H/ih)*z, dw=iw*sc, dh=ih*sc;
          const tx = wx<0.5 ? 0.33*W : 0.67*W, ty = wy*H;               // where the wrist should land
          let left = Math.min(0, Math.max(W-dw, tx - wx*dw)), top = Math.min(0, Math.max(H-dh, ty - wy*dh));
          g.style.width=dw+"px"; g.style.height=dh+"px"; g.style.left=left+"px"; g.style.top=top+"px";
          const px = left + wx*dw, py = top + wy*dh;                       // wrist on the slide
          const mx = px < W/2 ? W-48-165 : 48+165, my = py < H*0.5 ? 640 : 330;   // opposite side; below a high wrist, above a low one (keeps faces clear)
          medal.style.left=(mx-165)+"px"; medal.style.top=(my-165)+"px";
          const dx=px-mx, dy=py-my, d=Math.hypot(dx,dy), ux=dx/d, uy=dy/d, ring=70;
          const sx=mx+ux*182, sy=my+uy*182, ex=px-ux*(ring+16), ey=py-uy*(ring+16);
          const cx=(sx+ex)/2 - uy*90, cy=(sy+ey)/2 + ux*90 - 40;
          svg.innerHTML='<defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#C8A96A"/></marker><filter id="gl"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#000" flood-opacity=".85"/></filter></defs>'+
            '<circle cx="'+px+'" cy="'+py+'" r="'+ring+'" fill="none" stroke="#C8A96A" stroke-width="6" filter="url(#gl)"/>'+
            '<circle cx="'+px+'" cy="'+py+'" r="'+(ring+12)+'" fill="none" stroke="rgba(200,169,106,.45)" stroke-width="2"/>'+
            '<path d="M'+sx+','+sy+' Q'+cx+','+cy+' '+ex+','+ey+'" fill="none" stroke="#C8A96A" stroke-width="7" stroke-linecap="round" marker-end="url(#ah)" filter="url(#gl)"/>';
        }
        function cutout(){                                                  // remove a plain white/light studio background
          try{
            const c=document.createElement("canvas"), w=c.width=cut.naturalWidth, h=c.height=cut.naturalHeight, x=c.getContext("2d");
            x.drawImage(cut,0,0); const im=x.getImageData(0,0,w,h), a=im.data;
            if (a[3] < 250) return;                                         // already transparent
            const light=(i)=>a[i]>228&&a[i+1]>228&&a[i+2]>228&&Math.max(a[i],a[i+1],a[i+2])-Math.min(a[i],a[i+1],a[i+2])<22;
            const seen=new Uint8Array(w*h), st=[];
            for(let i=0;i<w;i++){st.push(i,(h-1)*w+i)} for(let j=0;j<h;j++){st.push(j*w,j*w+w-1)}
            while(st.length){const p=st.pop(); if(seen[p])continue; seen[p]=1; const i=p*4; if(!light(i))continue; a[i+3]=0;
              const px2=p%w, py2=(p/w)|0; if(px2>0)st.push(p-1); if(px2<w-1)st.push(p+1); if(py2>0)st.push(p-w); if(py2<h-1)st.push(p+w);}
            x.putImageData(im,0,0); cut.src=c.toDataURL("image/png");
          }catch(e){}
        }
        let n=0; const go=()=>{ if(++n<2) return; place(); cutout(); };
        [g,cut].forEach(i=>{ if(i.complete) go(); else i.onload=go; });
      })();
      </script>`; }
    case "A-photo": return `<div class="hero${s.fit === "cover" ? " cover" : ""}" style="background-image:url('${img(s.photo)}')"></div>${WM}<div class="heroband"><div class="lbl">${esc(s.label)}</div><div class="h">${hl(s.headline)}</div>${s.body ? `<p class="body">${hl(s.body)}</p>` : ""}</div>${s.credit ? `<div class="credit pcredit">${esc(s.credit)}</div>` : ""}${foot()}`;
    case "A-photo-old": return `${WM}<div class="box"><div class="lbl">${esc(s.label)}</div><div class="h">${hl(s.headline)}</div><div class="single" style="background-image:url('${img(s.photo)}')"></div>${s.body ? `<p class="body" style="margin-top:28px">${hl(s.body)}</p>` : ""}</div>${credit}${foot()}`;
    case "D-cover": return `${s.photo ? `<div class="bg" style="background-image:url('${img(s.photo)}')"></div><div class="ov"></div>` : ""}<div class="mono">WW</div>${s.tag ? `<div class="dtag"><span class="tag">${esc(s.tag)}</span></div>` : ""}
      <h1 class="dh">${hl(s.headline)}</h1><div class="arr">→</div><div class="wmd">THE WATCH WIRE</div>${s.credit ? `<div class="credit pcredit" style="top:150px">${esc(s.credit)}</div>` : ""}`;
    case "D-body": return `${s.photo ? `<div class="bg" style="background-image:url('${img(s.photo)}')"></div><div class="ov" style="background:rgba(11,11,12,.86)"></div>` : ""}<div class="mono">WW</div>
      <div class="dmid"><div class="kick">${esc(s.kicker)}</div><p class="dp">${hl(s.text)}</p></div><div class="wmd">THE WATCH WIRE</div>${s.credit ? `<div class="credit pcredit" style="top:150px">${esc(s.credit)}</div>` : ""}`;
    case "cta": return `<div class="mono">WW</div><div class="cta"><h1>${hl(s.line1 || "Watch news.")}<br><span class="hl">${esc(s.line2 || "Every day.")}</span></h1>
      <p>${hl(s.body || "Releases, auctions, market moves and the stories behind the world's best watches.")}</p><div class="btn">FOLLOW @WATCHWIRECO</div></div><div class="wmd">THE WATCH WIRE</div>`;
    default: throw new Error(`slide ${i + 1}: unknown template "${s.t}"`);
  }
}

slides.forEach((s, i) => {
  const n = String(i + 1).padStart(2, "0");
  const html = path.join(outDir, "html", `slide-${n}.html`);
  fs.writeFileSync(html, `${HEAD}<div class="s">${render(s, i)}</div></body></html>`);
  const png = path.resolve(outDir, `slide-${n}.png`);
  const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--allow-file-access-from-files", "--window-size=1080,1350", "--virtual-time-budget=5000", `--screenshot=${png}`, "file://" + path.resolve(html)], { encoding: "utf8" });
  if (!fs.existsSync(png)) throw new Error(`render failed for slide ${n}: ${r.stderr}`);
  console.log(png);
});
