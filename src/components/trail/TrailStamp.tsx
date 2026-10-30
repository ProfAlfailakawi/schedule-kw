import React, { useEffect, useState } from "react";
import { TRAIL_KIND_META, trailWhen, type TrailKind } from "../../utils/activityTrail";
import { currentTrailStampOwner, keepTrailStamp, readTrailStamp, type TrailStampValue } from "./trailStampMemory";
import "./trail.css";

/**
 * بصمةُ «آخر تعديل: فلان · أمس 10:20» على الموعد — عند المرور عليه وعند فتحه بلمسة.
 *
 * تُقرأ بعد توقّفٍ قصير (المرورُ العابر على الأسبوع لا يسأل الخادم)، ويُحفظ الجوابُ دقيقةً لكل موعد
 * ولصاحب الجلسة وحده (trailStampMemory.ts).
 * والاسمُ لمن يحقّ له رؤيةُ صاحبه، وإلا فاسمُ فريقه (يقرّره الخادم).
 */
type Stamp = TrailStampValue;
const WAIT_MS = 280;

export default function TrailStamp({ rowId, className = "", onShown }: { key?: React.Key; rowId: number; className?: string; onShown?: () => void }) {
  const [stamp, setStamp] = useState<Stamp | undefined>(() => readTrailStamp(rowId));
  useEffect(() => {
    const cached = readTrailStamp(rowId);
    if (cached !== undefined) { setStamp(cached); return; }
    setStamp(undefined);
    let alive = true;
    const askedBy = currentTrailStampOwner();
    const timer = window.setTimeout(() => {
      fetch(`/api/activity-trail/stamp/${rowId}`, { cache: "no-store" })
        .then(response => response.ok ? response.json() : { stamp: null })
        .then(body => {
          const next: Stamp = body?.stamp && body.stamp.who ? body.stamp : null;
          keepTrailStamp(askedBy, rowId, next);
          if (alive && askedBy === currentTrailStampOwner()) setStamp(next);
        })
        .catch(() => undefined);
    }, WAIT_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [rowId]);
  useEffect(() => { if (stamp) onShown?.(); }, [stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!stamp) return null;
  return (
    <span className={`trail-stamp ${className}`.trim()} title={TRAIL_KIND_META[stamp.kind as TrailKind]?.label}>
      <span aria-hidden="true">👣</span>
      آخر تعديل: <b>{stamp.who}</b> · {trailWhen(stamp.at)}
    </span>
  );
}
