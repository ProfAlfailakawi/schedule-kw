/**
 * ── «طلب شعبة» في التجربة: طلبٌ في كل مرحلة ────────────────────────────────────
 *
 * لوحةُ «طلبات الشعب» داخل كشف التسجيل كانت تُفتح فارغةً لكل صفة، فلا يُرى المسارُ كلُّه
 * (الإرشاد ← لجنة الجدول ← التسجيل). خمسةُ طلباتٍ صغيرة في الفصل الجاري لتكنولوجيا التعليم،
 * كلٌّ في مرحلة، تُبنى بانتقالات الوحدة نفسها (src/utils/sectionRequests.ts) فلا يُكتب شكلٌ
 * لا يكتبه الخادم:
 *   ١) أُرسل للتوّ: «تصميم وإنتاج الوسائط المتعددة» مسائية، بطلبة «مساري» الذين طلبوه —
 *      وللمقرر شعبةٌ مسائية تربطها اللجنةُ أمام العارض.
 *   ٢) فُتحت الشعبة وتنتظر الاعتماد.
 *   ٣) اعتُمد بعضُهم (6 من 8) وسُجّل ثلاثة.
 *   ٤) سُجّلوا كلُّهم.
 *   ٥) اعتذرت اللجنة بسببٍ مكتوب.
 * الأسماءُ محايدةٌ («طالبة تجريبية ١»)، بلا رقمٍ مدني، مختومةٌ بالخاتم نفسه. في الصندوق وحده.
 */
import { Repository } from "../db/repository";
import { roleLabel } from "../utils/academicRoles";
import { AR, countOf } from "../utils/arabicCount";
import {
  approveStudents, capacityShare, declineRequest, linkSections, markRegistered, periodOfStart,
  type SectionRequest, type SectionRequestPeriod, type SectionRequestStudent, type Transition,
} from "../utils/sectionRequests";
import type { AdCourse, FSchedule } from "../types";

export const DEMO_SECTION_REQUEST_COURSE_CODE = "0109343";
const SCOPE = { collegeId: 1, sectionId: 1, termId: 1 } as const;
const ADVISOR = { userId: 19, name: "أ. مرشد قسم تكنولوجيا التعليم", role: "advisor" };
const ADVISOR_GENERAL = { userId: 21, name: "أ. الإرشاد العام", role: "advisor" };
const by = (role: string, name: string) => `${roleLabel(role)} · ${name}`;
const COMMITTEE = by("committeeChair", "د. رئيس لجنة جدول تكنولوجيا التعليم");
const REGISTRAR = by("registrarStaff", "أ. موظف التسجيل");
const MARK = "حالة تجريبية مقصودة";

export async function seedDemoSectionRequests(opts: { sealIdentity: (value: string) => Promise<string> }): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const { collegeId, sectionId, termId } = SCOPE;
  const [courses, rows, needs] = await Promise.all([
    Repository.getCoursesBySection(sectionId) as Promise<AdCourse[]>,
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }) as Promise<FSchedule[]>,
    Repository.getStudentNeeds(collegeId, 0, termId) as Promise<any[]>,
  ]);
  const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  const featured = courses.find(course => String(course.CourseCode) === DEMO_SECTION_REQUEST_COURSE_CODE);
  /* مقرراتُ المراحل الأخرى: لكلٍّ شعبةٌ في الفصل خارج الحالات المقصودة، المسائيةُ أولاً. */
  const sectionOf = new Map<number, FSchedule>();
  for (const row of [...rows].sort((a, b) => String(b.fstarttime).localeCompare(String(a.fstarttime)) || Number(a.id) - Number(b.id))) {
    if (String(row.fdetail || "").includes(MARK) || sectionOf.has(Number(row.AdCourseId))) continue;
    sectionOf.set(Number(row.AdCourseId), row);
  }
  const others = courses.filter(course => course !== featured && sectionOf.has(Number(course.AdCourseId)))
    .sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode))).slice(0, 4);
  if (!featured || others.length < 4) return;

  let serial = 0;
  const pasted = async (count: number): Promise<SectionRequestStudent[]> => {
    const out: SectionRequestStudent[] = [];
    for (let n = 1; n <= count; n += 1) {
      serial += 1;
      out.push({ id: `s${n}`, source: "paste", key: `demo:${serial}`, nameCipher: await opts.sealIdentity(`${serial % 2 ? "طالبة" : "طالب"} تجريبي${serial % 2 ? "ة" : ""} ${serial}`) });
    }
    return out;
  };
  const base = (n: number, course: AdCourse, period: SectionRequestPeriod, count: number, students: SectionRequestStudent[], hoursAgo: number, from = ADVISOR, note?: string): SectionRequest => {
    const at = iso(hoursAgo);
    return {
      id: `${termId}:demo-sr-${n}`, termId, collegeId, sectionId, fromSectionId: sectionId, courseId: Number(course.AdCourseId),
      courseCode: String(course.CourseCode || ""), courseName: String(course.CourseName || ""), period, count, ...(note ? { note } : {}),
      students, sections: [], createdAt: at, updatedAt: at, createdBy: from,
      events: [{ kind: "sent", at, by: by(from.role, from.name), detail: countOf(count, AR.student) }],
    };
  };
  const apply = (request: SectionRequest, step: (current: SectionRequest) => Transition): SectionRequest => {
    const out = step(request);
    if ("refuse" in out) throw new Error(`demo section request ${request.id}: ${out.refuse.error}`);
    return out.next;
  };
  const link = (request: SectionRequest, hoursAgo: number) => {
    const row = sectionOf.get(request.courseId)!;
    return apply(request, current => linkSections(current, [{ scheduleId: Number(row.id), sectionCode: String(row.SCode), capacity: capacityShare(current.count, 1) }], COMMITTEE, iso(hoursAgo)));
  };
  const periodOf = (course: AdCourse): SectionRequestPeriod => periodOfStart(String(sectionOf.get(Number(course.AdCourseId))?.fstarttime || "08:00"));

  /* ١) أُرسل للتوّ بطلبة «مساري» الذين طلبوا المقرر. */
  const masari: SectionRequestStudent[] = needs
    .filter(need => (need.courseIds || []).map(Number).includes(Number(featured.AdCourseId))
      && !(need.courseStates || []).some((state: any) => Number(state.courseId) === Number(featured.AdCourseId) && state.state === "registered"))
    .slice(0, 12)
    .map((need, index) => ({ id: `s${index + 1}`, source: "masari" as const, needId: String(need.id), key: String(need.fingerprint || `need:${need.id}`),
      ...(need.nameCipher ? { nameCipher: need.nameCipher } : {}), ...(need.civilCipher ? { civilCipher: need.civilCipher } : {}) }));
  const sent = base(1, featured, "evening", Math.max(masari.length + 2, 7), masari, 3, ADVISOR_GENERAL,
    "طلبةُ «مساري» يعملون صباحاً؛ ومعهم طالبان لم يرفعا الطلب بعد.");

  /* ٢) فُتحت الشعبة وتنتظر الاعتماد. */
  const opened = link(base(2, others[0], periodOf(others[0]), 6, await pasted(6), 40), 20);

  /* ٣) اعتُمد 6 من 8، وسُجّل ثلاثة. */
  let partial = link(base(3, others[1], periodOf(others[1]), 8, await pasted(8), 26 * 24, ADVISOR_GENERAL), 22 * 24);
  partial = apply(partial, current => approveStudents(current, current.students.slice(0, 6).map(row => row.id), COMMITTEE, iso(9 * 24)));
  partial = apply(partial, current => markRegistered(current, current.students.slice(0, 3).map(row => row.id), true, REGISTRAR, iso(2 * 24)));

  /* ٤) سُجّلوا كلُّهم. */
  let done = link(base(4, others[2], periodOf(others[2]), 5, await pasted(5), 30 * 24), 27 * 24);
  done = apply(done, current => approveStudents(current, current.students.map(row => row.id), COMMITTEE, iso(20 * 24)));
  done = apply(done, current => markRegistered(current, current.students.map(row => row.id), true, REGISTRAR, iso(12 * 24)));

  /* ٥) اعتذرت اللجنة بسببٍ مكتوب. */
  const declined = apply(base(5, others[3], "evening", 4, await pasted(4), 8 * 24),
    current => declineRequest(current, "لا أستاذ متفرّغ مساءً هذا الفصل؛ نقترح الشعبة الصباحية القائمة أو الفصل القادم.", COMMITTEE, iso(6 * 24)));

  for (const request of [sent, opened, partial, done, declined]) await Repository.saveFeatureDoc("sectionRequests", request.id, request);
}
