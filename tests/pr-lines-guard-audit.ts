/**
 * حارس الأسطر المضافة (قرار المالك 2026-11-09): يرفض العبارات المحجوزة في ما يضيفه الطلب وحده.
 * العينات تُركَّب من أجزاء كي لا يحمل هذا الملف ما يحرسه.
 */
import fs from "node:fs";
import { scanDiffText, isSkipped, ruleApplies } from "../scripts/ci/pr-lines-guard.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name}`); } };

const diff = (file: string, ...lines: string[]) =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => "+" + l).join("\n")}\n`;
const tool = ["cl", "aude"].join("");
const short = ["A", "I"].join("");
const owner = ["Prof", "Alfailakawi"].join("");

check(scanDiffText(diff("src/a.ts", `// built with ${tool}`)).length === 1, "L1 اسم محجوز في سطر مضاف يُرفض");
check(scanDiffText(diff("src/a.ts", `// ${short} generated`)).length === 1, "L2 الاختصار المحجوز يُرفض");
check(scanDiffText(diff("src/a.ts", "// Gemini reads the file")).length === 0, "L3 اسم Gemini مسموح");
check(scanDiffText(diff("src/a.ts", `// ${tool} ok lines-guard: allow reviewed reason`)).length === 0, "L4 الاستثناء بسبب مكتوب يمرّ");
check(scanDiffText(diff("src/a.ts", `// ${tool} ok lines-guard: allow`)).length === 1, "L5 الاستثناء بلا سبب يُرفض");
check(scanDiffText(diff(".github/workflows/x.yml", `repo: ${owner}/x`)).length === 0, "L6 معرّف المالك مسموح في ملفات النشر");
check(scanDiffText(diff("src/a.ts", `repo: ${owner}/x`)).length === 1, "L7 معرّف المالك مرفوض في الكود");
check(isSkipped("docs/srs/pdf/SRS-ar.pdf") && isSkipped("package-lock.json"), "L8 الثنائي والمولَّد لا يُفحص");
check(ruleApplies({ id: "owner-ids" } as never, "scripts/srs/x.mjs") === false, "L9 قاعدة المعرّفات معطّلة في أدوات الوثيقة");
const hunk = scanDiffText(diff("src/a.ts", "ok", `// ${tool}`));
check(hunk.length === 1 && hunk[0].line === 2, "L10 رقم السطر صحيح");
check(/pr-lines-guard\.mjs HEAD\^1/.test(fs.readFileSync(".github/workflows/ci.yml", "utf8")), "L11 الحارس يعمل في CI على كل طلب");

console.log(`\npr lines guard audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
