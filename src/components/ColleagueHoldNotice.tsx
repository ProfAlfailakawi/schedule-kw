import React, { useEffect, useState } from "react";
import { DoorOpen, GraduationCap, Users } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { hueOf, initialOf } from "../utils/colleagueFace";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import {
  holdDayNames, holdRoomLabel, HOLD_DAYS, SCHEDULE_HOLD_TTL_MS,
  type HoldClash, type HoldDay,
} from "../utils/scheduleHolds";
import { TEAM_HOLD_TTL_MS, workText, type TeamPeer } from "../utils/teamWork";

/**
 * ── «زميلك يعمل الآن على…» و«زميلان يعملان الآن» — لكل الفرق ─────────────────────────
 *
 * تنبيهٌ لا منع: من يعمل معي الآن على الشيء نفسه، كلُّ زميلٍ شريحةٌ واحدة — صورتُه بحرفه
 * الأول، وعلى ماذا نلتقي، وحلقةٌ تنقص حتى ينتهي حجزُه. يُقال لقارئ الشاشة مرةً حين يظهر.
 *
 *   • لجنةُ الجدول: `ColleagueHoldNotice` (القاعة أو الأستاذ في الوقت نفسه، بأيامه ووقته).
 *   • الإرشادُ والتسجيل: `ColleagueWorkNotice` (طلبُ الشعبة نفسه، ومقاعدُ المقرر نفسه، والطالبُ نفسه).
 *
 * وبجانبهما شارةُ الحضور الواحدة لكل الفرق (ColleagueFaces.tsx، وتُعاد من هنا). لا زرَّ هنا ولا
 * شيءَ يُرسل: عرضٌ لما في اليد.
 */

const DAY_INITIAL: Record<HoldDay, string> = { fsunday: "ح", fmonday: "ن", ftuesday: "ث", fwednesday: "ر", fthursday: "خ" };
const MAX_CHIPS = 3;

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
function HoldCountdown({ remainingMs, ttlMs = SCHEDULE_HOLD_TTL_MS }: { remainingMs: number; ttlMs?: number }) {
  const left = Math.max(0, Math.min(ttlMs, remainingMs));
  const seconds = Math.ceil(left / 1000);
  const fraction = left / ttlMs;
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

/* ── التنبيه: هيكلٌ واحد لكل الفرق ─────────────────────────────────────────── */

interface NoticeItem {
  key: string;
  name: string;
  hueSeed: string;
  target: { text: string; icon: React.ReactNode };
  expiresAt: number;
  clash?: string;
  title: string;
  meta?: React.ReactNode;
}

/**
 * يُرسم دائماً (ولا يظهر منه شيء إن لم يكن التقاء): المنطقةُ الحيّة لقارئ الشاشة موجودةٌ قبل أن
 * يصلها الخبر، فيُقال «زميلك فلان يعمل الآن على …» مرةً حين يظهر — لا كل ثانية.
 */
function NoticeStack({ items, ttlMs, label, className }: { items: NoticeItem[]; ttlMs: number; label: string; className?: string }) {
  const now = useSecondTicker(items.length > 0);
  const live = items.filter(item => Number(item.expiresAt) > now);
  const spoken = live.map(item => `زميلك ${item.name} يعمل الآن على ${item.target.text}`).join("، ");
  const announcer = <span className="sr-only" role="status" aria-live="polite">{spoken}</span>;
  if (!live.length) return announcer;
  const shown = live.slice(0, MAX_CHIPS);
  const more = live.length - shown.length;
  return (
    <>
    {announcer}
    <section
      className={`colleague-hold-notice${live.length > 1 ? " is-stacked" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
    >
      <span className="colleague-hold-icon" aria-hidden="true"><Users /></span>
      <ul className="colleague-hold-stack">
        {shown.map(item => (
          <li
            key={item.key}
            className="colleague-hold-chip"
            data-clash={item.clash}
            style={{ ["--hold-hue" as any]: hueOf(item.hueSeed) }}
            title={item.title}
          >
            <span className="colleague-hold-avatar" aria-hidden="true">{initialOf(item.name)}</span>
            <span className="colleague-hold-body">
              <span className="colleague-hold-line">
                <b>زميلك {item.name}</b> يعمل الآن على <span className="colleague-hold-target">{item.target.icon}{item.target.text}</span>
              </span>
              {item.meta ? <span className="colleague-hold-meta">{item.meta}</span> : null}
            </span>
            <HoldCountdown remainingMs={Number(item.expiresAt) - now} ttlMs={ttlMs} />
          </li>
        ))}
        {more > 0 ? <li className="colleague-hold-more" title={`${countOf(more, AR.colleague)} غيرهم`}><bdi dir="ltr">+{more}</bdi></li> : null}
      </ul>
    </section>
    </>
  );
}

export interface ColleagueHoldNoticeProps {
  clashes: readonly HoldClash[];
  /** اسمُ الأستاذ من سجلّ المحرّر؛ وبدونه يُقال «الأستاذ نفسه». */
  instructorName?: (id: number) => string | undefined;
  className?: string;
}

/** لجنةُ الجدول: زميلٌ يبني موعداً على القاعة نفسها أو الأستاذ نفسه في الوقت نفسه. */
export default function ColleagueHoldNotice({ clashes, instructorName, className }: ColleagueHoldNoticeProps) {
  const list = Array.isArray(clashes) ? clashes : [];
  const items: NoticeItem[] = list.map(clash => {
    const target = targetOf(clash, instructorName);
    const dayNames = holdDayNames(clash.days);
    return {
      key: clash.id || `${clash.name}-${clash.start}`,
      name: clash.name, hueSeed: clash.id || clash.name, target,
      expiresAt: Number(clash.expiresAt),
      clash: clash.clashOn.length > 1 ? "both" : clash.clashOn[0],
      title: `${clash.name} · ${target.text} · ${dayNames} ${formatScheduleTimeRange(clash.start, clash.end)}`,
      meta: <>
        <WeekDots days={clash.days} shared={clash.sharedDays} />
        <span className="sr-only">{dayNames}</span>
        <time className="colleague-hold-time">{formatScheduleTimeRange(clash.start, clash.end)}</time>
      </>,
    };
  });
  return <NoticeStack items={items} ttlMs={SCHEDULE_HOLD_TTL_MS} label="زملاء يعملون الآن على الموعد نفسه" className={className} />;
}

/** الإرشادُ والتسجيل: زميلٌ يعمل الآن على طلب الشعبة نفسه، أو مقاعد المقرر نفسه، أو الطالب نفسه. */
export function ColleagueWorkNotice({ clashes, className }: { clashes: readonly TeamPeer[]; className?: string }) {
  const items: NoticeItem[] = (Array.isArray(clashes) ? clashes : []).filter(peer => peer.work).map(peer => {
    const what = workText(peer.work);
    return {
      key: peer.id, name: peer.name, hueSeed: peer.id,
      target: { text: what.text, icon: <span className="colleague-work-emoji" aria-hidden="true">{what.icon}</span> },
      expiresAt: Number(peer.expiresAt),
      title: `${peer.name} · ${what.text}`,
    };
  });
  return <NoticeStack items={items} ttlMs={TEAM_HOLD_TTL_MS} label="زملاء يعملون الآن على الشيء نفسه" className={`colleague-work-notice${className ? ` ${className}` : ""}`} />;
}

/* شارةُ الحضور في ملفّها (ColleagueFaces.tsx)، وتُعاد من هنا لمن يستوردها مع التنبيه. */
export { ColleaguePresenceChip, TeamPresenceChip, ColleagueFaces } from "./ColleagueFaces";
