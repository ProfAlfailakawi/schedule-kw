/**
 * ── عجلة المدة لا تعرض ما يُبطله إعادةُ الحساب (قرار المالك أ، تدقيق 2026-11-14 البند 5) ─────
 * يومٌ واحد لمقرر 3 ساعات ← 170 وحدها (قيمةٌ ثابتة بلا عجلة)؛ ثلاثة أيام ← 50؛ يومان ← 80.
 * تغييرُ بداية يومٍ منفرد يعيد الطول إلى الكتلة (يبقى). TimeWheels يعرض قيمةً ثابتة حين يصحّ طولٌ واحد.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeWheels } from "../src/components/TimeCounter";
import { completeSectionEnd, fixedWheelLength, wheelLengths } from "../src/utils/appointmentRegulation";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};
const three = { CourseHours: 3 };
const one = renderToStaticMarkup(<TimeWheels start="08:00" end="10:50" onChange={() => undefined} lengths={wheelLengths(three, ["fsunday"])} />);
check(/qc-wheel-fixed/.test(one) && />170</.test(one) && !/aria-label="المدة \(د\)"/.test(one), "T1 يومٌ واحد: «170» ثابتة بلا عجلة", one.slice(0, 500));
check((one.match(/role="listbox"/g) || []).length === 2, "T1 تبقى عجلتا الساعة والدقيقة وحدهما");
const multi = renderToStaticMarkup(<TimeWheels start="08:00" end="08:50" onChange={() => undefined} lengths={[50, 80]} />);
check(!/qc-wheel-fixed/.test(multi) && (multi.match(/role="listbox"/g) || []).length === 3, "T2 أكثر من طولٍ صحيح: عجلة");
const def = renderToStaticMarkup(<TimeWheels start="08:00" end="08:50" onChange={() => undefined} />);
check((def.match(/role="listbox"/g) || []).length === 3, "T3 بلا مكتبة: القائمة الافتراضية");
check(fixedWheelLength(three, ["fsunday"]) === 170 && fixedWheelLength(three, ["fsunday", "ftuesday", "fthursday"]) === 50 && fixedWheelLength(three, ["fmonday", "fwednesday"]) === 80 && fixedWheelLength(three, ["fsunday", "ftuesday"]) === 80, "T4 القيم الثابتة: 170 / 50 / 80 / 80");
check(fixedWheelLength({ CourseHours: 2 }, ["ftuesday", "fthursday"]) === 50 && fixedWheelLength({ CourseHours: 4 }, ["fmonday", "fwednesday"]) === 110, "T4 ساعتان 50 وأربع 110");
/* ما تعرضه العجلة لا يُبطَل: تغيير البداية يعيد الطول نفسه */
for (const hours of [1, 2, 3, 4, 5]) for (const day of ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const) {
  const lengths = wheelLengths({ CourseHours: hours }, [day]) || [];
  const endMinutes = 600 + (lengths[0] || 0);
  const expected = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  check(lengths.length === 1 && completeSectionEnd({ CourseHours: hours }, [day], "10:00") === expected, `T5 ${hours}س ${day}: ${lengths.join()} تبقى بعد تغيير البداية`, lengths);
}
console.log(`\nwheel-lengths audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
