import React, { useEffect, useState } from "react";
import { CalendarPlus, CircleSlash, Lightbulb, RefreshCw, TrendingUp, Users } from "lucide-react";
import { MicroLoader, SecondaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import ApplyProposal, { ImpactCard, postScheduleProposal, postWhatIf, type ChangeImpact } from "./ApplyProposal";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { request } from "./RadarSchedule";
import CourseTags from "./CourseTags";
import PersonChips from "./PersonChips";
import { useVisitingLookup } from "../hooks/useVisitingLookup";

/**
 * ── «الرادار يقترح الحل وينفذه» ─────────────────────────────────────────────
 *
 * تحت بطاقتي «مطلوبةٌ ولا تُطرح» و«تمتلئ»: لكل مقرر شعبةٌ مقترحة (يومٌ ووقت، أستاذ، قاعة) من محرّك فتح
 * الشعب نفسِه، يختار منها الخادمُ الوقتَ الذي يأخذه أكثرُ المنتظرين (GET /api/simulation/suggestions).
 * الأثرُ يُقرأ قبل الاعتماد من «ماذا لو؟» نفسِه، و«اعتمد الشعبة» يمرّ من مسار حفظ الجدول نفسِه
 * (ApplyProposal ← apply-proposal) فتجري عليه كلُّ فحوص الحفظ اليدوي. ويظهر الزرّ لمن يكتب الجدول
 * وحده؛ وغيرُه يقرأ الاقتراح ويعرف من يعتمده. أعدادٌ لا أسماء طلبة.
 */
interface Placement { index: number; day: string; dayLabel: string; start: string; end: string; buildingId: string; roomId: string; roomCode: string; roomHall: string; instructorId: number; instructorName: string; sectionCode: string; days?: string[] }
export interface SuggestionRow {
  courseId: number; collegeId: number; sectionId: number; code: string; name: string; waiting: number; kind: "not-offered" | "full";
  suggestion: null | { placement: Placement; fits: number; seatedBefore: number; seatedAfter: number };
  reason?: string; reasonLine?: string; sectionName: string;
}
interface Reading { ready: boolean; termId?: number; ranAt?: string; stale?: boolean; rows: SuggestionRow[]; more?: number }

const nf = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");
const roomOf = (p: Placement) => `${p.roomCode}${p.roomHall ? `/${p.roomHall}` : ""}`;

export default function RadarSuggestions({ termId, ranAt, collegeId = 0, sectionId = 0, canSchedule, onChanged }: {
  termId: number; ranAt: string; collegeId?: number; sectionId?: number;
  /** يكتب الجدول في نطاقه (allowed.schedule وليس للقراءة فقط): يرى «اعتمد الشعبة». */
  canSchedule: boolean;
  onChanged: () => void;
}) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState("");
  /* بعد اعتماد شعبةٍ تغيّر الجدول: بقيةُ الاقتراحات بُنيت على أسبوعٍ مضى، فتُقرأ ولا تُعتمد حتى يُعاد الاحتساب. */
  const [adopted, setAdopted] = useState<number[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setReading(null); setError(""); setAdopted([]);
    const params = new URLSearchParams({ termId: String(termId) });
    if (collegeId) params.set("collegeId", String(collegeId));
    if (sectionId) params.set("sectionId", String(sectionId));
    request(`/api/simulation/suggestions?${params}`).then(body => { if (live) setReading(body); }).catch((e: any) => { if (live) setError(e.message || "تعذّر بناء الاقتراحات."); });
    return () => { live = false; };
  }, [termId, ranAt, collegeId, sectionId, tick]);

  if (error) return (
    <section className="rs-panel" aria-label="الرادار يقترح الحل">
      <p className="rs-line"><CircleSlash aria-hidden="true" /> {error}</p>
      <SecondaryButton type="button" onClick={() => setTick(t => t + 1)} aria-label="أعد بناء اقتراحات الرادار" data-guide-ignore="يعيد قراءة الاقتراحات؛ لا يكتب شيئاً"><RefreshCw aria-hidden="true" /> أعد المحاولة</SecondaryButton>
    </section>
  );
  if (!reading) return <section className="rs-panel" aria-label="الرادار يقترح الحل" aria-busy="true"><MicroLoader label="يبحث الرادار عن شعبةٍ لكل مقرر…" /></section>;
  if (!reading.ready || !reading.rows.length) return null;
  /* اعتمادٌ من هذه اللوحة يغيّر ما بُنيت عليه بقيّةُ الاقتراحات فتُحجب حتى يُعاد الاحتساب؛ أمّا قراءةٌ
     أقدمُ من آخر تعديلٍ في الجدول فلا تحجب الاعتماد: الحفظُ يمرّ بفاحص التعارضات واللائحة من جديد. */
  const changed = adopted.length > 0;
  const older = !changed && Boolean(reading.stale);
  return (
    <section className="rs-panel" aria-label="الرادار يقترح الحل">
      <header className="rs-head">
        <span className="rs-ic" aria-hidden="true"><Lightbulb /></span>
        <div><b>الرادار يقترح الحل</b>
          <small>شعبةٌ لكل مقرر مطلوب ولا يُطرح أو يمتلئ: وقتٌ من سُلّم القسم المعتمد، وأستاذٌ درّسه وله نصاب، وقاعةٌ خالية من نوعها — والوقت الذي يأخذه أكثرُ المنتظرين.</small></div>
      </header>
      {changed ? <p className="rs-line rs-stale" role="status"><RefreshCw aria-hidden="true" /> تغيّر الجدول بعد هذه الاقتراحات؛ تتجدّد بعد إعادة احتساب الرادار.</p> : null}
      {older ? <p className="rs-line" role="status"><RefreshCw aria-hidden="true" /> قراءةُ الرادار أقدم من آخر تعديلٍ في الجدول؛ يُفحص الاقتراح من جديد عند اعتماده.</p> : null}
      <div className="rs-list">
        {reading.rows.map(row => <SuggestionCard key={row.courseId} row={row} termId={termId} canAdopt={canSchedule && !changed} adopted={adopted.includes(row.courseId)} canSchedule={canSchedule}
          onApplied={() => { setAdopted(list => [...list, row.courseId]); onChanged(); }} />)}
      </div>
      {reading.more ? <p className="rs-line">و{countOf(reading.more, AR.course)} أخرى تحتاج قراراً — تظهر اقتراحاتُها بعد اعتماد هذه أو من قائمة «تحتاج قراراً».</p> : null}
    </section>
  );
}

function SuggestionCard({ row, termId, canAdopt, adopted, canSchedule, onApplied }: { key?: React.Key; row: SuggestionRow; termId: number; canAdopt: boolean; adopted: boolean; canSchedule: boolean; onApplied: () => void }) {
  const [impact, setImpact] = useState<ChangeImpact | "loading" | "failed" | null>(null);
  const { isVisiting } = useVisitingLookup(termId);
  const s = row.suggestion;
  const body = s ? { kind: "opening", collegeId: row.collegeId, sectionId: row.sectionId, termId, courseId: row.courseId, placement: s.placement } : null;
  const measure = () => {
    if (!body) return;
    setImpact("loading");
    postWhatIf(body).then(setImpact).catch(() => setImpact("failed"));
  };
  const when = s ? `${s.placement.dayLabel} ${formatScheduleTimeRange(s.placement.start, s.placement.end)}` : "";
  return (
    <article className="rs-card" aria-label={`اقتراح «${row.name}»`}>
      <div className="rs-title">
        <b>{row.name}<CourseTags courseId={row.courseId} /></b><span dir="ltr">{row.code}</span>
        <em className={`rs-kind ${row.kind}`}>{row.kind === "not-offered" ? "مطلوبٌ ولا يُطرح" : "يمتلئ"}</em>
      </div>
      <small className="rs-wait"><Users aria-hidden="true" /> {countOf(row.waiting, AR.student)} بلا مقعد فيه</small>
      {!s ? <p className="rs-line rs-none"><CircleSlash aria-hidden="true" /> لا اقتراح: {row.reasonLine || "لا وقت خالياً من التعارض يناسب الطلبة المنتظرين."}</p> : (
        <>
          <p className="rs-slot"><CalendarPlus aria-hidden="true" /> <span>شعبة <bdi dir="ltr">{s.placement.sectionCode}</bdi> · <b>{s.placement.dayLabel}</b> <bdi dir="ltr">{formatScheduleTimeRange(s.placement.start, s.placement.end)}</bdi> · قاعة <bdi dir="ltr">{roomOf(s.placement)}</bdi> · {s.placement.instructorName}<PersonChips visiting={isVisiting(s.placement.instructorId, row.collegeId, row.sectionId)} /></span></p>
          <small className="rs-fit">يناسب وقتُها {nf(s.fits)} من {countOf(row.waiting, AR.student)} منتظرين (قيدُ الصباح أو المساء، وبلا تعارض مع مقرراتهم).</small>
          <div className="sm-impact" aria-label="من يجد مقعداً في المقرر قبل الشعبة وبعدها">
            <b><TrendingUp aria-hidden="true" /> يجدون مقعداً في المقرر</b>
            {([["قبل", s.seatedBefore, "was"], ["بعد", s.seatedAfter, "now"]] as const).map(([label, value, tone]) => (
              <div key={label} className="sm-ba"><span>{label}</span><div className="sm-ba-bar"><i className={tone} style={{ inlineSize: `${Math.min(100, (value / Math.max(1, s.seatedAfter, s.seatedBefore + row.waiting)) * 100)}%` }} /></div><em>{nf(value)}</em></div>
            ))}
          </div>
          {impact && typeof impact === "object" ? <>
            <p className="rs-line"><b>أقل من 12 وحدة:</b> {nf(impact.before.below12)} ← {nf(impact.after.below12)} · <b>يبلغون 12 فأكثر:</b> {nf(impact.before.canReach15 + impact.before.canReach12To14)} ← {nf(impact.after.canReach15 + impact.after.canReach12To14)}</p>
            <ImpactCard impact={impact} />
          </> : impact === "loading" ? <small className="rs-line" role="status">يقيس الأثر على الطلبة…</small>
            : impact === "failed" ? <small className="rs-line">تعذّر قياس الأثر الآن.</small>
            : <SecondaryButton type="button" onClick={measure} aria-label={`ماذا يتغيّر للطلبة لو فُتحت شعبة «${row.name}»؟`} data-guide-ignore="يقيس أثر الاقتراح بماذا لو؛ لا يكتب شيئاً"><TrendingUp aria-hidden="true" /> ماذا يتغيّر للطلبة؟</SecondaryButton>}
          {canSchedule && (canAdopt || adopted) ? (
            <ApplyProposal compact label="اعتمد الشعبة"
              lines={[`شعبة ${s.placement.sectionCode} لـ«${row.name}» · ${when} · ${roomOf(s.placement)} · ${s.placement.instructorName}`]}
              why={`يجد ${countOf(s.seatedAfter - s.seatedBefore, AR.student)} مقعداً في المقرر بعد فتحها.`}
              preview={() => postWhatIf(body)}
              run={async () => {
                const result = await postScheduleProposal({ ...body, origin: { kind: "radar", refId: `course:${row.courseId}`, note: `اقتراح الرادار: فتح شعبة لـ«${row.name}»` } });
                return { summary: `فُتحت شعبة ${result.applied[0].row.SCode} لـ«${row.name}» في الجدول`, amendment: Boolean(result.amendment) };
              }}
              onApplied={onApplied} />
          ) : canSchedule ? null : <small className="rs-line rs-who">للاطّلاع: يعتمدها من يحرّر جدول {row.sectionName ? `قسم «${row.sectionName}»` : "قسم المقرر"}.</small>}
        </>
      )}
    </article>
  );
}
