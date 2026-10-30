import React from "react";
import { BookOpen, CalendarDays, CircleHelp, Clock3, DoorOpen, Hash, Sparkles, UserRound } from "lucide-react";
import { AR, countOf, type ArabicNoun } from "../utils/arabicCount";
import { DAY_KEYS } from "../utils/scheduleRegulations";
import type { OneLineReading } from "../utils/oneLineAppointment";

/**
 * ── «أنشئ هذا الموعد» مرسوماً ────────────────────────────────────────────────
 *
 * The six parts of an appointment, always in the same six places and the same
 * order the editor asks for them: course, section, teacher, days, time, room.
 * A part the line gave is a filled chip; a part it did not give is a dashed
 * «؟» in the same place — so what is still to be decided is seen at a glance,
 * not read. Two candidates are a «؟» with their count. The days are the week
 * itself, five letters with the chosen ones lit.
 *
 * Presentation only: it sits inside the palette's row button, so it holds no
 * control of its own.
 */

const WEEK_LETTERS = ["ح", "ن", "ث", "ر", "خ"];
const listed = (names: string[]) => names.slice(0, 6).join("، ") + (names.length > 6 ? "…" : "");

function Part({ tone, icon, label, value, doubt, noun, auto, autoNote, ltr = false }: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value?: string;
  doubt?: string[];
  noun?: ArabicNoun;
  auto?: boolean;
  autoNote?: string;
  ltr?: boolean;
}) {
  const doubtful = !value && Boolean(doubt && doubt.length > 1 && noun);
  const state = value ? (auto ? " is-auto" : "") : doubtful ? " is-doubt" : " is-missing";
  return (
    <span className={`ol-part ol-${tone}${state}`} title={doubtful ? listed(doubt!) : auto ? autoNote : value || undefined}>
      <span className="ol-part-icon" aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}</span>
      {value ? (
        <b className="ol-part-value" dir={ltr ? "ltr" : undefined}>{value}</b>
      ) : (
        <b className="ol-part-value">{doubtful ? `؟ ${countOf(doubt!.length, noun!)}` : "؟"}</b>
      )}
      {value && auto ? <Sparkles className="ol-part-auto" aria-hidden="true" /> : null}
    </span>
  );
}

export default function OneLinePreview({ reading, suggestedSection = "" }: {
  reading: OneLineReading;
  /** The next free section, when a course was read and no section was typed. */
  suggestedSection?: string;
}) {
  const { seed, parts, ambiguous, unknown } = reading;
  const days = seed.days || [];
  const section = parts.section || (seed.courseId ? suggestedSection : "");
  return (
    <span className="ol-preview">
      <Part tone="course" icon={<BookOpen />} label="المقرر" value={parts.course} doubt={ambiguous.course} noun={AR.course} />
      <Part tone="section" icon={<Hash />} label="الشعبة" value={section} auto={!parts.section && Boolean(section)} autoNote="الشعبة التالية المقترحة" ltr />
      <Part tone="teacher" icon={<UserRound />} label="الأستاذ" value={parts.teacher} doubt={ambiguous.teacher} noun={AR.instructor} />
      <span className={`ol-part ol-days${days.length ? "" : " is-missing"}`} title={parts.days || undefined}>
        <span className="ol-part-icon" aria-hidden="true"><CalendarDays /></span>
        <span className="sr-only">الأيام</span>
        {days.length ? (
          <>
            <span className="ol-week" aria-hidden="true">
              {DAY_KEYS.map((key, at) => <i key={key} className={days.includes(key) ? "on" : undefined}>{WEEK_LETTERS[at]}</i>)}
            </span>
            <span className="sr-only">{parts.days}</span>
          </>
        ) : (
          <b className="ol-part-value">؟</b>
        )}
      </span>
      <Part tone="time" icon={<Clock3 />} label="الوقت" value={parts.time} auto={Boolean(seed.start && !seed.end)} autoNote="النهاية تُكمَل تلقائياً" ltr />
      <Part tone="room" icon={<DoorOpen />} label="القاعة" value={parts.room} ltr />
      {unknown.length ? (
        <span className="ol-unknown" title="لم يُفهم">
          <CircleHelp aria-hidden="true" />
          <span className="sr-only">لم يُفهم</span>
          {unknown.map((word, at) => <s key={`${word}-${at}`}>{word}</s>)}
        </span>
      ) : null}
    </span>
  );
}
