/**
 * ── «مطابقة التسجيل» في مركز الاستعلام ────────────────────────────────────────
 * فحوصُ القسم لملفّ التسجيل بتواريخها: عدسةٌ في الاستعلامات للقسم وحده (قرار المالك 2026-11-20: «لنا فقط»)،
 * بثلاثة ألوان، وطباعتُه ورقة «طلب تعديل للتسجيل» نفسها. ولا تصل وارد التسجيل.
 */
import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const reports = read("src/components/Reports.tsx"), comp = read("src/components/RegistrarReport.tsx"), css = read("src/styles/75-registrar-report.css");
const changes = read("src/components/ScheduleChanges.tsx"), requests = read("src/components/RegistrarRequests.tsx"), index = read("src/index.css");

check(/type Lens = [^;]*"registrar"/.test(reports) && /\{ id: "registrar", label: "مطابقة التسجيل"/.test(reports), "L1 عدسة «مطابقة التسجيل» معرَّفةٌ بتسميتها");
check(["registrarDean", "registrarHead", "registrarStaff", "collegeRegistrar"].every(role => new RegExp(`${role}:\\s*\\[[^\\]]*\\]`).test(reports) && !new RegExp(`${role}:\\s*\\[[^\\]]*"registrar"`).test(reports)), "L2 الفحصُ للقسم: أدوارُ التسجيل لا ترى العدسة");
check(/lens === "registrar" \? \(\s*<React\.Suspense[\s\S]{0,400}<RegistrarReport /.test(reports) && /React\.lazy\(\(\) => import\("\.\/RegistrarReport"\)\)/.test(reports), "L3 العدسة تُحمَّل كسولاً وتُعرض في اللوحة");
check(/registrar: "مطابقة التسجيل"/.test(reports), "L4 عنوانُ التقرير في أسماء العدسات");

check(/data-action=\{/.test(comp) && /rpr-split/.test(comp) && /rpr-kpis/.test(comp) && /rpr-timeline/.test(comp), "U1 أرشيفٌ بالتواريخ ومؤشراتٌ وشريطُ أنواع");
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
