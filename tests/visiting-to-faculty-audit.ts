/**
 * استيراد الجدول: أي منتدب في الصفوف يصير «هيئة تدريسية» (في صفوف الجدول وحدها).
 */
import fs from "fs";
import { applyVisitingToFaculty, recoverRetiredFromPrintedName, retiredOrSabbaticalIds } from "../src/utils/visitingToFaculty";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

const plan = { visiting: new Set([7, 8]), placeholderId: 99 };
const rows: any[] = [{ AdInstructorId: 7 }, { AdInstructorId: 5 }, { AdInstructorId: 8 }, { AdInstructorId: 0 }];
check(applyVisitingToFaculty(rows, plan) === 2, "يُستبدل منتدبان فقط");
check(rows[0].AdInstructorId === 99 && rows[2].AdInstructorId === 99, "المنتدب يصير سجل «هيئة تدريسية»");
check(rows[1].AdInstructorId === 5 && rows[3].AdInstructorId === 0, "المعيّن والفارغ لا يتغيران");
check(rows[0].replacedVisitingInstructorId === 7, "يُحفظ المنتدب الأصلي دليلاً");
const untouched: any[] = [{ AdInstructorId: 7 }];
check(applyVisitingToFaculty(untouched, { visiting: new Set([7]), placeholderId: 0 }) === 0 && untouched[0].AdInstructorId === 7, "بلا سجل «هيئة تدريسية» للقسم: يبقى الصف كما هو");
check(applyVisitingToFaculty([{ AdInstructorId: 7 }], { visiting: new Set(), placeholderId: 99 }) === 0, "بلا منتدبين: لا شيء يتغير");

const people = [
  { AdInstructorId: 1, AdInstructorStatus: "retired" }, { AdInstructorId: 2, AdInstructorStatus: "sabbatical" },
  { AdInstructorId: 3 }, { AdInstructorId: 4, AdInstructorStatus: null }, { AdInstructorId: 0, AdInstructorStatus: "retired" }, null,
];
const away = retiredOrSabbaticalIds(people as any);
check(away.size === 2 && away.has(1) && away.has(2), "المتقاعد والمتفرغ فقط يُعدّان بوضع المنتدب");
const mixed: any[] = [{ AdInstructorId: 1 }, { AdInstructorId: 2 }, { AdInstructorId: 3 }];
check(applyVisitingToFaculty(mixed, { visiting: away, placeholderId: 99 }) === 2 && mixed[0].AdInstructorId === 99 && mixed[1].AdInstructorId === 99 && mixed[2].AdInstructorId === 3, "صفوف المتقاعد والمتفرغ تصير «هيئة تدريسية» ويبقى العامل");

const roster = [
  { AdInstructorId: 1, AdInstructorName: "أحمد محمد العلي", AdInstructorStatus: "retired" },
  { AdInstructorId: 2, AdInstructorName: "سالم ناصر الخالد", AdInstructorStatus: "sabbatical" },
  { AdInstructorId: 3, AdInstructorName: "خالد يوسف الراشد" },
  { AdInstructorId: 4, AdInstructorName: "خالد يوسف الراشد", AdInstructorStatus: "retired" },
  { AdInstructorId: 5, AdInstructorName: "محمد", AdInstructorStatus: "retired" },
];
const printed: any[] = [
  { AdInstructorId: 0, sourceInstructorText: "د. أحمد محمد العلي" }, { AdInstructorId: 0, sourceInstructorText: "سالم ناصر الخالد" },
  { AdInstructorId: 0, sourceInstructorText: "خالد يوسف الراشد" }, { AdInstructorId: 0, sourceInstructorText: "محمد" },
  { AdInstructorId: 0, sourceInstructorText: "أحمد العلي" }, { AdInstructorId: 9, sourceInstructorText: "أحمد محمد العلي" },
];
check(recoverRetiredFromPrintedName(printed, roster) === 2, "يُسترد المتقاعد والمتفرغ بالاسم المطبوع كاملاً فقط");
check(printed[0].AdInstructorId === 1 && printed[1].AdInstructorId === 2, "الاسم الكامل يعيد معرّف صاحبه");
check(printed[2].AdInstructorId === 0, "اسمٌ يشاركه أستاذ فعّال: لا يُخمَّن");
check(printed[3].AdInstructorId === 0 && printed[4].AdInstructorId === 0, "اسم مفرد أو ناقص: لا يُسترد");
check(printed[5].AdInstructorId === 9, "صف محسوم بالفعل لا يُمسّ");
const evidenced: any[] = [{ AdInstructorId: 1, importEvidence: { instructor: { raw: "أحمد", canonical: 1, confidence: "UNRESOLVED", derived: false }, course: { confidence: "CONFIRMED" } } }];
applyVisitingToFaculty(evidenced, { visiting: new Set([1]), placeholderId: 99 });
check(evidenced[0].importEvidence.instructor.canonical === 99 && evidenced[0].importEvidence.instructor.confidence === "CONFIRMED" && evidenced[0].importEvidence.instructor.method === "VISITING_TO_FACULTY" && evidenced[0].importEvidence.course.confidence === "CONFIRMED", "دليل الأستاذ يطابق الصف بعد الاستبدال ولا يُمسّ غيره");

const server = fs.readFileSync("server.ts", "utf8");
check((server.match(/visitingToFacultyPlan\(collegeId, ?sectionId, ?termId\)/g) || []).length === 3, "مسارات الاستيراد الثلاثة (PDF والنموذج والملف المُصدَّر) تطبّق القاعدة");
check(/replacedVisitingInstructorId: Number\(raw\?\.replacedVisitingInstructorId/.test(server), "تنقية المسودة تحفظ المنتدب الأصلي فلا يضيع بعد الاستبدال");
check(/retiredOrSabbaticalIds\(instructors as any\)\) visiting\.add\(id\)/.test(server), "الخادم يضمّ المتقاعد والمتفرغ إلى خطة الاستبدال");
check(/!faculty\.has\(id\)/.test(server), "من هو في هيئة القسم لا يُعدّ منتدباً");

console.log(`\nVisiting → faculty audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
