/**
 * ── الموجة البصرية الأولى: الحرم الحي، برج المراقبة، خريطة المترو والستارة، تصدير الفيلم ──
 *  U  المنطق النقيّ للحرم الحي (src/utils/campusLive.ts): المباني والقاعات الجارية وتعارض القاعة وضوء النهار.
 *  S  التوصيل: كلُّها قراءةٌ فقط؛ الحرم يفتح الجدول بالطريق القائم، والبرج من بيانات اللوحة،
 *     والخريطة تفتح السيناريو كزرّه، والتصدير على الجهاز بلا طلبٍ إلى الخادم، وكلُّها تحترم تقليل الحركة.
 */
import fs from "node:fs";
import path from "node:path";
import { campusFromToday, daylightAt, daylightLabel } from "../src/utils/campusLive";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── U: الحرم الحي ── */
const rows = [
  { id: 1, startTime: "08:00", endTime: "09:50", roomCode: "N2", roomHall: "101" },
  { id: 2, startTime: "09:00", endTime: "09:50", roomCode: "N2", roomHall: "101" },
  { id: 3, startTime: "10:00", endTime: "10:50", roomCode: "N2", roomHall: "101" },
  { id: 4, startTime: "08:00", endTime: "08:50", roomCode: "N10", roomHall: "5" },
  { id: 5, startTime: "08:00", endTime: "08:50", roomCode: "", roomHall: "7" },
  { id: 6, startTime: "08:00", endTime: "08:50", roomCode: "N10", roomHall: "" },
];
const at910 = campusFromToday(rows, 9 * 60 + 10);
check(at910.map(b => b.code).join(",") === "N2,N10", "المباني بترتيبٍ طبيعي (N2 قبل N10)، وما لا مبنى له أو لا قاعة يسقط");
const n2 = at910[0], n10 = at910[1];
check(n2.lectures === 3 && n2.halls.length === 1 && n10.lectures === 1, "عدد المحاضرات والقاعات لكل مبنى");
check(n2.runningNow === 1 && n2.halls[0].runningNow && n10.runningNow === 0, "القاعة الجارية الآن: بدأت ولم تنتهِ");
check(n2.conflicts === 1 && n2.halls[0].conflict && n10.conflicts === 0, "تعارض القاعة: محاضرتان متداخلتان في القاعة نفسها؛ المتعاقبتان لا تتعارضان");
const weekend = campusFromToday(rows, null);
check(weekend.every(b => b.runningNow === 0) && weekend[0].conflicts === 1, "في العطلة لا شيء يجري الآن، والتعارض يبقى ظاهراً");
check(campusFromToday([], 600).length === 0, "بلا محاضراتٍ لا مباني (والبطاقة لا تُرسم)");
check(daylightAt(12 * 60) > 0.9 && daylightAt(23 * 60) === 0.12 && daylightAt(3 * 60) === 0.12, "ضوء النهار: يعلو قرب الظهر، وليلٌ هادئ لا ظلامٌ تام");
check(daylightLabel(8 * 60) === "صباح" && daylightLabel(13 * 60) === "ظهيرة" && daylightLabel(17 * 60) === "مساء" && daylightLabel(22 * 60) === "ليل", "اسم وقت اليوم");

/* ── S: التوصيل ── */
const card = read("src/components/campusLive/CampusLiveCard.tsx");
const scene = read("src/components/campusLive/campusScene.ts");
const dash = read("src/components/Dashboard.tsx");
check(/import\("\.\/campusScene"\)/.test(card) && !/from "three"/.test(card), "three.js يُحمَّل كسولاً مع المشهد، لا في حزمة الرئيسية");
check(/prefers-reduced-motion/.test(card) && /canUseWebGL/.test(card) && /cl-map/.test(card), "بديلٌ ساكن بلا WebGL أو مع تقليل الحركة");
check(/seedScheduleQuickSearch\(code\)/.test(card) && /onNavigate\("schedules"\)/.test(card) && /canOpenSchedule/.test(card), "الضغط على مبنى يفتح الجدول ببحثه السريع (الطريق القائم) ولمن يبني الجدول فقط");
check(read("src/utils/actualDemandHandoff.ts").includes("export function seedScheduleQuickSearch") && read("src/components/Schedules.tsx").includes("takeFocusedCourse()"), "البذرة تُقرأ بالقارئ القائم في الجدول");
check(!/fetch\(/.test(card) && !/fetch\(/.test(scene) && /dispose\(\)/.test(scene), "الحرم لا يطلب شيئاً من الخادم، ويُفرغ المشهد عند الإغلاق");
check(/<CampusLiveCard today=\{today\}/.test(dash) && /TermFilmCard/.test(dash) && /DeanHallPulseCard/.test(dash), "البطاقة مضافة إلى الرئيسية، والبطاقات القائمة باقية");

const tower = read("src/components/RegistrationTower.tsx");
const board = read("src/components/LiveRegistrationBoard.tsx");
check(/FILLING_AT/.test(tower) && /is-hot/.test(tower) && !/fetch\(|request\(|SuggestionCard|onApplied/.test(tower), "البرج: نبضٌ أحمر من حدّ «يمتلئ» نفسه، ولا قراءة ولا اعتماد من داخله");
check(/<RegistrationTower rows=\{rows\}/.test(board) && /برج المراقبة/.test(board), "البرج من صفوف اللوحة نفسها، وزرّه في رأسها");
check(/prefers-reduced-motion/.test(read("src/styles/94-registration-tower.css")), "البرج يحترم تقليل الحركة");

const metro = read("src/components/ScenarioMetro.tsx");
const tm = read("src/components/TimeMachine.tsx");
check(/onOpen\(branch\.record!\)/.test(metro) && /<ScenarioMetro saved=\{saved\}/.test(tm) && /<SavedScenarios list=\{saved\}/.test(tm), "خريطة المترو تفتح المحفوظ كزرّه، والقائمة القائمة باقية");
const curtain = read("src/components/CurtainCompare.tsx");
const bench = read("src/components/ScenarioWorkbench.tsx");
check(/<CurtainCompare before=\{base\} after=\{after\}/.test(bench) && /<TimeSlider before=\{base\}/.test(bench), "الستارة من «قبل» و«بعد» المنضدة نفسها، والمنزلقة القائمة باقية");
check(/role="slider"/.test(curtain) && /ArrowLeft/.test(curtain) && !/fetch\(|postJson/.test(curtain), "الستارة تُحرَّك بالسحب والأسهم ولا تكتب شيئاً");

const exp = read("src/components/TermFilmExport.tsx");
check(/canvas\.width = 1080; canvas\.height = 1920/.test(exp), "بطاقات المشاركة عمودية 9:16 (1080×1920)");
check(/MediaRecorder/.test(exp) && /captureStream/.test(exp) && /videoType\(\)|useState\(videoType\)/.test(exp), "الفيديو حيث يدعم المتصفّح MediaRecorder وcaptureStream فقط");
check(!/fetch\(|XMLHttpRequest|sendBeacon/.test(exp.replace(/await fetch\(src\)/g, "")), "التصدير على الجهاز: لا طلبَ إلى أي خادم");
check(/<TermFilmExport film=\{film\} \/>/.test(read("src/components/TermFilm.tsx")), "زرّ التصدير تحت مشغّل الفيلم");

console.log(`\n${passed} ناجح · ${failed} فاشل`);
if (failed) process.exit(1);
