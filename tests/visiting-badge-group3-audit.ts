/**
 * ── شارة «منتدب» في مساحة الذكاء والجدول الحيّ والرادار والجولة ──────────────
 *
 * كلُّ موضعٍ يعرض اسم أستاذٍ لموعدٍ يحمل شارتَه (أو لاحقتَه النصية حيث لا مكوّن)،
 * والخادمُ يحمل علمَ «visiting» مع الصفوف التي تصل الواجهةَ نصّاً جاهزاً.
 */
import fs from "fs";
import path from "path";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const workspace = read("src/components/IntelligenceWorkspace.tsx");
const scenes = read("src/components/LivingScheduleScenes.tsx");
const layer = read("src/components/LivingScheduleLayer.tsx");
const server = readServerSource();

console.log("مساحة الذكاء");
check(/<td className=\{mark\("AdInstructorId"\)\}>\{instructor\}\{isVisiting\(row\.AdInstructorId,row\.AdCollegeId,row\.AdSectionId\)\?<> <VisitingBadge compact \/><\/>:null\}<\/td>/.test(workspace), "جدول تقرير التغييرات (PDF) يرسم الشارة");
check(/const reasonInstructor = .*withVisitingSuffix\(/.test(workspace), "درج الأسباب: اسم الأستاذ بلاحقة المنتدب");
check(/title: withVisitingSuffix\(String\(item\.name \|\| "أستاذ"\), visitingInReading\(item\.id\)\)/.test(workspace), "درج الفراغات (قراءة الصفحة) بلاحقة");
check(/title:withVisitingSuffix\(String\(item\.name \|\| ""\), isVisiting\(item\.id, member\.collegeId, member\.sectionId\)\)/.test(workspace), "درج الفراغات (قراءة كلية) بقسم تلك القراءة");
check(/\{risk\.instructorName\}\{visitingAt\(risk\.instructorId, risk\) \? <> <VisitingBadge compact \/><\/> : null\}/.test(workspace), "خطر الإرهاق المكاني");
check(/\{proposal\.instructorName\}\{visitingAt\(proposal\.instructorId, proposal\) \? <> <VisitingBadge compact \/><\/> : null\}/.test(workspace), "اقتراح تبديل القاعات");
check(/\{p\.name\}\{visitingInReading\(p\.id\) \? <> <VisitingBadge compact \/><\/> : null\}/.test(workspace), "قائمة حمل الأساتذة");
check(/slot\.instructorId && visitingAt\(slot\.instructorId, item\) \? <> <VisitingBadge compact \/><\/> : null/.test(workspace), "خانة فتح الشعبة");
check(/withVisitingSuffix\(String\(slot\.instructorName \|\| ""\), visitingAt\(slot\.instructorId, item\)\)/.test(workspace), "سطر ApplyProposal لفتح الشعبة");
check(/withVisitingSuffix\(i\.AdInstructorName, isVisiting\(i\.AdInstructorId, collegeId, sectionId\)\)/.test(workspace), "خيارات نموذج القيد");
check(/title=\{withVisitingSuffix\(String\(o\.professorImpact\?\.name \|\| ""\), Boolean\(o\.professorImpact\?\.visiting\)\)\}/.test(workspace), "عنوان أثر الأستاذ في الخيار");
check(/row\.before\?\.visiting \? <> <VisitingBadge compact \/><\/> : null/.test(workspace) && /row\.after\?\.visiting \? <> <VisitingBadge compact \/><\/> : null/.test(workspace), "بطاقات المقارنة قبل/بعد");
check(/row\.instructor && row\.visiting \? <> <VisitingBadge compact \/><\/> : null/.test(workspace), "بطاقة المقارنة (ظهر/اختفى)");
check(/<h2>\{detail\.data\.instructor\?\.AdInstructorName\}\{.*<VisitingBadge compact \/>/.test(workspace), "عنوان درج حمل الأستاذ");
const canvas = read("src/components/IntelligenceVersionCanvas.tsx");
check(/AdInstructorName\}\{isVisiting\(row\.AdInstructorId, row\.AdCollegeId, row\.AdSectionId\) \? <> <VisitingBadge compact \/>/.test(canvas), "لوحة النسخ الزمنية");

console.log("الجدول الحيّ");
check(/row\.instructor && row\.visiting \? <> <VisitingBadge compact \/><\/> : null/.test(layer), "جدول مسودة بداية الفصل");
check(/withVisitingSuffix\(i\.AdInstructorName, isVisiting\(i\.AdInstructorId, collegeId, sectionId\)\)/.test(layer), "قائمة تعديل صف المسودة");
check(/isVisiting\(selected\.AdInstructorId, selected\.AdCollegeId, selected\.AdSectionId\) \? <> <VisitingBadge compact \/>/.test(layer), "زر «اختصر حمل الأستاذ»");
check(/visitingOf=\{visitingOfRow\}/.test(layer) && /withVisitingSuffix\(who, Boolean\(visitingOf\?\.\(row\)\)\)/.test(scenes), "منتقي السياق");
check(/spotVisiting\(spot\) \? <> <VisitingBadge compact \/>/.test(scenes) && /label: withVisitingSuffix\(String\(spot\.label/.test(scenes), "خريطة الضغط: التصنيف والتسميات");
check(/isVisitor\(profile\.id\)/.test(scenes) && /isVisitor\(item\.key\)/.test(scenes), "قراءة الصحة: الحمل ونقاط الانهيار");
check(/visitingFor=\{visitingForLiving\}/.test(layer), "الطبقة تمرّر دالة المنتدب للمشاهد");
check(/topInstructor\?\.visiting \? <> <VisitingBadge compact \/>/.test(read("src/components/ScheduleExperienceLayer.tsx")), "الأستاذ الأكثر تقييداً");
check(/withVisitingSuffix\(String\(slot\.instructorName/.test(read("src/components/RadarSchedule.tsx")), "رادار الجدول");
check(/withVisitingSuffix\(String\(slot\.instructorName/.test(read("src/components/StudentRegistration.tsx")), "تسجيل الطلبة");

console.log("الجولة والمسرح");
const onboarding = read("src/components/Onboarding.tsx");
check(/visitingInstructorIds\?: number\[\]/.test(onboarding) && /visiting: Boolean\(person\) && visitingIds\.has\(Number\(row\.AdInstructorId\)\)/.test(onboarding), "الجولة تحمل منتدبي الحمولة");
check(/\{chip\.who\}\{chip\.visiting \? <> <VisitingBadge compact \/><\/> : null\}/.test(onboarding), "رقاقة الجولة ترسم الشارة");
const choreo = read("src/components/GenesisChoreography.tsx");
check(/\{chip\.label\}\{chip\.visiting \? <> <VisitingBadge compact \/><\/> : null\}/.test(choreo) && /isVisiting\?: \(instructorId: number\) => boolean/.test(choreo), "رقاقات المسرح");
check(/isVisiting=\{\(instructorId\) => isVisiting\(instructorId, collegeId, sectionId\)\}/.test(layer), "الطبقة تمرّر دالة المنتدب للمسرح");

console.log("الخادم");
const compareAt = server.indexOf('app.get("/api/intelligence/compare-terms"');
const compare = server.slice(compareAt, compareAt + 6000);
check(/readVisitingStatus\(scope\.collegeId,scope\.sectionId,termSide\)/.test(compare) && /visiting:isVisitingAt\(termSide,/.test(compare), "مقارنة الفصول: علمٌ لكل صف من فصله");
check(/before:readable\(entry\.from,fromTermId\),after:readable\(entry\.to,toTermId\)/.test(compare), "قبل من الفصل الأول وبعد من الثاني");
const warAt = server.indexOf('app.post("/api/intelligence/war-room"');
const war = server.slice(warAt, warAt + 2200);
check(/professorImpact:\{\.\.\.option\.professorImpact,instructorId:person\?\.AdInstructorId,visiting:/.test(war), "غرفة القرار: أثر الأستاذ يحمل علمَ المنتدب");
check(/instructorId:Number\(row\.AdInstructorId\)\|\|0,visiting:genesisVisiting\.has\(Number\(row\.AdInstructorId\)\)/.test(server), "صفوف معاينة المسودة تحمل المعرّف والعلم");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
