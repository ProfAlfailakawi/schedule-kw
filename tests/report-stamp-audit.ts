/**
 * ── ختم الورقة المطبوعة، وترويسة الشامل على تقرير التغييرات ─────────────────
 *
 * الشامل وتقرير التغييرات يحملان في ذيلهما رمز QR صغيراً: من يمسك الورقة
 * يمسحه فيعرف إن كانت ما زالت مطابقةً للجدول، وأيُّ سطرٍ فيها تغيّر. وترويسة
 * الشامل هي المعتمدة (قرار المالك 2026-10-29)، فيلبسها تقرير التغييرات كما هي.
 *
 * هذا الاختبار يحرس: ثبات الرمز ومعناه، والمقارنة صفاً صفاً، وأن التسجيل بعد
 * الطباعة لا قبلها، وأن الذيل لا يطول، وأن صفحة التحقق لا تكشف اسماً ولا رقماً
 * مدنياً.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  REPORT_STAMP_MAX_ROWS, buildReportStamp, compareReportStamp, formatReportStampCode, normalizeReportStampCode,
  reportStampCode, reportStampUrl, stampRowHash, stampRowValues, type ReportStampRecord,
} from "../src/utils/reportStamp";
import { reportStampPage } from "../src/server/reportStampPage";
import PrintStamp from "../src/components/PrintStamp";
import type { FSchedule } from "../src/types";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const row = (id: number, patch: Partial<FSchedule> = {}): FSchedule => ({
  id, AdCollegeId: 5, AdSectionId: 6, AdTermId: 107, AdCourseId: 2562, AdCourseName: "أسس تكنولوجيا التعليم", SCode: String(500 + id),
  AdInstructorId: 25, fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false,
  fstarttime: "11:00", fendtime: "12:20", AdRoomCode: "011B17", AdRoomHall: "G23", ...patch,
} as FSchedule);
const courseById = new Map([[2562, { CourseCode: "105", CourseName: "أسس تكنولوجيا التعليم", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 }]]);
const site = [{ collegeId: 5, sectionId: 6 }];
const rows = [row(1), row(2), row(3)];
const stamp = (list: FSchedule[], wholeScope = true) => buildReportStamp({ kind: "comprehensive", termId: 107, sites: site, wholeScope, rows: list, courseById })!;

/* ── الرمز: من مضمون الورقة، ثابتٌ ومعناه واحد ──────────────────────────── */
const base = stamp(rows);
check(/^[0-9A-HJKMNP-TV-Z]{8}$/.test(base.code), "الرمز ثمانية محارف من أبجدية Crockford (لا I ولا L ولا O ولا U)");
check(stamp([row(3), row(1), row(2)]).code === base.code, "ترتيب الصفوف لا يغيّر الرمز: الورقة نفسها تعطي الختم نفسه");
check(stamp(rows).code === base.code, "والطباعة الثانية للمضمون نفسه تعطي الختم نفسه");
check(stamp([row(1), row(2), row(3, { fstarttime: "12:30", fendtime: "13:50" })]).code !== base.code, "تغيير وقت صفٍّ واحد يغيّر الرمز");
check(stamp([row(1), row(2), row(3, { AdRoomHall: "F04" })]).code !== base.code, "وتغيير القاعة يغيّره");
check(stamp([row(1), row(2), row(3, { AdInstructorId: 26 })]).code !== base.code, "وتغيير المدرس يغيّره");
check(stamp([row(1), row(2), row(3, { fthursday: true })]).code !== base.code, "وتغيير الأيام يغيّره");
check(stamp([row(1), row(2)]).code !== base.code, "وورقةٌ ينقصها صف لها ختمٌ آخر");
check(stamp(rows, false).code !== base.code, "والورقة المرشّحة غير الورقة الكاملة وإن تطابقت صفوفها");
check(buildReportStamp({ kind: "authority-pdf", termId: 107, sites: site, draftIds: ["d1"], wholeScope: true, rows, courseById })!.code !== base.code, "ونوع الورقة جزءٌ من الختم");
check(buildReportStamp({ kind: "authority-pdf", termId: 107, sites: site, draftIds: ["d1"], wholeScope: true, rows, courseById })!.code
  !== buildReportStamp({ kind: "authority-pdf", termId: 107, sites: site, draftIds: ["d2"], wholeScope: true, rows, courseById })!.code, "وملف الهيئة الذي قورن به تقرير التغييرات جزءٌ منه");
check(stamp([row(1, { fstarttime: "8:00", fendtime: "9:15" })]).code === stamp([row(1, { fstarttime: "08:00", fendtime: "09:15" })]).code, "«8:00» و«08:00» وقتٌ واحد");
check(reportStampCode(base) === base.code, "والخادم يعيد حساب الرمز نفسه من الصفوف المرسلة");
check(buildReportStamp({ kind: "comprehensive", termId: 107, sites: [{ collegeId: 5, sectionId: 0 }], wholeScope: true, rows, courseById }) === null, "ورقةٌ بلا قسمٍ محدد تُطبع بلا ختم");
check(buildReportStamp({ kind: "comprehensive", termId: 107, sites: site, wholeScope: true, rows: [], courseById }) === null, "وورقةٌ بلا صفوف بلا ختم");
check(buildReportStamp({ kind: "comprehensive", termId: 107, sites: site, wholeScope: true, rows: Array.from({ length: REPORT_STAMP_MAX_ROWS + 1 }, (_, index) => row(index + 1)), courseById }) === null, "وما فوق حدّ الصفوف يُطبع بلا ختم ولا يُثقل السجلّ");

/* ── الرمز كما يُكتب باليد، ورابطه كما يُرسم ──────────────────────────────── */
check(normalizeReportStampCode("qt5j-z358") === "QT5JZ358", "الرمز يُقبل صغيراً وبشرطة");
check(normalizeReportStampCode("QT5J Z358") === "QT5JZ358", "وبمسافة");
check(normalizeReportStampCode("OT5J-Z358") === "0T5JZ358", "وحرف O يُقرأ صفراً");
check(normalizeReportStampCode("lT5J-Z358") === "1T5JZ358", "وحرف l يُقرأ واحداً");
check(normalizeReportStampCode("QT5J-Z35U") === "" && normalizeReportStampCode("QT5J") === "" && normalizeReportStampCode("<script>") === "", "وما ليس رمزاً يُرد");
check(formatReportStampCode("QT5JZ358") === "QT5J-Z358", "ويُطبع على الورقة بشرطة في وسطه");
check(reportStampUrl("https://schedule-kw.com", "QT5JZ358") === "HTTPS://SCHEDULE-KW.COM/V/QT5JZ358", "الرابط بالحروف الكبيرة ليُرسم في وضع «الحروف والأرقام» الأكثف");
check(reportStampUrl("https://my_host.test", "QT5JZ358") === "https://my_host.test/v/QT5JZ358", "وأصلٌ فيه ما لا يقبله ذلك الوضع يبقى كما هو");

/* ── المقارنة صفاً صفاً ───────────────────────────────────────────────────── */
const record = (claim = base, staleRowIds: number[] = []): ReportStampRecord => ({
  ...claim, staleRowIds, firstPrintedAt: "2026-10-29T08:00:00.000Z", lastPrintedAt: "2026-10-29T08:00:00.000Z", printCount: 1,
  rows: claim.rows.map(saved => {
    const live = rows.find(item => item.id === saved.id)!;
    return { id: saved.id, s: 6, v: stampRowValues(live, courseById.get(live.AdCourseId)) };
  }),
});
check(base.rows.every(saved => saved.h === stampRowHash(saved.id, stampRowValues(rows.find(item => item.id === saved.id)!, courseById.get(2562)))), "بصمة الصف في المتصفح هي بصمته في الخادم: دالةٌ واحدة للطرفين");
const same = compareReportStamp(record(), rows, courseById);
check(!same.changed.length && !same.removed.length && !same.added.length, "ورقةٌ لم يتغيّر شيءٌ من صفوفها مطابقة");
const moved = compareReportStamp(record(), [row(1), row(2, { fstarttime: "14:00", fendtime: "15:20", AdRoomHall: "F04" }), row(3)], courseById);
check(moved.changed.length === 1 && moved.changed[0].id === 2 && moved.changed[0].fields.join("،") === "الوقت،المبنى والقاعة", "الصف الذي تغيّر يُسمّى، ومعه الحقول التي تغيّرت فيه فقط");
const gone = compareReportStamp(record(), [row(1), row(3)], courseById);
check(gone.removed.length === 1 && gone.removed[0].id === 2 && gone.removed[0].values[2] === "502", "والصف المحذوف يُعرف بما كان في الورقة");
const grown = compareReportStamp(record(), [...rows, row(9)], courseById);
check(grown.added.length === 1 && grown.added[0].id === 9, "والموعد الجديد في نطاق ورقةٍ كاملة نقصٌ فيها");
check(compareReportStamp({ ...record(), wholeScope: false }, [...rows, row(9)], courseById).added.length === 0, "أما الورقة المرشّحة فلا تُطالَب بما لم يكن من نطاقها");
const stale = compareReportStamp(record(base, [3]), rows, courseById);
check(stale.changed.length === 1 && stale.changed[0].beforePrint, "صفٌّ طُبع من شاشةٍ لم تُحدَّث يُقال عنه ذلك");

/* ── الختم على الورقة ─────────────────────────────────────────────────────── */
const svg = renderToStaticMarkup(React.createElement(PrintStamp, { code: "QT5JZ358", origin: "https://schedule-kw.com" }));
check(/<svg[^>]*class="print-stamp-qr"/.test(svg) && /<path d="M/.test(svg), "الختم يُرسم مربعاً متجهياً (SVG) بمسارٍ واحد");
check(svg.includes('viewBox="-1 -1 27 27"'), "رمز الإصدار الثاني (٢٥×٢٥): مربعاتٌ أكبر في المساحة نفسها، فيُمسح من الورقة بسهولة");
check(svg.includes("QT5J-Z358"), "والرمز مكتوبٌ بجانبه لمن يكتبه بيده");
check(renderToStaticMarkup(React.createElement(PrintStamp, { code: null })) === "", "وبلا رمز لا ختم: الورقة كما كانت");

/* ── الورقتان ─────────────────────────────────────────────────────────────── */
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const reports = read("src/components/Reports.tsx");
const authority = read("src/components/AuthorityPdfReport.tsx");
const css = read("src/styles/08-print.css");
/* طرقُ الختم في وحدة التقارير منذ تقسيم server.ts (docs/SERVER_MAP.md). */
const server = read("src/server/routes/reportsRoutes.ts");
const page = read("src/server/reportStampPage.ts");

check(/<PrintComprehensiveHead\s+title="تقرير القسم العلمي الشامل"/.test(reports), "الشامل يرسم ترويسته من المكوّن الواحد");
check(/<PrintComprehensiveHead\s+title="تقرير تغييرات الجدول"/.test(authority), "وتقرير التغييرات يلبس ترويسة الشامل نفسها بعنوانه هو");
check(!/authority-pdf-scope-grid|authority-pdf-head|authority-pdf-title/.test(authority + css), "ولا بقاء لترويسته القديمة في الشيفرة ولا في الطباعة");
check(/has-print-stamp/.test(reports) && /<PrintStamp code=\{stampCode\}/.test(reports), "ذيل الشامل يحمل الختم على كل صفحة");
check(/has-print-stamp/.test(authority) && /<PrintStamp code=\{stampCode\}/.test(authority), "وذيل تقرير التغييرات كذلك");
const footerRule = css.match(/\.print-comprehensive-page-footer\.has-print-stamp\{[^}]*\}/)?.[0] || "";
check(/"stamp legend signatures"/.test(footerRule), "الختم عمودٌ ثالث في الطرف الأيسر؛ المفتاح والتواقيع في مكانهما");
const qrSize = Number(css.match(/\.print-stamp-qr\{[^}]*height:([\d.]+)mm/)?.[1] || 99);
check(qrSize <= 11.5, "وارتفاعه دون خانات التوقيع (١١٫٥ مم): الذيل لا يطول، فلا يسقط صفٌّ من الصفحة");

/* ── التسجيل بعد الطباعة، لا قبلها ────────────────────────────────────────── */
check((reports.match(/sendReportStamp\(printedStamp\)/g) || []).length === 3, "ثلاثة أوامر طباعة رسمية تسجّل ختمها: الشامل، والفروع، والتغييرات");
check(!/await\s+sendReportStamp/.test(reports) && !/sendReportStamp\([^)]*\);\s*\n\s*(?:let invoked|if \(!invoked\) window\.print)/.test(reports), "ولا انتظار ولا طلب شبكة بين الضغطة وأمر الطباعة");
for (const fn of ["const printReport = ", "const runPrint = ", "const printAuthorityReport = "]) {
  const body = reports.slice(reports.indexOf(fn), reports.indexOf(fn) + 6000);
  const resume = body.indexOf("const resume = () => {");
  check(resume > 0 && body.indexOf("sendReportStamp(printedStamp)") > resume, `${fn.replace("const ", "").replace(" = ", "")}: الختم يُسجَّل حين تنتهي الطباعة (resume)`);
}

/* ── الخادم وصفحة التحقق ──────────────────────────────────────────────────── */
const route = server.slice(server.indexOf('app.post("/api/report-stamps"'), server.indexOf('app.post("/api/report-stamps"') + 4000);
check(/requireAuth/.test(route) && /isScopeAllowed/.test(route), "التسجيل لصاحب حساب، داخل صلاحيات أقسامه");
check(/reportStampCode\(\{ kind, termId, sites, draftIds, wholeScope, rows: claimed \}\) !== code/.test(route), "والخادم يرفض ختماً لا يطابق صفوفه");
check(/stampRowValues\(current/.test(route) && /staleRowIds/.test(route), "ويحفظ قيم الصفوف كما في الجدول هو، ويعلّم ما رآه المتصفح قديماً");
check(/app\.get\(\["\/v", "\/v\/:code"\], rateLimitReportStampPage/.test(server) && /publicPageNonce\(res\)/.test(server.slice(server.indexOf('app.get(["/v"'), server.indexOf('app.get(["/v"') + 800)), "صفحة التحقق عامة بحدٍّ لكل عنوان وبسياسة أمان الصفحات العامة");
check(!/Civil|InstructorName|AdInstructorId/.test(page), "وصفحة التحقق لا تقرأ اسماً ولا رقماً مدنياً أصلاً");
const html = reportStampPage({ state: "outdated", code: "QT5JZ358", kindLabel: "تقرير تغييرات الجدول", rowCount: 3, changed: [{ course: "0109105", name: "<script>alert(1)</script>", section: "502", fields: ["الوقت"] }] });
check(html.includes("تغيّر الجدول بعد طباعة هذه الورقة") && html.includes("0109105") && html.includes("QT5J-Z358"), "الورقة القديمة تُقال قديمة، ومعها رقم المقرر بسبع خانات والسطر الذي تغيّر");
check(!html.includes("<script>") && html.includes("&lt;script&gt;"), "وكل نصٍّ فيها مُهرَّب");
check(!/<script/i.test(reportStampPage({ state: "ask" })), "والصفحة بلا سكربت");
check(reportStampPage({ state: "current", code: "QT5JZ358", rowCount: 3 }).includes("الورقة مطابقة للجدول الآن"), "والمطابقة تُقال مطابقة");

console.log(`\nreport stamp audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
