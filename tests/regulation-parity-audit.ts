/**
 * ── تكافؤ العميل والخادم في «هل هذا الموعد نمطٌ معتمد؟» ──────────────────────────────
 * الخادم هو الحَكَم (scheduleRules: scheduleLengthIssue ثم unapprovedPatternIssue). العميلُ يقرأ بالدوال نفسها
 * (sectionWeeklyHours + sectionDaysFitLibrary + patternLengthIssue) عبر regulationFit(…, siblings).
 * المصفوفة: ساعات 1–5 × كل مجموعات الأيام × أطوالٌ كثيرة، وصفٌّ وحيد في شعبته — لا تباين.
 * ثم: النهاية بساعةٍ غير صحيحة، وأطوال العجلة، وسُلّمُ البدايات لا يعرض ما ينتهي بعد يوم الجامعة، ولا ملاحظةَ على نمطٍ معتمد.
 */
import fs from "node:fs";
import * as R from "../src/utils/appointmentRegulation";
import * as S from "../src/utils/scheduleRegulations";
import { isValidClock, withinUniversityDay } from "../src/utils/scheduleTime";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};
const K = S.DAY_KEYS; type D = typeof K[number];
const mm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const ck = (v: number) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
const rowOf = (days: D[], start: string, end: string) => { const r: any = { fstarttime: start, fendtime: end }; K.forEach(k => r[k] = days.includes(k)); return r; };

/** مرآةٌ خالصة لما يمنعه الخادم لشعبةٍ صفُّها الوحيد هذا (scheduleRules.ts: scheduleLengthIssue + unapprovedPatternIssue). */
function serverBlocks(hours: number, days: D[], start: string, end: string): string {
  const row = rowOf(days, start, end);
  if (!days.length) return "no-day";
  if (!isValidClock(start) || !isValidClock(end)) return "bad-clock";
  if (mm(end) <= mm(start)) return "end<=start";
  if (!withinUniversityDay(mm(start), mm(end))) return "outside-day";
  const reading = S.sectionWeeklyHours(row, [], hours);
  if (reading.total > S.maxWeeklyMinutesFor(hours)) return `over ${reading.total}/${reading.max}`;
  if (reading.under) return `under ${reading.total}/${reading.required}`;
  const fits = S.sectionDaysFitLibrary(hours, row, []);
  if (fits !== false) return R.patternLengthIssue({ CourseHours: hours }, days, start, end) ? "length" : "";
  return "pattern-days";
}

const subsets: D[][] = [];
for (let m = 1; m < 32; m++) subsets.push(K.filter((_, i) => m & (1 << i)));
const lens = [30, 45, 50, 60, 75, 80, 90, 100, 105, 110, 120, 150, 155, 160, 165, 170, 180, 200, 230, 290];
const mismatches: string[] = [];
let total = 0;
for (const hours of [1, 2, 3, 4, 5]) for (const days of subsets) for (const len of lens) {
  const start = "08:00", end = ck(mm(start) + len);
  const fit = R.regulationFit({ CourseHours: hours }, days, start, end, []);
  const block = serverBlocks(hours, days, start, end);
  total++;
  if ((fit === "off") !== Boolean(block)) mismatches.push(`${hours}h ${days.map(d => d.slice(1, 4)).join("+")} ${len}m client=${fit} server=${block || "OK"}`);
}
check(mismatches.length === 0, `P1 ${total} حالة (ساعات 1–5 × 31 مجموعة أيام × ${lens.length} طولاً): لا تباين بين العميل والخادم`, mismatches.slice(0, 8));

/* الأمثلة التي كشفها التدقيق */
const c = (hours: number) => ({ CourseHours: hours });
check(R.regulationFit(c(5), ["fmonday", "fwednesday"], "08:00", "10:50", []) === "off", "P2 خمس ساعات اثنين·أربعاء صفٌّ واحد 170: يتجاوز (340/275) — كان «fits»");
check(R.regulationFit(c(3), ["fsunday"], "08:00", "08:50", []) === "off", "P3 ثلاث ساعات أحد 50 وحده: ناقص 50/150");
check(R.regulationFit(c(3), ["fmonday"], "08:00", "09:20", []) === "off", "P3 ثلاث ساعات اثنين 80 وحده: ناقص");
check(R.regulationFit(c(2), ["ftuesday"], "08:00", "08:50", []) === "off", "P3 ساعتان ثلاثاء 50 وحده: ناقص");
check(R.regulationFit(c(3), ["fsunday", "ftuesday"], "14:00", "15:20", []) === "fits", "P4 مثال المالك I1: ثلاث ساعات أحد·ثلاثاء 14:00–15:20 سليم");
check(R.regulationFit(c(3), ["fmonday"], "08:00", "10:50", []) === "fits" && R.regulationFit(c(3), ["fsunday", "ftuesday", "fthursday"], "09:00", "09:50", []) === "fits", "P4 الكتلة 170 والأحد·الثلاثاء·الخميس 50 سليمان");
/* شعبةٌ تُبنى صفّاً صفّاً: مع الصفوف الأخرى يصحّ الصف */
check(R.regulationFit(c(3), ["fsunday"], "08:00", "08:50", [rowOf(["ftuesday"], "08:00", "08:50"), rowOf(["fthursday"], "08:00", "08:50")]) === "fits", "P5 «أحد 50» وأخواه موجودان: الشعبةُ كاملة فتصحّ");
check(R.regulationFit(c(5), ["fmonday"], "08:00", "10:50", [rowOf(["fwednesday"], "08:00", "09:50")]) === "fits", "P5 الخمس ساعات صفّان 170 + 110 يصحّان معاً");
/* القراءةُ القديمة بلا صفوفٍ أخرى: لا «اثنين·أربعاء 170» سليمة لخمس ساعات */
check(R.regulationFit(c(5), ["fmonday", "fwednesday"], "08:00", "10:50") === "off", "P6 بلا siblings: صفٌّ بيومين لا يكون جزءاً من نمطٍ بطولين");
check(R.regulationFit(c(5), ["fwednesday"], "08:00", "09:50") === "fits", "P6 بلا siblings: الأربعاء 110 لقاءٌ من نمط الخمس ساعات");

/* regulationEnd بساعةٍ غير صحيحة */
check(R.regulationEnd(c(3), ["fmonday"], "25:00") === "" && R.regulationEnd(c(3), ["fmonday"], "08:60") === "" && R.regulationEnd(c(3), ["fmonday"], "24:00") === "", "E1 بدايةٌ غير صحيحة: لا نهاية (كانت 23:59 و10:20)");
check(R.regulationEnd(c(3), ["fmonday"], "08:00") === "10:50" && R.regulationEnd(c(3), ["fmonday"], "8:00") === "10:50", "E2 البداية الصحيحة كما كانت");

/* أطوال العجلة (قرار المالك أ) */
check(JSON.stringify(R.wheelLengths(c(3), ["fsunday"])) === "[170]" && R.fixedWheelLength(c(3), ["fsunday"]) === 170, "W1 ثلاث ساعات ويومٌ واحد: الكتلة 170 وحدها (قيمةٌ ثابتة)");
check(JSON.stringify(R.wheelLengths(c(3), ["fsunday", "ftuesday", "fthursday"])) === "[50]", "W2 ثلاثة أيام: 50");
check(JSON.stringify(R.wheelLengths(c(3), ["fmonday", "fwednesday"])) === "[80]" && JSON.stringify(R.wheelLengths(c(3), ["fsunday", "ftuesday"])) === "[80]", "W3 يومان: 80");
check(JSON.stringify(R.wheelLengths(c(2), ["fmonday"])) === "[110]" && JSON.stringify(R.wheelLengths(c(4), ["fmonday"])) === "[230]" && JSON.stringify(R.wheelLengths(c(5), ["fmonday"])) === "[290]" && JSON.stringify(R.wheelLengths(c(1), ["fmonday"])) === "[50]", "W4 بقية الساعات: كتلة اليوم الواحد");
check(R.wheelLengths(c(0), ["fmonday"]) === null && R.fixedWheelLength(c(3), []) === null, "W5 بلا ساعات: القائمة الافتراضية؛ بلا أيام: لا قيمة ثابتة");
/* كل ما تعرضه العجلة ليومٍ واحد يبقى بعد تغيير البداية */
for (const hours of [1, 2, 3, 4, 5]) {
  const lengths = R.wheelLengths(c(hours), ["fsunday"]) || [];
  const kept = lengths.every(length => R.completeSectionEnd(c(hours), ["fsunday"], "09:00", length) === ck(mm("09:00") + length));
  check(kept, `W6 ${hours} ساعات يومٌ واحد: كلُّ طولٍ تعرضه العجلة يبقى بعد تغيير البداية`, lengths);
}

/* سُلّم البدايات */
const ladder80 = S.ladderStartsForDays(["fsunday", "ftuesday"], 8 * 60, 20 * 60, 80);
check(ladder80[ladder80.length - 1] === "18:00" && !ladder80.includes("19:00"), "L1 أحد·ثلاثاء 80: لا 19:00 (ينتهي 20:20)", ladder80);
const ladder170 = S.ladderStartsForDays(["fsunday"], 8 * 60, 20 * 60, 170);
check(ladder170[ladder170.length - 1] === "17:00" && !ladder170.includes("18:00") && !ladder170.includes("19:00"), "L1 كتلة 170: آخرها 17:00", ladder170);
check(S.ladderStartsForDays(["fsunday"]).includes("19:00"), "L2 بلا طولٍ تبقى القائمة كلُّها (لا كسر للمستدعين)");
const ladderMW = S.ladderStartsForDays(["fmonday", "fwednesday"], 8 * 60, 20 * 60, 80);
check(ladderMW.every(t => mm(t) + 80 <= 20 * 60) && ladderMW.includes("18:30") && !ladderMW.includes("20:00"), "L3 اثنين·أربعاء 80", ladderMW);

/* لا ملاحظةَ على نمطٍ معتمد */
const advise = (days: D[], start: string, end: string) => S.adviseDayPattern(days, start, end);
check(advise(["fsunday", "ftuesday"], "14:00", "15:20") === null, "A1 ثلاث ساعات أحد·ثلاثاء 14:00–15:20: لا ملاحظة (I1)");
check(advise(["fmonday", "fwednesday"], "08:00", "09:50") === null, "A1 اثنين·أربعاء 110 (أربع ساعات): لا ملاحظة");
check(advise(["fmonday"], "08:00", "10:50") === null && advise(["fsunday"], "08:00", "10:50") === null, "A1 كتلة 170: لا ملاحظة");
check(advise(["fsunday", "ftuesday", "fthursday"], "08:00", "08:50") === null, "A1 أحد·ثلاثاء·خميس 50: لا ملاحظة");
check(advise(["fmonday", "fwednesday"], "08:00", "09:15")?.changed === true, "A2 اثنين·أربعاء 75د ليس في المكتبة: يبقى التنبيه");
check(advise(["fsunday", "fmonday"], "08:00", "08:50")?.family === "mixed", "A2 أيامٌ مختلطة: تبقى الملاحظة");

/* الخادم يقرأ الدوال نفسها (حارسُ الانجراف) */
const rules = fs.readFileSync("src/server/core/scheduleRules.ts", "utf8");
check(/sectionWeeklyHours\(row,siblings,hours\)/.test(rules) && /sectionDaysFitLibrary\(hours,row,siblings\)/.test(rules) && /patternLengthIssue\(/.test(rules), "G1 الخادم ما زال يقرأ الدوالَّ التي يقلّدها العميل");

console.log(`\nregulation-parity audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
