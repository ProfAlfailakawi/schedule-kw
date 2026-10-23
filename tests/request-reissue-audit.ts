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
import { latestRequestByInstructor, reissueMove, requestLinkNeedsReplacing } from "../src/utils/requestReissue";

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
check(requestLinkNeedsReplacing(undefined, false, until), "رابطٌ مفقود يُستبدل");
check(requestLinkNeedsReplacing({ revoked: true, expiresAt: "2027-05-07T00:00:00.000Z" }, true, until), "رابطٌ موقوف يُستبدل");
check(requestLinkNeedsReplacing({ expiresAt: "2027-05-07T00:00:00.000Z" }, false, until), "رابطٌ لا يُقرأ يُستبدل");
check(requestLinkNeedsReplacing({ expiresAt: "2026-10-01T00:00:00.000Z" }, true, until), "رابطٌ ينتهي قبل الموعد الجديد يُستبدل");
check(!requestLinkNeedsReplacing({ expiresAt: "2027-05-07T00:00:00.000Z" }, true, until), "رابطٌ حيٌّ يبلغ الموعد يبقى — فلا يتغيّر ما في يد الأستاذ");

/* ── التوصيلُ في الخادم ─────────────────────────────────────────────────── */

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const repo = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
const publish = fs.readFileSync(path.join(process.cwd(), "src/components/SchedulePublish.tsx"), "utf8");
const issue = server.slice(server.indexOf('app.post("/api/instructor-requests/issue"'), server.indexOf("/* ── وارِدُ القسم"));

check(issue.includes("const already = latestRequestByInstructor(existing);") && !issue.includes("new Map(existing.map("),
  "الإصدارُ يقرأ أحدثَ طلبٍ لكل أستاذ");
check(issue.includes("const move = reissueMove(held);") && issue.includes('if (held && move === "keep")'),
  "ولا يكتفي بوجود الطلب: يقرّر بحالته");
check(issue.includes('if (held && move === "extend")') && issue.includes("window: { opensAt: startsLater ? opensAt : held.window?.opensAt || opensAt, closesAt: windowClosesAt }"),
  "والطلبُ القائم يأخذ الموعدَ الجديد");
check(issue.includes("requestLinkNeedsReplacing(heldLink, readable,") && issue.includes("await Repository.revokeShareLink(heldLink.id)"),
  "ورابطُه الميت يُستبدل ويُوقف القديم");
check(issue.includes("fresh: issued.filter(row => !row.reissued && !row.renewed).length"),
  "والعدُّ يفرّق الجديدَ عن المجدَّد");

const share = server.slice(server.indexOf('app.post("/api/share", requirePermission(7)'), server.indexOf('app.delete("/api/share/:id"'));
check(share.includes('if (kind === "staff") {') && share.includes("await Repository.revokeShareLink(old.id);"),
  "بطاقةٌ جديدةٌ تُوقف بطاقاتِ القسم السابقة في الفصل نفسه");
check(share.includes("if (isPersonalStaffLink(old)) {") && share.includes("Repository.setShareLinkRequestsCloseAt(old.id, requestsCloseAt)"),
  "والروابطُ الشخصيةُ لا تُوقف — وصلت الأساتذة — بل تأخذ الموعدَ الجديد");
check(share.includes("res.status(201).json({ ...link, replaced });"), "ويُقال كم بطاقةً حلّت محلّها");
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
