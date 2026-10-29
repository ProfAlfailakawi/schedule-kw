/**
 * ── ملاحظات المالك: الاعتماد · تعبئة الأسماء · كل المقررات · الإرشاد (الجولة 3) ──
 *
 * ١) مراجعة الاعتماد: البند يُعرض مرةً واحدة (بطاقة)، وعددُ مواعيده هو نفسه الذي
 *    تُحسب به الدرجة، وفي البطاقة «83 ← 98» و«عالج».
 * ٢) تعبئة الأسماء: الملف الثاني يُقرأ تجربةً بلا حفظ، وكل رفضٍ يقول سببه؛ والجدول
 *    من هذا الفصل أو الذي قبله؛ والاسم المعبّأ لا يبقى أحمر.
 * ٣) «كل المقررات»: أرقام الطلبة من كشف المتبقي المستورد للقسم في الفصل.
 * ٤) الإرشاد: منتقي الكلية والقسم في الرأس، والخادم يضيّق ولا يوسّع.
 */
import fs from "node:fs";
import { applyNameFill, nameFillPdfOutcome, nameFillSourceTerms, normalizeArabicName, planNameFill, resolveInstructorName } from "../src/utils/importNameFill";
import { approvalScoreBreakdown } from "../src/utils/approvalScore";
import { courseSeatStats, DEMAND_WORD } from "../src/utils/courseWhatIf";
import type { TmContext } from "../src/utils/timeMachine";

let passed = 0, failed = 0;
const check = (condition: unknown, label: string) => {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

console.log("١ — مراجعة الاعتماد: بندٌ واحد في بطاقةٍ واحدة");
{
  const source = read("src/components/ScheduleReview.tsx");
  check(!source.includes("review-score-fixes"), "القائمة العلوية المكرّرة («عالج» فوق البطاقات) أُزيلت");
  check(source.includes("data-review-formula") && source.includes("breakdown.formula"), "معادلة الدرجة بقيت سطراً واحداً");
  const card = source.slice(source.indexOf("const renderFinding = (finding: ReviewFindingGroup) => {"), source.indexOf("return (\n    // The printable sheet"));
  check(card.includes("data-score-fix") && card.includes("segment.projected") && card.includes("عالج"), "البطاقة تحمل «83 ← 98 (+15)» و«عالج»");
  check(card.includes("finding.rowIds.filter(id => scopeIds.has(Number(id)))") && card.includes("countOf(scoped.length, AR.appointment)"), "عددُ مواعيد البطاقة مواعيدُ الكلية المفتوحة (التي تُحسب بها الدرجة)");
  check(card.includes("event.preventDefault(); event.stopPropagation()"), "«عالج» داخل رأس البطاقة لا يفتحها ولا يطويها");
  check(source.includes("const cardBreakdown = useMemo(() => approvalScoreBreakdown(") && source.includes("cardBreakdown.segments.find(segment => segment.key === finding.groupKey)"), "لكل بطاقةٍ أثرُها هي، والمانعان الماديان كلٌّ بأثره");
  check((source.match(/> عالج/g) || []).length === 1, "«عالج» مرةً واحدة في الشاشة");
  /* المثال الحقيقي: بندٌ لمواعيد في كليتين (24) والكلية المفتوحة فيها 8. */
  const scope = Array.from({ length: 53 }, (_, i) => i + 1);
  const family = [...scope.slice(0, 8), ...Array.from({ length: 16 }, (_, i) => 1000 + i)];
  const breakdown = approvalScoreBreakdown(scope, [{ key: "g", label: "أكثر من شعبتين متتاليتين", tone: "regulation", rowIds: family }]);
  const segment = breakdown.segments.find(item => item.key === "g")!;
  const scopedCount = family.filter(id => scope.includes(id)).length;
  check(segment.touched === 8 && scopedCount === 8 && family.length === 24, "قبلُ: 8 فوق و24 تحت — الآن العددان واحد (8)");
  check(segment.projected > breakdown.score, `ما تصير إليه الدرجة محسوبٌ للبند نفسه (${breakdown.score} ← ${segment.projected})`);
  check(!read("src/styles/33-approval-score.css").includes(".review-score-fixes{"), "لا أنماط لقائمةٍ لم تعد موجودة");
  check(source.includes("print-review-ring score-tone-"), "الورقة المطبوعة لم تُمسّ");
}

console.log("٢أ — الملف الثاني: سببُ الرفض بالاسم");
{
  const panel = read("src/components/ImportNameFillPanel.tsx");
  check(/dryRun: "1"/.test(panel), "الملف الثاني يُقرأ «تجربة بلا حفظ» (dryRun=1): الفصل الممتلئ لا يردّه قبل القراءة");
  check(panel.includes("nameFillPdfOutcome(") && !panel.includes('"تعذّر قراءة الملف الثاني"'), "لا جملة عامة: النتيجة تُقرأ بـnameFillPdfOutcome");
  /* السبب الجذري: الخادم يردّ الرفض كائنَ JSON واحداً بلا type، والشاشة كانت تقرأ type وحده. */
  const occupied = JSON.stringify({ error: "نسخ جدول PDF متاح للفصل الفارغ فقط. أنشئ فصلاً فارغاً أو اختر واحداً بلا مواعيد.", code: "PDF_TARGET_TERM_OCCUPIED" });
  const legacyParse = (text: string) => { let result: any = null; for (const line of text.split("\n")) { try { const e = JSON.parse(line); if (e.type === "done") result = e.result; } catch { /* */ } } return result; };
  check(legacyParse(occupied) === null, "إثبات السبب: ردّ 409 بلا type كان يُقرأ «لا نتيجة» فيظهر «تعذّر قراءة الملف الثاني»");
  const term = nameFillPdfOutcome(409, JSON.stringify({ error: "هذا الملف للفصل «الأول 2024/2025»…", code: "PDF_TERM_MISMATCH" }));
  check("error" in term && term.error.includes("الأول 2024/2025") && term.code === "PDF_TERM_MISMATCH", "رفض الفصل يُعرض بنصّه");
  const dept = nameFillPdfOutcome(200, `${JSON.stringify({ type: "progress", phase: "read" })}\n${JSON.stringify({ type: "error", error: "هذا الملف للقسم «0102»…", code: "PDF_DEPARTMENT_MISMATCH" })}\n`);
  check("error" in dept && dept.error.startsWith("الملف الثاني:") && dept.error.includes("0102"), "خطأ داخل البثّ يُعرض بنصّه");
  const big = nameFillPdfOutcome(413, "");
  check("error" in big && big.error.includes("24"), "ملفٌ كبير: يُذكر الحدّ");
  check("error" in nameFillPdfOutcome(0, "") && (nameFillPdfOutcome(0, "") as any).error.includes("الاتصال"), "لم يصل الطلب: «انقطع الاتصال»");
  check((nameFillPdfOutcome(401, "") as any).error.includes("الجلسة"), "جلسةٌ منتهية تُسمّى");
  check((nameFillPdfOutcome(503, "") as any).error.includes("مشغولة"), "القراءة مشغولة تُسمّى");
  const empty = nameFillPdfOutcome(200, JSON.stringify({ type: "done", result: { rows: [] } }));
  check("error" in empty && empty.code === "NO_ROWS", "ملفٌ بلا شعب يقول ذلك");
  const noNames = nameFillPdfOutcome(200, JSON.stringify({ type: "done", result: { rows: [{ AdCourseId: 1, sourceInstructorText: "" }] } }));
  check("error" in noNames && noNames.code === "NO_NAMES", "ملفٌ بلا أسماء يقول ذلك");
  const good = nameFillPdfOutcome(200, `${JSON.stringify({ type: "progress" })}\n${JSON.stringify({ type: "done", result: { rows: [{ AdCourseId: 1, sourceInstructorText: "د. أحمد" }] } })}\n`);
  check("rows" in good && good.rows.length === 1, "ملفٌ سليم يعطي سطوره");
  const plain = nameFillPdfOutcome(200, JSON.stringify({ rows: [{ AdCourseId: 1, sourceInstructorText: "د. أحمد" }] }));
  check("rows" in plain, "ردٌّ بلا بثّ (JSON واحد) يُقرأ كذلك");
}

console.log("٢ب — من الجدول: هذا الفصل أو السابق");
{
  const terms = [
    { AdTermId: 1, AdTermName: "الفصل الأول 2025/2026" }, { AdTermId: 2, AdTermName: "الفصل الثاني 2025/2026" },
    { AdTermId: 3, AdTermName: "الفصل الصيفي 2025/2026" }, { AdTermId: 4, AdTermName: "الفصل الأول 2026/2027" },
  ];
  const options = nameFillSourceTerms(terms, 4);
  check(options.length === 2 && options[0].id === 4 && options[1].id === 2, "الأول 2026/2027 ← الخيار الثاني «الثاني 2025/2026» (الصيفي لا يُعدّ سابقاً)");
  check(nameFillSourceTerms(terms, 1).length === 1, "لا فصل قبله: خيارٌ واحد ولا مقبض");
  const panel = read("src/components/ImportNameFillPanel.tsx");
  check(panel.includes('role="radiogroup"') && panel.includes("termId=${term}"), "المقبض يغيّر فصلَ القراءة فعلاً");
  check(read("src/components/ScheduleTransfer.tsx").includes("terms={terms}"), "الشاشة تمرّر الفصول");
}

console.log("٢ج — الاسم الصحيح لا يبقى أحمر");
{
  check(normalizeArabicName("د. أنور عيسى عبدالرحمن الشعيب (منتدب)") === normalizeArabicName("أنور عيسى عبد الرحمن الشعيب"), "«(منتدب)» والمسافة في «عبد الرحمن» لا تمنع المطابقة");
  check(normalizeArabicName("أ.م.د. فاطمة") === normalizeArabicName("فاطمه") && normalizeArabicName("سارة محمد - متقاعدة") === normalizeArabicName("ساره محمد"), "«أ.م.د.» ووسم «متقاعدة» يُزالان");
  check(normalizeArabicName("محمد منتدب") === normalizeArabicName("محمد"), "وسمٌ بلا قوسين أيضاً");
  check(normalizeArabicName("علي‏ حسن") === normalizeArabicName("علي حسن"), "علامات الاتجاه الخفية تُزال");
  const people = [{ AdInstructorId: 41, AdInstructorName: "د. أنور عيسى عبدالرحمن الشعيب" }];
  check(resolveInstructorName("انور عيسى عبد الرحمن الشعيب منتدب", people).id === 41, "الاسم المقروء يُحلّ إلى صاحبه");
  const row = { AdCourseId: 135, SCode: "501", fmonday: true, fwednesday: true, fstarttime: "12:30", fendtime: "13:50", AdRoomCode: "011B17", AdRoomHall: "G29", AdInstructorId: 0,
    importEvidence: { instructor: { raw: "", confidence: "UNRESOLVED", reason: "لم يُقرأ اسم" }, course: { confidence: "CONFIRMED" } } };
  const plan = planNameFill([row], [{ ...row, AdInstructorId: 41, importEvidence: undefined }], people);
  const [filled] = applyNameFill([row], plan, new Set(), "من جدول الفصل الأول");
  const proof = (filled as any).importEvidence.instructor;
  check(filled.AdInstructorId === 41 && proof.confidence === "CONFIRMED" && proof.source === "MANUAL" && proof.method === "NAME_FILL", "السبب الجذري: البرهان كان يبقى UNRESOLVED فتُصبغ الخانة بالأحمر — الآن مؤكَّد يدوياً");
  check((filled as any).importEvidence.course.confidence === "CONFIRMED", "بقية البراهين كما هي");
  const table = read("src/components/ImportPreviewTable.tsx");
  check(table.includes("instructorRedWhy") && table.includes("لا أستاذ مرتبط بهذا الصف"), "الأحمر يقول سببه في سطر (تلميح)");
  const transfer = read("src/components/ScheduleTransfer.tsx");
  check(transfer.includes("resolvedInstructors: [...new Map([...(Array.isArray(prev.resolvedInstructors)") && transfer.includes("xlsxPreview.departmentInstructorIds"), "من رُبطوا بالتعبئة يدخلون قائمة العرض، والمطابقة على أهل القسم كما يقرؤهم النشر");
}

console.log("٣ — «كل المقررات»: أرقام كشف التسجيل");
{
  const card = (id: number, courseId: number, capacity: number) => ({ id, courseId, capacity, capacitySource: "course" });
  const context = {
    scope: { collegeId: 1, sectionId: 1, termId: 4 }, rows: [], outside: [], courses: [], instructors: [], halls: [], demand: null, loadLimits: {}, canWrite: false,
    registration: { remaining: { "10": 120, "11": 20 }, unregistered: { "10": 40 }, vacant: null, fileName: "كشف.pdf", importedAt: "2026-10-01", reportTerm: "" },
  } as unknown as TmContext;
  /* sectionCards يقرأ صفوف الجدول؛ نجرّب الحساب بصفّين لشعبتين بسعة 25 للمقرر 10. */
  const rows = [
    { id: 1, AdCollegeId: 1, AdSectionId: 1, AdTermId: 4, AdCourseId: 10, SCode: "501", AdInstructorId: 5, fsunday: true, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "B", AdRoomHall: "1" },
    { id: 2, AdCollegeId: 1, AdSectionId: 1, AdTermId: 4, AdCourseId: 10, SCode: "502", AdInstructorId: 5, fmonday: true, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "B", AdRoomHall: "1" },
  ];
  (context as any).rows = rows;
  (context as any).courses = [{ AdCourseId: 10, CourseCode: "110", CourseName: "مقرر", AdCollegeId: 1, AdSectionId: 1, MaxStudent: 25 }, { AdCourseId: 11, CourseCode: "111", CourseName: "آخر", AdCollegeId: 1, AdSectionId: 1, MaxStudent: 25 }];
  const stats = courseSeatStats(rows as any, context, [10, 11, 12]);
  const ten = stats.get(10)!, eleven = stats.get(11)!, twelve = stats.get(12)!;
  check(ten.sections === 2 && ten.seats === 50, "شعبتان × 25 = 50 مقعداً");
  check(ten.remaining === 120 && ten.demand === 120 && ten.demandSource === "remaining" && ten.withoutSeat === 70, "المتبقي 120 من الكشف ← 70 بلا مقعد (لا صفر)");
  check(ten.unregistered === 40, "«لم يسجّلوا» من الكشف نفسه");
  check(eleven.sections === 0 && eleven.withoutSeat === 20, "مقررٌ غير مطروح ومتبقّيه 20 ← 20 بلا مقعد");
  check(twelve.remaining === null && twelve.withoutSeat === null, "مقررٌ لم يذكره الكشف: «—» لا صفر");
  const legacy = courseSeatStats(rows as any, { ...context, registration: { remaining: null, unregistered: { "10": 30 }, vacant: null, fileName: "", importedAt: "", reportTerm: "" } } as any, [10]).get(10)!;
  check(legacy.demandSource === "unregistered" && legacy.demand === 30 && DEMAND_WORD.unregistered === "لم يسجّلوا", "كشفٌ قديم بعمود «لم يسجّلوا» وحده يُقاس به ويُسمّى");
  const radarOnly = courseSeatStats(rows as any, { ...context, registration: null, demand: { "10": { wanted: 60, seated: 50, capacity: 50, sections: 2 } } } as any, [10]).get(10)!;
  check(radarOnly.demandSource === "radar" && radarOnly.withoutSeat === 10, "بلا كشف: الرادار بديلاً");
  const server = read("src/server/timeMachineRoutes.ts");
  check(server.includes("Repository.getRegistrationStats(collegeId, sectionId, termId)") && server.includes("registration: registrationOf(stats, courseIds)"), "السبب الجذري للأصفار: السياق كان يقرأ الرادار وحده — الآن يقرأ كشف القسم للفصل المختار");
  check(server.includes('column === "notPassed" ? pick(stats.remaining)'), "بقانون التخطيط نفسه: عمود «الذين لم يجتازوا» هو المتبقي");
  const ui = read("src/components/AllCourses.tsx");
  check(ui.includes('data-ac-total="demand"') && ui.includes('data-ac-total="without-seat"'), "الرأس: المتبقي وبلا مقعد إجماليّاً");
  check(ui.includes("لا كشف تسجيل لهذا الفصل") && ui.includes("onImportStats"), "بلا كشف: «لا كشف تسجيل لهذا الفصل» ورابطٌ للاستيراد");
  check(read("src/components/ScheduleTransfer.tsx").includes('onImportStats={() => setTab("planning")}'), "الرابط يفتح «تخطيط الشعب» حيث يُستورد الكشف");
}

console.log("٤ — الإرشاد: منتقي الكلية والقسم في الرأس");
{
  const picker = read("src/components/AdvisingScopePicker.tsx");
  check(picker.includes("/api/colleges") && picker.includes("/api/sections"), "الخيارات من الخادم المصفّى بنطاق القارئ");
  check(picker.includes("is-fixed"), "خيارٌ واحد: وسمٌ ثابت لا منتقٍ");
  const registration = read("src/components/StudentRegistration.tsx");
  check(registration.includes("action={<AdvisingScopePicker") && !registration.includes('{ key: "college", label: "الكلية"'), "كشف التسجيل: الكلية والقسم في الرأس، والفصل في الشريط");
  const radar = read("src/components/RegistrationRehearsal.tsx");
  check(radar.includes("<AdvisingScopePicker") && radar.includes('params.set("collegeId"') && radar.includes('params.set("sectionId"'), "الرادار: منتقٍ في الرأس يُرسل النطاق");
  const sim = read("src/server/simulationRoutes.ts");
  check(sim.includes("const pickOf = (req: Request)") && (sim.match(/pick\.fits\(/g) || []).length >= 4, "الخادم يضيّق بالمنتقي في الملخص والأسباب والنتائج");
  check(sim.includes("(powerUser || deps.isScopeAllowed(req, row.collegeId, row.sectionId)) && pick.fits("), "يضيّق ولا يوسّع: شرط الصلاحية باقٍ");
  check(sim.includes("canRun: powerUser && !frozen"), "تشغيل الرادار لصاحب الصلاحية كما كان، أيّاً كان المنتقي");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
