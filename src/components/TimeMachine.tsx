/**
 * ── ⏳ آلة الزمن ──
 * سيناريوهاتٌ فوق الجدول الحيّ كفروع git: لا شيء يُكتب حتى «اعتمد الكل».
 *   🚨 طوارئ: جملةٌ ← ثلاثة حلولٍ مرتّبة في ثوانٍ.
 *   🧪 مختبر: تعديلٌ حرّ على الشعب بأثرٍ حيّ (محاكي الشعب).
 *   🎯 هدف: «صفّر الخميس»، «قلّل الفجوات»، «وفّر قاعتين».
 * ثم مقارنةٌ جنباً إلى جنب، وحفظٌ ونسخٌ ومشاركةٌ للعرض، وتنبيهُ انحراف.
 */
import React, { useEffect, useMemo, useState } from "react";
import { FlaskConical, Hourglass, Puzzle, Scale, Siren, Sparkles, Target } from "lucide-react";
import {
  boardOf, compareScenarios, describeProblem, driftOf, parseProblem, solveProblem,
  type TmProblem, type TmScenarioRecord, type TmSolution,
} from "../utils/timeMachine";
import ScenarioWorkbench from "./ScenarioWorkbench";
import { AR, countOf } from "../utils/arabicCount";
import { SectionSimulatorBody } from "./SectionSimulator";
import { COMPARE_ICON, Ico, LevelDot, Loading, PHILOSOPHY_ICON, scopeQuery, type IcoName, useTimeMachineContext, type LoadedContext } from "./timeMachineShared";

type Mode = "emergency" | "lab" | "goal";

/** أمثلةٌ من الجدول نفسه (قاعةٌ وأستاذٌ ومقررٌ حقيقيون في النطاق) لا من نصٍّ ثابت. */
function examplesOf(context: LoadedContext): string[] {
  const busiest = new Map<string, number>();
  context.rows.filter(row => row.fsunday && row.AdRoomHall).forEach(row => busiest.set(String(row.AdRoomHall), (busiest.get(String(row.AdRoomHall)) || 0) + 1));
  const hall = [...busiest.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const thursday = context.rows.find(row => row.fthursday && context.instructors.some(p => p.AdInstructorId === row.AdInstructorId && !/^هيئة/.test(p.AdInstructorName)));
  const teacher = context.instructors.find(p => p.AdInstructorId === thursday?.AdInstructorId)?.AdInstructorName;
  const wanted = context.demand ? Object.entries(context.demand).sort((a, b) => (b[1].wanted - b[1].seated) - (a[1].wanted - a[1].seated))[0]?.[0] : undefined;
  const course = context.courses.find(c => String(c.AdCourseId) === wanted) || context.courses.find(c => context.rows.some(r => r.AdCourseId === c.AdCourseId));
  return [hall ? `قاعة ${hall} تعطلت الأحد` : "", teacher ? `${teacher} معتذر الخميس` : "", course ? `زاد الطلب على ${course.CourseCode}` : ""].filter(Boolean);
}
const GOALS: Array<{ icon: IcoName; label: string; problem: TmProblem }> = [
  { icon: "clearDay", label: "صفّر الخميس", problem: { kind: "clearDay", day: "fthursday" } },
  { icon: "gaps", label: "قلّل فجوات الأساتذة", problem: { kind: "reduceGaps" } },
  { icon: "rooms", label: "وفّر قاعتين", problem: { kind: "freeRooms", count: 2 } },
];

export default function TimeMachine() {
  const { context, error, reload } = useTimeMachineContext();
  if (error) return <div className="tm-page"><p className="tm-note" role="alert">{error}</p></div>;
  if (!context) return <div className="tm-page"><Loading /></div>;
  return <TimeMachineBody context={context} reload={reload} />;
}

function TimeMachineBody({ context, reload }: { context: LoadedContext; reload: () => void }) {
  const [mode, setMode] = useState<Mode>("emergency");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<TmProblem | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [solutions, setSolutions] = useState<TmSolution[]>([]);
  const [chosen, setChosen] = useState<TmSolution | null>(null);
  const [scenario, setScenario] = useState<TmScenarioRecord | null>(null);
  const [saved, setSaved] = useState<TmScenarioRecord[]>([]);
  const [comparing, setComparing] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const base = useMemo(() => boardOf(context), [context]);

  const loadSaved = () => fetch(`/api/time-machine/scenarios?${scopeQuery(context)}`, { credentials: "include" })
    .then(r => r.json()).then(body => setSaved(Array.isArray(body?.scenarios) ? body.scenarios : [])).catch(() => setSaved([]));
  useEffect(() => { void loadSaved(); }, [context]);

  const run = (next: TmProblem | null) => {
    setChosen(null); setScenario(null);
    setProblem(next); setUnknown(!next);
    if (!next) { setSolutions([]); return; }
    const started = performance.now();
    const found = solveProblem(next, base, context, 3);
    setElapsed(Math.round(performance.now() - started));
    setSolutions(found);
  };

  const onScenario = (record: TmScenarioRecord) => { setScenario(record); void loadSaved(); };
  const openSaved = (record: TmScenarioRecord) => {
    setScenario(record);
    setChosen({ id: record.id, philosophy: "minimal", title: record.name, icon: "saved", changes: record.changes, why: [], delta: null as any, score: 0, satisfied: true });
    setProblem(null); setSolutions([]);
  };

  const comparison = useMemo(() => {
    const picked = solutions.filter(item => comparing.has(item.id));
    const list = picked.length >= 2 ? picked : solutions;
    return list.length >= 2 ? { list, table: compareScenarios(list.map(item => item.delta)) } : null;
  }, [solutions, comparing]);

  const problemLabel = problem ? describeProblem(problem, context) : undefined;

  return (
    <div className="tm-page">
      <header className="tm-hero">
        <span className="tm-hero-mark" aria-hidden="true"><Hourglass /></span>
        <div>
          <h1>آلة الزمن</h1>
          <p><bdi>{context.scope.sectionName}</bdi> · <bdi>{context.scope.termName}</bdi> · {countOf(context.rows.length, AR.appointment)}</p>
        </div>
        <span className="tm-branch" title="لا شيء يُكتب في الجدول حتى الاعتماد"><Ico n="branch" />فرعٌ افتراضي</span>
      </header>

      <nav className="tm-modes" aria-label="الوضع">
        {([["emergency", <Siren key="i" />, "طوارئ"], ["lab", <FlaskConical key="i" />, "مختبر"], ["goal", <Target key="i" />, "هدف"]] as Array<[Mode, React.ReactNode, string]>).map(([value, icon, label]) => (
          <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" key={value} type="button" className={mode === value ? "on" : ""} aria-pressed={mode === value} onClick={() => { setMode(value); run(null); setUnknown(false); }}>{icon}<b>{label}</b></button>
        ))}
      </nav>

      {mode === "emergency" ? (
        <form className="tm-ask" onSubmit={event => { event.preventDefault(); run(parseProblem(text, context)); }}>
          <Siren aria-hidden="true" />
          <input data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" value={text} onChange={event => setText(event.target.value)} placeholder="ماذا حدث؟" aria-label="صف المشكلة" />
          <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="submit" className="btn btn-primary"><Sparkles aria-hidden="true" />حلول</button>
          <div className="tm-examples">{examplesOf(context).map(example => <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" key={example} type="button" onClick={() => { setText(example); run(parseProblem(example, context)); }}>{example}</button>)}</div>
        </form>
      ) : null}

      {mode === "goal" ? (
        <div className="tm-goals">
          {GOALS.map(goal => <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" key={goal.label} type="button" className={problem && JSON.stringify(problem) === JSON.stringify(goal.problem) ? "on" : ""} onClick={() => run(goal.problem)}><Ico n={goal.icon} className="tm-goal-ico" /><b>{goal.label}</b></button>)}
        </div>
      ) : null}

      {unknown && mode !== "lab" && text ? <p className="tm-note" role="status"><Ico n="idea" /> لم أفهم الجملة. جرّب: «قاعة … تعطلت الأحد»، «د. … معتذر الخميس»، «زاد الطلب على 121»</p> : null}

      {mode === "lab" ? <SectionSimulatorBody context={context} reload={reload} /> : null}

      {mode !== "lab" && problem ? (
        <section className="tm-solutions" aria-label="حلول جاهزة">
          <h2><Ico n="problem" className="tm-h-ico" />{problemLabel}<small><bdi>{elapsed} ms</bdi></small></h2>
          {solutions.length ? (
            <div className="tm-solution-grid">
              {solutions.map(solution => (
                <article key={solution.id} className={`tm-solution ${solution.best ? "is-best" : ""} ${chosen?.id === solution.id ? "is-chosen" : ""}`}>
                  <header>
                    <span className="tm-solution-icon"><Ico n={PHILOSOPHY_ICON[solution.philosophy] || "idea"} /></span>
                    <b>{solution.title}</b>
                    {solution.best ? <span className="tm-star" title="الأفضل"><Ico n="best" label="الأفضل" /></span> : null}
                    <LevelDot level={solution.delta.level} />
                  </header>
                  <ul className="tm-solution-facts">
                    <li title="تغييرات"><Ico n="changes" /><b>{solution.changes.length}</b></li>
                    <li title="أساتذة متأثرون"><Ico n="teachers" /><b>{solution.delta.teachersAffected.length}</b></li>
                    <li title="طلبة متأثرون (رادار)"><Ico n="students" /><b>{solution.delta.studentsMoved ?? "—"}</b></li>
                    <li title="تعارضات باقية" className={solution.delta.after.blocking ? "is-warn" : ""}><Ico n="conflicts" /><b>{solution.delta.after.blocking}</b>
                      {/* الحلّ لا يُعرض أصلاً إن زاد الموانع؛ فما يبقى منها كان قبله. */}
                      {solution.delta.after.blocking ? <small className="tm-preexisting" title="موجودة في الجدول قبل الحل؛ لم يُدخلها هذا الحل">سابقة</small> : null}</li>
                  </ul>
                  <p className="tm-why"><b>لماذا؟</b> {solution.why.join(" · ")}{solution.satisfied ? "" : " · يحلّ جزءاً"}</p>
                  <footer>
                    <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-secondary" onClick={() => { setChosen(solution); setScenario(null); }}>جرّبه</button>
                    <label className="tm-compare-pick"><input data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="checkbox" checked={comparing.has(solution.id)} onChange={() => setComparing(set => { const next = new Set(set); if (next.has(solution.id)) next.delete(solution.id); else next.add(solution.id); return next; })} /><Scale aria-hidden="true" />قارن</label>
                  </footer>
                </article>
              ))}
            </div>
          ) : <p className="tm-note">لا حلّ آمن بلا تعارض جديد — جرّب المختبر</p>}
        </section>
      ) : null}

      {comparison ? (
        <section className="tm-compare" aria-label="مقارنة السيناريوهات">
          <h3><Scale aria-hidden="true" />مقارنة</h3>
          <div className="tm-compare-scroll">
            <table>
              <thead><tr><th />{comparison.list.map((item, index) => <th key={item.id}><span className="tm-th"><Ico n={PHILOSOPHY_ICON[item.philosophy] || "idea"} />{item.title}{index === comparison.table.bestIndex ? <Ico n="best" label="الأفضل" className="tm-star" /> : null}</span></th>)}</tr></thead>
              <tbody>
                {comparison.table.rows.map(row => (
                  <tr key={row.key}><th><span className="tm-th"><Ico n={COMPARE_ICON[row.key] || "idea"} />{row.label}</span></th>
                    {row.values.map((value, index) => <td key={index} className={index === row.best ? "is-best" : ""}>{value}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {mode !== "lab" && chosen ? (
        <>
          <ScenarioWorkbench context={context} changes={chosen.changes} mode={problem ? (mode === "goal" ? "goal" : "emergency") : (scenario?.mode || "lab")}
            problem={problemLabel || scenario?.problem} scenario={scenario} onScenario={onScenario}
            defaultName={problemLabel || chosen.title} onDiscard={() => { setChosen(null); setScenario(null); }} onApplied={() => { reload(); void loadSaved(); }} />
        </>
      ) : null}

      <SavedScenarios list={saved} context={context} onOpen={record => { setMode("emergency"); openSaved(record); }} />
    </div>
  );
}

function SavedScenarios({ list, context, onOpen }: { list: TmScenarioRecord[]; context: LoadedContext; onOpen: (record: TmScenarioRecord) => void }) {
  if (!list.length) return null;
  return (
    <section className="tm-saved" aria-label="السيناريوهات المحفوظة">
      <h3><Puzzle aria-hidden="true" />سيناريوهات محفوظة</h3>
      <ul>
        {list.map(record => {
          const drift = record.status === "draft" ? driftOf(context.rows, record.base).length : 0;
          return (
            <li key={record.id}>
              <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" onClick={() => onOpen(record)}>
                <Ico n={record.status === "applied" ? "applied" : record.status === "restored" ? "restored" : record.mode === "emergency" ? "emergency" : record.mode === "goal" ? "goal" : "lab"} />
                <b>{record.name}</b>
                <small>{countOf(record.changes.length, AR.change)} · {record.createdBy}</small>
                {record.shared ? <em title="مشارَك للعرض"><Ico n="shared" label="مشارَك للعرض" /></em> : null}
                {drift ? <em className="tm-drift" title="تغيّر الجدول الحيّ بعده"><Ico n="conflicts" />{drift}</em> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
