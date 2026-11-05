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
check(/notedScopeBreach\(resolved\.request\.notedRowIds, Array\.isArray/.test(routes), "الخادم يحرس الإرسال");
check(/onlyNoted/.test(read("src/server/routes/instructorRequestsRoutes.ts")), "الإصدار يقبل ما عليه ملاحظات");

/* الملاحظة لا تصل الأستاذ: قد تذكر قاعة */
const page = read("src/server/pages/instructorRequestPage.ts");
check(!/\.text/.test(page.split("function notedScope")[1].split("function paint")[0]), "لا نصّ ملاحظة في البطاقة");
const noted = read("src/server/routes/instructorRequestsRoutes.ts").split('"/api/instructor-requests/registrar-noted"')[1].split("app.get(")[0];
check(!/AdRoom|roomId|Hall/.test(noted), "لا قاعة في قائمة الملاحظات");

console.log(failed ? `فشل ${failed}` : "نجحت الفحوص");
process.exit(failed ? 1 : 0);
