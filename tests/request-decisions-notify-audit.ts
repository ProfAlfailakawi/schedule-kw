/**
 * ── تدقيق «رغبات الأساتذة»: إشعارُ القرار وتقويمُه، ومتانةُ الوارد، وحوافُّ الخادم ──────
 *
 *   FR-REQ-060 «ما تقرّر منذ آخر زيارة»: ما كُتب فعلاً (fixedAs) لا المطلوب، والبدائل، وملفّ ICS لموعدٍ واحد.
 *   FR-REQ-061 «أبلغ من صدر لهم قرار»: ما قُرّر بعد آخر إبلاغ وحده، ولا يُرسل شيءٌ إلا بضغطة المنسّق.
 *   FR-REQ-062 تثبيتُ المقترح الدراسي يُغلق بنودَ الطلب التي عالجها ويُفكّ حجزها، والتراجعُ يعيدها.
 *   FR-REQ-063 أوراقٌ لا تُضيع ما كُتب، وقراءةٌ لا تُفرغ الشاشة، وأعدادٌ تتبع المرشّحات، وapply-busy يُعاد.
 *   FR-REQ-064 رابطُ العرض لا يردّ، وجولةٌ جديدة تستبدل القديمة، ولا قرارَ على ما لم يُطلب.
 * وحداتٌ خالصة تُشغَّل، وعقودُ مصدرٍ تُقرأ — لا خادمَ ولا شبكة.
 */
import fs from "node:fs";
import { decisionDigest, decisionsSince, unsentDecisions, fixedTimeOf } from "../src/utils/requestDecisionDigest";
import { inboxFacetCounts, nameMatches, sortInboxRows } from "../src/utils/inboxFacets";
import { APPLY_BUSY_DELAYS, withApplyBusyRetry } from "../src/utils/applyBusyRetry";
import { proposalSettledIndexes, reopenRequestFromProposal, settleRequestFromProposal } from "../src/utils/proposalSettlesRequest";
import { proposalCommittedMessage, proposalSentMessage } from "../src/server/pushMessages";
import type { InstructorRequest, InstructorRequestItem, StudyProposalOp } from "../src/types";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ── FR-REQ-060: ما تقرّر ─────────────────────────────────────────────────── */
const item = (over: Partial<InstructorRequestItem>): InstructorRequestItem => ({ rowId: null, action: "change", slots: [], ...over } as InstructorRequestItem);
const request = (items: InstructorRequestItem[], extra: Partial<InstructorRequest> = {}) => ({ items, ...extra } as InstructorRequest);

const fixedMoved = item({ itemId: "a", rowId: 11, action: "add", after: { courseId: 5, courseName: "تاريخ الفن" } as any,
  slots: [{ day: "fsunday", start: "08:00", end: "09:15" }, { day: "ftuesday", start: "08:00", end: "09:15" }],
  decision: { state: "fixed", decidedAt: "2026-11-10T08:00:00Z", scheduleId: 77, fixedAs: { days: ["fmonday", "fwednesday"], start: "10:00", end: "11:15" } } });
const rejected = item({ itemId: "b", rowId: 12, before: { courseName: "مبادئ المحاسبة" } as any,
  slots: [{ day: "fthursday", start: "12:00", end: "12:50" }],
  decision: { state: "rejected", reasonCode: "room", decidedAt: "2026-11-11T08:00:00Z", note: "القاعة 901A01 محجوزة",
    alternatives: [{ day: "fsunday", days: ["fsunday", "ftuesday"], start: "09:30", end: "10:45" }, { day: "fmonday", start: "13:00", end: "14:15" }] } });
const old = item({ itemId: "c", rowId: 13, before: { courseName: "قديم" } as any, slots: [{ day: "fsunday", start: "08:00", end: "08:50" }],
  decision: { state: "fixed", decidedAt: "2026-11-01T08:00:00Z" } });
const replied = item({ itemId: "d", rowId: 14, before: { courseName: "حوار" } as any,
  thread: [{ from: "department", at: "2026-11-12T08:00:00Z", text: "هل يناسبك الخميس؟", slots: [{ day: "fthursday", start: "12:00", end: "12:50" }] }] as any });
const hidden = { ...item({ itemId: "e", decision: { state: "fixed", decidedAt: "2026-11-12T09:00:00Z" } }), hidden: true } as any;
const digest = decisionDigest(request([fixedMoved, rejected, old, replied, hidden]));

const fixedEntry = digest.find(entry => entry.itemId === "a")!;
check(fixedEntry.kind === "fixed" && fixedEntry.start === "10:00" && fixedEntry.days.join() === "fmonday,fwednesday",
  "FR-REQ-060 المثبَّت يُقال بما كُتب فعلاً (fixedAs) لا بما طُلب");
check(fixedEntry.calendarReady === true, "FR-REQ-060 ولموعده المثبَّت «أضف إلى تقويمي»");
const rejectedEntry = digest.find(entry => entry.itemId === "b")!;
check(rejectedEntry.kind === "rejected" && rejectedEntry.reasonCode === "room" && rejectedEntry.alternatives.length === 2
  && rejectedEntry.alternatives[0].days.join() === "fsunday,ftuesday", "FR-REQ-060 المرفوضُ بسببه وبديليه");
check(digest.some(entry => entry.itemId === "d" && entry.kind === "reply"), "FR-REQ-060 وآخرُ ردٍّ من القسم");
check(!digest.some(entry => entry.itemId === "e"), "FR-REQ-060 والبندُ المخفيّ عن القارئ لا يُعدّ");
check(digest[0].at >= digest[digest.length - 1].at, "FR-REQ-060 الأحدثُ أولاً");
const since = decisionsSince(digest, "2026-11-05T00:00:00Z");
check(!since.some(entry => entry.itemId === "c") && since.some(entry => entry.itemId === "a"), "FR-REQ-060 ما قُرّر قبل الزيارة السابقة لا يظهر");
check(decisionsSince(digest, "").length === digest.length, "FR-REQ-060 وزيارةٌ أولى ترى كلَّ ما تقرّر");
check(fixedTimeOf(old).start === "08:00", "FR-REQ-060 طلبٌ قديمٌ بلا fixedAs يُقرأ بأوقات بنده");

/* ── FR-REQ-061: أبلغ من صدر لهم قرار ─────────────────────────────────────── */
check(unsentDecisions(request([fixedMoved, rejected, old, replied])).length === 3, "FR-REQ-061 بلا إبلاغٍ سابق: كلُّ قرار، والردُّ وحده ليس قراراً");
check(unsentDecisions(request([fixedMoved, rejected, old, replied], { decisionNotifiedAt: "2026-11-10T12:00:00Z" })).map(entry => entry.itemId).join() === "b",
  "FR-REQ-061 بعد الإبلاغ: ما قُرّر بعده وحده");
check(unsentDecisions(request([fixedMoved, old], { decisionNotifiedAt: "2026-11-11T00:00:00Z" })).length === 0, "FR-REQ-061 ولا جديدَ بعد الإبلاغ: لا يعود إلى القائمة");

/* ── FR-REQ-062: تثبيتُ المقترح يُغلق بنود الطلب ──────────────────────────── */
const pendingChange = item({ itemId: "p1", rowId: 21, action: "change", before: { courseName: "س" } as any, slots: [{ day: "fsunday", start: "08:00", end: "09:15" }] });
const pendingAdd = item({ itemId: "p2", rowId: null, action: "add", after: { courseId: 9, courseName: "ص" } as any });
const decidedBefore = item({ itemId: "p3", rowId: 23, action: "change", decision: { state: "rejected", reasonCode: "other", decidedAt: "2026-11-01T00:00:00Z" } });
const untouched = item({ itemId: "p4", rowId: 24, action: "delete" });
const req = request([pendingChange, pendingAdd, decidedBefore, untouched], { id: "r1", status: "in-review", submittedAt: "2026-11-01T00:00:00Z", timeline: [] } as any);
const ops = [
  { id: "o1", kind: "edit", source: { id: 21 }, target: { AdCourseId: 1, days: ["fmonday", "fwednesday"], fstarttime: "10:00", fendtime: "11:15" } },
  { id: "o2", kind: "assign", source: { id: 90 }, target: { AdCourseId: 9, days: ["fthursday"], fstarttime: "12:00", fendtime: "14:30" } },
  { id: "o3", kind: "edit", source: { id: 23 }, target: { AdCourseId: 2, days: ["fsunday"], fstarttime: "08:00", fendtime: "09:15" } },
] as unknown as StudyProposalOp[];
check(proposalSettledIndexes(req, { itemIndex: null }, ops).join() === "0,1", "FR-REQ-062 يُثبَّت ما عالجه المقترح وحده، وما قُرّر من قبل لا يُمسّ");
const settled = settleRequestFromProposal(req, { id: "sp1", itemIndex: null }, ops, "2026-11-13T10:00:00Z", "المنسّق")!;
check(settled.items[0].decision?.state === "fixed" && settled.items[0].decision?.viaProposal === "sp1" && settled.items[0].decision?.fixedAs?.start === "10:00",
  "FR-REQ-062 بقرار «ثُبّت» يحمل المقترحَ ووقتَه المكتوب");
check(settled.items[2].decision?.state === "rejected" && !settled.items[3].decision, "FR-REQ-062 والمرفوضُ يبقى مرفوضاً، وما لم يعالجه يبقى معلّقاً");
check(settled.status === "in-review" && settled.timeline.filter(event => event.kind === "item-fixed").length === 2, "FR-REQ-062 والطلبُ قيد المراجعة ما بقي بندٌ معلّق");
check(settleRequestFromProposal(request([decidedBefore]), { id: "sp1" }, ops, "", "") === null, "FR-REQ-062 ومقترحٌ لم يعالج بنداً معلّقاً لا يمسّ الطلب");
/* بندٌ فُتح منه المقترح ولم تُثبَّت عمليتُه (ردٌّ مستقلّ ثبّت عمليةً أخرى) لا يُقال عنه «ثُبّت». */
check(proposalSettledIndexes(req, { itemIndex: 3 }, ops).join() === "0,1", "FR-REQ-062 البندُ الذي فُتح منه المقترح لا يُثبَّت إن لم تُثبَّت عمليةٌ تطابقه");
/* الإضافةُ تُسجَّل بوقت ما كُتب ورقم صفّه في المعاملة. */
const withRows = settleRequestFromProposal(req, { id: "sp1", itemIndex: null }, ops, "2026-11-13T10:00:00Z", "المنسّق", { created: [], updated: [{ id: 90, AdCourseId: 9 } as any] })!;
check(withRows.items[1].decision?.fixedAs?.start === "12:00" && withRows.items[1].decision?.fixedAs?.days.join() === "fthursday" && withRows.items[1].decision?.scheduleId === 90,
  "FR-REQ-062 إضافةٌ عبر assign تحمل وقتَ المكتوب ورقمَ صفّه");
const reopened = reopenRequestFromProposal(settled, "sp1", "2026-11-13T11:00:00Z", "المنسّق")!;
check(!reopened.items[0].decision && !reopened.items[1].decision && reopened.items[2].decision?.state === "rejected", "FR-REQ-062 والتراجعُ يعيد ما ثبّته المقترح معلّقاً وحده");
const repo = read("src/db/repository.ts");
const commitBlock = repo.slice(repo.indexOf("commitStudyProposal: async"), repo.indexOf("/* ══════", repo.indexOf("commitStudyProposal: async")));
check(commitBlock.includes("plan.settleRequest!(requestDoc.data() as InstructorRequest, { created, updated })") && commitBlock.includes("entries = retainRequestReservations(entries, nextRequest);")
  && commitBlock.includes("transaction.set(requestRef, nextRequest);"), "FR-REQ-062 الطلبُ وفكُّ حجزه في معاملة تثبيت المقترح نفسها");
const proposalRoutes = read("src/server/studyProposalRoutes.ts");
check(proposalRoutes.includes("settleRequest: (request, written) => settleRequestFromProposal(") && proposalRoutes.includes("settleRequest: request => reopenRequestFromProposal("),
  "FR-REQ-062 التثبيتُ يغلق البنود، والتراجعُ يعيدها");
check(proposalRoutes.includes("await Repository.appendInstructorRequestTimeline(requestId,") && !/noteOnRequest[\s\S]{0,400}saveInstructorRequest/.test(proposalRoutes.slice(proposalRoutes.indexOf("async function noteOnRequest"), proposalRoutes.indexOf("export function registerStudyProposalRoutes"))),
  "FR-REQ-062 أحداثُ المقترح في سجلّ الطلب حقلٌ واحد لا يرفع ختمه");
const appendBlock = repo.slice(repo.indexOf("appendInstructorRequestTimeline: async"), repo.indexOf("setInstructorRequestLinkMode: async"));
check(appendBlock.includes("tx.update(ref, { timeline, updatedAt: event.at })") && !appendBlock.includes("requestRevision"), "FR-REQ-062 والكتابةُ لا تمسّ requestRevision");
const sent = proposalSentMessage("TOK", "p-1", false), revised = proposalSentMessage("TOK", "p-1", true), committed = proposalCommittedMessage("TOK");
check(sent.url === "/r/TOK/proposal/p-1" && sent.tag === "card-proposal" && revised.title.includes("معدّلة") && committed.tag === "card-decisions",
  "FR-REQ-062 تنبيهُ المقترح إلى كرت صاحبه برابط صفحته");
check(!/قاعة|مبنى|\d{1,2}:\d{2}/.test([sent, revised, committed].map(message => `${message.title} ${message.body}`).join(" ")), "FR-REQ-062 بنصٍّ عامّ بلا قاعةٍ ولا وقت");
check(/if \(!\(Repository\.isDemoMode\(\) \|\| Repository\.isDemoRequest\(\)\)\) await pushHooks\.proposalSent\(/.test(proposalRoutes)
  && /if \(!\(Repository\.isDemoMode\(\) \|\| Repository\.isDemoRequest\(\)\)\) await pushHooks\.proposalCommitted\(/.test(proposalRoutes),
  "FR-REQ-062 ولا يُدفع شيءٌ من صندوق العرض");
const push = read("src/server/pushRoutes.ts");
check(push.includes("if (repeatedForCard(token, message)) return;") && push.includes("clock() - held.at < 60_000"), "FR-NTF-019 التنبيهُ نفسُه إلى الكرت نفسه خلال دقيقة لا يُعاد");

/* ── FR-REQ-063: الوارد ───────────────────────────────────────────────────── */
const facetItems = [
  ...Array.from({ length: 9 }, () => ({ action: "change" })),
  ...Array.from({ length: 2 }, () => ({ action: "add" })),
  { action: "change", state: "fixed" },
];
const facets = inboxFacetCounts(facetItems, { state: "pending", action: "change", verdict: "all" });
check(facets.pending === 9 && facets.add === 2 && facets.change === 9 && facets.fixed === 1, "FR-REQ-063 كلُّ مجموعةٍ تعدّ نفسها تحت المرشّحات الأخرى (9 تعديلات، إضافتان)");
check(inboxFacetCounts([], { state: "pending", action: "all", verdict: "all" }).all === 0, "FR-REQ-063 ووارد فارغ أعدادُه صفر");
check(nameMatches("د. أحمد الفيلكاوي", "احمد") && nameMatches("فاطمة", "فاطمه") && !nameMatches("سارة", "نورة") && nameMatches("أي اسم", "  "),
  "FR-REQ-063 بحثُ الاسم بمفتاح المطابقة العربي");
const sortedRows = sortInboxRows([
  { instructorName: "ب", submittedAt: "2026-11-05T00:00:00Z" }, { instructorName: "أ", submittedAt: "2026-11-01T00:00:00Z" }, { instructorName: "ج" },
], "oldest", (a, b) => a.localeCompare(b, "ar"));
check(sortedRows.map(row => row.instructorName).join() === "أ,ب,ج", "FR-REQ-063 «الأقدم أولاً»: من ينتظر أطولَ أولاً، ومن لم يرسل آخراً");

void (async () => {
  const waits: number[] = [];
  let calls = 0;
  const twice = await withApplyBusyRetry(async () => { calls += 1; if (calls <= 2) throw Object.assign(new Error("busy"), { code: "apply-busy" }); return "ok"; }, async ms => { waits.push(ms); });
  check(twice === "ok" && calls === 3 && waits.join() === "1500,3000", "FR-REQ-063 apply-busy مرّتين ثم نجاح: يُنجز بلا خطأ");
  let always = 0, thrown: any = null;
  try { await withApplyBusyRetry(async () => { always += 1; throw Object.assign(new Error("busy"), { code: "apply-busy" }); }, async () => undefined); } catch (error) { thrown = error; }
  check(thrown?.code === "apply-busy" && always === APPLY_BUSY_DELAYS.length + 1, "FR-REQ-063 وأربعُ مرّات تُعيد الخطأ للمنسّق");
  let other = 0, otherError: any = null;
  try { await withApplyBusyRetry(async () => { other += 1; throw Object.assign(new Error("x"), { code: "revision" }); }, async () => undefined); } catch (error) { otherError = error; }
  check(other === 1 && otherError?.code === "revision", "FR-REQ-063 وما سواه يُرمى من أول مرّة");

  const inbox = read("src/components/InstructorInbox.tsx");
  check(inbox.includes("onClick={() => setTalking(true)}") && inbox.includes("ردّ / اقترح وقتاً"), "FR-REQ-063 الحوارُ يبدأ من القسم بزرّ «ردّ / اقترح وقتاً»");
  check(/const problem = await onSubmit\(reason as InstructorRequestRejectReason/.test(inbox) && /if \(problem\) setFailure\(problem\); else onClose\(\);/.test(inbox)
    && !inbox.includes("onCloseReject();\n          }}"), "FR-REQ-063 ورقةُ الرفض لا تُغلق قبل النجاح، والسببُ فيها");
  check(/const problem = await onReply\(text,/.test(inbox) && inbox.includes('if (problem) setFailure(problem); else { setText(""); setOffered([]); }'), "FR-REQ-063 والردُّ لا يُمسح قبل أن يصل");
  check((inbox.match(/useSheetKeys\(cardRef, onClose, busy\)/g) || []).length === 2 && inbox.includes('event.key === "Escape" && !lockedRef.current'),
    "FR-REQ-063 Escape والتركيزُ والنقرُ خارج الورقتين");
  check(inbox.includes("maxLength={REJECT_NOTE_LIMIT}") && inbox.includes("export const REJECT_NOTE_LIMIT = 400;"), "FR-REQ-063 سطرُ الرفض بحدّ الخادم 400");
  check(inbox.includes("if (seq !== loadSeq.current) return;") && inbox.includes("if (loadedScope.current !== scopeKey) setRows([]);") && !inbox.includes("setError(e.message); setRows([]);"),
    "FR-REQ-063 تعذّرُ القراءة لا يُفرغ البطاقات، والقراءاتُ متسلسلة");
  check(inbox.includes("inboxFacetCounts(items, { state: stateFilter, action: actionFilter, verdict: verdictFilter })") && inbox.includes("nameMatchesAsk(row.instructorName, parsedAsk.text)"),
    "FR-REQ-063 الأعدادُ والبحثُ من utils/inboxFacets");
  check((inbox.match(/withApplyBusyRetry\(\(\) => request\(`\/api\/instructor-requests\/\$\{row\.id\}\/apply`/g) || []).length === 2, "FR-REQ-063 التثبيتُ وبطاقةُ الإضافة يُعادان عند apply-busy");
  check(inbox.includes("onClick={() => { onNotified(current.id); setDone(list => [...list, current.id]); }}") && inbox.includes('`/api/instructor-requests/${row.id}/notified`'),
    "FR-REQ-061 الإبلاغُ يُسجَّل حين يضغط المنسّق رسالةَ واتساب، لا قبلها");

  const routes = read("src/server/routes/instructorRequestsRoutes.ts");
  check(routes.includes("if (!preview && !(await Repository.acquireScheduleApplyLease(applyLock, applyHolder)))") && routes.includes("if (!preview) await Repository.releaseScheduleApplyLease("),
    "FR-REQ-063 المعاينةُ لا تأخذ قفلَ الفصل");
  check(routes.includes("...(fixedAs ? { fixedAs } : {})") && routes.includes("...(writtenRow ? { fixedAs: fixedAsOf(writtenRow) } : {})"), "FR-REQ-060 القرارُ يسجّل ما كُتب فعلاً");
  const notifiedRoute = routes.slice(routes.indexOf('app.post("/api/instructor-requests/:id/notified"'));
  check(notifiedRoute.includes("requirePermission(7)") && notifiedRoute.includes('res.status(403)') && notifiedRoute.includes("setInstructorRequestDecisionNotified"), "FR-REQ-061 مسارُ الإبلاغ بصلاحية الشاشة 7 ونطاق الطلب");

  /* ── FR-REQ-064: حوافّ الخادم ─────────────────────────────────────────────── */
  const decide = routes.slice(routes.indexOf('app.post("/api/instructor-requests/:id/decide"'), routes.indexOf('app.post("/api/instructor-requests/:id/cancel-scheduled"'));
  check(decide.includes('code: "keep-item"') && decide.includes('code: "not-submitted"') && decide.includes("!item.decision?.fromSchedule"), "FR-REQ-064 لا قرارَ على «كما هو» ولا على طلبٍ لم يُرسل");
  const cancel = routes.slice(routes.indexOf('app.post("/api/instructor-requests/:id/cancel-scheduled"'), routes.indexOf('app.post("/api/instructor-requests/:id/reopen-fixed"'));
  check(cancel.includes("for (let attempt = 0; attempt < 3 && !saved; attempt += 1)") && cancel.includes("Repository.getInstructorRequest(stored.id)"), "FR-REQ-064 «إلغاء الموعد» يُسجَّل على أحدث نسخة");
  const issue = routes.slice(routes.indexOf('app.post("/api/instructor-requests/issue"'), routes.indexOf('app.get("/api/instructor-requests/send-log"'));
  check(issue.includes('if (held && held.status === "settled")') && issue.includes('status: "superseded"') && issue.includes("Repository.revokeShareLink(oldLink.id)"),
    "FR-REQ-064 جولةٌ جديدة تستبدل الطلبَ المنتهي وتوقف رابطه");
  const publicRoutes = read("src/server/routes/publicRequestRoutes.ts");
  const replyRoute = publicRoutes.slice(publicRoutes.indexOf('app.post("/api/public/request/:token/reply"'), publicRoutes.indexOf('app.post("/api/public/request/:token/check"'));
  check((replyRoute.match(/if \(!modeAllowsWrite\(linkMode\(resolved\.request\)\)\) \{ res\.status\(403\)/g) || []).length === 2, "FR-REQ-064 رابطُ العرض لا يردّ ولا يقبل البدائل");
  const ics = publicRoutes.slice(publicRoutes.indexOf('app.get("/api/public/request/:token/fixed/:itemId.ics"'), publicRoutes.indexOf('app.get("/r/:token"'));
  check(ics.includes('item?.decision?.state === "fixed"') && ics.includes("Number(row.AdInstructorId) !== Number(resolved.request.AdInstructorId)") && ics.includes("res.status(404)")
    && !/AdRoomCode|AdRoomHall|room:/.test(ics), "FR-REQ-060 ملفُّ ICS لموعدٍ مثبَّتٍ لصاحبه وحده، بلا مكان");
  check(publicRoutes.includes("decisions: decisionDigest(publicRequest as InstructorRequest)") && publicRoutes.includes("decisionNotifiedAt: undefined,"),
    "FR-REQ-060 القائمةُ من النسخة المجرّدة، ولحظةُ الإبلاغ لا تصل الأستاذ");
  const signer = read("src/server/core/instructorRequests.ts");
  const signerBody = signer.slice(signer.indexOf("export async function verifyRequestSigner"));
  check(signerBody.indexOf("if (!civilCheck.isValid)") < signerBody.indexOf("publicAttemptReserve(signScope"), "FR-REQ-064 الرقمُ المشوّه الصيغة لا يُعدّ محاولة");
  const workshop = read("src/components/Schedules.tsx");
  check(workshop.includes('days: (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const).filter(day => Boolean((form as any)[day]))'),
    "FR-REQ-064 أيامُ النموذج تُرسل مع الإضافة فتُكتب كما اختارها المنسّق");
  check(read("src/utils/requestHandoff.ts").includes("itemId: typeof value.itemId === \"string\""), "FR-REQ-064 التسليمُ يحمل هويّة البند");
  const page = read("src/server/pages/instructorRequestPage.ts");
  check(page.includes("function sinceHtml()") && page.includes('var SEEN_KEY="req-seen:"+TOKEN') && page.includes("/fixed/'+encodeURIComponent(d.itemId)+'.ics"),
    "FR-REQ-060 صفحةُ الطلب تعرض «ما تقرّر منذ آخر زيارة» و«أضف إلى تقويمي»");
  const card = read("src/server/pages/staffCardPage.ts");
  check(card.includes("function renderDecisions(d)") && card.includes('"card-seen:"+l.linkId') && read("src/server/routes/publicStaffRoutes.ts").includes("decisions: decisionDigest(request, 8).map(({ note: _note, ...entry }) => entry)"),
    "FR-REQ-060 والبطاقةُ الشخصية كذلك، بلا ملاحظةٍ نصّية");

  console.log(`\nRequest decisions & notify audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
