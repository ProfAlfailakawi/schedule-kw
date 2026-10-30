/**
 * ── حارسُ التغطية: كلُّ اسم مقررٍ على الشاشة بوسومه، وكلُّ اسم أستاذٍ بوسمَيه ─────────────
 *
 * ملاحظةُ المالك: «مراجعة عدد الشعب بحسب تخطيطك» كانت بطاقاتُها بلا «صحيفة 2026 · متطلب كلية» مع أن #326
 * قال «كل الشاشات». هذا الحارس يقرأ كلَّ مكوّنٍ في src بمحلّل TypeScript نفسه، ويجد كلَّ موضعٍ يرسم اسمَ مقرر
 * (CourseName / courseName / AdCourseName / course.name …، أو «x.name» بجانب «x.code») نصّاً على الشاشة، ثم يطلب
 * <CourseTags> في العنصر نفسه أو في أبويه. وكذلك اسمُ الأستاذ: PersonChips (أو «منتدب» بـVisitingBadge/لاحقته).
 *
 * المستثنى مكتوبٌ هنا بسببه — وكلُّ استثناءٍ لم يعد له موضعٌ يُرفض (لا قائمةَ تتعفّن):
 *   • الطباعة مجمّدة: كلُّ مكوّنٍ اسمه Print… (التقارير المطبوعة) يُتخطّى، وما بقي مطبوعاً هنا بسببه.
 *   • <option> في قائمةٍ أصلية: نصٌّ خالص لا يحمل شارة.
 *   • الاسمُ داخل جملةٍ أو عنوانِ نافذةٍ بين «»، أو شريحةٍ/خليةٍ ضيّقة — والبطاقةُ أو التفاصيلُ بجانبها تحمل الوسوم.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : `\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 1)}`}`); }
};

type Exception = { file: string; text: string; reason: string };

/* ── استثناءاتُ المقرر: [الملف، نصُّ التعبير كما هو، السبب] ─────────────────────────────── */
const SENTENCE = "الاسمُ داخل جملةٍ أو عنوانِ نافذةٍ بين «» — البطاقةُ التي يشير إليها تحمل الوسوم";
const PILL = "شريحةٌ/زرُّ تبديلٍ بسطرٍ واحد — وسمٌ داخل شريحة يكسرها؛ البطاقةُ أو القائمةُ الكاملة تحملها";
const CELL = "خليةُ أسبوعٍ ضيّقة — الوسومُ في التفاصيل عند الضغط/المرور (البطاقة العائمة أو لوحة التفاصيل)";
const PRINT = "التقرير المطبوع (ومعاينتُه بالجسم نفسه) — تصميمُه مجمّد";
const REPAIR = "أداةُ إصلاح بيانات على سجلّات المقرر الخام (مكررات/توأم إملائي/دخيل) — الوسومُ للمقرر بعد الدمج";
const SHEET = "محرّرُ الصحيفة نفسها: نوعُ المتطلب وعضويةُ الصحيفة هما ما يُحرَّر هنا، فالوسمُ تكرار";
const NOT_COURSE = "ليس اسمَ مقرر (صحيفة/قسم/حملة/فئة طلبة)";
const STUDENT = "شاشةُ الطالب/الإعلان — خارج نطاق الإدارة والأستاذ";
const COURSE_EXCEPTIONS: Exception[] = [
  { file: "src/components/InstructorInbox.tsx", text: `item.after?.courseName || item.before?.courseName || "البند"`, reason: SENTENCE },
  { file: "src/components/proposal/ProposalChecks.tsx", text: `op?.target.courseName || "المادة"`, reason: SENTENCE },
  { file: "src/components/proposal/ProposalDialogs.tsx", text: `op.target.courseName`, reason: SENTENCE },
  { file: "src/components/proposal/ProposalOpForm.tsx", text: `ws.draftFit.courseName || "محاضرة"`, reason: SENTENCE },
  { file: "src/components/sectionRequests/SectionRequestsPanel.tsx", text: `course.name`, reason: SENTENCE },
  { file: "src/components/StudentRegistration.tsx", text: "committee ? `عدم موافقة اللجنة على «${course.name}»` : `ردّ «${course.name}»`", reason: STUDENT },
  { file: "src/components/StudentRegistration.tsx", text: `current.course.name`, reason: STUDENT },
  { file: "src/components/SectionSimulator.tsx", text: `impact.card.courseCode`, reason: SENTENCE },
  { file: "src/components/TAPhasePanel.tsx", text: `course.name`, reason: PILL },
  { file: "src/components/TAPhasePanel.tsx", text: `row.courseName`, reason: PILL },
  { file: "src/components/Schedules.tsx", text: "courseName || \"المقرر\"", reason: "شريحةُ ملخّص الموعد في شريط الحفظ — الوسومُ في سطر «المقرر» فوقها في النموذج نفسه" },
  { file: "src/components/Schedules.tsx", text: `guideGhostDiff.before.AdCourseName || "المقرر المحدد"`, reason: "معاينةُ الجولة الإرشادية (لا تحفظ) — عنوانٌ مؤقت" },
  { file: "src/components/Schedules.tsx", text: `clash.current.AdCourseName || courseById.get(clash.current.AdCourseId)?.CourseName || "الموعد"`, reason: "نافذةُ تعارض الحفظ: نسختان للموعد نفسه جنباً إلى جنب — الفرقُ في الوقت والقاعة لا في المقرر" },
  { file: "src/components/Schedules.tsx", text: `courseById.get(clash.yours.AdCourseId)?.CourseName || "الموعد"`, reason: "نافذةُ تعارض الحفظ: نسختان للموعد نفسه جنباً إلى جنب" },
  { file: "src/components/SchedulePhysics/ScheduleDecisionPreview.tsx", text: `course?.CourseCode || row.AdCourseName`, reason: "فقاعةُ السحب العابرة (رمزٌ وشعبة) — لا تُقرأ إلا لحظة الإفلات" },
  { file: "src/components/proposal/ProposalWeekGrid.tsx", text: `item.outside ? "التزام خارج القسم" : item.courseName || "موعد"`, reason: CELL },
  { file: "src/components/proposal/ProposalWeekGrid.tsx", text: `change.kind === "replaced" ? change.before.courseName : shortSlot(change.before)`, reason: CELL },
  { file: "src/components/proposal/ProposalOps.tsx", text: `before.courseName`, reason: "سطرُ «خرج» الصغير تحت العملية — عنوانُ العملية فوقه يحمل الوسوم" },
  { file: "src/components/IntelligenceWorkspace.tsx", text: `fix.courseName`, reason: "شريحةُ «من» في حركة الإصلاح — عنوانُ البطاقة فوقها يحمل الوسوم" },
  { file: "src/components/IntelligenceWorkspace.tsx", text: `fix.swapWith.courseName`, reason: "شريحةُ «من» في التبديل — سطرٌ ضيّق داخل البطاقة" },
  { file: "src/components/RoomSuggestionCards.tsx", text: `item.courseName || "المقرر نفسه"`, reason: "بطاقةُ قاعة: المقررُ تعليقٌ صغير تحت رقم القاعة" },
  { file: "src/components/CourseImpact.tsx", text: `data.course.name`, reason: "عقدةُ مخطط الأثر داخل صفّ المقرر الذي يحمل الوسوم (بروفة التسجيل)" },
  { file: "src/components/SectionPlanning.tsx", text: `row.course.name`, reason: PRINT },
  { file: "src/components/DuplicateCoursesPanel.tsx", text: `group.keeper.name`, reason: REPAIR },
  { file: "src/components/DuplicateCoursesPanel.tsx", text: `dup.name`, reason: REPAIR },
  { file: "src/components/SpellingTwinsMerge.tsx", text: `course.name`, reason: REPAIR },
  { file: "src/components/PlanSheetUpload.tsx", text: `course.name`, reason: REPAIR },
  { file: "src/components/ServiceCoursesPanel.tsx", text: `course.name`, reason: "لوحةُ مقررات الخدمة نفسها: سطرُ «متطلب لأقسام» هو الوسم" },
  { file: "src/components/CurriculumReferenceReview.tsx", text: `course.name`, reason: SHEET },
  { file: "src/components/PlanReview.tsx", text: `x.name`, reason: SHEET },
  { file: "src/components/PlanReview.tsx", text: `c.name`, reason: SHEET },
  { file: "src/components/PlanReview.tsx", text: `focusCourse.name`, reason: SHEET },
  { file: "src/components/PlanReview.tsx", text: `course.name`, reason: SHEET },
  { file: "src/components/Courses.tsx", text: `curriculumTarget.plan.name`, reason: NOT_COURSE },
  { file: "src/components/PlanSheetUpload.tsx", text: `dept.name`, reason: NOT_COURSE },
  { file: "src/components/AudienceStory.tsx", text: `d.name`, reason: STUDENT },
  { file: "src/components/OutcomeStory.tsx", text: `row.name`, reason: STUDENT },
  { file: "src/components/ads/CampaignWizard.tsx", text: `d.name`, reason: STUDENT },
  { file: "src/App.tsx", text: `row.name`, reason: "إجابةُ البحث بالكلام: سطرٌ مختصر (رمزٌ واسمٌ ووقت) يفتح الموعد" },
];

/* ── استثناءاتُ الأستاذ ─────────────────────────────────────────────────── */
const ADMIN = "إدارةُ الحسابات وربطُها — هويةُ الحساب لا صفةُ التدريس";
const RAW = "مطابقةُ أسماء الاستيراد الخام قبل الربط";
const PERSON_EXCEPTIONS: Exception[] = [
  { file: "src/components/AdminUsers.tsx", text: `linked?.AdInstructorName || "غير مربوطة"`, reason: ADMIN },
  { file: "src/components/ImportNameFillPanel.tsx", text: `d.instructorName`, reason: RAW },
  { file: "src/components/ScheduleTransfer.tsx", text: "person?.AdInstructorName||`منتدب ${id}`", reason: "قائمةُ نسخ المنتدبين نفسها — كلُّ من فيها منتدب" },
  { file: "src/components/SectionSimulator.tsx", text: `card.instructorName`, reason: "سطرُ بطاقة الشعبة في المحاكي (قاعةٌ وأستاذ) على نسخةٍ افتراضية" },
  { file: "src/components/AllCourses.tsx", text: `impact.teacher.name`, reason: "جملةُ «نصاب فلان» في أثر +/− شعبة" },
  { file: "src/components/SectionSimulator.tsx", text: `impact.teacher.name`, reason: "جملةُ «نصاب فلان» في أثر الحذف" },
  { file: "src/components/QuickCreatePopover.tsx", text: `teacherName`, reason: "تلميحُ «بعد اختيار المقرر» — الأستاذُ مقفلٌ فوقه بوسميه" },
  { file: "src/components/MeetingSlots.tsx", text: `person.AdInstructorName`, reason: "اختيارُ حضور الاجتماع — ليس جدولَ تدريس" },
  { file: "src/components/ScheduleTransfer.tsx", text: `person.AdInstructorName`, reason: "سجلُّ هيئة التدريس في النقل (الرقم المدني والجوال) — هويةٌ إدارية" },
];

/* ── أنماطُ الاسم ───────────────────────────────────────────────────────── */
const COURSE = /\b(CourseName|courseName|AdCourseName|CourseNameSnapshot|course_name)\b|\b\w*[cC]ourse\w*\??\.name\b/;
const COURSE_COVER = /<CourseTags\b|courseTagsHtml/;
const PERSON = /\b(AdInstructorName|instructorName|teacherName)\b|\b\w*([iI]nstructor|[tT]eacher)\w*\??\.name\b/;
const PERSON_COVER = /<PersonChips\b|personChips\(|<VisitingBadge\b|withVisitingSuffix\(|markVisitingNames\(|withPersonSuffix\(/;

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

type Finding = { file: string; line: number; text: string };
const jsxParent = (node: ts.Node): ts.Node | null => { let p = node.parent; while (p && !ts.isJsxElement(p) && !ts.isJsxFragment(p)) p = p.parent; return p || null; };
const tagName = (node: ts.Node, sf: ts.SourceFile) => ts.isJsxElement(node) ? node.openingElement.tagName.getText(sf) : "";
function enclosingFunction(node: ts.Node, sf: ts.SourceFile): string {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.getText(sf);
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) return p.name.getText(sf);
  }
  return "";
}

function scan(kind: "course" | "person"): Finding[] {
  const out: Finding[] = [];
  for (const file of filesUnder("src")) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        const text = node.expression.getText(sf).replace(/\s+/g, " ").trim();
        const parent = node.parent;
        let hit = false;
        if (kind === "course") {
          if (COURSE.test(text) && !text.includes("=>") && !text.includes("<")) hit = true;
          /* «x.name» بجانب «x.code» في العنصر نفسه: مقرر (GapItem، صفوف الخطة…). */
          const pair = /^([\w.?!]+?)\??\.name$/.exec(text);
          if (pair) {
            const owner = pair[1].replace(/[?!]/g, "").replace(/\./g, "\\??\\.");
            const scope = (jsxParent(parent) || parent).getText(sf);
            if (new RegExp(`\\b${owner}\\??\\.(code|courseCode|CourseCode)\\b`).test(scope)) hit = true;
          }
          /* رمزُ المقرر وحده بلا اسمٍ في عنصره. */
          if (/^[\w.?!()]+?\??\.(CourseCode|courseCode)$/.test(text) && !/CourseName|courseName|\.name\b/.test((jsxParent(parent) || parent).getText(sf))) hit = true;
        } else if (PERSON.test(text) && !text.includes("=>") && !text.includes("<")) hit = true;
        if (hit) {
          const inOption = tagName(parent, sf) === "option";
          const printed = /^Print[A-Z]/.test(enclosingFunction(node, sf));
          let covered = (kind === "person" && PERSON_COVER.test(text));
          let el: ts.Node | null = parent;
          for (let depth = 0; depth < 3 && el && !covered; depth++, el = jsxParent(el)) covered = (kind === "course" ? COURSE_COVER : PERSON_COVER).test(el.getText(sf));
          if (!covered && !inOption && !printed) out.push({ file: file.split(path.sep).join("/"), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

for (const [kind, exceptions, title] of [["course", COURSE_EXCEPTIONS, "اسمُ المقرر بوسومه (CourseTags)"], ["person", PERSON_EXCEPTIONS, "اسمُ الأستاذ بوسميه (PersonChips/«منتدب»)"]] as const) {
  const findings = scan(kind);
  const isExcepted = (f: Finding) => exceptions.some(e => e.file === f.file && e.text === f.text);
  const missing = findings.filter(f => !isExcepted(f));
  check(!missing.length, `${title}: كلُّ موضعٍ على الشاشة مغطّى أو مستثنىً بسببه`,
    missing.map(f => `      ${f.file}:${f.line}  {${f.text.slice(0, 120)}}`).join("\n"));
  const stale = exceptions.filter(e => !findings.some(f => f.file === e.file && f.text === e.text));
  check(!stale.length, `${title}: لا استثناءَ بلا موضع (القائمة لا تتعفّن)`, stale.map(e => `      ${e.file}  {${e.text}}`).join("\n"));
  check(exceptions.every(e => e.reason.trim().length > 8), `${title}: لكل استثناءٍ سببٌ مكتوب`);
}

/* ── المكانُ الذي بدأ منه: بطاقاتُ «مراجعة عدد الشعب بحسب تخطيطك» ─────────────────────────── */
{
  const read = (file: string) => fs.readFileSync(file, "utf8");
  check(/<span className="apb-gap-name"><b>\{item\.name\}<\/b><small>\{item\.code\}<CourseTags courseId=\{item\.id\} \/><\/small><\/span>/.test(read("src/components/SectionGapNote.tsx")), "T1 بطاقاتُ التخطيط (عاجل/مهم/فرصة): الرمزُ ثم الوسوم");
  check(/<CourseTags courseId=\{item\.id\} \/>/.test(read("src/components/DecisionBoard.tsx")) && /<CourseTags courseId=\{entry\.item\.id\} \/>/.test(read("src/components/PlanTriageView.tsx")), "T2 لوحةُ القرار (للقراءة) والبنودُ المعالَجة بالوسوم نفسها");
  check(/<CourseTags courseId=\{courseId\} \/><\/strong>/.test(read("src/components/Schedules.tsx")) && /courseId=\{Number\(peek\.row\.AdCourseId\) \|\| undefined\}/.test(read("src/components/Schedules.tsx")), "T3 خليةُ الأسبوع الضيّقة: الوسومُ في البطاقة العائمة عند المرور");
}

console.log(`\ncourse-tags coverage audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
