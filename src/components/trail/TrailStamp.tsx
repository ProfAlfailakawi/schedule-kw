import React, { useEffect, useState } from "react";
import { TRAIL_KIND_META, trailWhen, type TrailKind } from "../../utils/activityTrail";
import "./trail.css";

/**
 * بصمةُ «آخر تعديل: فلان · أمس 10:20» على الموعد — عند المرور عليه وعند فتحه بلمسة.
 *
 * تُقرأ بعد توقّفٍ قصير (المرورُ العابر على الأسبوع لا يسأل الخادم)، ويُحفظ الجوابُ دقيقةً لكل موعد.
 * والاسمُ لمن يحقّ له رؤيةُ صاحبه، وإلا فاسمُ فريقه (يقرّره الخادم).
 */
type Stamp = { who: string; at: string; kind: TrailKind } | null;
const memory = new Map<number, { at: number; stamp: Stamp }>();
const MEMORY_MS = 60_000;
const WAIT_MS = 280;

export default function TrailStamp({ rowId, className = "", onShown }: { key?: React.Key; rowId: number; className?: string; onShown?: () => void }) {
  const held = memory.get(rowId);
  const fresh = held && Date.now() - held.at < MEMORY_MS ? held.stamp : undefined;
  const [stamp, setStamp] = useState<Stamp | undefined>(fresh);
  useEffect(() => {
    const cached = memory.get(rowId);
    if (cached && Date.now() - cached.at < MEMORY_MS) { setStamp(cached.stamp); return; }
    setStamp(undefined);
    let alive = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/activity-trail/stamp/${rowId}`, { cache: "no-store" })
        .then(response => response.ok ? response.json() : { stamp: null })
        .then(body => {
          const next: Stamp = body?.stamp && body.stamp.who ? body.stamp : null;
          memory.set(rowId, { at: Date.now(), stamp: next });
          if (memory.size > 400) memory.delete(memory.keys().next().value as number);
          if (alive) setStamp(next);
        })
        .catch(() => undefined);
    }, WAIT_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [rowId]);
  useEffect(() => { if (stamp) onShown?.(); }, [stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!stamp) return null;
  return (
    <span className={`trail-stamp ${className}`.trim()} title={TRAIL_KIND_META[stamp.kind]?.label}>
      <span aria-hidden="true">👣</span>
      آخر تعديل: <b>{stamp.who}</b> · {trailWhen(stamp.at)}
    </span>
  );
}
