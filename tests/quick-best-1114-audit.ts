/**
 * ── «نبض الطلبة» في البطاقة السريعة، و«أفضل وقت» يبحث عن القاعة (2026-11-14) ────────────────
 *
 *  F  fitChipsOf: شريحة «لا مفرّ منه» أولاً، ثم الخريجون ثم الطلبة، بلون الفئة (85/60) والنسبة بـ«%» لا «٪» (قاعدة الأرقام اللاتينية).
 *  S  الربط في المصدر: البطاقة السريعة تحفظ studentFit من ردّ الفحص وتعرض الشريط بعد انتهاء الفحص؛ و«أفضل وقت»
 *     يضع الوقت بالمسار نفسه ثم يسأل محرّك «اقترح قاعة» عن قاعةٍ في ذلك الوقت — يُبقي القاعة الخالية، ويترك الوقت وحده
 *     إن لم توجد قاعة — وزرّه لا يذكر قاعةً ولا مبنى.
 */
import fs from "node:fs";
import { fitChipsOf } from "../src/components/StudentPulse";
import type { StudentFit } from "../src/utils/studentFit";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const side = (percent: number | null, blocked: number, need = 22) => ({ need, fit: need - blocked, blocked, percent, clashes: [] });
const fit = (graduates: ReturnType<typeof side> | null, students: ReturnType<typeof side> | null): StudentFit => ({ track: "boys", sections: { before: 1, after: 1 }, graduates, students });

(async () => {
/* F */
const chips = fitChipsOf(fit(side(72, 6), side(88, 16, 136)), { graduates: 3 });
check(chips.map(chip => chip.key).join() === "alarm,grad,stud", "F1 الترتيب: لا مفرّ منه ثم الخريجون ثم الطلبة", chips.map(chip => chip.key));
check(chips[1].value === "72%" && chips[1].tone === "warn" && chips[2].value === "88%" && chips[2].tone === "good", "F2 النسبة بـ«%» وبلون الفئة", chips);
check(chips[0].tone === "bad" && chips[0].value === "3" && /3 خريجين/.test(chips[0].title), "F3 شريحة «لا مفرّ منه» حمراء بعدد الخريجين وتلميحها بمعدوده", chips[0]);
check(/يحجب 6 خريجين/.test(chips[1].title) && /يحجب 16 طالباً/.test(chips[2].title), "F4 التلميح يقول ما يحجبه بمعدوده");
check(fitChipsOf(fit(side(100, 0), null)).length === 1 && /يناسب كل 22 خريجاً/.test(fitChipsOf(fit(side(100, 0), null))[0].title), "F5 لا حجب: «يناسب كل 22 خريجاً»");
check(fitChipsOf(null).length === 0 && fitChipsOf(fit(side(null, 0), null)).length === 0 && fitChipsOf(fit(null, null), { graduates: 0 }).length === 0, "F6 بلا تقريرٍ أو نسبة: لا شرائح");
check(!chips.some(chip => /٪/.test(chip.value + chip.title + chip.label)), "F7 لا «٪» في النصوص المعروضة");

/* M: تقدير الطلبة عامةً — تداخلٌ متوقَّع باستقلال التسجيل، لا أقصى تداخلٍ ممكن (الأدنى كان يُشبع الخانات بـ0٪ على تقريرٍ حقيقي) */
{
  const { studentFitOf } = await import("../src/utils/studentFit");
  type Prog = Array<[string, number, number]>;
  const mk = (code: string, programs: Prog) => { const boys = programs.reduce((x, p) => x + p[1], 0), girls = programs.reduce((x, p) => x + p[2], 0);
    return { code, name: `مقرر ${code}`, units: 3, offered: { boys: 0, girls: 0 }, average: { boys: 0, girls: 0 }, students: { boys, girls, total: boys + girls }, suggested: { boys: 0, girls: 0, total: 0 },
      programs: programs.map(([c, b, g]) => ({ code: c, name: c, boys: b, girls: g, total: b + g })) }; };
  /* دفعة BA-1 = 1000 (يأخذها الجميع في «عام»)؛ مقررنا 100؛ «خاص» 200 */
  const general = { termLabel: "", department: "ت", facultyCount: 0, legalLoad: 0, warnings: [], courses: [mk("0100001", [["BA-1", 1000, 0]]), mk("0100002", [["BA-1", 100, 0]]), mk("0100003", [["BA-1", 200, 0]])] };
  const matches = new Map([["0100001", { code: "0100001", status: "matched" as const, courseIds: [1] }], ["0100002", { code: "0100002", status: "matched" as const, courseIds: [2] }], ["0100003", { code: "0100003", status: "matched" as const, courseIds: [3] }]]);
  const members = [{ collegeId: 11, track: "boys" as const }];
  const row = (id: number, courseId: number, start: string, end: string) => ({ id, AdCourseId: courseId, AdCollegeId: 11, SCode: "01", fstarttime: start, fendtime: end, fsunday: true } as any);
  const rows = [row(1, 1, "08:00", "09:00"), row(3, 3, "10:00", "11:00")];
  const withAll = studentFitOf({ general, graduates: null, matches, members, rows, candidate: row(-1, 2, "08:00", "09:00") });
  check(withAll?.students?.percent === 0 && withAll.students.blocked === 100, "M1 مقررٌ يأخذه كل الدفعة يحجب الجميع: 0٪", withAll?.students);
  const withSmall = studentFitOf({ general, graduates: null, matches, members, rows, candidate: row(-1, 2, "10:00", "11:00") });
  check(withSmall?.students?.blocked === 20 && withSmall.students.percent === 80, "M2 مقررٌ لخُمس الدفعة يحجب خُمس من يحتاجون هذا (20 من 100): 80٪", withSmall?.students);
  const free2 = studentFitOf({ general, graduates: null, matches, members, rows, candidate: row(-1, 2, "13:00", "14:00") });
  check(free2?.students?.percent === 100, "M3 وقتٌ بلا تداخل: 100٪");
  const asGrads = studentFitOf({ general: null, graduates: general, matches, members, rows, candidate: row(-1, 2, "10:00", "11:00") });
  check(asGrads?.graduates?.blocked === 100 && asGrads.graduates.percent === 0, "M4 الخريجون يبقون على الحدّ الأقصى (الأدنى): من أنهوا ما بقي عليهم يحتاجون ما يُذكر معاً", asGrads?.graduates);
  const both = studentFitOf({ general, graduates: null, matches, members, rows: [row(1, 1, "08:00", "09:00"), row(3, 3, "08:30", "09:30")], candidate: row(-1, 2, "08:00", "09:00") });
  check(both?.students?.blocked === 100, "M5 مقرران يحجبان معاً لا يتجاوز المحجوبُ حاجةَ المقرر", both?.students);
}

/* S */
const read = (file: string) => fs.readFileSync(file, "utf8");
const quick = read("src/components/QuickCreatePopover.tsx"), schedules = read("src/components/Schedules.tsx"), pulse = read("src/components/StudentPulse.tsx"), css = read("src/styles/58-appt-ideas.css");
check(/studentFit: result\.studentFit && typeof result\.studentFit === "object"/.test(quick) && /graduateImpact: Number\(result\.graduateImpact\?\.graduates\) > 0/.test(quick), "S1 البطاقة السريعة تحفظ studentFit وgraduateImpact من ردّ الفحص نفسه");
check(/previewCurrent && !liveCheck\.checking \? <FitStrip/.test(quick), "S2 الشريط بعد انتهاء الفحص لهذه القيم بالضبط");
check(/const pickBestTime = async \(best: BestTime\)/.test(schedules) && /suggestionBody\(\{ \.\.\.timed,[^}]*\}, "room"\)/.test(schedules), "S3 «أفضل وقت» يسأل محرّك «اقترح قاعة» لذلك الوقت");
check(/free\.some\(slot => slot\.roomId === form\.roomId\)\)\) return;/.test(schedules) && /if \(!free\.length/.test(schedules), "S4 القاعة الخالية المختارة تبقى، وبلا قاعةٍ يبقى الوقت وحده");
check(/previous\.fstarttime !== best\.start \? previous/.test(schedules), "S5 جوابٌ متأخر لا يكتب قاعةً في نموذجٍ تغيّر");
check(/bestBusy=\{bestBusy\} currentDays=\{formDays\} onPickBest=\{best => void pickBestTime\(best\)\}/.test(schedules) && /bestDays/.test(read("src/components/StudentPulse.tsx")), "S6 الزرّ يدور أثناء البحث ويُعطَّل، ويذكر الأيام إن خالفت الحالية");
const label = pulse.slice(pulse.indexOf('className={`pulse-best'), pulse.indexOf("</button>", pulse.indexOf('className={`pulse-best')));
check(/best\.start/.test(label) && /best\.percent/.test(label) && !/room|hall|building|قاعة|مبنى/i.test(label.replace(/aria-label[^\n]*\n/, "").replace(/title=[^\n]*\n/, "")), "S7 الزرّ يقول الوقت والنسبة فقط — لا قاعةً ولا مبنى");
check(/\.fit-strip\{/.test(css) && /\.fit-chip\.is-grad/.test(css) && /\.pulse-best-spin/.test(css), "S8 الأنماط: الشريط والشرائح ودوران الزرّ");
check(/useState\(\(\) => safeStorage\.get\(OPEN_KEY\) === "on"\)/.test(pulse), "S9 نبض الطلبة مسكّرٌ افتراضاً ويتذكّر من فتحه");
check(/aria-expanded=\{open\}/.test(pulse) && /\{open \? \(\s*<div className="pulse-body"/.test(pulse) && /className="pulse-toggle"/.test(pulse), "S10 زرّ طيٍّ بـaria-expanded، والتفصيل لا يُرسم إلا مفتوحاً");
check(/\{open\s*\?[^]*?: <span className="pulse-chips">/.test(pulse) && /showBest && best \?/.test(pulse), "S11 المطويّ يُبقي الشرائح (والإنذار) وزرّ «أفضل وقت» ظاهرَين");

console.log(`\nquick-best-1114 audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
