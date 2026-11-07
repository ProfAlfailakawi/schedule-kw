#!/usr/bin/env node
/**
 * يولّد SRS-ar.pdf وSRS-en.pdf في docs/srs/pdf/ من مصدر الوثيقة نفسه.
 * يحتاج متصفح Chromium وحزمة playwright (أداةٌ محلية، لا تدخل في بناء الإنتاج) وpdftotext وpython3+pypdf.
 *   node scripts/srs/pdf.mjs [ar|en]
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { ROOT, SRS_DIR } from "./lib/common.mjs";
import { buildAll, PDF_DIR } from "./build.mjs";
import { renderPrint } from "./lib/render-print.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const fontsUrl = `file://${ROOT}/public/fonts/`;
const langs = process.argv.slice(2).filter(a => a === "ar" || a === "en");
const todo = langs.length ? langs : ["ar", "en"];

/** أرقام الصفحات من وجهات الروابط داخل الملف نفسه: دقيقةٌ في العربية والإنجليزية، ولا نصَّ مخفياً في الملف. */
function pageDests(pdf) {
  const code = "import sys,json,pypdf\nr=pypdf.PdfReader(sys.argv[1])\nidx={p.indirect_reference.idnum:i+1 for i,p in enumerate(r.pages)}\nout={}\nfor k,v in r.named_destinations.items():\n  try: out[str(k).lstrip('/')]=idx[v.page.idnum]\n  except Exception: pass\nprint(json.dumps(out))";
  const r = spawnSync("python3", ["-c", code, pdf], { encoding: "utf8", maxBuffer: 1 << 26 });
  const dests = JSON.parse(r.stdout || "{}"), found = {};
  for (const [k, p] of Object.entries(dests)) {
    let m;
    if ((m = /^sec-(.+)$/.exec(k))) found[m[1]] = p;
    else if ((m = /^sub-([A-Z]{3})-(\d+)$/.exec(k))) found[`S${m[1]}${m[2]}`] = p;
  }
  return found;
}
const pageCount = pdf => Number(spawnSync("python3", ["-c", "import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))", pdf], { encoding: "utf8" }).stdout.trim());

async function render(browser, html, out, { footer }) {
  const tmp = path.join(os.tmpdir(), `srs-${crypto.randomBytes(4).toString("hex")}.html`);
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.goto(`file://${tmp}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  const opts = { path: out, format: "A4", printBackground: true, preferCSSPageSize: false };
  if (footer) {
    Object.assign(opts, {
      displayHeaderFooter: true, margin: { top: "18mm", bottom: "16mm", left: "16mm", right: "16mm" },
      headerTemplate: `<div style="width:100%;font:7.5px Helvetica,Arial,sans-serif;color:#7a8580;padding:0 16mm;display:flex;justify-content:space-between;direction:ltr"><span>SCHEDULE · SRS</span><span>v${footer.version} · ${footer.date}</span></div>`,
      footerTemplate: `<div style="width:100%;font:8px Helvetica,Arial,sans-serif;color:#5f6b67;text-align:center;direction:ltr"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
  } else Object.assign(opts, { margin: { top: 0, bottom: 0, left: 0, right: 0 }, pageRanges: "1" });
  await page.pdf(opts);
  await page.close();
  fs.rmSync(tmp, { force: true });
}

const { model } = buildAll();
fs.mkdirSync(PDF_DIR, { recursive: true });
const browser = await chromium.launch();
const manifestPath = path.join(PDF_DIR, "manifest.json");
const manifest = fs.existsSync(manifestPath) && JSON.parse(fs.readFileSync(manifestPath, "utf8")).hash === model.hash ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { files: {} };
const work = fs.mkdtempSync(path.join(os.tmpdir(), "srs-pdf-"));
for (const lang of todo) {
  const bodyPdf = path.join(work, `body-${lang}.pdf`), coverPdf = path.join(work, `cover-${lang}.pdf`);
  let pages = {};
  let r = renderPrint(model, lang, { pages, fontsUrl });
  for (let pass = 0; pass < 3; pass++) {
    await render(browser, r.body, bodyPdf, { footer: { version: model.meta.version, date: model.meta.releaseDate } });
    const found = pageDests(bodyPdf);
    const same = JSON.stringify(found) === JSON.stringify(pages);
    pages = found;
    if (same) break;
    r = renderPrint(model, lang, { pages, fontsUrl });
  }
  await render(browser, r.cover, coverPdf, { footer: null });
  const outline = r.outline.filter(i => pages[i.mk]).map(i => ({ title: `${i.n ? i.n + "  " : ""}${i.title}`, page: pages[i.mk] - 1 + 1, lvl: i.lvl }));
  const out = path.join(PDF_DIR, `SRS-${lang}.pdf`);
  const meta = { Title: `${model.meta.system[lang]} — ${model.meta.document[lang]}`, Author: model.meta.authors.map(a => a[lang]).join(", "), Subject: `${model.meta.document[lang]} v${model.meta.version}`, Keywords: "SRS, ISO/IEC/IEEE 29148, SCHEDULE" };
  const py = `
import sys, json, pypdf
from pypdf.generic import ArrayObject, NameObject, FloatObject, NullObject
cover, body, out, meta, outline = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4]), json.loads(sys.argv[5])
bodyr = pypdf.PdfReader(body)
w = pypdf.PdfWriter()
for p in pypdf.PdfReader(cover).pages: w.add_page(p)
off = len(w.pages)
idx = {}
for i, p in enumerate(bodyr.pages):
    idx[p.indirect_reference.idnum] = i
    w.add_page(p)
nd = {}
for k, v in bodyr.named_destinations.items():
    nd[str(k).lstrip("/")] = v
fixed = broken = 0
for page in list(w.pages)[off:]:
    for a in page.get("/Annots") or []:
        a = a.get_object()
        if a.get("/Subtype") != "/Link" or "/Dest" not in a: continue
        name = str(a["/Dest"]).lstrip("/")
        d = nd.get(name)
        if d is None or d.page is None or d.page.idnum not in idx: broken += 1; continue
        target = w.pages[off + idx[d.page.idnum]]
        left = FloatObject(d.left if d.left is not None else 0)
        top = FloatObject(d.top if d.top is not None else float(target.mediabox.top))
        a[NameObject("/Dest")] = ArrayObject([target.indirect_reference, NameObject("/XYZ"), left, top, NullObject()])
        fixed += 1
w.add_outline_item(meta["Title"], 0)
last = {}
for it in outline:
    lvl = it["lvl"]
    parent = last.get(lvl - 1) if lvl > 1 else None
    item = w.add_outline_item(it["title"], off + it["page"] - 1, parent=parent)
    last[lvl] = item
w.add_metadata({"/Title": meta["Title"], "/Author": meta["Author"], "/Subject": meta["Subject"], "/Keywords": meta["Keywords"], "/Creator": "", "/Producer": ""})
w.page_mode = "/UseOutlines"
with open(out, "wb") as f: w.write(f)
print("links", fixed, "unresolved", broken)
`;
  const res = spawnSync("python3", ["-c", py, coverPdf, bodyPdf, out, JSON.stringify(meta), JSON.stringify(outline)], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr);
  console.log(`  روابط داخلية: ${res.stdout.trim()}`);
  const bytes = fs.readFileSync(out);
  manifest.files[`SRS-${lang}.pdf`] = { sha256: crypto.createHash("sha256").update(bytes).digest("hex"), pages: pageCount(out), bytes: bytes.length };
  console.log(`✓ SRS-${lang}.pdf: ${manifest.files[`SRS-${lang}.pdf`].pages} صفحة، ${(bytes.length / 1048576).toFixed(1)} MB`);
}
await browser.close();
fs.writeFileSync(manifestPath, JSON.stringify({ hash: model.hash, version: model.meta.version, date: model.meta.releaseDate, files: manifest.files }, null, 2) + "\n");
fs.rmSync(work, { recursive: true, force: true });
