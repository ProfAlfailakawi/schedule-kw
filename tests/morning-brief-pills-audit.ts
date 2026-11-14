/**
 * ── موجز الصباح: كلُّ بطاقةٍ تُفتح على تفصيلها ───────────────────────────────
 *
 * من يرى «2 موانع» يعرف ما هي. يحرس هذا الفحص:
 *  - الموانع والملاحظات تصل الموجز بعناوينها وأسبابها من قراءة الخادم نفسها (لا نقطةَ جديدة،
 *    ولا توسيعَ لنطاقٍ)، وتُقصّ على عشرة، والرقمُ في البطاقة يبقى العدّ الكامل؛
 *  - لا اسمَ قاعةٍ في نصّ المانع (يُقال العنوان والمقرر والشعبة وحدها)؛
 *  - كلُّ بطاقةٍ زرٌّ بـaria-expanded وaria-controls، وواحدةٌ مفتوحة في كل مرة، وضغطها ثانيةً يطويها؛
 *  - «افتح» يستعمل لوحة تفاصيل الموعد القائمة، ولا يظهر لموعدٍ ليس في النتائج المعروضة؛
 *  - زرّ الشروق يفتح الموجز كاملاً كما كان، والطباعةُ وصنفُ no-print باقيان.
 */
import fs from "fs";
import path from "path";
import { BRIEF_ITEM_CAP, briefItemsOf, buildMorningBrief } from "../src/utils/morningBrief";
import { approvalBlockers } from "../src/utils/scheduleBlockers";
let passed = 0, failed = 0;
function check(condition: boolean, name: string, detail?: unknown) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail)); }
}
const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");

const many = Array.from({ length: 14 }, (_, index) => ({ title: `مانع ${index}`, detail: "سبب", rowIds: [index + 1, "x", -3] }));
const brief = buildMorningBrief({
  now: new Date("2026-11-15T08:00:00Z"), scopeRowIds: new Set([1]), trail: [], kindLabel: kind => kind,
  approval: { statusLabel: "مسوّدة", round: 1 }, deadline: { date: "٢٠ نوفمبر", daysLeft: 5 },
  blockers: 14, regulationNotes: 2, changes: null,
  blockerItems: many, noteItems: [{ title: "ملاحظة", detail: "", rowIds: [] }, { title: "", detail: "بلا عنوان" }],
});
check(brief.stats.blockers === 14 && brief.blockerItems.length === BRIEF_ITEM_CAP && BRIEF_ITEM_CAP === 10, "الرقم عدٌّ كامل والقائمة مقصوصة على عشرة", { n: brief.blockerItems.length });
check(brief.blockerItems[0].rowIds.length === 1 && brief.blockerItems[0].rowIds[0] === 1, "معرّفات المواعيد أرقامٌ موجبة وحدها");
check(brief.noteItems.length === 1 && brief.noteItems[0].title === "ملاحظة", "بند بلا عنوان يسقط", brief.noteItems);
check(brief.deadlineDate === "٢٠ نوفمبر" && brief.stats.approval === "مسوّدة", "التاريخ والحال يصلان الموجز");
check(briefItemsOf(undefined).length === 0 && briefItemsOf([null as any]).length === 0, "مدخلٌ غائب أو فاسد ← قائمة فارغة");

/* نصّ المانع لا يحمل قاعة: يُبنى من المقرر والشعبة والأستاذ وحدها. */
const rows = [
  { id: 1, AdCourseId: 5, AdCourseName: "مقرر أ", SCode: "01", AdInstructorId: 1, AdRoomCode: "G28", AdRoomHall: "H1", days: [1], fstarttime: "08:00", fendtime: "09:30", AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 },
  { id: 2, AdCourseId: 6, AdCourseName: "مقرر ب", SCode: "02", AdInstructorId: 2, AdRoomCode: "G28", AdRoomHall: "H1", days: [1], fstarttime: "08:00", fendtime: "09:30", AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 },
];
const listed = approvalBlockers(rows as any[], rows as any[], {});
check(listed.every(item => !/G28|H1/.test(`${item.title} ${item.detail}`)), "نصّ المانع بلا اسم قاعة", listed);

const component = read("src/components/query/QueryBrief.tsx");
const reports = read("src/components/Reports.tsx");
const css = read("src/styles/58-query-plus.css");
check((component.match(/<button type="button" className=\{`morning-brief-pill/g) || []).length === 1 && /pill\("moves"/.test(component) && /pill\("blockers"/.test(component) && /pill\("notes"/.test(component) && /pill\("days"/.test(component), "أربع بطاقات، كلٌّ منها زرٌّ");
check(/aria-expanded=\{pane === id\} aria-controls="morning-brief-body"/.test(component) && /title=\{title\}/.test(component), "البطاقة: aria-expanded وaria-controls وعنوان");
check(/if \(pane === next\) \{ setPane\(null\); return; \}/.test(component) && /useState<Pane \| null>/.test(component), "واحدةٌ مفتوحة، وضغطها ثانيةً يطويها");
check(/aria-expanded=\{full\} aria-controls="morning-brief-body" onClick=\{sunrise\}/.test(component) && /className=\{`morning-brief no-print/.test(component), "زرّ الشروق يفتح الكامل، وصنف no-print باقٍ");
check(/is-active/.test(component) && /\.morning-brief-pill\.is-active\{[^}]*box-shadow/.test(css), "البطاقة المفتوحة بحلقةٍ مميّزة");
check(/QueryPrintMenu iconOnly className="morning-brief-print"/.test(component), "طباعة الموجز باقية");
check(/canOpenRow \? canOpenRow\(id\) : false/.test(component), "«افتح» لا يظهر لموعدٍ خارج النتائج");
check(/canOpenRow=\{id => results\.some\(row => row\.id === id\)\} onOpenRow=\{id => setSelectedResultId\(id\)\}/.test(reports), "«افتح» يستعمل لوحة تفاصيل الموعد القائمة");
check(/blockerItems: Array\.isArray\(changes\?\.reviewBlockers\)/.test(reports) && /noteItems: Array\.isArray\(changes\?\.regulationNotices\)/.test(reports), "القائمتان من قراءة تغييرات الجدول نفسها بنطاقها");

console.log(`\nmorning brief pills audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
