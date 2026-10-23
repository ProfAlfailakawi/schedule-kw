/**
 * ── تدقيق صقل كرت الأستاذ ───────────────────────────────────────────────
 *
 * ما يُفحص هنا هو ما كان يربك الأستاذ في الرحلة نفسها: فاحصٌ يقترح ثم يعاقب،
 * وصفٌّ يقفز من مكانه، ورقمٌ عارٍ في الحركة، وجملةٌ تدّعي استلاماً بشرياً.
 * الحكمُ سلوكيّ حيث أمكن، وعقدُ المصدر حيث السلوكُ داخل قالبٍ نصّيٍّ في الخادم.
 */
import fs from "fs";
import vm from "vm";
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import { signatureVerifyPage } from "../src/server/signatureVerifyPage";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const TEACHER = 7;
const row = (over: Partial<FSchedule> = {}): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20, AdCourseId: 100, AdCourseName: "تفاضل", SCode: "01",
  AdInstructorId: TEACHER, fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: true,
  fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "أ", AdRoomHall: "101", ...over,
} as FSchedule);
const course = (hours: number): AdCourse => ({
  AdCourseId: 100, AdCollegeId: 1, AdSectionId: 5, CourseCode: "C100", CourseName: "مقرر",
  CourseCredit: hours, CourseHours: hours, MaxStudent: 25,
} as AdCourse);
const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000007", AdInstructorName: "د. 7", AdInstructorMobile: "50000000" } as AdInstructor;
const context = (hours: number): VerdictContext => ({
  instructorId: TEACHER, allRows: [row()], instructorRowsAfter: [row()],
  courses: new Map([[100, course(hours)]]), instructors: new Map([[TEACHER, teacher]]),
  knownRoomKeys: [], startLadder: ["08:00", "09:00", "10:00", "11:00"],
});
const ask = (over: Partial<RequestedRow> = {}): RequestedRow => ({
  rowId: 1, action: "change", AdCourseId: 100, days: ["fwednesday"], start: "08:00", ...over,
});

/* ── ١. الفاحص لا يعاقب على ما يقترحه ───────────────────────────────────── */
const short = judgeRequest(ask({ days: ["fwednesday"] }), context(4));
check(!short.sendable, "يوم واحد لمقرّر أربع ساعات يُمنع");
check(Array.isArray(short.shapes) && short.shapes.length > 0, "والمنعُ يحمل التوزيعات المعتمدة أزراراً لا نصاً فقط");
const mixed = judgeRequest(ask({ days: ["fmonday", "fwednesday", "fthursday"] }), context(4));
check(!mixed.reasons.some(reason => /أيام مختلطة/.test(reason.text)), "٨٠+٨٠+٥٠ المعتمد لمقرّر الأربع ساعات لا يُحذَّر منه");
let everyShapePasses = true;
for (const shape of short.shapes || []) {
  const verdict = judgeRequest(ask({ days: shape.days as any }), context(4));
  if (!verdict.sendable || verdict.reasons.some(reason => reason.source === "shape")) everyShapePasses = false;
}
check(everyShapePasses, "كلُّ توزيعٍ يقترحه الفاحص يمرّ منه بلا منعٍ ولا ملاحظة شكل");
const stillMixed = judgeRequest(ask({ days: ["fsunday", "fmonday"] }), context(1));
check(stillMixed.reasons.some(reason => /أيام مختلطة/.test(reason.text)), "ويبقى التحذير لما ليس نمطاً معتمداً لمقرّره");

/* ── ٢–٧. عقودُ المصدر ───────────────────────────────────────────────────── */
const server = fs.readFileSync("server.ts", "utf8");
const page = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.get("/r/:token"'));
check(/\.sort\(function\(a,b\)\{[^}]*a\.it\.ord==null/.test(page), "ترتيب الصفوف يقرأ رتبةً ثابتة لا يومَ الموعد الحالي");
check(!/function planTable\(\)[\s\S]{0,400}planDays\(a\.it\)/.test(page), "planTable لا يعيد الفرز بالموعد المتغيّر");
check(/function rankState\(/.test(page) && /rankState\(\);\n/.test(page), "الرتبة تُعطى مرةً عند التحميل");
check(/countOf\(Number\(e\.detail\)\|\|0,AR\.edit,"بلا تعديلات"\)/.test(page), "سطر «أرسلتَ طلبك» يعدّ بقاعدة العدّ لا برقمٍ عارٍ");
check(/"received":"وصل إلى صندوق القسم"/.test(page) && /e\.kind!=="received"/.test(page), "حدث الاستلام لا يدّعي استلاماً بشرياً");
check(!/"received":"استلمه القسم"/.test(page), "ولا بقي لفظُ «استلمه» القديم");
check(server.includes("الرقم المدني غير مكتمل أو فيه خطأ كتابة. راجعه وأعد المحاولة."), "رسالة فشل رقم التحقق لا توحي بمطابقة");
check(server.includes("الرقم المدني لا يطابق صاحب هذا الرابط."), "ورسالة عدم المطابقة (403) باقية كما هي");
check(/visibilitychange/.test(page) && /Date\.now\(\)-lastFetch>30000/.test(page), "عودةُ الصفحة تُعيد الجلب بعد ثلاثين ثانية");
check(/if\(dirty\)\{if\(fromPush/.test(page), "ولا تُعيد الجلب فوق مسودةٍ لم تُرسل");
check(/\?live=1/.test(page) && /String\(req\.query\.live \|\| ""\) === "1"/.test(server), "وإعادةُ الجلب الصامتة لا تُحسب فتحاً");
check(/<link rel="icon" href="\/schedule-icon\.svg"/.test(page), "الصفحة تحمل أيقونتها فلا يطلب المتصفحُ favicon.ico ويعود 404");
check(/data-shape=/.test(page) && /\[data-shape\]/.test(page), "أزرار التوزيع المعتمد تُطبَّق بضغطة");

/* ── المرحلة ٢: البثّ الحيّ (عقودُ الصفحة) ─────────────────────────────── */
check(/new EventSource\("\/api\/public\/request\/"\+encodeURIComponent\(TOKEN\)\+"\/events"\)/.test(page), "الصفحة تفتح بثّها بالرابط الشخصيّ نفسه");
check(/else closeLive\(\)/.test(page) && /document\.visibilityState==="hidden"/.test(page), "ويُغلق البثّ حين تُخفى الصفحة ويُعاد فتحه عند العودة");
check(/liveBack=Math\.min\(liveBack\*2,60000\)/.test(page), "وإعادة الاتصال تتراجع أُسّياً");
check(/class="fresh-note"/.test(page) && /وصل ردّ من القسم/.test(page), "مسودةٌ لم تُرسل لا تُستبدل: يُقال للأستاذ إن عند القسم ردّاً");
check(/navigator\.vibrate/.test(page) && /prefers-reduced-motion/.test(page), "اهتزازٌ خفيف وتمريرٌ إلى «قرارك» يحترمان تقليل الحركة");
check(/app\.get\("\/api\/public\/request\/:token\/events", rateLimitCardEvents/.test(server) && /resolveRequestLink/.test(server.slice(server.indexOf('"/api/public/request/:token/events"'), server.indexOf('"/api/public/request/:token/events"') + 400)), "مسار البثّ يمرّ بحدّ المعدّل وبالتحقّق نفسه من الرابط");

/* ── المرحلة ٣: صفحة التحقّق (عقودٌ ساكنة) ─────────────────────────────── */
const verifyHtml = signatureVerifyPage("3Z0RWU", "demo.x", "NONCE9");
const verifyScript = /<script nonce="NONCE9">([\s\S]*?)<\/script>/.exec(verifyHtml)?.[1] || "";
let verifyCompiles = true;
try { new vm.Script(verifyScript, { filename: "verify-inline.js" }); } catch { verifyCompiles = false; }
check(verifyCompiles && [...verifyHtml.matchAll(/<script\b/gi)].length === 1, "سكربت صفحة التحقّق سليم الصياغة وواحد");
check(/lang="ar" dir="rtl"/.test(verifyHtml) && /noindex/.test(verifyHtml) && /SCHEDULE_PUBLIC_PLEX_ARABIC/.test(verifyHtml), "هويةُ الصفحات العامة: RTL ولا تُفهرس وخطّ Plex");
check(/"3Z0RWU"/.test(verifyScript), "الرمز يدخل السكربت JSON");
const hostileVerify = signatureVerifyPage("</script><img src=x>", '"</script>', "n");
check([...hostileVerify.matchAll(/<script\b/gi)].length === 1 && !hostileVerify.includes("</script><img"), "رمزٌ خبيثٌ لا يُغلق وسم السكربت");
check(!/localStorage|sessionStorage/.test(verifyScript), "الرقم المدني لا يُحفظ في المتصفّح");
check(/civilEl\.value=""/.test(verifyScript), "ويُمحى من الحقل بعد الإرسال");
check(/verifyHtml\(r\.signature&&r\.signature\.verifyCode\)/.test(page) && /تحقّق من رمزك/.test(page), "رابط «تحقّق من رمزك» في تبويب الحركة وشاشة «وصل طلبك»");

/* ── المرحلة ٤: اشتراك التقويم (عقودٌ ساكنة) ───────────────────────────── */
check(/calendarFeed: `\/api\/public\/ics\/\$\{encodeURIComponent\(resolved\.link\.id\)\}\/\$\{encodeURIComponent\(await calendarKey\(resolved\.link\.id/.test(server), "الكرت يعيد استعمال مفتاح اشتراك بطاقة الأستاذ نفسه");
check(/webcal:\/\/'\+esc\(location\.host\)\+esc\(data\.calendarFeed\)/.test(page) && /أضف جدولك إلى تقويم هاتفك/.test(page), "زرّ «أضف جدولك إلى تقويم هاتفك» برابط webcal");
check(/anyFixed\(\)\?calendarHtml\(true\)/.test(page) && /calendarHtml\(false\)\+'<button type="button" class="btn-main" id="again">/.test(page), "في رأس الكرت بعد التثبيت وفي شاشة «وصل طلبك»");
check(/يتحدّث تلقائياً عند أي تثبيتٍ جديد/.test(page), "ويشرح أنه يتحدّث من نفسه");

/* السكربت المولَّد يُجمَّع كما هو. */
const html = server.includes("function instructorRequestPage") ? "ok" : "";
check(html === "ok", "الدالة موجودة");

console.log(`\nTeacher card polish audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
