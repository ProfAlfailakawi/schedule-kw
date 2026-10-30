import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { normalizeClock } from "../utils/scheduleTime";
import { BookOpenCheck, CalendarClock, CheckCheck, ChevronDown, GraduationCap, Lightbulb, ShieldCheck, Users, Info, ArrowLeftRight } from "lucide-react";
import type { AcademicPair, AcademicSlot, AcademicTimePreference } from "../utils/academicAdvisory";
import { AR, countOf } from "../utils/arabicCount";
import { isDemoSession } from "../utils/demoSession";
import AcademicDecisionLabPanel from "./AcademicDecisionLabPanel";
import type { AcademicDecisionLab } from "../utils/academicDecisionLab";

interface Props {
  collegeId: number; sectionId: number; termId: number;
  courseId?: number;
  candidate?: { days: string[]; start: string; end: string };
  compact?: boolean;
  /** بطاقتُها المخصّصة (مركز الذكاء، أدوات البيانات): مفتوحةٌ وظاهرةٌ دائماً، حتى في الانتظار والفراغ. */
  defaultOpen?: boolean;
}
const minute = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(normalizeClock(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};
const intersects = (a: AcademicSlot, b: AcademicSlot) =>
  a.day === b.day && minute(a.start) >= 0 && minute(b.start) >= 0 &&
  minute(a.start) < minute(b.end) && minute(b.start) < minute(a.end);
const slotsOverlap = (a: AcademicSlot[], b: AcademicSlot[]) => a.some(x => b.some(y => intersects(x, y)));
const chip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 999,
  border: "1px solid var(--line, #dce5df)", fontSize: 11, fontWeight: 650, lineHeight: 1.5, whiteSpace: "nowrap", flex: "none" };
const card: CSSProperties = { display: "grid", alignContent: "start", gap: 7, minWidth: 0, borderRadius: 12,
  border: "1px solid var(--line, #dce5df)", background: "var(--card, #fff)", padding: "11px 12px" };
const exampleFor = (pair: AcademicPair) => {
  for (const a of pair.aOfferings) for (const b of pair.bOfferings)
    if (!slotsOverlap(a.slots, b.slots)) return { a, b };
  return null;
};
/** Read-only, non-blocking advice. No save/approval/teacher request state is changed. */
export default function AcademicAdvicePanel({ collegeId, sectionId, termId, courseId, candidate, compact = false, defaultOpen = false }: Props) {
  const [pairs, setPairs] = useState<AcademicPair[]>([]);
  const [timePreferences, setTimePreferences] = useState<AcademicTimePreference[]>([]);
  const [lab, setLab] = useState<AcademicDecisionLab | undefined>();
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const demo = isDemoSession();
  /* `defaultOpen` is not an attribute of <details>: the card never opened by itself (K1). */
  const [open, setOpen] = useState(demo || defaultOpen);
  useEffect(() => {
    setPairs([]); setTimePreferences([]); setLab(undefined); setStatus("loading");
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    fetch("/api/schedules/academic-advice?collegeId=" + collegeId + "&sectionId=" + sectionId + "&termId=" + termId, { signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw new Error("academic advice unavailable");
        return r.json();
      })
      .then(data => {
        if (!controller.signal.aborted) {
          setPairs(Array.isArray(data?.pairs) ? data.pairs : []);
          setTimePreferences(Array.isArray(data?.timePreferences) ? data.timePreferences : []);
          setLab(data?.decisionLab && Array.isArray(data.decisionLab.scenarios) ? data.decisionLab : undefined);
          setStatus("ready");
        }
      })
      .catch(() => { if (!controller.signal.aborted) { setPairs([]); setTimePreferences([]); setStatus("error"); } });
    return () => controller.abort();
  }, [collegeId, sectionId, termId, revision]);
  const relevant = useMemo(() => pairs.filter(pair => {
    if (courseId && pair.a !== courseId && pair.b !== courseId) return false;
    if (!candidate || !courseId) return pair.overlap;
    if (!candidate.days?.length || minute(candidate.start) < 0 || minute(candidate.end) <= minute(candidate.start)) return false;
    const other = pair.a === courseId ? pair.bOfferings : pair.aOfferings;
    const proposed = candidate.days.map(day => ({ day, start: candidate.start, end: candidate.end }));
    return pair.overlap || other.some(section => slotsOverlap(proposed, section.slots));
  }).sort((a, b) => (b.basis === "wishes" ? b.shared : 0) - (a.basis === "wishes" ? a.shared : 0) ||
    Number(b.unavoidable) - Number(a.unavoidable)), [pairs, courseId, candidate?.days?.join(","), candidate?.start, candidate?.end]);
  const periods = timePreferences.filter(p => (!courseId || p.courseId === courseId) && (!candidate ||
    (p.period === "afternoon" ? minute(candidate.start) < 720 : minute(candidate.end) > 720)));
  if (status === "loading" && !demo && !defaultOpen) return null;
  if (status === "ready" && !relevant.length && !periods.length && !lab?.scenarios?.some(s => !courseId || s.courseId === courseId) && !lab?.graduationWatch?.some(w => !courseId || w.courseId === courseId) && !demo && !defaultOpen) return null;
  const total = relevant.length + periods.length;
  const shown = relevant.slice(0, compact ? 3 : relevant.length);
  return (
    <details open={open} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)} aria-label="فرصة لتحسين الجدول" style={{
      border: "1px solid color-mix(in srgb, var(--accent, #247756) 24%, var(--line, #dce5df))",
      background: "color-mix(in srgb, var(--accent, #247756) 4%, var(--card, #fff))",
      borderRadius: 16, padding: compact ? "9px 12px" : "12px 15px", marginBlock: 10, direction: "rtl",
      boxShadow: "0 3px 14px rgba(15, 35, 25, 0.035)"
    }}>
      <summary style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", listStyle: "none", minHeight: 32 }}>
        <Lightbulb size={19} aria-hidden="true" style={{ color: "var(--accent, #247756)", flex: "none" }} />
        <strong style={{ fontSize: 13.5 }}>فرصة لتحسين الجدول</strong>
        {demo && <span style={{ ...chip, fontSize: 10 }}>عرض تجريبي</span>}
        <span style={{ ...chip, marginInlineStart: "auto" }}>{total ? countOf(total, AR.occurrence) : "استرشادي"}</span>
        <ChevronDown size={17} aria-hidden="true" style={{ color: "var(--muted, #627269)" }} />
      </summary>
      <div style={{ display: "grid", gap: 10, paddingBlockStart: 12 }}>
        {status === "error" ? <small style={{ color: "var(--muted)" }}><Info size={13} aria-hidden="true" /> التوصيات غير متاحة الآن؛ الجدول يعمل كالمعتاد.</small>
          : !total ? <small style={{ color: "var(--muted)" }}>{status === "loading" ? "جارٍ تحليل الصحائف والرغبات…" : "لا توجد فرصة مدعومة بالبيانات الحالية لهذا النطاق."}</small>
          : <>
          <div className="acad-opportunities-heading" style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--accent, #247756)", fontSize: 12 }}>
            <BookOpenCheck size={16} aria-hidden="true" />
            <strong>فرص المقررات المكتشفة</strong>
            <span style={{ ...chip, marginInlineStart: "auto" }}>{countOf(total, AR.occurrence)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(205px,100%), 1fr))", gap: 8 }}>
            {periods.slice(0, compact ? 2 : periods.length).map(p => <div key={p.period + "-" + p.courseId} style={card}>
              <strong style={{ fontSize: 12.5, lineHeight: 1.6 }}><CalendarClock size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{p.name}</strong>
              <span style={chip}>{p.period === "morning" ? "فرصة لمجموعة صباحية" : "فرصة لمجموعة بعد الظهر"}</span>
              <small style={{ color: "var(--muted)" }}>{countOf(p.wanted, AR.student)} لديهم قيد زمني · رغبات وليست تسجيلات</small>
            </div>)}
            {shown.map(pair => {
              const name = courseId ? (pair.a === courseId ? pair.nameB : pair.nameA) : pair.nameA + " × " + pair.nameB;
              const alternative = pair.hasAlternative ? exampleFor(pair) : null;
              let proposedAllOverlap = false;
              if (candidate && courseId) {
                const other = pair.a === courseId ? pair.bOfferings : pair.aOfferings;
                const slots = candidate.days.map(day => ({ day, start: candidate.start, end: candidate.end }));
                proposedAllOverlap = Boolean(other.length) && other.every(section => slotsOverlap(slots, section.slots));
              }
              return <div key={pair.a + "-" + pair.b} style={card}>
                <strong style={{ fontSize: 12.5, lineHeight: 1.6 }}><BookOpenCheck size={15} aria-hidden="true" style={{ verticalAlign: "middle", marginInlineEnd: 5, color: "var(--accent, #247756)" }} />{name}</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {pair.basis === "wishes" ? <span style={chip}><Users size={13} />{countOf(pair.shared, AR.student)} · رغبات مؤهلة</span>
                    : <span style={chip}><GraduationCap size={13} />مسبقات مشتركة</span>}
                  <span style={chip}>{candidate ? proposedAllOverlap ? "تعارض محتمل" : "توجد فرصة للتنسيق"
                    : pair.unavoidable ? "كل الشعب تتداخل" : alternative ? "شعبة بديلة قائمة" : "راجع التوقيت"}</span>
                </div>
                {alternative && <details style={{ borderTop: "1px solid var(--line)", paddingTop: 6, fontSize: 11 }}>
                  <summary style={{ cursor: "pointer", color: "var(--accent, #247756)", display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCheck size={13} /> عرض الشعب المتوافقة <ChevronDown size={12} />
                  </summary>
                  <div style={{ paddingTop: 7, display: "grid", gap: 4, color: "var(--muted)" }}>
                    <span><ArrowLeftRight size={13} style={{ verticalAlign: "middle" }} /> شعبة {alternative.a.section} × شعبة {alternative.b.section}</span>
                    <small>المواعيد القائمة لا تتداخل؛ السعة وباقي جدول الطالب غير محسومين.</small>
                  </div>
                </details>}
              </div>;
            })}
          </div>
          {(relevant.length > shown.length || periods.length > (compact ? 2 : 5)) &&
            <small style={{ color: "var(--muted)" }}>تظهر الفرص الأعلى تأثيراً أولاً. لم تُعرض جميع العلاقات.</small>}
        </>}
        {status !== "error" && <AcademicDecisionLabPanel lab={lab} courseId={courseId} compact={compact} demo={demo}
          onRefresh={() => setRevision(v => v + 1)} refreshing={status === "loading"} />}
        <small style={{ color: "var(--muted, #627269)", display: "flex", alignItems: "center", gap: 6, lineHeight: 1.6 }}>
          <ShieldCheck size={14} style={{ flex: "none" }} aria-hidden="true" />
          قراءة استرشادية لصحائف معتمدة ورغبات طلابية؛ لا تغيّر الحفظ أو الإرسال أو الاعتماد.
        </small>
      </div>
    </details>
  );
}
