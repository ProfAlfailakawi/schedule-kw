/**
 * ── إكمالُ أيام المقرر تلقائياً في كرت الأستاذ ────────────────────────────────
 * يضغط الأستاذ يوماً فيكمل النظامُ نمطَ المقرر المعتاد في قسمه (الأحد/الثلاثاء/الخميس أو
 * الاثنين/الأربعاء)، من تاريخ القسم لا من رقمٍ ثابت، ويبقى له أن يبدّل. والقاعدةُ تُجمَّع بمحرّك V8
 * كما تُحشى في الصفحة.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { REQUEST_DAY_AUTOFILL_SCRIPT } from "../src/server/requestDayAutofillScript";
import { dayHabitOf, learnCourseNature } from "../src/utils/courseNature";
import { DEMO_COPY_SCRIPT } from "../src/server/publicKit";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const box: any = {};
vm.runInNewContext(`${REQUEST_DAY_AUTOFILL_SCRIPT}\nthis.autofillDays=autofillDays;`, box, { timeout: 1000 });
const ORDER = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const fill = (day: string, current: string[], habit: any, own = 0) => box.autofillDays(day, current, habit, own, ORDER);
const list = (value: unknown) => Array.isArray(value) ? [...value].join("+") : String(value);

/* 1) تاريخ المقرر يحدّد العدد والنمط. */
const threeSUT = { perWeek: 3, patterns: [["fsunday", "ftuesday", "fthursday"]] };
check(list(fill("fsunday", [], threeSUT)) === "fsunday+ftuesday+fthursday", "الأحد ← الأحد والثلاثاء والخميس (مقررٌ بثلاثة لقاءات)");
check(list(fill("fthursday", [], threeSUT)) === "fsunday+ftuesday+fthursday", "والخميس يكمل النمط نفسه");
const twoMW = { perWeek: 2, patterns: [["fmonday", "fwednesday"]] };
check(list(fill("fmonday", [], twoMW)) === "fmonday+fwednesday", "الاثنين ← الاثنين والأربعاء (مقررٌ بلقاءين)");
check(list(fill("fwednesday", [], twoMW)) === "fmonday+fwednesday", "والأربعاء يكمل النمط نفسه");
check(list(fill("fsunday", [], twoMW)) === "fsunday+ftuesday", "يومٌ خارج نمط التاريخ يأخذ النمط المعياري بالعدد نفسه (الأحد والثلاثاء)");
const one = { perWeek: 1, patterns: [["fwednesday"]] };
check(fill("fsunday", [], one) === null, "مقررٌ بيومٍ واحد: لا إكمال، تبديلٌ عاديّ");
check(fill("fsunday", [], undefined, 0) === null, "لا تاريخ ولا موعدَ حالي: لا إكمال");

/* 2) بلا تاريخ: عددُ أيام موعده الحالي. */
check(list(fill("fmonday", [], undefined, 2)) === "fmonday+fwednesday", "بلا تاريخٍ يُؤخذ عددُ أيام موعده الحالي (يومان)");
check(list(fill("fsunday", [], undefined, 3)) === "fsunday+ftuesday+fthursday", "وثلاثةٌ تعطي الأحد والثلاثاء والخميس");
check(fill("fthursday", [], undefined, 2) === null, "الخميس بلقاءين لا نمطَ معياريَّ له: تبديلٌ عاديّ");

/* 3) النمطُ الكامل الحالي يُستبدل، والتعديل اليدوي لا يُعارَض. */
check(list(fill("fsunday", ["fmonday", "fwednesday"], twoMW)) === "fsunday+ftuesday", "نمطٌ كاملٌ حالٍ (الاثنين والأربعاء) يُستبدل بنمط اليوم المضغوط");
check(fill("fthursday", ["fsunday"], threeSUT) === null, "اختيارٌ ناقصٌ (يومٌ من ثلاثة) يُكمَل بالتبديل اليدوي لا بالاستبدال");
check(fill("fthursday", ["fsunday", "ftuesday"], threeSUT) === null, "ويومان من ثلاثة: تبديلٌ يدويّ أيضاً");
check(fill("fmonday", ["fsunday", "fthursday"], twoMW) === null, "اختيارٌ خارج الأنماط المعروفة لا يُمسّ");

/* 4) تاريخ القسم → عادة الأيام (dayHabitOf). */
const mk = (term: number, days: string[]) => ({ AdCourseId: 9, AdTermId: term, fstarttime: "08:00", fendtime: "09:20", ...Object.fromEntries(ORDER.map(d => [d, days.includes(d)])) }) as any;
const history = [1, 2, 3, 4].flatMap(term => [mk(term, ["fsunday", "ftuesday", "fthursday"]), mk(term, ["fsunday", "ftuesday", "fthursday"])]);
const habit = dayHabitOf(learnCourseNature(9, history));
check(habit?.perWeek === 3 && habit.patterns[0].join() === "fsunday,ftuesday,fthursday", "dayHabitOf يقرأ ثلاثة لقاءات الأحد والثلاثاء والخميس من أربعة فصول");
check(dayHabitOf(learnCourseNature(9, [mk(1, ["fmonday", "fwednesday"])])) === undefined, "فصلٌ واحد: ثقةٌ منخفضة فلا يُقال شيء");
check(dayHabitOf(null) === undefined, "بلا تاريخ: لا عادة");

/* 5) الربط في الصفحة والخادم. */
const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
check(server.includes("${REQUEST_DAY_AUTOFILL_SCRIPT}") && server.includes("function tapDay(it,d)") && server.includes("tapDay(it,el.dataset.day)"), "الصفحة تحشو القاعدة وضغطةُ اليوم تمرّ بها");
check(server.includes('app.get("/api/public/request/:token/day-habits"') && server.includes("dayHabitOf(await courseHabit(id))"), "مسارٌ يعيد نمط أيام المقرّرات من التاريخ");
check(server.includes("loadHabits(state.map(courseIdOf))") && server.includes("loadHabits([cid])"), "النمطُ يُجلب لمقرّرات الطلب عند الفتح وللمقرّر المضاف عند اختياره");
check(server.includes('class="auto-note"') && server.includes("أُكمل النمط المعتاد لهذا المقرّر"), "تُقال للأستاذ ملاحظةٌ قصيرة أن الأيام أُكملت وأنه يستطيع التبديل");

/* 6) زرُّ النسخ (أيقونةٌ بلا كلام) في تلميح الديمو. */
const makeCtx = (legacyWorks: boolean, withClipboard: boolean) => {
  const listeners: any = {}, timers: Array<() => void> = [], log = { copied: "", picked: false, legacyValue: "" };
  const button: any = {
    attrs: { "data-demo-copy": "289012345678" }, flags: {} as Record<string, string>, parentNode: { querySelector: () => ({}) },
    getAttribute(name: string) { return this.attrs[name] ?? null; }, setAttribute(name: string, value: string) { this.flags[name] = value; }, removeAttribute(name: string) { delete this.flags[name]; },
  };
  const focusLog: string[] = [];
  const area: any = { style: {}, setAttribute() {}, focus() { focusLog.push("area"); }, setSelectionRange() {}, get value() { return this._v; }, set value(v: string) { this._v = v; log.legacyValue = v; } };
  const ctx: any = {
    window: { getSelection: () => ({ removeAllRanges() { log.picked = true; }, addRange() {} }) }, clearTimeout() {}, setTimeout: (fn: () => void) => { timers.push(fn); return 1; },
    navigator: withClipboard ? { clipboard: { writeText: (text: string) => { log.copied = text; return { then: (ok: () => void) => { ok(); } }; } } } : {},
    document: {
      activeElement: { focus: () => { focusLog.push("button"); } },
      addEventListener: (type: string, fn: any) => { listeners[type] = fn; },
      createElement: () => area, body: { appendChild() {}, removeChild() {} }, createRange: () => ({ selectNodeContents() {} }),
      execCommand: () => legacyWorks,
    },
  };
  vm.runInNewContext(DEMO_COPY_SCRIPT, ctx, { timeout: 1000 });
  const click = () => listeners.click({ target: { closest: (sel: string) => sel === "[data-demo-copy]" ? button : null }, preventDefault() {} });
  return { ctx, listeners, timers, button, log, click, focusLog };
};
{
  /* الآيفون: النسخُ القديم داخل الضغطة نفسها أولاً، فلا يتأخّر بعد انقضائها. */
  const a = makeCtx(true, true); a.click();
  check(a.log.legacyValue === "289012345678" && a.log.copied === "", "الرقمُ كاملاً يُنسخ داخل الضغطة نفسها (دون انتظار الحافظة الحديثة)");
  check(a.focusLog.join() === "area,button", "ويعود التركيزُ إلى الزرّ بعد إزالة الحقل المؤقّت");
  check(a.button.flags["data-copied"] === "1", "وتتبدّل الأيقونةُ إلى علامة الصحّ (بلا كلام)");
  a.timers.forEach(fn => fn());
  check(!("data-copied" in a.button.flags), "وتعود الأيقونةُ بعد لحظة");
  /* حين يفشل القديم تُجرَّب الحافظةُ الحديثة. */
  const b = makeCtx(false, true); b.click();
  check(b.log.copied === "289012345678" && b.button.flags["data-copied"] === "1", "وإن فشل القديمُ نُسخ بالحافظة الحديثة");
  /* وإن فشل الاثنان يُحدَّد الرقم ليكمل المستخدم بنسخ النظام. */
  const c = makeCtx(false, false); c.click();
  check(c.log.picked && !("data-copied" in c.button.flags), "وإن فشلا يُحدَّد الرقمُ كاملاً بدل صمتٍ كاذب");
  const before = Object.keys(a.listeners).length;
  vm.runInNewContext(DEMO_COPY_SCRIPT, a.ctx, { timeout: 1000 });
  check(Object.keys(a.listeners).length === before, "الحشوُ المزدوج لا يضيف مستمعاً ثانياً");
}
/* اللصق في خانة الرقم المدني: علاماتُ الاتجاه المخفية لا تُسقط آخرَ الرقم. */
{
  const listeners: any = {};
  const field: any = { tagName: "INPUT", value: "", selectionStart: 0, selectionEnd: 0, getAttribute: (n: string) => n === "inputmode" ? "numeric" : n === "maxlength" ? "12" : null, setSelectionRange() {}, dispatchEvent() {} };
  const ctx: any = { window: {}, Event: function () {}, document: { addEventListener: (type: string, fn: any) => { listeners[type] = fn; } } };
  vm.runInNewContext(DEMO_COPY_SCRIPT, ctx, { timeout: 1000 });
  for (const text of ["\u200e292455904513\u200e", "\u202a292455904513\u202c", " 292455904513 ", "٢٩٢٤٥٥٩٠٤٥١٣"]) {
    field.value = ""; field.selectionStart = field.selectionEnd = 0;
    let prevented = false;
    listeners.paste({ target: field, clipboardData: { getData: () => text }, preventDefault() { prevented = true; } });
    check(prevented && field.value === "292455904513", `الرقم الملصوق يدخل كاملاً ١٢ رقماً (${JSON.stringify(text)})`);
  }
  /* لصقٌ في وسط رقمٍ كامل لا يحذف من بقيّته: يُقصّ الملصوق وحده بقدر المتّسع. */
  field.value = "292455904513"; field.selectionStart = field.selectionEnd = 0;
  listeners.paste({ target: field, clipboardData: { getData: () => "1" }, preventDefault() {} });
  check(field.value === "292455904513", "لصقٌ في رقمٍ مكتمل لا يُسقط من آخره");
  field.value = "2924"; field.selectionStart = field.selectionEnd = 4;
  listeners.paste({ target: field, clipboardData: { getData: () => "55904513999" } , preventDefault() {} });
  check(field.value === "292455904513", "ويُقصّ الملصوق وحده بقدر ما بقي");
}
check(server.includes('data-demo-copy="${digits}"') && !server.includes('data-demo-copy-label') && (server.match(/\$\{DEMO_COPY_SCRIPT\}/g) || []).length >= 3 && fs.readFileSync(path.join(process.cwd(), "src/server/publicKit.ts"), "utf8").includes("+ DEMO_COPY_SCRIPT"), "الزرّ في تلميح الديمو ومعالجُه في صفحات الأستاذ والطالب كلِّها");

/* 7) «جرّب كأستاذ» تحت «جرّب كطالب» في شريط الديمو. */
const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
const studentAt = app.indexOf("جرّب كطالب</span>"), teacherAt = app.indexOf("جرّب كأستاذ</span>");
check(studentAt > 0 && teacherAt > studentAt && app.includes('href="/api/demo/teacher-card"'), "رابط «جرّب كأستاذ» يلي «جرّب كطالب» مباشرةً في شريط الديمو");
check(server.includes('app.get("/api/demo/teacher-card", requireAuth') && server.includes("Repository.isDemoRequest()") && server.includes("res.redirect(302, `/s/${encodeURIComponent(staff.id)}`)"), "مسارُ الديمو يفتح بطاقة الأستاذ أولاً (الرقم المدني) ثم منها طلب التعديل، ولا يعمل خارج الصندوق");
check(server.includes("!row.submittedAt && row.linkOpenedAt") && server.includes("await demoTeacherRequest())?.AdInstructorId") && server.includes('page === "staff" && !ownerId'), "أستاذُ التجربة فتح رابطه ولم يرسل، ورقمُه هو المقترح في بطاقته");
check(app.includes("demoScopeReset.current = Boolean(data.demo)") && app.includes("freshDemoLogin ||"), "الدخول الجديد للديمو يعيد الاختيار الجاهز ولو حمل المتصفح اختياراً قديماً");
check(app.includes("sectionId: DEMO_STAGE_SECTION_ID, termId: 1"), "الاختيار الافتراضي للديمو: كلية التربية الأساسية ← تكنولوجيا التعليم ← الفصل الأول 2026/2027");

console.log(`\nRequest day autofill audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
