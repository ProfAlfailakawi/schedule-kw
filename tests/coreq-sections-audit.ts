/**
 * ── المقرن (التوأم) والشعب المتعددة ────────────────────────────────────────────
 * لا تحذيرَ إلا إن تداخلت كلُّ تركيبات الشعب بين المقررين؛ وإن بقيت تركيبةٌ خالية فالصمت.
 * ثم ربطُ التنبيه اللين في بوابة «موعد» بلا منع، ونطاقُ القراءة في الخادم.
 */
import fs from "node:fs";
import { coreqFindings, partnersOfCourse } from "../src/utils/coreqSections";
import { isBlockingConflict } from "../src/utils/scheduleIntelligence";
import { conflictKind } from "../src/utils/appointmentVerdict";
import type { SlotRow } from "../src/utils/sameSlot";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};

const A = 1, B = 2;   // شفافيات ولوحات: مقرنان
const row = (id: number, course: number, scode: string, days: string, start: string, end: string): SlotRow => ({
  id, AdCourseId: course, AdSectionId: 7, AdTermId: 1, SCode: scode, fstarttime: start, fendtime: end,
  fsunday: days.includes("s"), fmonday: days.includes("m"), ftuesday: days.includes("t"), fwednesday: days.includes("w"), fthursday: days.includes("h"),
});
const mine = (scode: string, days: string, start: string, end: string) => row(0, A, scode, days, start, end);

/* شعبةٌ واحدة لكلٍّ: تداخلٌ إجباري → تحذير. */
let f = coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "st", "10:30", "11:45")], [B]);
check(f.length === 1 && f[0].partnerCourseId === B && f[0].alternative === false && f[0].overlapRowIds[0] === 10, "شعبةٌ لكلٍّ ويتداخلان: لا بديل", f);

/* للمقرن شعبةٌ ثانية خالية → «ممتازة»: توجد تركيبة نظيفة. */
f = coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "st", "10:30", "11:45"), row(11, B, "2", "st", "13:00", "14:15")], [B]);
check(f.length === 1 && f[0].alternative === true, "شعبةٌ ثانية للمقرن خالية: يوجد بديل", f);

/* للمقرر نفسه شعبةٌ ثانية خالية من المقرن → بديل أيضاً. */
f = coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "st", "10:30", "11:45"), row(20, A, "2", "st", "13:00", "14:15")], [B]);
check(f[0]?.alternative === true, "شعبةٌ ثانية للمقرر نفسه خالية: يوجد بديل", f);

/* كلُّ التركيبات متداخلة → لا بديل. */
f = coreqFindings(mine("1", "st", "10:00", "11:15"), [
  row(10, B, "1", "st", "10:30", "11:45"), row(11, B, "2", "st", "10:00", "11:15"),
  row(20, A, "2", "st", "10:20", "11:00"),
], [B]);
check(f[0]?.alternative === false, "كل التركيبات متداخلة: لا بديل", f);

/* الشعبةُ ذات الصفّين: المختبر يتداخل فيفسد التركيبة. */
f = coreqFindings(mine("1", "s", "10:00", "11:15"), [
  row(10, B, "1", "s", "08:00", "08:50"), row(12, B, "1", "t", "12:00", "13:15"),   // محاضرة ثم مختبر لشعبة المقرن
  row(11, B, "2", "s", "10:30", "11:45"),
  row(21, A, "1", "t", "10:00", "11:15"),                                           // إخوة شعبتي نفسها
], [B]);
check(f[0]?.overlapRowIds.join() === "11" && f[0]?.alternative === true, "شعبة المقرن ١ بلا تداخل مع الموعد الجديد وحده فتبقى تركيبة", f);
f = coreqFindings(mine("1", "s", "10:00", "11:15"), [
  row(10, B, "1", "t", "10:00", "11:15"), row(11, B, "2", "s", "10:30", "11:45"),
  row(21, A, "1", "t", "10:00", "11:15"),
], [B]);
check(f[0]?.alternative === false, "إخوة شعبتي (يوم الثلاثاء) يتداخلون مع كلتا شعبتي المقرن", f);

/* لا تداخل: لا تحذير. */
check(coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "st", "11:15", "12:30")], [B]).length === 0, "التلاصق ليس تداخلاً");
check(coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "mw", "10:00", "11:15")], [B]).length === 0, "يومٌ آخر: لا تداخل");
check(coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, 99, "1", "st", "10:00", "11:15")], [B]).length === 0, "مقررٌ ليس مقرناً: لا شيء");
check(coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "st", "10:00", "11:15")], []).length === 0, "بلا مقرنات: لا شيء");
check(coreqFindings(mine("1", "st", "10:00", "11:15"), [row(-5, B, "1", "st", "10:00", "11:15")], [B]).length === 0, "حجزُ طلبٍ (معرّفٌ سالب) لا يُحسب");

/* الموعد المعدَّل يُستثنى. */
check(coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "st", "10:30", "11:45")], [B], 10).length === 0, "الصفّ المعدَّل لا يُعدّ مقرناً لنفسه");
f = coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "1", "st", "10:30", "11:45"), row(30, A, "1", "mw", "08:00", "09:00")], [B], 30);
check(f.length === 1 && f[0].alternative === false, "المعدَّل (30) لا يُحسب شعبةً بديلة", f);

/* الاتجاهان. */
const pairs = [[1, 2], [2, 3]];
check(partnersOfCourse(pairs, 2).sort().join() === "1,3" && partnersOfCourse(pairs, 1).join() === "2" && partnersOfCourse(pairs, 9).length === 0, "المقرنات في الاتجاهين");
f = coreqFindings(row(0, B, "1", "st", "10:00", "11:15"), [row(10, A, "1", "st", "10:30", "11:45")], partnersOfCourse(pairs, B));
check(f.length === 1 && f[0].partnerCourseId === A, "الاتجاه المعاكس يعمل");

/* بوابة «موعد»: لينة لا تمنع، وتُصنَّف مع الشعبة. */
const note = { type: "coreq", severity: "low", soft: true };
check(!isBlockingConflict(note) && !isBlockingConflict({ type: "coreq", severity: "low" }) && conflictKind(note) === "section", "تنبيه المقرن لا يمنع ويُصنَّف «الشعبة»");
const gate = fs.readFileSync("src/server/core/scheduleConflicts.ts", "utf8");
check(/type: "coreq", severity: "low", soft: true/.test(gate) && gate.includes("if (finding.alternative) continue;") && gate.includes("يتداخل مع مقرنه:"), "البوابة تقول عند انعدام البديل فقط");
check(gate.includes("Number(item.AdSectionId) === Number(candidate.AdSectionId)"), "تُقرأ مقرنات القسم وشعبه وحدها");
const routes = fs.readFileSync("src/server/routes/scheduleToolsRoutes.ts", "utf8");
check(/coreq-pairs[\s\S]{0,400}isScopeAllowed\(req, collegeId, sectionId\)/.test(routes), "مسار المقرنات يحرس النطاق");
const pairsSrc = fs.readFileSync("src/server/core/coreqPairs.ts", "utf8");
check(/status !== "archived"/.test(pairsSrc) && /getRuleSet/.test(pairsSrc) && !/getRuleDraft/.test(pairsSrc), "من الصحيفة المعتمدة لا المسوّدات");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
