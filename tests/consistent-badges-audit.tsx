/**
 * ── الشارات الموحّدة: كلُّ وسوم المقرر معاً، ووسما الشخص بترتيبٍ واحد ─────────────
 *
 * ملاحظةُ المالك: «مهارات تكنولوجيا التعليم» متطلبُ كليةٍ وفي صحيفة 2026 معاً، فكانت قائمةُ
 * «ماذا؟ المقرر» تُظهر «متطلب كلية» وحدها. ثم: «🎓 تدريب» بجانب المتدرّب، و«منتدب» واحدٌ في كل مكان.
 *
 *   C — القاعدة الواحدة (src/utils/courseTags.ts): كلُّ ما ينطبق، بترتيبٍ ثابت.
 *   S — الخادم: نوعُ المتطلب وصحيفةُ مقرر الخدمة من المصدر الواحد (/api/plan-badges وبطاقة الأستاذ).
 *   U — كلُّ شاشةٍ مطلوبة ترسم المكوّنين المشتركين (CourseTags وPersonChips).
 *   P — «🎓 تدريب» لمن طلبُه بصفة مرحلة التدريب، و«منتدب» كما هو حرفاً بحرف.
 */
import fs from "node:fs";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COURSE_TAGS_JS, NEW_SHEET_TAG, authoritativeRequirementKind, REACH_LOCKED_TAG, REQUIREMENT_LABEL,
  courseTagsOf, courseTagsText, parseCourseTagsText, requirementKindOfRule,
} from "../src/utils/courseTags";
import { NEW_SHEET_BADGE } from "../src/utils/proposalCourseChoices";
import { proposalLauncherChoices } from "../src/utils/instructorPickerChoices";
import { TRAINEE_LABEL, withPersonSuffix, withVisitingSuffix } from "../src/utils/visitingText";
import CourseTags from "../src/components/CourseTags";
import PersonChips from "../src/components/PersonChips";
import VisitingBadge from "../src/components/VisitingBadge";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

/* ── C: القاعدة الواحدة ─────────────────────────────────────────────────── */
{
  const both = courseTagsOf({ sheet: "صحيفة 2026", kind: "college", service: true });
  check(both.map(tag => tag.label).join(" | ") === "صحيفة 2026 | متطلب كلية", "C1 متطلبُ كليةٍ وفي صحيفة 2026: الوسمان معاً (لا واحدٌ يغلب)", both);
  const all = courseTagsOf({ reachLocked: true, kind: "university", sheet: "صحيفة 2026" });
  check(all.map(tag => tag.key).join() === "sheet,kind,reach" && all.map(tag => tag.label).join(" | ") === `صحيفة 2026 | متطلب جامعة | ${REACH_LOCKED_TAG}`, "C2 الترتيبُ ثابت: الصحيفة ← نوعُ المتطلب ← «🔒 لم نصل بعد»", all);
  check(courseTagsOf({ kind: "elective" })[0]?.label === "اختياري" && REQUIREMENT_LABEL.department === "متطلب قسم", "C3 «اختياري» و«متطلب قسم» من القائمة الواحدة");
  check(requirementKindOfRule("compulsory") === null && requirementKindOfRule("college") === "college" && courseTagsOf({}).length === 0, "C4 «إجباري» بلا وسم — هو الأصل (CURRICULUM_SHEET_RULES §١٠)");
  check(courseTagsOf({ newSheet: true })[0]?.label === NEW_SHEET_TAG && NEW_SHEET_BADGE === NEW_SHEET_TAG && courseTagsOf({ newSheet: true, sheet: "صحيفة 2026" })[0]?.label === "صحيفة 2026", "C5 «🆕 صحيفة جديدة» احتياطٌ حين لا يصل اسمُ الصحيفة، ونصُّه واحد في المقترح");
  const text = courseTagsText(courseTagsOf({ sheet: "صحيفة 2026", kind: "college", service: true, reachLocked: true }));
  check(text === `صحيفة 2026 · متطلب كلية · ${REACH_LOCKED_TAG}`, "C6 نصُّ خيار القائمة: الوسومُ كلُّها بفاصلٍ واحد", text);
  const back = parseCourseTagsText(`${REACH_LOCKED_TAG} · متطلب كلية · صحيفة 2026`);
  check(back.map(tag => tag.label).join(" | ") === `صحيفة 2026 | متطلب كلية | ${REACH_LOCKED_TAG}`, "C7 النصُّ يُفكّ إلى وسومه بالترتيب الثابت أيّاً كان ترتيبُ كتابته", back);
  check(parseCourseTagsText("صحيفة 2026 · متطلب").map(tag => tag.label).join(" | ") === "صحيفة 2026 | متطلب كلية", "C8 النصُّ القديم «متطلب» = «متطلب كلية»");
  check(both.every(tag => tag.print) && !all.find(tag => tag.key === "reach")!.print && !courseTagsOf({ kind: "elective" })[0].print, "C9 الطباعة مجمّدة: الصحيفة ومتطلبُ الخدمة كما كانا، ولا وسمَ جديد يُطبع");

  const html = renderToStaticMarkup(<CourseTags tags={both} />);
  check(/^<span class="ctags"><span class="ctag plan-badge" data-ctag="sheet"[^>]*>صحيفة 2026<\/span><span class="ctag course-service-badge" data-ctag="kind"[^>]*>متطلب كلية<\/span><\/span>$/.test(html), "C10 CourseTags: سطرٌ واحد بالشارتين، بأصنافهما القديمة (كلُّ سياقٍ يضبط حجمهما يبقى يعمل)", html);
  const locked = renderToStaticMarkup(<CourseTags tags={all} />);
  check(/data-ctag="reach" data-print="0"/.test(locked) && /ctag-reach/.test(locked), "C11 «🔒 لم نصل بعد» لا يُطبع");
  check(renderToStaticMarkup(<CourseTags text="صحيفة 2026 · متطلب كلية" />) === html, "C12 من نصّ القائمة أو من الحقائق: الشكلُ نفسه");
  check(renderToStaticMarkup(<CourseTags tags={courseTagsOf({ sheet: "صحيفة 2026", kind: "elective", reachLocked: true })} printOnly />) === renderToStaticMarkup(<CourseTags tags={courseTagsOf({ sheet: "صحيفة 2026" })} />)
    && read("src/components/AuthorityPdfReport.tsx").includes("<CourseTags courseId={row.AdCourseId} printOnly />"), "C13 تقرير الهيئة المطبوع (ومعاينته): الصحيفة ومتطلبُ الخدمة فقط كما كان");
}

/* ── S: الخادم والمصدر الواحد ────────────────────────────────────────────── */
{
  const routes = read("src/server/planReviewRoutes.ts");
  const shared = read("src/server/planBadgeShared.ts");
  const badges = read("src/utils/planBadges.ts");
  check(/res\.json\(\{ ok: true, badges, services, kinds \}\)/.test(routes) && /for \(const row of \[\.\.\.facts\.sheets, \.\.\.await planBadgeRows\(\)\]\)/.test(routes), "S1 /api/plan-badges: الصحيفة (صحيفةُ القسم تكتب فوق صحيفة الخدمة) ونوعُ المتطلب، بنطاق الحساب");
  check(/if \(!fresh \|\| !previous\.length\) continue;/.test(routes.slice(routes.indexOf("const courseFactRows"))) && /before\.has\(id\)/.test(routes), "S2 صحيفةُ مقرر الخدمة بقاعدة شارة الصحيفة نفسها: ما دامت الصحيفتان معاً، وما طلبته الجديدةُ وحدها");
  check(/kinds\.set\(id, \{ kind: serviceKinds\.get\(id\) \|\| "college", service: true/.test(routes) && /const kind = authoritativeRequirementKind\(rules\);/.test(routes), "S3 مقرر الخدمة «متطلب كلية» (أو «جامعة» إن كتبته الصحيفة الطالبة)، وإلا نوعُه في صحيفة قسمه");
  /* مراجعة #326: القاعدةُ الحاكمة أولاً ثم الوسم — «إجباري» في الجديدة يمحو «اختياري» الانتقالية، أيّاً كان ترتيبُ القراءة. */
  check(authoritativeRequirementKind([{ kind: "elective", active: false }, { kind: "compulsory", active: true }]) === null
    && authoritativeRequirementKind([{ kind: "compulsory", active: true }, { kind: "elective", active: false }]) === null, "S3b إجباريٌّ في الصحيفة الجديدة واختياريٌّ في الانتقالية: بلا «اختياري»");
  check(authoritativeRequirementKind([{ kind: "compulsory", active: false }, { kind: "elective", active: true }]) === "elective"
    && authoritativeRequirementKind([{ kind: "college", active: false }]) === "college"
    && authoritativeRequirementKind([{ kind: undefined, active: true }, { kind: "elective", active: false }]) === null
    && authoritativeRequirementKind([]) === null, "S3c الجديدةُ تحكم دائماً، والانتقاليةُ وحدها حين لا جديدة");
  check(!/kind && \(!known/.test(routes) && /ownRules\.set\(id, \[\.\.\.\(ownRules\.get\(id\) \|\| \[\]\), \{ kind: rule\.kind, active: plan\.status === "active" \}\]\)/.test(routes), "S3d الخادم يجمع القواعد كلها قبل الحكم (لا يتخطّى «إجباري»)");
  check(/const key = serviceKey\("facts"\);/.test(routes), "S4 ذاكرةُ الحقائق تحمل عالَمَها (الصندوق التجريبي لا يخلط بالحقيقي)");
  check(/export async function courseTagFactsFor/.test(shared) && /setCourseFactSource\(/.test(routes), "S5 بطاقةُ الأستاذ والمقترح العام يقرآن الحقائق نفسها من الجسر المشترك");
  check(/return courseTagsText\(courseTagsOf\(\{ \.\.\.courseTagFacts\(courseIds, badges\)/.test(badges) && /kinds = \(data && typeof data\.kinds === "object" && data\.kinds\) \|\| \{\};/.test(badges), "S6 قوائم الاختيار تبني نصّها من القاعدة الواحدة");
  check(read("src/server/routes/offeringRoutes.ts").includes("const planBadges = await planBadgesFor(courses.map("), "S7 اقتراحُ المقررات المستقبلية يبقى على صحيفة القسم وحدها (الوسمُ للعرض فقط)");

  /* بطاقة الأستاذ: الدالةُ نفسها في المتصفح. */
  const sandbox: any = { data: { planBadges: { "1:5": "صحيفة 2026" }, courseKinds: { "1:5": "college" }, serviceCourses: ["1:9"] }, esc: (v: unknown) => String(v) };
  vm.runInNewContext(COURSE_TAGS_JS, sandbox);
  const card = sandbox.courseTagsHtml(5, 1);
  check(card === '<span class="ctags"><span class="sk-plan-tag">صحيفة 2026</span><i class="req-tag">متطلب كلية</i></span>', "S8 بطاقةُ الأستاذ: الوسمان معاً بالترتيب نفسه", card);
  check(sandbox.courseTagsHtml(9, 1) === '<span class="ctags"><i class="req-tag">متطلب كلية</i></span>' && sandbox.courseTagsHtml(7, 1) === "", "S9 ومقرر خدمةٍ بلا نوعٍ واصل «متطلب كلية»، وبلا وسمٍ لا شيء");
  const page = read("src/server/pages/instructorRequestPage.ts");
  check(page.includes("${COURSE_TAGS_JS}") && page.includes("esc(c.name||c.code)+courseTagsHtml(c.id,c.sectionId)") && page.includes("return courseTagsHtml(courseIdOf(it),sid)") && !/function skPlanTag|متطلب كلية<\/i>/.test(page), "S10 كلُّ مواضع البطاقة (موعد جديد، القائم، القرار، الشعب الشاغرة للمدرّب) من الدالة الواحدة");
  const req = read("src/server/routes/publicRequestRoutes.ts");
  check(/\.\.\.\(offerings as any\[\]\)\.map\(option => \(\{ courseId: option\.courseId, sectionId: option\.sectionId \}\)\)/.test(req) && /courseKinds: tagFacts\.kinds,/.test(req), "S11 الكرت يتلقّى الوسوم لمقرراته والإضافة والشعب الشاغرة");
  check(/kindLabel: kindOf\(op\)/.test(read("src/server/studyProposalRoutes.ts")) && read("src/server/studyProposalPage.ts").includes('esc(t.kindLabel||"متطلب كلية")'), "S12 صفحةُ المقترح العامة: «متطلب كلية» بنصّه الكامل بعد الصحيفة");
}

/* ── U: كلُّ شاشةٍ مطلوبة ترسم المكوّنين المشتركين ───────────────────────── */
{
  const courseScreens: Array<[string, RegExp, string]> = [
    ["src/components/Schedules.tsx", /badge: courseOptionBadge\(ids, planBadges, \{ reachLocked: ids\.some\(id => reachLocked\(formReach\.data\?\.courses\?\.\[id\]\)\) \}\)/, "موعد جديد/تعديل/الاستوديو: القائمة بوسومها كلها و«🔒» من حكم النموذج"],
    ["src/components/QuickCreatePopover.tsx", /badge: courseOptionBadge\(\[Number\(c\.AdCourseId\)\], planBadges\)/, "الإضافة السريعة"],
    ["src/components/proposal/ProposalCoursePicker.tsx", /badge: courseOptionBadge\(choice\.memberIds, planBadges, \{ newSheet: choice\.isNew, reachLocked: reachLocked\(choice\.reach\) \}\)/, "المقترح الدراسي «شعبة جديدة»: كلُّ الوسوم لا واحدٌ منها"],
    ["src/components/AllCourses.tsx", /<CourseTags courseId=\{courseId\} reach=\{reach\} newSheet=\{tag === "new"\} \/>/, "كل المقررات"],
    ["src/components/SectionSimulator.tsx", /<CourseTags courseId=\{card\.courseId\} newSheet=\{sheet === "new"\} \/>/, "محاكي الشعب (آلة الزمن)"],
    ["src/components/CourseOfferingPanel.tsx", /<b>\{course\.name\}<\/b><CourseTags courseId=\{course\.id\} \/>/, "لوحة حالة الطرح"],
    ["src/components/InstructorInbox.tsx", /<CourseTags courseId=/, "وارد الأساتذة"],
    ["src/components/Reports.tsx", /<CourseTags courseId=\{row\.AdCourseId\} \/>/, "التقارير على الشاشة"],
    ["src/components/CurriculumPlans.tsx", /badge: courseOptionBadge\(\[Number\(course\.AdCourseId\)\], planBadges\)/, "الصحائف: منتقي المقرر"],
    ["src/components/SearchableSelect.tsx", /\{option\.chips\}\{option\.badge \? <CourseTags text=\{option\.badge\} \/> : null\}/, "القائمة المشتركة ترسم الوسوم بالمكوّن الواحد"],
  ];
  for (const [file, pattern, label] of courseScreens) check(pattern.test(read(file)), `U ${label}`);
  const stray = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? stray(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) && /PlanBadge\b(?!s)|tm-sheet-tag|ac-tag-|REACH_LOCKED_BADGE/.test(read(`${dir}/${entry.name}`)) ? [`${dir}/${entry.name}`] : []);
  check(!fs.existsSync("src/components/PlanBadge.tsx") && stray("src").length === 0, "U لا شارةَ مقررٍ يدوية باقية (PlanBadge، tm-sheet-tag، ac-tag)", stray("src"));

  const people: Array<[string, RegExp, string]> = [
    ["src/components/InstructorInbox.tsx", /<PersonChips visiting=\{isVisiting\(row\.AdInstructorId, row\.AdCollegeId, row\.AdSectionId\)\} trainee=\{isTaRequest\(row\)\} \/>/, "الوارد: ترويسة الطلب"],
    ["src/components/proposal/ProposalInboxParts.tsx", /chips: <PersonChips visiting=\{choice\.visiting\} trainee=\{choice\.trainee\} \/>/, "منتقي أستاذ المقترح الدراسي"],
    ["src/components/proposal/ProposalHeader.tsx", /<PersonChips visiting=\{visiting\} trainee=\{trainee\} \/><\/h1>/, "رأس المقترح"],
    ["src/components/InstructorPicker.tsx", /<PersonChips visiting=\{visitingSet\.has\(person\.AdInstructorId\)\} trainee=\{trainees\.has\(Number\(person\.AdInstructorId\)\)\} \/>/, "منتقي أستاذ الموعد"],
    ["src/components/TeacherMiniWeek.tsx", /<PersonChips visiting=\{visiting\} trainee=\{trainee\} \/>/, "رأس الأسبوع المصغّر"],
    ["src/components/SchedulePublish.tsx", /<PersonChips visiting=\{isVisiting\(person\.AdInstructorId, collegeId, sectionId\)\} trainee=\{trainees\.has\(Number\(person\.AdInstructorId\)\)\} \/>/, "النشر: قائمة الإرسال"],
    ["src/components/Reports.tsx", /const personChips = \(id: unknown, visiting = isVisitingInstructor\(Number\(id\)\)\) => <PersonChips/, "التقارير على الشاشة"],
    ["src/components/Schedules.tsx", /<PersonChips visiting=\{formVisiting\(form\.AdInstructorId\)\} trainee=\{formTrainees\.has\(Number\(form\.AdInstructorId\)\)\} \/>/, "نموذج الموعد: ملخّص الأستاذ"],
  ];
  for (const [file, pattern, label] of people) check(pattern.test(read(file)), `U ${label}`);
  check((read("src/components/Reports.tsx").match(/\{personChips\(/g) || []).length >= 12, "U التقارير: كلُّ اسم أستاذٍ على الشاشة بوسميه");
  check(read("src/index.css").includes('@import "./styles/44-course-tags.css";') && read("src/index.css").includes('@import "./styles/45-person-chips.css";'), "U الأنماطُ في الورقة العامة");
}

/* ── P: «🎓 تدريب» و«منتدب» ─────────────────────────────────────────────── */
{
  const visitingOnly = renderToStaticMarkup(<PersonChips visiting />);
  check(visitingOnly === renderToStaticMarkup(<VisitingBadge compact />) && visitingOnly === '<span class="visiting-badge compact">منتدب</span>', "P1 «منتدب» وحده كما كان حرفاً بحرف (بلا غلاف)", visitingOnly);
  const both = renderToStaticMarkup(<PersonChips visiting trainee />);
  check(both === `<span class="visiting-badge compact">منتدب</span><span class="ta-badge compact" title="في مرحلة التدريب">${TRAINEE_LABEL}</span>`, "P2 الترتيب: الاسم ← «منتدب» ← «🎓 تدريب»", both);
  check(renderToStaticMarkup(<PersonChips />) === "" && TRAINEE_LABEL === "🎓 تدريب", "P3 بلا وسمٍ لا شيء، ونصُّ الوسم «🎓 تدريب»");
  check(withPersonSuffix("د. سالم", true, true) === "د. سالم · منتدب · 🎓 تدريب" && withPersonSuffix("د. سالم", true) === withVisitingSuffix("د. سالم", true), "P4 القوائم الأصلية نصّاً بالترتيب نفسه، و«منتدب» وحده كما كان");

  const rows = [
    { id: "r1", AdInstructorId: 29, instructorName: "مدرّب", AdCollegeId: 1, AdSectionId: 1, trainee: true },
    { id: "r2", AdInstructorId: 13, instructorName: "منتدب", AdCollegeId: 1, AdSectionId: 1, visiting: true },
  ];
  const choices = proposalLauncherChoices(rows, 1);
  check(choices.find(c => c.value === "r1")?.trainee === true && choices.find(c => c.value === "r2")?.trainee === false && choices.find(c => c.value === "r2")?.visiting === true, "P5 منتقي المقترح: المتدرّبُ من صفّه (linkMode ta) والمنتدبُ من صفّه", choices);
  const inbox = read("src/components/InstructorInbox.tsx");
  check(/trainee: isTaRequest\(row\)/.test(inbox), "P6 الوارد يقرأ الصفة من الطلب نفسه (isTaRequest ← linkMode)");
  const route = read("src/server/routes/offeringRoutes.ts");
  const ta = route.slice(route.indexOf('app.get("/api/ta-trainees"'), route.indexOf("/** F3: المقررات المسموحة لكل مدرّب"));
  const lookupPerms = /app\.get\("\/api\/visiting-lookup", (requireAnyPermission\(\[[^\]]*\]\))/.exec(read("src/server/routes/instructorsRoutes.ts"))?.[1] || "?";
  check(ta.includes(`app.get("/api/ta-trainees", ${lookupPerms}`) && [14, 8, 9, 10].every(p => new RegExp(`requireAnyPermission\\(\\[[^\\]]*\\b${p}\\b`).test(ta)) && /reports: hasAny\(14, 8, 9, 10\)/.test(read("src/App.tsx")), "P7a مراجعة #326: قرّاءُ التقارير (14، 8، 9، 10) يقرؤون «🎓 تدريب» بصلاحيات وسم «منتدب» نفسها");
  check(/isScopeAllowed\(req, collegeId, sectionId\)/.test(ta) && /row\.status !== "superseded" && isTaRequest\(row\)/.test(ta) && /staffFamilyScopes\(collegeId, sectionId\)/.test(ta), "P7 ‎/api/ta-trainees‎: بنطاق الحساب، ومَن طلبُه في عائلة القسم بصفة 🎓 وحدها");
  check(/res\.json\(\{ ids \}\)/.test(ta) && !/AdInstructorName|mobile/.test(ta), "P8 والقراءةُ معرّفاتٌ فقط — لا اسمَ ولا جوال");
  check(/@media print\{\.ta-badge\{display:none!important\}\}/.test(read("src/styles/45-person-chips.css")), "P9 «🎓 تدريب» لا يُطبع (التقارير المطبوعة مجمّدة)");
}

console.log(`\nconsistent-badges audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
