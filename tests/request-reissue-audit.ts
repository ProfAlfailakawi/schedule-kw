/**
 * ── إعادةُ فتح الطلبات تتبع الموعدَ الجديد ───────────────────────────────────
 *
 * البلاغ: بطاقةُ الأستاذ للفصل الثاني تعرض جدولَه وموعدَ الرغبات، ولا يظهر فيها
 * تبويبُ «طلب تعديل الجدول». السبب: طلباتٌ قديمةٌ في الفصل نفسه (من بطاقاتٍ حُذفت)
 * ماتت مواعيدُها، والإصدارُ يكتفي بوجودها فلا يفتح شيئاً، ويقول «مفتوحة من قبل».
 *
 * الشقُّ الأول سلوكيّ على القاعدة الخالصة، والثاني تدقيقُ مصدرٍ للتوصيل.
 */

import fs from "fs";
import path from "path";
import { cardEditsAfterSend, latestRequestByInstructor, reissueMove, requestLinkMove, sendActionFor, type SendAction } from "../src/utils/requestReissue";
import { retainRequestReservations } from "../src/utils/instructorRequestReservations";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* ── الحالاتُ الأربع ─────────────────────────────────────────────────────── */

check(reissueMove(undefined) === "fresh", "لا طلبَ له ← طلبٌ جديد");
check(reissueMove({ status: "sent" }) === "extend", "أُرسل ولم يردّ ← يأخذ الموعدَ الجديد، بلا طلبٍ ثانٍ");
check(reissueMove({ status: "submitted" }) === "keep", "أرسله الأستاذ ← يبقى، القرارُ عند القسم");
check(reissueMove({ status: "in-review" }) === "keep", "قيد المراجعة ← يبقى");
check(reissueMove({ status: "settled" }) === "fresh", "ثُبّت ← جولةٌ جديدة بطلبٍ جديد");
check(reissueMove({ status: "superseded" }) === "fresh", "استُبدل الجدول ← جولة رغبات جديدة مستقلة");
check(retainRequestReservations([{ requestId: "old", itemId: "item", instructorId: 1, collegeId: 1, sectionId: 1,
  courseId: 1, slots: [{ day: "fmonday", start: "09:00", end: "10:00" }], offeringRowIds: [] }],
  { id: "old", status: "superseded", items: [{ itemId: "item", action: "add", rowId: null }] } as any).length === 0,
"استبدال الجدول يحرّر حجوزات جولة الرغبات القديمة");

/* ── الأحدثُ يحكم ───────────────────────────────────────────────────────── */

const rows = [
  { AdInstructorId: 7, createdAt: "2026-10-20T10:00:00.000Z", tag: "new" },
  { AdInstructorId: 7, createdAt: "2026-09-01T10:00:00.000Z", tag: "old" },
  { AdInstructorId: 9, createdAt: "2026-09-05T10:00:00.000Z", tag: "only" },
];
const latest = latestRequestByInstructor(rows);
check(latest.get(7)?.tag === "new", "القراءةُ من الأحدث كانت تُبقي الأقدم؛ الآن يحكم الأحدث");
check(latestRequestByInstructor([...rows].reverse()).get(7)?.tag === "new", "مهما كان ترتيبُ القراءة");
check(latest.get(9)?.tag === "only" && latest.size === 2, "ولكل أستاذٍ طلبٌ واحد");

/* ── رابطُ الطلب ────────────────────────────────────────────────────────── */

const until = Date.parse("2026-10-27T21:00:00.000Z");
check(requestLinkMove(undefined, false, until) === "mint", "رابطٌ مفقود: لا بديل عن جديد");
check(requestLinkMove({ revoked: true, expiresAt: "2027-05-07T00:00:00.000Z" }, true, until) === "mint", "رابطٌ موقوف: جديد (ولا شيءَ حيّ يُوقف)");
check(requestLinkMove({ expiresAt: "2027-05-07T00:00:00.000Z" }, false, until) === "mint", "رابطٌ لا يُقرأ فعلاً: جديد");
check(requestLinkMove({ expiresAt: "2026-10-01T00:00:00.000Z" }, true, until) === "extend", "رابطٌ حيٌّ تنتهي صلاحيتُه قبل الموعد الجديد: يُمدَّد هو، لا يُستبدل ولا يُوقف");
check(requestLinkMove({ expiresAt: "2027-05-07T00:00:00.000Z" }, true, until) === "keep", "رابطٌ حيٌّ يبلغ الموعد يبقى — فلا يتغيّر ما في يد الأستاذ");

/* ── ماذا يصنع الإرسالُ بكل حالة؟ جدولٌ كاملٌ (حادثة 2026-11-11: بطاقةٌ «للعرض» رغم إرسالٍ خاص) ───────── */

type Kind = "group" | "picked" | "noted" | "individual";
const kinds: Record<Kind, { picking: boolean; individualOnly: boolean; onlyNoted: boolean }> = {
  group: { picking: false, individualOnly: false, onlyNoted: false },
  picked: { picking: true, individualOnly: false, onlyNoted: false },
  noted: { picking: true, individualOnly: false, onlyNoted: true },
  individual: { picking: false, individualOnly: true, onlyNoted: false },
};
const states = ["sent", "submitted", "in-review", "settled", "superseded"] as const;
/* ما يُتوقَّع من (حالة × نافذة × نوع إرسال) بصفة «تعديل». */
const expected = (status: typeof states[number], open: boolean, kind: Kind): SendAction => {
  if (status === "settled" || status === "superseded") return "fresh";
  if (status === "sent") return "extend";
  if (kind === "noted" || kind === "individual") return "reopen";
  if (kind === "picked" && !open) return "reopen";
  return "keep";
};
let tableOk = true, editsOk = true, viewOk = true;
for (const status of states) for (const open of [true, false]) for (const kind of Object.keys(kinds) as Kind[]) {
  const action = sendActionFor({ held: { status }, windowOpen: open, ...kinds[kind], reopening: false, mode: "edit" });
  if (action !== expected(status, open, kind)) { tableOk = false; console.log("  تباين:", status, open ? "مفتوحة" : "مغلقة", kind, action); }
  /* القاعدةُ الجوهرية: الإرسالُ الخاص (محدّدون/ملاحظات/استثناء) بصفة تعديل لا يترك البطاقة «للعرض» أبداً. */
  if (kind !== "group" && !cardEditsAfterSend(action, "edit", open)) { editsOk = false; console.log("  بطاقة عرضٍ بعد إرسالٍ خاص:", status, open, kind); }
  /* وبصفة العرض لا تُفتح كتابةٌ أبداً. */
  if (cardEditsAfterSend(sendActionFor({ held: { status }, windowOpen: open, ...kinds[kind], reopening: false, mode: "view" }), "view", open)) viewOk = false;
}
check(tableOk, "جدولُ (5 حالات × نافذة × 4 أنواع إرسال) يطابق المقرَّر");
check(editsOk, "كلُّ إرسالٍ خاصٍّ بتعديل يترك البطاقةَ قابلةً للتعديل في كل حالة ونافذة");
check(viewOk, "وإرسالُ «العرض» لا يفتح كتابةً في أيّ حالة");
check(cardEditsAfterSend(sendActionFor({ held: { status: "in-review" }, windowOpen: false, ...kinds.group, reopening: false, mode: "edit" }), "edit", false) === false,
  "الإرسالُ الجماعي لا يفتح نافذةً أُغلقت على من ينتظر القرار (قرارٌ مقصود) — يفتحها القسمُ لأستاذٍ بعينه");
check(sendActionFor({ held: { status: "in-review" }, windowOpen: false, ...kinds.picked, reopening: true, mode: "edit" }) === "reopen",
  "الأستاذةُ في مراجعةٍ ونافذتُها مغلقة منذ أكتوبر: إرسالٌ خاصٌّ اليومَ يُعيد فتح طلبها نفسه");
check(sendActionFor({ held: { status: "submitted" }, windowOpen: true, ...kinds.group, reopening: true, mode: "edit" }) === "fresh",
  "وإعادةُ الفتح الصريحة (reopen) بلا انتقاءٍ تُنشئ جولةً كما كانت");

/* ── التوصيلُ في الخادم ─────────────────────────────────────────────────── */

const server = readServerSource();
const repo = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
const publish = fs.readFileSync(path.join(process.cwd(), "src/components/SchedulePublish.tsx"), "utf8");
const issue = server.slice(server.indexOf('app.post("/api/instructor-requests/issue"'), server.indexOf("/* ── وارِدُ القسم"));

check(issue.includes("const already = latestRequestByInstructor(existing);") && !issue.includes("new Map(existing.map("),
  "الإصدارُ يقرأ أحدثَ طلبٍ لكل أستاذ");
check(issue.includes("const action = sendActionFor({ held,") && issue.includes('if (held && action === "keep") {'),
  "ولا يكتفي بوجود الطلب: يقرّر بحالته (جدولٌ واحدٌ يُختبر أعلاه)");
check(issue.includes('if (held && (action === "extend" || action === "reopen"))') && issue.includes("window: individualOnly ? held.window : { opensAt: startsLater ? opensAt : held.window?.opensAt || opensAt, closesAt: windowClosesAt }"),
  "والطلبُ القائم يأخذ الموعدَ الجديد");
/* لا يموت رابطٌ حيّ بإعادة الإرسال: يُعاد استعمالُه أو يُمدَّد؛ والإيقافُ بتبديلٍ صريحٍ من القسم وحده، بعد حفظ الطلب بالجديد. */
check(issue.includes("requestLinkMove(old, await shareLinkStillReadable(old)") && issue.includes("Repository.extendShareLinkExpiry(old.id, requestLinkExpiry())"),
  "ورابطُه الحيُّ يُعاد استعمالُه (ويُمدَّد إن لزم) بدل أن يُستبدل");
check(!issue.includes("requestLinkNeedsReplacing") && issue.includes("if (forceNewLink) {") && (issue.match(/revokeShareLink/g) || []).length === 1,
  "ولا يُوقف رابطٌ في الإصدار إلا بالتبديل الصريح (موضعٌ واحد)");
check(issue.indexOf("await Repository.saveInstructorRequest({\n        ...held,\n        linkId,") > -1
  && issue.indexOf("await Repository.revokeShareLink(supersededLinkId)") > issue.indexOf("await Repository.saveInstructorRequest({\n        ...held,\n        linkId,"),
  "ويُوقَف المبدَّلُ صراحةً بعد حفظ الطلب بالجديد، لا قبله");
check(issue.includes("وأُوقف ${linkTally.replaced} بتبديلٍ صريح من القسم") && issue.includes("ولم يُوقف أيّ رابط"),
  "وسجلُّ التدقيق يقول ما حدث للروابط: أُعيد استعمالها أو مُدّدت أو أُنشئت أو أُوقفت ولماذا");
const supersede = repo.slice(repo.indexOf("supersedeInstructorRequestsForScope: async"), repo.indexOf("المقترحات الدراسية"));
check(!supersede.includes("revokeShareLink("), "استبدالُ الجدول يُغلق الجولة ولا يُوقف رابطَ أستاذ (يرى «أُغلقت الجولة» لا «غير موجود»)");
check(repo.includes("extendShareLinkExpiry: async") && repo.includes("Number(a.status === \"superseded\") - Number(b.status === \"superseded\")"),
  "والرابطُ الواحد يحمل جولاتٍ متعاقبة: الجاريةُ تسبق المستبدَلة");
check(issue.includes("fresh: issued.filter(row => !row.reissued && !row.renewed).length"),
  "والعدُّ يفرّق الجديدَ عن المجدَّد");

const share = server.slice(server.indexOf('app.post("/api/share", requirePermission(7)'), server.indexOf('app.delete("/api/share/:id"'));
check(share.includes('if (kind === "staff") {') && share.includes("await Repository.revokeShareLink(old.id);"),
  "بطاقةٌ جديدةٌ تُوقف بطاقاتِ القسم السابقة في الفصل نفسه");
check(share.includes("if (isPersonalStaffLink(old)) {") && share.includes("Repository.setShareLinkRequestsCloseAt(old.id, requestsCloseAt)"),
  "والروابطُ الشخصيةُ لا تُوقف — وصلت الأساتذة — بل تأخذ الموعدَ الجديد");
check(share.includes("return { link, replaced };") && share.includes("res.status(201).json({ ...published.link, replaced: published.replaced });"), "ويُقال كم بطاقةً حلّت محلّها بعد إيقافها");
check(repo.includes("setShareLinkRequestsCloseAt: async (id: string, requestsCloseAt: string)"), "وللمستودع طريقٌ لتحديث الموعد");

/* ── اللوحة: بلا تلوّثٍ بصري ────────────────────────────────────────────── */

check(publish.includes("const shownLinks = showPast ? [...active, ...pastLinks] : active;"),
  "الروابطُ الموقوفة والمنتهية مطويّةٌ افتراضياً");
check(publish.includes('className="share-past-toggle"') && publish.includes("`السابقة (${"),
  "خلف سطرٍ واحد «السابقة (n)»");
check(publish.includes("وحلّ محلّ البطاقة السابقة."), "وخبرُ الإنشاء يقول إنها حلّت محلّ السابقة، في السطر نفسه");
check(!publish.includes("طلبات التعديل مفتوحة من قبل"),
  "ولا تُقال «مفتوحة من قبل» لطلباتٍ مات موعدُها");
check(publish.includes("جُدّد الموعد لـ") && publish.includes("طلباتهم عند القسم"),
  "بل يُعدّ المجدَّدُ والمنتظرُ كلٌّ باسمه");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
