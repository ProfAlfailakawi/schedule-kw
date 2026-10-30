/**
 * ── البطاقة السريعة بلغة «موعد جديد»، ونصاب الأستاذ لكل عائلة القسم (المالك 2026-10-30) ──
 *
 *  Q1  الخطوات بالترتيب الإلزامي: المقرر ← الأستاذ ← القاعة، والمقفلة تقول ما تنتظره،
 *      والمؤشر ينتقل إلى الأمام وحده ولا يقفز وأنت تكتب رقم الشعبة.
 *  Q2  الوقت سطرٌ يُفتح بالعجلة عند الحاجة، و«احفظ الموعد» في شريطٍ يقول الناقص.
 *  Q3  اختيار القاعة يُدمج فوق المسوّدة فلا يمحو المبنى (كان المنتقي يرسل ما تغيّر وحده).
 *  Q4  حارس الزملاء في البطاقة، والعدّاد عند الأب: يبدأ بفتحها، ويُرسل بعد الحفظ الناجح وحده،
 *      بأداة «البطاقة السريعة» التي يقبلها الخادم.
 *  Q5  الأنماط مستوردة وتحترم تقليل الحركة.
 *  F1  كرت الأستاذ يقرأ أسبوعه في كل كليات عائلة القسم ويحسب النصاب بساعات مقرراتها.
 *  F2  المسار في الخادم: لمن يعدّل الجدول، بنطاق القارئ وعائلة قسمه، للأستاذ وحده، وما خارج النطاق بلا قاعة.
 *  F3  عائلة القسم: «تكنولوجيا التعليم» في بنين وبنات معاً، دون قسمٍ آخر.
 */
import fs from "node:fs";
import { departmentFamily } from "../src/utils/sectionLabel";
import { ENTRY_HELPERS, parseEntryMeasure } from "../src/utils/appointmentMeasure";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const quick = read("src/components/QuickCreatePopover.tsx");
const editor = read("src/components/Schedules.tsx");
const mini = read("src/components/TeacherMiniWeek.tsx");
const routes = read("src/server/routes/schedulesRoutes.ts");
const css = read("src/styles/44-quick-studio.css");
const index = read("src/index.css");
const card = read("src/components/AppointmentMeasureCard.tsx");

check(/data-qc-step="course"/.test(quick) && /data-qc-step="teacher"/.test(quick) && /data-qc-step="place"/.test(quick), "Q1 ثلاث خطوات مرقّمة");
check(/const teacherLocked = !courseDone;/.test(quick) && /const placeLocked = teacherLocked \|\| !teacherDone;/.test(quick), "Q1 الأستاذ بعد المقرر، والقاعة بعد الأستاذ");
check(/بعد اختيار المقرر/.test(quick) && /بعد اختيار الأستاذ/.test(quick), "Q1 الخطوة المقفلة تقول ما تنتظره");
check(/order\.indexOf\(currentStep\) <= order\.indexOf\(prev\)/.test(quick) && /if \(typing\) return;/.test(quick), "Q1 المؤشر إلى الأمام فقط، ولا يقفز أثناء كتابة الشعبة");

check(/className=\{`qc-when-edit/.test(quick) && /\{timeOpen \? \(/.test(quick) && /<TimeWheels/.test(quick), "Q2 الوقت سطرٌ والعجلة تُفتح عند الحاجة");
check(/"احفظ الموعد"/.test(quick) && /qc-status-k">ناقص/.test(quick) && /missing\.join\("، "\)/.test(quick), "Q2 «احفظ الموعد» والناقص في الشريط");

check(!/patch\(\{room:String\(location\.AdRoomCode/.test(quick) && /"AdRoomCode" in location/.test(quick) && /"roomId" in location/.test(quick) && /"buildingId" in location/.test(quick), "Q3 اختيار القاعة لا يمحو المبنى");

check(/useScheduleHolds\(\{/.test(quick) && /<ColleagueHoldNotice clashes=\{holds\.clashes\}/.test(quick) && /<ColleaguePresenceChip holds=\{holds\.holds\}/.test(quick), "Q4 حارس الزملاء في البطاقة السريعة");
check(/quickMeter\.current = createEntryMeter\("create"\);\s*quickMeter\.current\.mark\("quick-card"\);/.test(editor)
  && /sendEntryMeasure\(quickMeter\.current\?\.finish\(\) \?\? null\);/.test(editor) && /meter=\{quickMeter\.current\}/.test(editor), "Q4 العدّاد يبدأ بفتح البطاقة ويُرسل بعد الحفظ الناجح");
check((ENTRY_HELPERS as readonly string[]).includes("quick-card") && /"quick-card": \{ label: "البطاقة السريعة"/.test(card), "Q4 «البطاقة السريعة» أداةٌ في بطاقة وقت الإدخال");
const parsed = parseEntryMeasure({ durationMs: 30000, blockedMoments: 0, helpers: ["quick-card", "zzz"], device: "desktop", mode: "create" });
check(parsed.ok === true && JSON.stringify((parsed as any).payload.helpers) === JSON.stringify(["quick-card"]), "Q4 الخادم يقبل «quick-card» ويُسقط المجهول");
check(/meter\?\.mark\("wheel"\)/.test(quick) && /meter\?\.mark\("week-pick"\)/.test(quick) && /meter\?\.blocked\(Boolean\(blocked\)\)/.test(quick), "Q4 البطاقة تُعلِّم أدواتها وموانعها على العدّاد");

check(/@import "\.\/styles\/44-quick-studio\.css";/.test(index) && /\.quick-create\.is-studio/.test(css) && /prefers-reduced-motion/.test(css), "Q5 الأنماط مستوردة وتحترم تقليل الحركة");

check(/export function useFamilyWeek/.test(mini) && /\/api\/schedules\/teacher-family-week\?termId=/.test(mini) && /teacherHeader\(own, loadCourses, draft, nisab, before\)/.test(mini), "F1 كرت الأستاذ يحسب النصاب من كل كليات العائلة");
check(/sectionId=\{Number\(form\.AdSectionId \|\| 0\)\}/.test(editor) && /sectionId=\{sectionId\} draft=\{payload\}/.test(quick), "F1 النموذجان يمرّران القسم إلى الكرت");
check(/من عائلة القسم/.test(mini) && /className="is-family"/.test(mini), "F1 الترويسة تقول إن النصاب يشمل كليات أخرى");

const from = routes.indexOf('app.get("/api/schedules/teacher-family-week"');
const route = from >= 0 ? routes.slice(from, routes.indexOf("app.get(", from + 10)) : "";
check(/requirePermission\(7\)/.test(route) && /isScopeAllowed\(req, collegeId, sectionId\)/.test(route) && /departmentFamily\(/.test(route), "F2 المسار لمن يعدّل الجدول، بنطاق القارئ وعائلة قسمه");
check(/Number\(row\.AdInstructorId\) === instructorId/.test(route) && /AdRoomCode: "", AdRoomHall: ""/.test(route), "F2 للأستاذ وحده، وما خارج نطاق القارئ بلا قاعة");

const family = departmentFamily([
  { AdSectionId: 1, AdCollegeId: 1, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 7, AdCollegeId: 2, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 9, AdCollegeId: 2, AdSectionName: "الرياضيات" },
] as any, 1, 1);
check(family.length === 2 && family[1].sectionId === 7 && family[1].collegeId === 2, "F3 عائلة القسم: بنين وبنات معاً، دون قسمٍ آخر");

console.log(`\nQuick studio & family nisab audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
