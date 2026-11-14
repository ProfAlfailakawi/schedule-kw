/**
 * ── شعبٌ يطلبها الطلبة في «مساري» ──────────────────────────────────────────────────────
 *
 * شارةٌ هادئة في شريط الاعتماد، اختيارية: تظهر فقط إن كان لمقررٍ شعبٌ أقل مما يطلبه الطلبة في «مساري».
 * تفتح قائمةً قصيرة («٥ ← ٧»). لا تمنع توقيعاً ولا تكتب شيئاً.
 * تخطيطُ الشعب نفسه (تقرير التسجيل) شاشةٌ أخرى: src/components/SectionPlan.tsx.
 * الحساب في utils/sectionGap.ts (studentGaps)؛ المصدر: /api/schedules/section-gap.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_SEEDED_EVENT } from "../utils/demoSeedEvent";
import { ChevronDown, Users, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { studentGaps, type GapCourse, type GapItem } from "../utils/sectionGap";
import { sortByName } from "../utils/sorting";
import CourseTags from "./CourseTags";

interface GapPayload { respondents: number; courses: GapCourse[] }
const SHOWN = 5;
const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/** القراءةُ موسومةٌ بنطاقها: تبدّل القسم أو الفصل لا يُبقي أرقام القسم السابق لحظةً. */
export function useSectionGap(collegeId: number, sectionId: number, termId: number, refreshSignal = 0, _open = false) {
  const scope = `${collegeId}:${sectionId}:${termId}`;
  const [loaded, setLoaded] = useState<{ scope: string; payload: GapPayload } | null>(null);
  const [failure, setFailure] = useState<{ scope: string; status: number } | null>(null);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    setFailure(null);
    fetch(`/api/schedules/section-gap?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => {
        if (response.ok) return response.json();
        if (!cancelled) setFailure({ scope, status: response.status });
        return null;
      })
      .then((body: GapPayload | null) => {
        if (cancelled) return;
        setLoaded(body ? { scope, payload: body } : null);
        if (body) setFailure(null);
      })
      .catch(() => { if (!cancelled) { setLoaded(null); setFailure({ scope, status: 0 }); } });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, refreshSignal, scope, bump]);
  useEffect(() => {
    const onSeeded = () => setBump(n => n + 1);
    window.addEventListener(DEMO_SEEDED_EVENT, onSeeded);
    return () => window.removeEventListener(DEMO_SEEDED_EVENT, onSeeded);
  }, []);
  const data = loaded && loaded.scope === scope ? loaded.payload : null;
  const studentItems = useMemo(() => (data ? studentGaps(data.courses) : []), [data]);
  const reload = useCallback(() => setBump(value => value + 1), []);
  const failed = !data && failure?.scope === scope ? failure : null;
  return { failed, studentItems, courses: data?.courses || [], loaded: data !== null, reload };
}

export type Gap = ReturnType<typeof useSectionGap>;
export type GapKind = "students";

/** الشارة: عددُ المقررات التي يطلبها الطلبة في «مساري» وشعبها أقل. */
export function SectionGapBadge({ items, open, onToggle }: { items: GapItem[]; kind?: GapKind; open: boolean; onToggle: () => void }) {
  if (!items.length) return null;
  return (
    <button type="button" className="apb-badge apb-data-btn" data-tone="info" aria-expanded={open} onClick={onToggle} title="من رغبات الطلبة في «مساري» · اختياري ولا يمنع التوقيع"
      data-guide-ignore="قائمة الشعب التي يطلبها الطلبة في «مساري» — اختيارية">
      <Users aria-hidden="true" /><span>مساري</span><b>{num(items.length)}</b><ChevronDown aria-hidden="true" className="apb-data-chev" />
    </button>
  );
}

/** قائمةٌ قصيرة: اسم المقرر، وعدد الطلبة، و«الموجود ← المطلوب». */
export function SectionGapPanel({ items, onClose }: { items: GapItem[]; kind?: GapKind; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const ordered = useMemo(() => sortByName(items, item => item.name), [items]);
  const list = all ? ordered : ordered.slice(0, SHOWN);
  return (
    <section className="apb-gap" aria-label="شعبٌ يطلبها الطلبة في «مساري»">
      <header>
        <span className="apb-gap-ic"><Users aria-hidden="true" /></span>
        <strong>شعبٌ يطلبها الطلبة في «مساري»</strong>
        <small>اختياري</small>
        <button type="button" className="apb-dr-close" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاق قائمة الشعب المقترحة"><X aria-hidden="true" /></button>
      </header>
      <ul className="apb-gap-list">
        {list.map(item => (
          <li key={item.id}>
            <div className="apb-gap-row">
              <span className="apb-gap-name"><b>{item.name}</b><small>{item.code}<CourseTags courseId={item.id} /></small></span>
              <span className="apb-gap-why"><Users aria-hidden="true" />{countOf(item.demand, AR.student)}</span>
              <span className="apb-gap-pill" title={`الموجود ${num(item.existing)} والمطلوب ${num(item.required)}`}>
                <i>{num(item.existing)}</i><em aria-hidden="true">←</em><b>{num(item.required)}</b>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {items.length > SHOWN ? (
        <footer>
          <button type="button" className="apb-gap-link" onClick={() => setAll(value => !value)} data-guide-ignore="عرض كل المقررات المقترحة أو إخفاؤها">
            {all ? "أقل" : `الكل (${num(items.length)})`}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
