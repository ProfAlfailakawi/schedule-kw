import CompanionFacilityPicker from "./CompanionFacilityPicker";
import SearchableSelect from "./SearchableSelect";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, Check, Clock3, DoorOpen, Loader2, Maximize2, Minus, MonitorPlay, Puzzle, Sparkles, UserRound, X } from "lucide-react";
import type { AdCourse, AdInstructor } from "../types";
import LocationPicker from "./LocationPicker";
import { TimeWheels } from "./TimeCounter";
import type { DayKey } from "./scheduleWorkspace";
import {
  formatScheduleTimeRange,
  SCHEDULE_DAY_END,
} from "../utils/scheduleTime";
import { sortByName } from "../utils/sorting";
import { toEnglishDigits } from "../utils/digits";
import { isAssignableInstructor } from "../utils/instructorStatus";
import { isBlockingConflict } from "../utils/scheduleIntelligence";
import { courseOptionBadge, usePlanBadges } from "../utils/planBadges";
import { useVisitingLookup } from "../hooks/useVisitingLookup";
import RoomSuggestionCards, { SuggestionEmpty } from "./RoomSuggestionCards";
import InstructorPicker from "./InstructorPicker";
import VisitingBadge from "./VisitingBadge";
import RegulationPatternChips from "./RegulationPatternChips";
import { appointmentVerdict, type CheckKind } from "../utils/appointmentVerdict";
import { pickDay, regulationChoiceFor, regulationChoicesForDay, regulationEnd, regulationFit, type RegulationChoice } from "../utils/appointmentRegulation";
import { fetchSuggestions, suggestionBody, type SuggestionReply } from "../utils/suggestionClient";

/**
 * The appointment written where it was drawn.
 *
 * A stroke down an empty column already says the day, the hour and the length —
 * three of the eight answers a lecture needs. Sending that stroke to a full-page
 * form threw the other five back at the reader as an empty screen, and the
 * gesture's whole promise («here, this hour») was lost in the journey.
 *
 * So the form comes to the stroke instead: a card that opens on the painted
 * block, asks only for what the stroke could not know — the course, the section
 * number, the instructor, the hall — and keeps every wider door open. «تفاصيل
 * أكثر» hands the half-filled draft to the full editor without losing a
 * keystroke, so nothing here is a smaller version of anything; it is the same
 * form, entered from the side that was already answered.
 *
 * والبطاقة تقرأ ما يقرؤه المحرر الكامل حرفاً: أنماط اللائحة (appointmentRegulation)،
 * والحكم الواحد (appointmentVerdict)، ومحرّك الاقتراح الواحد (suggestionClient).
 */

const minutesOf = (time: string) => {
  const [h, m] = String(time || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const DAY_ORDER: Array<{ key: DayKey; short: string }> = [
  { key: "fsunday", short: "أحد" }, { key: "fmonday", short: "اثنين" }, { key: "ftuesday", short: "ثلاثاء" },
  { key: "fwednesday", short: "أربعاء" }, { key: "fthursday", short: "خميس" },
];
const CHECK_ICONS: Record<CheckKind, typeof UserRound> = {
  teacher: UserRound, room: DoorOpen, section: Puzzle, facility: MonitorPlay, time: Clock3, college: Building2,
};

export type QuickDraft = {
  companionRoomId?: string;
  companionRoomLabel?: string;
  courseId: number;
  scode: string;
  instructorId: number;
  room: string;
  hall: string;
  buildingId?: string;
  roomId?: string;
  locationStatus?: "VERIFIED" | "PENDING_ROOM";
  start: string;
  end: string;
  /** أيام الموعد بعد إكمال نمط اللائحة (قد تزيد على اليوم المرسوم). */
  days?: DayKey[];
};

export type QuickSeed = {
  instructorRequestId?: string;
  day: DayKey;
  dayLabel: string;
  start: string;
  end: string;
  x: number;
  y: number;
  instructorId: number;
  room: string;
  hall: string;
  /** قاعةٌ خاليةٌ في هذا الوقت يقترحها النظامُ (طلبُ أستاذ): تُملأ في البطاقة ويبقى للمنسّق أن يغيّرها. */
  suggestion?: { room: string; hall: string; buildingId?: string; roomId?: string; locationStatus?: "VERIFIED" | "PENDING_ROOM"; companionRoomId?: string; companionRoomLabel?: string };
  /** All weekdays of this appointment, not just the first painted/selected day. */
  days?: DayKey[];
  /** An instructor request may contain different times on different days. */
  fixedSlots?: Array<{ day: string; start: string; end: string }>;
  /** Related request moves are checked atomically against the final week. */
  deferLiveCheck?: boolean;
};

export default function QuickCreatePopover({
  seed,
  courses,
  instructors,
  collegeId,
  sectionId,
  termId,
  durationForDay,
  conflictOf,
  nextSectionCode,
  saving,
  error,
  onCancel,
  onExpand,
  onCreate,
  initialCourseId = 0,
  departmentIds = [],
  visitingIds,
  visitingRosterIds,
}: {
  /** مقرّرٌ معروفٌ سلفاً — كإضافةٍ طلبها أستاذ — فتُفتح البطاقةُ وهو مختار. */
  initialCourseId?: number;
  seed: QuickSeed;
  courses: AdCourse[];
  instructors: AdInstructor[];
  collegeId: number;
  sectionId: number;
  termId: number;
  /** The department's learned duration for the chosen day, with the
      institutional 50/80-minute rhythm supplied by the parent as fallback. */
  durationForDay?: (day: DayKey) => number;
  conflictOf: (draft: QuickDraft, day: DayKey) => string | null;
  /** The next free section number for a course, so the field fills itself the
      same way the full editor's does. */
  nextSectionCode?: (courseId: number) => string;
  saving: boolean;
  /** A refusal from the server, said on the card rather than at the top of a
      page the reader is not currently looking at. */
  error?: string | null;
  onCancel: () => void;
  onExpand: (draft: QuickDraft) => void;
  onCreate: (draft: QuickDraft) => void;
  /** أساتذة القسم (لترتيب المنتقي) — المنتقي الموحّد نفسه في المحرر الكامل. */
  departmentIds?: number[];
  visitingIds?: Iterable<number>;
  visitingRosterIds?: Iterable<number>;
}) {
  const planBadges = usePlanBadges();
  const { isVisiting } = useVisitingLookup(termId);
  const ref = useRef<HTMLDivElement | null>(null);
  const firstField = useRef<HTMLButtonElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  /* طلبُ أستاذٍ يحمل أيامه: لا تُعاد صياغتها هنا (الوارد يقرّر). الرسمُ الحرّ يكمل النمط. */
  const daysLocked = Boolean(seed.days?.length || seed.fixedSlots?.length || seed.instructorRequestId);
  const [chosenDays, setChosenDays] = useState<DayKey[]>(seed.days?.length ? seed.days : [seed.day]);
  const [dayChoices, setDayChoices] = useState<RegulationChoice[]>([]);
  const hasDifferentTimes = new Set((seed.fixedSlots || []).map(slot => `${slot.start}|${slot.end}`)).size > 1;
  const openedStart = minutesOf(seed.start);
  const openedEnd = Math.max(openedStart + 30, minutesOf(seed.end));
  const [draft, setDraft] = useState<QuickDraft>({
    courseId: initialCourseId || 0,
    scode: initialCourseId && nextSectionCode ? nextSectionCode(initialCourseId) : "",
    instructorId: seed.instructorId || 0,
    room: seed.suggestion?.room || "",
    hall: seed.suggestion?.hall || "",
    buildingId: seed.suggestion?.buildingId, roomId: seed.suggestion?.roomId, locationStatus: seed.suggestion?.locationStatus,
    companionRoomId: seed.suggestion?.companionRoomId, companionRoomLabel: seed.suggestion?.companionRoomLabel,
    start: timeOf(openedStart),
    end: timeOf(openedEnd),
  });
  const patch = (values: Partial<QuickDraft>) => setDraft((prev) => ({ ...prev, ...values }));
  const selectedCourse = courses.find(course => Number(course.AdCourseId) === Number(draft.courseId));
  /* Typing 101, 102, 103 by hand is work nobody should be doing, and the full
     editor already stopped asking for it. Anything typed by hand wins; the
     suggestion only refills while the field is still untouched. */
  const sectionTyped = useRef(false);
  const timeEdited = useRef(false);
  /* ── اللائحة عند اختيار المقرر وعند ضغط يوم (B1) ───────────────────────── */
  const applyDays = (course: AdCourse | undefined, result: { days: DayKey[]; alternatives: RegulationChoice[] }) => {
    setChosenDays(result.days);
    setDayChoices(result.alternatives);
    if (timeEdited.current || hasDifferentTimes) return;
    setDraft(current => {
      const end = regulationEnd(course, result.days, current.start);
      return end && end !== current.end ? { ...current, end } : current;
    });
  };
  const chooseCourse = (courseId: number) => {
    const next: Partial<QuickDraft> = { courseId };
    if (courseId && nextSectionCode && (!draft.scode.trim() || !sectionTyped.current)) {
      next.scode = nextSectionCode(courseId);
    }
    patch(next);
    const course = courses.find(item => Number(item.AdCourseId) === courseId);
    if (!daysLocked && course) applyDays(course, pickDay(course, [], seed.day, true));
  };
  const toggleDay = (day: DayKey) => {
    if (daysLocked) return;
    const checked = !chosenDays.includes(day);
    if (!checked && chosenDays.length === 1) return;
    applyDays(selectedCourse, pickDay(selectedCourse, chosenDays, day, checked));
  };
  const applyChoice = (choice: RegulationChoice) => {
    if (daysLocked) return;
    setChosenDays(choice.days as DayKey[]);
    setDraft(current => ({ ...current, end: timeOf(Math.min(SCHEDULE_DAY_END, minutesOf(current.start) + choice.minutes)) }));
  };

  // A freshly mounted card may use the department's usual length exactly once.
  // Re-renders must never overwrite the duration the coordinator picked.
  const learnedForDay = useRef<string | null>(null);
  useEffect(() => {
    if (learnedForDay.current === seed.day || timeEdited.current || hasDifferentTimes) return;
    learnedForDay.current = seed.day;
    const learned = Number(durationForDay?.(seed.day) || 0);
    if (!learned) return;
    setDraft(current => {
      const from = minutesOf(current.start);
      const end = timeOf(Math.min(SCHEDULE_DAY_END, from + learned));
      return current.end === end ? current : { ...current, end };
    });
  }, [durationForDay, seed.day, hasDifferentTimes]);
  /* مقررٌ معروف سلفاً: النمط يُكمل مرة واحدة عند الفتح. */
  useEffect(() => {
    if (initialCourseId && !daysLocked) {
      const course = courses.find(item => Number(item.AdCourseId) === Number(initialCourseId));
      if (course) applyDays(course, pickDay(course, [], seed.day, true));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Measured against the window, never against the column: a card that explains
  // an hour must not be clipped by the day that hour belongs to.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 12;
    let left = seed.x - rect.width / 2;
    let top = seed.y + 14;
    if (top + rect.height > window.innerHeight - margin) top = seed.y - rect.height - 14;
    if (top < margin) top = margin;
    left = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, left));
    setBox({ left, top });
  }, [seed.x, seed.y]);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  // Escape closes; a press anywhere outside closes. Both are the same promise —
  // nothing here is saved until «إنشاء» is pressed, so leaving costs nothing.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      /* قائمةُ مقررٍ مفتوحة داخل البطاقة تأخذ Escape وحدها (تُغلق هي)، فلا تُهمل المسوّدة. */
      if (e.key === "Escape") { if (ref.current?.querySelector(".ss-pop") || ref.current?.querySelector(".instructor-pop")) return; e.stopPropagation(); onCancel(); }
    };
    const away = (e: PointerEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      onCancel();
    };
    window.addEventListener("keydown", key, true);
    // Registered a beat later so the pointerup that ended the paint stroke does
    // not immediately close the card it just opened.
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", away), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", away);
    };
  }, [onCancel]);

  const ready = Boolean(draft.courseId && draft.scode.trim() && draft.instructorId && draft.buildingId && (draft.roomId || draft.locationStatus === "PENDING_ROOM"));
  const digitsOk = /^\d*$/.test(toEnglishDigits(draft.scode));
  const clash = ready && digitsOk && !hasDifferentTimes ? conflictOf(draft, seed.day) : null;
  const [liveCheck, setLiveCheck] = useState<{ key: string; checking: boolean; conflicts: any[]; validation: string[]; notices: string[]; error: string }>({
    key: "", checking: false, conflicts: [], validation: [], notices: [], error: "",
  });
  const [ideas, setIdeas] = useState<SuggestionReply["slots"] | null>(null);
  const [ideaReason, setIdeaReason] = useState<SuggestionReply["reason"]>(undefined);
  const [ideaKind, setIdeaKind] = useState<"room" | "time" | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState("");

  const payload = {
    instructorRequestId: seed.instructorRequestId,
    companionRoomId: draft.companionRoomId,
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    AdCourseId: draft.courseId, SCode: draft.scode.trim(), AdInstructorId: draft.instructorId,
    AdRoomCode: draft.room.trim(), AdRoomHall: draft.hall.trim(),
    buildingId: draft.buildingId, roomId: draft.roomId, locationStatus: draft.locationStatus,
    fstarttime: draft.start, fendtime: draft.end,
    fsunday: chosenDays.includes("fsunday"), fmonday: chosenDays.includes("fmonday"),
    ftuesday: chosenDays.includes("ftuesday"), fwednesday: chosenDays.includes("fwednesday"),
    fthursday: chosenDays.includes("fthursday"),
  };
  const checkKey = JSON.stringify(payload);
  const latestIdeasKey = useRef(checkKey);
  latestIdeasKey.current = checkKey;
  /* يُفحص ما اختير فقط: المقرر والوقت كافيان لبدء الفحص، ولا يُنتظر اكتمال كل الحقول —
     فيُعرف تعارض الأستاذ قبل اختيار القاعة، والعكس، دون أن يُفحص حقلٌ فارغ. */
  const checkable = Boolean(draft.courseId && digitsOk && !hasDifferentTimes && !seed.deferLiveCheck && (draft.instructorId || draft.roomId));
  useEffect(() => {
    if (!checkable) {
      setLiveCheck({ key: "", checking: false, conflicts: [], validation: [], notices: [], error: "" });
      return;
    }
    const controller = new AbortController();
    setLiveCheck(current => ({ ...current, key: checkKey, checking: true, error: "" }));
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/schedules/check-conflicts", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: checkKey, signal: controller.signal,
        });
        if (!response.ok) throw new Error("تعذّر فحص الموعد. أعد المحاولة.");
        const result = await response.json();
        const conflicts: any[] = Array.isArray(result.conflicts) ? result.conflicts : [];
        const validation: string[] = Array.isArray(result.validationIssues) ? result.validationIssues : [];
        setLiveCheck({
          key: checkKey, checking: false, conflicts, validation,
          notices: [
            ...(result.patternNotice ? ["نمط الأيام المختار غير معتمد لهذا المقرر؛ راجع الأنماط المعتادة."] : []),
            ...(result.lectureNotice ? ["مدة المحاضرة تختلف عن النمط المعتاد للمقرر."] : []),
          ],
          error: "",
        });
      } catch (issue: any) {
        if (issue?.name !== "AbortError") {
          setLiveCheck({ key: checkKey, checking: false, conflicts: [], validation: [], notices: [], error: issue?.message || "تعذّر فحص الموعد." });
        }
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [checkKey, checkable]);

  const previewCurrent = liveCheck.key === checkKey;
  const companionRequired = Boolean(String(selectedCourse?.CourseCompanionRoomType || "").trim());
  const fit = regulationFit(selectedCourse, chosenDays, draft.start, draft.end);
  /* الحكم الواحد نفسه الذي يقرؤه المحرر الكامل. */
  const verdict = appointmentVerdict({
    form: payload as any,
    validationIssues: previewCurrent ? liveCheck.validation : [],
    conflicts: previewCurrent ? liveCheck.conflicts : [],
    checking: checkable && (!previewCurrent || liveCheck.checking),
    companionRequired,
    regulation: fit,
    notes: (previewCurrent ? liveCheck.notices : []).map(text => ({ kind: "time" as const, text })),
  });
  const blockingCount = previewCurrent ? liveCheck.conflicts.filter(isBlockingConflict).length : 0;
  const pendingCheck = ready && checkable && (!previewCurrent || liveCheck.checking);
  const blocked = previewCurrent && (verdict.blockers.length > 0 || blockingCount > 0);
  const checkFailed = previewCurrent && Boolean(liveCheck.error);

  useEffect(() => { setIdeas(null); setIdeasError(""); setIdeaReason(undefined); }, [checkKey]);
  const requestIdeas = async (roomOnly: boolean) => {
    if (!draft.courseId || hasDifferentTimes) return;
    const requestedKey = checkKey;
    setIdeaKind(roomOnly ? "room" : "time");
    setIdeas(null); setIdeasError(""); setIdeaReason(undefined); setIdeasBusy(true);
    try {
      const result = await fetchSuggestions(suggestionBody(payload, roomOnly ? "room" : "slot", minutesOf(draft.end) - minutesOf(draft.start)));
      if (latestIdeasKey.current !== requestedKey) return;
      setIdeas(result.slots);
      setIdeaReason(result.reason);
      if (!result.slots.length && result.note) setIdeasError(String(result.note));
    } catch (issue: any) { if (latestIdeasKey.current === requestedKey) setIdeasError(issue?.message || "تعذّر إيجاد المقترحات."); }
    finally { setIdeasBusy(false); }
  };
  const takeIdea = (idea: SuggestionReply["slots"][number]) => {
    timeEdited.current = true;
    patch({
      ...(idea.start && idea.end ? { start: idea.start, end: idea.end } : {}),
      room: idea.room, hall: idea.hall, buildingId: idea.buildingId, roomId: idea.roomId, locationStatus: "VERIFIED",
      ...(idea.companionRoomId ? { companionRoomId: idea.companionRoomId, companionRoomLabel: idea.companionRoomLabel } : {}),
    });
    setIdeas(null);
  };

  const orderedCourses = useMemo(() => sortByName(courses, (course: AdCourse) => course.CourseName), [courses]);
  const assignable = useMemo(() => instructors.filter(isAssignableInstructor), [instructors]);
  const lockedTeacher = Boolean(seed.instructorRequestId);
  const teacherName = instructors.find(person => Number(person.AdInstructorId) === Number(draft.instructorId))?.AdInstructorName || "";
  const regulationChips = useMemo(() => {
    if (daysLocked || !selectedCourse) return [];
    const active = regulationChoiceFor(selectedCourse, chosenDays);
    const pool = [...(active ? [active] : []), ...dayChoices, ...(chosenDays.length ? regulationChoicesForDay(selectedCourse, chosenDays[0]) : [])];
    const seen = new Set<string>();
    return pool.filter(choice => { const key = choice.days.join("+") + choice.minutes; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
  }, [daysLocked, selectedCourse, chosenDays, dayChoices]);
  const dayLabel = chosenDays.map(day => DAY_ORDER.find(item => item.key === day)?.short).filter(Boolean).join("·") || seed.dayLabel;
  const firstBlocker = verdict.blockers[0]?.text;

  return (
    <div
      className="quick-create visual-minimal"
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`موعد جديد · ${seed.dayLabel}`}
      style={box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="qc-head">
        <span className="qc-mark" aria-hidden="true"><Clock3 /></span>
        <div>
          <strong>موعد جديد</strong>
          <small>{dayLabel} · <time dir="ltr">{formatScheduleTimeRange(draft.start, draft.end)}</time></small>
        </div>
        <button type="button" className="qc-close" onClick={onCancel} aria-label="إغلاق بدون حفظ">
          <X aria-hidden="true" />
        </button>
      </header>

      {hasDifferentTimes ? (
        <div className="qc-warn" role="status">
          <strong>أوقات مختلفة في طلب الأستاذ — تُحفظ كل مجموعة حسب وقتها الأصلي</strong>
          {(seed.fixedSlots || []).map((slot, index) => (
            <small key={index} style={{ display: "block" }}>{slot.day} · {formatScheduleTimeRange(slot.start, slot.end)}</small>
          ))}
          <small>لم نُظهر عدّاداً يغيّر موعداً واحداً ثم يهمل بقية المواعيد.</small>
        </div>
      ) : (
        <TimeWheels
          start={draft.start}
          end={draft.end}
          onChange={(next) => { timeEdited.current = true; patch({ start: next.start, end: next.end }); }}
          preferredDuration={regulationChoiceFor(selectedCourse, chosenDays)?.minutes || Number(durationForDay?.(seed.day) || 0)}
        />
      )}

      {!daysLocked ? (
        <div className="qc-days" role="group" aria-label="أيام الموعد">
          {DAY_ORDER.map(day => {
            const on = chosenDays.includes(day.key);
            return <button type="button" key={day.key} className={on ? "is-on" : ""} aria-pressed={on}
              data-guide-ignore="ضغط يوم يكمل أيام نمط اللائحة للمقرر؛ لا يحفظ شيئاً"
              onClick={() => toggleDay(day.key)}>{day.short}</button>;
          })}
        </div>
      ) : null}
      {regulationChips.length || fit === "off" ? (
        <RegulationPatternChips compact choices={regulationChips} activeId={regulationChoiceFor(selectedCourse, chosenDays)?.id} fit={fit} onPick={applyChoice} />
      ) : null}

      <div className="qc-fields">
        <label className="qc-field qc-wide">
          <span>المقرر</span>
          <SearchableSelect
            triggerRef={firstField}
            value={draft.courseId || ""}
            onChange={(picked) => chooseCourse(Number(picked) || 0)}
            options={orderedCourses.map((c) => ({ value: c.AdCourseId, label: c.CourseName, badge: courseOptionBadge([Number(c.AdCourseId)], planBadges), hint: c.CourseCode || undefined, keywords: String(c.CourseCode || "") }))}
            placeholder="اختر المقرر…"
            ariaLabel="المقرر"
            searchPlaceholder="اكتب اسم المقرر أو رمزه"
            className="ss-compact"
          />
        </label>
        <label className="qc-field qc-narrow">
          <span>الشعبة</span>
          <input
            value={draft.scode}
            inputMode="numeric"
            dir="ltr"
            placeholder="01"
            onChange={(e) => { sectionTyped.current = true; patch({ scode: toEnglishDigits(e.target.value) }); }}
          />
        </label>
        <div className="qc-field qc-teacher">
          <span>الأستاذ</span>
          {lockedTeacher ? (
            <span className="qc-teacher-locked">
              <UserRound aria-hidden="true" /><b>{teacherName || "أستاذ الطلب"}</b>
              {isVisiting(draft.instructorId, collegeId, sectionId) ? <VisitingBadge compact /> : null}
            </span>
          ) : (
            <InstructorPicker
              value={Number(draft.instructorId) || 0}
              onChange={(id) => patch({ instructorId: id })}
              instructors={assignable as any}
              departmentIds={departmentIds}
              visitingIds={visitingIds}
              visitingRosterIds={visitingRosterIds}
              collegeId={collegeId}
              sectionId={sectionId}
              termId={termId}
              canCreate={false}
              strictDepartmentOnly
            />
          )}
        </div>
        <div className="qc-location">
          <LocationPicker
            collegeId={collegeId}
            sectionId={sectionId}
            termId={termId}
            showDepartmentHistory={false}
            courseRoomType={String(selectedCourse?.CourseRoomType || "")}
            courseTeachingMode={String(selectedCourse?.CourseTeachingMode || "")}
            seatsNeeded={Number(selectedCourse?.MaxStudent || 0)}
            value={{AdRoomCode:draft.room,AdRoomHall:draft.hall,buildingId:draft.buildingId,roomId:draft.roomId,locationStatus:draft.locationStatus}}
            onChange={(location)=>{
              const buildingChanged = "buildingId" in location && String(location.buildingId || "") !== String(draft.buildingId || "");
              patch({room:String(location.AdRoomCode||""),hall:String(location.AdRoomHall||""),buildingId:location.buildingId,roomId:location.roomId,locationStatus:location.locationStatus as any,
                ...(buildingChanged?{companionRoomId:"",companionRoomLabel:""}:{})});
            }}
          />
        </div>
      </div>
      <CompanionFacilityPicker course={selectedCourse} form={payload}
        onChange={values => patch({ companionRoomId: values.companionRoomId, companionRoomLabel: values.companionRoomLabel })} />

      {!hasDifferentTimes && draft.courseId ? (
        <div className="qc-ideas" role="group" aria-label="مقترحات الموعد">
          <div className="slot-advisor">
            <button type="button" className="slot-advisor-ask" data-guide-ignore="يقترح أوقاتاً وقاعات دون حفظ" disabled={ideasBusy} onClick={() => void requestIdeas(false)}><Sparkles aria-hidden="true" />اقترح لي وقتاً وقاعة</button>
            <button type="button" className="room-suggest-ask" data-guide-ignore="يقترح قاعات دون حجز" disabled={ideasBusy} onClick={() => void requestIdeas(true)}><DoorOpen aria-hidden="true" />اقترح قاعة متاحة</button>
          </div>
          {ideasBusy ? <small role="status" className="qc-busy"><Loader2 aria-hidden="true" />أبحث…</small> : null}
          {ideas && !ideas.length ? <SuggestionEmpty reason={ideaReason} note={ideasError || "لا توجد اقتراحات متاحة ضمن الشروط المختارة."} /> : null}
          {!ideas && ideasError ? <p className="qc-warn">{ideasError}</p> : null}
          {ideas?.length ? (
            ideaKind === "room" ? <RoomSuggestionCards suggestions={ideas} label="قاعات مناسبة للموعد" onSelect={takeIdea} />
              : <RoomSuggestionCards variant="slot" suggestions={ideas} label="أفضل الأوقات والقاعات" onSelect={takeIdea} />
          ) : null}
        </div>
      ) : null}

      {checkable ? (
        <ul className="qc-checks" aria-label="فحص الموعد">
          {verdict.checks.map(check => {
            const Icon = CHECK_ICONS[check.kind];
            const StateIcon = check.state === "ok" ? Check : check.state === "warn" ? AlertTriangle : check.state === "block" ? X : Minus;
            return <li key={check.kind} className={`is-${check.state}`} title={check.details.map(detail => detail.text).join(" · ") || `${check.label}: ${check.word}`}>
              <Icon aria-hidden="true" /><StateIcon aria-hidden="true" className="qc-check-state" /><span>{check.label}</span>
            </li>;
          })}
          {verdict.state === "checking" ? <li className="is-pending"><Loader2 aria-hidden="true" /></li> : null}
        </ul>
      ) : null}
      {error ? (
        <p className="qc-warn qc-warn-hard"><AlertTriangle aria-hidden="true" />{error}</p>
      ) : !digitsOk ? (
        <p className="qc-warn"><AlertTriangle aria-hidden="true" />الرجاء كتابة رقم الشعبة بالأرقام الإنجليزية.</p>
      ) : blocked || checkFailed ? (
        <p className="qc-warn qc-warn-hard"><AlertTriangle aria-hidden="true" />{firstBlocker || liveCheck.error}</p>
      ) : clash && !previewCurrent ? (
        <p className="qc-warn"><AlertTriangle aria-hidden="true" />{clash}</p>
      ) : null}
      {seed.deferLiveCheck ? <p className="qc-warn" role="status">الأوقات المرتبطة تُفحص معاً على الجدول النهائي قبل تثبيت طلب الأستاذ.</p> : null}

      <footer className="qc-foot">
        <button type="button" className="qc-expand" data-guide-ignore="التوسيع ينقل مسودة الموعد إلى المحرر الكامل" disabled={hasDifferentTimes}
          title={hasDifferentTimes ? "الأوقات المختلفة تُراجع وتُعتمد معاً من وارد الأساتذة" : undefined}
          onClick={() => onExpand({ ...draft, days: chosenDays })}>
          <Maximize2 aria-hidden="true" />تفاصيل أكثر
        </button>
        <button type="button" className="qc-cancel" onClick={onCancel}>إلغاء</button>
        <button
          type="button"
          className="qc-create"
          data-guide-ignore="زر الحفظ الأساسي للموعد يخضع للفحص الكامل"
          disabled={!ready || !digitsOk || saving || pendingCheck || blocked || checkFailed}
          onClick={() => onCreate({ ...draft, days: chosenDays })}
          title={ready ? "حفظ الموعد في هذه الخانة" : "أكمل المقرر والشعبة والأستاذ والقاعة"}
        >
          <Check aria-hidden="true" />{saving ? "أحفظ…" : "إنشاء"}
        </button>
      </footer>
    </div>
  );
}
