#!/usr/bin/env node
/**
 * يبني الصفحة التفاعلية من docs/srs:
 *   node scripts/srs/build.mjs --out <مجلد>      # ملف index.html (+ ملفا PDF إن وُجدا)
 *   node scripts/srs/build.mjs --site            # إلى dist/srs-private/<بصمة المفتاح>/ (يستعمله npm run build)
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, SRS_DIR, forbiddenHits, GEMINI_ALLOWED_MODULES } from "./lib/common.mjs";
import { validateAll } from "./validate.mjs";
import { buildModel } from "./lib/model.mjs";
import { renderInteractive } from "./lib/render-interactive.mjs";
import { renderPrint } from "./lib/render-print.mjs";
import { missingIcons } from "./lib/icons.mjs";

export const PDF_DIR = path.join(SRS_DIR, "pdf");
export function pdfFiles() {
  const out = {};
  for (const l of ["ar", "en"]) if (fs.existsSync(path.join(PDF_DIR, `SRS-${l}.pdf`))) out[l] = `SRS-${l}.pdf`;
  return out;
}

export function pdfInfo(hash) {
  try {
    const mf = JSON.parse(fs.readFileSync(path.join(PDF_DIR, "manifest.json"), "utf8"));
    return { version: mf.version, date: mf.date, stale: mf.hash !== hash };
  } catch { return null; }
}

export function buildAll({ strict = true } = {}) {
  const { errors, warnings } = validateAll();
  if (errors.length && strict) { console.error(errors.map(e => `✗ ${e}`).join("\n")); throw new Error(`${errors.length} خطأ في وحدات الوثيقة`); }
  const model = buildModel();
  const html = renderInteractive(model, { pdfs: pdfFiles(), pdfInfo: pdfInfo(model.hash) });
  if (missingIcons().length) console.warn(`⚠ أيقونات غير موجودة في lucide: ${missingIcons().join(", ")}`);
  for (const c of model.glossaryConflicts) console.warn(`⚠ تعارض مصطلح: ${c}`);
  /* فحصٌ ثانٍ على الناتج النهائي: لا عبارة ممنوعة تمرّ إلى الصفحة. */
  const visible = html.replace(/<code[\s\S]*?<\/code>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg class="ic[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");
  const hits = forbiddenHits(visible, { allowGemini: true });
  if (/git\s?hub/i.test(html) && strict) throw new Error("ذكرٌ لمنصة الاستضافة في الناتج");
  if (hits.length && strict) throw new Error(`عبارة ممنوعة في الناتج: ${[...new Set(hits)].join("، ")}`);
  const live = {};
  for (const l of ["ar", "en"]) {
    live[l] = renderPrint(model, l, { live: true }).body;
    if (/git\s?hub/i.test(live[l]) && strict) throw new Error("ذكرٌ لمنصة الاستضافة في النسخة الحيّة");
    const shown = live[l].replace(/<code[\s\S]*?<\/code>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");
    const bad = forbiddenHits(shown, { allowGemini: true });
    if (bad.length && strict) throw new Error(`عبارة ممنوعة في النسخة الحيّة: ${[...new Set(bad)].join("، ")}`);
  }
  return { model, html, live, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let outDir = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : null;
  if (args.includes("--site")) {
    const hashFile = path.join(SRS_DIR, "access.sha256");
    if (!fs.existsSync(hashFile)) { console.log("— لا access.sha256: لا تُنشر صفحة الوثيقة."); process.exit(0); }
    const h = fs.readFileSync(hashFile, "utf8").trim();
    if (!/^[0-9a-f]{64}$/.test(h)) throw new Error("access.sha256 ليست بصمة SHA-256 صالحة");
    outDir = path.join(ROOT, "dist/srs-private", h);
  }
  if (!outDir) { console.error("حدّد --out <مجلد> أو --site"); process.exit(1); }
  const { model, html, live, warnings } = buildAll();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  for (const l of ["ar", "en"]) fs.writeFileSync(path.join(outDir, `print-${l}.html`), live[l]);
  for (const name of Object.values(pdfFiles())) fs.copyFileSync(path.join(PDF_DIR, name), path.join(outDir, name));
  console.log(`✓ الصفحة التفاعلية: ${model.stats.modules} وحدة، ${model.stats.requirements} متطلباً، ${(html.length / 1024).toFixed(0)} KB → ${path.relative(ROOT, outDir)}${warnings.length ? ` (${warnings.length} تنبيه)` : ""}`);
}
