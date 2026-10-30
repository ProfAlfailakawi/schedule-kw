import React, { useEffect, useState } from "react";
import { DoorOpen, GraduationCap, Users } from "lucide-react";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import {
  departmentHolds, holdDayNames, holdRoomLabel, HOLD_DAYS, SCHEDULE_HOLD_TTL_MS,
  type HoldClash, type HoldDay, type ScheduleHoldView,
} from "../utils/scheduleHolds";

/**
 * ── «زميلك يعمل الآن على القاعة نفسها» ─────────────────────────────────────────
 *
 * تنبيهٌ لا منع: حجوزُ الزملاء التي تلتقي بالموعد الذي أبنيه (holdClashes)، كلُّ زميلٍ
 * شريحةٌ واحدة — صورتُه بحرفه الأول، وعلى ماذا نلتقي، وأيامُه بحروفها، ووقتُه، وحلقةٌ
 * تنقص حتى ينتهي حجزُه. وبجانبها `ColleaguePresenceChip`: كم زميلاً يعمل الآن في القسم.
 * لا أزرار هنا، ولا شيء يُرسل: عرضٌ لما في يد المحرّر.
 */

const DAY_INITIAL: Record<HoldDay, string> = { fsunday: "ح", fmonday: "ن", ftuesday: "ث", fwednesday: "ر", fthursday: "خ" };
/* ستُّ درجاتٍ للأشخاص كما في حضور اللوح (05-schedule.css › data-presence): لا أحمر — الأحمرُ للتعارض. */
const HUES = [200, 262, 38, 96, 288, 178];
const MAX_CHIPS = 3;

const hueOf = (seed: string) => {
  let hash = 0;
  for (const ch of String(seed || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length];
};
/** الحرفُ الأول من الاسم بعد اللقب: «د. منى» و«أ.د. منى» ← «م». */
const initialOf = (name: string) => {
  const bare = String(name || "").replace(/^(?:\s*[أاإدم]\s*\.)+\s*/u, "").trim();
  return Array.from(bare || String(name || "؟"))[0] || "؟";
};

/** ثانيةٌ تمضي — تعمل ما دام في الشاشة ما يُعدّ، وتسكن إن لم يكن. */
function useSecondTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const R = 15;
const C = 2 * Math.PI * R;
/**
 * حلقةُ ما بقي من الحجز، ورقمُه «1:45» في وسطها. صامتةٌ لقارئ الشاشة عمداً: تتبدّل كل ثانية
 * داخل منطقةٍ حيّة، ولو نُطقت لنُطقت كل ثانية؛ ويكفيه أن يُقال الزميلُ حين يظهر. وتُقال المدةُ في title.
 */
function HoldCountdown({ remainingMs }: { remainingMs: number }) {
  const left = Math.max(0, Math.min(SCHEDULE_HOLD_TTL_MS, remainingMs));
  const seconds = Math.ceil(left / 1000);
  const fraction = left / SCHEDULE_HOLD_TTL_MS;
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <span className="colleague-hold-ring" aria-hidden="true" title={`ينتهي الحجز بعد ${countOf(seconds, AR.second)}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="colleague-hold-ring-track" cx="18" cy="18" r={R} />
        <circle className="colleague-hold-ring-fill" cx="18" cy="18" r={R} strokeDasharray={`${(fraction * C).toFixed(2)} ${C.toFixed(2)}`} />
      </svg>
      <b dir="ltr">{label}</b>
    </span>
  );
}

/** أيامُ الأسبوع حروفاً: أيامُ الزميل ملوّنة، وما نلتقي فيه أشدّ. */
function WeekDots({ days, shared }: { days: readonly HoldDay[]; shared: readonly HoldDay[] }) {
  const on = new Set(days), hit = new Set(shared);
  return (
    <span className="colleague-hold-week" aria-hidden="true">
      {HOLD_DAYS.map(day => (
        <i key={day} data-on={on.has(day) ? "1" : undefined} data-hit={hit.has(day) ? "1" : undefined}>{DAY_INITIAL[day]}</i>
      ))}
    </span>
  );
}

function targetOf(clash: HoldClash, instructorName?: (id: number) => string | undefined): { text: string; icon: React.ReactNode } {
  const room = clash.clashOn.includes("room") ? holdRoomLabel(clash) : "";
  const teacher = clash.clashOn.includes("instructor")
    ? (String(instructorName?.(clash.instructorId) || "").trim() || "نفسه")
    : "";
  if (room && teacher) return { text: `القاعة ${room} والأستاذ ${teacher}`, icon: <DoorOpen aria-hidden="true" /> };
  if (room) return { text: `القاعة ${room}`, icon: <DoorOpen aria-hidden="true" /> };
  return { text: `الأستاذ ${teacher || "نفسه"}`, icon: <GraduationCap aria-hidden="true" /> };
}

export interface ColleagueHoldNoticeProps {
  clashes: readonly HoldClash[];
  /** اسمُ الأستاذ من سجلّ المحرّر؛ وبدونه يُقال «الأستاذ نفسه». */
  instructorName?: (id: number) => string | undefined;
  className?: string;
}

/**
 * يُرسم دائماً (ولا يظهر منه شيء إن لم يكن التقاء): المنطقةُ الحيّة لقارئ الشاشة موجودةٌ قبل أن
 * يصلها الخبر، فيُقال «زميلك فلان يعمل الآن على القاعة 12/3» مرةً حين يظهر — لا كل ثانية.
 */
export default function ColleagueHoldNotice({ clashes, instructorName, className }: ColleagueHoldNoticeProps) {
  const list = Array.isArray(clashes) ? clashes : [];
  const now = useSecondTicker(list.length > 0);
  const live = list.filter(clash => Number(clash.expiresAt) > now);
  const spoken = live.map(clash => `زميلك ${clash.name} يعمل الآن على ${targetOf(clash, instructorName).text}`).join("، ");
  const announcer = <span className="sr-only" role="status" aria-live="polite">{spoken}</span>;
  if (!live.length) return announcer;
  const shown = live.slice(0, MAX_CHIPS);
  const more = live.length - shown.length;
  return (
    <>
    {announcer}
    <section
      className={`colleague-hold-notice${live.length > 1 ? " is-stacked" : ""}${className ? ` ${className}` : ""}`}
      aria-label="زملاء يعملون الآن على الموعد نفسه"
    >
      <span className="colleague-hold-icon" aria-hidden="true"><Users /></span>
      <ul className="colleague-hold-stack">
        {shown.map(clash => {
          const target = targetOf(clash, instructorName);
          const dayNames = holdDayNames(clash.days);
          return (
            <li
              key={clash.id || `${clash.name}-${clash.start}`}
              className="colleague-hold-chip"
              data-clash={clash.clashOn.length > 1 ? "both" : clash.clashOn[0]}
              style={{ ["--hold-hue" as any]: hueOf(clash.id || clash.name) }}
              title={`${clash.name} · ${target.text} · ${dayNames} ${formatScheduleTimeRange(clash.start, clash.end)}`}
            >
              <span className="colleague-hold-avatar" aria-hidden="true">{initialOf(clash.name)}</span>
              <span className="colleague-hold-body">
                <span className="colleague-hold-line">
                  <b>زميلك {clash.name}</b> يعمل الآن على <span className="colleague-hold-target">{target.icon}{target.text}</span>
                </span>
                <span className="colleague-hold-meta">
                  <WeekDots days={clash.days} shared={clash.sharedDays} />
                  <span className="sr-only">{dayNames}</span>
                  <time className="colleague-hold-time">{formatScheduleTimeRange(clash.start, clash.end)}</time>
                </span>
              </span>
              <HoldCountdown remainingMs={Number(clash.expiresAt) - now} />
            </li>
          );
        })}
        {more > 0 ? <li className="colleague-hold-more" title={`${countOf(more, AR.colleague)} غيرهم`}><bdi dir="ltr">+{more}</bdi></li> : null}
      </ul>
    </section>
    </>
  );
}

export interface ColleaguePresenceChipProps {
  /** حجوزُ الزملاء كما يعيدها useScheduleHolds. */
  holds: readonly ScheduleHoldView[];
  /** القسمُ المفتوح: تُعدّ حجوزُه وحده. */
  collegeId?: number;
  sectionId?: number;
  className?: string;
}

/** «زميلان يعملان الآن»: كم زميلاً يبني موعداً في هذا القسم الآن، بوجوههم. */
export function ColleaguePresenceChip({ holds, collegeId, sectionId, className }: ColleaguePresenceChipProps) {
  const here = departmentHolds(holds, collegeId, sectionId);
  if (!here.length) return null;
  const count = here.length;
  const names = here.map(hold => hold.name).join("، ");
  return (
    <span className={`colleague-presence-chip${className ? ` ${className}` : ""}`} role="status" title={names}>
      <span className="colleague-presence-faces" aria-hidden="true">
        {here.slice(0, MAX_CHIPS).map(hold => (
          <i key={hold.id || hold.name} style={{ ["--hold-hue" as any]: hueOf(hold.id || hold.name) }}>{initialOf(hold.name)}</i>
        ))}
      </span>
      <span className="colleague-presence-pulse" aria-hidden="true" />
      <span className="colleague-presence-text">{countOf(count, AR.colleague)} {nounFor(count, AR.workingVerb)} الآن</span>
    </span>
  );
}
