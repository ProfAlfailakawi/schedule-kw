/**
 * ── الخريجون المتوقَّعون يتصدّرون الإرشاد (الديمو + مختبر القرار) ───────────────────────
 *
 *   W1  خريجٌ متوقَّع واحدٌ يحتاج مقرراً يكفي ليظهر في «مقررات المسار» (كان الحدُّ ثلاثةً)، والطلبُ العاديُّ يبقى بحدّه (٣).
 *   W2  الترتيب كما هو: غير المطروح أولاً، ثم الأكثر خريجين متوقَّعين، ثم الطلب، ثم ما يفتحه لاحقاً.
 *   W3  العبارة بالعدد والمعدود: «خريج متوقع واحد يحتاجه»، «خريجان متوقعان يحتاجانه»، «٣ خريجين متوقعين يحتاجونه»، «١٢ خريجاً متوقعاً يحتاجونه».
 *   W4  الواجهة: شارةٌ بقبّعة التخرج في صدر السطر بالعبارة نفسها، وبلا العبارة الصغيرة القديمة «قرب تخرج تقديري».
 *   W5  الديمو: طلبةُ «graduating» وبعضُ «advanced» لهم تخرّجٌ متوقَّع خلال ١٢ شهراً متّسقٌ مع وحداتهم، وغيرُهم بلا تاريخ؛
 *       وإشارةُ الإرشاد على بيانات الصندوق تتصدّرها مقرراتُ الخريجين المتوقَّعين (nearGraduation > 0).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AcademicDecisionLabPanel from "../src/components/AcademicDecisionLabPanel";
import { analyseAcademicAdvice, type AcademicPlanView } from "../src/utils/academicAdvisory";
import { buildAcademicDecisionLab, graduationNeedPhrase } from "../src/utils/academicDecisionLab";
import type { AdCourse, FSchedule, StudentProfile } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const course = (id: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 12, AdSectionId: 9, CourseCode: String(id), CourseName: "مقرر " + id, CourseCredit: 3, CourseHours: 3, MaxStudent: 25 });
const slot = (id: number, section: string, start: string, end: string): FSchedule => ({
  id: id * 100 + Number(section), AdCollegeId: 12, AdSectionId: 9, AdTermId: 25, AdCourseId: id, SCode: section, fstarttime: start, fendtime: end, fsunday: true,
} as unknown as FSchedule);
const inMonths = (months: number) => new Date(Date.now() + months * 30 * 86_400_000).toISOString();
const profile = (id: number, wish: number[], passed: number[], graduatesIn?: number): StudentProfile => ({
  id: "student-" + id, fingerprint: "fp-" + id, AdCollegeId: 12, AdSectionId: 9, curriculumPlanId: "p", passedCourseIds: passed, passedUnits: passed.length * 3,
  ...(graduatesIn === undefined ? {} : { expectedGraduationAt: inMonths(graduatesIn) }),
  wishes: { termId: 25, courseIds: wish, targetUnits: 15, constraints: {}, updatedAt: "" },
} as unknown as StudentProfile);
const plan: AcademicPlanView = { planId: "p", courseIds: [1, 2, 3, 4, 5, 6, 7, 8], rules: [1, 2, 3, 4, 5, 6, 7, 8].map(courseId => ({ courseId })), groups: [] };
const base = { collegeId: 12, sectionId: 9, termId: 25, plans: [plan], courses: [1, 2, 3, 4, 5, 6, 7, 8].map(course), rows: [slot(2, "501", "08:00", "09:00"), slot(3, "501", "10:00", "11:00")] };
const watchOf = (profiles: StudentProfile[], rows = base.rows) => {
  const input = { ...base, rows, profiles };
  return buildAcademicDecisionLab(input, analyseAcademicAdvice(input)).graduationWatch || [];
};

/* ── W1 ── */
{
  const single = watchOf([profile(1, [4], [1, 2, 3], 4)]);
  check(single.length === 1 && single[0].courseId === 4 && single[0].nearGraduation === 1 && single[0].demand === 1 && !single[0].offered, "W1 خريجٌ متوقَّع واحدٌ يحتاج مقرراً غير مطروح: يظهر بـ nearGraduation = 1", single);
  const offeredNoDownstream = watchOf([profile(1, [2], [1], 5)]);
  check(offeredNoDownstream.some(item => item.courseId === 2 && item.offered && item.nearGraduation === 1), "W1 ومقررٌ مطروحٌ بلا مقررات لاحقة يظهر أيضاً إن احتاجه خريجٌ متوقَّع (كان يُسقَط)", offeredNoDownstream);
  const ordinary2 = watchOf([profile(1, [4], [1]), profile(2, [4], [1])]);
  check(!ordinary2.some(item => item.courseId === 4), "W1 والطلبُ العاديُّ بطلبين لا يظهر (حدُّه ثلاثة)", ordinary2);
  const ordinary3 = watchOf([1, 2, 3].map(i => profile(i, [4], [1])));
  check(ordinary3.some(item => item.courseId === 4 && item.demand === 3 && item.nearGraduation === 0), "W1 وبثلاثة طلبات يظهر بلا خريجين متوقَّعين (nearGraduation = 0)", ordinary3);
  const far = watchOf([profile(1, [4], [1], 30)]);
  check(!far.some(item => item.courseId === 4), "W1 ومن يتخرّج بعد أكثر من سنة ليس «متوقَّعاً قريباً»", far);
}

/* ── W2 ── */
{
  const profiles = [
    ...[1, 2, 3, 4, 5].map(i => profile(i, [5], [1])),
    profile(6, [6], [1], 3),
    ...[7, 8].map(i => profile(i, [7], [1], 3)),
    ...[9, 10, 11].map(i => profile(i, [8], [1])),
  ];
  const order = watchOf(profiles).map(item => item.courseId);
  check(order.join() === "7,6,5,8", "W2 غير المطروح أولاً: الأكثر خريجين متوقَّعين (٧: اثنان) ثم الأقل (٦: واحد) ثم الطلب (٥ قبل ٨)", order);
  const mixed = watchOf([...[1, 2, 3, 4].map(i => profile(i, [5], [1])), profile(5, [2], [1], 2)]);
  check(mixed[0].courseId === 5 && mixed.some(item => item.courseId === 2 && item.offered), "W2 المطروحُ يلي غيرَ المطروح ولو كان فيه خريجٌ متوقَّع (الترتيب الحالي محفوظ)", mixed);
}

/* ── W3 ── */
check(graduationNeedPhrase(1) === "خريج متوقع واحد يحتاجه", "W3 واحد", graduationNeedPhrase(1));
check(graduationNeedPhrase(2) === "خريجان متوقعان يحتاجانه", "W3 اثنان بالمثنى بلا رقم", graduationNeedPhrase(2));
check(graduationNeedPhrase(3) === "3 خريجين متوقعين يحتاجونه" && graduationNeedPhrase(10) === "10 خريجين متوقعين يحتاجونه", "W3 ثلاثة إلى عشرة جمعٌ مكسّر", [graduationNeedPhrase(3), graduationNeedPhrase(10)]);
check(graduationNeedPhrase(12) === "12 خريجاً متوقعاً يحتاجونه", "W3 ١١ فأكثر تمييزٌ منصوب", graduationNeedPhrase(12));

/* ── W4 ── */
{
  const input = { ...base, profiles: [profile(1, [4], [1], 3), profile(2, [4], [1], 5)] };
  const lab = buildAcademicDecisionLab(input, analyseAcademicAdvice(input));
  const html = renderToStaticMarkup(createElement(AcademicDecisionLabPanel, { lab, demo: false, onRefresh: () => {}, refreshing: false }));
  check(lab.graduationWatch?.[0]?.nearGraduation === 2, "W4 المختبر يقرأ خريجين متوقَّعَين", lab.graduationWatch);
  check(html.includes("خريجان متوقعان يحتاجانه") && html.includes('data-adl-grad="2"') && html.includes("adl-grad-badge"), "W4 الشارة تظهر بالعبارة نفسها وبعدّها");
  check(/adl-grad-badge[^>]*><svg[^>]*lucide-graduation-cap/.test(html), "W4 وفي صدرها أيقونة قبّعة التخرّج");
  check(html.indexOf("adl-grad-badge") < html.indexOf("غير مطروح"), "W4 والشارة قبل بقية السطر (أولاً)");
  check(!html.includes("قرب تخرج تقديري"), "W4 وزالت العبارة الصغيرة القديمة");
  const plain = renderToStaticMarkup(createElement(AcademicDecisionLabPanel, { lab: { ...lab, graduationWatch: [{ courseId: 4, courseName: "مقرر 4", demand: 3, downstream: 0, offered: false, nearGraduation: 0 }] }, demo: false, onRefresh: () => {}, refreshing: false }));
  check(!plain.includes("adl-grad-badge"), "W4 ومن لا خريجَ متوقَّعاً فيه لا شارة له");
  check(/\.adl-grad-badge\{/.test(fs.readFileSync("src/components/academic-decision-lab.css", "utf8")), "W4 للشارة تنسيقٌ");
}

/* ── W5: الديمو ── */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grad-watch-demo-"));
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [], colleges: [], sections: [], instructors: [], courses: [], schedules: [], rooms: [], studentNeeds: [], studentProfiles: [] }), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase(); console.warn = quiet;
const { seedDemoRadar, seedDemoMasariDemand, demoArchetypeOf, demoLateAdvanced, demoExpectedGraduationAt, DEMO_DEGREE_UNITS } = await import("../src/server/demoRadarSeed");
const { academicAdviceForScope } = await import("../src/server/academicAdvisoryData");
const sandboxId = "graduation_watch_audit";
Repository.createDemoSandbox(sandboxId, 10 * 60_000);
const today = new Date().toISOString().slice(0, 10);
await Repository.withDemoSandbox(sandboxId, async () => {
  await seedDemoRadar({ sealIdentity: async (value: string) => `sealed:${value}`, today });
  await seedDemoMasariDemand();
  const profiles = (await Repository.listStudentProfiles()) as StudentProfile[];
  const kindOf = (item: StudentProfile) => demoArchetypeOf(Number(String(item.civilCipher).replace("sealed:", "")) - 300000000000, 1);
  const withDate = profiles.filter(item => item.expectedGraduationAt);
  const start = Date.parse(`${today}T00:00:00Z`), horizon = start + 365 * 86_400_000;
  const graduating = profiles.filter(item => kindOf(item) === "graduating");
  const advanced = profiles.filter(item => kindOf(item) === "advanced");
  check(graduating.length === 8 && graduating.every(item => item.expectedGraduationAt), "W5 كلُّ طلبة «graduating» (٨) لهم expectedGraduationAt", graduating.length);
  check(withDate.every(item => { const at = Date.parse(item.expectedGraduationAt || ""); return at > start && at <= horizon; }), "W5 وكلُّ تاريخٍ داخل الاثني عشر شهراً القادمة", withDate.map(item => item.expectedGraduationAt));
  check(advanced.filter(item => item.expectedGraduationAt).length >= 2 && advanced.some(item => !item.expectedGraduationAt), "W5 وبعضُ «advanced» (لا كلُّهم) له تاريخ", advanced.length);
  check(withDate.every(item => ["graduating", "advanced"].includes(kindOf(item))), "W5 ولا تاريخَ لغير هذين النمطين");
  check(new Set(withDate.map(item => item.expectedGraduationAt)).size > 2, "W5 والتواريخ متنوّعة لا واحدٌ منسوخ");
  check(withDate.every(item => (item.passedUnits || 0) < DEMO_DEGREE_UNITS && (item.passedUnits || 0) > 40), "W5 ووحداتُهم المنجزة دون وحدات الدرجة وقريبةٌ منها");
  const near = demoExpectedGraduationAt({ kind: "graduating", index: 4, passedUnits: 120, planUnits: 123, today })!;
  const farDate = demoExpectedGraduationAt({ kind: "graduating", index: 4, passedUnits: 60, planUnits: 123, today })!;
  check(Date.parse(near) < Date.parse(farDate) && Date.parse(farDate) <= horizon, "W5 من بقي عليه أقلُّ يتخرّج أبكر، ولا شيء بعد سنة", [near, farDate]);
  check(demoExpectedGraduationAt({ kind: "mid", index: 2, passedUnits: 60, planUnits: 123, today }) === undefined && demoLateAdvanced("advanced", 3) !== demoLateAdvanced("advanced", 11), "W5 «mid» بلا تاريخ، والمتقدّم جداً يتناوب");
  const advice: any = await academicAdviceForScope(1, 1, 1);
  const watch = advice.decisionLab.graduationWatch as Array<{ courseId: number; courseName: string; nearGraduation: number; offered: boolean; demand: number }>;
  check(watch.length >= 3 && watch[0].nearGraduation >= 1 && !watch[0].offered, "W5 على بيانات الصندوق تتصدّر القائمةَ مقرراتٌ يحتاجها خريجون متوقَّعون", watch.slice(0, 3));
  check(watch.slice(0, 3).every(item => item.nearGraduation >= 1), "W5 وأولُ ثلاثةٍ كلُّها فيها خريجون متوقَّعون", watch.map(item => item.nearGraduation));
  check(watch.some(item => item.nearGraduation === 1 || item.nearGraduation === 2), "W5 ومنها ما يحتاجه خريجٌ واحدٌ أو اثنان (يظهر بعد خفض الحد)", watch.map(item => item.nearGraduation));
  const html = renderToStaticMarkup(createElement(AcademicDecisionLabPanel, { lab: advice.decisionLab, demo: false, onRefresh: () => {}, refreshing: false }));
  check(/خريج متوقع|خريجان متوقعان|خريجين متوقعين|خريجاً متوقعاً/.test(html) && html.includes("adl-grad-badge"), "W5 والواجهةُ على بيانات الصندوق تعرض الشارة");
});
Repository.dropDemoSandbox(sandboxId);
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
