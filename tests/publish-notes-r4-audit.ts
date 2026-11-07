/**
 * ── ملاحظات المالك 2026-11-05: 6 (سهم التخطيط) و7 (النشر فيما عليه ملاحظات) ──
 */
import fs from "fs";
import { coursePlanHint, notedRowsOf, notedScopeBreach } from "../src/utils/requestNotedScope";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");

/* 6 */
check(coursePlanHint(undefined, 2) === null, "بلا تخطيط لا تنبيه");
check(coursePlanHint(3, 1)?.kind === "open", "دون المخطط: يُفتح");
check(coursePlanHint(2, 2)?.kind === "over", "بلغ العدد: تجاوز");
check(coursePlanHint(0, 0)?.kind === "over", "صفر في التخطيط: تجاوز");
const routes = read("src/server/routes/publicRequestRoutes.ts");
check(!/planHint[^\n]*res\.status\(4/.test(routes), "تنبيه لا يمنع");

/* 7 */
check(JSON.stringify(notedRowsOf([
  { origin: "registrar", resolved: false, scheduleId: 5 },
  { origin: "registrar", resolved: true, scheduleId: 6 },
  { origin: "department", resolved: false, scheduleId: 7 },
  { origin: "registrar", resolved: false, scheduleId: 5 },
])) === "[5]", "ملاحظات التسجيل المفتوحة وحدها");
check(notedScopeBreach(undefined, [{ action: "change", rowId: 1 }]) === -1, "البطاقة العادية لا تُقفل");
check(notedScopeBreach([5], [{ action: "keep", rowId: 1 }, { action: "change", rowId: 5 }]) === -1, "تعديل المميّز مسموح");
check(notedScopeBreach([5], [{ action: "change", rowId: 1 }]) === 0, "تعديل غيره مرفوض");
check(notedScopeBreach([5], [{ action: "keep", rowId: 5 }, { action: "add" }]) === 1, "الإضافة مرفوضة");
const stored = [
  { itemId: "a", rowId: 1, action: "change", slots: [{ day: "fsunday", start: "09:00" }, { day: "ftuesday", start: "09:00" }] },
  { itemId: "b", action: "add", after: { courseId: 9 }, slots: [{ day: "fmonday", start: "10:00" }] },
  { rowId: 2, action: "delete" },
];
check(notedScopeBreach([5], [{ itemId: "a", rowId: 1, action: "change", days: ["ftuesday", "fsunday"], start: "09:00" }, { rowId: 2, action: "delete" }, { itemId: "b", action: "add", courseId: 9, days: ["fmonday"], start: "10:00" }], stored) === -1, "طلب سابق أُعيد كما هو لا يُرفض");
check(notedScopeBreach([5], [{ itemId: "a", rowId: 1, action: "change", days: ["fsunday"], start: "09:00" }], stored) === 0, "تعديل جديد على موعد مقفل مرفوض");
check(notedScopeBreach([5], [{ itemId: "b", action: "add", courseId: 8, days: ["fmonday"], start: "10:00" }], stored) === 0, "تبديل مقرر الإضافة مرفوض");
check(notedScopeBreach([5], [{ itemId: "a", rowId: 2, action: "change", days: ["fsunday", "ftuesday"], start: "09:00" }], stored) === 0, "معرّف بند قديم على موعد مقفل آخر مرفوض");
const issue = read("src/server/routes/instructorRequestsRoutes.ts");
check(/!reopening && !onlyNoted\)/.test(issue) && /\(onlyNoted \|\| individualOnly\) && move === "keep"/.test(issue), "الطلب المرسل يأخذ نافذة جديدة");
check(/notedScopeBreach\(resolved\.request\.notedRowIds, Array\.isArray/.test(routes), "الخادم يحرس الإرسال");
check(/onlyNoted/.test(read("src/server/routes/instructorRequestsRoutes.ts")), "الإصدار يقبل ما عليه ملاحظات");

/* الملاحظة لا تصل الأستاذ: قد تذكر قاعة */
const page = read("src/server/pages/instructorRequestPage.ts");
check(!/\.text/.test(page.split("function notedScope")[1].split("function paint")[0]), "لا نصّ ملاحظة في البطاقة");
const noted = read("src/server/routes/instructorRequestsRoutes.ts").split('"/api/instructor-requests/registrar-noted"')[1].split("app.get(")[0];
check(!/AdRoom|roomId|Hall/.test(noted), "لا قاعة في قائمة الملاحظات");

console.log(failed ? `فشل ${failed}` : "نجحت الفحوص");
process.exit(failed ? 1 : 0);
