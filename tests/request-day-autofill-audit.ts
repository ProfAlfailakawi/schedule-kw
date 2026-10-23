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

/* 6) زرُّ «نسخ الرقم» في تلميح الديمو. */
const copyBox: any = { listeners: {} };
const clicks: any[] = [];
const button: any = {
  attrs: { "data-demo-copy": "289012345678", }, flags: {} as Record<string, string>,
  getAttribute(name: string) { return this.attrs[name] ?? null; }, setAttribute(name: string, value: string) { this.flags[name] = value; }, removeAttribute(name: string) { delete this.flags[name]; },
  querySelector() { return label; },
};
const label: any = { textContent: "نسخ الرقم" };
let copied = "";
const ctx: any = {
  window: {}, clearTimeout() {}, setTimeout: (fn: () => void) => { clicks.push(fn); return 1; },
  navigator: { clipboard: { writeText: (text: string) => { copied = text; return { then: (ok: () => void) => { ok(); } }; } } },
  document: { addEventListener: (type: string, fn: any) => { copyBox.listeners[type] = fn; } },
};
vm.runInNewContext(DEMO_COPY_SCRIPT, ctx, { timeout: 1000 });
copyBox.listeners.click({ target: { closest: (sel: string) => sel === "[data-demo-copy]" ? button : null }, preventDefault() {} });
check(copied === "289012345678", "الزرُّ ينسخ الرقم كاملاً (data-demo-copy)");
check(label.textContent === "تم النسخ" && button.flags["data-copied"] === "1", "ويقول «تم النسخ» ثم يعود");
clicks.forEach(fn => fn());
check(label.textContent === "نسخ الرقم" && !("data-copied" in button.flags), "بعد لحظةٍ يعود إلى «نسخ الرقم»");
const before = Object.keys(copyBox.listeners).length;
vm.runInNewContext(DEMO_COPY_SCRIPT, ctx, { timeout: 1000 });
check(Object.keys(copyBox.listeners).length === before, "الحشوُ المزدوج لا يضيف مستمعاً ثانياً");
check(server.includes('data-demo-copy="${digits}"') && (server.match(/\$\{DEMO_COPY_SCRIPT\}/g) || []).length >= 3 && fs.readFileSync(path.join(process.cwd(), "src/server/publicKit.ts"), "utf8").includes("+ DEMO_COPY_SCRIPT"), "الزرّ في تلميح الديمو ومعالجُه في صفحات الأستاذ والطالب كلِّها");

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
