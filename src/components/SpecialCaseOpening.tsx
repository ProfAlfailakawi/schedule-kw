import React, { useEffect, useRef, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import CourseTags from "./CourseTags";
import SpecialSectionBuilder, { type SpecialCheck, type SpecialMeeting } from "./SpecialSectionBuilder";
import type { AdCourse } from "../types";

/**
 * ── موافقةُ اللجنة + فتحُ شعبةٍ لمقررٍ نظريٍّ وعمليّ ──────────────────────────────────────────
 * طالبٌ متعثّرٌ في مقرر 2+2 (نظري + عملي): فتحُ شعبته لقاءٌ واحدٌ ناقص لا يُقبل. فتُفتح هنا بمنشئ الشعبة نفسه الذي في «موعد»
 * (الأيام ومدة كل يوم، ثم أين العملي ومكانه)، ويختار المنسّق الأستاذ، ويُرسل القرارُ واللقاءاتُ معاً في طلبٍ واحد:
 * POST /api/student-registration/:id/course-state بـ openSection.meetings — فإن رُفضت الشعبة لم تُسجَّل الموافقة.
 */
export default function SpecialCaseOpening({ course, studentName, termId, suggestedInstructorId, onClose, onCheck, onSave }: {
  key?: React.Key;
  course: AdCourse;
  studentName: string;
  termId: number;
  suggestedInstructorId?: number;
  onClose: () => void;
  onCheck: (meetings: SpecialMeeting[], instructorId: number) => Promise<SpecialCheck>;
  onSave: (meetings: SpecialMeeting[], instructorId: number) => Promise<void>;
}) {
  const [people, setPeople] = useState<Array<{ AdInstructorId: number; AdInstructorName: string }>>([]);
  const [instructorId, setInstructorId] = useState(Number(suggestedInstructorId || 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  useEffect(() => {
    const query = new URLSearchParams({ collegeId: String(course.AdCollegeId), sectionId: String(course.AdSectionId), termId: String(termId) });
    fetch(`/api/instructors?${query}`, { credentials: "include" }).then(response => response.json()).then(list => {
      if (!Array.isArray(list)) return;
      setPeople(list.filter((person: any) => !String(person.AdInstructorName || "").startsWith("هيئة")));
    }).catch(() => setPeople([]));
  }, [course.AdCollegeId, course.AdSectionId, termId]);

  return (
    <div className="changes-extend-sheet ssb-case-sheet" role="dialog" aria-modal="true" aria-labelledby="ssb-case-title" dir="rtl">
      <div className="changes-extend-card ssb-case-card">
        <header>
          <strong id="ssb-case-title"><FlaskConical aria-hidden="true" />موافقة + فتح شعبة · {course.CourseName}<CourseTags courseId={course.AdCourseId} /></strong>
          <button type="button" ref={closeRef} onClick={onClose} aria-label="إغلاق" data-guide-ignore="يغلق فتح الشعبة بلا حفظ ولا قرار"><X /></button>
        </header>
        <p className="ssb-case-lead">طلب {studentName}. المقرر نظري + عملي: تُفتح الشعبة بلقاءيها معاً، وتُسجَّل موافقة اللجنة معها أو لا يُكتب شيء.</p>
        <label className="ssb-case-teacher">
          <span>الأستاذ</span>
          <select value={instructorId || ""} onChange={event => setInstructorId(Number(event.target.value) || 0)} aria-label="أستاذ الشعبة">
            <option value="">اختر الأستاذ</option>
            {people.map(person => <option key={person.AdInstructorId} value={person.AdInstructorId}>{person.AdInstructorName}</option>)}
          </select>
        </label>
        {error ? <p className="ssb-case-error" role="alert">{error}</p> : null}
        {instructorId ? (
          <SpecialSectionBuilder
            key={instructorId}
            step={null}
            course={course}
            scode="جديدة"
            busy={busy}
            collegeId={Number(course.AdCollegeId)} sectionId={Number(course.AdSectionId)} termId={termId}
            onCheck={meetings => onCheck(meetings, instructorId)}
            onSave={async meetings => {
              setBusy(true); setError("");
              try { await onSave(meetings, instructorId); }
              catch (issue: any) { setError(String(issue?.message || "تعذّر فتح الشعبة")); }
              finally { setBusy(false); }
            }}
          />
        ) : <p className="ssb-case-hint">اختر الأستاذ أولاً، ثم أيام الشعبة ومكان العملي.</p>}
      </div>
    </div>
  );
}
