/**
 * ── عزل الديمو عن قاعدة البيانات الحقيقية ─────────────────────────────────────
 *
 * زائرُ الديمو يعدّل في صندوقه وحده. لكنّ «markRegistrationRunsStale» كان يكتب
 * في Firestore مباشرةً متى وُجد، فأيُّ تعديلٍ تجريبيٍّ (صحيفة، موعد، قاعة) كان
 * يُعلِّم تشغيلاتِ رادار التسجيل الحقيقية «قديمة».
 *
 * وما يحرسه هذا الملفّ:
 *   ١) دالةُ التعليم لا تلمس Firestore داخل صندوق الديمو.
 *   ٢) لا فرعَ في المستودع يكتب في Firestore بشرط «firestoreDb» وحده.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(ok: boolean, label: string) {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
}

const source = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");

const start = source.indexOf("async function markRegistrationRunsStale(");
const body = start >= 0 ? source.slice(start, source.indexOf("\n}\n", start)) : "";
check(Boolean(body), "دالةُ تعليم الرادار موجودة");
check(body.includes("if (firestoreDb && !demoSandboxContext.getStore())"),
  "١ تعليمُ الرادار «قديماً» لا يصل Firestore من داخل صندوق الديمو");

const bare = source.split("\n")
  .map((line, index) => ({ line, at: index + 1 }))
  .filter(({ line }) => /\bif\s*\(\s*firestoreDb\s*\)/.test(line));
check(bare.length === 0,
  `٢ لا فرعَ يكتب في Firestore بشرط «firestoreDb» وحده${bare.length ? ` (السطر ${bare.map(item => item.at).join("، ")})` : ""}`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
