/**
 * ── مركز الاستعلام: أطول فراغ وشكل الأسبوع، والقاعات الأكثر استخداماً ──────
 *
 * يحرس ما انتقل إلى عدسات التقارير: حسابُ شكل الأسبوع وأطول فراغ، وأن تفاصيل
 * القاعة وشكل الأسبوع من الخادم لا تُطلب إلا لمن يملك صلاحية مساحة الجدول،
 * وأن لوحة البداية لم تعد تكرّر «ذروة الأوقات» و«أكثر القاعات استخداماً».
 */
import fs from "node:fs";
import path from "node:path";
import { longestWaitMinutes, professorWeekShape, WAIT_THRESHOLD } from "../src/utils/professorWeekShape";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const row = (start: string, end: string, days: string[]) => Object.fromEntries([["fstarttime", start], ["fendtime", end], ...days.map(day => [day, true])]);

/* 1) شكل الأسبوع وأطول فراغ */
check(professorWeekShape([]) === null && longestWaitMinutes([]) === 0, "أستاذ بلا محاضرات: لا شكل ولا فراغ");
const week = [row("08:00", "09:00", ["fsunday"]), row("12:00", "13:00", ["fsunday"]), row("09:00", "10:00", ["fmonday"]), row("10:30", "11:30", ["fmonday"])];
const shape = professorWeekShape(week)!;
check(shape.days.length === 2 && shape.days[0].label === "الأحد", "يومان للتدريس بترتيب الأسبوع");
check(shape.days[0].waits.length === 1 && shape.days[0].waits[0].minutes === 180, "الأحد: انتظار ثلاث ساعات بين المحاضرتين");
check(shape.days[1].waits.length === 0 && WAIT_THRESHOLD === 60, "الاثنين: نصف ساعة ليست انتظاراً");
check(longestWaitMinutes(week) === 180, "أطول فراغ = 180 دقيقة");
const overlap = [row("08:00", "11:00", ["ftuesday"]), row("09:00", "10:00", ["ftuesday"]), row("11:30", "12:30", ["ftuesday"])];
check(longestWaitMinutes(overlap) === 0, "محاضرتان متداخلتان لا تصنعان فراغاً");
check(shape.hours[0] === 8 * 60 && shape.hours[shape.hours.length - 1] === 13 * 60, "مقياس الساعات من أول ساعة إلى آخرها");

/* 2) الصلاحية: الطلب إلى الخادم لمن يملك الشاشة 7 وحده */
const reports = read("src/components/Reports.tsx");
const drawers = read("src/components/ReportInsightDrawers.tsx");
const app = read("src/App.tsx");
check(/canReadWorkspace\?: boolean/.test(reports) && /canReadWorkspace = false/.test(reports), "Reports يأخذ صلاحية مساحة الجدول، والافتراض: لا");
check((app.match(/<Reports[\s\S]*?\/>/g) || []).every(block => block.includes("canReadWorkspace={hasPerm(7)}")), "كل مداخل Reports تمرّر hasPerm(7)");
check(/roomPick\.point == null && canReadWorkspace && filters\.termId/.test(reports), "تفاصيل القاعة في عدسة القاعات لمن يملك الصلاحية");
check(/\{canReadWorkspace \? <RoomInsight/.test(drawers), "نافذة القاعة لا تطلب التفاصيل بلا صلاحية");
check(/if \(!canReadWorkspace \|\| !instructorId \|\| !termId\) \{ setRemote\(null\)/.test(drawers), "شكل الأسبوع لا يطلب الخادم بلا صلاحية");
check(/occupancyTopRooms[\s\S]*?occupancyRows\.forEach/.test(reports), "القاعات الأكثر استخداماً من صفوف النطاق المختار (الموقع أو العائلة)");
check(/data-guide-ignore="يفتح شكل أسبوع الأستاذ للقراءة فقط"/.test(reports), "زر شكل الأسبوع معلَّم للمرشد");

/* 3) لوحة البداية */
const dashboard = read("src/components/Dashboard.tsx");
check(!dashboard.includes("dashboard-peak-hours-title") && !dashboard.includes("dashboard-busiest-rooms-title"), "لوحة البداية بلا «ذروة الأوقات» ولا «أكثر القاعات استخداماً»");
check(read("src/index.css").includes('@import "./styles/60-report-insight.css";'), "ورقة الأنماط مسجّلة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
