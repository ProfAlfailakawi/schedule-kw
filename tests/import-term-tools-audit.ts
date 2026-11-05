/**
 * ── استيراد PDF وأدوات الفصل (ملاحظات المالك 2026-11-05: 3، 28، 29، 30) ─────────
 *
 *  I  حذف صفٍّ لا يُسقط الملف، والمقارنة تتبع الصفوف الحيّة.
 *  N  بلا أسماء ← بأسماء ← تعديل: الرقم المولَّد ليس هوية، والتراجع لا يعيد المحذوف ولا يمحو التعديل.
 *  S  هوية صفوف المسودة: لا يشترك صفّان في رقم، فحذفُ صفٍّ لا يذهب بالمسودة.
 *  P  التنبّؤ: مقرر واحد إجراء واحد، و«افتح شعبتين».
 *  T  آلة الزمن: الوقت معزول الاتجاه، ورسالة الأستاذ بلا قاعة.
 *  G  بداية الفصل تمرّ من دوال الموعد نفسها في الإنشاء والتعديل والحذف والنشر.
 */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ImportNameFillPanel from "../src/components/ImportNameFillPanel";
import { applyNameFill, nameFillSnapshot, planNameFill, undoNameFill } from "../src/utils/importNameFill";
import { assignAuthoritySections } from "../src/utils/authorityAcademicCodes";
import { importDiff } from "../src/utils/importDiff";
import { safeDraftRows } from "../src/server/core/smartImport";
import { mergeRowIssues, isGenesisDraft } from "../src/server/core/draftChecks";
import { teacherCards } from "../src/utils/timeMachine";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

const row = (sourceOrder: number, time: string, teacher = 0, hall = "101") => ({
  sourceOrder, AdCourseId: 7, SCode: "", AdInstructorId: teacher, fsunday: true, ftuesday: true,
  fstarttime: time, fendtime: `${time.slice(0, 2)}:50`, AdRoomCode: "901A01", AdRoomHall: hall,
});
const blank = assignAuthoritySections([row(1, "08:00"), row(2, "10:00"), row(3, "12:00")]);
const people = [{ AdInstructorId: 11, AdInstructorName: "عضو أول" }, { AdInstructorId: 12, AdInstructorName: "عضو ثان" }, { AdInstructorId: 13, AdInstructorName: "عضو ثالث" }];
const named = assignAuthoritySections([row(1, "08:00", 11), row(2, "10:00", 12), row(3, "12:00", 13)]);

/* I */
{
  const panel = read("src/components/ImportNameFillPanel.tsx");
  check(!/decisions: planNameFill/.test(panel) && /useMemo\(\(\) => plan \? planNameFill\(rows/.test(panel), "I1 قرارات المقارنة تُحسب من الصفوف الحيّة، لا تُحفظ بمواضع قديمة");
  /* يكفي رسم الجدول بقرارٍ لا صفَّ له حتى يسقط — هذا ما كان يسقط الشاشة والملف معها. */
  const decisions = planNameFill(blank.slice(0, 2), named, people);
  check(decisions.every(d => d.index < 2), "I2 بعد حذف الصف الأخير لا قرار يشير إلى صف غير موجود", decisions);
  const html = renderToStaticMarkup(React.createElement(ImportNameFillPanel, { rows: blank.slice(0, 2) as any, onRows: () => {}, people, collegeId: 1, sectionId: 1, termId: 1 }));
  check(html.includes("بلا اسم"), "I3 اللوحة تُرسم بعد الحذف");
  const paged = read("src/components/PagedImportPreview.tsx");
  check(/removedRows/.test(paged) && /onRowRemoved=\{noteRemoved\}/.test(paged), "I4 المحذوف محفوظ مع الملف كله، لا داخل جدول الصفحة");
  check(!/importLayout === "authority-pdf" && importPreview\.rows\?\.length/.test(read("src/components/IntelligenceWorkspace.tsx")), "I5 حذف آخر صف لا يطوي الجدول ولا «تراجع»");
  check(/PDF_REPLACE_EMPTY/.test(read("src/server/routes/draftsRoutes.ts")), "I6 معاينةٌ بلا صفوف لا تستبدل جدول الفصل");
}

/* N */
{
  const afterDelete = assignAuthoritySections(blank.slice(1));
  check(afterDelete[0].SCode === "501", "N1 الحذف يعيد الترقيم فعلاً", afterDelete[0].SCode);
  const decisions = planNameFill(afterDelete, named, people);
  check(decisions[0].status === "match" && decisions[0].instructorId === 12, "N2 الصف يأخذ اسمه هو لا اسم الصف المحذوف بعد إعادة الترقيم", decisions[0]);
  check(decisions[1].status === "match" && decisions[1].instructorId === 13, "N3 والصف التالي كذلك", decisions[1]);

  const filled = applyNameFill(blank, planNameFill(blank, named, people));
  const snapshot = nameFillSnapshot(blank);
  const edited = assignAuthoritySections(filled.slice(1)).map(item => item.sourceOrder === 3 ? { ...item, fstarttime: "13:00" } : item);
  const undone = undoNameFill(edited, snapshot);
  check(undone.length === 2, "N4 التراجع عن التعبئة لا يعيد صفاً حذفه المراجع بعدها", undone.length);
  check(undone.every(item => item.AdInstructorId === 0), "N5 ويعيد الأسماء وحدها");
  check(undone.find(item => item.sourceOrder === 3)?.fstarttime === "13:00", "N6 ولا يمحو تعديل الوقت");
  const byHand = undoNameFill(edited.map(item => item.sourceOrder === 3 ? { ...item, AdInstructorId: 13, importEvidence: { instructor: { method: "MANUAL_PICK" } } } : item), snapshot);
  check(byHand.find(item => item.sourceOrder === 3)?.AdInstructorId === 13, "N7 واسمٌ اختير باليد بعدها يبقى");

  const restored = assignAuthoritySections(blank.slice());
  check(restored.map(item => item.SCode).join() === "501,502,503", "N8 حذف صف ثم إعادته في موضعه يعيد الشعب كما كانت");
  const diff = importDiff(named as any, restored.map((item, index) => ({ ...item, AdInstructorId: named[index].AdInstructorId })) as any);
  check(diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0, "N9 والمادة المعادة بالوقت نفسه لا تظهر محذوفة ولا مضافة", diff);
}

/* S */
{
  const raw = [{ id: null }, { id: "" }, { id: 0 }, { id: 5 }, { id: 5 }, {}, { id: -6 }];
  const ids = safeDraftRows(raw, 1, 1, 1).map(item => item.id);
  check(new Set(ids).size === raw.length && !ids.includes(0), "S1 لا يشترك صفّان في هوية", ids);
  check(ids[3] === 5 && ids[6] === -6, "S2 الرقم الصالح الأول يبقى كما هو", ids);
  const once = safeDraftRows(raw, 1, 1, 1);
  const twice = safeDraftRows(once, 1, 1, 1).map(item => item.id);
  check(JSON.stringify(twice) === JSON.stringify(ids), "S3 إعادة الحفظ لا تغيّر الهويات");
}

/* P */
{
  const source = read("src/utils/predictiveIntelligence.ts");
  check(/countOf\(row\.action\.count \|\| 1, oblique\(AR\.section\)\)/.test(source), "P1 «افتح شعبتين» لا «شعبتان»");
  check(/openedCourses/.test(source), "P2 المقرر الواحد إجراء واحد");
  const radar = read("src/components/RadarSchedule.tsx");
  check(/label=\{`اعتمد شعبة \$\{slot\.sectionCode\}`\}/.test(radar) && /slot=\{/.test(radar), "P3 كل اقتراح يسمّي شعبته ووقته فلا يتطابق زرّان");
}

/* T */
{
  const base = { id: 1, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 7, AdCourseName: "مقرر", SCode: "01", AdInstructorId: 11, fsunday: true, fstarttime: "14:00", fendtime: "15:15", AdRoomCode: "901A01", AdRoomHall: "103" } as any;
  const context: any = { scope: { collegeId: 1, sectionId: 1, termId: 1 }, collegeId: 1, sectionId: 1, termId: 1, instructors: [{ AdInstructorId: 11, AdInstructorName: "عضو", AdInstructorMobile: "" }], courses: [], rooms: [] };
  const moved = teacherCards([base], [{ ...base, AdRoomHall: "101", fstarttime: "16:00", fendtime: "17:15" }], context);
  const roomOnly = teacherCards([base], [{ ...base, AdRoomHall: "101" }], context);
  if (moved.length) {
    check(moved[0].after[0].includes("⁦16:00 – 17:15⁩"), "T1 الوقت معزول الاتجاه فيُقرأ من البداية", moved[0].after[0]);
    check(moved[0].after[0].includes("⁦901A01-101⁩"), "T2 رمز القاعة لا ينكسر عند الالتفاف");
    check(!moved[0].notice.includes("901A01"), "T3 رسالة الأستاذ بلا اسم قاعة", moved[0].notice);
    check(roomOnly.length === 0 || !roomOnly[0].notice.includes("101"), "T4 تغيّر القاعة وحدها يُقال بلا اسمها", roomOnly[0]?.notice);
  } else check(false, "T1 بطاقة للأستاذ المتأثر", moved);
  check(/card\.notice/.test(read("src/components/ScenarioWorkbench.tsx")), "T5 واتساب يرسل الرسالة بلا قاعة");
}

/* G */
{
  const checks = read("src/server/core/draftChecks.ts");
  for (const gate of ["schedulePayloadIssues", "scheduleLengthIssue", "unapprovedPatternIssue", "scheduleConflicts"]) check(checks.includes(`await ${gate}(`), `G1 المسودة تسأل ${gate}`);
  check(/conflict as any\)\.soft \? rowWarnings : rowIssues/.test(checks), "G2 التنبيه اللطيف لا يمنع");
  const drafts = read("src/server/routes/draftsRoutes.ts");
  check((drafts.match(/draftAppointmentChecks\(req/g) || []).length === 3, "G3 الفحص عند التعديل والحذف والنشر");
  check(/draftAppointmentChecks\(req,rows,external\)/.test(read("src/server/routes/intelligenceInsightRoutes.ts")), "G4 وعند إنشاء المسودة");
  check(isGenesisDraft({ name: "بداية الفصل · أ → ب" }) && !isGenesisDraft({ name: "نسخة PDF" }), "G5 لا يمسّ مسودات الاستيراد");
  check(JSON.stringify(mergeRowIssues({ 1: ["أ"] }, { 1: ["أ", "ب"], 2: ["ج"] })) === JSON.stringify({ 1: ["أ", "ب"], 2: ["ج"] }), "G6 دمج الملاحظات بلا تكرار");
  check(/genesis\.rowWarnings/.test(read("src/components/LivingScheduleLayer.tsx")), "G7 الشاشة تعرض التنبيه تحت صفه");
}

console.log(`\n${passed} نجح · ${failed} فشل`);
process.exit(failed ? 1 : 0);
