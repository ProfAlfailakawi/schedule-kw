/**
 * «رغبات الأساتذة» سجلٌّ نظيف، وتنبيهُ النشر بلا قاعة، وذكاءُ المستلمين (ملاحظات المالك 2026-11-14):
 *   R  حالةٌ هادئة لكل أستاذ: ثبّت · عدّل · لم يردّ · قيد المراجعة · للعرض فقط — من طلبه الأحدث وحده
 *   V  «العالق في العرض» يستحقّ «افتح التعديل»، ولا يستحقّه المُسوّى ولا مرحلة التدريب
 *   B  مواعيدُ بلا قاعة تُعدّ كما يحكم نموذجُ الموعد (قاعةٌ معلّقة = بلا قاعة)
 *   N  من يحتاج إرسالاً: لم يصله · لم يفتح · لم يردّ · عرضٌ فقط، والجملةُ بالعدد والسبب
 *   S  التوصيلُ ساكناً: السجلُّ في الوارد، والتنبيهُ في النشر لا يمنع، واقتراحُ المستلمين لا يتخطّى اختيار المنسّق
 */
import fs from "node:fs";
import { registryLatest, registryOpens, registryStatusOf, registryTally, suggestedDeadline, viewOnlyStuck, type RegistryRow } from "../src/utils/teacherRegistry";
import { hasRoomChosen, roomlessRows } from "../src/utils/roomlessRows";
import { needTally, needsSentence, sendNeed } from "../src/utils/publishNeeds";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const NOW = Date.parse("2026-11-14T09:00:00.000Z");
const open = { opensAt: "2026-11-10T00:00:00.000Z", closesAt: "2026-11-20T00:00:00.000Z" };
const closed = { opensAt: "2026-10-20T00:00:00.000Z", closesAt: "2026-10-28T00:00:00.000Z" };
const row = (patch: Partial<RegistryRow> & { items?: any[] }): RegistryRow => ({
  AdInstructorId: 1, status: "sent", linkMode: "edit", createdAt: "2026-11-01T00:00:00.000Z", window: open, ...patch,
} as RegistryRow);

/* ── R ── */
check(registryStatusOf(row({ status: "sent" })) === "silent", "R أُرسل ولم يرسل ← لم يردّ");
check(registryStatusOf(row({ status: "submitted", items: [{ action: "change" }] })) === "edited", "R أرسل بتعديل ← عدّل");
check(registryStatusOf(row({ status: "submitted", items: [{ action: "keep" }, { action: "keep" }] })) === "confirmed", "R أرسل «كما هو» ← ثبّت");
check(registryStatusOf(row({ status: "submitted", items: [{ action: "keep" }], note: "ملاحظة" })) === "edited", "R ملاحظةٌ عامة تجعله «عدّل» لا «ثبّت»");
check(registryStatusOf(row({ status: "in-review", items: [{ action: "change" }] })) === "review", "R القسمُ يقرّر ← قيد المراجعة");
check(registryStatusOf(row({ status: "settled", items: [{ action: "change" }] })) === "edited" && registryStatusOf(row({ status: "settled", items: [] })) === "confirmed", "R المُسوّى يبقى «عدّل» أو «ثبّت» بما أرسله");
check(registryStatusOf(row({ linkMode: "view" })) === "viewOnly", "R بطاقة العرض ← للعرض فقط");
check(registryStatusOf(row({ linkMode: "ta" })) === null && registryStatusOf(row({ status: "superseded" })) === null, "R التدريب والمستبدَل خارج السجلّ");
const history = [
  row({ AdInstructorId: 5, createdAt: "2026-10-01T00:00:00.000Z", status: "settled", items: [] }),
  row({ AdInstructorId: 5, createdAt: "2026-11-05T00:00:00.000Z", status: "sent" }),
  row({ AdInstructorId: 6, status: "submitted", items: [{ action: "change" }] }),
];
check(registryLatest(history).length === 2 && registryLatest(history).find(entry => entry.AdInstructorId === 5)?.status === "sent", "R طلبٌ واحدٌ لكل أستاذ: الأحدثُ يحكم مهما تعدّدت الإرسالات");
const tally = registryTally(history);
check(tally.silent === 1 && tally.edited === 1, "R العدّ من الأحدث وحده", tally);
check(registryOpens({ linkOpenDays: { "2026-11-02": 2, "2026-11-03": 1 }, linkLastOpenAt: "2026-11-03T08:00:00.000Z" }).count === 3
  && registryOpens({ linkOpenedAt: "2026-11-01T00:00:00.000Z" }).count === 1 && registryOpens({}).count === 0, "R مرّاتُ فتح الرابط");

/* ── V ── */
check(viewOnlyStuck(row({ status: "in-review", window: closed }), NOW), "V قيد المراجعة ونافذتُها مغلقة (حالةُ حادثة 2026-11-11) ← افتح التعديل");
check(viewOnlyStuck(row({ status: "sent", window: closed }), NOW), "V لم يردّ ونافذتُه مغلقة ← افتح التعديل");
check(viewOnlyStuck(row({ linkMode: "view", window: open }), NOW), "V بطاقةُ عرض والقسمُ يريد التعديل ← افتح التعديل");
check(!viewOnlyStuck(row({ status: "submitted", window: open }), NOW), "V نافذتُه مفتوحة ← لا حاجة");
check(!viewOnlyStuck(row({ status: "settled", window: closed }), NOW) && !viewOnlyStuck(row({ linkMode: "ta", window: closed }), NOW), "V المُسوّى والتدريب لا يُعرض لهما");
check(!viewOnlyStuck(row({ status: "in-review", window: closed, individualException: { opensAt: "2026-11-13T00:00:00.000Z", closesAt: "2026-11-30T00:00:00.000Z", grantedAt: "x", grantedBy: "x", reason: "x" } }), NOW), "V استثناءٌ فرديٌّ مفتوح ← ليست عالقة");
check(suggestedDeadline(NOW) === "2026-11-17T23:59" && /^\d{4}-\d{2}-\d{2}T23:59$/.test(suggestedDeadline()), "V الموعدُ المقترح: بعد ثلاثة أيام آخرَ اليوم بتوقيت الكويت", suggestedDeadline(NOW));

/* ── B ── */
check(roomlessRows([{ roomId: 4 }, { AdRoomCode: "A1", AdRoomHall: "101" }, { AdRoomCode: "A1" }, {}, { roomId: 7, locationStatus: "PENDING_ROOM" }, { roomId: 0 }]).length === 4,
  "B قاعةٌ معرَّفة أو رمزٌ وقاعةٌ معاً = لها قاعة؛ والباقي وPENDING_ROOM بلا قاعة");
check(hasRoomChosen({ roomId: "12" }) && !hasRoomChosen({ roomId: "", AdRoomCode: "", AdRoomHall: "" }), "B الحكمُ نفسُ نموذج الموعد");

/* ── N ── */
const heldEdit = (state: "sent" | "opened" | "replied", extra: object = {}) => ({ state, mode: "edit", ...extra });
check(sendNeed([], "edit") === "new" && sendNeed([], "view") === "new", "N لم يصله شيء");
check(sendNeed([heldEdit("sent")], "edit") === "unopened", "N لم يفتح");
check(sendNeed([heldEdit("opened")], "edit") === "unreplied", "N فتح ولم يردّ");
check(sendNeed([heldEdit("replied", { windowOpen: true })], "edit") === null, "N ردّ وبطاقتُه سليمة ← لا يُعاد له شيء");
check(sendNeed([heldEdit("replied", { windowOpen: false, status: "in-review" })], "edit") === "viewOnly", "N ردّ ونافذتُه أُغلقت والقسمُ لم يُنهِ ← يحتاج فتحَ التعديل");
check(sendNeed([heldEdit("replied", { windowOpen: false, status: "settled" })], "edit") === null, "N ثُبّت طلبُه ← لا حاجة");
check(sendNeed([{ state: "sent", mode: "view" }], "edit") === "viewOnly" && sendNeed([{ state: "sent", mode: "view" }], "view") === null, "N عرضٌ فقط يحتاج ✏️ لا 👁️");
check(sendNeed([heldEdit("sent"), heldEdit("replied", { windowOpen: true })], "edit") === null, "N سجلّاه في موقعين: الأكثرُ تقدّماً يحكم");
const sentence = needsSentence(12, needTally([...Array(5).fill("unopened"), ...Array(3).fill("unreplied"), "viewOnly", "viewOnly", "new", "new"]));
check(sentence === "سيصل إلى 12 أستاذاً: 2 لم تصلهم بعد · 5 لم يفتحوا · 3 لم يردّوا · 2 للعرض فقط" || /^سيصل إلى 12 /.test(sentence) && sentence.includes("5 لم يفتحوا") && sentence.includes("3 لم يردّوا"),
  "N الجملةُ بالعدد والسبب", sentence);
check(needsSentence(1, needTally(["unopened"])).includes("1 لم يفتح") && !/\d[٠-٩]|[٠-٩]/.test(sentence), "N المفردُ والأرقامُ لاتينية");

/* ── S ── */
const read = (p: string) => fs.readFileSync(p, "utf8");
const inbox = read("src/components/InstructorInbox.tsx");
const registry = read("src/components/inbox/TeacherRegistry.tsx");
const publish = read("src/components/SchedulePublish.tsx");
const picker = read("src/components/PublishRecipientPicker.tsx");
check(inbox.includes("<TeacherRegistry rows={pulseRows as any}") && inbox.includes('import TeacherRegistry from "./inbox/TeacherRegistry";'), "S السجلُّ في الوارد بعد نبض الكروت");
check(registry.includes('fetch("/api/instructor-requests/issue"') && registry.includes('mode: "edit", instructorIds: [row.AdInstructorId]') && registry.includes("افتح التعديل"),
  "S «افتح التعديل» إرسالٌ خاصٌّ بتعديلٍ لأستاذٍ بعينه (الرابطُ نفسه، ويُسجَّل في طلبه)");
check(registry.includes("/api/instructor-requests/track") && registry.includes("DnaTimeline"), "S الحركةُ كاملةً من مسار الأساتذة، عبر كل الإرسالات");
check(publish.includes('data-testid="publish-roomless"') && publish.includes("بلا قاعة") && publish.includes("اعرضها") && publish.includes("النشرُ متاح"), "S تنبيهُ «بلا قاعة» مع «اعرضها» ويقول إنه لا يمنع");
check(!/disabled=\{[^}]*roomless/.test(publish), "S ولا يعطّل زرَّ النشر أبداً (تنبيهٌ ناعم)");
check(picker.includes("touched.current") && picker.includes("من يحتاج إرسالاً") && publish.includes("needsReady={follow !== null}"), "S القائمةُ تبدأ بمن يحتاج، واختيارُ المنسّق يغلب");
check(publish.includes("موعد الإرسال السابق") && publish.includes('data-testid="deadline-hint"'), "S الموعدُ المقترح ظاهرٌ ومعلَّل");
check(!/AdRoomCode|roomName|buildingName/.test(registry) && !/room:/.test(registry), "S السجلّ لا يعرض قاعةً");

console.log(`\nTeacher registry audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
