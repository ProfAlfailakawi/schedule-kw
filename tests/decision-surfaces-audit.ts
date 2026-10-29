/**
 * ── التقارير ومختبر القرار والتخطيط ومركز الذكاء والتنبّؤ ولوحة القرار ──────
 * (ملاحظات المالك 2026-10-28: J1، J2، K1–K5)
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAcademicDecisionLab } from "../src/utils/academicDecisionLab";
import { analyseAcademicAdvice, type AcademicPlanView } from "../src/utils/academicAdvisory";
import { teachingHoursByInstructor } from "../src/utils/teachingLoad";
import { effectiveCourseHours } from "../src/utils/scheduleRegulations";
import { classifyActionableError } from "../src/utils/actionableError";
import { planItemTier, triagePlanItems, planItemSignature, type PlanDecision } from "../src/utils/planTriage";
import { canSeeDecisionBoard, decisionBoardScope } from "../src/utils/decisionBoardScope";
import ActionableErrorNotice from "../src/components/ActionableErrorNotice";
import type { GapItem } from "../src/utils/sectionGap";
import type { AdCourse, FSchedule, StudentProfile } from "../src/types";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const reports = read("src/components/Reports.tsx");

console.log("J2 — «القاعات والأساتذة» يعمل");
check(/const roomTeacherIndex = useMemo\(\(\) => roomInstructorDirectory\(/.test(reports), "الفهرس قيمةٌ محسوبة لا دالة (كان useMemo يعيد دالة فينهار التقرير)");
check(!/useMemo\(\(\) => \(\) =>/.test(reports), "لا useMemo آخر يعيد دالةً بدل قيمة في التقارير");

console.log("J1 — النصاب ورموز المقررات");
{
  /* خمسة مقررات لأستاذ واحد، اثنان منها في كلية شقيقة: كانت ساعاتها صفراً (المقرر غير معروف) فخرج «6 س». */
  const course = (id: number, hours: number | undefined, credit: number) => ({ AdCourseId: id, CourseHours: hours, CourseCredit: credit } as unknown as AdCourse);
  const catalogue = [course(1, 3, 3), course(2, 3, 3), course(3, undefined, 3), course(11, 3, 3), course(12, 3, 3)];
  const row = (id: number, courseId: number, college: number, section: string) => ({ id, AdInstructorId: 7, AdCourseId: courseId, AdCollegeId: college, AdSectionId: college * 10, SCode: section } as FSchedule);
  const rows = [row(1, 1, 1, "501"), row(2, 1, 1, "501"), row(3, 2, 1, "502"), row(4, 3, 1, "503"), row(5, 11, 2, "501"), row(6, 12, 2, "502")];
  const hours = (list: AdCourse[]) => teachingHoursByInstructor(rows, new Map(list.map(c => [Number(c.AdCourseId), effectiveCourseHours(c)]))).get(7);
  check(hours(catalogue.slice(0, 2)) === 6, "خريطة القسم وحدها (القديم): 6 س لخمسة مقررات — هذا هو الخطأ المُبلَّغ");
  check(hours(catalogue) === 15, "بمقررات الكلية الشقيقة وCourseCredit عند غياب CourseHours: 15 س");
  check(reports.includes("scopeGapCourses") && reports.includes("/api/courses?sectionId=${id}"), "التقارير تستكمل مقررات الأقسام التي تحملها الصفوف");
  check(/group\.teaching/.test(reports) && reports.includes("نصاب تدريسي: ساعات المقررات المعتمدة"), "الساعات على الشاشة نصابٌ معتمد لا دقائق اتصال");
  check(reports.includes("`${Number(row.AdInstructorId) || 0}\\u0000${nameOf(row)}`"), "تقرير الأساتذة المطبوع يجمع بالمعرّف لا بالاسم");
  const authority = read("src/components/AuthorityPdfReport.tsx");
  check(authority.includes("course?.CourseCode || row.CourseCodeSnapshot"), "تقرير الهيئة: رمز المقرر من اللقطة إن غاب المقرر");
}

console.log("K1 — مختبر القرار: قمعٌ صادق لكل أداة");
{
  const plan: AcademicPlanView = { planId: "p", courseIds: [1, 2, 3, 9], rules: [{ courseId: 1 }, { courseId: 2 }, { courseId: 3 }, { courseId: 9 }], groups: [] };
  const course = (id: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: String(id), CourseName: `مقرر ${id}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 } as AdCourse);
  const slot = (id: number, courseId: number, section: string, start: string, end: string, day: string): FSchedule =>
    ({ id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 5, AdCourseId: courseId, SCode: section, fstarttime: start, fendtime: end, [day]: true, AdInstructorId: 100 + id, roomId: `r${id}` } as unknown as FSchedule);
  const rows = [slot(1, 1, "501", "08:00", "09:20", "fmonday"), slot(2, 2, "501", "08:00", "09:20", "fmonday"), slot(3, 3, "501", "11:00", "12:20", "fmonday")];
  /* كل طالب يريد أيضاً المقرر 9 غير المطروح: كان شرط «كل الرغبات مطروحة» يُسقطهم جميعاً. */
  const profiles = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i}`, AdCollegeId: 1, AdSectionId: 1, curriculumPlanId: "p", passedCourseIds: [], passedUnits: 0,
    wishes: { termId: 5, courseIds: [1, 2, 9], constraints: {}, targetUnits: 15, updatedAt: "" },
  } as unknown as StudentProfile));
  const input = { collegeId: 1, sectionId: 1, termId: 5, plans: [plan], courses: [1, 2, 3, 9].map(course), rows, profiles };
  const lab = buildAcademicDecisionLab(input, analyseAcademicAdvice(input));
  const d = lab.diagnostics!;
  check(Boolean(d), "المختبر يحمل تشخيصه");
  check(d.profiles === 5 && d.withWishes === 5 && d.withPlan === 5, `القمع: ملفات ${d.profiles} ← رغبات ${d.withWishes} ← صحيفة ${d.withPlan}`);
  check(d.eligible === 5, "طالبٌ رغب في مقرر غير مطروح ما زال يُفحص على مقرراته المطروحة");
  check(d.timesTested > 0 && lab.scenarios.length > 0, `تعارض 1×2 يوم الاثنين 08:00 يُحل بنقل شعبة: ${lab.scenarios.length} فرصة`);
  const panel = read("src/components/AcademicDecisionLabPanel.tsx");
  check(panel.includes("data-adl-funnel") && panel.includes("من أين جاء الرقم؟"), "«الثقة والتفسير» تعرض القمع دائماً، والحالة الفارغة تقول أين توقّف الدليل");
  check(read("src/components/AcademicAdvicePanel.tsx").includes("open={open}") && !read("src/components/AcademicAdvicePanel.tsx").includes("defaultOpen={demo}"), "بطاقة «فرصة لتحسين الجدول» تُفتح فعلاً (defaultOpen ليس خاصية details)");
}

console.log("K2 — التخطيط: ثلاثة رفوف وقرارات بأسبابها");
{
  const item = (id: number, code: string, existing: number, required: number, extra = required - existing, more: Partial<GapItem> = {}): GapItem =>
    ({ id, code, name: `مقرر ${id}`, existing, required, extra, basis: "plan", demand: 10, ...more });
  check(planItemTier(item(1, "A", 0, 1)).tier === "urgent", "لا شعبة مطروحة ← ⛔ عاجل");
  check(planItemTier(item(2, "B", 1, 3)).tier === "urgent", "ينقص شعبتان ← ⛔ عاجل");
  check(planItemTier(item(3, "C", 1, 2)).tier === "important", "ينقص شعبة ← ⚠️ مهم");
  check(planItemTier(item(4, "D", 2, 2, 0, { conflict: { openingRequired: 3, reportRequired: 1 } })).tier === "important", "تقديران متعارضان ← ⚠️ مهم");
  check(planItemTier(item(5, "E", 3, 1, 0, { surplus: 2 })).tier === "opportunity", "فائض ← 💡 فرصة");
  const items = [item(1, "A", 0, 1), item(3, "C", 1, 2), item(6, "C", 1, 3), item(5, "E", 3, 1, 0, { surplus: 2 })];
  const fresh = triagePlanItems(items);
  check(fresh.duplicates === 1 && fresh.live.length === 3, "الرمز نفسه بمعرّفين: بندٌ واحد، والمكرر يُعدّ");
  check(fresh.live[0].tier === "urgent" && fresh.live[fresh.live.length - 1].tier === "opportunity", "الترتيب: عاجل ثم مهم ثم فرصة");
  const decisions: Record<string, PlanDecision> = { "1": { state: "ignored", reason: "لا قاعة", at: "", signature: planItemSignature(items[0]) } };
  const after = triagePlanItems(items, decisions);
  check(after.counts.total === 2 && after.handled.length === 1, "العدّ حيّ: المتجاهَل بسببه يخرج من الشارة");
  const changed = triagePlanItems([item(1, "A", 0, 2), ...items.slice(1)], decisions);
  check(changed.counts.urgent === 2 && changed.handled.length === 0, "تغيّر الأرقام يُعيد البند — القرار مشدود إلى ما قُرّر عليه");
  const view = read("src/components/PlanTriageView.tsx");
  check(view.includes("عالج") && view.includes("تجاهل") && view.includes("السبب (مطلوب)"), "لكل بند «عالج» و«تم» و«تجاهل» بسببٍ مطلوب");
  check(read("src/components/ApprovalBar.tsx").includes("<SectionGapBadge items={livePlanItems}"), "شارة «التخطيط» تعدّ المفتوح فقط");
  check(read("src/components/Schedules.tsx").includes("FOCUS_COURSE_EVENT"), "«عالج» يبرز مواعيد المقرر على الأسبوع");
}

console.log("K2 — قرارات «تم/تجاهل» مشتركة على الخادم");
{
  /* المستودع في صندوق تجريبي: الكتابة تُقرأ لكل من في النطاق نفسه، ولا تتسرّب لنطاقٍ آخر. */
  const { Repository } = await import("../src/db/repository");
  const session = `demo_plan_triage_${Date.now()}`;
  Repository.createDemoSandbox(session, 60_000);
  await Repository.withDemoSandbox(session, async () => {
    const scope = { collegeId: 1, sectionId: 1, termId: 1 };
    const saved = await Repository.setPlanTriageDecision(scope, 42, { state: "ignored", reason: "لا قاعة", signature: "42:1:2:1:0:", at: "2026-10-28T10:00:00.000Z", byUserId: 16, byName: "د. رئيس لجنة" });
    const read = await Repository.getPlanTriageDecisions(1, 1, 1);
    check(saved?.id === "1:1:1:42" && read.length === 1 && read[0].byName === "د. رئيس لجنة" && read[0].reason === "لا قاعة", "القرار يُحفظ مرة لكل مقرر في النطاق ويحمل من قرّر");
    check((await Repository.getPlanTriageDecisions(1, 2, 1)).length === 0 && (await Repository.getPlanTriageDecisions(1, 1, 2)).length === 0, "لا يتسرّب إلى قسمٍ أو فصلٍ آخر");
    await Repository.setPlanTriageDecision(scope, 42, { state: "done", reason: "", signature: "42:1:2:1:0:", at: "2026-10-28T11:00:00.000Z", byUserId: 17, byName: "د. رئيس القسم" });
    const again = await Repository.getPlanTriageDecisions(1, 1, 1);
    check(again.length === 1 && again[0].state === "done" && again[0].byUserId === 17, "قرارٌ جديد يحلّ محلّ السابق، لا يتكرر");
    await Repository.setPlanTriageDecision(scope, 42, null);
    check((await Repository.getPlanTriageDecisions(1, 1, 1)).length === 0, "«إرجاع» يحذف القرار");
  });
  Repository.dropDemoSandbox(session);
  const server = readServerSource();
  const route = server.slice(server.indexOf('app.put("/api/schedules/section-gap/decisions"'), server.indexOf('app.get("/api/schedules/section-gap", '));
  check(server.includes('app.get("/api/schedules/section-gap/decisions", requirePermission(7)') && route.includes("requirePermission(7)") && route.includes("isScopeAllowed(req, collegeId, sectionId)"), "المساران بصلاحية التخطيط نفسها (الإذن 7 + نطاق الكلية والقسم)");
  check(route.includes("التجاهل يحتاج سبباً مكتوباً") && route.includes("byName: String(req.user?.Name"), "الخادم يرفض تجاهلاً بلا سبب، ويكتب اسم صاحب القرار ووقته من الجلسة لا من الطلب");
  const triageSource = read("src/utils/planTriage.ts");
  check(triageSource.includes("/api/schedules/section-gap/decisions") && triageSource.includes("plan-triage-pending:") && triageSource.includes('if (error?.status) throw error;'), "localStorage احتياطٌ للانقطاع فقط: يُصفّ ما لم يصل ويُرسل عند العودة، والرفض لا يُصفّ");
  const bar = read("src/components/ApprovalBar.tsx");
  check(bar.includes("loadPlanDecisions(triageScope)") && bar.includes('window.addEventListener("online", online)') && !bar.includes("writePlanDecisions(triageScope"), "الشريط يقرأ القرارات المشتركة ويُفرغ الطابور عند عودة الاتصال");
  const { decisionInitials } = await import("../src/components/PlanTriageView");
  check(decisionInitials("د. أحمد الفيلكاوي") === "أف" && decisionInitials("") === "؟", "الأحرف الأولى لصورة صاحب القرار");
  const view = read("src/components/PlanTriageView.tsx");
  check(view.includes("<DecidedBy decision={entry.decision} />") && view.includes("dateTime={decision.at}"), "البند المُعالَج يعرض من قرّر ومتى");
  check(read("src/components/DecisionBoard.tsx").includes("loadPlanDecisions("), "لوحة القرار تقرأ القرارات المشتركة نفسها");
}

console.log("K3 — مركز الذكاء: قراءةٌ فاشلة لا تُسقط الصفحة");
{
  const workspace = read("src/components/IntelligenceWorkspace.tsx");
  check(workspace.includes("Promise.allSettled(sources.map(source => source.run()))"), "القراءات الثانوية تستقرّ كلٌّ وحدها (كانت Promise.all تُسقط السبع بفشل واحدة)");
  check(workspace.includes("<ActionableErrorNotice") && workspace.includes("showTechnical={isPowerAdmin}"), "الخطأ بأيقونة وسبب وإعادة محاولة؛ التفاصيل التقنية للمدير فقط");
  const server = readServerSource();
  check(/code: "INTERNAL", ref \}/.test(server) && server.includes("[api-error] ref=%s"), "خطأ الخادم يحمل رمز مرجع يطابق سطر السجل");
  const internal = classifyActionableError(Object.assign(new Error("تعذّر إتمام العملية الآن"), { status: 500, ref: "EABC12", url: "/api/intelligence/genome?x=1" }));
  check(internal.kind === "server" && internal.retryable && internal.technical.includes("EABC12") && internal.technical.includes("/api/intelligence/genome") && !internal.technical.includes("x=1"), "500 ← «تعذّرت القراءة» + مرجع + مسار بلا استعلام");
  check(classifyActionableError({ message: "خارج صلاحيات", status: 403 }).kind === "permission" && !classifyActionableError({ status: 403 }).retryable, "403 ← خارج صلاحيتك، بلا إعادة محاولة");
  check(classifyActionableError(new TypeError("Failed to fetch")).kind === "offline", "انقطاع ← لا اتصال");
  check(classifyActionableError({ message: "x", status: 404 }).kind === "missing", "404 ← غير متاح بعد");
  const html = renderToStaticMarkup(React.createElement(ActionableErrorNotice, { error: internal, onRetry: () => undefined, showTechnical: false }));
  check(html.includes("أعد المحاولة") && html.includes("تعذّرت القراءة") && !html.includes("EABC12"), "البطاقة: أيقونة وعنوان وزر، والمرجع مخفيّ عن غير المدير");
}

console.log("K4 — التنبّؤ: لا رقم بلا دليل");
{
  const panel = read("src/components/PredictiveInsightPanel.tsx");
  check(panel.includes('row.confidence.level === "insufficient"') && panel.includes("بيانات غير كافية"), "المقررات بلا تاريخ كافٍ في «بيانات غير كافية» بلا رقم");
  check(panel.includes("ليش؟") && panel.includes("row.reason"), "لكل رقم «ليش؟» من سبب المحرّك نفسه");
  check(panel.includes("pi-range") && panel.includes("row.low") && panel.includes("row.high"), "المدى ظاهر بجانب الرقم");
  check(panel.includes("data-kpi") && panel.includes("ساعات ضغط قاعات") && panel.includes("مسبقات تحجز دفعة"), "ملخص بلمحة: نقص، فائض، رغبات، ضغط قاعات، مسبقات، بيانات غير كافية");
  check(!/predictDemand\(|confidenceFrom\(/.test(panel), "لا منطق تنبّؤ مكرر في الواجهة");
}

console.log("K5 — لوحة القرار للقراءة بحسب الصفة");
{
  const sections = [{ AdSectionId: 1, AdCollegeId: 1 }, { AdSectionId: 2, AdCollegeId: 1 }, { AdSectionId: 3, AdCollegeId: 2 }];
  check(!canSeeDecisionBoard({ roleId: "committeeChair", isPowerAdmin: false }) && !canSeeDecisionBoard({ roleId: "standard", isPowerAdmin: false }), "لا تظهر لغير رئيس القسم والعميد ومن فوقهما");
  const head = decisionBoardScope({ roleId: "departmentHead", isPowerAdmin: false, scopes: [{ AdCollegeId: 1, AdSectionId: 2 }] }, { collegeId: 1, sectionId: 2, sections });
  check(head.kind === "department" && head.kind === "department" && head.sectionIds.join() === "2", "رئيس القسم: قسمه وحده");
  const outside = decisionBoardScope({ roleId: "departmentHead", isPowerAdmin: false, scopes: [{ AdCollegeId: 1, AdSectionId: 2 }] }, { collegeId: 1, sectionId: 1, sections });
  check(outside.kind === "none", "ولا قسماً خارج نطاقه");
  const dean = decisionBoardScope({ roleId: "dean", isPowerAdmin: false, scopes: [{ AdCollegeId: 1, AdSectionId: 0 }] }, { collegeId: 1, sectionId: 0, sections });
  check(dean.kind === "college" && dean.sectionIds.join() === "1,2", "العميد: كل أقسام كليته، لا أقسام كلية أخرى");
  const admin = decisionBoardScope({ roleId: "standard", isPowerAdmin: true, scopes: [] }, { collegeId: 2, sectionId: 0, sections });
  check(admin.kind === "college" && admin.sectionIds.join() === "3", "المدير: الكلية المختارة");
  const board = read("src/components/DecisionBoard.tsx");
  check(board.includes("readOnly") && board.includes("canSchedule={false}") && !board.includes("onDecide"), "اللوحة لا تكتب: لا تم/تجاهل ولا فتح شعبة بضغطة");
  check(reports.includes('{ id: "decision", label: "لوحة القرار"') && reports.includes('dean:           ["balance", "list", "week", "decision"'), "العدسة في الاستعلامات، وللعميد بعد ميزان الأقسام والجداول");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
