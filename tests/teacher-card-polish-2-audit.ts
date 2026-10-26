/**
 * ── كرت الأستاذ: الجولة الثانية ───────────────────────────────────────────────
 *
 *   P1  «تعديل» بلا لمسة ليس طلباً: لا مانع، والنهاية الأصلية، والملاحظةُ إرشادٌ لا منع.
 *   P2  بدايةٌ مختلفة في اليوم الواحد نفسه تحفظ طولَ الموعد الحالي، فلا يُمنع الأستاذ بما لم يطلبه.
 *   P3  نصُّ «جرّب» يساوي أزرارَه حرفاً، وكلُّ زرٍّ يمرّ من الفاحص نفسه.
 *   P4  مصدرُ الصفحة: لا يُعدّ المحرّرُ المفتوح تعديلاً، والموعدُ الناقص ليس «جاهزاً»، والخريطةُ لا تحمرّ لمشكلة أيام.
 */
import { readFileSync } from "node:fs";
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const TEACHER = 5, COURSE = 19;
const row = (over: Partial<FSchedule>): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: COURSE, SCode: "02", AdInstructorId: TEACHER,
  fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
  fstarttime: "14:00", fendtime: "15:15", AdRoomCode: "أ", AdRoomHall: "101", ...over,
} as FSchedule);
/* «التصميم التعليمي ٠٢»: الخميس وحده ٧٥ دقيقة، والمقرر ٤ ساعات أسبوعياً. */
const thursday = row({ id: 1, fthursday: true });
const course: AdCourse = { AdCourseId: COURSE, AdCollegeId: 1, AdSectionId: 1, CourseCode: "ED19", CourseName: "التصميم التعليمي", CourseCredit: 4, CourseHours: 4 } as AdCourse;
const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000005", AdInstructorName: "د. 5" } as AdInstructor;
const ctx = (after: FSchedule[]): VerdictContext => ({
  instructorId: TEACHER, allRows: [thursday], instructorRowsAfter: after,
  courses: new Map([[COURSE, course]]), instructors: new Map([[TEACHER, teacher]]), knownRoomKeys: [], startLadder: [],
});
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const judge = (days: string[], start: string, original: FSchedule = thursday) => {
  const after = row({ id: original.id, ...Object.fromEntries(DAYS.map(d => [d, days.includes(d)])), fstarttime: start, fendtime: start });
  const ask: RequestedRow = { rowId: original.id, action: "change", AdCourseId: COURSE, days: days as any, start };
  return judgeRequest(ask, { ...ctx([after]), allRows: [original] });
};
/* موعدٌ يغطّي الساعات (٢٠٠ دقيقة): نقلُه إلى يومين قصيرين يقصّر عنها فيُمنع. */
const full = row({ id: 2, fmonday: true, fwednesday: true, fstarttime: "09:00", fendtime: "10:40" });

/* P1: تعديلٌ بلا لمسة */
const same = judge(["fthursday"], "14:00");
check(same.kind === "clear" && same.sendable && !same.reasons.some(r => r.blocking), "P1 «تعديل» بلا لمسة: لا مانع ولا استثناء", same);
check(same.headline === "هذا موعدك الحالي كما هو", "P1 العنوان يقول إنه الموعد الحالي");
check(/أقصر من ساعات المقرّر/.test(same.advice || "") && /4 ساعات|٤ ساعات|أربع ساعات/.test(same.advice || ""), "P1 الإرشادُ يذكر أن الموعد الحالي أقصر من ساعات المقرر", same.advice);
check((same.shapes || []).length > 0 && (same.shapes || []).every(s => s.days.length > 1), "P1 ومعه أزرارُ أنماطٍ معتمدة", same.shapes);

/* P2: بدايةٌ أخرى في اليوم نفسه */
const later = judge(["fthursday"], "15:00");
check(!later.reasons.some(r => r.blocking && r.source === "shape"), "P2 بدايةٌ أخرى في الخميس نفسه لا تُمنع بنقص الساعات", later);
check(later.blockMinutes === 75 && later.computedEnd === "16:15", "P2 المدةُ مدةُ الموعد الحالي (٧٥ دقيقة): ينتهي 16:15", { block: later.blockMinutes, end: later.computedEnd });

/* P3: النصُّ يساوي الأزرار، وكلُّ زرٍّ يمرّ من الفاحص */
const bad = judge(["fsunday", "fwednesday"], "09:00", full);
const hours = bad.reasons.find(r => r.code === "hours");
check(!!hours && hours.blocking, "P3 أيامٌ لا تغطّي الساعات: مانعٌ برمز hours", bad.reasons);
const buttons = (bad.shapes || []).map(s => s.label);
check(buttons.length > 0 && buttons.every(label => (hours?.text || "").includes(label)), "P3 كلُّ زرٍّ مذكورٌ في نص «جرّب» حرفاً", { buttons, text: hours?.text });
const tryText = (hours?.text.split("جرّب")[1] || "").replace(/\.$/, "").trim();
check(tryText.split(" أو ").length === buttons.length && tryText.split(" أو ").every(label => buttons.includes(label)), "P3 ولا يُذكر نمطٌ بلا زرّ", { tryText, buttons });
const applied = (bad.shapes || []).map(shape => ({ shape, verdict: judge(shape.days as string[], "09:00", full) }));
check(applied.length > 0 && applied.every(a => !a.verdict.reasons.some(r => r.code === "hours" || (r.blocking && r.source === "shape"))), "P3 كلُّ زرٍّ مقترح يمرّ من الفاحص بلا منع ساعات", applied.map(a => ({ l: a.shape.label, k: a.verdict.kind })));

/* P4: مصدرُ الصفحة */
const server = readFileSync("server.ts", "utf8");
const page = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.post("/api/public/request/:token/check"'));
check(page.includes("function unchangedEdit(it)") && page.includes('return{rowId:it.rowId,action:"keep",days:[],start:"",excuse:it.excuse}'), "P4 التعديلُ بلا لمسة يُرسل إبقاءً");
check(/var changed=state\.filter\(function\(it\)\{return it\.action!=="keep"&&!unchangedEdit\(it\)&&!incompleteItem\(it\)\}\)/.test(page), "P4 ولا يُعدّ في «جاهز»، ولا الموعدُ الناقص");
check(page.includes('"أكمل الموعد الجديد"') && page.includes("gi(\"arrow\")+'أكمله'"), "P4 الشريط يقول «أكمل الموعد الجديد» بزرّ «أكمله»");
check(page.includes('"أكمل الأيام ووقت البداية لـ«"+courseOf(state[incomplete])+"» قبل الإرسال."'), "P4 رسالةُ النقص تذكر اسم المقرر لا رقماً");
check(page.includes("payloadWith(i)") && page.includes('problem==="shape"') && page.includes("المشكلة في الأيام لا في الوقت"), "P4 مشكلةُ الأيام لا تُلوّن الأوقات، وسطرٌ واحد يقول ذلك");
check(server.includes('if (problemIsShape) { res.json({ times: {}, problem: "shape" }); return; }'), "P4 والخادمُ هو من يحكم (لا bad لكل وقت)");
check(server.includes('note.kind !== "balance" && note.courseIds') && page.includes('n.kind!=="balance"'), "P4 شريطُ نسب الصباح والمساء غائبٌ عن صفحة الأستاذ");

/* P5: التحسينات */
check(page.includes('var act=unchangedEdit(it)?"keep":it.action;') && page.includes('data-act="\'+esc(act)+\'">\'+skStat(act)+(act==="keep"?"كما هو":actionName(act))'), "P5 بطاقة التعديل بلا لمسة تقرأ «كما هو» لا «معدّل»");
check(page.includes("function receiptLine(it)") && page.includes("chg.map(function(it){return '<li><span>'+receiptLine(it)") && !page.includes("chg.slice(0,5)"), "P5 إيصال ما قبل التوقيع: كلُّ تغيير بجملة بشرية، بلا اختصار");
check(page.includes("'نقل '+c+where+' من '") && page.includes("'حذف '+c") && page.includes("'إضافة '+c"), "P5 صيغُ الإيصال: نقل وحذف وإضافة");
check(page.includes("function bestTimes(it,i)") && page.includes("out.length>=3?out.slice(0,3):[]") && page.includes('h[t]==="ok"'), "P5 «أفضل ٣ مواعيد» من أوقاتٍ حكم الخادمُ بأنها متاحة، ولا تظهر إن قلّت عن ثلاثة");
check(page.includes("function deadlineHtml(r,open)") && page.includes('data-urgent="\'+(left<=2?1:0)+\'"'), "P5 عدّاد المهلة، كهرمانيٌّ في آخر يومين");
check(page.includes('<button type="button" class="wb" data-wk="') && page.includes("aria-label=\"'+esc(courseOf(state[b.i])+\"، \"+d[1]+\" \"+clock(b.s))") && page.includes('[data-wk]'), "P5 مخطط الأسبوع: كتلٌ أزرارٌ بـaria-label تفتح بنودَها");
check(page.includes('id="noteAdd">＋ أضف ملاحظة للقسم') && page.includes("!noteOpen&&!String(noteNow()).trim()"), "P5 ملاحظة القسم مطوية، وتُفتح تلقائياً إن كان فيها نص");
check(page.includes('"فتحتَ الرابط "+countOf(e.count,AR.visit)+" · آخرها "+clockOf(e.at)') && page.includes('e.kind!=="link-opened"&&e.kind!=="link-created"'), "P6 فتحاتُ اليوم الواحد في سطر، والرقم لا يعدّ الفتح");
check(page.includes("<b>ملاحظة للقسم</b> <small>"), "P7 مسافةٌ بين «ملاحظة للقسم» و«اختياري»");
check(page.includes("!data.request.submittedAt&&(it.action===\"change\"||it.action===\"add\")") && page.includes('if(act==="change")openCards[i]=true;'), "P7 «القسم يراجع»: البند المعدّل مطوي ويُفتح بالضغط");
check(page.includes('"موعدك الحالي ("+fmtDays(cur.d)+" "+hh(cur.s)+"): لا تتوفّر قاعة في هذا الوقت؛ القسم يقترح موعداً بديلاً."'), "P7 بطاقة «قرارك»: عدمُ توفّر القاعة مربوطٌ بموعدك الحالي لا باقتراح القسم");
check(judgeRequest({ rowId: 1, action: "change", AdCourseId: COURSE, days: ["fthursday"], start: "14" as any }, ctx([thursday])).sendable === false, "P2 وقتٌ بلا دقائق لا يُعدّ «كما هو»");
check(page.includes("القسم يقترح عليك البدائل التالية.") && page.includes("لا تتوفّر قاعة في هذا الوقت للموعد الذي طلبتَه ("), "P7 رفضُ القاعة مربوطٌ بالموعد الذي طلبه الأستاذ");

check(server.includes("keyGenerator: requestTokenKey") && server.includes('app.use("/api/public/request/:token", requestLinkLimit);') && server.includes('if (req.originalUrl.startsWith("/api/public/request/")) { next(); return; }'), "P8 حدودُ بطاقة الأستاذ لكل رابطٍ وسقفٌ لكل عنوان، لا عدّادٌ عامٌّ واحدٌ لكل عنوان");

/* P9: «متطلب» بجانب المقرر في قوائم الإضافة والتعديل (القسم والأستاذ) */
const schedules = readFileSync("src/components/Schedules.tsx", "utf8"), quick = readFileSync("src/components/QuickCreatePopover.tsx", "utf8");
const badges = readFileSync("src/utils/planBadges.ts", "utf8"), shared = readFileSync("src/server/planBadgeShared.ts", "utf8"), reviewRoutes = readFileSync("src/server/planReviewRoutes.ts", "utf8");
check(schedules.includes("badge: courseOptionBadge(formCourses.filter((c) => c.CourseName === name).map((c) => Number(c.AdCourseId)), planBadges)"), "P9 نافذة «إضافة موعد دراسي» وتعديله: «متطلب» بجانب المقرر");
check(quick.includes("badge: courseOptionBadge([Number(c.AdCourseId)], planBadges)"), "P9 والإضافة السريعة من فراغ الجدول");
check(badges.includes('const required = courseIds.some(id => serviceDepartmentsOf(id).length > 0) ? "متطلب" : "";') && badges.includes('[plan, required].filter(Boolean).join(" · ")'), "P9 الوسم «متطلب» يُضاف إلى شارة الصحيفة ولا يستبدلها");
check(shared.includes("export async function serviceCourseKeys") && reviewRoutes.includes("setServiceSource(serviceRows);"), "P9 مصدرُ مقررات الخدمة مشتركٌ مع بطاقة الأستاذ (النمط نفسه لشارة الصحيفة)");
check(reviewRoutes.includes('const serviceKey = createDataContextKey(() => Repository.currentDemoSessionId());') && reviewRoutes.includes("serviceCache.key === key"), "P9 ذاكرةُ مقررات الخدمة تحمل عالَمَها (dataContextCacheKey)");
check(server.includes("...(services.has(`${Number(row.AdCourseId || 0)}:${scope.sectionId}`) ? { service: true } : {})"), "P9 خيارات الإضافة عند الأستاذ تحمل service للمقرر الخدمي وحده");
check(page.includes("(c.service?'<i class=\"req-tag\">متطلب كلية</i>':'')") && page.includes(".req-tag{"), "P9 قائمة «موعد جديد» عند الأستاذ: «متطلب كلية» بجانب المقرر الخدمي");
check(!page.includes("c.service?'hidden'") && page.includes("hidden><b>'+esc(c.name||c.code)+(c.service"), "P9 لا يُخفى مقرر ولا يتغيّر ترتيبه: وسمٌ فقط");

/* P10: «متطلب» في بقية الأماكن المناسبة */
const importTable = readFileSync("src/components/ImportPreviewTable.tsx", "utf8"), reports = readFileSync("src/components/Reports.tsx", "utf8");
const proposalRoutes = readFileSync("src/server/studyProposalRoutes.ts", "utf8"), proposalPage = readFileSync("src/server/studyProposalPage.ts", "utf8");
check(page.includes('function reqTag(it)') && page.includes("esc(courseOf(it))+reqTag(it)+'</b>'"), "P10 بطاقةُ الموعد القائم عند الأستاذ: «متطلب» بجانب اسم المقرر");
check(page.includes("<h2>هل يناسبك هذا الموعد؟</h2><p>'+esc(courseOf(it))+reqTag(it)+"), "P10 وبطاقة «قرارك»");
check(server.includes("serviceCourses,") && server.includes("serviceCourseKeys(),"), "P10 الخادمُ يرسل مقرراتِ الخدمة مع الطلب (وسمٌ فقط)");
check(proposalRoutes.includes("service: serviceKeys.has(") && proposalPage.includes("(t.service?'<span class=\"plan-badge\">متطلب</span>':'')"), "P10 صفحةُ المقترح الدراسي العامة: «متطلب» بجانب المقرر");
check(importTable.includes("badge: courseOptionBadge([Number(item.AdCourseId)], planBadges)") && reports.includes("badge: courseOptionBadge([Number(row.AdCourseId)], planBadges)"), "P10 قائمتا اختيار المقرر في معاينة الاستيراد والتقارير");

/* P11: قراءاتٌ متوازية بلا تغيير في الردود */
check(server.includes("const [link, early] = await Promise.all([") && server.includes("link.id === wanted && early ? early"), "P11 الرابطُ وطلبُه يُقرآن معاً، ويُعاد السؤالُ إن اختلف المعرّف");
check(server.includes("const [opened, [instructors, terms, courses, serviceKeys, calendarToken], judgedBeforeOpen] = await Promise.all(["), "P11 فتحُ الكرت: التسجيل والقوائم والحكم معاً");
check(server.includes("async function rulesOnce<T>(") && server.includes("await Promise.all([...scopesNeeded].map(([key, scope]) =>"), "P11 نطاقاتُ القواعد معاً، ونطاقٌ واحدٌ يُحسب مرةً ولو سأل عنه كثيرون");
check(server.includes("contexts.set(key, buildRequestContext(row))") && server.includes("rulesCache: sharedRules"), "P11 شاشةُ القسم: سياقٌ واحد لكل نطاق لا لكل طلب");

/* P12: تاريخُ القسم أولاً ثم اللائحة، حتى في إرشاد «تعديل بلا لمسة» */
{
  const nature: any = { courseId: COURSE, terms: 3, observations: 6, meetingsPerWeek: 3, meetingMinutes: 70, weeklyMinutes: 210, confidence: "high", seenInTerms: [-1, -2, -3],
    dayPatterns: [{ days: ["fmonday", "fwednesday", "fthursday"], label: "", count: 5, share: 0.8 }], starts: [], instructors: [], buildings: [], rooms: [], sectionsPerTerm: 1, period: "morning" };
  const withHistory = judgeRequest({ rowId: 1, action: "change", AdCourseId: COURSE, days: ["fthursday"] as any, start: "14:00" }, { ...ctx([thursday]), suggestNature: new Map([[COURSE, nature]]), termId: 5 });
  check((withHistory.shapes || [])[0]?.label?.startsWith("المعتاد تاريخياً: ") && (withHistory.shapes || [])[0]?.days.join() === "fmonday,fwednesday,fthursday", "P12 إرشادُ «تعديل بلا لمسة» يوضح أن النمط تاريخي لا تشغيلي («المعتاد تاريخياً: …»)", withHistory.shapes);
  const asApplied = judge(["fmonday", "fwednesday", "fthursday"], "09:00", thursday);
  check(!asApplied.reasons.some(r => r.code === "hours"), "P12 والمعتادُ المقترح يمرّ من الفاحص نفسه", asApplied.reasons);
  const noHistory = judgeRequest({ rowId: 1, action: "change", AdCourseId: COURSE, days: ["fthursday"] as any, start: "14:00" }, ctx([thursday]));
  check(!(noHistory.shapes || []).some(s => s.label.startsWith("المعتاد")) && (noHistory.shapes || []).length > 0, "P12 وبلا تاريخٍ تُقترح أنماطُ اللائحة", noHistory.shapes);
}

/* P13: عناصر كرت الأستاذ المطلوبة، بلا تغييرٍ في التحقق أو الإرسال. */
const visual13 = readFileSync("src/server/requestVisual.ts", "utf8");
const source13 = readFileSync("src/server/planBadgeShared.ts", "utf8");
check(server.includes('import { planBadgesFor, serviceCourseKeys }') &&
  server.includes("const planBadges = await planBadgesFor(") &&
  server.includes("    planBadges,"), "P13 مصدر شارات الصحيفة نفسه يُرسل إلى كرت الأستاذ");
check(source13.includes("export async function planBadgesFor") && source13.includes("if (wanted.has(key) && row.label)"),
  "P13 الشارة مرتبطة بالمقرر وقسمه، ولا يختلق الكرت تصنيفاً");
check(page.includes("function skPlanTag(cid,sid)") &&
  page.includes("skPlanTag(c.id,c.sectionId)") &&
  page.includes("skPlanTag(courseIdOf(it),sid)") &&
  page.includes("reqTag({courseId:group.courseId,sectionId:group.sectionId})"),
  "P13 الشارة في موعد جديد والموعد الحالي والقرار والشعب المتاحة");
check(page.includes("function receiptLine(it){var c='<b>'+esc(courseOf(it))+reqTag(it)"),
  "P13 شارات المقرر في إيصال الطلب");
check(visual13.includes("function skRuleTag(label)") &&
  visual13.includes("skRuleTag(art[1])") &&
  visual13.includes("skRuleTag(m[2])") &&
  visual13.includes('(/^أكثر من شعبتين متتاليتين/.test(n)?"":'),
  "P13 المادة ٦/٢ قابلة للضغط بلا تفاصيل متكررة");
check(visual13.includes("function skBadgeExplain(el)") &&
  visual13.includes("م.6/2: لا يجوز تجاوز شعبتين") &&
  visual13.includes("متطلب كلية:") &&
  page.includes('data-sk-badge="plan"'),
  "P13 الضغط على شارة اللائحة أو الصحيفة أو متطلب كلية يعرض شرحاً مختصراً");
check(!visual13.includes('data-nx="send"') &&
  page.includes('<button type="button" id="send"'),
  "P13 اختصار إلى الإرسال المحذوف لا يمسّ زر الإرسال الأصلي");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
