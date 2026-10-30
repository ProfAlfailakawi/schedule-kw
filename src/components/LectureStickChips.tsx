import React, { useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, DoorOpen, Magnet } from "lucide-react";
import type { AdCourse, FSchedule } from "../types";
import { DAY_KEYS, type DayKey } from "../utils/scheduleRegulations";
import { lectureStickOptions, teacherLectures, toClock, toMin, type MiniSpan } from "../utils/teacherMiniWeek";
import { courseLabel } from "../utils/courseLabel";
import { useWiderWeek, type MiniPick } from "./TeacherMiniWeek";
import { safeStorage } from "../utils/safeStorage";

const DAY_SHORT: Record<DayKey, string> = { fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء", fwednesday: "أربعاء", fthursday: "خميس" };
const SHOWN = 6;

/* ── مطويٌّ افتراضياً، ويُتذكَّر على الجهاز (ملاحظة المالك R3) ───────────────────
   رأسٌ مضغوط بأيقونته وعدد الخيارات؛ من فتحه مرةً يجده مفتوحاً في النموذج التالي. */
const OPEN_KEY = "lecture-stick:open";
const OPEN_EVENT = "lecture-stick:open";
export function useLectureStickOpen(): [boolean, (next: boolean) => void] {
  const [open, setOpenState] = useState(() => safeStorage.get(OPEN_KEY) === "on");
  useEffect(() => {
    const sync = () => setOpenState(safeStorage.get(OPEN_KEY) === "on");
    window.addEventListener(OPEN_EVENT, sync);
    return () => window.removeEventListener(OPEN_EVENT, sync);
  }, []);
  const setOpen = (next: boolean) => {
    safeStorage.set(OPEN_KEY, next ? "on" : "off");
    setOpenState(next);
    window.dispatchEvent(new Event(OPEN_EVENT));
  };
  return [open, setOpen];
}

/**
 * ── «لاصق بمحاضرتي» داخل نموذج الموعد (الجديد والتعديل) ──────────────────────
 * شرائح «قبل/بعد» كل محاضرةٍ للأستاذ، في اليوم نفسه وبفاصل اللائحة (lectureStick)؛
 * ضغطةٌ واحدة تملأ الأيام والبداية والنهاية (وقاعة المحاضرة إن خلت ولم تُختر قاعة).
 * هذا نموذج الإدارة، فتظهر القاعة أو المبنى تلميحاً على الشريحة.
 */
export default function LectureStickChips({
  teacherId, rows, termId, collegeId, excludeId = 0, course, courses, window: dayWindow, draft, original = null, onPick,
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
  /** الموعد كما كان قبل التعديل: مقرره وشعبته ليسا مرساةً ولو غيّر المستخدم المقرر في النموذج. */
  original?: Partial<FSchedule> | null;
  onPick: (pick: MiniPick) => void;
}) {
  const wider = useWiderWeek(teacherId, termId, rows);
  const all = useMemo(() => [...rows, ...wider], [rows, wider]);
  const lectures = useMemo(() => teacherLectures(all, teacherId, termId, excludeId, collegeId), [all, teacherId, termId, excludeId, collegeId]);
  const draftStart = toMin(draft.fstarttime), draftEnd = toMin(draft.fendtime);
  const minutes = Number.isFinite(draftStart) && Number.isFinite(draftEnd) && draftEnd > draftStart ? draftEnd - draftStart : 0;
  /* موعدُك لا يُلصق بنفسه (المالك 2026-10-30): صفُّه المفتوح للتعديل مستبعدٌ أصلاً، وكذلك أخواته —
     صفوفُ المقرر والشعبة نفسيهما لهذا الأستاذ (موعدٌ تختلف أوقاته بين الأيام يُحفظ صفّين) — في المسوّدة
     وفي الأصل قبل التعديل. وتبقى عائقاً لا يُوضع فوقه شيء. */
  const sectionKey = (row: Partial<FSchedule> | null | undefined) => row && Number(row.AdCourseId) ? `${Number(row.AdCourseId)}|${String(row.SCode ?? "").trim()}` : "";
  const ownKeys = [sectionKey(draft), sectionKey(original)].filter(Boolean).join("§");
  const options = useMemo(() => {
    const own = new Set(ownKeys.split("§").filter(Boolean));
    return lectureStickOptions(lectures, all, course, dayWindow, { minutes, excludeId, skipAnchor: item => own.has(sectionKey(item.row)) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectures, all, course, dayWindow, minutes, excludeId, ownKeys]);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useLectureStickOpen();
  const listId = useId();
  if (!options.length) return null;
  const draftDays = DAY_KEYS.filter(day => Boolean((draft as any)[day])).join("+");
  const shown = more ? options : options.slice(0, SHOWN);
  const nameOf = (row: FSchedule) => courseLabel(String(row.AdCourseName || courses.get(Number(row.AdCourseId))?.CourseName || ""), 0.3).text
    || String(courses.get(Number(row.AdCourseId))?.CourseCode || "");
  const count = options.length.toLocaleString("ar-KW-u-nu-latn");
  return <div className={`lecture-stick${open ? "" : " is-collapsed"}`} role="group" aria-label="لاصق بمحاضرتي">
    <button type="button" className="lecture-stick-toggle" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(!open)}
      title={open ? "طيّ «لاصق بمحاضرتي» (يُتذكَّر على هذا الجهاز)" : "عرض مواعيد قبل محاضرات الأستاذ وبعدها"}
      data-guide-ignore="يفتح خيارات الالتصاق بمحاضرات الأستاذ أو يطويها، ويتذكّر ذلك على هذا الجهاز؛ لا يغيّر الموعد">
      <Magnet aria-hidden="true" /><b>لاصق بمحاضرتي</b><span className="lecture-stick-count">{count}</span>
      <small>قبلها أو بعدها في اليوم نفسه</small><ChevronDown className="lecture-stick-chevron" aria-hidden="true" />
    </button>
    {open ? <>
    <div className="lecture-stick-list" id={listId}>
      {shown.map(option => {
        const { spot, lecture, room, side } = option;
        const Icon = side === "before" ? ArrowUp : ArrowDown;
        const active = draftDays === spot.days.join("+") && draftStart === spot.start && draftEnd === spot.end;
        const where = room ? [room.AdRoomCode, room.AdRoomHall].filter(Boolean).join("/") : "";
        const days = spot.days.map(day => DAY_SHORT[day]).join("·");
        /* شعبةٌ أخرى من مقرر الموعد نفسه تُسمّى برقمها، فلا تُحسب الموعدَ ذاته. */
        const sameCourse = Number(lecture.row.AdCourseId) && [draft, original].some(row => row && Number(row.AdCourseId) === Number(lecture.row.AdCourseId));
        const label = `${nameOf(lecture.row)}${sameCourse && String(lecture.row.SCode ?? "").trim() ? ` · شعبة ${String(lecture.row.SCode).trim()}` : ""}`;
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
    </> : null}
  </div>;
}
