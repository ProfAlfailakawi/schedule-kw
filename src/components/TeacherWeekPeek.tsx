import React from "react";
import { createPortal } from "react-dom";
import type { AdCourse, FSchedule } from "../types";
import type { MiniSpan } from "../utils/teacherMiniWeek";
import TeacherMiniWeek from "./TeacherMiniWeek";

/**
 * ── «الجدول الدراسي» من قائمة الموعد ───────────────────────────────────────────
 * زرٌّ صغير بجانب «تعديل/حذف» على كل موعد؛ يفتح أسبوع صاحب الموعد كاملاً عبر عائلة قسمه
 * (بطاقة جدول الأستاذ المصغّر نفسها) عرضاً فقط: لا «+» ولا رسم ولا حفظ.
 * نافذةٌ فوق الصفحة، والنقر خارجها أو Esc أو X يغلقها.
 */
export default function TeacherWeekPeek({ row, teacherName, nisab, overtime, limited, visiting, rows, courses, window: dayWindow, userId, onClose }: {
  row: FSchedule;
  teacherName: string;
  nisab: number;
  overtime: number;
  limited: boolean;
  visiting: boolean;
  rows: readonly FSchedule[];
  courses: Map<number, AdCourse>;
  window: MiniSpan;
  userId: number;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="week-peek" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      /* البوابة تبقى شجرةً لبطاقة الموعد في React: ما يجري داخلها لا يفتح تعديل الموعد. */
      onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <div className="week-peek-card">
        <TeacherMiniWeek
          readOnly onClose={onClose} variant="side"
          teacherId={Number(row.AdInstructorId)} teacherName={teacherName}
          nisab={nisab} overtime={overtime} limited={limited} visiting={visiting}
          rows={rows} termId={Number(row.AdTermId)} collegeId={Number(row.AdCollegeId)} sectionId={Number(row.AdSectionId)}
          draft={null} verdict={{ state: "idle", blockers: [] } as any} checked={false}
          courses={courses} window={dayWindow} userId={userId} onPick={() => undefined}
        />
      </div>
    </div>,
    document.body,
  );
}
