/**
 * ── المقرن (التوأم) والشعب المتعددة ────────────────────────────────────────────
 * لا تحذيرَ إلا إن تداخلت كلُّ تركيبات الشعب بين المقررين؛ وإن بقيت تركيبةٌ خالية فالصمت.
 * ثم ربطُ التنبيه اللين في بوابة «موعد» بلا منع، ونطاقُ القراءة في الخادم.
 */
import fs from "node:fs";
import { coreqFindings, coreqForcedClash, coreqFreeTime, coreqScopeRows, partnersOfCourse } from "../src/utils/coreqSections";
import { deferCoreqClashes, orderSuggestionCandidates, type SuggestionCandidate } from "../src/utils/suggestionEngine";
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
check(gate.includes("coreqScopeRows(all as any"), "تُقرأ مقرنات القسم وشعبه وحدها");
const routes = fs.readFileSync("src/server/routes/scheduleToolsRoutes.ts", "utf8");
check(/coreq-pairs[\s\S]{0,400}isScopeAllowed\(req, collegeId, sectionId\)/.test(routes), "مسار المقرنات يحرس النطاق");
/* ── ملاحظات المراجعة ── */
{
  const day = { start: 480, end: 1200 };
  const clashing = row(10, B, "1", "st", "10:00", "11:15");
  /* «01» و«1» شعبةٌ واحدة: صفّاها لا يُقرآن شعبتين فلا تظهر تركيبةٌ وهمية. */
  let n = coreqFindings(mine("01", "s", "10:00", "11:15"), [row(10, B, "1", "s", "10:30", "11:45"), row(12, B, "01", "t", "13:00", "14:15")], [B]);
  check(n[0]?.alternative === false, "«01» و«1» من المقرن شعبةٌ واحدة: لا بديل وهمي", n);
  n = coreqFindings(mine("01", "s", "10:00", "11:15"), [row(10, B, "1", "t", "10:00", "11:15"), row(11, B, "2", "s", "10:30", "11:45"), row(20, A, "1", "t", "10:00", "11:15")], [B]);
  check(n[0]?.alternative === false, "«1» إخوةُ «01» من مقرره، لا شعبةٌ بديلة", n);
  const sw = coreqFreeTime(mine("01", "s", "10:00", "11:15"), [clashing, row(11, B, "02", "s", "13:00", "14:15")], B, day);
  check(sw.partnerSection === "02", "الرقمُ المعروض يبقى كما خُزّن", sw);

  /* لا بديل بصفٍّ بلا وقت أو بلا رقم شعبة. */
  const noTime = (id: number, course: number, code: string): SlotRow => ({ ...row(id, course, code, "", "", ""), fstarttime: undefined, fendtime: undefined });
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [clashing, noTime(11, B, "2")], [B]);
  check(n[0]?.alternative === false, "شعبةُ مقرنٍ بلا وقت ليست بديلاً", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [clashing, row(11, B, "2", "", "13:00", "14:15")], [B]);
  check(n[0]?.alternative === false, "شعبةُ مقرنٍ بوقتٍ بلا يوم ليست بديلاً", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [clashing, row(11, B, "  ", "st", "13:00", "14:15")], [B]);
  check(n[0]?.alternative === false, "صفُّ مقرنٍ بلا رقم شعبة ليس بديلاً", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [clashing, noTime(20, A, "2")], [B]);
  check(n[0]?.alternative === false, "شعبةٌ من مقرره بلا وقت ليست بديلاً كذلك", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [row(10, B, "", "st", "10:00", "11:15")], [B]);
  check(n.length === 1 && n[0].alternative === false, "صفٌّ متداخل بلا رقم شعبة يُقال، ولا بديلَ غيره", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [clashing, row(11, B, "2", "st", "13:00", "14:15"), noTime(12, B, "2")], [B]);
  check(n[0]?.alternative === true, "شعبةٌ لها وقتٌ حقيقي ومعه صفٌّ بلا وقت: بديلٌ قائم", n);
  const ft = coreqFreeTime(mine("1", "st", "10:00", "11:15"), [clashing, noTime(11, B, "2")], B, day);
  check(!ft.partnerSection && !ft.ownSection, "ورقة المقرن لا تسمّي شعبةً بلا وقت", ft);

  /* الحجوز حقيقية: تُعدّ كما يعدّها تعارضُ الشعبتين؛ وصفوفُ التجربة خارج التلميح. */
  const hold = (id: number, course: number, days: string, start: string, end: string, at: number): SlotRow => row(id, course, `reservation:${at}`, days, start, end);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [hold(-2_000_000_000, B, "st", "10:30", "11:45", 0)], [B]);
  check(n.length === 1 && n[0].overlapRowIds[0] === -2_000_000_000, "حجزُ طلبٍ لمقرنه يُعدّ تداخلاً", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [clashing, hold(-1_999_999_990, B, "st", "13:00", "14:15", 1)], [B]);
  check(n[0]?.alternative === true, "وحجزٌ خالٍ يُعدّ شعبةً قائمة", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [row(-123456, B, "1", "st", "10:30", "11:45")], [B]);
  check(n.length === 0, "صفُّ التجربة لا يُعدّ تداخلاً", n);
  n = coreqFindings(mine("1", "st", "10:00", "11:15"), [clashing, row(-123456, B, "2", "st", "13:00", "14:15")], [B]);
  check(n[0]?.alternative === false, "ولا بديلاً", n);

  /* نطاقٌ واحد للخادم والمتصفح؛ مقرنٌ يدرّسه قسمٌ آخر خارجه. */
  const scoped = coreqScopeRows([
    { id: 1, AdSectionId: 7, AdTermId: 1 }, { id: 2, AdSectionId: 8, AdTermId: 1 }, { id: 3, AdSectionId: 7, AdTermId: 2 },
    { id: 4, AdTermId: 1 }, { id: 5, AdSectionId: 7 },
  ] as SlotRow[], { sectionId: 7, termId: 1 });
  check(scoped.map(item => item.id).join() === "1", "نطاقُ المقرن: القسمُ والفصلُ بالضبط، وبلا قسمٍ أو فصلٍ لا يُعدّ", scoped);
  check(coreqScopeRows([{ id: 1, AdSectionId: 7 }] as SlotRow[], { sectionId: 7 }).length === 1, "بلا فصلٍ في السؤال: القسمُ وحده");
  check(coreqScopeRows([{ id: 1, AdSectionId: 7 }] as SlotRow[], {}).length === 0, "بلا قسم: لا نطاق");
  const gate = fs.readFileSync("src/server/core/scheduleConflicts.ts", "utf8"), sheet = fs.readFileSync("src/components/SameSlotHint.tsx", "utf8");
  check(/coreqScopeRows\(all as any, \{ sectionId: Number\(candidate\.AdSectionId\), termId: Number\(candidate\.AdTermId\) \|\| undefined \}\)/.test(gate) && /coreqScopeRows\(rows, \{ sectionId, termId \}\)/.test(sheet), "ملاحظةُ الخادم وورقةُ المتصفح تقرآن النطاق نفسه");
  check(/قسمٌ آخر/.test(fs.readFileSync("src/utils/coreqSections.ts", "utf8")), "حدُّ القسم الآخر موثّق");
}

const pairsSrc = fs.readFileSync("src/server/core/coreqPairs.ts", "utf8");
check(/status !== "archived"/.test(pairsSrc) && /getRuleSet/.test(pairsSrc) && !/getRuleDraft/.test(pairsSrc), "من الصحيفة المعتمدة لا المسوّدات");

/* ── أين يخلو الموعد؟ مثال المالك والحالات الحدّية ── */
const DAY = { start: 8 * 60, end: 20 * 60 };
const hm = (t?: number) => (t === undefined ? "" : `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
const owner = [row(10, B, "1", "h", "11:00", "15:00"), row(11, B, "2", "h", "12:00", "16:00")];
let w = coreqFreeTime(mine("1", "h", "12:00", "14:00"), owner, B, DAY);
check(w.placement?.side === "after" && hm(w.placement.start) === "15:00" && hm(w.placement.end) === "17:00", "مثال المالك: التعادل (09:00 و15:00) يقدّم الأحدث", w);
check(w.sectionSpans.length === 1 && hm(w.sectionSpans[0][1]) === "15:00", "ويرسم الشعبة التي يخلو منها (11–15)", w);
w = coreqFreeTime(mine("1", "h", "12:00", "14:00"), owner, B, { start: 8 * 60, end: 16 * 60 });
check(w.placement?.side === "before" && hm(w.placement.start) === "09:00" && hm(w.placement.end) === "11:00", "مثال المالك بيومٍ ينتهي 16:00: قبل 11:00", w);
w = coreqFreeTime(mine("1", "h", "12:00", "14:00"), owner, B, { start: 10 * 60, end: 16 * 60 });
check(w.placement?.side === "before" && hm(w.placement.start) === "10:00" && hm(w.placement.end) === "12:00", "لا وقتَ يسبق الشعبتين: يكفي الخلوّ من شعبةٍ واحدة", w);
w = coreqFreeTime(mine("1", "h", "12:00", "14:00"), [row(10, B, "1", "h", "08:00", "20:00")], B, DAY);
check(!w.placement && !w.partnerSection && !w.ownSection, "يومٌ بلا نافذة: لا يُقال وقت", w);
w = coreqFreeTime(mine("1", "h", "12:00", "14:00"), [row(10, B, "1", "h", "12:30", "13:00")], B, DAY);
check(hm(w.placement?.start) === "13:00" && w.placement?.side === "after", "أقرب وقت: البعدُ أقرب من القبل", w);
w = coreqFreeTime(mine("1", "h", "12:00", "14:00"), [row(10, B, "1", "h", "13:00", "16:00")], B, DAY);
check(w.placement?.side === "before" && hm(w.placement.end) === "13:00", "القبلُ أقرب فيُختار ونهايته بداية الشعبة", w);
w = coreqFreeTime(mine("1", "mw", "10:00", "11:15"), [row(10, B, "1", "m", "09:00", "11:00"), row(12, B, "1", "w", "11:00", "13:00"), row(11, B, "2", "s", "10:00", "11:00")], B, DAY);
check(w.partnerSection === "2" && !w.placement, "شعبةٌ للمقرن خالية الآن تُسمّى ولا يُنقل الموعد", w);
w = coreqFreeTime(mine("1", "mw", "10:30", "11:30"), [row(10, B, "1", "m", "09:00", "11:00"), row(12, B, "1", "w", "11:00", "13:00")], B, DAY);
check(hm(w.placement?.start) === "13:00" && w.placement?.side === "after", "شعبةٌ ذات صفّين: الوقت يخلو من صفّيها معاً في يوميه", w);
w = coreqFreeTime(mine("1", "s", "10:00", "11:00"), [row(10, B, "1", "s", "10:00", "11:00"), row(21, A, "1", "s", "11:00", "12:00")], B, DAY);
check(hm(w.placement?.start) === "09:00", "لا يقع الوقت على إخوة الشعبة نفسها", w);
w = coreqFreeTime(mine("1", "t", "10:00", "11:00"), [row(10, B, "1", "t", "08:00", "20:00"), row(20, A, "2", "s", "10:00", "11:00")], B, DAY);
check(w.ownSection === "2" && !w.placement, "لا وقتَ ولا شعبةَ للمقرن: تُسمّى الشعبة الأخرى من المقرر نفسه", w);
/* كل شعب المقرن يصدمها إخوة الموعد: لا وقتَ يفيد، لا «قبل» ولا «بعد» (النافذة الفارغة ليست خبراً). */
w = coreqFreeTime(mine("1", "s", "10:00", "11:00"), [row(10, B, "1", "s", "10:00", "11:00"), row(11, B, "1", "s", "09:30", "10:00"), row(21, A, "1", "s", "09:30", "10:00")], B, DAY);
check(!w.placement && !w.partnerSection, "لا شعبةَ مفتوحة للمقرن: لا يُقترح وقتٌ قبلها", w);
w = coreqFreeTime(mine("1", "s", "10:00", "11:00"), [row(10, B, "1", "s", "10:00", "11:00"), row(11, B, "1", "s", "09:30", "10:00"), row(21, A, "1", "s", "09:30", "10:00"), row(22, A, "2", "t", "10:00", "11:00")], B, DAY);
check(!w.placement && w.ownSection === "2", "وتبقى الشعبةُ الأخرى من المقرر نفسه آخرَ ما يُقال", w);
w = coreqFreeTime(mine("1", "h", "12:00", "14:00"), owner, B, DAY, 10);
check(w.placement?.side === "before" && hm(w.placement.end) === "12:00", "المعدَّل يُستثنى من الحساب", w);

/* ── الاقتراح يحترم المقرن ── */
const clashAt = (start: string, end: string) => coreqForcedClash(mine("1", "h", start, end), owner, [B]);
check(clashAt("12:00", "14:00") && !clashAt("15:00", "17:00") && !clashAt("09:00", "11:00"), "حُكم الاقتراح هو حُكم التنبيه");
check(!coreqForcedClash(mine("1", "h", "12:00", "14:00"), owner, []), "بلا مقرن: لا تأخير");
const slot = (start: string, score: number) => ({ start, end: start, room: "1", hall: "1", buildingId: "", roomId: "", days: ["fthursday"], score, idleMinutes: 0, walkMinutes: 0, reasons: [] }) as SuggestionCandidate;
const all = [slot("12:00", 90), slot("09:00", 70), slot("15:00", 60), slot("13:00", 80)];
const plain = orderSuggestionCandidates(all, false);
const none2 = deferCoreqClashes(plain, () => false);
check(none2.ranked.map(s => s.start).join() === plain.map(s => s.start).join() && none2.deferred.size === 0, "مقررٌ بلا مقرن: الترتيب نفسه تماماً");
const some = deferCoreqClashes(plain, s => s.start === "12:00" || s.start === "13:00");
check(some.ranked.map(s => s.start).join() === "09:00,15:00,12:00,13:00", "أوقات التداخل الإجباري في الآخر بترتيبها", some.ranked.map(s => s.start));
const only = deferCoreqClashes(plain, () => true);
check(only.ranked.length === 4 && only.ranked[0].start === "12:00", "لا أوقات غيرها: تبقى مقترحة", only.ranked.map(s => s.start));
const tools = fs.readFileSync("src/server/routes/scheduleToolsRoutes.ts", "utf8");
check(/roomOnly \? \[\] : partnersOfCourse\(await coreqPairsOfSection\(sectionId\)/.test(tools) && tools.includes("orderSuggestionCandidates(candidates, roomOnly)") && tools.includes("deferCoreqClashes(ordered0"), "الاقتراح يقرأ الحُكم نفسه، و«اقترح قاعة» بوقتها الثابت لا يتأثر");
check(/deferred\.has\(slot\) && slots\.some\(chosen => deferred\.has\(chosen\)\)\) break;/.test(tools), "واحدٌ منها على الأكثر");
const hint = fs.readFileSync("src/components/SameSlotHint.tsx", "utf8");
check(!/AdRoom|roomId|RoomCode/.test(hint), "ورقة المقرن لا تعرض قاعة");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
