/**
 * ورقةُ طباعة الجدول لا تُركَّب في الصفحة إلا للطباعة (usePrintMounted)، وبقيت ترويستُها تذكر التصفية.
 * فحصٌ مصدريّ؛ التحقق الحيّ (وسائط print في Chromium: 0 سطر على الشاشة، «تصفية: «تصوير» (4 من 47)» عند الطباعة) في تقرير W7b.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const hook = fs.readFileSync("src/utils/usePrintMounted.ts", "utf8");
const screen = fs.readFileSync("src/components/Schedules.tsx", "utf8");
let passed = 0;
const ok = (value: unknown, label: string) => { assert.ok(value, label); passed += 1; console.log(`  ok  ${label}`); };

ok(/addEventListener\("beforeprint"/.test(hook) && /addEventListener\("afterprint"/.test(hook), "الخطّاف يسمع beforeprint وafterprint");
ok(/matchMedia\("print"\)/.test(hook), "ويسمع وسائط print (PDF/معاينة بلا الحدث)");
ok(/flushSync/.test(hook), "التركيب متزامن قبل رسم الصفحة");
ok(/\{!reviewOpen && printSheetMounted \? \(\s*<PrintPortal>\s*<div className="schedule-print /.test(screen), "ورقةُ الجدول مشروطةٌ بـ printSheetMounted");
ok(/usePrintMounted\(\)/.test(screen), "الشاشة تستدعي الخطّاف");
ok(/تصفية: «\$\{quickSearch\.trim\(\)\}» \(\$\{schedulePrintRows\.length\} من \$\{rows\.length\}\)/.test(screen), "ترويسة الطباعة تذكر التصفية النشطة وعددَها");
console.log(`print-lazy-sheet-audit: ${passed} passed`);
