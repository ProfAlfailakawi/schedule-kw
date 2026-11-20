/**
 * ── «مطابقة التسجيل» في التجربة: ثلاثةُ تقاريرَ مؤرَّخة بين جدولنا وملف التسجيل ──────────────────────
 *
 * ليرى الزائرُ في «الاستعلامات ← مطابقة التسجيل» أرشيفاً حقيقيَّ الشكل بلا أن يرفع ملفاً:
 *   • قبل ثلاثة أسابيع: طلبٌ نُفِّذ كلُّه وأثبته الملفُّ التالي.
 *   • قبل عشرة أيام: بعضُ بنوده نُفِّذ وبعضُها ينتظر، وفيه بندٌ أُعيد فتحُه («شُطب ولم يظهر في الملف»).
 *   • قبل يومين: الطلبُ الجاري، أكثرُه ينتظر، ببنودٍ بالألوان الثلاثة (عدّلوا، أضيفوا، احذفوا).
 * البنودُ من مقررات قسم القصة في الصندوق نفسها (أسماؤها وشعبُها)، بأرقامٍ مرجعية تجريبية.
 * يُبذر داخل صندوق الزائر وحده (Repository.isDemoRequest) ومرةً واحدة، ولا يلمس بيانات الجامعة.
 */
import { Repository } from "../db/repository";
import { DEMO_STORY_SCOPE } from "./core/demo";
import type { RegistrarRequestDoc, RegistrarRequestItem } from "../utils/registrarRequest";

const DAY = 24 * 60 * 60 * 1000;
const SEAT = { by: 0, byName: "التسجيل" };

export async function seedDemoRegistrarReports(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const prefix = `${termId}:${collegeId}:${sectionId}:`;
  if ((await Repository.listFeatureDocs<RegistrarRequestDoc>("registrarRequests", prefix)).length) return;

  const courses = (await Repository.getCourses())
    .filter(row => Number(row.AdSectionId) === sectionId && String(row.CourseCode || "").trim())
    .slice(0, 6);
  if (courses.length < 5) return;
  const [a, b, c, d, e, f] = courses.map(row => ({ code: String(row.CourseCode).trim(), name: String(row.CourseName || "").trim() }));
  const g = f || e;

  const edit = (course: { code: string; name: string }, crn: string, section: string, fields: RegistrarRequestItem["fields"]): RegistrarRequestItem =>
    ({ id: `edit:#${crn}`, action: "edit", group: "mismatch", kind: "fields", crn, courseCode: course.code, courseName: course.name, section, pdfSection: section, fields } as RegistrarRequestItem);
  const add = (course: { code: string; name: string }, section: string, fields: RegistrarRequestItem["fields"]): RegistrarRequestItem =>
    ({ id: `add:${course.code}/${section}`, action: "add", group: "notApplied", kind: "onlyOurs", courseCode: course.code, courseName: course.name, section, fields } as RegistrarRequestItem);
  const del = (course: { code: string; name: string }, crn: string, section: string): RegistrarRequestItem =>
    ({ id: `delete:#${crn}`, action: "delete", group: "review", kind: "onlyPdf", crn, courseCode: course.code, courseName: course.name, section, pdfSection: section, fields: [] } as RegistrarRequestItem);

  const time = (ours: string, pdf: string): RegistrarRequestItem["fields"] => [
    { field: "time", label: "الوقت", ours, pdf },
  ];
  const daysAndTime = (oursDays: string, pdfDays: string, oursTime: string, pdfTime: string): RegistrarRequestItem["fields"] => [
    { field: "days", label: "الأيام", ours: oursDays, pdf: pdfDays },
    { field: "time", label: "الوقت", ours: oursTime, pdf: pdfTime },
  ];
  const room = (ours: string, pdf: string): RegistrarRequestItem["fields"] => [{ field: "room", label: "القاعة", ours, pdf }];
  const who = (ours: string, pdf: string): RegistrarRequestItem["fields"] => [{ field: "instructor", label: "الأستاذ", ours, pdf }];

  const at = (daysAgo: number, hour: number) => new Date(Date.now() - daysAgo * DAY - (new Date().getHours() - hour) * 3600_000).toISOString();
  const done = (daysAgo: number, hour: number) => ({ ...SEAT, at: at(daysAgo, hour) });

  /* التقرير الأول: كلُّه نُفِّذ وأثبته الملفُّ التالي. */
  const first: RegistrarRequestItem[] = [
    { ...edit(a, "41021", "1", time("10:00 – 11:50", "08:00 – 09:50")), done: done(20, 10), state: "confirmed", stateAt: at(14, 9) },
    { ...edit(b, "41033", "2", room("ق 204", "ق 118")), done: done(20, 10), state: "confirmed", stateAt: at(14, 9) },
    { ...add(c, "1", daysAndTime("أحد · ثلاثاء", "—", "12:00 – 12:50", "—")), done: done(20, 11), state: "confirmed", stateAt: at(14, 9) },
  ];
  /* التقرير الثاني: بعضُه نُفِّذ، وبندٌ أُعيد فتحُه، وبندٌ ينتظر. */
  const second: RegistrarRequestItem[] = [
    { ...edit(a, "41055", "1", daysAndTime("إثنين · أربعاء", "أحد · ثلاثاء", "09:00 – 10:15", "09:00 – 10:15")), done: done(9, 10), state: "confirmed", stateAt: at(2, 9) },
    { ...edit(d, "41067", "3", who("د. نورة العنزي", "د. فيصل المطيري")), lastDone: done(9, 11), state: "reopened", stateAt: at(2, 9) },
    edit(e, "41072", "2", room("ق 301", "ق 212")),
    { ...add(g, "2", daysAndTime("ثلاثاء · خميس", "—", "11:00 – 12:15", "—")), done: done(9, 12), state: "confirmed", stateAt: at(2, 9) },
  ];
  /* التقرير الأخير: الجاري، ببنودٍ بالألوان الثلاثة. */
  const third: RegistrarRequestItem[] = [
    edit(d, "41067", "3", who("د. نورة العنزي", "د. فيصل المطيري")),
    edit(e, "41072", "2", room("ق 301", "ق 212")),
    edit(b, "41090", "1", time("13:00 – 14:50", "12:00 – 13:50")),
    { ...edit(a, "41101", "4", daysAndTime("إثنين · أربعاء", "أحد · ثلاثاء", "10:30 – 11:45", "10:30 – 11:45")), done: done(1, 9) },
    add(c, "2", daysAndTime("أحد · ثلاثاء", "—", "14:00 – 14:50", "—")),
    add(f || b, "3", daysAndTime("إثنين", "—", "08:00 – 09:50", "—")),
    del(c, "41115", "5"),
  ];

  const counts = (items: RegistrarRequestItem[], total: number, matched: number) => ({
    matched, mismatch: items.filter(i => i.action === "edit").length, notSent: 0,
    notApplied: items.filter(i => i.action === "add").length, review: items.filter(i => i.action === "delete").length, total,
  });
  const docs: Array<[string, RegistrarRequestItem[], number, string, number, number]> = [
    ["a1", first, 21, "شعب التسجيل - الفصل الأول.pdf", 20, 18],
    ["b2", second, 21, "شعب التسجيل (محدّث).pdf", 9, 17],
    ["c3", third, 22, "شعب التسجيل (آخر نسخة).pdf", 2, 15],
  ];
  for (const [key, items, total, fileName, daysAgo, matched] of docs) {
    const doc: RegistrarRequestDoc = {
      id: `${prefix}demo${key}`, collegeId, sectionId, termId, round: 1,
      at: at(daysAgo, 9), by: SEAT.by, byName: "رئيس القسم", fileName,
      counts: counts(items, total, matched), reviewCount: items.filter(i => i.action === "delete").length, items,
    };
    await Repository.saveFeatureDoc("registrarRequests", doc.id, doc);
  }
}
