/**
 * ملاحظات المالك 2026-10-28 — E1 · C4 · C5 · C6 · F1–F3 · L3 · L4 · M2.
 * وحداتٌ صرفة تُختبر بالقيم، وسياجٌ على الصفحات والمسارات حتى لا يعود الخلل.
 */
import fs from "node:fs";
import vm from "node:vm";
import { linkMode, parseLinkMode, issueLinkMode, taPhaseOwns, modeAllowsWrite, modeAllowsFreeEdit, LINK_MODES } from "../src/utils/linkMode";
import { awaitsAnswer, isTaRequest, notOpened, notParticipated, openedNotAnswered, requestLinkMode } from "../src/utils/requestParticipation";
import { stickCandidates, bestPerSide, topSticks, shiftLabel, type StickJudged } from "../src/utils/lectureStick";
import { offeringView, suggestFutureCourses, normalizeOfferingEntry, toggleInterest, normalizeLevel, emptyOfferingDoc } from "../src/utils/courseOffering";
import { seatState, tryAddSeats, quotaFor, alternativeSections, nearFull, baseCapacityFor, normalizeQuotaConfig, type SeatLedger } from "../src/utils/advisorSeats";
import { vacantSections, planWaves, dueWaves, countdown, loadRing, allowedFor, phaseOpen } from "../src/utils/taPhase";
import { planNameFill, applyNameFill, fillSummary, normalizeArabicName, resolveInstructorName } from "../src/utils/importNameFill";
import { roleWriteDecision } from "../src/server/roleGuard";
import { MASARI_ACK_TEXT, MASARI_ACK_JS } from "../src/server/masariDisclaimer";
import { TEACHER_CARD_EXTRAS_JS } from "../src/server/teacherCardExtras";
import { AR as arNouns, countOf as arCountOf } from "../src/utils/arabicCount";
import { readServerSource, serverSourceFiles } from "./helpers/serverSource.mjs";

let checks = 0;
function ok(condition: unknown, label: string) { if (!condition) throw new Error(`✗ ${label}`); checks++; }

/* ── E1 ── */
ok(linkMode(undefined) === "edit" && linkMode({}) === "edit" && linkMode({ linkMode: "x" }) === "edit", "E1 missing/unknown mode = edit (existing requests unchanged)");
ok(linkMode({ linkMode: "view" }) === "view" && linkMode({ linkMode: "ta" }) === "ta", "E1 one source of truth: InstructorRequest.linkMode (shared with «لم يشاركوا»)");
{
  const server0 = readServerSource();
  ok(!server0.includes("linkMode(resolved.link)") && server0.includes("linkMode(resolved.request)") && server0.includes("linkMode: issueMode,") && server0.includes('status: "sent", linkMode: "ta"'), "E1 server writes and reads the request's linkMode only");
  ok(!fs.readFileSync("src/types.ts", "utf8").includes('mode?: "view" | "edit" | "ta";\n  /**\n   * ما يُعرف'), "E1 no second mode field on the link");
}
ok(parseLinkMode("ta") === "ta" && parseLinkMode(7) === "edit", "E1 parse");
ok(!modeAllowsWrite("view") && modeAllowsWrite("ta") && !modeAllowsFreeEdit("ta") && modeAllowsFreeEdit("edit"), "E1 write rules");
ok(LINK_MODES.map(m => m.icon).join("") === "👁️✏️🎓", "E1 three visual cards");

/* ── E1 · D1/D2/F3: صفةٌ واحدة يكتبها النشر ويقرؤها الوارد والخادم ── */
{
  const at = "2026-10-28T08:00:00Z";
  const rows = [
    { id: "a", status: "sent", submittedAt: undefined, linkMode: undefined, linkOpenedAt: undefined },
    { id: "b", status: "sent", submittedAt: undefined, linkMode: "view", linkOpenedAt: undefined },
    { id: "c", status: "sent", submittedAt: undefined, linkMode: "view", linkOpenedAt: at },
    { id: "d", status: "sent", submittedAt: undefined, linkMode: "ta", linkOpenedAt: at },
    { id: "e", status: "submitted", submittedAt: at, linkMode: "ta", linkOpenedAt: at },
    { id: "f", status: "sent", submittedAt: undefined, linkMode: "edit", linkOpenedAt: at },
    { id: "g", status: "sent", submittedAt: undefined, linkMode: "ta", linkOpenedAt: undefined },
  ] as const;
  const ids = (list: ReadonlyArray<{ id: string }>) => list.map(row => row.id).join();
  ok(ids(notParticipated(rows)) === "a,d,f,g", "D1/D2 «لم يشاركوا»: كلُّ صفةٍ إلا «للعرض فقط»");
  ok(ids(notOpened(rows)) === "a,g", "D2 «لم يفتحوا»: رابطُ العرض فقط لا ينتظر فتحاً");
  ok(ids(openedNotAnswered(rows)) === "d,f", "D2 «فتحوا ولم يجيبوا» بالقاعدة نفسها");
  ok(ids(rows.filter(isTaRequest)) === "d,e,g", "F3 «🎓 تدريب» من الصفة نفسها");
  ok(rows.every(row => requestLinkMode(row) === linkMode(row) && awaitsAnswer(row) === (linkMode(row) !== "view")), "E1 قارئٌ واحد: requestLinkMode هو linkMode");
}
ok(issueLinkMode(undefined) === "edit" && issueLinkMode("view") === "view" && issueLinkMode("edit") === "edit" && issueLinkMode("x") === "edit" && issueLinkMode("ta") === null,
  "E1 إصدارُ البطاقة 👁️ أو ✏️؛ و🎓 تُفتح من مرحلتها");
ok(taPhaseOwns({ linkMode: "ta" }, false) && !taPhaseOwns({ linkMode: "ta" }, true) && !taPhaseOwns({ linkMode: "view" }, false) && !taPhaseOwns({}, false) && !taPhaseOwns(null, false),
  "F3 النشرُ الجماعي يترك بطاقةَ التدريب القائمة لمرحلتها؛ والاستثناءُ الفرديُّ يحكم");
for (const file of [...serverSourceFiles(), "src/components/InstructorInbox.tsx", "src/components/SchedulePublish.tsx", "src/components/TAPhasePanel.tsx", "src/utils/requestParticipation.ts"]) {
  ok(!/\.linkMode\s*[!=]==/.test(fs.readFileSync(file, "utf8")), `E1 ${file} يقرأ الصفة بـlinkMode() وحدها`);
}
{
  const server1 = readServerSource();
  const issue = server1.slice(server1.indexOf('app.post("/api/instructor-requests/issue"'), server1.indexOf('app.get("/api/instructor-requests/exceptions"'));
  ok(issue.includes("const issueMode = issueLinkMode(req.body?.mode);") && issue.includes("if (!issueMode) { res.status(400)"), "E1 الإصدارُ يردّ «🎓»");
  ok(issue.indexOf("taPhaseOwns(held, individualOnly)") > 0 && issue.indexOf("taPhaseOwns(held, individualOnly)") < issue.indexOf('if (held && move === "keep"'), "F3 حارسُ بطاقة التدريب قبل كل تمديدٍ أو كتابة");
  ok(issue.includes("Repository.setInstructorRequestLinkMode(held.id, issueMode)") && (issue.match(/linkMode: issueMode,/g) || []).length === 2,
    "E1 النشرُ يكتب صفته على الجديد والممدَّد والذي ينتظر القسم (حقلاً وحده)");
  ok(server1.includes("unopened: notOpened(rows).length"), "D2 عدّادُ «لم يفتحوا» في الخادم بالقاعدة نفسها");
  ok(server1.includes("if (!modeAllowsWrite(linkMode(resolved.request)) || !requestWindowOpen(resolved.request)"), "E1 رابطُ العرض لا يحجز وقتاً");
  const inbox = fs.readFileSync("src/components/InstructorInbox.tsx", "utf8");
  ok(inbox.includes("notOpened<InboxRequest>(visible)") && inbox.includes("openedNotAnswered(rows || [])") && inbox.includes("(!taOnly || isTaRequest(row))"), "D1/D2/F3 الوارد يفلتر بالمساعدات نفسها");
  const repo = fs.readFileSync("src/db/repository.ts", "utf8");
  const setMode = repo.slice(repo.indexOf("setInstructorRequestLinkMode: async"), repo.indexOf("setInstructorRequestLinkMode: async") + 1200);
  ok(setMode.includes("tx.update(ref, { linkMode: mode, updatedAt: at })") && !setMode.includes("requestRevision"), "E1 الصفةُ تُكتب حقلاً وحده بلا رفع المراجعة");
}

/* ── C6 ── */
const dur = (days: string[]) => (days.some(d => d === "fmonday" || d === "fwednesday") ? 75 : 50);
const anchor = { rowId: 1, title: "أ", days: ["fsunday", "ftuesday"] as any, start: "10:00", end: "10:50" };
const after = stickCandidates(anchor, "after", dur as any);
ok(after[0].start === "11:00" && after[0].end === "11:50" && after[0].shift === 0, "C6 after = end + 10 min regulation gap (Sun/Tue)");
ok(after[1].start === "12:00" && after[1].shift === 60, "C6 the next alternative is the next start on the regulation ladder (+60د), not +30د off it");
const before = stickCandidates(anchor, "before", dur as any);
ok(before[0].start === "09:00" && before[0].end === "09:50", "C6 before = start − gap − duration");
const mon = stickCandidates({ rowId: 2, title: "ب", days: ["fmonday", "fwednesday"] as any, start: "09:30", end: "10:45" }, "after", dur as any);
ok(mon[0].start === "11:00" && mon[0].end === "12:15", "C6 Mon/Wed: end + 10-min gap lands on the Mon/Wed ladder (11:00)");
const monLadder = stickCandidates({ rowId: 3, title: "ج", days: ["fmonday", "fwednesday"] as any, start: "08:00", end: "09:20" }, "after", (() => 80) as any);
ok(monLadder.map(candidate => candidate.start).join() === "09:30,11:00", "C6 Mon/Wed 08:00–09:20 → 09:30 then 11:00 (the owner's ladder)");
ok(stickCandidates({ ...anchor, start: "08:00", end: "08:50" }, "before", dur as any).length === 0, "C6 nothing before 08:00");
const judged: StickJudged[] = [
  { ...after[0], tone: "bad", sameRoom: false, sameBuilding: false },
  { ...after[1], tone: "ok", sameRoom: false, sameBuilding: true },
  { ...before[0], tone: "ok", sameRoom: true, sameBuilding: true },
];
ok(bestPerSide(judged).find(r => r.side === "after")?.shift === 60, "C6 nearest available when adjacent taken");
ok(topSticks(judged)[0].side === "before" && topSticks(judged)[0].sameRoom, "C6 best: same room first");
ok(topSticks(judged).length <= 3 && shiftLabel(after[1]) === "+60د" && shiftLabel(after[0]) === "ملاصق", "C6 top 3 + labels");
const server = readServerSource();
const stickRoute = server.slice(server.indexOf('app.post("/api/public/request/:token/stick"'), server.indexOf('/* ── C5: لوحة المسؤول لحالة الطرح'));
ok(stickRoute.includes("judgeRequestItems(") && !stickRoute.includes("findConflicts(") && !stickRoute.includes("judgeRequest("), "C6 reuses the one verdict engine, no duplicate checks");

/* ── C5 ── */
const doc = { ...emptyOfferingDoc(1, 2, 3), courses: {
  "10": { courseId: 10, state: "closed" as const }, "11": { courseId: 11, state: "future" as const, level: 300 },
  "12": { courseId: 12, state: "limited" as const, maxSections: 2 }, "13": { courseId: 13, state: "closed" as const, suggested: true },
} };
ok(offeringView(doc, 99).selectable && offeringView(doc, 99).state === "offered", "C5 no entry = offered");
ok(!offeringView(doc, 10).selectable && !offeringView(doc, 10).hidden, "C5 closed, faded by default");
ok(offeringView({ ...doc, display: "hide" }, 10).hidden, "C5 hidden when admin chooses");
ok(offeringView(doc, 11).line === "يُطرح عند وصول الدفعة للمستوى 300", "C5 future line");
ok(offeringView(doc, 12, 1).selectable && offeringView(doc, 12, 1).remaining === 1 && !offeringView(doc, 12, 2).selectable, "C5 limited counts remaining from real sections");
ok(offeringView(doc, 13).state === "offered", "C5 an unconfirmed suggestion changes nothing");
ok(normalizeLevel(3) === 300 && normalizeLevel(200) === 200 && normalizeLevel(0) === 0, "C5 level normalisation");
const sug = suggestFutureCourses({ newPlanCourseIds: [1, 2, 3, 4], levelOf: id => ({ 1: 100, 2: 200, 3: 300, 4: 4 } as any)[id], scheduledCourseIds: [1, 2] });
ok(sug.map(s => s.courseId).join() === "3,4" && sug[0].reachedLevel === 200, "C5 derive future from plan levels vs scheduled");
ok(suggestFutureCourses({ newPlanCourseIds: [5], levelOf: () => 300, scheduledCourseIds: [] }).length === 0, "C5 no evidence → no suggestion");
ok(normalizeOfferingEntry({ courseId: 4, state: "limited", maxSections: 3 })?.maxSections === 3 && normalizeOfferingEntry({ state: "x" }) === null, "C5 normalise entry");
let interest = toggleInterest(null, "k", 10, 7, true); interest = toggleInterest(interest, "k", 10, 8, true); interest = toggleInterest(interest, "k", 10, 7, false);
ok(JSON.stringify(interest.byCourse) === '{"10":[8]}', "C5 🌟 interest toggles per instructor");

/* ── L3 ── */
const config = normalizeQuotaConfig({ global: 10, capacityDefault: 60, byCourse: { 5: 4 } }, "c");
const ledger: SeatLedger = { id: "3:9:1", courseId: 9, capacity: 60, roomCapacity: null, adds: [] };
ok(quotaFor(config, 9, "x") === 10 && quotaFor(config, 5, "x") === 4 && baseCapacityFor(config, "x") === 60, "L3 quota precedence + base capacity");
ok(seatState(ledger, config).hardCap === 70 && seatState(ledger, config).ringLabel === "60 + 0/10", "L3 ring 60 + 0/10");
ok(seatState({ ...ledger, roomCapacity: 64 }, config).hardCap === 64 && seatState({ ...ledger, roomCapacity: 64 }, config).limitedBy === "room", "L3 hard cap = actual room capacity");
const first = tryAddSeats(ledger, config, { id: 1, name: "م1" }, 3);
ok(first.result.ok && first.result.message === "أضفت 3 · متبقي 7" && first.next!.adds.length === 1, "L3 «أضفت 3 · متبقي 7»");
const eight = tryAddSeats(first.next!, config, { id: 2, name: "م2" }, 5);
ok(eight.result.ok && eight.result.message.includes("آخر مقعدين") && eight.result.icon === "⚠️", "L3 «آخر مقعدين»");
const over = tryAddSeats(eight.next!, config, { id: 3, name: "م3" }, 3);
ok(!over.result.ok && (over.result as any).reason === "full" && !over.next, "L3 never exceeds the cap, nothing partial");
const full = tryAddSeats(tryAddSeats(eight.next!, config, { id: 3, name: "م3" }, 2).next!, config, { id: 3, name: "م3" }, 1);
ok(!full.result.ok && full.result.message === "الشعبة ممتلئة", "L3 «الشعبة ممتلئة»");
/* محاكاة تزامن: كلُّ محاولةٍ تقرأ آخر ما كُتب (كما في المعاملة الذرّية) — المجموعُ لا يتجاوز السقف. */
let shared: SeatLedger = { ...ledger };
for (let i = 0; i < 30; i++) { const r = tryAddSeats(shared, config, { id: i % 4, name: `م${i % 4}` }, 1); if (r.next) shared = r.next; }
ok(seatState(shared, config).advisorAdded === 10 && seatState(shared, config).remaining === 0, "L3 30 concurrent adds stop at 10");
const fair = normalizeQuotaConfig({ global: 10, capacityDefault: 60, fairSplit: true, advisorCount: 2 }, "c");
const f1 = tryAddSeats(ledger, fair, { id: 1, name: "م1" }, 5);
ok(f1.result.ok && !tryAddSeats(f1.next!, fair, { id: 1, name: "م1" }, 1).result.ok && tryAddSeats(f1.next!, fair, { id: 2, name: "م2" }, 1).result.ok, "L3 optional fair split");
const alts = alternativeSections([{ ledger: shared }, { ledger: { ...ledger, id: "3:9:2" } }, { ledger: { ...ledger, id: "3:8:1", courseId: 8 } }], 9, shared.id, config);
ok(alts.length === 1 && alts[0].ledger.id === "3:9:2", "L3 alternatives with seats, same course");
ok(nearFull([shared, ledger], config).length === 1 && nearFull([shared], config)[0].byAdvisor.length > 0, "L3 admin board: near-full + who added");
ok(roleWriteDecision({ method: "POST", path: "/advisor-seats/add", authenticated: true, powerUser: false, role: "advisor" }).allowed
  && !roleWriteDecision({ method: "POST", path: "/advisor-seats/config", authenticated: true, powerUser: false, role: "advisor" }).allowed
  && !roleWriteDecision({ method: "POST", path: "/schedules", authenticated: true, powerUser: false, role: "advisor" }).allowed, "L3 advisor door is narrow");
ok(server.includes('Repository.updateFeatureDoc<SeatLedger') && server.includes("tryAddSeats(ledger, config, advisor"), "L3 add runs inside the atomic update");

/* ── F1–F3 ── */
const placeholders = new Set([99]);
const vac = vacantSections([
  { id: 1, AdCourseId: 5, SCode: "1", AdInstructorId: 99, fstarttime: "08:00", fendtime: "08:50", fsunday: true, ftuesday: true, AdRoomCode: "B", AdRoomHall: "1" },
  { id: 2, AdCourseId: 5, SCode: "2", AdInstructorId: 7, fstarttime: "09:00", fendtime: "09:50", fsunday: true },
  { id: 3, AdCourseId: 6, SCode: "1", AdInstructorId: 99, fstarttime: "10:00", fendtime: "11:15", fmonday: true },
  { id: 4, AdCourseId: 6, SCode: "1", AdInstructorId: 7, fstarttime: "10:00", fendtime: "11:15", fwednesday: true },
], placeholders);
ok(vac.length === 1 && vac[0].courseId === 5 && vac[0].days.join() === "fsunday,ftuesday" && vac[0].room === "B/1", "F1 vacant = all rows on «هيئة تدريسية»");
const now = new Date("2026-10-28T08:00:00Z");
const waves = planWaves([[1, 2], [2, 3], []], 12, now);
ok(waves.length === 2 && waves[1].instructorIds.join() === "3" && Date.parse(waves[1].sendAt) - Date.parse(waves[0].sendAt) === 12 * 3600000, "F2 priority waves with delay, no duplicates");
const phase = { id: "x", AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, openedAt: now.toISOString(), closesAt: "2026-10-30T08:00:00Z", waves, reminderHours: 24 } as any;
ok(dueWaves(phase, now.getTime()).length === 1 && dueWaves(phase, now.getTime() + 13 * 3600000).length === 2, "F2 waves due on schedule");
ok(countdown(phase, now.getTime()).days === 2 && !countdown(phase, now.getTime()).remind && countdown(phase, now.getTime() + 25 * 3600000).remind, "F2 countdown + automatic reminder window");
ok(phaseOpen(phase, now.getTime()) && !phaseOpen({ ...phase, closedAt: "x" }, now.getTime()), "F2 phase open/closed");
ok(loadRing(6, 12)?.label === "نصابك 6/12" && loadRing(12, 12)?.tone === "full" && loadRing(3, 0) === null, "F3 load ring «نصابك 6/12», none without a recorded load");
ok(allowedFor({ allowedCourses: { 7: [5] } }, 7)?.has(5) && allowedFor({}, 7) === null, "F3 allowed courses");
ok(server.includes('if (postMode === "ta" && ') && server.includes("في مرحلة التدريب تختار من الشعب الشاغرة فقط"), "F3 server refuses free edits in TA mode");
ok(server.includes('courses: mode === "edit" ? coursesWithOffering(') && server.includes("availableInstructorOfferings(request)).filter(option => (!taAllowed || taAllowed.has(Number(option.courseId))) && !offeringBlocked(termStates"), "F3 TA card locked to vacant offerings");

/* ── C4 ── */
ok(server.includes('const open = mode !== "view" && requestWindowOpen(request);') && server.includes('if (postMode === "view")'), "C4/E1 view-only link never writes");
ok(server.includes("+tcRibbon(r,open)+") && TEACHER_CARD_EXTRAS_JS.includes("انتهت فترة الطلبات"), "C4 closed ribbon in the card");
const tc = vm.createContext({ countOf: arCountOf, AR: arNouns, data: { mode: "edit" }, esc: (v: string) => String(v), state: [], TOKEN: "t", fmtDays: (d: string[]) => d.join(","), host: null, paint() {}, recheckAll() {}, payloadItems: () => [], Intl, Date });
vm.runInContext(TEACHER_CARD_EXTRAS_JS, tc);
const ribbon = vm.runInContext(`tcRibbon({window:{closesAt:"2026-10-20T20:59:00Z"},items:[{action:"change",decision:{state:"fixed"}},{action:"add",decision:{state:"rejected"}},{action:"add"},{action:"keep"}]},false)`, tc);
ok(ribbon.includes("🔒") && ribbon.includes("انتهت فترة الطلبات") && ribbon.includes("✅ ثُبّت <b>1") && ribbon.includes("❌ رُفض <b>1") && ribbon.includes("⏳ قيد المراجعة <b>1"), "C4 ribbon: date + previous request states");
ok(vm.runInContext(`tcRibbon({items:[]},true)`, tc) === "", "C4 no ribbon while open");
const ahead = new Date(Date.now() + 5 * 86400000).toISOString();
ok(vm.runInContext(`tcRibbon({status:"settled",window:{closesAt:${JSON.stringify(ahead)}},items:[{action:"change",decision:{state:"fixed"}}]},false)`, tc) === ""
  && vm.runInContext(`tcRibbon({status:"settled",items:[]},false)`, tc) === "",
  "C4 settled before the deadline: no «انتهت فترة الطلبات · منذ» a date still ahead");
tc.data = { mode: "view" };
ok(vm.runInContext(`tcRibbon({items:[]},false)`, tc).includes("👁️"), "E1 view-only ribbon");
tc.data = { mode: "ta", ta: { closesAt: new Date(Date.now() + 3 * 3600000).toISOString(), remind: true }, taLoad: { hours: 6, load: 12, ratio: .5, tone: "open", label: "نصابك 6/12" } };
const taRibbon = vm.runInContext(`tcRibbon({items:[]},true)`, tc);
ok(taRibbon.includes("🎓") && taRibbon.includes("6/12") && taRibbon.includes("🔔"), "F3 TA ribbon with countdown, reminder and load ring");
const bodyHtml = server.slice(server.indexOf("function bodyHtml(it,i,open)"), server.indexOf("function bodyHtml(it,i,open)") + 1200);
ok(bodyHtml.includes('if(open&&data.mode!=="ta")') && bodyHtml.includes("else if(!h)"), "C4 edit controls are not rendered when closed (removed, not disabled)");

/* ── L4 ── */
ok(normalizeArabicName("د. أحمد  الفيلكاوي") === normalizeArabicName("احمد الفيلكاوى") && normalizeArabicName("أ.د/ فاطمة") === normalizeArabicName("فاطمه"), "L4 tolerant of «د.» / hamza / spacing");
const people = [{ AdInstructorId: 7, AdInstructorName: "د. أحمد علي" }, { AdInstructorId: 8, AdInstructorName: "سارة محمد" }, { AdInstructorId: 9, AdInstructorName: "سارة  محمد" }];
ok(resolveInstructorName("احمد علي", people).id === 7 && resolveInstructorName("سارة محمد", people).id === 0 && (resolveInstructorName("سارة محمد", people) as any).reason === "ambiguous", "L4 never guesses between two people");
const base = { AdCourseId: 5, SCode: "1", fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "B", AdRoomHall: "101", AdInstructorId: 0 };
const imported = [base, { ...base, SCode: "2" }, { ...base, SCode: "3" }, { ...base, SCode: "4", AdInstructorId: 8 }];
const current = [{ ...base, AdInstructorId: 7 }, { ...base, SCode: "2", fstarttime: "9:00", fendtime: "09:50", AdInstructorId: 8 }, { ...base, SCode: "4", AdInstructorId: 7 }];
const plan = planNameFill(imported, current, people);
ok(plan[0].status === "match" && plan[0].instructorId === 7, "L4 ✅ 100% row match fills the name");
ok(plan[1].status === "partial" && plan[1].diffs.length === 1 && plan[1].diffs[0].field === "time" && plan[1].diffs[0].theirs === "09:00–09:50", "L4 ⚠️ shows the exact difference");
ok(plan[2].status === "none" && plan[3].reason === "السطر يحمل أستاذاً", "L4 ❌ no source / a named row untouched");
ok(JSON.stringify(fillSummary(plan)) === '{"total":3,"match":1,"partial":1,"none":1}', "L4 summary infographic counts");
const applied = applyNameFill(imported, plan);
ok(applied[0].AdInstructorId === 7 && applied[1].AdInstructorId === 0 && applied[3].AdInstructorId === 8, "L4 partial applied only when accepted");
ok(applyNameFill(imported, plan, new Set([1]))[1].AdInstructorId === 8, "L4 accepted partial");
{ const { importEvidence: _evidence, ...rest } = applied[0] as any; ok(JSON.stringify({ ...rest, AdInstructorId: 0 }) === JSON.stringify(imported[0]) && _evidence?.instructor?.confidence === "CONFIRMED", "L4 only the name field (and its evidence) change"); }
const fromPdf = planNameFill([base], [{ ...base, AdInstructorId: 0, instructorText: "د.احمد علي" }], people);
ok(fromPdf[0].status === "match" && fromPdf[0].instructorId === 7, "L4 second PDF: names resolved against members/seconded");

/* ── M2 ── */
const masari = fs.readFileSync("src/server/studentHomePage.ts", "utf8");
ok(MASARI_ACK_TEXT === "هذه مقترحات فقط، وليست تسجيلاً نهائياً" && MASARI_ACK_JS.includes("فهمت ✓"), "M2 sentence + «فهمت ✓»");
ok(masari.includes('if(v==="home"){if(!masariAcked())return viewAck();viewHome();masariRibbon();return}'), "M2 card required before home, then ribbon");
ok(MASARI_ACK_JS.includes('"masari-ack:"+(t.id||"")+":"+(p.sectionId||"")+":"+(p.planId'), "M2 once per term, again when the path changes");
ok(MASARI_ACK_JS.includes("مقترح · غير نهائي") && MASARI_ACK_JS.includes("💡") && MASARI_ACK_JS.includes("👀") && MASARI_ACK_JS.includes("✅"), "M2 infographic + fixed ribbon");
const mctx = vm.createContext({ S: { state: { term: { id: 3 }, profile: { sectionId: 2, planId: "p1" } } } });
vm.runInContext(MASARI_ACK_JS, mctx);
ok(vm.runInContext("masariAcked()", mctx) === false, "M2 first visit asks");
ok(!/localStorage|sessionStorage/.test(MASARI_ACK_JS) && MASARI_ACK_JS.includes('api("POST","/api/public/me/ack"'), "M2 ack lives on the server profile, not browser storage");
mctx.S.state.profile.masariAck = "masari-ack:3:2:p1";
ok(vm.runInContext("masariAcked()", mctx) === true, "M2 acknowledged this term/path");
mctx.S.state.profile.planId = "p2";
ok(vm.runInContext("masariAcked()", mctx) === false, "M2 path change asks again");

console.log(`owner-features-2026-10-28-audit: ${checks} checks passed`);
