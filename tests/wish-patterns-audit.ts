/**
 * ── «توقّع الرغبات»: الاستخراج والتجميع (منطقٌ خالص) والتوصيل الساكن ──
 *   W1 فترةُ اليوم بحدود الوارد (قبل 12:00 صباح، حتى 15:00 ظهر، بعدها مساء).
 *   W2 «أبقِه» لا يُقرأ أبداً، وغير المُرسَل (sent/superseded) ولا رابطُ العرض.
 *   W3 النمطُ المتكرر فصلان مختلفان على الأقل، ومرّتان في فصلٍ واحد لا تكفيان.
 *   W4 «تركه» من «كان»، و«إليه» من الفقرات؛ والحذفُ تركٌ فقط، والإضافةُ إليه فقط.
 *   W5 الترتيب والسقف (3 أنماط)، والنسبةُ من الفصول المرصودة، وفصولٌ خارج النافذة لا تُقرأ.
 *   W6 آخرُ أربعة فصولٍ أقدمَ من الجاري.
 *   W7 توصيلٌ ساكن: حارسُ النطاق، للقراءة فقط، لا مخرجَ للأستاذ، ذاكرةٌ بسياق الجلسة التجريبية.
 */
import fs from "fs";
import { aggregateWishPatterns, observeItem, pastTermIds, WISH_MAX_PATTERNS, WISH_MIN_TERMS, type WishRequestLike } from "../src/utils/wishPatterns";
import { periodOfStart } from "../src/utils/requestsAsk";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const item = (over: any = {}): any => ({
  rowId: 1, action: "change", before: { courseId: 10, courseName: "رياضة", days: "الأحد · الثلاثاء", time: "08:00 – 09:30" },
  slots: [{ day: "fmonday", start: "13:00", end: "14:30" }], ...over,
});
const req = (term: number, items: any[], over: any = {}): WishRequestLike =>
  ({ status: "settled", AdInstructorId: 1, AdTermId: term, items, ...over } as any);

check(periodOfStart("11:59") === "morning" && periodOfStart("12:00") === "noon" && periodOfStart("14:59") === "noon" && periodOfStart("15:00") === "evening", "W1 حدود الفترات 12:00 و15:00");

{
  const keep = observeItem(item({ action: "keep" }), 1, 5);
  check(keep === null, "W2 «أبقِه» لا يُقرأ");
  const rows = aggregateWishPatterns([
    req(1, [item({ action: "keep" })]), req(2, [item({ action: "keep" })]),
    req(1, [item()], { status: "sent" }), req(2, [item()], { status: "superseded" }), req(2, [item()], { linkMode: "view" }),
  ], [2, 1]);
  check(rows.byInstructor.size === 0, "W2 لا أنماط من «أبقِه» ولا من غير المُرسَل ولا العرض", [...rows.byInstructor]);
  check(rows.heat.fsunday.morning === 0, "W2 الخريطةُ لا تعدّ ما لم يُقرأ");
}

{
  const obs = observeItem(item(), 1, 5)!;
  check(obs.away.length === 2 && obs.away.every(c => c.period === "morning") && obs.away.map(c => c.day).join() === "fsunday,ftuesday", "W4 «تركه» من أيام «كان» وفترة بدايته", obs.away);
  check(obs.to.length === 1 && obs.to[0].day === "fmonday" && obs.to[0].period === "noon", "W4 «إليه» من الفقرة", obs.to);
  const del = observeItem(item({ action: "delete", slots: undefined }), 1, 5)!;
  check(del.away.length === 2 && del.to.length === 0, "W4 الحذفُ تركٌ فقط");
  const add = observeItem({ rowId: null, action: "add", after: { courseId: 11, courseName: "فيزياء" }, slots: [{ day: "fthursday", start: "16:00", end: "17:30" }] } as any, 1, 5)!;
  check(add.away.length === 0 && add.to[0].period === "evening" && add.courseId === 11, "W4 الإضافةُ «إليه» فقط", add);
  const multi = observeItem(item({ slots: [{ day: "fsunday", days: ["fsunday", "fwednesday"], start: "09:00", end: "10:00" }] }), 1, 5)!;
  check(multi.to.length === 2, "W4 فقرةٌ بعدة أيام", multi.to);
}

check(WISH_MIN_TERMS === 2, "W3 العتبةُ ثابتٌ واحد = 2");
{
  const one = aggregateWishPatterns([req(1, [item(), item()])], [1, 2]);
  check(one.byInstructor.size === 0, "W3 مرّتان في فصلٍ واحد ليستا نمطاً");
  const two = aggregateWishPatterns([req(1, [item()]), req(2, [item()])], [2, 1]);
  const hints = two.byInstructor.get(1)!;
  check(Boolean(hints) && hints.patterns.every(p => p.terms === 2 && p.observed === 2), "W3 فصلان مختلفان = نمط، والنسبة 2/2", hints);
  const mixed = aggregateWishPatterns([req(1, [item()]), req(2, [item({ action: "keep" })]), req(3, [item()])], [3, 2, 1]);
  check(mixed.byInstructor.get(1)!.patterns[0].terms === 2 && mixed.byInstructor.get(1)!.observed === 3, "W5 النسبةُ 2 من 3 فصولٍ مرصودة (الفصلُ بلا تغيير يُرصد)", mixed.byInstructor.get(1));
}

{
  /* أربع خاناتٍ متكررة: يُقتصر على ثلاث، الأكثرُ فصولاً أولاً ثم «تركه» قبل «إليه» ثم الأيام. */
  const a = item({ before: { courseId: 10, courseName: "أ", days: "الأحد", time: "08:00 – 09:00" }, slots: [{ day: "fmonday", start: "13:00", end: "14:00" }] });
  const b = item({ before: { courseId: 12, courseName: "ب", days: "الخميس", time: "16:00 – 17:00" }, slots: [{ day: "ftuesday", start: "08:00", end: "09:00" }] });
  const agg = aggregateWishPatterns([req(1, [a, b]), req(2, [a, b]), req(3, [a])], [3, 2, 1]);
  const h = agg.byInstructor.get(1)!;
  check(h.patterns.length === WISH_MAX_PATTERNS && WISH_MAX_PATTERNS === 3, "W5 السقف ثلاثة أنماط", h.patterns);
  check(h.patterns[0].terms === 3 && h.patterns[0].kind === "away" && h.patterns[0].day === "fsunday", "W5 الأكثر فصولاً أولاً، و«تركه» قبل «إليه»", h.patterns[0]);
  check(h.patterns[0].courseIds.join() === "10", "W5 المقررُ المعنيّ", h.patterns[0]);
  check(h.lines.length >= 1 && h.lines[0].courseId === 10 && h.lines[0].from?.day === "fsunday" && h.lines[0].to?.day === "fmonday", "W5 سطرُ المقرر: من ← إلى", h.lines);
  const outside = aggregateWishPatterns([req(1, [a]), req(2, [a]), req(9, [a])], [2, 1]);
  check(outside.byInstructor.get(1)!.patterns[0].observed === 2, "W5 فصلٌ خارج النافذة لا يُقرأ");
}

{
  const terms = [
    { AdTermId: 1, AdTermName: "الفصل الأول 2024/2025" }, { AdTermId: 2, AdTermName: "الفصل الثاني 2024/2025" },
    { AdTermId: 3, AdTermName: "الفصل الأول 2025/2026" }, { AdTermId: 4, AdTermName: "الفصل الثاني 2025/2026" },
    { AdTermId: 5, AdTermName: "الفصل الأول 2026/2027" }, { AdTermId: 6, AdTermName: "الفصل الثاني 2026/2027" },
  ];
  check(pastTermIds(terms, 5).join() === "4,3,2,1", "W6 الأقدمُ من الجاري، الأحدثُ أولاً", pastTermIds(terms, 5));
  check(pastTermIds(terms, 6).join() === "5,4,3,2", "W6 سقفُ أربعة فصول");
  check(pastTermIds(terms, 1).length === 0 && pastTermIds(terms, 99).length === 0, "W6 لا ماضيَ ← فارغ");
}

/* W7 — توصيلٌ ساكن */
const server = fs.readFileSync("src/server/wishHints.ts", "utf8");
const publish = fs.readFileSync("src/server/publishCardsRoutes.ts", "utf8");
const component = fs.readFileSync("src/components/inbox/WishPatterns.tsx", "utf8");
const route = server.slice(server.indexOf("app.get(\"/api/instructor-requests/history-hints\""));
check(/app\.get\("\/api\/instructor-requests\/history-hints", requirePermission\(7\)/.test(server), "W7 المسارُ بإذن القسم (7)");
check(/isScopeAllowed\(req, collegeId, sectionId\)/.test(route) && route.indexOf("isScopeAllowed") < route.indexOf("memo.get"), "W7 حارسُ النطاق قبل أي قراءة");
check(!/app\.(post|put|patch|delete)\(/.test(server), "W7 للقراءة فقط");
check(!/saveInstructorRequest|createInstructorRequest|broadcastNotify|pushHooks|wa\.me|sendLog/.test(server), "W7 لا كتابةَ ولا إرسالَ");
check(/currentDemoSessionId\(\)/.test(server) && /req\.userId/.test(server), "W7 مفتاحُ الذاكرة بالجلسة التجريبية والمستخدم");
check(/WISH_LAST_TERMS/.test(server) && /WISH_HINT_MAX_INSTRUCTORS/.test(server), "W7 السقوف");
check(!/AdInstructorMobile|CivilId|civil|AdRoomCode|roomCandidates|reservedRoom/i.test(server), "W7 لا جوّالَ ولا رقمَ مدنياً ولا قاعة في الرد");
check(publish.includes("registerWishHintsRoutes(app)"), "W7 المسارُ مسجّل");
const publicSources = ["src/server/pages/instructorRequestPage.ts", "src/server/routes/publicRequestRoutes.ts"].map(f => fs.readFileSync(f, "utf8")).join("\n");
check(!/wishHints|wishPatterns|history-hints/.test(publicSources), "W7 لا شيءَ منه في صفحة الأستاذ ولا مساره العام");
check(/putOpenRow\(/.test(component) && /\/FSchedule\/Index/.test(component), "W7 «افتح الموعد» بنقل الوارد نفسه (putOpenRow)");
check(/CourseTags/.test(component) && /PersonChips/.test(component), "W7 وسومُ المقرر والشخص");

{
  /* الورقةُ فوق نافذة النشر (.share-backdrop z-index:500)، وإلا فُتحت خلفها فلا تُرى؛ والأرقامُ لاتينية كبقية الشاشات. */
  const css = fs.readFileSync("src/styles/65-wish-patterns.css", "utf8");
  const publish = fs.readFileSync("src/styles/09-details.css", "utf8");
  const publishZ = Number(publish.match(/\.share-backdrop\{[^}]*z-index:(\d+)/)?.[1] || 0);
  const wishZ = Number(css.match(/\.wish-layer\{[^}]*z-index:(\d+)/)?.[1] || 0);
  check(publishZ > 0 && wishZ > publishZ, `W9 طبقةُ ورقة التوقّع (${wishZ}) فوق نافذة النشر (${publishZ})`);
  const component = fs.readFileSync("src/components/inbox/WishPatterns.tsx", "utf8");
  check(component.includes('toLocaleString("ar-KW-u-nu-latn")') && !component.includes('"ar-EG"'), "W9 الأرقامُ لاتينية كبقية الشاشات");
}

{
  /* بذرةُ التاريخ التجريبي: بيئةٌ تجريبية فحسب، لقسم القصة، وتُستدعى بعد بقية البذور. */
  const seed = fs.readFileSync("src/server/demoPreviousTermSeed.ts", "utf8");
  const auth = fs.readFileSync("src/server/routes/authRoutes.ts", "utf8");
  const body = seed.slice(seed.indexOf("export async function seedDemoWishHistory"), seed.indexOf("/** نهايةُ موعدٍ يبدأ عند"));
  check(body.includes("if (!Repository.isDemoRequest()) return;") && body.includes("status: \"settled\""), "W10 بذرةُ تاريخ الرغبات للبيئة التجريبية وحدها، بطلباتٍ مثبَّتة");
  check(auth.includes('run("wish history", () => seedDemoWishHistory(') && auth.indexOf('run("wish history"') > auth.indexOf('run("other departments"'), "W10 تُستدعى بعد بذور الأقسام الأخرى");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
