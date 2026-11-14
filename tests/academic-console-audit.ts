/**
 * ── «البيانات الأكاديمية»: مراجعة الشاشات الخمس ────────────────────────────────
 * التكرار، والحذف دون سجلاتٍ معلّقة، وحدّ النصاب، وباب الصحائف، ورقم المقرر بسبع
 * خانات، وسلوكٌ واحد للتبويبات (FR-ACD-051..056). فحصٌ ثابت بلا خادم.
 */
import fs from "fs";
import { accountsScopedTo, readInstructorLoad, sameBuildingMinutesOf, sameReferenceCode, sameReferenceName } from "../src/utils/academicGuards";
import { SAME_BUILDING_MINUTES } from "../src/utils/campusTravel";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");

/* ── القواعد ───────────────────────────────────────────────────────────── */
check(sameReferenceCode("coe", " COE ") && !sameReferenceCode("", ""), "الرمز بلا فرق حالة ولا مسافات، والفارغ لا يطابق");
check(sameReferenceName("كلية  التربية", "كلية التربية") && !sameReferenceName("كلية التربية", "كلية العلوم"), "الاسم بمسافةٍ واحدة");
check("load" in readInstructorLoad("") && (readInstructorLoad("") as any).load === null, "النصاب الفارغ = بلا نصاب");
check((readInstructorLoad("0") as any).load === null && (readInstructorLoad(12) as any).load === 12 && (readInstructorLoad("8.6") as any).load === 9, "الصفر يرفع، والكسر يُقرَّب");
check("error" in readInstructorLoad(45) && "error" in readInstructorLoad(-1) && "error" in readInstructorLoad("abc"), "فوق ٤٠ أو سالبٌ أو نصٌّ ← خطأ لا محو");
check(sameBuildingMinutesOf(0) === 0 && sameBuildingMinutesOf("") === SAME_BUILDING_MINUTES && sameBuildingMinutesOf(99) === 30, "داخل المبنى: الصفر مقبول والغياب افتراضي والسقف 30");
const users = [{ SystemUserId: 1, SystemUserLogin: "coedean" }, { SystemUserId: 2, SystemUserLogin: "old", IsDeleted: true }, { SystemUserId: 3, SystemUserLogin: "frenchhead" }];
const assigns = [{ SystemUserId: 1, AdCollegeId: 7, AdSectionId: 0 }, { SystemUserId: 2, AdCollegeId: 7, AdSectionId: 0 }, { SystemUserId: 3, AdCollegeId: 7, AdSectionId: 40 }];
check(JSON.stringify(accountsScopedTo(users, assigns, { collegeId: 7 })) === JSON.stringify(["coedean", "frenchhead"]), "حسابات الكلية بلا المحذوف");
check(JSON.stringify(accountsScopedTo(users, assigns, { sectionId: 40 })) === JSON.stringify(["frenchhead"]), "حسابات القسم وحده");

/* ── الخادم ───────────────────────────────────────────────────────────── */
const reference = read("src/server/routes/referenceRoutes.ts");
const block = (source: string, start: string, end: string) => source.split(start)[1]?.split(end)[0] || "";
check(/duplicateCollegeProblem\(code, name\)/.test(block(reference, 'app.post("/api/colleges"', 'app.put("/api/colleges/:id"')), "إنشاء الكلية يرفض التكرار");
check(/duplicateCollegeProblem\(AdCollegeCode, AdCollegeName, id\)/.test(block(reference, 'app.put("/api/colleges/:id"', 'app.delete("/api/colleges/:id"')), "تعديل الكلية يرفض التكرار");
check(/scopedAccountsProblem\(\{ collegeId: id \}/.test(block(reference, 'app.delete("/api/colleges/:id"', 'app.get("/api/colleges/:id/mobility"')), "حذف الكلية يُمنع ما بقيت حساباتها");
const sectionPut = block(reference, 'app.put("/api/sections/:id"', 'app.delete("/api/sections/:id"');
check(/sameReferenceCode\(row\.AdSectionCode, AdSectionCode\)/.test(sectionPut) && /Number\(row\.AdSectionId\) !== id/.test(sectionPut), "تعديل القسم يرفض رمز قسمٍ آخر في كليته");
const sectionDelete = block(reference, 'app.delete("/api/sections/:id"', "// --- TERMS API ---");
check(/scopedAccountsProblem\(\{ sectionId: id \}/.test(sectionDelete) && /placeholderCivilFor/.test(sectionDelete) && /hasSchedulesForInstructor/.test(sectionDelete), "حذف القسم: الحسابات تمنع، و«هيئة تدريسية» غير المستعملة تُحذف");
check(/duplicateTermProblem\(AdTermName\)/.test(reference) && /duplicateTermProblem\(AdTermName, id\)/.test(reference), "الفصل لا يتكرر عند الإنشاء والتعديل");
check(/sameBuildingMinutes:sameBuildingMinutesOf\(/.test(reference), "الخادم يقبل صفر دقائق داخل المبنى");
const repository = read("src/db/repository.ts");
check(/autoTermClaims"\)\.doc\(createHash\("sha256"\)\.update\(name\.replace/.test(block(repository, "deleteTerm: async", "// Colleges")), "حذف الفصل يفكّ حجز اسمه");
const instructorsRoutes = read("src/server/routes/instructorsRoutes.ts");
const createRoute = block(instructorsRoutes, 'app.post("/api/instructors"', 'app.put("/api/instructors/:id"');
check(/readInstructorLoad/.test(createRoute) && /createStatus/.test(createRoute) && /updateInstructor\(/.test(createRoute), "الإنشاء يحفظ الحالة والنصاب");
check(/cleanText\(req\.body\?\.AdInstructorName, TEXT_LIMIT\.name\)/.test(createRoute), "اسم الأستاذ نصٌّ محدود عند الإنشاء");
const updateRoute = block(instructorsRoutes, 'app.put("/api/instructors/:id"', 'app.delete("/api/instructors/:id"');
check(/"error" in loadInput/.test(updateRoute) && !/loadRaw <= 40 \? Math\.round/.test(updateRoute), "النصاب فوق الحد يُرفض ولا يُمحى");
check(/isFacultyPlaceholder\(\{ AdInstructorId: 1, AdInstructorName \}\)/.test(updateRoute), "لا يُسمّى أستاذٌ حقيقي «هيئة تدريسية»");
const courses = read("src/server/routes/coursesRoutes.ts");
check((courses.match(/code:"curriculum-linked"/g) || []).length === 3, "رفوض الصحيفة الثلاثة تحمل رمزها");

/* ── الواجهة ──────────────────────────────────────────────────────────── */
const ui = read("src/components/ui.tsx");
check(/dirty = false/.test(ui) && /if \(!dirtyRef\.current\) \{ onClose\(\); return; \}/.test(ui), "الدرج يسأل قبل الإغلاق حين يُطلب منه فقط");
const tabs = ["Terms", "Colleges", "Sections", "Instructors", "Courses"].map(name => [name, read(`src/components/${name}.tsx`)] as const);
for (const [name, source] of tabs) {
  check(/dirty=\{dirty\}/.test(source), `${name}: سؤالٌ قبل إغلاق نموذجٍ معدَّل`);
  check(/onCount/.test(source), `${name}: يبلّغ الشريط بعدده`);
  check(/loadFailed \?/.test(source) && /إعادة المحاولة/.test(source), `${name}: تعذّر التحميل يقول ذلك ويعيد المحاولة`);
  check(!/message: "سيُحذف سجل/.test(source) && /title: `حذف «\$\{/.test(source), `${name}: تأكيد الحذف يسمّي السجل`);
}
const colleges = tabs[1][1], sections = tabs[2][1], instructors = tabs[3][1], coursesUi = tabs[4][1], terms = tabs[0][1];
check(!/window\.alert/.test(colleges) && /issued-accounts/.test(colleges), "كلمات السر داخل الشاشة لا في نافذة المتصفح");
for (const [name, source] of [["Colleges", colleges], ["Sections", sections]] as const) {
  check(/if \(submitting\) return;/.test(source) && /تعذّر الاتصال بالخادم/.test(source) && /loading=\{loading \|\| submitting\}/.test(source), `${name}: حارس إرسال ومعالجة انقطاع`);
}
check(/AdTermClosed: mode === "edit" \? closed : closed \? true : undefined/.test(terms) && /changeName/.test(terms), "الفصل: «انتهى» يُحفظ عند الإنشاء والتقويم يتبع الاسم");
check(!/<style>/.test(instructors) && /\.ta-category-badge\{/.test(read("src/styles/02-primitives.css")), "وسم TA في ملف الأنماط");
check(/\[activeId, detailVersion\]/.test(instructors) && /onChanged=\{\(\) => \{ loadAffiliations\(\)/.test(instructors), "تفاصيل الأستاذ للمعروض فعلاً، وتتجدّد بعد التحويل");
check((instructors.match(/onKeyDown=\{arrowChoice\}/g) || []).length === 3, "الأسهم في تبويبات الأساتذة ومجموعتي الاختيار");
check(/headActions/.test(coursesUi) && /الصحائف الأكاديمية\n\s*<\/SecondaryButton>/.test(coursesUi), "زرٌّ دائم للصحائف في رأس المقررات");
check(/errorCode\?\.code === "curriculum-linked"/.test(coursesUi), "رفض الصحيفة يأتي ومعه بابها");
check(/rootAdmin \? <CapacityByMode sections=\{sections\} onDone=\{\(\) => void load\(\)\}/.test(coursesUi) && !/window\.location\.reload/.test(coursesUi), "أدوات السعة للمدير الرئيسي وبلا إعادة تحميل الصفحة");
check(/authorityCourseCode\(course\?\.CourseCode, departmentKeys\.get/.test(coursesUi) && !/value=\{x\.CourseCode\}/.test(coursesUi) && !/رمز المقرر<\/span>/.test(coursesUi), "رقم المقرر بسبع خانات وبتسميةٍ واحدة");
check(/if \(ok\) \{ setCourseCode\(""\)/.test(coursesUi), "استثناء السعة لا يُفرَّغ بعد رفض");
check(/const drop = \(\) =>/.test(coursesUi) && /setListSection\(correctionSection\)/.test(coursesUi), "طلب التصحيح المتعذّر لا يعلق");
check(/setResumeCreate\(mode === "create"\)/.test(coursesUi), "فتح الصحائف من النموذج لا يرمي ما كُتب");
check(/plansButton/.test(sections) && /useEffect\(\(\) => \{ setRuleNote\(null\); \}, \[activeId\]\)/.test(sections), "الأقسام: بابٌ للصحائف ورسالة القواعد لا تنتقل لقسمٍ آخر");
const console_ = read("src/components/AcademicConsole.tsx");
check(/"\/api\/courses\?operational=1&plans=1"/.test(console_) && /isFacultyPlaceholder/.test(console_) && /onTab\("courses"\)/.test(console_), "الشريط يعدّ ما تعرضه القوائم، والأقسام تفتح الصحائف");
check(/FR-ACD-040/.test(read("src/App.tsx")), "سبب اتساع بوابة المسار مكتوب بجانبها");

console.log(failed ? `فشل ${failed}` : "نجحت الفحوص");
process.exit(failed ? 1 : 0);
