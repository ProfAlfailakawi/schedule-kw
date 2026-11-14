/**
 * ── اختيارُ القيمة الحالية لا يُطلق onChange (تدقيق 2026-11-14 البند 4) ─────────────────────
 * المحرر يعدّ كل onChange من قائمة المقرر مقرراً جديداً فيصفّر الشعبة والأيام والنهاية. المكوّن بلا DOM هنا، فيُفحَص قراره الخالص
 * (selectionChanges) ومسارا choose والاختيار الوحيد في المصدر.
 */
import fs from "node:fs";
import { selectionChanges } from "../src/components/SearchableSelect";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};
check(!selectionChanges(5, 5) && !selectionChanges("5", 5) && !selectionChanges(5, "5") && !selectionChanges("", "") && !selectionChanges(undefined, ""), "S1 القيمة نفسها (نصّاً أو رقماً): لا تغيير");
check(selectionChanges(5, 6) && selectionChanges("", 3) && selectionChanges(0, 3) && selectionChanges(3, ""), "S2 قيمةٌ مختلفة: تغيير");
const src = fs.readFileSync("src/components/SearchableSelect.tsx", "utf8");
check(/const choose = \(option: SelectOption\) => \{ if \(selectionChanges\(value, option\.value\)\) onChange\(option\.value\); close\(\); \}/.test(src), "S3 choose لا يُطلق onChange للقيمة الحالية ويُغلق القائمة");
check((src.match(/onChange\(/g) || []).length === 2, "S4 مساران فقط يستدعيان onChange (choose والاختيار الوحيد)", (src.match(/onChange\(/g) || []).length);
const effect = src.slice(src.indexOf("const autoKey"), src.indexOf("const shown"));
check(/autoKey\.current === key\) return/.test(effect) && /selectionChanges\(value, single\.value\)/.test(effect), "S5 الاختيار الوحيد idempotent: الزوجُ نفسه يُعلن مرةً وبلا إعلانٍ إن كانت القيمة هي الوحيدة", effect);
console.log(`\nsearchable-select-change audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
