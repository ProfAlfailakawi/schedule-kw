/**
 * ── الطلب الفعلي داخل الجدول الدراسي ─────────────────────────────────────────────
 *
 * شارةٌ في شريط الاعتماد بجانب شارة التخطيط، وبأسلوبها: أيقونة · «N بلا شعبة» · مقعدٌ ورقم.
 * لا تظهر بلا تقرير مرفوع، ولا حين خُدم كل طالب. الضغط يفتح قائمة «عالج» نفسها التي في
 * مركز التحليلات (DemandSupplyList)، و«عالج» هنا يفتح المحرّر في مكانه بلا انتقال.
 * الأرقام لعائلة القسم كلها، وتوزيعها على البنين والبنات في رأس القائمة.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Armchair, ChevronDown, ClipboardList, GraduationCap, OctagonAlert, X } from "lucide-react";
import { DemandSupplyList, demandKindOf, type DemandReadingView } from "./ActualDemandPanel";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { ACTUAL_DEMAND_CHANGED_EVENT } from "../utils/actualDemandHandoff";
import { demandAlertSummary, type DemandAlertSummary } from "../utils/actualDemandSupply";

const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
const TRACK_LABEL: Record<string, string> = { boys: "بنين", girls: "بنات" };

/** يقرأ الطلب الفعلي للقسم والفصل، ويعيد القراءة كلما تغيّر الجدول تحته (refreshSignal). */
export function useActualDemand(collegeId: number, sectionId: number, termId: number, refreshSignal = 0): DemandReadingView | null {
  const [reading, setReading] = useState<DemandReadingView | null>(null);
  const scope = `${collegeId}|${sectionId}|${termId}`;
  /* رفعٌ أو ربطٌ من أدوات البيانات أو مركز التحليلات يُعلن نفسه، فتُعاد القراءة بلا إعادة تحميل. */
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    const bump = () => setChanged(value => value + 1);
    window.addEventListener(ACTUAL_DEMAND_CHANGED_EVENT, bump);
    return () => window.removeEventListener(ACTUAL_DEMAND_CHANGED_EVENT, bump);
  }, []);
  useEffect(() => { setReading(null); }, [scope]);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    fetch(`/api/actual-demand?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (!controller.signal.aborted) setReading(body && Array.isArray(body.supply) ? body : null); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [scope, refreshSignal, changed]);
  return reading;
}

const alertLine = (summary: DemandAlertSummary) => [
  summary.uncovered ? `بلا شعبة: ${countOf(summary.uncovered, AR.course)}` : "",
  summary.seats ? `نقص ${countOf(summary.seats, AR.seat)}` : "",
  summary.graduates ? `${countOf(summary.graduates, AR.graduate)} بلا مقعد` : "",
].filter(Boolean).join(" · ");

/** الشارة: لا شيء بلا تقرير أو بلا عجز. */
export function DemandAlertBadge({ summary, open, onToggle }: { summary: DemandAlertSummary | null; open: boolean; onToggle: () => void }) {
  if (!summary?.show) return null;
  return (
    <button type="button" className="apb-badge apb-data-btn apb-demand-btn" data-tone="warning" aria-expanded={open} onClick={onToggle}
      title={`الطلب الفعلي — ${alertLine(summary)}. اضغط للعلاج.`} aria-label={`الطلب الفعلي: ${alertLine(summary)}`}
      data-guide-ignore="تنبيه الطلب الفعلي من تقرير التسجيل — يفتح قائمة المقررات بالأشد ولكلٍّ «عالج»">
      <ClipboardList aria-hidden="true" />
      {summary.uncovered ? <><b>{num(summary.uncovered)}</b><span>بلا شعبة</span></> : null}
      {summary.uncovered && summary.seats ? <i className="apb-demand-dot" aria-hidden="true" /> : null}
      {summary.seats ? <><Armchair aria-hidden="true" className="apb-demand-seat" /><b>{num(summary.seats)}</b></> : null}
      {!summary.seats && summary.graduates ? <><GraduationCap aria-hidden="true" /><b>{num(summary.graduates)}</b></> : null}
      <ChevronDown aria-hidden="true" className="apb-data-chev" />
    </button>
  );
}

/** القائمة: ثلاثة أرقام، وتوزيعها على المسارين، ثم المقررات بالأشد ولكلٍّ «عالج». */
export function DemandAlertPanel({ reading, summary, termId, onClose }: { reading: DemandReadingView; summary: DemandAlertSummary; termId: number; onClose: () => void }) {
  /* الفائض لا يُعالج من هنا: القائمةُ ما ينقص فقط. */
  const items = useMemo(() => reading.supply.filter(item => demandKindOf(item) !== "spare"), [reading.supply]);
  const tiles = [
    { key: "zero", Icon: OctagonAlert, n: summary.uncovered, label: `${nounFor(summary.uncovered, AR.course)} بلا شعبة` },
    { key: "seats", Icon: Armchair, n: summary.seats, label: "نقص المقاعد" },
    { key: "grad", Icon: GraduationCap, n: summary.graduates, label: `${nounFor(summary.graduates, AR.graduate)} بلا مقعد` },
  ].filter(tile => tile.n > 0);
  return (
    <section className="apb-gap apb-demand" aria-label="الطلب الفعلي">
      <header>
        <span className="apb-gap-ic"><ClipboardList aria-hidden="true" /></span>
        <strong>الطلب الفعلي</strong>
        <small>{reading.family.name || "عائلة القسم"}</small>
        <button type="button" className="apb-dr-close" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاق قائمة الطلب الفعلي"><X aria-hidden="true" /></button>
      </header>
      <div className="apb-demand-stats" role="list">
        {tiles.map(({ key, Icon, n, label }) => (
          <span key={key} role="listitem" className="apb-demand-stat" data-kind={key}>
            <Icon aria-hidden="true" /><b>{num(n)}</b><small>{label}</small>
          </span>
        ))}
      </div>
      {summary.byTrack.length > 1 ? (
        <div className="apb-demand-tracks" role="list" aria-label="التوزيع على المسارين">
          {summary.byTrack.map(row => (
            <span key={row.track} role="listitem" className="apb-demand-track" data-zero={!row.uncovered && !row.seats || undefined}
              title={`${TRACK_LABEL[row.track] || row.track}: بلا شعبة ${countOf(row.uncovered, AR.course)} · نقص ${countOf(row.seats, AR.seat)}`}>
              <em>{TRACK_LABEL[row.track] || row.track}</em>
              <OctagonAlert aria-hidden="true" /><b>{num(row.uncovered)}</b>
              <Armchair aria-hidden="true" /><b>{num(row.seats)}</b>
            </span>
          ))}
        </div>
      ) : null}
      <DemandSupplyList items={items} termId={termId} inPlace limit={6} />
    </section>
  );
}
