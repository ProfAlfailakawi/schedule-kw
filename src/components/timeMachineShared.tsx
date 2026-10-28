/**
 * أجزاءٌ مشتركة بين «محاكي الشعب» و«آلة الزمن»: قراءة السياق، والمخطط الأسبوعي
 * بمنزلقة قبل/بعد، وشريط المقاييس، ومؤشّر الأثر. لا منطق جدولة هنا — كلُّه في
 * src/utils/timeMachine.ts.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { FSchedule } from "../types";
import {
  LEVEL_DOT, TM_DAYS, dayLabel, sectionKey, type TmContext, type TmDelta, type TmLevel,
} from "../utils/timeMachine";
import { activeDays, timeToMinutes } from "../utils/scheduleIntelligence";
import { readSharedScope } from "../utils/sharedScope";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "../utils/scheduleTime";
import "../styles/33-time-machine.css";

export type LoadedContext = TmContext & { frozen?: string | null };

export function useTimeMachineContext(scope?: { collegeId?: number; sectionId?: number; termId?: number }) {
  const [context, setContext] = useState<LoadedContext | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const asked = scope && scope.sectionId ? scope : readSharedScope();
  const key = `${asked.collegeId || 0}:${asked.sectionId || 0}:${asked.termId || 0}`;
  useEffect(() => {
    let cancelled = false;
    setError("");
    const qs = new URLSearchParams({ collegeId: String(asked.collegeId || 0), sectionId: String(asked.sectionId || 0), termId: String(asked.termId || 0) });
    fetch(`/api/time-machine/context?${qs}`, { credentials: "include" })
      .then(async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || "تعذّر تحميل الجدول"); return body; })
      .then(body => { if (!cancelled) setContext(body); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  return { context, error, reload: () => setTick(n => n + 1) };
}

export const scopeQuery = (context: TmContext) =>
  `collegeId=${context.scope.collegeId}&sectionId=${context.scope.sectionId}&termId=${context.scope.termId}`;

export async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error: any = new Error(data?.error || "تعذّر التنفيذ"); error.body = data; error.status = response.status; throw error; }
  return data;
}

export function LevelDot({ level, label }: { level: TmLevel; label?: string }) {
  const word = level === "green" ? "أثر خفيف" : level === "yellow" ? "انتبه" : "أثر خطِر";
  return <span className={`tm-level tm-level-${level}`} title={word} aria-label={word}>{LEVEL_DOT[level]}{label ? <b>{label}</b> : null}</span>;
}

/** أرقام قبل → بعد في سطرٍ من الأيقونات. */
export function DeltaStrip({ delta, compact = false }: { delta: TmDelta; compact?: boolean }) {
  const items: Array<{ icon: string; label: string; before: number | null; after: number | null; lowerIsBetter: boolean }> = [
    { icon: "⚠️", label: "تعارضات", before: delta.before.blocking, after: delta.after.blocking, lowerIsBetter: true },
    { icon: "⏳", label: "فجوات (ساعة)", before: Math.round(delta.before.gapMinutes / 6) / 10, after: Math.round(delta.after.gapMinutes / 6) / 10, lowerIsBetter: true },
    { icon: "🏛️", label: "قاعات", before: delta.before.roomsUsed, after: delta.after.roomsUsed, lowerIsBetter: true },
    { icon: "🪑", label: "مقاعد", before: delta.before.seats, after: delta.after.seats, lowerIsBetter: false },
    { icon: "🎓", label: "بلا مقعد", before: delta.before.shortfall, after: delta.after.shortfall, lowerIsBetter: true },
    { icon: "📏", label: "ملاحظات لائحية", before: delta.before.regulation, after: delta.after.regulation, lowerIsBetter: true },
  ];
  return (
    <ul className={`tm-delta ${compact ? "is-compact" : ""}`} aria-label="قبل وبعد">
      {items.filter(item => item.before !== null && item.after !== null).map(item => {
        const tone = item.after === item.before ? "same" : (item.after! < item.before!) === item.lowerIsBetter ? "better" : "worse";
        return (
          <li key={item.label} className={`tm-delta-${tone}`} title={item.label}>
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
            <b><bdi>{item.before}</bdi>{item.after !== item.before ? <> ← <bdi>{item.after}</bdi></> : null}</b>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * ── المنزلقة الزمنية ──
 * أسبوعٌ مصغّر: كل موعدٍ مستطيل. المنزلقة تنقل القارئ من «قبل» إلى «بعد»
 * فتنزلق المواعيد المتحرّكة إلى مواضعها الجديدة، ويذوب المحذوف ويظهر المضاف.
 */
export function TimeSlider({ before, after, context, focus }: { before: FSchedule[]; after: FSchedule[]; context: TmContext; focus?: Set<number> }) {
  const [value, setValue] = useState(100);
  const inScope = (row: FSchedule) => Number(row.AdCollegeId) === context.scope.collegeId && Number(row.AdSectionId) === context.scope.sectionId;
  const span = SCHEDULE_DAY_END - SCHEDULE_DAY_START;
  const rows = useMemo(() => {
    const b = new Map(before.filter(inScope).map(row => [Number(row.id), row]));
    const a = new Map(after.filter(inScope).map(row => [Number(row.id), row]));
    const ids = [...new Set([...b.keys(), ...a.keys()])];
    return ids.map(id => ({ id, before: b.get(id), after: a.get(id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after]);
  const t = value / 100;
  const place = (row: FSchedule) => {
    const day = activeDays(row);
    return day.map(d => ({ day: TM_DAYS.indexOf(d), top: (timeToMinutes(row.fstarttime) - SCHEDULE_DAY_START) / span * 100, height: Math.max(2.5, (timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime)) / span * 100) }));
  };
  const blocks: Array<{ key: string; day: number; top: number; height: number; opacity: number; kind: string; label: string }> = [];
  for (const item of rows) {
    const label = String((item.after || item.before)?.AdCourseName || "");
    const changed = Boolean(item.before && item.after && (item.before.fstarttime !== item.after.fstarttime || activeDays(item.before).join() !== activeDays(item.after).join()
      || item.before.AdRoomHall !== item.after.AdRoomHall || item.before.AdInstructorId !== item.after.AdInstructorId));
    const kind = !item.before ? "added" : !item.after ? "removed" : changed ? "moved" : "same";
    const from = item.before ? place(item.before) : [];
    const to = item.after ? place(item.after) : [];
    const count = Math.max(from.length, to.length);
    for (let i = 0; i < count; i += 1) {
      const f = from[i] || to[i], g = to[i] || from[i];
      blocks.push({
        key: `${item.id}-${i}`, kind, label,
        day: t < 0.5 ? f.day : g.day,
        top: f.top + (g.top - f.top) * t, height: f.height + (g.height - f.height) * t,
        opacity: kind === "added" ? t : kind === "removed" ? 1 - t : 1,
      });
    }
  }
  return (
    <figure className="tm-slider">
      <div className="tm-week" role="img" aria-label="الأسبوع قبل وبعد">
        {TM_DAYS.map((day, index) => (
          <div key={day} className="tm-week-day">
            <span>{dayLabel(day)}</span>
            <div className="tm-week-col">
              {blocks.filter(block => block.day === index).map(block => (
                <i key={block.key} className={`tm-block tm-block-${block.kind} ${focus?.has(Number(block.key.split("-")[0])) ? "is-focus" : ""}`}
                  style={{ top: `${block.top}%`, height: `${block.height}%`, opacity: block.opacity }} title={block.label} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="tm-slider-range">
        <span>⏪ قبل</span>
        <input data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="range" min={0} max={100} value={value} onChange={event => setValue(Number(event.target.value))} aria-label="من قبل إلى بعد" />
        <span>بعد ⏩</span>
      </label>
      <figcaption className="tm-legend">
        <span><i className="tm-block-moved" />تحرّك</span><span><i className="tm-block-added" />جديد</span><span><i className="tm-block-removed" />محذوف</span>
      </figcaption>
    </figure>
  );
}

export const keyOfRow = sectionKey;
