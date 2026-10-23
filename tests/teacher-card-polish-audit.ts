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
import { pickPreviousRequest } from "../src/utils/previousTermRequest";
import { REQUEST_REPLAY_SCRIPT } from "../src/server/requestReplayScript";
import { signatureVerifyPage } from "../src/server/signatureVerifyPage";
import { learnCourseNature, habitualBlockMinutes } from "../src/utils/courseNature";
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
/* شعبةٌ تُدرَّس يوماً واحداً بلقاءٍ ممتدّ: أوّلُ الخيارات أن تبقى يوماً واحداً بطولها، وهو يمرّ. */
const labRow = row({ fmonday: false, fwednesday: true, fthursday: false, fstarttime: "08:00", fendtime: "12:00" });
const labContext = { ...context(4), allRows: [labRow], instructorRowsAfter: [labRow] };
const labSplit = judgeRequest(ask({ days: ["fmonday", "fwednesday"] }), labContext);
check(!labSplit.sendable && labSplit.shapes?.[0]?.days.join() === "fwednesday" && /يوم واحد كما هو الآن/.test(labSplit.shapes?.[0]?.label || ""), "مختبرٌ يومي جُعل يومين: أوّلُ الخيارات «يوم واحد كما هو الآن» لا نمطُ المحاضرات");
const labKept = judgeRequest(ask({ days: labSplit.shapes?.[0]?.days as any || [] }), labContext);
check(labKept.sendable && labKept.computedEnd === "12:00", "وتطبيقُه يمرّ ويبقى طولُ اللقاء أربع ساعات");
const labMoved = judgeRequest(ask({ days: ["fthursday"], start: "08:00" }), labContext);
check(labMoved.sendable && labMoved.computedEnd === "12:00", "ونقلُ المختبر اليومي إلى يومٍ آخر يُبقي طولَه ويمرّ");
const notLab = judgeRequest(ask({ days: ["fwednesday"] }), context(4));
check(!(notLab.shapes || []).some(shape => /كما هو الآن/.test(shape.label)), "وشعبةٌ ليست لقاءً ممتدّاً لا يُعرض لها خيارُ اليوم الواحد");

/* ── تاريخُ المقرّر: شعبٌ بيومٍ واحد تأخذ طولَها المعتاد ─────────────────── */
const hist = (course: number, terms: number[], over: any = {}) => terms.map((term, k) => row({ id: 900 + k, AdTermId: term, AdCourseId: course,
  fmonday: false, fwednesday: true, fthursday: false, fsunday: false, fstarttime: "08:00", fendtime: "12:00", ...over }));
const natureOf = (course: number, terms: number[], over: any = {}) => new Map([[course, learnCourseNature(course, hist(course, terms, over))!]]);
const sundayRow = row({ id: 1, AdTermId: 20, fmonday: false, fwednesday: false, fsunday: true, fstarttime: "08:00", fendtime: "08:50" });
const withHistory = (nature: any, hours = 4) => ({ ...context(hours), allRows: [sundayRow], instructorRowsAfter: [sundayRow], nature, termId: 20 });
const habitual = withHistory(natureOf(100, [16, 17, 18]));
const moved = judgeRequest(ask({ days: ["fthursday"], start: "08:00" }), habitual);
check(moved.sendable && moved.computedEnd === "12:00" && moved.blockMinutes === 240, "شعبةٌ تاريخُها يومٌ واحد بأربع ساعات: نقلُها يومَ الخميس يُبقي طولَها (ينتهي 12:00) ويمرّ");
const unaware = judgeRequest(ask({ days: ["fthursday"], start: "08:00" }), { ...habitual, nature: null });
check(!unaware.sendable, "ومن غير التاريخ كان يُمنع: ما تغطّيه خمسون دقيقةً لا يكفي أربع ساعات");
const addedWithHistory = judgeRequest({ rowId: null, action: "add", AdCourseId: 100, days: ["fmonday"], start: "13:00" }, habitual);
check(addedWithHistory.sendable && addedWithHistory.computedEnd === "17:00", "وإضافةُ شعبةٍ جديدة لمثل هذا المقرّر بيومٍ واحد تأخذ طولَه المعتاد (13:00 ← 17:00)");
const threeDayRow = row({ id: 1, AdTermId: 20, fmonday: true, fwednesday: true, fthursday: true, fstarttime: "08:00", fendtime: "09:20" });
const twoDays = judgeRequest(ask({ days: ["fmonday", "fwednesday"] }), { ...habitual, allRows: [threeDayRow], instructorRowsAfter: [threeDayRow] });
check(!twoDays.sendable && twoDays.shapes?.[0]?.days.length === 1 && /كما دُرّس سابقاً/.test(twoDays.shapes?.[0]?.label || ""), "وجعلُها يومين يُمنع وأوّلُ الخيارات «يوم واحد كما دُرّس سابقاً»");
const oneTerm = judgeRequest(ask({ days: ["fthursday"], start: "08:00" }), withHistory(natureOf(100, [18])));
check(!oneTerm.sendable && oneTerm.blockMinutes === undefined, "وتاريخٌ من فصلٍ واحد لا يُعتدّ به: لا يَعِد بما لا يعرف");
check(habitualBlockMinutes(natureOf(100, [16, 17, 18]).get(100), 17) === undefined, "ولا يُحتسب إلا ما سبق الفصلَ الحالي");
const hour = withHistory(natureOf(100, [16, 17, 18], { fwednesday: false, fmonday: true, fstarttime: "09:00", fendtime: "09:50" }), 1);
const hourMoved = judgeRequest(ask({ days: ["fmonday"], start: "10:00" }), hour);
check(hourMoved.sendable && hourMoved.computedEnd === "10:50", "ومقرّرٌ بساعةٍ واحدة اعتاد خمسين دقيقة لا يصير ثمانين لأن اليوم اثنين");
const multi = withHistory(new Map([[100, learnCourseNature(100, [16, 17, 18].flatMap((term, k) => [
  row({ id: 800 + k * 2, AdTermId: term, fmonday: true, fwednesday: true, fthursday: false, fsunday: false, fstarttime: "09:00", fendtime: "10:20" }),
])) ! ]]));
check(judgeRequest(ask({ days: ["fthursday"], start: "08:00" }), multi).blockMinutes === undefined, "ومقرّرٌ اعتاد لقاءين لا يأخذ طولَ يومٍ واحد");

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
check(/if\(dirty\)\{if\(!freshNote\)\{freshNote=true;paint\(\)\}return\}/.test(page), "ولا تُبدّل مسودةً لم تُرسل: تُقال له الجديدُ فقط");
check(!/function refresh\([^)]*\)\{\s*if\(refreshing\|\|!data\)return;\s*if\(dirty\)/.test(page), "لكنها تقرأ حتى مع المسودة: البثّ قد لا يبلغ (نسخةٌ أخرى أو متصفحٌ بلا EventSource) فالقراءةُ هي الطريق");
check(/JSON\.stringify\(data\.request\)===JSON\.stringify\(x\.d\.request\)/.test(page) && !/refresh\((true|false)\)/.test(page), "وتقارن ما جاء بما عندها فلا تنبّه بلا جديد");
check(/\?live=1/.test(page) && /String\(req\.query\.live \|\| ""\) === "1"/.test(server), "وإعادةُ الجلب الصامتة لا تُحسب فتحاً");
check(/<link rel="icon" href="\/schedule-icon\.svg"/.test(page), "الصفحة تحمل أيقونتها فلا يطلب المتصفحُ favicon.ico ويعود 404");
check(/data-shape=/.test(page) && /\[data-shape\]/.test(page), "أزرار التوزيع المعتمد تُطبَّق بضغطة");

/* ── نصُّ المانع بما تقدر عليه الصفحة (سلوكٌ بمحرّك V8) ──────────────────── */
const vStart = page.indexOf("function verdictText(it){");
const vEnd = page.indexOf("function friendly(text){", vStart);
const vBox: any = { friendly: (t: string) => "FRIENDLY:" + t };
let vOk = vStart > 0 && vEnd > vStart;
try { vm.runInNewContext(page.slice(vStart, vEnd).replace(/\\\\/g, "\\") + "\nthis.verdictText=verdictText;", vBox, { timeout: 1000 }); } catch (e) { vOk = false; console.log(e); }
check(vOk && typeof vBox.verdictText === "function", "دالّةُ نصّ الحكم تُجمَّع وحدها");
if (vBox.verdictText) {
  const longText = "هذا المقرّر 4 ساعات أسبوعياً، والمختار لا يغطّيها — جرّب الاثنين 80د · الأربعاء 80د · الخميس 50د أو الثلاثاء 100د · الخميس 100د.";
  const withShapes = vBox.verdictText({ note: longText, shapes: [{ days: ["fmonday"], label: "x" }] });
  check(!/الثلاثاء 100د|جرّب/.test(withShapes) && /اختر أحد الخيارات تحته/.test(withShapes), "المانعُ لا يعِد بتوزيعٍ لا يُختار من الصفحة: يدلّ على الزرّ الذي يمرّ");
  const noShapes = vBox.verdictText({ note: longText, shapes: [] });
  check(/يحدّده القسم/.test(noShapes) && /أبقِ موعدك/.test(noShapes) && !/جرّب/.test(noShapes), "وحين لا يوجد ما يُختار من هنا يُقال له أن يُبقي موعده أو يكتب للقسم");
  check(vBox.verdictText({ note: "تتابع مرتفع على الأستاذ (2)" }) === "FRIENDLY:تتابع مرتفع على الأستاذ (2)", "وبقيةُ الرسائل تمرّ بمترجم اللغة نفسه");
}
check(/<span>'\+esc\(verdictText\(it\)\)\+'<\/span>/.test(page), "مربّعُ الحكم يعرض النصّ المترجَم");

/* ── شاشةُ «وصل طلبك» لا يمحوها البثّ ────────────────────────────────────── */
check(/dirty=false;clearDraft\(\);[\s\S]{0,300}liveOff=true;closeLive\(\);/.test(page), "بعد الإرسال يُوقَف البثّ وإعادةُ القراءة فتبقى شاشة «وصل طلبك» ورمزُ التوقيع");
check(/function refresh\(\)\{\s*if\(liveOff\|\|sendingNow\|\|/.test(page) && /function openLive\(\)\{if\(liveOff\|\|/.test(page), "وإعادةُ القراءة وفتحُ البثّ يحترمان ذلك");
check(/if\(liveOff\|\|sendingNow\|\|!x\.ok\)return;/.test(page), "وقراءةٌ بدأت قبل الإرسال وعادت بعده لا تُطبَّق فوق شاشة «وصل طلبك»");
check(/function postSubmit\(civil,done\)\{[\s\S]{0,400}sendingNow=true;/.test(page) && (page.match(/sendingNow=false;/g) || []).length >= 2, "وأثناء الإرسال لا تُقرأ الصفحة، ويُرفع القيد إن فشل الإرسال");
check(/\.verify-line a\{display:inline-flex;align-items:center;min-height:44px/.test(page), "ورابطُ «تحقّق من رمزك» هدفُ لمسٍ بارتفاع 44");
check(/verifyHtml\(code,true\)/.test(page) && /linkOnly\?link:/.test(page), "وفي شاشة «وصل طلبك» لا يتكرّر رمزُ التوقيع: الرابطُ وحده تحت الرمز");

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
check(/اختياري/.test(verifyHtml) && /وإن نسيتَه فلا يضرّ/.test(verifyHtml), "الصفحة تقول إن الرمز اختياري وإن نسيانه لا يضرّ");
check(/id="civil"[\s\S]*id="code"/.test(verifyHtml), "والرقمُ المدني أولاً ثم الرمز الاختياري");
check(/if\(code&&code\.length!==6\)/.test(verifyScript) && !/if\(code\.length!==6\)/.test(verifyScript), "والصفحةُ لا تشترط الرمز قبل الإرسال");
check(/code:code\|\|undefined/.test(verifyScript), "ولا ترسله إن كان فارغاً");
check(/AR\.signature/.test(verifyScript) && /var AR=/.test(verifyScript), "العدّ بقاعدة العدّ العربية الواحدة");
check(/<details class="sig"/.test(verifyScript) && /اضغط لعرض ما وُقّع عليه/.test(verifyScript) && /\.sig>summary::after/.test(verifyHtml), "التوقيعاتُ بعد الأول مطويّة وعليها سهمٌ وعبارةٌ تدلّ على أنها تُفتح");
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

/* ── المرحلة ٥: «أعد الطلب نفسه» (سلوكٌ بمحرّك V8 نفسه) ──────────────── */
const replaySandbox: any = {};
vm.runInNewContext(REQUEST_REPLAY_SCRIPT + "\nthis.planReplay=planReplay;", replaySandbox, { timeout: 1000 });
const planReplay = replaySandbox.planReplay as (prev: any, state: any[], courses: any[], dayKeys: string[], same?: (cur: any, days: string[], start: string) => boolean) => { ops: any[]; skipped: Array<{ name: string; why: string }> };
const DAYS5 = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const rowOf = (rowId: number, courseId: number, over: any = {}) => ({ rowId, action: "keep", before: { courseId, courseName: `م${courseId}`, sectionCode: "01" }, decision: null, days: [], start: "", ...over });
const askP = (over: any) => ({ action: "change", courseId: 1, courseName: "م1", collegeId: 1, sectionId: 1, sectionCode: "01", days: ["fmonday", "fwednesday"], start: "09:30", state: "fixed", ...over });
const run = (items: any[], state: any[], same?: any) => planReplay({ termName: "الفصل الماضي", items }, state, [{ id: 7, collegeId: 1, sectionId: 1, name: "م7", collegeName: "ك" }], DAYS5, same);

const changed = run([askP({})], [rowOf(10, 1)]);
check(changed.ops.length === 1 && changed.ops[0].kind === "change" && changed.ops[0].index === 0 && changed.ops[0].start === "09:30", "طلبُ تعديلٍ سابق يعود عمليةً على صفّه الحالي");
check(run([askP({ state: "pending" })], [rowOf(10, 1)]).ops.length === 1, "ولو لم يُقرَّر فيه آنذاك");
const rejected = run([askP({ state: "rejected" })], [rowOf(10, 1)]);
check(rejected.ops.length === 0 && /رُفض/.test(rejected.skipped[0].why), "ما رُفض لا يُعاد، ويُقال لماذا");
const gone = run([askP({})], [rowOf(10, 99)]);
check(gone.ops.length === 0 && /ليس في جدولك/.test(gone.skipped[0].why), "مقرّرٌ ليس في جدوله هذا الفصل يُقال له ذلك");
const removed = run([askP({ action: "delete", days: [], start: "" })], [rowOf(10, 1)]);
check(removed.ops.length === 1 && removed.ops[0].kind === "delete", "الحذف السابق يعود حذفاً");
const added = run([askP({ action: "add", courseId: 7, collegeId: 1, sectionId: 1 })], []);
check(added.ops.length === 1 && added.ops[0].kind === "add" && added.ops[0].course.id === 7, "الإضافة السابقة تعود إضافةً من كتالوج هذا الفصل");
const unlisted = run([askP({ action: "add", courseId: 8, collegeId: 1, sectionId: 1 })], []);
check(unlisted.ops.length === 0 && /لم يعد متاحاً/.test(unlisted.skipped[0].why), "ومقرّرٌ خرج من الكتالوج يُقال إنه لم يعد متاحاً");
const badDays = run([askP({ days: ["fsaturday"] })], [rowOf(10, 1)]);
check(badDays.ops.length === 0 && /لم تعد صالحة/.test(badDays.skipped[0].why), "أيامٌ لم تعد صالحة تُقال ولا تُملأ");
const badStart = run([askP({ start: "" })], [rowOf(10, 1)]);
check(badStart.ops.length === 0, "ووقتٌ ناقص لا يُملأ");
const edited = run([askP({})], [rowOf(10, 1, { action: "change" })]);
check(edited.ops.length === 0 && /مسودتك/.test(edited.skipped[0].why), "ما عدّله الأستاذ في مسودته الآن لا يُمسّ");
const decided = run([askP({})], [rowOf(10, 1, { decision: { state: "fixed" } })]);
check(decided.ops.length === 0 && /قرّر القسم/.test(decided.skipped[0].why), "وما قرّر فيه القسم هذا الفصل لا يُمسّ");
const twoSections = run([askP({ sectionCode: "02" })], [rowOf(10, 1), rowOf(11, 1, { before: { courseId: 1, courseName: "م1", sectionCode: "01" } })]);
check(twoSections.ops.length === 0 && /أكثر من شعبة/.test(twoSections.skipped[0].why), "شعبتان ولا شعبةَ بالرقم نفسه: لا تخمين");
const matchedSection = run([askP({ sectionCode: "02" })], [rowOf(10, 1), rowOf(11, 1, { before: { courseId: 1, courseName: "م1", sectionCode: "02" } })]);
check(matchedSection.ops.length === 1 && matchedSection.ops[0].index === 1, "وشعبةٌ بالرقم نفسه تُختار");
const same = run([askP({})], [rowOf(10, 1)], () => true);
check(same.ops.length === 0 && /موعدك الحالي نفسه/.test(same.skipped[0].why), "ما صار موعدَه الحاليَّ لا يُعاد");
const twice = run([askP({}), askP({ start: "11:00" })], [rowOf(10, 1)]);
check(twice.ops.length === 1 && twice.skipped.length === 1, "صفٌّ واحدٌ لا يُستعمل مرّتين");
check(/data-replay|id="replay"/.test(page) && /planReplay\(prev,state,data\.courses/.test(page), "الصفحة تطبّق عمليات القاعدة نفسها");
check(/لا يُرسل شيئاً حتى توقّع/.test(page) && !/function replayPrevious\(\)\{[\s\S]{0,2500}fetch\(/.test(page), "ولا ترسل شيئاً: لا شبكة داخل الإعادة");
check(/\/previous"/.test(server) && /previousTermMemo/.test(server), "ذاكرةُ الفصول تُقرأ عند الطلب وتُحفظ دقائق");

/* ── ذاكرةُ الفصول: «السابق» بالتسلسل الزمنيّ لا بالمعرّفات ─────────────── */
const terms5 = [
  { AdTermId: 1, AdTermName: "الفصل الأول 2026/2027" },   // الحالي، ومعرّفه الأصغر
  { AdTermId: 3, AdTermName: "الفصل الثاني 2025/2026" },   // أقدم زمنياً ومعرّفه أكبر
  { AdTermId: 5, AdTermName: "الفصل الأول 2025/2026" },    // أقدم منه
  { AdTermId: 2, AdTermName: "الفصل الثاني 2026/2027" },   // أحدث زمنياً ومعرّفه 2
];
const req5 = (id: number, term: number, at: string, over: any = {}) => ({ id, AdTermId: term, AdCollegeId: 1, AdSectionId: 1, submittedAt: at, ...over });
const cur5 = { AdTermId: 1, AdCollegeId: 1, AdSectionId: 1 };
const byChrono = pickPreviousRequest([req5(10, 3, "2026-01-01"), req5(11, 5, "2025-09-01")], terms5, cur5);
check(byChrono?.request.id === 10 && byChrono.termName === "الفصل الثاني 2025/2026", "فصلٌ معرّفُه أكبر وهو أقدم زمنياً يُختار سابقاً (لا مقارنةَ معرّفات)");
const notLater = pickPreviousRequest([req5(12, 2, "2027-03-01")], terms5, { AdTermId: 3, AdCollegeId: 1, AdSectionId: 1 });
check(notLater === null, "وفصلٌ أحدثُ زمنياً لا يُعدّ سابقاً ولو كان معرّفُه أصغر");
const nearest = pickPreviousRequest([req5(13, 5, "2025-09-01"), req5(14, 3, "2026-01-01")], terms5, cur5);
check(nearest?.request.id === 14, "وأقربُ السابقين زمنياً هو المختار");
check(pickPreviousRequest([req5(15, 3, "2026-01-01", { AdSectionId: 9 })], terms5, cur5) === null, "وطلبُ قسمٍ آخر لا يُعرض");
check(pickPreviousRequest([req5(16, 3, "")], terms5, cur5) === null, "وما لم يُرسَل لا يُعرض");
check(pickPreviousRequest([req5(17, 1, "2026-01-01")], terms5, cur5) === null, "ولا طلبُ الفصل الحالي نفسه");
const lastOfTwo = pickPreviousRequest([req5(18, 3, "2026-01-01"), req5(19, 3, "2026-02-01")], terms5, cur5);
check(lastOfTwo?.request.id === 19, "وإن تعدّد في الفصل الواحد فآخرُ ما أُرسل");
check(pickPreviousRequest([], terms5, cur5) === null, "ولا شيءَ عند غياب الطلبات");

/* حزمة التحسين البصري: عقودٌ على المصدر. */
const css4 = fs.readFileSync("src/server/requestPageStyles.ts", "utf8");
const kit4 = fs.readFileSync("src/server/publicKit.ts", "utf8");
check(server.includes("/check-times"), "نقطةُ فحصِ الأوقات (الخريطة الحرارية) موجودة");
check(server.includes("function weekStrip") && css4.includes(".wk"), "مخطط الأسبوع وأنماطه موجودان");
check(css4.includes("heat-key") && server.includes("function heatAttr"), "مفتاح الخريطة الحرارية ودالتها موجودان");
check(/prefers-color-scheme:dark/.test(css4) && css4.includes("color-scheme:dark"), "الوضع الداكن معرَّف");
check(css4.includes(".verdict[data-tone=warn]>i{background:#8a6100}"), "أيقونة التنبيه بتباينٍ كافٍ في الفاتح");
check(css4.includes(".verdict[data-tone=warn]>i{background:var(--warn);color:var(--on)}"), "وفي الداكن كذلك");
check(kit4.includes("وقّع برقمك المدني"), "عنوانُ ورقة التوقيع الجديد");
check(server.includes("memoryHtml()+planTable()") || server.includes("replayHtml()+memoryHtml()"), "بطاقةُ الذاكرة أعلى الجدول");
check(server.includes("calmHtml") && server.includes("calendarHtml"), "التقويمُ داخل البطاقة الهادئة");

/* السكربت المولَّد يُجمَّع كما هو. */
const html = server.includes("function instructorRequestPage") ? "ok" : "";
check(html === "ok", "الدالة موجودة");

console.log(`\nTeacher card polish audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
