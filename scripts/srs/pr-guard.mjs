#!/usr/bin/env node
/**
 * حارسُ طلب الدمج: الوثيقة لا تتأخر عن البرنامج (قرار المالك 2026-11-08).
 *
 * طلبُ دمجٍ يغيّر ملفاً من كود البرنامج (ما تراقبه الوثيقة: الخادم والواجهة والصفحات العامة
 * وأدوات التشغيل) يجب أن يغيّر شيئاً تحت docs/srs/ أيضاً — متطلبَ الميزة التي تغيّرت —
 * أو أن يصرّح في عنوانه أو وصفه بأن التغيير لا يمسّ ما تصفه الوثيقة، بعبارة:
 *     [srs: بلا تغيير]   أو   [srs: no change]
 * مع سببٍ بعدها في الوصف (إصلاح داخلي، أداء، اختبار…). التصريحُ قرارٌ مقصود لا ثغرة: يُقرأ في المراجعة.
 *
 * يعمل في CI على حدث pull_request وحده: يقارن رأس الدمج بأساس الطلب (pull_request.base.sha).
 * محلياً: node scripts/srs/pr-guard.mjs <base-sha> يقارن الشجرة الحالية بالأساس المعطى.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { globToRegExp } from "./lib/common.mjs";
import { WATCHED, UNWATCHED } from "./lib/facts.mjs";

const event = process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)
  ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : null;
const pr = event?.pull_request;
const base = process.argv[2] || pr?.base?.sha;
if (!base) { console.log("حارس الطلب: لا أساس للمقارنة (ليس طلب دمج) — لا شيء يُفحص."); process.exit(0); }

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const head = process.argv[3] || "HEAD";
const changed = git("diff", "--name-only", base, head).split("\n").filter(Boolean);
const watched = WATCHED.map(globToRegExp);
/* أداةُ الوثيقة نفسها ليست «البرنامج»: تغييرها يُفحص بفحوص الوثيقة لا بهذا الحارس. */
const product = changed.filter(f => watched.some(r => r.test(f)) && !UNWATCHED.some(r => r.test(f)) && !f.startsWith("scripts/srs/"));
/* ما يولّده الأمر نفسه (لقطة المسارات ولقطة اللائحة وملفا PDF وبصمة الوصول) لا يُعدّ كتابةً للوثيقة:
   مساران جديد يحرّك اللقطة وحدها دون أن يُكتب متطلبه، وهذا بالضبط ما يجب أن يُوقَف (طلب #434). */
const GENERATED = [/^docs\/srs\/endpoints\.snapshot\.json$/, /^docs\/srs\/regulation\.snapshot\.json$/, /^docs\/srs\/pdf\//, /^docs\/srs\/access\.sha256$/];
const docs = changed.filter(f => f.startsWith("docs/srs/") && !GENERATED.some(r => r.test(f)));
const declared = /\[srs:\s*(بلا تغيير|no change)\s*\]/i.test(`${pr?.title || ""}\n${pr?.body || ""}`);

if (!product.length) { console.log("✓ حارس الطلب: لا تغيير في كود البرنامج."); process.exit(0); }
if (docs.length) { console.log(`✓ حارس الطلب: ${product.length} ملف من البرنامج تغيّر، والوثيقة تغيّرت معه (${docs.length} ملف).`); process.exit(0); }
if (declared) { console.log(`✓ حارس الطلب: ${product.length} ملف من البرنامج تغيّر، والطلب يصرّح أنه لا يمسّ ما تصفه الوثيقة.`); process.exit(0); }

console.error(`✗ حارس الطلب: تغيّر كود البرنامج ولم تتغيّر الوثيقة.
  الملفات: ${product.slice(0, 12).join("، ")}${product.length > 12 ? ` (+${product.length - 12})` : ""}
  إمّا أن تحدّث متطلب الميزة في docs/srs/modules (ثم npm run srs:pdf)،
  أو، إن لم يتغيّر شيءٌ مما تصفه الوثيقة، اكتب في عنوان الطلب أو وصفه: [srs: بلا تغيير] مع السبب.`);
process.exit(1);
