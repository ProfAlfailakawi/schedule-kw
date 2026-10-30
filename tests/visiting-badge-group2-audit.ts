/**
 * ── «منتدب» بجانب كل اسم أستاذ: التقارير، وارد الأساتذة، جدول القسم، المقترح الدراسي ──
 * فحوصٌ على مستوى المصدر لكل موضعٍ أُصلح، مع فحص منطقٍ حقيقي لحكم الصفّ بقسمه.
 */
import fs from "fs";
import path from "path";
import { isVisitingIn, type VisitingLookup } from "../src/utils/visitingLookup";
import { withVisitingSuffix } from "../src/components/VisitingBadge";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const reports = read("src/components/Reports.tsx");
/* وسومُ الشخص الموحّدة (PersonChips): «منتدب» كما هو، و«🎓 تدريب» بعده — personChips(id) يسأل isVisitingInstructor نفسه. */
check(/const personChips = \(id: unknown, visiting = isVisitingInstructor\(Number\(id\)\)\) => <PersonChips visiting=\{visiting\} trainee=\{trainees\.has\(Number\(id\)\)\} \/>/.test(reports), "التقارير على الشاشة: وسما الشخص من المكوّن الواحد");
check(/course-room-who report-instructor-with-badge[^\n]*\{personChips\(row\.AdInstructorId\)\}/.test(reports), "عدسة القاعة والمقرر: المنتدب بشارته");
check(/<span className="report-instructor-with-badge">\{row\.name\}\{personChips\(Number\(row\.id\)\)\}<\/span>/.test(reports), "صفّ العدالة على الشاشة");
check(/<strong className="report-instructor-with-badge">\{person\.name\}<VisitingBadge compact \/><\/strong>/.test(reports), "صفّ سجلّ المنتدبين التاريخي على الشاشة");
check(/withVisitingSuffix\(page\.group\.key, visitingIds\.has\(Number\(page\.group\.rows\[0\]\?\.AdInstructorId\)\)\)/.test(reports), "ترويسة مجموعة الأستاذ في الطباعة");
check(/withVisitingSuffix\(page\.group\.key, true\)/.test(reports), "ترويسة مجموعة المنتدبين في الطباعة");
check(/withVisitingSuffix\(row\.name, visitingIds\.has\(Number\(row\.id\)\)\)/.test(reports), "صفّ العدالة في الطباعة");
check(/withVisitingSuffix\(person\.name, true\)/.test(reports), "صفّ السجلّ التاريخي في الطباعة");
check(/تقرير الأستاذ — \$\{instructorName \? withVisitingSuffix\(instructorName/.test(reports), "عنوان طباعة تقرير الأستاذ");
check(/label: `الأستاذ: \$\{withVisitingSuffix\(selectedInstructor\.AdInstructorName/.test(reports), "شريحة مرشّح الأستاذ");
check(/isVisitingRow=\{bookRowIsVisiting\}/.test(reports), "وثيقة «كل الفروع» تحكم لكل صفٍّ على حدة");
const authority = read("src/components/AuthorityPdfReport.tsx");
check(/isVisitingRow \? isVisitingRow\(row\) : visitingIds\.has/.test(authority), "تقرير الهيئة يأخذ حكم الصفّ إن مُرّر");

const inbox = read("src/components/InstructorInbox.tsx");
check(/useVisitingLookup\(row\.AdTermId\)/.test(inbox) && /<strong className="schedule-instructor-with-badge">\{row\.instructorName\}<PersonChips visiting=\{isVisiting\(row\.AdInstructorId, row\.AdCollegeId, row\.AdSectionId\)\} trainee=\{isTaRequest\(row\)\} \/>/.test(inbox), "ترويسة بطاقة الطلب");
check((inbox.match(/\{row\.instructorName\}<PersonChips visiting=\{rowVisiting\(row\)\} trainee=\{isTaRequest\(row\)\} \/>/g) || []).length === 4, "رابطا التذكير لمن لم يفتحوا، و«لم يشاركوا» و«ثبّتوا كما هو»");
check(/withPersonSuffix\(row\.instructorName, rowVisiting\(row\), isTaRequest\(row\)\)\)\.join/.test(inbox), "قائمة «كما هو»");
check(/label: withPersonSuffix\(row\.instructorName, rowVisiting\(row\), own\.some\(isTaRequest\)\)/.test(inbox), "خيارات مرشّح الأستاذ");
/* r4: المنتقي يبني من proposalLauncherChoices (الشخص مرّةً واحدة)، وشارةُ المنتدب تبقى على كل خيار. */
check(/visiting: rowVisiting\(row\)/.test(inbox)
  && /chips: <PersonChips visiting=\{choice\.visiting\} trainee=\{choice\.trainee\} \/>/.test(read("src/components/proposal/ProposalInboxParts.tsx"))
  && /visiting: Boolean\(row\.visiting\)/.test(read("src/utils/instructorPickerChoices.ts")), "قائمة اختيار الأستاذ للمقترح");

const dept = read("src/components/DepartmentSchedule.tsx");
check(/instructorId: Number\(item\.AdInstructorId\)/.test(dept) && /isVisiting\(row\.instructorId, row\.collegeId, row\.sectionId\)/.test(dept), "جدول القسم يحمل المعرّف ويسأل بكلية الصفّ وقسمه");
check((dept.match(/\{who\(row\)\}/g) || []).length === 2, "الشارة في الجدول والبطاقة معاً");

const header = read("src/components/proposal/ProposalHeader.tsx");
const form = read("src/components/proposal/ProposalOpForm.tsx");
const dialogs = read("src/components/proposal/ProposalDialogs.tsx");
check(/\{ctx\.instructor\.name\}<PersonChips visiting=\{visiting\} trainee=\{trainee\} \/><\/h1>/.test(header), "رأس مساحة المقترح");
check(/\{ctx\.instructor\.name\}<PersonChips visiting=\{visiting\} trainee=\{trainee\} \/><\/span>/.test(form), "نموذج المادة في المقترح");
check((dialogs.match(/\{ctx\.instructor\.name\}<PersonChips visiting=\{visiting\} trainee=\{trainee\} \/>/g) || []).length === 2, "حواريا الإرسال");
check(/`السلام عليكم \$\{ctx\.instructor\.name\}،`/.test(dialogs), "نصُّ الواتساب المرسل إلى الأستاذ يبقى بلا لاحقة");
check(/useVisitingLookup\(ctx\?\.term\.id\)/.test(header + form + dialogs), "الحكم بفصل المقترح");

/* المنطق: الحكم بالقسم لا بالمعرّف وحده. */
const lookup: VisitingLookup = { termId: 5, scopes: { "1:2": [10, 11], "1:3": [12] } };
check(isVisitingIn(lookup, 10, 1, 2), "منتدبٌ في قسمه");
check(!isVisitingIn(lookup, 10, 1, 3), "ولا يكون منتدباً في قسمٍ آخر");
check(!isVisitingIn(lookup, 12, 1, 2), "ولا يتسرّب منتدبُ قسمٍ إلى صفوف قسمٍ ثانٍ");
check(withVisitingSuffix("د. سالم", true) === "د. سالم · منتدب" && withVisitingSuffix("د. سالم", false) === "د. سالم", "اللاحقة النصّية");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
