/**
 * ── 🧩 محاكي الشعب ──
 * كلُّ شعب النطاق بطاقاتٍ مضغوطة، وبحثٌ سريع ورقائق تصفية، ثم «ماذا لو؟»:
 * احذف شعبة، أضف شعبة، ادمج، قسّم — في سلّةٍ تُقاس معاً بلا لمسٍ للجدول الحقيقي.
 * الأرقام من المحرّكات القائمة (src/utils/timeMachine.ts)، والطلبةُ من الرادار وحده.
 */
import React, { useMemo, useState } from "react";
import { GitMerge, Plus, Scissors, Search, Trash2, X } from "lucide-react";
import {
  MODE_LABEL, PERIOD_LABEL, TM_DAYS, addSectionChange, applyChanges, boardOf, capacityLabel, dayLabel, hallLabel, mergeSectionsChange,
  removeImpact, removeSectionChange, sectionCards, splitSectionChange, suggestPlacements,
  type TmChange, type TmPeriod, type TmScenarioRecord, type TmSectionCard,
} from "../utils/timeMachine";
import type { DayKey } from "../utils/scheduleIntelligence";
import ScenarioWorkbench from "./ScenarioWorkbench";
import { Ico, Loading, useTimeMachineContext, type LoadedContext } from "./timeMachineShared";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { useCourseSheets } from "./useCourseSheets";
import { inNewSheet, SHEET_TAG_LABEL, type SheetTag } from "../utils/sheetTag";
import "../styles/39-sections-courses.css";

type Assign = "all" | "vacant" | "assigned";
/* الاختصار الشائع لأيام الدوام: أحد، اثنين، ثلاثاء، أربعاء، خميس. */
const DAY_LETTER = ["ح", "ن", "ث", "ر", "خ"];
const plausibleCapacity = (capacity: number) => Number(capacity) >= 5;

export function SectionSimulatorBody({ context, reload }: { context: LoadedContext; reload: () => void }) {
  const [changes, setChanges] = useState<TmChange[]>([]);
  const [scenario, setScenario] = useState<TmScenarioRecord | null>(null);
  const [query, setQuery] = useState("");
  const [days, setDays] = useState<Set<DayKey>>(new Set());
  const [periods, setPeriods] = useState<Set<TmPeriod>>(new Set());
  const [modes, setModes] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState<Assign>("all");
  const [inspect, setInspect] = useState<string | null>(null);
  const [adding, setAdding] = useState<number>(0);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);

  const base = useMemo(() => boardOf(context), [context]);
  const board = useMemo(() => applyChanges(base, changes), [base, changes]);
  const cards = useMemo(() => sectionCards(board, context), [board, context]);
  const removedKeys = useMemo(() => {
    const now = new Set(cards.map(card => card.key));
    return sectionCards(base, context).filter(card => !now.has(card.key));
  }, [base, cards, context]);

  const toggle = <T,>(set: Set<T>, value: T, apply: (next: Set<T>) => void) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); apply(next); };
  const text = query.trim().toLowerCase();
  const shown = cards.filter(card =>
    (!text || `${card.courseCode} ${card.courseName} ${card.code} ${card.instructorName} ${card.hall}`.toLowerCase().includes(text))
    && (!days.size || card.days.some(day => days.has(day)))
    && (!periods.size || periods.has(card.period))
    && (!modes.size || modes.has(card.mode || "—"))
    && (assign === "all" || (assign === "vacant" ? card.vacant : !card.vacant)));
  const modeChips = [...new Set<string>(cards.map(card => String(card.mode || "—")))];
  const totals = {
    sections: cards.length,
    vacant: cards.filter(card => card.vacant).length,
    /* مقاعدُ الشعب ذات السعة المعروفة وحدها؛ والباقي يُعدّ «غير محددة» لا صفراً. */
    seats: cards.reduce((sum, card) => sum + (card.capacitySource ? card.capacity : 0), 0),
    unknownSeats: cards.filter(card => !card.capacitySource).length,
    students: context.demand ? cards.reduce((sum, card) => sum + (card.students || 0), 0) : null,
  };

  const add = (change: TmChange | null) => { if (change) setChanges(list => [...list, change]); setInspect(null); setAdding(0); setMergeFrom(null); };
  const impact = inspect ? removeImpact(board, inspect, context) : null;
  const suggestions = adding ? suggestPlacements(board, adding, context, { max: 3 }) : [];
  const people = new Map(context.instructors.map(person => [Number(person.AdInstructorId), person.AdInstructorName] as const));
  const courseOptions = [...new Map(context.courses.map(course => [course.AdCourseId, course])).values()]
    .sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode)));
  /* مقرراتُ الصحيفة الجديدة تُرى بوسمٍ ظاهر، وتُجمع في القائمة تحت عنوانها. */
  const sheets = useCourseSheets(Number(context.scope.sectionId));
  const tagOf = (courseId: number): SheetTag => sheets.tags.get(Number(courseId)) ?? null;
  const newOptions = courseOptions.filter(course => inNewSheet(tagOf(course.AdCourseId)));
  const otherOptions = courseOptions.filter(course => !inNewSheet(tagOf(course.AdCourseId)));
  const optionText = (course: typeof courseOptions[number]) => {
    const tag = tagOf(course.AdCourseId);
    return `${course.CourseCode} · ${course.CourseName}${tag === "new" ? " · 🆕 صحيفة جديدة" : ""}`;
  };

  return (
    <div className="tm-sim">
      <ul className="tm-kpis" aria-label="ملخص الشعب">
        <li><Ico n="sections" className="tm-kpi-ico" /><b>{totals.sections}</b><small>{nounFor(totals.sections, AR.section)}</small></li>
        <li title={totals.unknownSeats ? `${countOf(totals.unknownSeats, AR.section)}: السعة غير محددة ولم تُحسب` : undefined}><Ico n="seats" className="tm-kpi-ico" /><b>{totals.seats}</b><small>{nounFor(totals.seats, AR.seat)}{totals.unknownSeats ? ` · ${totals.unknownSeats} غير محددة` : ""}</small></li>
        <li><Ico n="students" className="tm-kpi-ico" /><b>{totals.students ?? "—"}</b><small>{nounFor(totals.students ?? 0, AR.student)} · رادار</small></li>
        <li className={totals.vacant ? "is-warn" : ""}><Ico n="vacant" className="tm-kpi-ico" /><b>{totals.vacant}</b><small>شاغرة</small></li>
      </ul>

      <div className="tm-filters">
        <label className="tm-search"><Search aria-hidden="true" /><input data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" value={query} onChange={event => setQuery(event.target.value)} placeholder="مقرر، رمز، أستاذ، قاعة…" aria-label="بحث في الشعب" />
          {query ? <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" onClick={() => setQuery("")} aria-label="مسح"><X /></button> : null}</label>
        <div className="tm-chips" role="group" aria-label="الأيام">
          {TM_DAYS.map(day => <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" key={day} type="button" aria-pressed={days.has(day)} className={days.has(day) ? "on" : ""} onClick={() => toggle(days, day, setDays)}>{dayLabel(day)}</button>)}
        </div>
        <div className="tm-chips" role="group" aria-label="الفترة">
          {(["morning", "noon", "evening"] as TmPeriod[]).map(period => <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" key={period} type="button" aria-pressed={periods.has(period)} className={periods.has(period) ? "on" : ""} onClick={() => toggle(periods, period, setPeriods)}><Ico n={period} />{PERIOD_LABEL[period]}</button>)}
        </div>
        <div className="tm-chips" role="group" aria-label="نوع المقرر">
          {modeChips.map(mode => <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" key={mode} type="button" aria-pressed={modes.has(mode)} className={modes.has(mode) ? "on" : ""} onClick={() => toggle(modes, mode, setModes)}>{MODE_LABEL[mode] || "غير مصنّف"}</button>)}
        </div>
        <div className="tm-chips" role="group" aria-label="الإسناد">
          {(["all", "assigned", "vacant"] as Assign[]).map(value => <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" key={value} type="button" aria-pressed={assign === value} className={assign === value ? "on" : ""} onClick={() => setAssign(value)}>{value === "all" ? <><Ico n="sections" />الكل</> : value === "vacant" ? <><Ico n="vacant" />شاغرة</> : <><Ico n="assign" />مُسندة</>}</button>)}
        </div>
        <span className="tm-count">{shown.length}/{cards.length}</span>
      </div>

      <div className="tm-addbar">
        <select data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" value={adding || ""} onChange={event => { setAdding(Number(event.target.value)); setInspect(null); }} aria-label="أضف شعبة لمقرر">
          <option value="">+ ماذا لو أضفنا شعبة…</option>
          {newOptions.length ? <>
            <optgroup label="🆕 الصحيفة الجديدة">{newOptions.map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{optionText(course)}</option>)}</optgroup>
            <optgroup label="📘 الصحيفة القديمة والمقررات الأخرى">{otherOptions.map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{optionText(course)}</option>)}</optgroup>
          </> : courseOptions.map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{optionText(course)}</option>)}
        </select>
        {mergeFrom ? <span className="tm-hint"><GitMerge aria-hidden="true" />اختر الشعبة التي تستقبل الطلبة <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" onClick={() => setMergeFrom(null)}><X aria-label="إلغاء" /></button></span> : null}
      </div>

      {adding ? (
        <div className="tm-suggest" aria-label="أفضل المواضع المتاحة">
          {suggestions.length ? suggestions.map((item, index) => (
            <article key={index} className={index === 0 ? "is-best" : ""}>
              <header className="tm-suggest-head">
                <Ico n={index === 0 ? "best" : "idea"} className={index === 0 ? "tm-star" : ""} />
                <span className="tm-days">{TM_DAYS.map((day, i) => <i key={day} className={item.days.includes(day) ? "on" : ""} title={dayLabel(day)}>{DAY_LETTER[i]}</i>)}</span>
                <bdi className="tm-suggest-time">{item.start}–{item.end}</bdi>
              </header>
              <ul className="tm-suggest-facts">
                <li title="القاعة"><Ico n="rooms" /><b>{hallLabel(item.hall)}</b></li>
                <li title="الأستاذ"><Ico n="teachers" /><b>{people.get(item.instructorId) || "—"}</b></li>
                {item.studentsServed !== null ? <li title="طلبة يُخدَمون (رادار)"><Ico n="students" /><b>≈{item.studentsServed}</b></li> : null}
              </ul>
              <p className="tm-tags">{item.reasons.slice(0, 2).map(reason => <span key={reason}>{reason}</span>)}
                {item.capacity ? <span className={item.capacity.value === null ? "is-unknown" : ""} title={item.capacity.source === "room" ? "سعة المقرر غير مسجّلة؛ هذه سعة القاعة في سجل المواقع" : item.capacity.source === "section" ? "سعة الشعبة المسجّلة للمقرر" : "لا سعة مسجّلة للمقرر ولا للقاعة"}>{capacityLabel(item.capacity)}</span> : null}</p>
              <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-secondary" onClick={() => add(addSectionChange(board, adding, item, context))}><Plus aria-hidden="true" />للسلة</button>
            </article>
          )) : <p className="tm-note">لا موضع خالٍ بلا تعارض لهذا المقرر</p>}
        </div>
      ) : null}

      {impact ? (
        <section className="tm-impact" aria-label="لو حُذفت هذه الشعبة">
          <header><b className="tm-th"><Ico n="remove" />لو حُذفت {impact.card.courseCode} ش{impact.card.code}</b><button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" onClick={() => setInspect(null)} aria-label="إغلاق"><X /></button></header>
          <div className="tm-impact-grid">
            <div className="tm-impact-tile"><Ico n="students" className="tm-tile-ico" /><b>{impact.students ?? "—"}</b><small>{nounFor(impact.students ?? 0, AR.student)} · يتأثر</small></div>
            <div className={`tm-impact-tile ${impact.shortfall ? "is-bad" : "is-good"}`}><Ico n="seats" className="tm-tile-ico" /><b>{impact.shortfall ?? "—"}</b><small>بلا مقعد بعدها</small></div>
            {impact.teacher ? (
              <div className="tm-impact-tile"><Ico n="teachers" className="tm-tile-ico" /><b><bdi>{impact.teacher.before}</bdi> ← <bdi>{impact.teacher.after}</bdi></b><small>نصاب {impact.teacher.name}{impact.teacher.limit ? ` / ${impact.teacher.limit}` : ""}</small>
                {impact.teacher.limit ? <meter min={0} max={impact.teacher.limit} value={impact.teacher.after} aria-label="النصاب بعد" /> : null}</div>
            ) : null}
            <div className="tm-impact-tile"><Ico n="rooms" className="tm-tile-ico" /><b>{impact.freed.length}</b><small>{nounFor(impact.freed.length, AR.slot)} · تتحرر</small></div>
          </div>
          <ul className="tm-alts" aria-label="أين يذهب الطلبة">
            {impact.alternatives.length ? impact.alternatives.map(alt => (
              <li key={alt.code}><b>ش{alt.code}</b><small>{alt.when}</small>
                {plausibleCapacity(alt.capacity) ? <>
                  <span className="tm-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (alt.capacity - (alt.freeSeats ?? 0)) / alt.capacity * 100)}%` }} /></span>
                  <em title="مقاعد شاغرة"><Ico n="seats" />{alt.freeSeats === null ? alt.capacity : alt.freeSeats}</em>
                </> : <span />}</li>
            )) : <li className="tm-note">لا شعبة أخرى لهذا المقرر — الطلبة بلا بديل</li>}
          </ul>
          <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-primary" onClick={() => add(removeSectionChange(impact.card))}><Trash2 aria-hidden="true" />أضف الحذف للسلة</button>
        </section>
      ) : null}

      <div className="tm-cards">
        {shown.map(card => (
          <SectionCardView key={card.key} card={card} sheet={tagOf(card.courseId)} active={inspect === card.key} merging={Boolean(mergeFrom) && mergeFrom !== card.key && cards.find(c => c.key === mergeFrom)?.courseId === card.courseId}
            onInspect={() => { setInspect(inspect === card.key ? null : card.key); setAdding(0); }}
            onSplit={() => add(splitSectionChange(board, card, context))}
            onMerge={() => {
              if (mergeFrom && mergeFrom !== card.key) { const from = cards.find(c => c.key === mergeFrom); if (from && from.courseId === card.courseId) add(mergeSectionsChange(from, card)); }
              else setMergeFrom(card.key);
            }} />
        ))}
        {removedKeys.map(card => <article key={`gone-${card.key}`} className="tm-card is-removed"><b>{card.courseCode}</b><small>ش{card.code} · محذوفة في السيناريو</small></article>)}
      </div>

      <h3 className="tm-basket-title"><Ico n="basket" />سلة التغييرات {changes.length ? <span>{changes.length}</span> : null}</h3>
      {changes.length ? (
        <ul className="tm-basket">
          {changes.map(change => <li key={change.id}><span>{change.label}</span><button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" onClick={() => setChanges(list => list.filter(item => item.id !== change.id))} aria-label="أزل من السلة"><X /></button></li>)}
        </ul>
      ) : <p className="tm-note">اضغط شعبة لترى أثر حذفها، أو أضف شعبة، أو <Ico n="split" /> قسّم، أو <Ico n="merge" /> ادمج</p>}
      {changes.length ? <ScenarioWorkbench context={context} changes={changes} mode="sections" scenario={scenario} onScenario={setScenario}
        defaultName="محاكاة الشعب" onDiscard={() => { setChanges([]); setScenario(null); }} onApplied={reload} /> : null}
    </div>
  );
}

function SectionCardView({ card, sheet, active, merging, onInspect, onSplit, onMerge }: { key?: string; card: TmSectionCard; sheet: SheetTag; active: boolean; merging: boolean; onInspect: () => void; onSplit: () => void; onMerge: () => void }) {
  /* السعةُ من المقرر، وإلا من القاعة، وإلا «غير محددة» — لا رقمَ مخترعاً ولا شريط عليه. */
  const plausible = Boolean(card.capacitySource) && plausibleCapacity(card.capacity);
  const fill = card.students !== null && plausible ? Math.min(100, card.students / card.capacity * 100) : 0;
  const seats = plausible ? (card.students !== null ? `≈${card.students}/${card.capacity}` : `${card.capacity}`) : card.students !== null ? `≈${card.students} · السعة غير محددة` : "السعة غير محددة";
  const seatIcon = card.students !== null ? "students" as const : "seats" as const;
  return (
    <article className={`tm-card ${active ? "is-active" : ""} ${card.vacant ? "is-vacant" : ""} ${card.added ? "is-added" : ""} ${merging ? "is-merge-target" : ""}`}>
      <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="tm-card-main" onClick={merging ? onMerge : onInspect} aria-label={`${card.courseCode} · ش${card.code}`}>
        <span className="tm-card-code"><b>{card.courseCode}</b><small>ش{card.code}</small>{sheet === "new" ? <em className="tm-sheet-tag" title="مقرر من الصحيفة الجديدة">🆕 {SHEET_TAG_LABEL.new}</em> : null}</span>
        <span className="tm-card-name">{card.courseName}</span>
        <span className="tm-card-meta">
          <span className="tm-days">{TM_DAYS.map((day, index) => <i key={day} className={card.days.includes(day) ? "on" : ""} title={dayLabel(day)}>{DAY_LETTER[index]}</i>)}</span>
          <bdi>{card.start}–{card.end}</bdi>
        </span>
        <span className="tm-card-meta"><span className="tm-th"><Ico n="rooms" />{card.hall}</span><span className="tm-th">{card.vacant ? <><Ico n="vacant" />شاغرة</> : <><Ico n="teachers" />{card.instructorName}</>}</span></span>
        {seats ? <span className={`tm-seat${plausible ? "" : " is-unknown"}`} title={!plausible ? "لا سعة مسجّلة للمقرر ولا للقاعة" : card.capacitySource === "room" ? "سعة القاعة (سعة المقرر غير مسجّلة)" : card.students !== null ? "طلبة ≈ / سعة" : "سعة"}>
          {plausible && card.students !== null ? <span className="tm-bar" aria-hidden="true"><i style={{ width: `${fill}%` }} /></span> : null}
          <small className="tm-th"><Ico n={seatIcon} />{seats}</small>
        </span> : null}
      </button>
      <span className="tm-card-actions">
        <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" onClick={onSplit} title="قسّم" aria-label="قسّم"><Scissors /></button>
        <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" onClick={onMerge} title="ادمج" aria-label="ادمج"><GitMerge /></button>
      </span>
    </article>
  );
}

/** المحاكي مستقلاً: يقرأ نطاقه بنفسه (من أداة التخطيط أو من آلة الزمن). */
export default function SectionSimulator({ collegeId, sectionId, termId }: { collegeId?: number; sectionId?: number; termId?: number }) {
  const { context, error, reload } = useTimeMachineContext({ collegeId, sectionId, termId });
  if (error) return <p className="tm-note" role="alert">{error}</p>;
  if (!context) return <Loading />;
  return <SectionSimulatorBody context={context} reload={reload} />;
}
