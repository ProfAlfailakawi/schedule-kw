/**
 * ── «مطابقة التسجيل» في مركز الاستعلام ────────────────────────────────────────
 * تقريرُ ما بين جدولنا وملفّ التسجيل بتواريخه: عدسةٌ في الاستعلامات (للقسم وللتسجيل المراجع)،
 * بثلاثة ألوان، وطباعتُه هي ورقة «طلب تعديل للتسجيل» نفسها. وتحت «تغييرات الجدول» يبقى للتسجيل وحده.
 */
import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const reports = read("src/components/Reports.tsx"), comp = read("src/components/RegistrarReport.tsx"), css = read("src/styles/75-registrar-report.css");
const changes = read("src/components/ScheduleChanges.tsx"), requests = read("src/components/RegistrarRequests.tsx"), index = read("src/index.css");

check(/type Lens = [^;]*"registrar"/.test(reports) && /\{ id: "registrar", label: "مطابقة التسجيل"/.test(reports), "L1 عدسة «مطابقة التسجيل» معرَّفةٌ بتسميتها");
check(["registrarDean", "registrarHead", "registrarStaff", "collegeRegistrar"].every(role => new RegExp(`${role}:\\s*\\[[^\\]]*"registrar"`).test(reports)), "L2 التسجيلُ المراجع يرى العدسة");
check(/lens === "registrar" \? \(\s*<React\.Suspense[\s\S]{0,400}<RegistrarReport /.test(reports) && /React\.lazy\(\(\) => import\("\.\/RegistrarReport"\)\)/.test(reports), "L3 العدسة تُحمَّل كسولاً وتُعرض في اللوحة");
check(/registrar: "مطابقة التسجيل"/.test(reports), "L4 عنوانُ التقرير في أسماء العدسات");

check(/data-action=\{/.test(comp) && /rpr-split/.test(comp) && /rpr-kpis/.test(comp) && /rpr-timeline/.test(comp), "U1 أرشيفٌ بالتواريخ ومؤشراتٌ وشريطُ أنواع");
check(/--rpr-edit:#9a6a12/.test(css) && /--rpr-add:#25684a/.test(css) && /--rpr-del:#973c38/.test(css), "U2 ثلاثة ألوان: كهرمانيّ وأخضر وأحمر");
check(/downloadSheets\(exportFileName\(\["مطابقة التسجيل"/.test(comp) && /الرقم المرجعي/.test(comp), "U3 تصديرُ Excel بالرقم المرجعي");
check(/previous|drift/.test(comp) && /زالت/.test(comp) && /جديدة/.test(comp), "U4 مقارنةٌ بالتقرير السابق (زالت وبقيت وجديدة)");
check(/printRegistrarRequest/.test(comp) && /export function printRegistrarRequest/.test(requests) && /print-color-adjust:exact/.test(css), "P1 الطباعةُ بورقة «طلب تعديل للتسجيل» وبألوانها");
check(/\.query-canvas-head\[data-lens="registrar"\]\{display:none\}/.test(css) && /data-lens=\{lens\}/.test(reports), "P2 رأسُ القائمة المشترك مخفيٌّ فوق التقرير");
check(/\{isRegistrar \? \(\s*<RegistrarRequests/.test(changes), "C1 تحت «تغييرات الجدول» للتسجيل وحده");
check(/75-registrar-report\.css/.test(index), "C2 ملف التنسيق مستورد");
check(!/localStorage|sessionStorage/.test(comp), "S1 لا تخزين محلي: المصدر مسار الطلبات القائم");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
