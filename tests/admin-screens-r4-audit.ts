/**
 * ── ملاحظات المالك 2026-11-05: 21، 22، 23، 24، 26 ──────────────────────────
 */
import fs from "fs";
import { ROSTER_GROUPS, rosterGroupOf } from "../src/utils/rosterGroups";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");

/* 26: المجموعات */
check(rosterGroupOf({}) === "faculty", "الأستاذ العادي في «الأساتذة»");
check(rosterGroupOf({ AdInstructorCategory: "ta" }) === "ta", "TA منفصل");
check(rosterGroupOf({ AdInstructorStatus: "sabbatical" }) === "sabbatical", "المتفرغ مجموعته");
check(rosterGroupOf({ AdInstructorStatus: "retired", AdInstructorCategory: "ta" }) === "retired", "التقاعد يسبق TA");
check(ROSTER_GROUPS.length === 4, "أربع مجموعات");

const instructors = read("src/components/Instructors.tsx");
check(/realInstructors\.filter\(x => rosterGroupOf\(x\) === group\)/.test(instructors), "المتقاعد يخرج من القائمة الافتراضية");
check(!/Repository\.deleteInstructor/.test(read("src/server/routes/instructorsRoutes.ts").split('"/api/section-roster/:id"')[1].split("/api/visiting-roster")[0]), "الحفظ لا يحذف السجل");

/* 26: الباب يخص القسم ولا يخرج رقماً مدنياً */
const routes = read("src/server/routes/instructorsRoutes.ts");
const rosterSource = read("src/components/DepartmentRoster.tsx"), rosterIds = routes.split("async function sectionRosterIds(")[1].split('app.get("/api/section-roster"')[0];
check(/familyOf/.test(rosterIds) && !/termId/.test(rosterIds), "قائمة الأساتذة من عائلة القسم في كل الفصول: المتقاعد وTA لا يختفيان");
check(/AdInstructorCategory === "ta" \? <button/.test(rosterSource) && /category: null/.test(rosterSource) && !/category: person/.test(rosterSource), "زر التحويل يظهر لـTA وحده");
check(/لا يتحوّل الأستاذ إلى TA/.test(routes), "الخادم يرفض تحويل الأستاذ إلى TA");
check(/save\(person, \{ name:/.test(rosterSource) && !/civil/i.test(rosterSource.split("<form")[1].split("</form>")[0]), "تعديل الاسم بلا رقم مدني");
check(/الدرجة العلمية<\/button>/.test(rosterSource) && !/\/>النصاب<\/button>/.test(rosterSource), "زر الدرجة العلمية بدل النصاب");
check(/visualConfirm/.test(rosterSource) && !/void save\(person, \{ (status|category)/.test(rosterSource), "التحويل والتقاعد والتفرّغ بتأكيد");
check(/departmentFaculty: \[\{/.test(read("src/db/demoSandbox.ts")) && /status: "sabbatical"/.test(read("src/db/demoSandbox.ts")) && /status: "retired"/.test(read("src/db/demoSandbox.ts")), "الديمو فيه TA ومتفرّغون ومتقاعدون");
const rosterRead = routes.split('app.get("/api/section-roster"')[1].split('app.put("/api/section-roster')[0];
check(/isScopeAllowed/.test(rosterRead) && !/hours:.*AdInstructorCivil|AdInstructorMobile/.test(rosterRead), "قراءة السجل بنطاق وبلا هاتف ولا مدني");
check(/members\.has\(id\)/.test(routes), "لا يعدّل إلا أستاذ قسمه");
check(/الأساتذة/.test(read("src/components/ScheduleTransfer.tsx")) && /DepartmentRoster/.test(read("src/components/ScheduleTransfer.tsx")), "أيقونة الأساتذة في أدوات البيانات");

check(!/saveTeachingLoadConfig/.test(routes.split('"/api/section-roster/:id"')[1].split("/api/visiting-roster")[0]) && /runTransaction[\s\S]{0,200}teachingLoad|setTeachingLoadAssignment/.test(read("src/db/repository.ts")), "إسناد النصاب ذرّي");

/* 22: الدرج لا يُقصّ */
check(/createPortal\(\s*<LoadExceptionEditor/.test(read("src/components/LoadException.tsx")), "محرّر النصاب ببوّابة");

/* 23 */
const app = read("src/App.tsx");
check((app.match(/<RegistrationTabs /g) || []).length === 2, "التبويبان في الشاشتين");

/* 24: خطُّ الرحلة لا يعبر العناوين */
const css = read("src/styles/12-deadlines.css");
check(/\.sp-track \.sp-dot\{/.test(css) && /\.sp-track \.sp-step\{/.test(css), "محدّدات المسار مقيّدة ضد تصادم 14-proposal");

/* 21 */
check(/RoomDoorBuildingActions/.test(read("src/components/LocationQuickSetup.tsx")), "الملصقات في إضافة المباني والقاعات");
const door = read("src/server/roomDoorPage.ts");
check(!/prefers-color-scheme:dark/.test(door) && !/PUBLIC_DARK_VARS\};\$\{DARK_STATUS\}\}/.test(door), "صفحات الباب نهارية");

console.log(failed ? `فشل ${failed}` : "نجحت الفحوص");
process.exit(failed ? 1 : 0);
