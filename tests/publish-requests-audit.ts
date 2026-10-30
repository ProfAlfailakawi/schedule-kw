/**
 * ── البابُ الذي يعدّل منه الأستاذ ───────────────────────────────────────────
 *
 * دورةُ رغبات الأساتذة كاملةٌ في الخادم: يُصدَر لكل أستاذٍ رابطُه، ويفتح جدولَه،
 * ويطلب، ويُحكم على طلبه، ويصل القسمَ في وارده. وكان ينقصها شيءٌ واحد: لا زرَّ
 * في الواجهة كلِّها يستدعي الإصدار. فلا يُصدَر رابطٌ أبداً، ولا يفتح أستاذٌ
 * جدولَه، ودورةٌ بُنيت كلُّها لا بابَ لها.
 *
 * وموضعُه «نشر»: هناك كان بابان وكلاهما قراءةٌ فقط، فمن بحث عن بابِ التعديل
 * وجد بطاقةَ اطّلاعٍ وظنَّ أنها هي.
 */

import fs from "fs";
import path from "path";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const publish = fs.readFileSync(path.join(process.cwd(), "src/components/SchedulePublish.tsx"), "utf8");
const server = readServerSource();
const details = fs.readFileSync(path.join(process.cwd(), "src/styles/09-details.css"), "utf8");

/* ── البابُ موجودٌ ويُستدعى ────────────────────────────────────────────── */

check(server.includes('app.post("/api/instructor-requests/issue"'), "مسارُ الإصدار قائمٌ في الخادم");
check(publish.includes('fetch("/api/instructor-requests/issue"'),
  "والواجهةُ تستدعيه — وهذا ما كان ناقصاً، فبقيت الدورةُ بلا باب");
/* «بطاقة الأستاذ» و«رغبات الأساتذة» كانتا بابين وهما للأستاذ شيءٌ واحد: يفتح
   بطاقتَه برقمه المدني ومنها يطلب. فصارتا باباً واحداً، بلا سطرِ تعريفٍ تحته. */
check(publish.includes('type Kind = "department" | "staff" | "survey";'),
  "ثلاثة أبواب في «نشر»: جدولُ القسم، وبطاقةُ الأستاذ التي يُطلب منها التعديل، واستبيانُ الطلبة");
check(publish.includes("<span>بطاقة الأستاذ</span>") && !publish.includes("<span>رغبات الأساتذة</span>"),
  "ويُسمّى بابُ الأستاذ باسمٍ واحد");
check(!/<span>(جدول القسم|بطاقة الأستاذ)<\/span>\s*<small>/.test(publish),
  "ولا سطرَ تعريفٍ تحت الأبواب");
check(publish.includes('const withRequests = kind === "staff";') && publish.includes("if (withRequests) {")
  && !/<label[^>]*>استقبال طلبات تعديل الجدول/.test(publish) && !/kind === "staff"[^\n]*share-days/.test(publish),
  "وطلباتُ التعديل تُفتح مع البطاقة نفسها، بتاريخٍ واحد لا مدّتين");

/* ── موعدٌ يُكتب، لا مدّةٌ تُحسب ───────────────────────────────────────── */

/* الأستاذُ يقرأ «آخر موعد ٥ أكتوبر»، ولا يقرأ «ثلاثين يوماً من متى». */
check(publish.includes('<label className="share-closes">') && publish.includes('type="date"'),
  "وللرغبات تاريخُ إغلاقٍ يُكتب، لا مدّةٌ بالأيام");
/* E1: «للعرض فقط» و«التدريب» لا يسألان عن موعد طلبات؛ «طلب تعديل» لا يُصدَر بلا موعد. */
check(/disabled=\{busy (?:\|\| reachChecking )?\|\| \(withRequests && sendMode === "edit" && !closesAt\)\}/.test(publish),
  "ولا يُصدَر بلا موعدٍ مكتوب");

/* ── ويُقال ما وقع ────────────────────────────────────────────────────── */

/* روابطُ الرغبات لا تظهر في قائمة الروابط: هي رابطٌ لكلِّ أستاذٍ على حدة، لا
   رابطٌ واحدٌ يُنسخ. فلو صمتت الشاشةُ بعد الإصدار لظنَّ القسمُ أنه لم يقع. */
check(publish.includes("const reissued = rows.filter(row => row.reissued).length;"),
  "ويُفرَّق بين رابطٍ جديدٍ وآخرَ يحمله صاحبُه من قبل");
check(publish.includes("فُتحت طلبات التعديل لـ") && publish.includes("طلباتهم عند القسم"),
  "فلا يظنُّ القسمُ أنه أرسل لعشرين وقد أرسل لثلاثة");
check(publish.includes("يطلبون من بطاقتهم، وتتابعها في «وارد الأساتذة»"),
  "ويُدلُّ على موضع المتابعة، فالروابطُ لا تظهر في هذه القائمة");
/* صفةُ الإرسال تُقال كما هي: رابطُ العرض (👁️) لا «يفتح طلبات تعديل». */
check(publish.includes("reissued, renewed, mode });") && publish.includes('issued.mode === "view"')
  && publish.includes("أُرسل جدولُ العرض لـ") && publish.includes("يرون جدولهم من بطاقتهم، بلا طلبات."),
  "وإرسالُ العرض يُقال عرضاً، لا «فُتحت طلبات التعديل»");
/* وعنوانُ البطاقة لا يقول «انتهت مدّة الطلبات» قبل موعدها: طلبٌ اكتمل يقول اكتماله. */
check(server.includes('(open||data.mode==="view"?"":(r.window&&r.window.closesAt&&Date.parse(r.window.closesAt)<=Date.now())?" · انتهت مدّة الطلبات، والصفحة للقراءة":approved?" · اكتمل طلبك، والصفحة للقراءة":" · الصفحة للقراءة")'),
  "وعنوانُ البطاقة يقول «انتهت» بعد الموعد وحده، و«اكتمل طلبك» قبله، ولا شيء لرابط العرض");

/* ── ثلاثةٌ في صفٍّ واحد ──────────────────────────────────────────────── */

/* عمودان ثابتان كانا يتركان الثالثَ وحيداً بعرض نصف الورقة. */
check(/\.share-kind\{[^}]*auto-fit/.test(details.replace(/\s+/g, "")),
  "وتتّسع الأبوابُ الثلاثةُ في صفٍّ واحد، بلا عددٍ مكتوبٍ يلزم تغييرُه عند الرابع");

/* ── ثلاثُ ملاحظاتٍ من مراجعةٍ آلية ─────────────────────────────────────── */

/* ١) رمزُ الطلب كان يُفتح من باب القراءة. البابُ يُعالج «بطاقة الأستاذ» ثم
      يسقط بما سواها إلى جدول القسم كاملاً — ومنه رمزُ الطلب. فمن نسخه من
      قائمة الروابط أو فتحه بهذا المسار يرى جدولَ القسم كلَّه بدل نموذج
      صاحبه: تسريبٌ لا يشتكي منه أحد، لأن الصفحةَ تُفتح وتعمل. */
check(server.includes('if (resolved.link.kind === "request") {')
  && server.includes('res.redirect(302, `/r/${encodeURIComponent(resolved.link.id)}`);'),
  "ورمزُ الطلب يُردّ إلى بابه، فلا يُفتح على جدول القسم");
/* والترتيبُ شرط: تحويلٌ بعد بناء الجدول لا يمنع بناءه. ويُقاس داخل بابه
   وحدَه، فـ`buildSharePayload` تُستدعى في ثلاثة مواضعَ في الملفّ. */
const staffDoor = server.slice(server.indexOf('app.get("/s/:token"'));
check(staffDoor.indexOf('res.redirect(302, `/r/${encodeURIComponent(resolved.link.id)}`);')
  < staffDoor.indexOf("const payload = await buildSharePayload(resolved.link);"),
  "ويُردّ قبل أن يُبنى جدولُ القسم، لا بعده");
/* وحارسٌ ثانٍ في الشاشة: لا تُعرض أصلاً، فلا تأخذ أزرارَ القائمة التي تبني
   `/s/`. */
check(publish.includes('link => link.kind !== "request"') && publish.includes('?.kind === "survey" ? "q" : "s"'),
  "ولا تُعرض روابطُ الطلب في قائمة روابط النشر");

/* ٢) الصلاحيةُ كانت ثابتةً بـ٢١ يوماً والموعدُ يُكتب بحرّية. فمن كتب موعداً
      أبعدَ منها رأى أساتذتُه «انتهت صلاحية هذا الرابط» قبل الموعد الذي
      وعدهم به، ولا شيءَ في الشاشة يقول لماذا. */
check(server.includes("expiresAt: new Date(Math.max(")
  && server.includes("const windowClosesAt = normalizeInstructorDeadline(closesAt);")
  && server.includes("Date.parse(windowClosesAt) + 86400000,"),
  "وصلاحيةُ الرمز تتبع الموعدَ المُعلَن، فلا يُغلق قبل ما وُعد به");
check(server.includes("Date.now() + REQUEST_LINK_DAYS * 86400000,"),
  "ولا تنزل عن الحدّ الأدنى، فلا يُغلق رابطُ موعدٍ قريبٍ لحظةَ انتهائه");

/* ٣) «أُصدر ١٢ رابطاً» كانت تبقى بعد إغلاق اللوحة وفتحِها على نطاقٍ آخر، أو
      بعد إنشاء رابط قراءةٍ عادي — فتُقرأ خبراً عن الفعل الجاري وهي خبرٌ عن
      فعلٍ مضى. */
check(/useEffect\(\(\) => \{\s*setIssued\(null\);\s*setReplaced\(0\);\s*setShowPast\(false\);[^}]*\}, \[open, collegeId, sectionId, termId, kind\]\);/.test(publish),
  "ونتيجةُ الإصدار تُمحى عند تغيّر النطاق أو النوع أو إعادة الفتح");
check(publish.includes("setCreatedId(data.id);\n      setIssued(null);"),
  "وعند إنشاء رابطٍ من نوعٍ آخر");
check(publish.includes("setIssued({ created: rows.length - reissued - renewed, reissued, renewed, mode });"),
  "ويُقال ما فُتح من الطلبات مع البطاقة، في الموضع نفسه");

/* ── والمرشدُ يعرف البابَ الثالث ──────────────────────────────────────────
 * السؤالُ الذي جاء منه هذا العمل كان «وين الدكتور يقدر يعدل؟». فباباً يُضاف
 * ولا يعرفه المرشدُ يترك السؤالَ قائماً لمن يسأله بعد. */
const guide = fs.readFileSync(path.join(process.cwd(), "src/guide/smartGuide.ts"), "utf8");
check(guide.includes('id:"schedule.publish.requests"'),
  "وللبابِ الثالث تعريفٌ في المرشد");
check(guide.includes("وين يعدل الدكتور"),
  "ويُعثر عليه بالسؤال الذي يُسأل به فعلاً");
check(guide.includes("ومنها يطلب الأستاذ تعديل جدوله. وجدولُ القسم بجانبها للاطّلاع وحده."),
  "ويُقال صراحةً أن البطاقةَ هي بابُ الطلب، وجدولُ القسم للاطّلاع");
/* ── وهدفُ الخطوة هو العنصرُ الذي تتكلّم عنه ────────────────────────────
 * المرشدُ يستبدل أولَ اسمٍ بين قوسين في نصّ الخطوة باسمِ هدفها الحيّ
 * (`hydrateGuideSteps`). فخطوةٌ تقول «اختر رغبات الأساتذة» وهدفُها زرُّ النشر
 * الخارجيُّ تصير «اختر نشر» — نقيضُ ما وُضعت له، وأسوأُ من غيابها. */
check(publish.includes('data-guide-target="schedule.publish.requests"'),
  "ولزرِّ الرغبات هدفٌ خاصٌّ به في الشاشة");
check(guide.includes('{target:"schedule.publish.requests",text:"هذه هي «بطاقة الأستاذ»'),
  "والخطوةُ التي تسمّيه تُشير إليه هو، فلا يُستبدل اسمُه باسم غيره");
/* والخطوةُ التي لا تسمّي عنصراً لا تحمل قوسين أصلاً، فلا يُقحَم فيها اسمٌ. */
check(!/\{target:"schedule\.publish",text:"[^"]*«/.test(guide.slice(guide.indexOf('id:"schedule.publish.requests"'))),
  "وما لا تسمّيه لا تضع فيه قوسين، فلا يُقحَم اسمُ الزرّ الخارجيّ");
/* ووصفُ «نشر» نفسُه صار يذكر الأبوابَ الثلاثة، فلا يقرأ القارئُ «رابط قراءة»
   فيظنّ أن لا تعديلَ هناك. */
check(guide.includes("بابان: جدولُ القسم لمن يحمل الرابط، وبطاقةُ الأستاذ يفتحها برقمه المدني — ومنها يطلب تعديل جدوله"),
  "ووصفُ النشر نفسُه يذكر البابين، وأن الطلبَ من البطاقة");

/* ── بطاقةٌ واحدة لعائلة القسم وسجلّ نشر مطابق ──────────────────────── */
check(server.includes("async function staffFamilyShareLinks") &&
  server.includes("departmentFamily(await Repository.getSections(), collegeId, sectionId)"),
  "النشر يقرأ عائلة القسم العلمي نفسها المستخدمة في المنتدبين");

check(server.includes('const family = kind === "staff" ? departmentFamily(sections, collegeId, sectionId)') &&
  server.includes('const scopeLinks = (await Promise.all(family.map(scope =>'),
  "إصدار بطاقة جديدة يحل محل بطاقات المواقع الشقيقة");

check(server.includes("const family = await staffFamilyScopes(collegeId, sectionId);") &&
  server.includes("const existing = await currentInstructorRequestGeneration(familyRequests.flat());") &&
  server.includes("const rows = familyRows.flat();"),
  "إصدار طلبات التعديل يجمع مواقع القسم مع استبعاد جولات أجيال الجداول السابقة");

check(server.includes("const unsentTokens = new Set(requests.filter(request =>") &&
  server.includes('request.status === "sent" && !request.submittedAt && !request.signature') &&
  server.includes('familyLink.kind === "request" && unsentTokens.has(familyLink.id)'),
  "إلغاء نشر بطاقة العائلة يبطل الروابط الفارغة ويحفظ الطلبات المرسلة والموقعة");

check(server.includes("const publishedFamilies = new Set<string>();") &&
  server.includes("const seenUnsent = new Set<string>();") &&
  server.includes("if (!publishedFamilies.has(familyKey)) continue;"),
  "كرت الأستاذ لا يعرض روابط الطلبات غير المنشورة ولا يكرر مسودات مواقع القسم");

check(server.includes('app.get("/api/share/:id/faculty"') &&
  server.includes("AdInstructorMobile: person.AdInstructorMobile ||") &&
  !server.slice(server.indexOf('app.get("/api/share/:id/faculty"'), server.indexOf('app.post("/api/share/:id/personal"')).includes("AdInstructorCivil"),
  "تسليم البطاقة لكل أساتذة العائلة بلا كشف بيانات الرقم المدني");

check(publish.includes('/api/share/\u0024{encodeURIComponent(deliver)}/faculty') &&
  publish.includes("await load();"),
  "واجهة سجل النشر تتجدد بعد إلغاء رابط العائلة وتقرأ قائمة التسليم الكاملة");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
