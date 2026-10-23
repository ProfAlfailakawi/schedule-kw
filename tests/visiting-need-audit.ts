/** كم منتدباً نحتاج: شعبٌ بلا أستاذ ÷ ٢، مجموعٌ للقسم لا لكل بطاقة، وبلا أسماء. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { staffCourse, visitingNeed, visitorFreeSlots, type CourseStaffing } from "../src/utils/visitingNeed";
import { SectionGapPanel } from "../src/components/SectionGapNote";
import type { GapItem } from "../src/utils/sectionGap";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra)); }
};
const item = (id: number, existing: number, required: number): GapItem => ({ id, code: `C${id}`, name: `مقرر ${id}`, existing, required, extra: required - existing, basis: "plan", demand: 10 });
const staff = (p: Partial<CourseStaffing> = {}): CourseStaffing => ({ ours: 0, covered: 0, unassigned: 0, withVisitors: 0, returnable: 0, ...p });

/* مثال الصورة: زيادات ٢ و١ و١ ← ٤ شعب ← منتدبان (لا ثلاثة)، وكل بطاقةٍ وحدها ١. */
const three = [item(1, 5, 7), item(2, 2, 3), item(3, 1, 2)];
const total = visitingNeed(three, { 1: staff({ ours: 3, covered: 5 }) }, 0);
check(total.sections === 4 && total.visitors === 2 && total.rows.map(r => r.visitors).join() === "1,1,1", "٢+١+١ شعب ← منتدبان، والبطاقات ١ و١ و١", total);

/* شعبة «هيئة تدريسية» تُحسب على المنتدبين. */
check(visitingNeed([item(1, 5, 7)], { 1: staff({ unassigned: 1 }) }, 0).sections === 3, "الزيادة ٢ + شعبة بلا أستاذ = ٣");
/* منتدبٌ حاليّ بشعبة واحدة يسدّ مكاناً. */
check(visitorFreeSlots([1, 2, 0]) === 3 && visitingNeed(three, {}, 2).visitors === 1, "مكانان فارغان عند الحاليين ← منتدبٌ واحد");
check(visitingNeed(three, {}, 9).visitors === 0, "الحاليون يكفون ← صفر");
check(visitingNeed([], {}, 0).visitors === 0, "لا نقص ← صفر");
check(visitingNeed([item(1, 0, 2)], { 1: staff({ returnable: 3 }) }, 0).visitors === 1, "من درّسه سابقاً يُعرض ولا يُنقص المنتدبين");

/* staffCourse: أساتذتنا، منتدب، هيئة تدريسية، وعائدون. */
const people = { ours: new Set([10, 11]), visiting: new Set([90]), placeholder: new Set([99]), retired: new Set([12]) };
const s = staffCourse(
  [{ AdInstructorId: 10, SCode: "501" }, { AdInstructorId: 10, SCode: "501" }, { AdInstructorId: 11, SCode: "502" }, { AdInstructorId: 90, SCode: "503" }, { AdInstructorId: 99, SCode: "504" }, { SCode: "505" }],
  [{ AdInstructorId: 10, AdTermId: 1 }, { AdInstructorId: 13, AdTermId: 1 }, { AdInstructorId: 13, AdTermId: 2 }, { AdInstructorId: 12, AdTermId: 1 }, { AdInstructorId: 90, AdTermId: 1 }, { AdInstructorId: 14, AdTermId: 1 }, { AdInstructorId: 99, AdTermId: 1 }],
  id => !people.visiting.has(id) && !people.placeholder.has(id) && !people.retired.has(id), id => people.visiting.has(id), id => people.placeholder.has(id), id => !people.retired.has(id), (id, term) => id === 14 && term === 1,
);
check(s.ours === 2 && s.covered === 2 && s.withVisitors === 1 && s.unassigned === 2 && s.returnable === 1, "إحصاء مقرر: ٢ أساتذة، ٢ مغطاة، ١ منتدب، ٢ بلا أستاذ، ١ عائد (لا المتقاعد ولا منتدب ذلك الفصل)", s);

/* العرض: لا يظهر شيءٌ من التفاصيل قبل الضغط، ولا اسم. */
const html = renderToStaticMarkup(React.createElement(SectionGapPanel, { items: three, kind: "plan", onClose: () => {}, staffing: { 1: staff({ ours: 3, covered: 5 }) }, freeSlots: 0 }));
check(html.includes("apb-gap-total") && html.includes("apb-gap-total-btn") && !html.includes("apb-gap-total-sum") && !html.includes("apb-staff\""), "المجموع ظاهرٌ والتفاصيل مطويّة", html.slice(0, 200));
const legacy = renderToStaticMarkup(React.createElement(SectionGapPanel, { items: three, kind: "plan", onClose: () => {} }));
check(!legacy.includes("apb-gap-total"), "بلا بيانات تدريس لا يظهر المجموع");

console.log(`\nVisiting need audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
