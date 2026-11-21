/**
 * ── «مطابقة التسجيل» في مركز الاستعلام ────────────────────────────────────────
 * فحوصُ القسم لملفّ التسجيل بتواريخها: عدسةٌ في الاستعلامات للقسم وحده (قرار المالك 2026-11-20: «لنا فقط»)،
 * بثلاثة ألوان، وطباعتُه ورقة «طلب تعديل للتسجيل» نفسها. ولا تصل وارد التسجيل.
 */
import fs from "node:fs";
import path from "node:path";
import { civilNoteFor, instructorNamesOf } from "../src/utils/registrarRequest";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const reports = read("src/components/Reports.tsx"), comp = read("src/components/RegistrarReport.tsx"), css = read("src/styles/75-registrar-report.css");
const changes = read("src/components/ScheduleChanges.tsx"), requests = read("src/components/RegistrarRequests.tsx"), index = read("src/index.css");

check(/type Lens = [^;]*"registrar"/.test(reports) && /\{ id: "registrar", label: "مطابقة التسجيل"/.test(reports), "L1 عدسة «مطابقة التسجيل» معرَّفةٌ بتسميتها");
check(["registrarDean", "registrarHead", "registrarStaff", "collegeRegistrar"].every(role => new RegExp(`${role}:\\s*\\[[^\\]]*\\]`).test(reports) && !new RegExp(`${role}:\\s*\\[[^\\]]*"registrar"`).test(reports)), "L2 الفحصُ للقسم: أدوارُ التسجيل لا ترى العدسة");
check(/lens === "registrar" \? \(\s*<React\.Suspense[\s\S]{0,400}<RegistrarReport /.test(reports) && /React\.lazy\(\(\) => import\("\.\/RegistrarReport"\)\)/.test(reports), "L3 العدسة تُحمَّل كسولاً وتُعرض في اللوحة");
check(/registrar: "مطابقة التسجيل"/.test(reports), "L4 عنوانُ التقرير في أسماء العدسات");

check(/data-action=\{/.test(comp) && /rpr-legend/.test(comp) && /rpr-kpis/.test(comp) && /rpr-timeline/.test(comp), "U1 أرشيفٌ بالتواريخ ومؤشراتٌ وأنواعٌ بألوانها");
check(/--rpr-edit:#9a6a12/.test(css) && /--rpr-add:#25684a/.test(css) && /--rpr-del:#973c38/.test(css), "U2 ثلاثة ألوان: كهرمانيّ وأخضر وأحمر");
check(/downloadSheets\(exportFileName\(\["مطابقة التسجيل"/.test(comp) && /الرقم المرجعي/.test(comp), "U3 تصديرُ Excel بالرقم المرجعي");
check(/previous|drift/.test(comp) && /زالت/.test(comp) && /جديدة/.test(comp), "U4 مقارنةٌ بالتقرير السابق (زالت وبقيت وجديدة)");
const checkCss = read("src/styles/72-registrar-check.css");
check(/printRegistrarRequest/.test(comp) && /export function printRegistrarRequest/.test(requests) && /print-color-adjust:exact/.test(checkCss) && /--rq-edit:#9a6a12/.test(checkCss), "P1 الطباعةُ بثلاثة ألوانٍ تحمل المعنى");
check(/<PrintLetterhead\b/.test(requests) && /className="print-report print-wide print-query-report print-registrar-report rrq-sheet"/.test(requests) && /className="print-explicit-page"/.test(requests) && /className="print-explicit-page-meta"/.test(requests), "P3 الورقة كبقية تقارير الاستعلام: صفحاتٌ عرضية صريحة، لكل صفحةٍ ترويستُها وترقيمُها");
check(/\.query-canvas-head\[data-lens="registrar"\]\{display:none\}/.test(css) && /data-lens=\{lens\}/.test(reports), "P2 رأسُ القائمة المشترك مخفيٌّ فوق التقرير");
check(!/<RegistrarRequests\b|<RegistrarRequestInbox\b/.test(changes), "C1 لا شريطَ طلباتٍ ولا واردَ للتسجيل في «تغييرات الجدول»");
check(/75-registrar-report\.css/.test(index), "C2 ملف التنسيق مستورد");
check(!/localStorage|sessionStorage/.test(comp), "S1 لا تخزين محلي: المصدر مسار الطلبات القائم");

/* شاشةُ الفحص: آخرُ فحصٍ عند الدخول، وما تغيّر عنه، والحفظُ في التقرير مع طريقه */
const check2 = read("src/components/RegistrarPdfCheck.tsx"), util = read("src/utils/registrarRequest.ts");
check(check2.includes("احفظ في تقرير المطابقة") && !check2.includes("احفظ طلب التعديل"), "F1 زرُّ الحفظ «احفظ في تقرير المطابقة»");
check(/className="rpc-last"/.test(check2) && check2.includes("آخر فحص محفوظ"), "F2 آخرُ فحصٍ محفوظ يظهر عند الدخول");
check(/className="rpc-drift"/.test(check2) && /زالت/.test(check2) && /بقيت/.test(check2) && /جديدة/.test(check2), "F3 ما زال وما بقي وما جدّ عن آخر فحص");
check((check2.match(/onClick=\{openMatchReport\}/g) || []).length >= 2 && /"schedule-report-lens", "registrar"/.test(read("src/utils/openMatchReport.ts")) && /takeLensRequest\(\)/.test(reports), "F4 «افتح التقرير» يفتح عدسة المطابقة");
check(/const positive = \(item: RegistrarRequestItem\)/.test(util) && /if \(!item\.done\) \{\s*if \(positive\(item\)\)/.test(util), "F5 البندُ المفتوح يتأكّد بدليلٍ موجب بلا شطب");

/* ملاحظاتنا على ملف التسجيل: ورقةٌ بتقصيرهم وحده، وبطاقةُ متابعةٍ تحت «تغييرات الجدول» للقسم */
const sheet = read("src/components/RegistrarRequests.tsx"), follow = read("src/components/RegistrarFollowUp.tsx"), importRoutes = read("src/server/routes/scheduleImportRoutes.ts");
check(/theirsOnly/.test(sheet) && /theirsOnly\s*\? doc\.items\.filter\(isTheirs\)/.test(sheet) && /"ملاحظات على ملف التسجيل"/.test(sheet), "N1 ورقةُ «ملاحظات على ملف التسجيل» بما أُرسل ولم يظهر في ملفهم وحده");
check(/doc\.sent/.test(sheet) && /sent:\{round:/.test(importRoutes), "N2 سطرُ الإثبات: جولةُ الإرسال وتاريخُه محفوظان في الطلب");
check(/isTheirs/.test(comp) && /printNotes/.test(comp) && /theirsOnly=\{notesMode\}/.test(comp), "N3 زرُّ «ملاحظاتهم للتسجيل» يطبع الورقة المصفّاة");
check(/RegistrarFollowUp/.test(changes) && /!isRegistrar \? <RegistrarFollowUp/.test(changes), "N4 بطاقةُ المتابعة تحت «تغييرات الجدول» للقسم لا للتسجيل");
check(/notesCohort/.test(follow) && !/fetch\([^)]*,\s*\{[^}]*method/.test(follow), "N5 البطاقةُ تقرأ ولا تكتب: الفحصُ التالي هو الدليل");

/* الورقة على الجوال: عرضٌ بالمليمتر لا بعرض الشاشة، وسجلُّ الفحوص، و«باقٍ منذ» */
check(/stampPrintEngine\(root\)/.test(requests) && /fitPrintPages\(scope\)/.test(requests) && /packPrintLines\(/.test(requests) && !/@page rrequest/.test(checkCss), "P4 تُطبع بمطبعة الاستعلام نفسها: تدويرُ Safari وهندسةُ Chromium والملءُ والتصفيح");
check(/className="rrq-trail"/.test(requests) && /سجلّ الفحوص/.test(requests) && /history=\{docs \|\| \[\]\}/.test(comp), "P5 سجلُّ الفحوص: كلُّ رفعٍ بتاريخه وما زال وما بقي وما جدّ");
check(/باقٍ منذ/.test(requests) && /firstSeen/.test(requests), "P6 البندُ المتكرّر يُعلَّم «باقٍ منذ» أولِ فحصٍ ظهر فيه");

/* التقرير على جدولنا الآن: صفوفُ ملفهم محفوظة، ويُعاد الحساب عند الفتح، وينبّه المحرّر */
{
  const live = await import("../src/utils/registrarRequest");
  const base = (id: string, ours: string): any => ({ id, action: "edit", group: "mismatch", kind: "fields", courseCode: "0109105", courseName: "x", section: "1", fields: [{ field: "room", label: "القاعة", ours, pdf: "118" }] });
  const savedItems = [{ ...base("edit:#1", "101"), done: { by: 1, byName: "x", at: "t" } }, base("edit:#2", "102"), { ...base("edit:#3", "103"), state: "confirmed" as const }];
  const out = live.liveRequestItems(savedItems, [base("edit:#1", "101"), base("edit:#3", "999"), base("edit:#4", "104")]);
  check(out.gone === 1, "R1 بندٌ لم يعد فرقاً يُعدّ «زال»");
  check(Boolean(out.items.find(i => i.id === "edit:#1")?.done) && !out.items.find(i => i.id === "edit:#1")?.since, "R2 البندُ القائم يحتفظ بشطبه بلا علامة");
  check(out.items.find(i => i.id === "edit:#4")?.since === "new", "R3 ما استجدّ بعد الفحص يُعلَّم «جديد بعد الفحص»");
  const changedItem = out.items.find(i => i.id === "edit:#3");
  check(changedItem?.since === "changed" && changedItem?.state !== "confirmed", "R4 بندٌ تغيّرت قيمُه يُعلَّم ولا يحمل «تأكّد» القديم");
  const reDone = live.liveRequestItems([{ ...base("edit:#9", "101"), done: { by: 1, byName: "x", at: "t" } }], [base("edit:#9", "999")]).items[0];
  check(!reDone.done && reDone.lastDone?.byName === "x" && live.requestProgress([reDone]).open === 1, "R4b بندٌ مشطوب تغيّر مطلوبُه يعود مفتوحاً والشطبُ أثر");
}
check(/"registrarRequestRows",doc\.id,\{id:doc\.id/.test(importRoutes) && /registrar-requests\/:id\/live/.test(importRoutes) && /deleteFeatureDoc\("registrarRequestRows",id\)/.test(importRoutes), "R5 صفوفُ الملف تُحفظ مع الفحص وتُحذف معه، ومسارُ القراءة الحيّة قائم");
check(/className="rpr-live"/.test(comp) && /يوم الفحص/.test(comp) && /asOf=\{showingNow/.test(comp) && /canTick=\{canTick && !showingNow\}/.test(comp), "R6 التقرير يُعرض «الآن» أو «يوم الفحص»، والطباعة تذكر تاريخ جدولنا");
check(/<RegistrarCheckNote\b/.test(read("src/components/Schedules.tsx")) && /forgetRegistrarCheckKeys\(\)/.test(check2), "R7 تنبيهُ «في فحص التسجيل» تحت شريط التراجع، ويُنسى بعد فحصٍ جديد");
check(/changes-kind-filter/.test(changes) && /changes-row-tools/.test(changes) && /const activeKind = /.test(changes), "R8 «تغييرات الجدول»: مرشّحُ النوع، وزرّا الموعد في سطرٍ صغير");

check(/export function armRegistrarPrint/.test(requests) && /addEventListener\("afterprint", later/.test(requests) && /addEventListener\("pointerdown", done/.test(requests) && /addEventListener\("beforeprint", onBefore\)/.test(comp), "P5 سماتُ الطباعة لا تُرفع عند afterprint نفسه (iPhone)، وطباعةُ قائمة المتصفّح تأخذها");

check(/edit: "التعديل", add: "الإضافة", delete: "الحذف"/.test(read("src/utils/registrarRequest.ts")) && /شعب لم يعدّلها مكتب التسجيل بعد/.test(read("src/utils/registrarRequest.ts")) && /<th>الحالي \(الخطأ\) ← المطلوب<\/th>/.test(requests), "S1 عناوينُ الأقسام وأوصافُها ورأسا عمودَي الشعبة والحالي ← المطلوب كما أقرّها المالك");
check(/civilLine\(item\)/.test(requests) && /oursIds/.test(read("src/utils/registrarRequest.ts")) && /civilOf=\{civilReadable \?/.test(reports) && !/AdInstructorCivil|instructorCivil/.test(read("src/utils/registrarRequest.ts")), "S2 الرقمُ المدني بجانب الأستاذ يُقرأ بصلاحية القارئ ولا يُخزَّن في البند (معرّفاتٌ فقط)");
check(/shortCourseCode\(item\.courseCode\)/.test(requests), "S3 رمزُ المقرر على الورقة ثلاثُ خاناتٍ في كل الأقسام");

{
  const hidden = civilNoteFor([7], () => undefined), none = civilNoteFor([7], () => ""), one = civilNoteFor([7, 8], id => (id === 7 ? "123456789012" : "")), noRead = civilNoteFor([7]);
  check(hidden.kind === "hidden" && noRead.kind === "hidden" && civilNoteFor([], () => "1").kind === "hidden", "S4 من لا يحقّ له الرقمَ المدني لا يُكتب له شيء");
  check(none.kind === "missing" && /بلا رقم مدني/.test(requests), "S5 من يحقّ له والأستاذُ بلا رقمٍ مسجَّل: تُكتب «بلا رقم مدني» لا فراغٌ صامت");
  check(one.kind === "shown" && one.civils.join() === "123456789012" && /civilReadable/.test(reports), "S6 الأرقامُ المسجَّلة تُكتب، والقراءةُ تتبع صلاحية القارئ");
}
check(/const civils:Record<string,string>=\{\}/.test(importRoutes) && /wanted\.has\(id\)&&civil/.test(importRoutes) && /civils\?: Record<string, string>/.test(read("src/utils/registrarRequest.ts")) && /liveView\?\.civils/.test(comp), "S7 الرقمُ المدني يصل مع القراءة الحيّة لأساتذة التقرير وحدهم ولمن يقرأ فحوص القسم، ولا يُخزَّن");
check(/font-size:5\.95pt!important/.test(checkCss) && /height:5\.32mm/.test(checkCss) && /ROW_MM = 5\.4/.test(requests), "S8 كثافةُ ورقة المطابقة كثافةُ تقرير تغييرات الجدول (٥٫٩٥pt وسطر ٥٫٣٢ مم)، وتُرصّ البنود بالمليمتر");
check(/html\[data-print-rotate="1"\]:not\(\[data-print-fit-measure\]\) \.print-report\.print-wide\.print-registrar-report \.print-explicit-page:last-child/.test(checkCss), "S9 تحويلُ الصفحة الأخيرة في Safari لا يُطبَّق وقتَ القياس، فلا تُصغَّر الورقة");
check(instructorNamesOf({ fields: [{ field: "instructor", label: "", ours: "د.  أ  ب · د. ج", pdf: "—" }] } as any).join("|") === "د. أ ب|د. ج" && instructorNamesOf({ fields: [{ field: "instructor", label: "", ours: "—", pdf: "" }] } as any).length === 0, "S10 أسماءُ أساتذتنا في البند المحفوظ تُقرأ من حقل الأستاذ");
check(/civilsByName\[name\]=list\[0\]/.test(importRoutes) && /list\.length===1/.test(importRoutes) && /civilOfName=\{civilOfName\}/.test(comp), "S11 الورقةُ المحفوظة بلا معرّفات: الرقمُ المدني باسم الأستاذ حين يدلّ على أستاذٍ واحدٍ فقط");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
