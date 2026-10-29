import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, DoorOpen, Magnet } from "lucide-react";
import type { AdCourse, FSchedule } from "../types";
import { DAY_KEYS, type DayKey } from "../utils/scheduleRegulations";
import { lectureStickOptions, teacherLectures, toClock, toMin, type MiniSpan } from "../utils/teacherMiniWeek";
import { courseLabel } from "../utils/courseLabel";
import { useWiderWeek, type MiniPick } from "./TeacherMiniWeek";

const DAY_SHORT: Record<DayKey, string> = { fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء", fwednesday: "أربعاء", fthursday: "خميس" };
const SHOWN = 6;

/**
 * ── «لاصق بمحاضرتي» داخل نموذج الموعد (الجديد والتعديل) ──────────────────────
 * شرائح «قبل/بعد» كل محاضرةٍ للأستاذ، في اليوم نفسه وبفاصل اللائحة (lectureStick)؛
 * ضغطةٌ واحدة تملأ الأيام والبداية والنهاية (وقاعة المحاضرة إن خلت ولم تُختر قاعة).
 * هذا نموذج الإدارة، فتظهر القاعة أو المبنى تلميحاً على الشريحة.
 */
export default function LectureStickChips({
  teacherId, rows, termId, collegeId, excludeId = 0, course, courses, window: dayWindow, draft, onPick,
}: {
  teacherId: number;
  rows: readonly FSchedule[];
  termId: number;
  collegeId: number;
  excludeId?: number;
  course?: AdCourse | null;
  courses: Map<number, AdCourse>;
  window: MiniSpan;
  draft: Partial<FSchedule>;
  onPick: (pick: MiniPick) => void;
}) {
  const wider = useWiderWeek(teacherId, termId, rows);
  const all = useMemo(() => [...rows, ...wider], [rows, wider]);
  const lectures = useMemo(() => teacherLectures(all, teacherId, termId, excludeId, collegeId), [all, teacherId, termId, excludeId, collegeId]);
  const draftStart = toMin(draft.fstarttime), draftEnd = toMin(draft.fendtime);
  const minutes = Number.isFinite(draftStart) && Number.isFinite(draftEnd) && draftEnd > draftStart ? draftEnd - draftStart : 0;
  const options = useMemo(() => lectureStickOptions(lectures, all, course, dayWindow, { minutes, excludeId }),
    [lectures, all, course, dayWindow, minutes, excludeId]);
  const [more, setMore] = useState(false);
  if (!options.length) return null;
  const draftDays = DAY_KEYS.filter(day => Boolean((draft as any)[day])).join("+");
  const shown = more ? options : options.slice(0, SHOWN);
  const nameOf = (row: FSchedule) => courseLabel(String(row.AdCourseName || courses.get(Number(row.AdCourseId))?.CourseName || ""), 0.3).text
    || String(courses.get(Number(row.AdCourseId))?.CourseCode || "");
  return <div className="lecture-stick" role="group" aria-label="لاصق بمحاضرتي">
    <p className="lecture-stick-head"><Magnet aria-hidden="true" /><b>لاصق بمحاضرتي</b><small>قبلها أو بعدها في اليوم نفسه</small></p>
    <div className="lecture-stick-list">
      {shown.map(option => {
        const { spot, lecture, room, side } = option;
        const Icon = side === "before" ? ArrowUp : ArrowDown;
        const active = draftDays === spot.days.join("+") && draftStart === spot.start && draftEnd === spot.end;
        const where = room ? [room.AdRoomCode, room.AdRoomHall].filter(Boolean).join("/") : "";
        const days = spot.days.map(day => DAY_SHORT[day]).join("·");
        const label = nameOf(lecture.row);
        return <button type="button" key={option.key} className={`lecture-stick-chip is-${side}${active ? " is-active" : ""}`} aria-pressed={active}
          title={`${side === "before" ? "قبل" : "بعد"} «${String(lecture.row.AdCourseName || label)}» · ${days} ${toClock(spot.start)}–${toClock(spot.end)}${where ? ` · ${where}` : ""}`}
          data-guide-ignore="يملأ الأيام والبداية والنهاية ملاصقاً لمحاضرة الأستاذ (وقاعتها إن خلت)؛ لا يحفظ شيئاً"
          onClick={() => onPick({ day: spot.day, start: toClock(spot.start), end: toClock(spot.end), days: spot.days, room: room || undefined })}>
          <span className="lecture-stick-side" aria-hidden="true"><Icon /></span>
          <span className="lecture-stick-copy">
            <b>{side === "before" ? "قبل" : "بعد"} {label}</b>
            <small><span>{days}</span> <time dir="ltr">{toClock(spot.start)}–{toClock(spot.end)}</time></small>
          </span>
          {where ? <span className="lecture-stick-room"><DoorOpen aria-hidden="true" /><bdi dir="ltr">{where}</bdi></span> : null}
        </button>;
      })}
    </div>
    {options.length > SHOWN ? <button type="button" className="lecture-stick-more" onClick={() => setMore(value => !value)}
      data-guide-ignore="يعرض بقية خيارات الالتصاق أو يطويها">{more ? "أقل" : `+${options.length - SHOWN}`}</button> : null}
  </div>;
}
