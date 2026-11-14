import { useEffect, useMemo, useRef, useState } from "react";

/**
 * ── «نبض الطلبة» لخانات «أسبوع الأستاذ» ────────────────────────────────────────────
 * لكل خانةٍ حرّة (أيام، بداية): كم ممن يحتاجون المقرر يناسبهم ذلك الوقت — الخريجون أولاً.
 * قراءةٌ واحدة مؤجَّلة لكل مجموعةِ خانات (لا طلب لكل خانة)، تُلغى إن تغيّرت، وتُحفظ بمفتاحها؛ ولا تُرسَل
 * بلا مقررٍ مختار. بلا تقرير طلبٍ فعلي يرجع الخادم null لكلٍّ منها فلا تُلوَّن خانة ولا تظهر وسيلة إيضاح.
 */
export interface GridFit { percent: number; kind: "grad" | "stud"; blocked: number; need: number }
export interface GridTarget { days: readonly string[]; start: number; end: number }

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const fitKeyOf = (target: Pick<GridTarget, "days" | "start">) => `${[...target.days].join("+")}|${target.start}`;
const cache = new Map<string, Array<GridFit | null>>();

export function useFitGrid(input: {
  enabled: boolean; collegeId: number; sectionId: number; termId: number; courseId: number; scode: string; excludeId: number;
  /** يتغيّر بتغيّر جدول القسم، فلا تبقى قراءةٌ قديمة بعد حفظ. */
  version: number;
  targets: readonly GridTarget[];
}): Map<string, GridFit> {
  const { enabled, collegeId, sectionId, termId, courseId, scode, excludeId, version, targets } = input;
  const [fits, setFits] = useState<Map<string, GridFit>>(new Map());
  const unique = useMemo(() => [...new Map(targets.map(target => [fitKeyOf(target), target] as const)).values()], [targets]);
  const key = `${collegeId}|${sectionId}|${termId}|${courseId}|${scode}|${excludeId}|${version}|${unique.map(fitKeyOf).join(",")}`;
  const latest = useRef(key);
  latest.current = key;
  useEffect(() => {
    if (!enabled || !courseId || !collegeId || !sectionId || !termId || !unique.length) { setFits(new Map()); return; }
    const apply = (scores: Array<GridFit | null>) => setFits(new Map(unique.flatMap((target, index) => scores[index] ? [[fitKeyOf(target), scores[index]!] as const] : [])));
    const hit = cache.get(key);
    if (hit) { apply(hit); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/schedules/fit-grid", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdCourseId: courseId, SCode: scode, excludeId,
            targets: unique.map(target => ({ days: target.days, start: clock(target.start), end: clock(target.end) })) }),
        });
        if (!response.ok) return;
        const data = await response.json();
        const scores: Array<GridFit | null> = Array.isArray(data?.scores) ? data.scores : [];
        if (cache.size > 30) cache.delete(cache.keys().next().value as string);
        cache.set(key, scores);
        if (latest.current === key) apply(scores);
      } catch { /* قراءةٌ مُلغاة أو شبكةٌ غائبة: تبقى الخانات بلا تلوين */ }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return fits;
}
