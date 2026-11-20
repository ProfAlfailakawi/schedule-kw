/**
 * ── «ماذا غيّرنا؟» في التجربة: لقطتان قبل الحالة الجارية ──────────────────────────────────────────
 *
 * الصفحةُ تقارن اللقطاتِ المحفوظة بالجدول الجاري، فتُفتح فارغةً في صندوقٍ جديد. تُلتقط هنا لقطتان من
 * جدول قسم القصة نفسه، تختلف فيهما بضعةُ مواعيد عمّا هو جارٍ الآن، فيرى الزائرُ حصيلةً كاملة بكل أنواعها:
 *   • موعدٌ نُقل وقتُه، وموعدٌ بُدّلت قاعتُه، وموعدٌ بُدّل أستاذُه (يظهر في اللقطة الأولى بحاله القديمة)؛
 *   • موعدٌ أُضيف (غائبٌ عن اللقطتين)، وموعدٌ حُذف (كان فيهما ولم يعد في الجدول الجاري).
 * الثانيةُ أقرب إلى الحالة الجارية من الأولى، فتظهر خطواتُ التعديل بتسلسلها بأسماء من أجرتها.
 * يُبذر داخل صندوق الزائر وحده (Repository.isDemoRequest) ومرةً واحدة، ولا يلمس بيانات الجامعة.
 */
import { Repository } from "../db/repository";
import type { FSchedule } from "../types";
import { DEMO_STORY_SCOPE } from "./core/demo";

const FIRST_LABEL = "قبل جولة التنسيق";
const SECOND_LABEL = "بعد تعديل الوقت والقاعة";
const SEATS = [
  { id: 0, name: "رئيس القسم" },
  { id: 0, name: "منسّق الجدول" },
];
const DAY_FIELDS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const shift = (clock: string, minutes: number) => {
  const [h, m] = String(clock || "0:0").split(":").map(Number);
  const total = Math.max(0, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export async function seedDemoWhatChanged(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const existing = await Repository.getScheduleVersions(collegeId, sectionId, termId, 20);
  if (existing.some(version => String(version.label || "") === FIRST_LABEL)) return;

  const live = (await Repository.getSchedulesByScope({ collegeId, sectionId, termId }, { fresh: true }))
    .filter(row => DAY_FIELDS.some(day => Boolean((row as any)[day])));
  /* مواعيدُ من مقرراتٍ مختلفة، فلا تتشابه الصفوفُ في الحصيلة. */
  const picks: FSchedule[] = [];
  const seenCourses = new Set<number>();
  for (const row of live) {
    if (seenCourses.has(Number(row.AdCourseId))) continue;
    seenCourses.add(Number(row.AdCourseId));
    picks.push(row);
    if (picks.length === 5) break;
  }
  if (picks.length < 5) return;
  const [timeRow, roomRow, whoRow, removedRow, laterRoom] = picks;
  const otherInstructor = live.map(row => Number(row.AdInstructorId)).find(id => id && id !== Number(whoRow.AdInstructorId));
  if (!otherInstructor) return;

  const copy = (row: FSchedule): FSchedule => ({ ...row });
  const withoutRoomRefs = (row: FSchedule, room: string): FSchedule =>
    ({ ...row, AdRoomCode: room, roomId: undefined, buildingId: undefined } as FSchedule);

  /* اللقطة الأولى (الأقدم): الوقتُ والقاعةُ والأستاذُ بحالها القديمة، وموعدٌ كان فيه ثم حُذف. */
  const first = live
    .filter(row => Number(row.id) !== Number(removedRow.id))
    .map(row => {
      if (Number(row.id) === Number(timeRow.id)) return { ...copy(row), fstarttime: shift(row.fstarttime, -120), fendtime: shift(row.fendtime, -120) };
      if (Number(row.id) === Number(roomRow.id)) return withoutRoomRefs(row, "ق 118");
      if (Number(row.id) === Number(whoRow.id)) return { ...copy(row), AdInstructorId: otherInstructor };
      if (Number(row.id) === Number(laterRoom.id)) return withoutRoomRefs(row, "ق 207");
      return copy(row);
    });
  /* موعدٌ حُذف: شعبةٌ أخرى بيومٍ ووقتٍ لا يطابقان موعداً جارياً، فلا يُقابِله المقارنُ بموعدٍ قائم. */
  first.push({
    ...copy(laterRoom), id: Number(laterRoom.id) + 100000, SCode: "599",
    fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true,
    fstarttime: "16:00", fendtime: "17:50",
  } as FSchedule);
  /* اللقطة الثانية: صُحّح الوقتُ والقاعةُ الأولى، وبقي الأستاذُ، وما زالت قاعةٌ أخرى قديمة. */
  const second = first.map(row => {
    if (Number(row.id) === Number(timeRow.id)) return copy(timeRow);
    if (Number(row.id) === Number(roomRow.id)) return copy(roomRow);
    return row;
  });

  const make = (seat: typeof SEATS[number], label: string, rows: FSchedule[]) => Repository.createScheduleVersion({
    SystemUserId: seat.id, userName: seat.name, AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    label, source: "manual", rows,
  });
  await make(SEATS[0], FIRST_LABEL, first);
  await make(SEATS[1], SECOND_LABEL, second);
}
