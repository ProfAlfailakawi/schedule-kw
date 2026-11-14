/**
 * ── اقتراحاتٌ ذكية، وقرار الحذف، وتحويل النمط ──
 * ثلاث لوحاتٍ قصيرة داخل «ماذا لو» في مركز الذكاء. الحساب كلُّه في
 * src/utils/smartSuggestions.ts؛ هنا العرض وحده. الاقتراح يُفتح في منضدة
 * السيناريو (اعتمادٌ ذرّي واستعادة بنقرة)، والحذف حكمٌ ثم تجربة، والنمط قراءةٌ فقط.
 */
import React, { useMemo, useState } from "react";
import { ArrowLeftRight, Building2, CircleCheck, CircleX, GraduationCap, Shuffle, TriangleAlert, UserRoundCheck } from "lucide-react";
import { dayLabel, type TmChange } from "../utils/timeMachine";
import {
  courseRemovalVerdict, facultySwaps, offeredCourses, patternCandidates, roomSwaps, simulatePatternConversion,
  type RemovalTone, type SmartSuggestion,
} from "../utils/smartSuggestions";
import type { DayKey } from "../utils/scheduleIntelligence";
import { libraryDayPairs } from "../utils/scheduleRegulations";
import { LevelDot, type LoadedContext } from "./timeMachineShared";

export interface TryChanges { title: string; changes: TmChange[] }

export function SuggestionList({ context, onTry }: { context: LoadedContext; onTry: (pick: TryChanges) => void }) {
  const list = useMemo<SmartSuggestion[]>(() => [...facultySwaps(context), ...roomSwaps(context)], [context]);
  if (!list.length) return <p className="tm-note"><CircleCheck aria-hidden="true" /> لا اقتراح الآن: الأساتذة والقاعات في أماكنها.</p>;
  return (
    <div className="ss-grid" aria-label="اقتراحات ذكية">
      {list.map(item => (
        <article key={item.id} className={`ss-card is-${item.kind}`}>
          <header>
            <span className="ss-ico" aria-hidden="true">{item.kind === "faculty" ? <UserRoundCheck /> : <Building2 />}</span>
            <b>{item.kind === "faculty" ? "أستاذ بدل هيئة/TA" : "القاعة في مكانها"}</b>
            <LevelDot level={item.delta.level} />
          </header>
          <p className="ss-title">{item.title}</p>
          <p className="ss-why">{item.why.join(" · ")}</p>
          <button type="button" className="btn btn-primary" data-guide-ignore="يفتح الاقتراح في منضدة السيناريو؛ لا يكتب حتى الاعتماد"
            onClick={() => onTry({ title: item.title, changes: item.changes })}>جرّبه</button>
        </article>
      ))}
    </div>
  );
}

const TONE_ICON: Record<RemovalTone, React.ReactNode> = { go: <CircleCheck />, care: <TriangleAlert />, stop: <CircleX /> };

export function RemovalCheck({ context, onTry }: { context: LoadedContext; onTry: (pick: TryChanges) => void }) {
  const options = useMemo(() => offeredCourses(context), [context]);
  const [courseId, setCourseId] = useState(0);
  const verdict = useMemo(() => (courseId ? courseRemovalVerdict(context, courseId) : null), [context, courseId]);
  return (
    <div className="ss-remove">
      <label className="ss-pick">
        <GraduationCap aria-hidden="true" />
        <select value={courseId || ""} onChange={event => setCourseId(Number(event.target.value))} aria-label="المقرر المراد حذفه" data-guide-ignore="يختار مقرراً لتقييم حذفه؛ لا يكتب في الجدول">
          <option value="">أريد حذف مقرر…</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {verdict ? (
        <section className={`ss-verdict is-${verdict.tone}`} aria-live="polite">
          <header><span aria-hidden="true">{TONE_ICON[verdict.tone]}</span><b>{verdict.headline}</b><small>{verdict.label}</small></header>
          <ul>{verdict.reasons.map(reason => <li key={reason.text} className={`is-${reason.tone}`}><span aria-hidden="true">{TONE_ICON[reason.tone]}</span>{reason.text}</li>)}</ul>
          {verdict.changes.length ? (
            <button type="button" className={verdict.tone === "stop" ? "btn btn-secondary" : "btn btn-primary"} data-guide-ignore="يفتح الحذف في منضدة السيناريو؛ لا يكتب حتى الاعتماد"
              onClick={() => onTry({ title: `حذف ${verdict.label}`, changes: verdict.changes })}>جرّب الحذف</button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* أزواجُ الأيام من مكتبة الأنماط وحدها (libraryDayPairs): لا الأحد·الأربعاء ولا الاثنين·الخميس ولا الأحد·الخميس. */
const PAIRS = libraryDayPairs() as Array<[DayKey, DayKey]>;

export function PatternWhatIf({ context }: { context: LoadedContext }) {
  const candidates = useMemo(() => patternCandidates(context), [context]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pair, setPair] = useState(0);
  const result = useMemo(() => (picked.size ? simulatePatternConversion(context, [...picked], PAIRS[pair]) : null), [context, picked, pair]);
  if (!candidates.length) return <p className="tm-note"><CircleCheck aria-hidden="true" /> لا مقرر في كتلةٍ واحدة طويلة (ساعتان ونصف فأكثر في يوم واحد).</p>;
  const toggle = (id: number) => setPicked(set => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const delta = (before: number, after: number, lowerIsBetter: boolean) => {
    const diff = after - before;
    const good = lowerIsBetter ? diff < 0 : diff > 0;
    return <em className={diff === 0 ? "" : good ? "is-good" : "is-bad"}>{diff > 0 ? `+${diff}` : diff}</em>;
  };
  return (
    <div className="ss-pattern">
      <div className="tm-chips" role="group" aria-label="المقررات">
        {candidates.map(item => (
          <button key={item.rowId} type="button" aria-pressed={picked.has(item.rowId)} className={picked.has(item.rowId) ? "on" : ""} onClick={() => toggle(item.rowId)}
            data-guide-ignore="يختار مقرراً للمحاكاة؛ لا يكتب في الجدول" title={`${dayLabel(item.day)} ${item.start}–${item.end} · ${item.hall}`}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="tm-chips" role="group" aria-label="اليومان">
        <Shuffle aria-hidden="true" />
        {PAIRS.map((days, index) => (
          <button key={days.join()} type="button" aria-pressed={pair === index} className={pair === index ? "on" : ""} onClick={() => setPair(index)} data-guide-ignore="يختار يومين للمحاكاة؛ لا يكتب في الجدول">
            {days.map(dayLabel).join(" + ")}
          </button>
        ))}
      </div>
      {result ? (
        <section className="ss-pattern-result" aria-live="polite">
          <ul className="tm-kpis">
            <li><b>{result.roomDays.after}</b>{delta(result.roomDays.before, result.roomDays.after, true)}<small>إشغال القاعات (قاعة × يوم)</small></li>
            <li><b>{result.longWindows.after}</b>{delta(result.longWindows.before, result.longWindows.after, false)}<small>متّسعٌ طويل في القاعات (3 س فأكثر)</small></li>
            <li className={result.blocking.after > result.blocking.before ? "is-warn" : ""}><b>{result.blocking.after}</b>{delta(result.blocking.before, result.blocking.after, true)}<small>التعارض</small></li>
          </ul>
          <ul className="ss-rows">
            {result.rows.map(row => (
              <li key={row.rowId}>
                <b>{row.label}</b>
                <span><bdi>{row.before}</bdi> <ArrowLeftRight aria-hidden="true" /> <bdi>{row.after}</bdi></span>
                {row.approved === false ? <small className="is-bad">ليس نمطاً معتمداً</small> : (<>
                  <small className={row.room === "none" ? "is-bad" : ""}>{row.room === "same" ? `القاعة نفسها ${row.hall}` : row.room === "other" ? `قاعة أخرى ${row.hall}` : "لا قاعة فارغة"}</small>
                  {!row.teacherFree ? <small className="is-bad">الأستاذ مشغول</small> : null}
                </>)}
              </li>
            ))}
          </ul>
          <p className="tm-note">محاكاة للقراءة فقط — لا شيء يُكتب.</p>
        </section>
      ) : <p className="tm-note">اختر مقرراً أو أكثر.</p>}
    </div>
  );
}
