/**
 * ── «منتدب» بجانب كل اسم أستاذ يُعرض لموعد: المجموعة الأولى ─────────────────────
 *
 * الشارةُ تُرسم بـ <VisitingBadge compact /> حيث يوجد JSX، وتُلحَق اللاحقةُ النصية
 * (withVisitingSuffix) حيث الاسمُ نصٌّ فقط: عنوانٌ، خيارٌ منسدل، aria-label، جملةٌ، ورقةُ طباعة.
 * والمنتدبُ يُعرف بقسمه وفصله، فحيث يغيب مجموعُ اللوحة تُسأل القائمةُ الموحّدة بنطاق الصفّ نفسه.
 */
import fs from "fs";
import path from "path";
import { VISITING_SUFFIX, withVisitingSuffix } from "../src/components/VisitingBadge";
import { isVisitingIn } from "../src/utils/visitingLookup";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const has = (file: string, re: RegExp, label: string) => check(re.test(read(file)), label);
const count = (file: string, re: RegExp) => (read(file).match(re) || []).length;

// ── منطق اللاحقة والقائمة
check(withVisitingSuffix("د. سالم", true) === `د. سالم${VISITING_SUFFIX}`, "اللاحقة تُلحق بالمنتدب");
check(withVisitingSuffix("د. سالم", false) === "د. سالم", "ولا تُلحق بغيره");
const lookup = { termId: 5, scopes: { "1:2": [10] } };
check(isVisitingIn(lookup, 10, 1, 2), "منتدبٌ في قسمه");
check(!isVisitingIn(lookup, 10, 1, 3), "وليس منتدباً في قسمٍ آخر");

// ── Schedules.tsx
const S = "src/components/Schedules.tsx";
has(S, /useVisitingLookup\(formLookupTerm\)/, "Schedules: النموذج يسأل القائمة الموحّدة بفصله");
has(S, /selectedInstructor \? <PersonChips visiting=\{formVisiting\(form\.AdInstructorId\)\} trainee=\{formTrainees\.has\(Number\(form\.AdInstructorId\)\)\} \/>/, "Schedules: بطاقة المعاينة قبل الحفظ تحمل الشارة (PersonChips)");
has(S, /withVisitingSuffix\(instructorTitleName,/, "Schedules: عنوان بطاقة تعارض الأستاذ بلاحقة");
has(S, /withVisitingSuffix\(instructorById\.get\(Number\(other\.AdInstructorId \|\| 0\)\)\?\.AdInstructorName/, "Schedules: سطر الحجز المقابل في بطاقة التعارض بلاحقة");
has(S, /function GhostInstructorName[\s\S]{0,600}useVisitingLookup\(row\.AdTermId\)/, "Schedules: ظلّ الفصل السابق يقرّر بفصل صفّه");
has(S, /<GhostInstructorName row=\{r as any\}/, "Schedules: ظلّ الفصل السابق يرسمه");
has(S, /visiting: visitingIds\.has\(Number\(r\.AdInstructorId\)\)/, "Schedules: شريحة المفتاح في وضع الأستاذ تحمل العلم");
check(count(S, /item\.visiting \? <VisitingBadge compact \/> : null/g) === 3, "Schedules: شرائح المفتاح الثلاث ترسم الشارة");
check(count(S, /legendText\(item\)/g) >= 9, "Schedules: عناوين الشرائح وaria-label بلاحقة");
has(S, /aria-label=\{`\$\{title\} · \$\{code\} · شعبة \$\{r\.SCode \|\| "—"\} · \$\{withVisitingSuffix\(who,/, "Schedules: aria-label بطاقة الأسبوع بلاحقة");
check(count(S, /(?:title|aria-label)=\{`\$\{title\} · \$\{withVisitingSuffix\(instructor\?\.AdInstructorName/g) === 2, "Schedules: title وaria-label صفّ الجدول بلاحقة");
has(S, /instructorVisiting=\{Boolean\(physics\.state\.row && visitingIds\.has/, "Schedules: يمرّر علمَ المنتدب لطبقة السحب");

// ── المكوّنات الصغيرة
has("src/components/QuickCreatePopover.tsx", /<InstructorPicker[\s\S]*?visitingIds=\{visitingIds\}[\s\S]*?visitingRosterIds=\{visitingRosterIds\}/, "QuickCreate: المنتقي الموحّد بشارة المنتدب وروستر الفصل");
has("src/components/QuickCreatePopover.tsx", /<PersonChips visiting=\{isVisiting\(draft\.instructorId, collegeId, sectionId\)\} trainee=\{trainees\.has\(Number\(draft\.instructorId\)\)\} \/>/, "QuickCreate: أستاذ الطلب المقفل بشارة بنطاق القسم");
has("src/components/SchedulePhysics/SchedulePhysicsLayer.tsx", /instructorVisiting \? <VisitingBadge compact \/>/, "طبقة السحب: الشارة على الاسم");
has("src/components/SchedulePhysics/ScheduleDecisionPreview.tsx", /instructorVisiting \? <VisitingBadge compact \/>/, "معاينة القرار: الشارة على الاسم");
const D = "src/components/DaySubstitute.tsx";
has(D, /useVisitingLookup\(row\.AdTermId\)/, "بديل اليوم: يسأل القائمة بفصل الصفّ");
has(D, /isVisiting\(instructorId, row\.AdCollegeId, row\.AdSectionId\)/, "بديل اليوم: بقسم الصفّ وكليته");
has(D, /\{candidate\.name\}\{visitingHere\(candidate\.id\) \? <VisitingBadge compact \/>/, "بديل اليوم: مرشّحو التغطية");
has(D, /visitingHere\(row\.AdInstructorId\) \? <VisitingBadge compact \/>/, "بديل اليوم: ترويسة الأستاذ");
has(D, /visitingHere\(dayException\.coverInstructorId\)/, "بديل اليوم: من يغطي اليوم");

// ── ScheduleReview
const R = "src/components/ScheduleReview.tsx";
has(R, /withVisitingSuffix\(instructors\.get\(row\.AdInstructorId\)\?\.AdInstructorName \|\| "بدون أستاذ", visitingIdSet\.has/, "المراجعة: ملخّص الملاحظة وصفوف الطباعة بلاحقة");
check(count(R, /markVisitingNames\(/g) >= 5, "المراجعة: العناوين والتفاصيل وعناوين الحالات تمرّ بـ markVisitingNames");

// ── ScheduleTransfer
const T = "src/components/ScheduleTransfer.tsx";
has(T, /useVisitingLookup\(termId\)/, "النقل: يسأل القائمة الموحّدة");
check(count(T, /\{withVisitingSuffix\(person\.AdInstructorName, visitingInDept\(person\.AdInstructorId\)\)\}/g) === 2, "النقل: خياران «من» و«إلى» بلاحقة");
has(T, /withVisitingSuffix\(instructors\.find[\s\S]{0,200}visitingInDept\(fill\.value, activeImportSectionId\)/, "النقل: قيمة الاقتراح الذكي بلاحقة");
has(T, /markVisitingNames\(String\(item\.label\)/, "النقل: سجلّ الاستبدالات بلاحقة");

// ── الاستيراد والاختيار والكتالوج
const I = read("src/components/ImportPreviewTable.tsx");
check(!/import-visiting-badge/.test(I) && /<VisitingBadge compact \/>/.test(I), "الاستيراد: الشارة الموحّدة بدل الوسم اليدوي");
check(/withVisitingSuffix\(instructorById\.get\(Number\(row\.AdInstructorId\)\)\?\.AdInstructorName \|\| "الأستاذ", visitingIdSet/.test(I), "الاستيراد: ملاحظة تعارض الأستاذ بلاحقة");
const P = read("src/components/InstructorPicker.tsx");
check(!/instructor-visiting-label/.test(P) && (P.match(/<PersonChips visiting=\{visitingSet\.has\((?:selected|person)\.AdInstructorId\)\} trainee=\{trainees\.has\(Number\((?:selected|person)\.AdInstructorId\)\)\} \/>/g) || []).length === 2, "منتقي الأستاذ: الشارة الموحّدة في الموضعين");
const N = read("src/components/Instructors.tsx");
check(!/staff-badge is-delegate/.test(N) && /<VisitingBadge compact \/>/.test(N), "الأساتذة: الشارة الموحّدة بدل staff-badge");
check(/<h2>\{selected\.AdInstructorName\}\{delegateIds\.has\(selected\.AdInstructorId\) \? <VisitingBadge compact \/>/.test(N), "الأساتذة: عنوان المفتش يحمل الشارة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
