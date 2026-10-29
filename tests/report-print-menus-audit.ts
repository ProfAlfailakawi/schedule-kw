/**
 * ── أزرار الطباعة في مركز الاستعلامات تُخرج ورقةً لها محتوى ───────────────────
 *
 * ملاحظات المالك 2026-10-29: «تقرير الأستاذ ما يعمل»، و«المقررات × القاعات»
 * و«لوحة القرار» لا تعمل، و«المنتدبون» يحتاجان تنسيقاً. الأسباب:
 *
 *   ١. قائمة «تقرير الأستاذ» (الكلية المحددة / الكل) كانت ترجع بصمتٍ إن لم
 *      يُختر أستاذٌ بعينه — وهي حال الشاشة أول ما تُفتح — فلا ورقة ولا رسالة
 *      وتبقى القائمة مفتوحة.
 *   ٢. «المقررات × القاعات» و«لوحة القرار» لم تكن لهما ورقة طباعة أصلاً
 *      (PrintKind كان يستثنيهما) وزرّ «طباعة هذا العرض» ظاهرٌ فيهما، فيخرج
 *      ورقةً بيضاء عنوانها «SCHEDULE · undefined».
 *   ٣. شريط الختم والتوقيع الثابت يقطع الورقة المدوَّرة في Safari.
 *
 * يحرس هذا الاختبار القاعدة (من يدخل تقرير الأستاذ)، ووسوم المواقع، وأن لكل
 * عدسةٍ ورقة، وأن القائمة لا ترجع بصمت.
 */
import fs from "fs";
import path from "path";
import { instructorReportScope } from "../src/utils/instructorReportScope";
import { compactCampusLabels } from "../src/utils/campusChips";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const names: Record<number, string> = { 1: "أحمد علي", 2: "سارة يوسف", 3: "أحمد خالد", 9: "منى سالم" };
const base = { normalize: (value: string) => value, nameOf: (id: number) => names[id] || "" };

/* ١. من يدخل تقرير الأستاذ */
{
  const none = instructorReportScope({ ...base, instructorId: 0, instructorQuery: "", viewInstructorIds: [1, 2, 2, 0] });
  check(none.ok === true, "بلا أستاذٍ مختار: التقرير يُعدّ (لا رجوع صامت)");
  if (none.ok) {
    check(none.matches({ AdInstructorId: 1 }) && none.matches({ AdInstructorId: "2" }), "بلا أستاذٍ مختار: أساتذة العرض كلهم داخلون");
    check(!none.matches({ AdInstructorId: 9 }), "بلا أستاذٍ مختار: من ليس في العرض لا يدخل");
    check(!none.matches({ AdInstructorId: 0 }) && !none.matches({ AdInstructorId: null }), "صفٌّ بلا أستاذ لا يدخل تقرير الأستاذ");
    check(none.count === 2, "العدد أساتذةٌ فريدون لا صفوف");
  }
  const chosen = instructorReportScope({ ...base, instructorId: 3, instructorQuery: "", viewInstructorIds: [1, 2] });
  check(chosen.ok === true && chosen.matches({ AdInstructorId: 3 }) && !chosen.matches({ AdInstructorId: 1 }), "أستاذٌ مختار: هو وحده ولو لم يكن في العرض");
  const byName = instructorReportScope({ ...base, instructorId: 0, instructorQuery: "أحمد", viewInstructorIds: [1] });
  check(byName.ok === true && byName.matches({ AdInstructorId: 3 }) && byName.matches({ AdInstructorId: 1 }) && !byName.matches({ AdInstructorId: 2 }), "بحثٌ بالاسم يطابق عبر الكليات");
  const civil = instructorReportScope({ ...base, instructorId: 0, instructorQuery: "2801", viewInstructorIds: [] });
  check(civil.ok === false, "بحثٌ بالرقم المدني بلا نتائج في العرض: رسالةٌ لا ورقة فارغة");
  const empty = instructorReportScope({ ...base, instructorId: 0, instructorQuery: "", viewInstructorIds: [] });
  check(empty.ok === false && "reason" in empty && empty.reason.length > 0, "لا أحد في العرض: رسالةٌ تقول ذلك");
}

/* ٢. وسوم المواقع في رأس «المنتدبون — الفصل الحالي» */
{
  const long = compactCampusLabels(["كلية التربية الأساسية - بنات", "كلية التربية الأساسية - بنين", "كلية التربية الأساسية - الجهراء - بنات", "كلية التربية الأساسية - بنات - الفحيحيل"]);
  check(long.base === "كلية التربية الأساسية", "الجزء المشترك يُقال مرةً واحدة");
  check(JSON.stringify(long.chips) === JSON.stringify(["بنات", "بنين", "الجهراء - بنات", "بنات - الفحيحيل"]), "كل موقعٍ وسمٌ قصير بترتيبه");
  const one = compactCampusLabels(["كلية التربية الأساسية - بنات"]);
  check(one.base === "" && one.chips.length === 1 && one.chips[0] === "كلية التربية الأساسية - بنات", "موقعٌ واحد: اسمه كاملاً");
  const mixed = compactCampusLabels(["كلية التربية الأساسية", "كلية التربية الأساسية - الجهراء"]);
  check(mixed.base === "كلية التربية الأساسية" && mixed.chips[0] === "كلية التربية الأساسية" && mixed.chips[1] === "الجهراء", "اسمٌ هو الجزء المشترك نفسه لا يصير وسماً فارغاً");
  const unrelated = compactCampusLabels(["كلية التربية الأساسية", "كلية الدراسات التكنولوجية", "كلية التربية الأساسية"]);
  check(unrelated.base === "" && unrelated.chips.length === 2, "بلا جزءٍ مشترك: الأسماء كاملة بلا تكرار");
}

/* ٣. لكل عدسةٍ ورقة، والقائمة لا ترجع بصمت */
{
  const reports = fs.readFileSync(path.join(process.cwd(), "src/components/Reports.tsx"), "utf8");
  const lensBlock = reports.slice(reports.indexOf("const LENSES:"), reports.indexOf("];", reports.indexOf("const LENSES:")));
  const lensIds = [...lensBlock.matchAll(/\{ id: "([A-Za-z]+)"/g)].map(match => match[1]);
  check(lensIds.length >= 15 && lensIds.includes("courseRoom") && lensIds.includes("decision"), "قائمة العدسات قُرئت");
  check(!/type PrintKind = Exclude<Lens/.test(reports), "PrintKind لا يستثني عدسة: زرّ «طباعة هذا العرض» يظهر فيها كلها");
  const sheet = reports.slice(reports.indexOf("function PrintSheetBody("));
  for (const id of lensIds) {
    check(sheet.includes(`kind === "${id}"`), `لعدسة «${id}» ورقة طباعة`);
  }
  const titlesBlock = reports.slice(reports.indexOf("const reportTitles"), reports.indexOf("};", reports.indexOf("const reportTitles")));
  for (const id of lensIds) check(new RegExp(`\\b"?${id}"?:`).test(titlesBlock), `لعدسة «${id}» عنوان نافذة (لا «undefined»)`);

  const start = reports.indexOf("const printInstructorScope = async");
  const body = reports.slice(start, reports.indexOf("\n  };\n", start));
  const closeAt = body.indexOf("setScopeMenu(null)");
  const firstReturn = body.search(/\breturn\b/);
  check(closeAt > 0 && closeAt < firstReturn, "قائمة «تقرير الأستاذ» تُغلق قبل أي رجوع");
  check(!/if \(!instructorId && !filters\.instructorQuery\.trim\(\)\) return;/.test(body), "لا رجوع صامت حين لا يُختار أستاذ");
  check(body.includes("instructorReportScope(") && body.includes("printReport(\"instructor\""), "القائمة تبني النطاق ثم تستدعي الطباعة");
  check(/onClick=\{\(\) => void printInstructorScope\("college"/.test(reports) && /onClick=\{\(\) => void printInstructorScope\("all-colleges"\)\}/.test(reports), "عنصرا القائمة موصولان بالطباعة");

  check(reports.includes("onPrintData={reportDecisionDepartment}"), "لوحة القرار تبلّغ الشاشة بما تعرضه لتُطبع");
  check(reports.includes('courseRoom={printKind === "courseRoom" ? roomTypeMismatches'), "ورقة «المقررات × القاعات» تأخذ مخالفات العرض نفسه");
  const board = fs.readFileSync(path.join(process.cwd(), "src/components/DecisionBoard.tsx"), "utf8");
  check(/onPrintData\(\{/.test(board) && (board.match(/onPrintData=\{onPrintData\}/g) || []).length === 2, "كل سطر قسمٍ في اللوحة يبلّغ (القسم الواحد وأقسام الكلية)");
}

/* ٤. شريط الختم لا يقطع الورقة المدوَّرة في Safari */
{
  const css = fs.readFileSync(path.join(process.cwd(), "src/styles/08-print.css"), "utf8");
  const rule = css.slice(css.indexOf('html[data-print-rotate="1"] .print-sheet-attestation{'));
  check(rule.length > 0 && css.includes('html[data-print-rotate="1"] .print-sheet-attestation{'), "للشريط موضعٌ خاص في الطباعة المدوَّرة");
  check(/writing-mode:vertical-rl/.test(rule.slice(0, 600)) && /left:0/.test(rule.slice(0, 600)), "يُرسم في ذيل الورقة المدوَّرة (حافة الصفحة اليسرى) باتجاهها");
  check(/\.print-visiting-campuses>i\{/.test(css), "مواقع المنتدب وسومٌ لا جملة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
