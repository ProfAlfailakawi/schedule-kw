/**
 * ── «تراجع» عن قرار الوارد (TASK A) وسؤال الوارد بالعربية (IR-REQ-034، TASK B) ──
 *
 *   U1 المهلة: ثابتٌ واحد، تُحسب ما بقي منها، وتنتهي.
 *   U2 من يُقبل: لا قرارٌ ← لا؛ قرارُ الجدول والمقترح ← مساراهما؛ بعد المهلة ← لا؛
 *      ردُّ الأستاذ بعد القرار ← لا؛ تثبيتٌ بلا لقطة ← لا؛ وإلا نعم.
 *   U3 لقطةُ التثبيت: ما كُتب بالضبط (استرداد، إزالة، إعادة) لبندٍ واحد من سلسلة.
 *   U4 مخطّطُ التراجع: يُرفض كلُّه إن تغيّر ختمُ صفّ أو حُذف أو أُعيد رقمُه.
 *   U5 الحجز: تُعاد حجوزُ البنود الأخرى بقاعاتها، وبندُ التراجع بحجزه المحفوظ.
 *   U6 الخادم والشاشة: النقطةُ والحرّاس والمعاملةُ الواحدة والحدثُ والتدقيقُ، ولا لقطة تصل الأستاذ.
 *   A1..A4 سؤال الوارد: اليومُ والفترةُ والنوعُ والحالةُ والموقعُ والاسمُ، «فهمتُ»، وعدمُ الفهم بلا مسّ للمرشّحات.
 */
import fs from "fs";
import path from "path";
import {
  INBOX_UNDO_WINDOW_MS, classifyUndo, holdSnapshotOf, planUndoSteps, proposalsAfterUndo, undoStepsOf, undoWindowLeftMs,
} from "../src/utils/inboxUndo";
import { pilotReopen, startPilot, buildPilotQueue, pilotAdvance, pilotOpen } from "../src/utils/inboxPilot";
import {
  itemMatchesRequestsAsk, nameMatchesAsk, parseRequestsAsk, periodOfStart, requestsAskNote,
} from "../src/utils/requestsAsk";
import { decisionDigest, unsentDecisions } from "../src/utils/requestDecisionDigest";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── U1 ── */
const T0 = Date.parse("2026-11-14T08:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
check(INBOX_UNDO_WINDOW_MS === 15 * 60_000, "U1 المهلةُ خمس عشرة دقيقة");
check(undoWindowLeftMs(at(0), T0 + 60_000) === INBOX_UNDO_WINDOW_MS - 60_000, "U1 يبقى منها ما لم يمضِ");
check(undoWindowLeftMs(at(0), T0 + INBOX_UNDO_WINDOW_MS) === 0 && undoWindowLeftMs(at(0), T0 + 99 * 60_000) === 0, "U1 تنتهي عند الحدّ");
check(undoWindowLeftMs(undefined, T0) === 0 && undoWindowLeftMs("غير تاريخ", T0) === 0, "U1 بلا وقتِ قرارٍ لا مهلة");
check(undoWindowLeftMs(at(10 * 60_000), T0) === INBOX_UNDO_WINDOW_MS, "U1 لا تتجاوز المهلةَ الكاملة (ساعةٌ منحرفة)");

/* ── U2 ── */
const fixedItem = (extra: any = {}, decision: any = {}) => ({ action: "change", rowId: 5, itemId: "i1",
  decision: { state: "fixed", decidedAt: at(0), undo: { steps: [{ kind: "restore", rowId: 5, rev: 2, before: { id: 5, rev: 1 } }] }, ...decision }, ...extra }) as any;
check(classifyUndo(undefined, T0).ok === false, "U2 بلا بندٍ لا تراجع");
check(classifyUndo({ action: "change", rowId: 1 } as any, T0).ok === false, "U2 بلا قرارٍ لا تراجع");
check(classifyUndo(fixedItem(), T0 + 60_000).ok === true, "U2 تثبيتٌ بلقطةٍ داخل المهلة يُقبل");
const stale = classifyUndo(fixedItem(), T0 + INBOX_UNDO_WINDOW_MS + 1);
check(stale.ok === false && (stale as any).code === "window-closed", "U2 بعد المهلة يُرفض بسببها");
const fromSchedule = classifyUndo(fixedItem({}, { fromSchedule: true }), T0 + 1000);
check(fromSchedule.ok === false && (fromSchedule as any).code === "other-path", "U2 قرارُ «الجدول» له مسارُه");
check((classifyUndo(fixedItem({}, { viaProposal: "p1" }), T0 + 1000) as any).code === "other-path", "U2 تثبيتُ المقترح له مسارُه");
check((classifyUndo(fixedItem({}, { undo: undefined }), T0 + 1000) as any).code === "not-recorded", "U2 تثبيتٌ بلا لقطة يُرفض بوضوح");
check((classifyUndo(fixedItem({ thread: [{ from: "instructor", at: at(5000), text: "شكراً" }] }), T0 + 9000) as any).code === "instructor-acted", "U2 ردُّ الأستاذ بعد القرار يمنع");
check(classifyUndo(fixedItem({ thread: [{ from: "instructor", at: at(-5000), text: "طلبي" }] }), T0 + 9000).ok === true, "U2 ردٌّ سابقٌ للقرار لا يمنع");
const rejected = (extra: any = {}, decision: any = {}) => ({ action: "add", rowId: null, itemId: "i2", decision: { state: "rejected", reasonCode: "room", decidedAt: at(0), undo: { steps: [] }, ...decision }, ...extra }) as any;
check((classifyUndo(rejected(), T0 + 1000) as any).kind === "rejected", "U2 الرفضُ بلقطة الحجز يُقبل");
check((classifyUndo(rejected({ chosenAlternative: { day: "fsunday", start: "08:00", end: "08:50" } }), T0 + 1000) as any).code === "instructor-acted", "U2 اختارَ الأستاذُ بديلاً ← يُرفض");
check((classifyUndo(rejected({}, { cancelled: true }), T0 + 1000) as any).code === "other-path", "U2 «إلغاء الموعد» ليس رفضاً يُتراجع عنه");
check((classifyUndo(rejected({}, { undo: undefined }), T0 + 1000) as any).code === "not-recorded", "U2 رفضٌ بلا لقطة يُرفض بوضوح");

/* ── U3 ── */
const row = (id: number, rev: number, extra: any = {}) => ({ id, rev, AdInstructorId: 9, AdTermId: 1, fstarttime: "08:00", fendtime: "08:50", fsunday: true, ...extra }) as any;
const ops = [
  { kind: "update", itemIndex: 0, original: row(5, 3, { fmonday: true }) },
  { kind: "create", itemIndex: 0 },
  { kind: "delete", itemIndex: 1, original: row(7, 2) },
  { kind: "create", itemIndex: 2 },
] as any;
const written = [row(5, 4), row(40, 1), row(41, 1)];
const stepsOne = undoStepsOf(ops, written, 0);
check(stepsOne.length === 2 && stepsOne[0].kind === "restore" && stepsOne[0].rowId === 5 && stepsOne[0].rev === 4 && stepsOne[0].before?.fmonday === true, "U3 التعديلُ يُسجَّل بختمه بعد الكتابة وبالصفّ السابق");
check(stepsOne[1].kind === "remove" && stepsOne[1].rowId === 40 && stepsOne[1].rev === 1, "U3 ما أُضيف يُسجَّل لإزالته");
const stepsTwo = undoStepsOf(ops, written, 1);
check(stepsTwo.length === 1 && stepsTwo[0].kind === "readd" && stepsTwo[0].rowId === 7 && stepsTwo[0].before?.rev === 2, "U3 المحذوفُ يُسجَّل بصفّه كاملاً (والحذفُ لا يستهلك صفاً كُتب)");
const stepsThree = undoStepsOf(ops, written, 2);
check(stepsThree.length === 1 && stepsThree[0].rowId === 41, "U3 كلُّ بندٍ يأخذ صفَّه هو لا صفَّ جاره (ترتيبُ المكتوب يتجاوز المحذوف)");
check(undoStepsOf([], [], 0).length === 0, "U3 بندٌ لم يكتب شيئاً ← لقطةٌ فارغة");

/* ── U4 ── */
const plan = planUndoSteps(stepsOne, [row(5, 4), row(40, 1), row(99, 1)]);
check(plan.ok === true && (plan as any).restore.length === 1 && (plan as any).remove.length === 1, "U4 الصفوفُ كما تركها التثبيتُ ← خطّةٌ سليمة");
const changedRev = planUndoSteps(stepsOne, [row(5, 5), row(40, 1)]);
check(changedRev.ok === false && (changedRev as any).rowId === 5, "U4 صفٌّ عدّله زميلٌ بعد التثبيت ← يُرفض كلُّه");
const removedRow = planUndoSteps(stepsOne, [row(5, 4)]);
check(removedRow.ok === false && (removedRow as any).rowId === 40, "U4 صفٌّ أُضيف ثم حُذف ← يُرفض");
check(planUndoSteps(stepsTwo, [row(7, 1)]).ok === false, "U4 صفٌّ محذوفٌ أُعيد رقمُه ← يُرفض");
check(planUndoSteps(stepsTwo, []).ok === true && (planUndoSteps(stepsTwo, []) as any).readd.length === 1, "U4 المحذوفُ ما زال غائباً ← يُعاد");
check(planUndoSteps([], []).ok === true, "U4 لقطةٌ فارغة تمرّ (رفضٌ أو حذفٌ سبق)");

/* ── U5 ── */
const entry = (itemId: string, extra: any = {}) => ({ requestId: "r1", itemId, instructorId: 9, collegeId: 1, sectionId: 2, courseId: 3,
  slots: [{ day: "fsunday", start: "08:00", end: "08:50" }], room: { roomId: "R1", room: "7", hall: "31" }, offeringRowIds: [], ...extra }) as any;
const snapshot = holdSnapshotOf(entry("i1"));
check(snapshot?.room?.roomId === "R1" && snapshot.slots.length === 1 && holdSnapshotOf(undefined) === undefined, "U5 لقطةُ الحجز تحمل القاعةَ نفسها");
const proposals = proposalsAfterUndo({ id: "r1", items: [{ itemId: "i1" } as any, { itemId: "i2" } as any] },
  [entry("i2", { room: { roomId: "R2", room: "8", hall: "1" } }), entry("i3", { requestId: "other" }), entry("i4", { heldUntil: "2099-01-01T00:00:00Z" })], "i1", snapshot);
check(proposals.length === 2 && proposals.find(p => p.itemId === "i2")?.rooms[0].roomId === "R2", "U5 حجزُ البند الآخر يبقى بقاعته (لا يُعاد ترشيحُها)");
check(proposals.find(p => p.itemId === "i1")?.rooms[0].roomId === "R1", "U5 بندُ التراجع بحجزه المحفوظ");
check(!proposals.some(p => p.itemId === "i3" || p.itemId === "i4"), "U5 لا حجزَ طلبٍ آخر ولا حجزَ تحريرٍ مؤقّت");
check(proposalsAfterUndo({ id: "r1", items: [] }, [], "i1", undefined).length === 0, "U5 بلا حجزٍ سابقٍ لا يُنشأ حجز");

/* الوضع: التراجعُ يعيد البند هو المعروض */
const rows = [{ id: "r1", submittedAt: "2026-11-01T00:00:00Z", status: "in-review", instructorName: "أ", items: [{ action: "change", rowId: 1, itemId: "a" }, { action: "change", rowId: 2, itemId: "b" }] }] as any;
let state = startPilot(buildPilotQueue(rows), entryKey => pilotOpen(rows, entryKey));
const firstKey = state.order[0].key;
state = pilotAdvance(state, "fixed", () => true);
const reopened = pilotReopen(state, firstKey, () => true);
check(reopened.at === 0 && !(firstKey in reopened.outcomes) && reopened.lastSkip === null, "U5 «رجوع» عن القرار يعيد البندَ ويمحو أثره");
check(pilotReopen(state, firstKey, () => false) === state && pilotReopen(state, "غير موجود", () => true) === state, "U5 لا يمسّ شيئاً إن لم يعد ينتظر");

/* لا إعلانَ لقرارٍ مُتراجَع عنه: الخلاصةُ تقرأ القرار الحيّ */
const decided = { items: [{ action: "change", rowId: 1, itemId: "a", slots: [{ day: "fsunday", start: "08:00", end: "08:50" }], after: { courseName: "م" }, decision: { state: "fixed", decidedAt: at(0) } }], decisionNotifiedAt: undefined } as any;
check(decisionDigest(decided).length === 1 && unsentDecisions(decided).length === 1, "U5 القرارُ القائم يظهر في الخلاصة");
const undone = { ...decided, items: [{ ...decided.items[0], decision: undefined }] };
check(decisionDigest(undone).length === 0 && unsentDecisions(undone).length === 0, "U5 بعد التراجع لا يُعلن ولا يُعدّ «لم يُبلَّغ»");

/* ── U6: الخادم ── */
const routes = read("src/server/routes/instructorRequestsRoutes.ts");
const code = routes.replace(/\/\*[\s\S]*?\*\//g, "");
const undoRoute = code.slice(code.indexOf('"/api/instructor-requests/:id/undo-decision"'), code.indexOf('"/api/instructor-requests/:id/reply"'));
check(/requirePermission\(7\)/.test(undoRoute.slice(0, 120)), "U6 لمن يملك صلاحية القرار وحدها");
for (const [re, label] of [
  [/requireCurrentInstructorRequestGeneration/, "الجولةُ الحالية"], [/requireInstructorRequestRevision/, "ختمُ الطلب"],
  [/refuseIfTermFrozen/, "الفصلُ المجمَّد"], [/isScopeAllowed/, "نطاقُ البند"], [/instructorRequestItemIdentity/, "هويّةُ البند"],
  [/scheduleLockRefusal/, "قفلُ الجدول"], [/classifyUndo/, "مهلةٌ وأسبابُ الرفض"], [/planUndoSteps/, "مخطّطُ الصفوف"],
  [/regulationGate/, "بوابةُ اللائحة"], [/updateScheduleHandler/, "مسارُ التعديل الجافّ"], [/createScheduleHandler/, "مسارُ الإضافة الجافّ"],
  [/exactRestore: true/, "عودةٌ حرفية"], [/acquireScheduleApplyLease/, "قفلُ التثبيت"], [/undoInstructorRequestFix/, "معاملةٌ واحدة"],
  [/item-reopened/, "حدثُ الخطّ الزمني"], [/auditChanges/, "التدقيق"], [/captureScopeVersion/, "نسخةٌ قبل الكتابة"],
] as Array<[RegExp, string]>) check(re.test(undoRoute), `U6 النقطة: ${label}`);
check(!/pushHooks/.test(undoRoute), "U6 لا إشعارَ للأستاذ عن التراجع");
check(!/decisionHistory/.test(undoRoute), "U6 القرارُ المُتراجَع عنه لا يدخل سجلَّ قرارات يقرؤه الأستاذ");
check(/undoStepsOf\(/.test(code) && /holdSnapshotOf\(/.test(code), "U6 التثبيتُ والرفضُ يسجّلان اللقطة");
check(/\(scheduleIds, writtenAll\)/.test(code), "U6 التثبيتُ يستلم ما كُتب فعلاً بأرقامه وأختامه");
check(/undo: undefined, undoable/.test(code) && /function withUndoFlag/.test(code), "U6 لقطةُ الصفوف لا تغادر الخادم إلى القسم، ويخرج العلَم وحده");
check(/undo: undefined, undoable: undefined/.test(read("src/server/routes/publicRequestRoutes.ts")), "U6 ولا تصل صفحةَ الأستاذ");
const repo = read("src/db/repository.ts");
const txn = repo.slice(repo.indexOf("undoInstructorRequestFix:"), repo.indexOf("getInstructorRequestReservations: async"));
check(/runTransaction/.test(txn) && /withSerialLock\(`request-reservations:/.test(txn), "U6 المعاملةُ في Firestore وفي الذاكرة معاً");
check(/findConflicts/.test(txn) && /assertRequestReservationWrite/.test(txn) && /allocateRequestReservations/.test(txn), "U6 فحصُ التعارض وحجزُ الغير وإعادةُ الحجز داخل المعاملة");
check(/requestRevision/.test(txn) && /ScheduleRevisionConflict/.test(txn), "U6 ختمُ الطلب وختمُ الصفّ داخل المعاملة");
check(/scheduleViolatesApprovedBarterWindow/.test(txn), "U6 أهليةُ القاعة المستعارة");
check(/"\/instructor-requests\/:id\/undo-decision"/.test(read("src/utils/activityTrail.ts")), "U6 قاعدةُ سجلّ النشاط");
const inbox = read("src/components/InstructorInbox.tsx");
check(/visualConfirm\(\{[\s\S]{0,200}التراجع عن/.test(inbox) && /\/undo-decision`/.test(inbox), "U6 الشاشة: تأكيدٌ بصريّ ثم النقطة");
check(/item\.decision\?\.undoable/.test(inbox) && /UndoDecisionButton/.test(inbox) && /undoWindowLeftMs/.test(inbox), "U6 الشاشة: «تراجع» بالمهلة المتبقية لمن حكم الخادمُ بقبوله");
check(/rowErrors\[key\]|setRowErrors\(prev => \(\{ \.\.\.prev, \[key\]: message/.test(inbox), "U6 الشاشة: الخطأ في مكانه");
check(/onUndoDecision=\{undoDecision\}/.test(inbox) && /onUndoDecision/.test(read("src/components/inbox/InboxPilot.tsx")), "U6 الوضع: «رجوع» عبر الدالّة نفسها");
check(read("src/index.css").includes('@import "./styles/60-inbox-undo.css";'), "U6 ورقةُ الأنماط مسجّلة");

/* ── A: سؤال الوارد ── */
const ask = (q: string) => parseRequestsAsk(q);
check(ask("مين طلب الصباح؟").periods[0] === "morning" && ask("مين طلب الصباح؟").text === "", "A1 «مين طلب الصباح؟» ← صباحٌ بلا اسمٍ متبقٍّ");
const sundayRejected = ask("طلبات الأحد المرفوضة");
check(sundayRejected.days[0] === "fsunday" && sundayRejected.state === "rejected" && sundayRejected.text === "", "A1 «طلبات الأحد المرفوضة» ← الأحد ورُفض");
check(ask("من لم يفتح الرابط").state === "unopened" && ask("من لم يفتح الرابط").text === "", "A1 «من لم يفتح الرابط» ← لم يفتحوا");
check(ask("من لم يشارك").state === "absent" && ask("ما شاركوا").state === "absent", "A1 «لم يشارك» ← لم يشاركوا");
check(ask("بانتظار قرارك").state === "pending" && ask("ما قررت فيها").state === "pending", "A1 بانتظار قرارك");
check(ask("المثبتة").state === "fixed" && ask("ثبّتُّ").state !== "rejected", "A1 المثبتة ← ثُبّت");
check(ask("للاثنين").days[0] === "fmonday" && ask("والثلاثاء والأربعاء").days.length === 2, "A1 أيامٌ بحروف الجرّ والعطف");
check(ask("للظهر").periods[0] === "noon" && ask("المساء").periods[0] === "evening", "A1 الظهر والمساء");
check(ask("إضافات").actions[0] === "add" && ask("حذف").actions[0] === "delete" && ask("تعديلات").actions[0] === "change", "A1 النوع");
check(ask("بنات").campus === "girls" && ask("بنين").campus === "boys", "A1 الموقع");
const combo = ask("إضافات بنات الأحد الصباح");
check(combo.actions[0] === "add" && combo.campus === "girls" && combo.days[0] === "fsunday" && combo.periods[0] === "morning", "A1 جملةٌ مركّبة");
const named = ask("أحمد المرفوضة");
check(named.state === "rejected" && named.text === "أحمد", "A2 الاسمُ يبقى بإملائه الأصلي مع الفهم");
check(ask("ثابت").state === "" && ask("ثابت").text === "ثابت" && ask("الأحمد").days.length === 0, "A2 اسمٌ يشبه كلمةً لا يُلتقط خطأً");
check(ask("").text === "" && !ask("").understood, "A2 الفارغُ بلا فهم");
check(nameMatchesAsk("د. أحمد علي", "احمد") && nameMatchesAsk("فاطمة الزهراء", "فاطمه") && nameMatchesAsk("أحمد علي", "علي احمد") && !nameMatchesAsk("سالم", "احمد"), "A2 الاسمُ بمفتاح المطابقة العربي وبأيّ ترتيب");
check(periodOfStart("08:00") === "morning" && periodOfStart("12:00") === "noon" && periodOfStart("14:50") === "noon" && periodOfStart("15:00") === "evening" && periodOfStart("") === null, "A3 فتراتُ اليوم بساعة البداية");
const slotItem = (day: string, start: string, action = "change") => ({ action, slots: [{ day, start }] });
check(itemMatchesRequestsAsk(slotItem("fsunday", "08:00"), ask("الأحد الصباح")) && !itemMatchesRequestsAsk(slotItem("fsunday", "13:00"), ask("الأحد الصباح")), "A3 اليومُ والفترة معاً");
check(itemMatchesRequestsAsk(slotItem("fmonday", "08:00", "add"), ask("إضافات")) && !itemMatchesRequestsAsk(slotItem("fmonday", "08:00"), ask("إضافات")), "A3 النوع");
check(itemMatchesRequestsAsk(slotItem("fmonday", "08:00"), ask("بنات"), "girls") && !itemMatchesRequestsAsk(slotItem("fmonday", "08:00"), ask("بنات"), "boys"), "A3 الموقع");
check(itemMatchesRequestsAsk({ action: "delete", slots: [], before: { days: "الأحد · الثلاثاء", time: "09:00 – 09:50" } }, ask("الثلاثاء الصباح")), "A3 الحذفُ يُقرأ من «كان» إن لم تكن له أيام");
check(itemMatchesRequestsAsk(slotItem("fsunday", "08:00"), ask("المرفوضة")), "A3 الحالةُ ليست شرطاً على البند هنا (تُدمج مع الشريحة)");
check(requestsAskNote("", ask("")) === null, "A4 الحقلُ الفارغ بلا سطر");
check(requestsAskNote("الأحد المرفوضة", sundayRejected) === "فهمتُ: رُفض · الأحد", "A4 سطرُ «فهمتُ:»");
check(/المرشّحاتُ كما هي/.test(requestsAskNote("أحمد", ask("أحمد")) || "") && /أحمد/.test(requestsAskNote("أحمد", ask("أحمد")) || ""), "A4 اسمٌ فقط ← بحثٌ بالاسم والمرشّحاتُ باقية");
check(/لم أفهم/.test(requestsAskNote("مين كم", ask("مين كم")) || "") && /المرشّحاتُ كما هي/.test(requestsAskNote("مين كم", ask("مين كم")) || ""), "A4 ما لا يُفهم يُقال ولا يمسّ المرشّحات");
check(!/fetch\(|\/api\//.test(read("src/utils/requestsAsk.ts").replace(/\/\*[\s\S]*?\*\//g, "")), "A4 منطقٌ في المتصفّح: لا نداءَ خادم");
check(/parseRequestsAsk\(ask\)/.test(inbox) && /askNote=\{askNote\}/.test(inbox) && /requestsAskNote\(ask, parsedAsk\)/.test(inbox), "A4 الشاشة: الحقلُ نفسُه والسطرُ تحته");
check(/askItemOk\(item, row\)/.test(inbox) && /askItemOk\(item, row\)\)\n\s+\.map/.test(inbox), "A4 الشاشة: السؤالُ في مرشّح البند وفي الأعداد معاً");
check(/const stateFilter: typeof stateChoice = parsedAsk\.state/.test(inbox), "A4 الشاشة: الحالةُ في السؤال تحلّ محلّ الشريحة");
check(/notOpened\(\[row as any\]\)/.test(inbox), "A4 الشاشة: «لم يفتح» من العمود نفسه الذي تقرؤه قائمةُ «لم يفتحوا»");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
