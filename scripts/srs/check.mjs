#!/usr/bin/env node
/**
 * حارسُ وثيقة المتطلبات (يشغّله CI ضمن npm test): الوثيقة لا تتأخر عن النظام.
 *  ١) الوحدات صالحة (بنية، ثنائية لغة، مراجع كود واختبارات موجودة، لا عبارة ممنوعة).
 *  ٢) كل ملف برمجي مراقَب تدّعيه وحدةٌ ما (ملفٌ جديد بلا وحدة يوقف الدمج).
 *  ٣) لقطة مسارات الخادم مطابقة (مسارٌ مضاف أو محذوف يوقف الدمج حتى تُحدَّث اللقطة ويُكتب متطلبه).
 *  ٤) أيقونات الوثيقة موجودة في lucide، والناتج النهائي بلا عبارة ممنوعة.
 *  ٥) ملفا PDF موجودان ويطابقان manifest.json (لا يُعبَث بهما)، وليسا أقدم من المحتوى المكتوب:
 *     زرُّ PDF في الصفحة يفتحهما، فتغييرُ الوثيقة يجدّدهما في التغيير نفسه (npm run srs:pdf) وإلا وقف الدمج.
 *  ٦) وفي طلبات الدمج: تغييرُ كود البرنامج يمسّ الوثيقة أيضاً، أو يصرّح أنه لا يغيّر ما تصفه (scripts/srs/pr-guard.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, SRS_DIR, loadClaims, trackedFiles, globToRegExp } from "./lib/common.mjs";
import { buildAll, PDF_DIR } from "./build.mjs";
import { endpointSnapshot } from "./lib/facts.mjs";
import { missingIcons } from "./lib/icons.mjs";

const problems = [];
let model, warnings = [];
try { ({ model, warnings } = buildAll()); } catch (e) { problems.push(`البناء: ${e.message}`); }

if (model) {
  const ids = new Set(model.modules.map(m => m.id)), tracked = trackedFiles();
  for (const [id, pats] of Object.entries(loadClaims())) {
    if (!ids.has(id)) problems.push(`claims.json: وحدة غير موجودة ${id}`);
    for (const pat of pats) if (!tracked.some(f => globToRegExp(pat).test(f))) problems.push(`claims.json: النمط لا يطابق ملفاً: ${pat}`);
  }
  const un = model.facts.unclaimed;
  if (un.length) problems.push(`${un.length} ملفاً برمجياً بلا وحدة تدّعيه في docs/srs/modules/*.json (sources). أضفه إلى وحدته أو أنشئ متطلباً:\n    ${un.slice(0, 40).join("\n    ")}${un.length > 40 ? `\n    … و${un.length - 40} أخرى` : ""}`);

  const snapFile = path.join(SRS_DIR, "endpoints.snapshot.json");
  const live = endpointSnapshot(model.facts.endpoints).endpoints;
  if (!fs.existsSync(snapFile)) problems.push("لا docs/srs/endpoints.snapshot.json — شغّل npm run srs:sync");
  else {
    const snap = JSON.parse(fs.readFileSync(snapFile, "utf8")).endpoints;
    const count = arr => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
    const a = count(live), b = count(snap), added = [], removed = [];
    for (const [k, n] of a) if ((b.get(k) || 0) < n) added.push(k);
    for (const [k, n] of b) if ((a.get(k) || 0) < n) removed.push(k);
    if (added.length || removed.length) problems.push(`مسارات الخادم تغيّرت عن لقطة الوثيقة.\n    مضافة: ${added.join("، ") || "—"}\n    محذوفة: ${removed.join("، ") || "—"}\n    اكتب/عدّل متطلب الميزة في docs/srs/modules ثم شغّل npm run srs:sync`);
  }
  if (missingIcons().length) problems.push(`أيقونات غير موجودة في lucide: ${missingIcons().join(", ")}`);

  const manifestFile = path.join(PDF_DIR, "manifest.json");
  if (!fs.existsSync(manifestFile)) problems.push("لا docs/srs/pdf/manifest.json — شغّل npm run srs:pdf");
  else {
    const mf = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    /* زرُّ PDF في الصفحة يفتح هذين الملفين، فلا يُدمج تغييرٌ في الوثيقة ما لم يُجدَّدا معه (قرار المالك 2026-11-08). */
    if (mf.hash !== model.hash) problems.push(`ملفا PDF أقدم من المحتوى المكتوب (${mf.hash} ← ${model.hash}، إصدار ${mf.version}). زر PDF يفتحهما، فجدّدهما في التغيير نفسه: npm run srs:pdf`);
    for (const l of ["ar", "en"]) {
      const f = path.join(PDF_DIR, `SRS-${l}.pdf`);
      if (!fs.existsSync(f)) { problems.push(`ناقص: docs/srs/pdf/SRS-${l}.pdf`); continue; }
      const sha = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
      if (mf.files?.[`SRS-${l}.pdf`]?.sha256 !== sha) problems.push(`SRS-${l}.pdf لا يطابق manifest.json (عُدّل يدوياً؟). شغّل npm run srs:pdf`);
    }
  }
  const acc = path.join(SRS_DIR, "access.sha256");
  if (!fs.existsSync(acc) || !/^[0-9a-f]{64}$/.test(fs.readFileSync(acc, "utf8").trim())) problems.push("docs/srs/access.sha256 ناقص أو غير صالح (بصمة SHA-256 للمفتاح).");
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (problems.length) {
  console.error("✗ فحص وثيقة المتطلبات:\n" + problems.map(p => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ وثيقة المتطلبات: ${model.stats.modules} وحدة، ${model.stats.requirements} متطلباً، ${model.facts.totals.watchedFiles} ملفاً مغطّى بالكامل، ${model.facts.totals.endpoints} مسار مطابق للقطة، وPDF لقطة سليمة (${model.hash}).`);
