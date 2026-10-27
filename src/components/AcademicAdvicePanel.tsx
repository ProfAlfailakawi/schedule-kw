import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BookOpenCheck, CalendarClock, CheckCheck, GraduationCap, Lightbulb, Users } from "lucide-react";
import type { AcademicPair, AcademicSlot } from "../utils/academicAdvisory";

interface Props {
  collegeId: number; sectionId: number; termId: number;
  courseId?: number;
  candidate?: { days: string[]; start: string; end: string };
  compact?: boolean;
}
const minute = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};
const intersects = (a: AcademicSlot, b: AcademicSlot) =>
  a.day === b.day && minute(a.start) >= 0 && minute(b.start) >= 0 &&
  minute(a.start) < minute(b.end) && minute(b.start) < minute(a.end);
const chip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, border: "1px solid var(--line, #dce5df)", fontSize: 11, fontWeight: 700 };
/**
 * Optional visual guidance. Contains no write controls and never changes
 * validation / approval / proposal readiness. Absence of evidence stays quiet.
 */
export default function AcademicAdvicePanel({ collegeId, sectionId, termId, courseId, candidate, compact = false }: Props) {
  const [pairs, setPairs] = useState<AcademicPair[]>([]);
  useEffect(() => {
    setPairs([]);
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    fetch("/api/schedules/academic-advice?collegeId=" + collegeId + "&sectionId=" + sectionId + "&termId=" + termId, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!controller.signal.aborted) setPairs(Array.isArray(data?.pairs) ? data.pairs : []); })
      .catch(() => { if (!controller.signal.aborted) setPairs([]); });
    return () => controller.abort();
  }, [collegeId, sectionId, termId]);
  const relevant = useMemo(() => pairs.filter(pair => {
    if (courseId && pair.a !== courseId && pair.b !== courseId) return false;
    if (!candidate || !courseId) return pair.overlap;
    if (!candidate.days?.length || minute(candidate.start) < 0 || minute(candidate.end) <= minute(candidate.start)) return false;
    const other = pair.a === courseId ? pair.bOfferings : pair.aOfferings;
    return other.some(section => section.slots.some(slot =>
      candidate.days.some(day => intersects({ day, start: candidate.start, end: candidate.end }, slot))));
  }).slice(0, compact ? 2 : 5), [pairs, courseId, candidate?.days?.join(","), candidate?.start, candidate?.end, compact]);
  if (!relevant.length) return null;
  return (
    <section role="note" aria-label="اقتراحات أكاديمية غير ملزمة" style={{
      border: "1px solid color-mix(in srgb, var(--accent, #247756) 26%, var(--line, #dce5df))",
      background: "color-mix(in srgb, var(--accent, #247756) 5%, var(--card, #fff))",
      borderRadius: 17, padding: compact ? "11px 13px" : "15px 17px", marginBlock: 10, display: "grid", gap: 10, direction: "rtl"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Lightbulb size={19} aria-hidden="true" style={{ color: "var(--accent, #247756)", flex: "none" }} />
        <strong style={{ fontSize: 14 }}>فرصة لتحسين الجدول</strong>
        <span style={{ ...chip, marginInlineStart: "auto", color: "var(--muted, #627269)" }}>اقتراح · لا يمنع</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 8 }}>
        {relevant.map(pair => {
          const name = courseId ? (pair.a === courseId ? pair.nameB : pair.nameA) : pair.nameA + " × " + pair.nameB;
          return <div key={pair.a + "-" + pair.b} style={{ display: "grid", gap: 7, minWidth: 0, borderRadius: 12, border: "1px solid var(--line, #dce5df)", background: "var(--card, #fff)", padding: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <BookOpenCheck size={16} aria-hidden="true" style={{ color: "var(--accent, #247756)", flex: "none" }} />
              <strong style={{ fontSize: 12.5, lineHeight: 1.6 }}>{name}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, color: "var(--muted, #627269)" }}>
              {pair.basis === "wishes"
                ? <span style={chip}><Users size={13} />{pair.shared.toLocaleString("ar-KW-u-nu-latn")} طلب مشترك</span>
                : <span style={chip}><GraduationCap size={13} />مسبقات مشتركة</span>}
              {pair.hasAlternative && !candidate ? <span style={chip}><CheckCheck size={13} />شعب بديلة</span> : <span style={chip}><CalendarClock size={13} />راجع التوقيت</span>}
            </div>
          </div>;
        })}
      </div>
      {!compact && <small style={{ color: "var(--muted, #627269)", lineHeight: 1.65 }}>
        تحليل استرشادي للصحائف المعتمدة والرغبات المتاحة، وليس تسجيلًا رسميًا. يمكن متابعة الحفظ والتوقيع والاعتماد دون أي تغيير.
      </small>}
    </section>
  );
}
