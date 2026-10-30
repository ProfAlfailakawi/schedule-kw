/**
 * «لم نصل بعد إلى هذا المستوى» (ملاحظة المالك 1، 2026-10-30) وتبويبا الصحيفة في النشر (الملاحظة 2).
 * القاعدةُ الصرفة تُختبر بالقيم؛ وسياجٌ على المصدر الواحد في الكرت والنموذج والاعتماد والنشر.
 */
import fs from "node:fs";
import {
  classifySheets, combineReach, isReachNote, latestScopeGuard, reachChip, reachLocked, reachNote, sheetReach, sheetYearOf, shortCourseCode, splitBySheet, withReach,
  type ReachInput,
} from "../src/utils/courseReach";
import { normalizeOfferingEntry, offeringEntryIsDefault, offeringView, reachOverrides, emptyOfferingDoc } from "../src/utils/courseOffering";
import { appointmentVerdict } from "../src/utils/appointmentVerdict";
import { termChronology } from "../src/utils/termSequence";
import type { CurriculumCourseRule } from "../src/types";
import { readServerSource } from "./helpers/serverSource.mjs";

let checks = 0;
function ok(condition: unknown, label: string) { if (!condition) throw new Error(`✗ ${label}`); checks++; }

/* ── صحيفةٌ صغيرة: 101،102 (100) · 210 ← 101 · 211 توأم 210 · 220 (بلا مسبق) · 310 ← 210 · 410 ← 310 ── */
const CODES: Record<number, string> = { 1: "0109101", 2: "0109102", 3: "0109210", 4: "0109211", 5: "0109220", 6: "0109310", 7: "0109410", 8: "0109230" };
const level = (id: number) => Math.floor(Number(CODES[id].slice(-3)) / 100) * 100;
const rule = (courseId: number, all: number[] = [], extra: Partial<CurriculumCourseRule> = {}): CurriculumCourseRule => ({ courseId, ...(all.length ? { prereq: { all, anyOf: [] } } : {}), ...extra });
const RULES: CurriculumCourseRule[] = [
  rule(1), rule(2), rule(3, [1], { coreq: [4] }), rule(4, [], { coreq: [3] }), rule(5), rule(6, [3]), rule(7, [6]),
  rule(8, [], { prereq: { all: [], anyOf: [[1, 2]] } }),
];
const term = (name: string) => termChronology({ AdTermName: name });
const T2025_1 = term("2025/2026 الأول"), T2025_2 = term("2025/2026 الثاني"), T2025_S = term("2025/2026 الصيفي"), T2026_1 = term("2026/2027 الأول");
const base = (history: ReachInput["history"], extra: Partial<ReachInput> = {}, sheet: Partial<ReachInput["sheet"]> = {}): ReachInput => ({
  sheet: { courseIds: [1, 2, 3, 4, 5, 6, 7, 8], rules: RULES, ...sheet },
  history, currentChronology: T2026_1,
  levelOf: level, codeOf: id => shortCourseCode(CODES[id]),
  ...extra,
});
const reachOf = (input: ReachInput, id: number) => sheetReach(input).get(id)!;

ok(T2025_1 < T2025_2 && T2025_2 < T2025_S && T2025_S < T2026_1, "الترتيب: الأول < الثاني < الصيفي < الأول التالي");
ok(shortCourseCode("0109210") === "210" && shortCourseCode("ART 5") === "ART 5", "الرمز القصير: آخر ثلاثة أرقام");

/* ── المسبقات ── */
{
  const input = base([{ chronology: T2025_1, courseIds: [1, 2] }]);
  const r = sheetReach(input);
  ok(r.get(1)!.state === "reached" && r.get(1)!.why === "offered-before", "طُرح قبلُ = وصلنا");
  ok(r.get(3)!.state === "reached" && r.get(3)!.why === "prereqs-met", "210 ← 101 طُرح: وصلنا");
  ok(r.get(6)!.state === "locked" && r.get(6)!.why === "prereq-missing" && r.get(6)!.missing.join() === "3", "310 ← 210 لم يُطرح: مقفل");
  ok(r.get(6)!.reason === "لم نصل بعد إلى هذا المستوى — المتطلب 210 لم يُطرح", "السبب بنص المالك: «المتطلب 210 لم يُطرح»");
  ok(r.get(7)!.chain.map(n => `${n.code}:${n.state}`).join(" ") === "101:ok 210:missing 310:missing 410:target", "السلسلة: 101 ✓ ← 210 ✗ ← 310 ✗ ← 410 🔒");
  ok(r.get(6)!.chain.map(n => `${n.code}:${n.state}`).join(" ") === "101:ok 210:missing 310:target", "السلسلة تبدأ بآخر ما طُرح ✓");
  ok(r.get(8)!.state === "reached", "«أحدها يكفي»: 101 أو 102");
}
/* ── التوأم يُفتحان معاً ── */
{
  const r = sheetReach(base([{ chronology: T2025_1, courseIds: [1] }]));
  ok(r.get(3)!.state === "reached" && r.get(4)!.state === "reached", "التوأم: 210 و211 يُفتحان معاً في الفصل نفسه");
  const none = sheetReach(base([{ chronology: T2025_1, courseIds: [2] }]));
  ok(none.get(3)!.state === "locked" && none.get(4)!.state === "locked" && none.get(4)!.why === "coreq-locked", "التوأم: 210 مقفل ⇒ 211 مقفل معه");
  ok(none.get(4)!.reason === "لم نصل بعد — توأمه 210 لم يُفتح" && none.get(4)!.chain[0].link === "coreq", "سبب التوأم وسلسلته ⇄");
}
/* ── التوأم في سلسلة: أ⇄ب، ب⇄ج، ج مقفل ⇒ ب وأ مقفلان (انتشارٌ حتى الثبات)، والتوأمةُ متبادلة ── */
{
  const CODES2: Record<number, string> = { 1: "0109101", 21: "0109201", 22: "0109202", 23: "0109203", 31: "0109301" };
  const rules: CurriculumCourseRule[] = [rule(1), rule(21, [], { coreq: [22] }), rule(22, [], { coreq: [23] }), rule(23, [31]), rule(31)];
  const input = (overrides: number[] = []): ReachInput => ({
    sheet: { courseIds: [1, 21, 22, 23, 31], rules }, history: [{ chronology: T2025_1, courseIds: [1] }], currentChronology: T2026_1,
    levelOf: id => Math.floor(Number(CODES2[id].slice(-3)) / 100) * 100, codeOf: id => shortCourseCode(CODES2[id]), overrides,
  });
  const r = sheetReach(input());
  ok(r.get(23)!.why === "prereq-missing" && r.get(22)!.why === "coreq-locked" && r.get(21)!.state === "locked" && r.get(21)!.why === "coreq-locked", "سلسلة التوأم: ج مقفل ⇒ ب ⇒ أ");
  ok(r.get(21)!.missing.join() === "22" && r.get(21)!.reason === "لم نصل بعد — توأمه 202 لم يُفتح", "أ يُقال له توأمُه المباشر");
  ok(!withReach(offeringView(null, 21), r.get(21)).selectable, "الكرت: أ في السلسلة لا يُختار");
  const opened = sheetReach(input([23]));
  ok([21, 22, 23].every(id => opened.get(id)!.state === "reached"), "فتحُ ج للطرح يفتح السلسلة كلّها");
  const oneWay = sheetReach({ ...input(), sheet: { courseIds: [1, 21, 22, 31], rules: [rule(1), rule(21, [31], { coreq: [22] }), rule(22), rule(31)] } });
  ok(oneWay.get(22)!.why === "coreq-locked", "التوأمةُ متبادلة ولو كُتبت في جهةٍ واحدة");
}

/* ── آخرُ طلبٍ يحكم (useCourseReach): قراءةُ نطاقٍ سابق لا تكتب فوق الجديد ── */
{
  const guard = latestScopeGuard();
  const old = guard.begin("1:1:1");
  const fresh = guard.begin("1:1:2");
  ok(!guard.isCurrent(old) && guard.isCurrent(fresh), "قراءة الفصل السابق المتأخرة تُهمل");
  const again = guard.begin("1:1:2");
  ok(guard.isCurrent(again) && !guard.isCurrent(fresh), "إعادةُ قراءة النطاق نفسه: الأحدثُ وحده");
  ok(guard.sameScope("1:1:2") && !guard.sameScope("1:1:1"), "«افتحه للطرح» لا يُعرض على نطاقٍ غير نطاقه");
  const hook = fs.readFileSync("src/components/CourseReach.tsx", "utf8");
  ok(hook.includes("inflight.current?.abort()") && hook.includes("signal: controller.signal") && hook.includes("if (guard.isCurrent(stamp) && !controller.signal.aborted) setData(payload);") && hook.includes("if (guard.sameScope(scope)) setData(payload);"), "الخطّاف: يلغي السابق ويتحقق من النطاق قبل الكتابة");
}

/* ── الصيفي فصل ── */
{
  const r = sheetReach(base([{ chronology: T2025_1, courseIds: [1] }, { chronology: T2025_S, courseIds: [3] }]));
  ok(r.get(6)!.state === "reached", "210 طُرح في الصيفي ⇒ 310 مفتوح");
  const same = sheetReach(base([{ chronology: T2025_1, courseIds: [1] }, { chronology: T2026_1, courseIds: [3] }]));
  ok(same.get(6)!.state === "locked", "شعبُ الفصل نفسه لا تُعدّ «فصلاً سابقاً»");
}
/* ── بلا مسبقات: المستوى المطروح + مستوى واحد ── */
{
  const r = sheetReach(base([{ chronology: T2025_1, courseIds: [1] }]));
  ok(r.get(5)!.state === "reached" && r.get(5)!.why === "level-ok", "220 بلا مسبق: أعلى مطروح 100 ⇒ 200 مسموح");
  const only100 = sheetReach(base([{ chronology: T2025_1, courseIds: [1] }], {}, { rules: RULES.filter(r => r.courseId !== 6), courseIds: [1, 2, 3, 4, 5, 6] }));
  ok(only100.get(6)!.state === "locked" && only100.get(6)!.why === "level-ahead" && only100.get(6)!.reason.endsWith("أعلى مستوى طُرح 100"), "310 بلا مسبق وأعلى مطروح 100: مقفل");
}
/* ── أول فصلٍ للصحيفة الجديدة: مقررات 100 بلا متطلبات فقط ── */
{
  const input = base([{ chronology: T2025_1, courseIds: [1, 3, 5] }], {}, { isNew: true, startChronology: T2026_1 });
  const r = sheetReach(input);
  ok(r.get(1)!.state === "reached" && r.get(2)!.state === "reached", "أول فصل: 101 و102 (100 بلا متطلب) متاحان");
  ok(r.get(5)!.state === "locked" && r.get(5)!.why === "first-term" && r.get(5)!.reason.includes("مقررات 100"), "أول فصل: 220 مقفل ولو طُرح في الصحيفة القديمة");
  ok(r.get(3)!.state === "locked" && r.get(8)!.state === "locked", "أول فصل: ما له متطلبٌ مقفل (210، و230 «101 أو 102»)");
}
/* ── استقلال الصحيفة: الجديدة لا تُحسب من فصول القديمة ── */
{
  const history = [{ chronology: T2025_1, courseIds: [1, 3] }, { chronology: T2025_2, courseIds: [6] }];
  const old = sheetReach(base(history, { currentChronology: T2026_1 }));
  const fresh = sheetReach(base(history, { currentChronology: term("2026/2027 الثاني") }, { isNew: true, startChronology: T2026_1 }));
  ok(old.get(7)!.state === "reached" && fresh.get(7)!.state === "locked", "410: وصلته القديمة (310 طُرح) ولم تصله الجديدة");
  ok(sheetYearOf({ name: "الصحيفة الجديدة 2026/2027" }) === 2026 && sheetYearOf({ sheetYear: 2024, name: "x 2026" }) === 2024, "سنة الصحيفة: المرفوعة ثم الاسم");
  const sheets = classifySheets([{ status: "active", track: "" }, { status: "transition", track: "" }, { status: "active", track: "BA-1" }, { status: "archived", track: "" }] as any[]);
  ok(sheets.map(s => s.kind).join() === "new,old,only", "تصنيف الصحائف: جديدة/قديمة لكل مسار، والوحيدة «only»، والمؤرشفة خارجاً");
}
/* ── استقلال الفرع: تاريخُ البنين لا يفتح للبنات ── */
{
  const boys = [{ chronology: T2025_1, courseIds: [1, 3] }];
  const girls = [{ chronology: T2025_1, courseIds: [1] }];
  ok(reachOf(base(boys), 6).state === "reached" && reachOf(base(girls), 6).state === "locked", "310: البنين وصلوه، والبنات لا (كلُّ فرعٍ بتاريخه)");
}
/* ── «افتحه للطرح» ── */
{
  const r = sheetReach(base([{ chronology: T2025_1, courseIds: [1] }], { overrides: [7] }));
  ok(r.get(7)!.state === "reached" && r.get(7)!.overridden && r.get(7)!.why === "override", "افتحه للطرح: 410 مفتوح رغم القاعدة");
  ok(reachChip(r.get(7))!.icon === "🔓" && reachChip(r.get(1))!.label === "وصلنا" && reachChip(r.get(6))!.label === "لم نصل بعد", "الوسم: ✓ وصلنا · 🔒 لم نصل بعد · 🔓 فُتح");
}
/* ── لا قفل بلا دليل ── */
{
  const r = sheetReach(base([]));
  ok([...r.values()].every(v => v.state === "unknown") && !reachChip(r.get(7)), "فرعٌ بلا تاريخ: لا يُقفل شيء ولا وسم");
  const noLevel = sheetReach({ ...base([{ chronology: T2025_1, courseIds: [1] }]), levelOf: id => (id === 1 ? 100 : 0) });
  ok(noLevel.get(5)!.state === "unknown", "مقررٌ بلا مستوى ولا مسبق: غير معروف (لا قفل)");
  ok(combineReach([reachOf(base([{ chronology: T2025_1, courseIds: [1] }]), 6), reachOf(base([{ chronology: T2025_1, courseIds: [1, 3] }]), 6)])!.state === "reached", "مقررٌ في صحيفتين: تكفي إحداهما");
}

/* ── كرت الأستاذ: المقفل رمادي 🔒 بسببه، لا يُختار ── */
{
  const locked = reachOf(base([{ chronology: T2025_1, courseIds: [1] }]), 6);
  const view = withReach(offeringView(null, 6), locked);
  ok(!view.selectable && !view.hidden && view.icon === "🔒" && view.line === locked.reason && view.reach === "locked", "الكرت: مقفل رمادي بسببه");
  ok(withReach(offeringView({ ...emptyOfferingDoc(1, 2, 3), display: "hide" }, 6), locked).hidden === false, "الكرت: «لم نصل بعد» لا يُخفى (يُرى رمادياً)");
  const open = reachOf(base([{ chronology: T2025_1, courseIds: [1] }], { overrides: [6] }), 6);
  ok(withReach(offeringView(null, 6), open).selectable, "الكرت: المفتوح للطرح عادي");
  const server = readServerSource();
  ok(server.includes("withReach(offeringView(doc, option.id,") && server.includes("view.state === \"offered\" && view.selectable"), "الكرت: حالة الطرح ثم «لم نصل بعد» من المصدر الواحد");
  ok(server.includes("await lockUnreached((await availableInstructorOfferings(request)).filter(option => (!taAllowed || taAllowed.has(Number(option.courseId))) && !offeringBlocked(termStates"), "كرت المدرّب والشعب الشاغرة: الشعبة المقفلة رمادية");
  ok(server.includes("if (!prior && reachLocked(await reachOf(") && server.includes("if ([...views.values()].some(view => !view.selectable))"), "الخادم يرفض اختيار المقفل ولو أُرسل من خارج الواجهة");
  const page = fs.readFileSync("src/server/pages/instructorRequestPage.ts", "utf8");
  ok(page.includes("(o.locked?' data-locked=\"1\" aria-disabled=\"true\"':'')") && page.includes("if(!o||o.locked||"), "صفحة الكرت: الشعبة المقفلة لا تُختار");
}

/* ── نموذج الموعد: تنبيهٌ أصفر لا يمنع أبداً ── */
{
  const locked = reachOf(base([{ chronology: T2025_1, courseIds: [1] }]), 6);
  const note = reachNote(locked);
  ok(note === "لم نصل بعد — المتطلب 210 لم يُطرح في هذا الفرع" && isReachNote(note), "النموذج: «لم نصل بعد — المتطلب 210 لم يُطرح في هذا الفرع»");
  ok(reachNote(reachOf(base([{ chronology: T2025_1, courseIds: [1] }], { overrides: [6] }), 6)) === "", "النموذج: المفتوح للطرح بلا تنبيه");
  const verdict = appointmentVerdict({ form: { AdCourseId: 6 }, validationIssues: [], conflicts: [], notes: [{ kind: "section", text: note }] });
  ok(verdict.canSave && verdict.blockers.length === 0 && verdict.notes.length === 1 && verdict.checks.find(c => c.kind === "section")!.state === "warn", "النموذج: التنبيه لا يمنع الحفظ (قرار المالك)");
  const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
  ok(schedules.includes("...(formReachNote ? [{ kind: \"section\" as const, text: formReachNote") && schedules.includes("onOpenReach={formReachNote ?"), "النموذج: التنبيه وزرّ «افتحه للطرح» من الحكم الواحد");
  ok(fs.readFileSync("src/components/AppointmentChecksPanel.tsx", "utf8").includes("onOpenReach && isReachNote(detail.text)"), "لوحة الفحص: «افتحه للطرح» بجانب البند");
}

/* ── «افتحه للطرح» يُحفظ في حالة الطرح نفسها، ولا يمحوه حفظُ الحالة ── */
{
  const entry = normalizeOfferingEntry({ courseId: 6, state: "offered", reachOpen: true })!;
  ok(entry.reachOpen === true && !offeringEntryIsDefault(entry), "القيد «مطروح + افتحه للطرح» يُحفظ");
  ok(offeringEntryIsDefault(normalizeOfferingEntry({ courseId: 6, state: "offered" })!), "«مطروح» وحده لا يُحفظ");
  const doc = { ...emptyOfferingDoc(1, 2, 3), courses: { "6": entry, "7": { courseId: 7, state: "closed" as const, reachOpen: true, suggested: true } } };
  ok([...reachOverrides(doc)].join() === "6", "المفتوحات: المؤكَّد وحده");
  const routes = fs.readFileSync("src/server/routes/offeringRoutes.ts", "utf8");
  ok(routes.includes('app.post("/api/course-reach/open", requirePermission(7)') && routes.includes("prior?.reachOpen) entry.reachOpen = true") && routes.includes("forgetCourseReach();"), "الخادم: فتحٌ بصلاحية الجدول، والحفظُ يُبقيه، والذاكرة تُمسح");
}

/* ── النشر ← كرت الأستاذ: تبويبا الصحيفة بعدّاديهما ── */
{
  const sheets = [{ kind: "new" as const, courseIds: [1, 2, 10] }, { kind: "old" as const, courseIds: [1, 20, 30] }];
  const split = splitBySheet([1, 2, 10, 20, 30, 99], sheets);
  ok(split.tabs && split.new.join() === "1,2,10" && split.old.join() === "1,20,30,99", "التبويبان: المشترك في الاثنين، وما خارج الصحائف في القديمة");
  ok(!splitBySheet([1, 2], [{ kind: "only", courseIds: [1, 2] }]).tabs, "صحيفةٌ واحدة: لا تبويب");
  const panel = fs.readFileSync("src/components/CourseOfferingPanel.tsx", "utf8");
  ok(panel.includes('role="tablist"') && panel.includes("الصحيفة الجديدة") && panel.includes("الصحيفة القديمة") && panel.includes("<b>{list.length}</b>"), "اللوحة: تبويبان بعدّاد");
  ok(panel.includes("<ReachChip reach={reach} />") && panel.includes("<ReachChain reach={reach} />"), "اللوحة: وسم الوصول وسلسلته على كل بطاقة");
}

/* ── مصدرٌ واحد في كل مكان ── */
{
  const all = fs.readFileSync("src/components/AllCourses.tsx", "utf8");
  ok(all.includes("useCourseReach(") && all.includes("<ReachChip reach={reach} />"), "«كل المقررات»: الوسم والسلسلة");
  ok(fs.readFileSync("src/components/proposal/ProposalCoursePicker.tsx", "utf8").includes("<ReachChain reach={chosen.reach} />"), "المقترح الدراسي: الوسم والسلسلة");
  ok(fs.readFileSync("src/server/studyProposalRoutes.ts", "utf8").includes("reach: reach.courses[Number(course.AdCourseId)] || null"), "المقترح الدراسي: الحكم من الخادم");
  ok(fs.readFileSync("src/components/ScheduleReview.tsx", "utf8").includes("<ReachReviewNotes rows={scopeRows}"), "الاعتماد: ملاحظةٌ على الشعب");
  ok(reachLocked({ state: "locked" }) && !reachLocked({ state: "unknown" }), "reachLocked");
}

console.log(`✓ course-reach: ${checks} checks`);
