/**
 * القسم الجديد يولد معه سجل «هيئة تدريسية» ويُربط بهيئته.
 */
import fs from "fs";
import { ensureSectionFaculty, placeholderCivilFor } from "../src/server/sectionFaculty";
import { singleFacultyPlaceholder, withoutFacultyPlaceholderCivil, isFacultyPlaceholder } from "../src/utils/placeholderInstructor";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

const fake = (seed: any[] = [], faculty: Record<string, number[]> = {}) => {
  const instructors = [...seed];
  return {
    instructors, faculty,
    getInstructors: async () => instructors,
    getDepartmentFaculty: async (c: number, s: number) => faculty[`${c}:${s}`] || [],
    createInstructor: async (civil: string, name: string, mobile: string) => { const row = { AdInstructorId: instructors.length + 100, AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: mobile }; instructors.push(row); return row; },
    addDepartmentFaculty: async (c: number, s: number, id: number) => { (faculty[`${c}:${s}`] ||= []).push(id); },
  };
};

(async () => {
  const repo = fake();
  const first = await ensureSectionFaculty(repo, 3, 41);
  check(first.created && repo.instructors.length === 1 && repo.instructors[0].AdInstructorName === "هيئة تدريسية", "القسم الجديد: يُنشأ له سجل «هيئة تدريسية»");
  check(repo.faculty["3:41"]?.includes(first.instructorId) === true, "ويُربط بهيئة القسم");
  const again = await ensureSectionFaculty(repo, 3, 41);
  check(!again.created && repo.instructors.length === 1 && again.instructorId === first.instructorId, "الإعادة لا تكرّر السجل");
  const other = await ensureSectionFaculty(repo, 3, 42);
  check(other.created && other.instructorId !== first.instructorId && repo.instructors.length === 2, "كل قسم له سجلّه المستقل");
  check(new Set([placeholderCivilFor(3, 41), placeholderCivilFor(3, 42), placeholderCivilFor(4, 41)]).size === 3 && /^29999\d{7}$/.test(placeholderCivilFor(3, 41)), "رقم مدني اصطناعي فريد لكل قسم (12 خانة، شهره 99)");
  const has = fake([{ AdInstructorId: 7, AdInstructorCivil: "123", AdInstructorName: "هيئة تدريسية" }], { "5:9": [7] });
  const kept = await ensureSectionFaculty(has, 5, 9);
  check(!kept.created && kept.instructorId === 7 && has.instructors.length === 1, "قسم له سجل في هيئته: لا يُنشأ له آخر");
  const sharedElsewhere = fake([{ AdInstructorId: 7, AdInstructorCivil: "123", AdInstructorName: "هيئة تدريسية" }], { "5:9": [7] });
  const mine = await ensureSectionFaculty(sharedElsewhere, 5, 10);
  check(mine.created && mine.instructorId !== 7, "سجل قسمٍ آخر لا يُعدّ سجل هذا القسم");
  const raced = fake([{ AdInstructorId: 55, AdInstructorCivil: placeholderCivilFor(8, 8), AdInstructorName: "هيئة تدريسية" }]);
  const reuse = await ensureSectionFaculty(raced, 8, 8);
  check(!reuse.created && reuse.instructorId === 55 && raced.faculty["8:8"]?.[0] === 55, "سجلّ بنفس الرقم قائم (انقطع الربط): يُعاد ربطه ولا يُكرَّر");


  const roster = [
    { AdInstructorId: 5, AdInstructorName: "هيئة تدريسية", AdInstructorCivil: placeholderCivilFor(3, 41) },
    { AdInstructorId: 6, AdInstructorName: "هيئة تدريسية", AdInstructorCivil: placeholderCivilFor(3, 42) },
    { AdInstructorId: 7, AdInstructorName: "أحمد محمد", AdInstructorCivil: "123456789012" },
  ];
  const chosen = singleFacultyPlaceholder(roster, [6]);
  check(chosen.length === 2 && chosen.some(p => p.AdInstructorId === 6) && !chosen.some(p => p.AdInstructorId === 5), "هيئة تدريسية واحدة من القسم المحدد مع بقاء الأسماء الحقيقية");
  check(roster.length === 3 && roster[0].AdInstructorCivil === placeholderCivilFor(3, 41), "الاختيار لا يغير هوية سجلات الجداول التاريخية");
  check(withoutFacultyPlaceholderCivil(roster[0]).AdInstructorCivil === "" && withoutFacultyPlaceholderCivil(roster[2]).AdInstructorCivil === "123456789012", "الرقم المدني الاصطناعي داخلي فقط، والمدني الحقيقي محفوظ");
  check(isFacultyPlaceholder(roster[0]) && !isFacultyPlaceholder(roster[2]), "الهيئة الافتراضية ليست هوية شخصية");
  const picker = fs.readFileSync("src/components/InstructorPicker.tsx", "utf8");
  const directory = fs.readFileSync("src/components/Instructors.tsx", "utf8");
  check(picker.includes("singleFacultyPlaceholder(") && picker.includes("!isFacultyPlaceholder(person)") && picker.includes("!isFacultyPlaceholder(selected)"), "قائمة الأستاذ لا تكرر الهيئة ولا تعرض رقمها");
  check(directory.includes("items.filter(x => !isFacultyPlaceholder(x))"), "دليل الأساتذة الحقيقيين لا يعرض سجل الهيئة الافتراضي");

  const server = fs.readFileSync("server.ts", "utf8"), plan = fs.readFileSync("src/server/planReviewRoutes.ts", "utf8");
  check(server.includes("ensureSectionFaculty(Repository, collegeId, Number(newSec.AdSectionId))"), "إضافة قسم من الإدارة تُنشئ السجل");
  check(server.includes("if(created){try{await ensureSectionFaculty(Repository,collegeId"), "إنشاء القسم من ترويسة PDF يُنشئ السجل (ما أُنشئ الآن فقط)");
  check(plan.includes("ensureSectionFaculty(Repository, Number(college.AdCollegeId), Number(created.AdSectionId))"), "إنشاء القسم من الصحيفة يُنشئ السجل");

  check(server.includes("map(withoutFacultyPlaceholderCivil)") && server.includes("singleFacultyPlaceholder(sortArabicNamed(merged"), "الواجهة العامة تنظّف الأرقام وتختار هيئة واحدة بالقسم");
  check(server.includes("!Repository.isDemoRequest() && isFacultyPlaceholder(person)"), "الإنتاج يمنع دخول الهيئة الافتراضية، والديمو يبقى مستثنى ليعمل كرت الأستاذ");
  check(/idsOf\(basePool\)\.some\(id => !placeholders\.has\(id\)\)/.test(server), "احتياط الكلية في عضوية القسم لا يُعطَّل بسجل «هيئة تدريسية» وحده");
  check(/\[\.\.\.preferredInstructorIds\]\.some\(id=>!importPlaceholderIds\.has\(id\)\)/.test(server), "احتياط الكلية في مطابقة PDF لا يُعطَّل بسجل «هيئة تدريسية» وحده");

  console.log(`\nSection faculty audit: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
