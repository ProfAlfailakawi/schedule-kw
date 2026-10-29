/**
 * ── ⏳ آلة الزمن ──
 * سيناريوهاتٌ فوق الجدول الحيّ كفروع git: لا شيء يُكتب حتى «اعتمد الكل».
 *   🚨 طوارئ: جملةٌ ← ثلاثة حلولٍ مرتّبة في ثوانٍ.
 *   🧪 مختبر: تعديلٌ حرّ على الشعب بأثرٍ حيّ (محاكي الشعب).
 *   🎯 هدف: «صفّر الخميس»، «قلّل الفجوات»، «وفّر قاعتين».
 * ثم مقارنةٌ جنباً إلى جنب، وحفظٌ ونسخٌ ومشاركةٌ للعرض، وتنبيهُ انحراف.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CircleCheck, FlaskConical, Hourglass, Layers, PencilLine, Puzzle, Scale, Siren, Sparkles, Target, X } from "lucide-react";
import {
  boardOf, compareScenarios, describeProblem, driftOf, parseProblem, solveProblem,
  type TmProblem, type TmScenarioRecord, type TmSolution,
} from "../utils/timeMachine";
import ScenarioWorkbench from "./ScenarioWorkbench";
import { AR, countOf } from "../utils/arabicCount";
import { SectionSimulatorBody } from "./SectionSimulator";
import { COMPARE_ICON, Ico, LevelDot, Loading, PHILOSOPHY_ICON, scopeQuery, type IcoName, useTimeMachineContext, type LoadedContext } from "./timeMachineShared";
import { takeTimeMachineAsk } from "../utils/timeMachineLink";
import { readSharedScope, writeSharedScope } from "../utils/sharedScope";
import { safeStorage } from "../utils/safeStorage";

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

interface ScopeOptions { colleges: Array<{ id: number; name: string }>; sections: Array<{ id: number; collegeId: number; name: string }> }
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ar");

/**
 * ── الكلية والقسم صراحةً ──
 * كانت آلة الزمن تفتح على النطاق المحفوظ من شاشةٍ أخرى بلا منتقٍ، فلا يعرف القارئ
 * كيف يبدّل القسم. المنتقيان هنا في رأس الصفحة، دائماً، حتى في الانتظار والخطأ،
 * ويكتبان النطاق المشترك لأن القارئ اختاره بيده.
 */
export default function TimeMachine() {
  const [picked, setPicked] = useState(() => readSharedScope());
  const { context, error, reload } = useTimeMachineContext(picked.sectionId ? picked : undefined);
  const [options, setOptions] = useState<ScopeOptions | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/time-machine/scopes", { credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (alive) setOptions(body && Array.isArray(body.sections) ? body : { colleges: [], sections: [] }); })
      .catch(() => { if (alive) setOptions({ colleges: [], sections: [] }); });
    return () => { alive = false; };
  }, []);
  const collegeId = picked.collegeId || context?.scope.collegeId || 0;
  const sectionId = picked.sectionId || context?.scope.sectionId || 0;
  const choose = (patch: { collegeId: number; sectionId: number }) => {
    writeSharedScope(patch, { source: "time-machine" });
    setPicked(current => ({ ...current, ...patch }));
  };
  const pickCollege = (id: number) => {
    const first = (options?.sections || []).filter(section => section.collegeId === id).sort(byName)[0];
    choose({ collegeId: id, sectionId: first?.id || 0 });
  };
  const colleges = [...(options?.colleges || [])].sort(byName);
  const sections = (options?.sections || []).filter(section => section.collegeId === collegeId).sort(byName);
  const scopeKey = context ? `${context.scope.collegeId}:${context.scope.sectionId}:${context.scope.termId}` : "";
  return (
    <div className="tm-page">
      <header className="tm-hero">
        <span className="tm-hero-mark" aria-hidden="true"><Hourglass /></span>
        <div className="tm-hero-copy">
          <h1>آلة الزمن</h1>
          {context ? <p><bdi>{context.scope.termName}</bdi> · {countOf(context.rows.length, AR.appointment)}</p> : null}
        </div>
        <span className="tm-branch" title="لا شيء يُكتب في الجدول حتى الاعتماد"><Ico n="branch" />فرعٌ افتراضي</span>
        <div className="tm-scope" role="group" aria-label="الكلية والقسم">
          <label className="tm-scope-pick">
            <Building2 aria-hidden="true" />
            <span className="sr-only">الكلية</span>
            <select data-guide-ignore="يختار كلية آلة الزمن؛ لا يكتب في الجدول" value={collegeId || ""} disabled={colleges.length < 2}
              onChange={event => pickCollege(Number(event.target.value))} aria-label="الكلية">
              {!colleges.some(college => college.id === collegeId) ? <option value={collegeId || ""}>{options ? "اختر الكلية" : "…"}</option> : null}
              {colleges.map(college => <option key={college.id} value={college.id}>{college.name}</option>)}
            </select>
          </label>
          <label className="tm-scope-pick">
            <Layers aria-hidden="true" />
            <span className="sr-only">القسم</span>
            <select data-guide-ignore="يختار قسم آلة الزمن؛ لا يكتب في الجدول" value={sectionId || ""} disabled={sections.length < 2 && sections.some(section => section.id === sectionId)}
              onChange={event => choose({ collegeId, sectionId: Number(event.target.value) })} aria-label="القسم">
              {!sections.some(section => section.id === sectionId) ? <option value={sectionId || ""}>{context?.scope.sectionName || (options ? "اختر القسم" : "…")}</option> : null}
              {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
        </div>
      </header>
      {error ? <p className="tm-note" role="alert">{error}</p>
        : !context ? <Loading />
        : <TimeMachineBody key={scopeKey} context={context} reload={reload} />}
    </div>
  );
}

/* ── ثلاثُ خطوات بأيقونات: تشرح أول مرة، ثم تبقى مؤشّراً لمكان القارئ. ── */
const INTRO_KEY = "tm-intro-seen-v1";
const STEPS: Array<{ icon: React.ReactNode; title: string; hint: string }> = [
  { icon: <PencilLine />, title: "اكتب المشكلة", hint: "جملةٌ قصيرة، أو هدف، أو تعديلٌ حرّ في المختبر" },
  { icon: <Scale />, title: "قارن الحلول", hint: "ثلاثة حلول بأثرها قبل وبعد — على نسخةٍ افتراضية" },
  { icon: <CircleCheck />, title: "اعتمد", hint: "ترى قبلها ما يتغيّر ومن يُبلَّغ، والتراجع بنقرة" },
];
function TmSteps({ step }: { step: 1 | 2 | 3 }) {
  const [firstRun, setFirstRun] = useState(() => !safeStorage.get(INTRO_KEY));
  const dismiss = () => { safeStorage.set(INTRO_KEY, "1"); setFirstRun(false); };
  return (
    <ol className={`tm-steps ${firstRun ? "is-intro" : ""}`} aria-label="خطوات آلة الزمن">
      {STEPS.map((item, index) => {
        const n = index + 1;
        const state = n < step ? "done" : n === step ? "now" : "next";
        return (
          <li key={item.title} className={`tm-step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="tm-step-ico" aria-hidden="true">{state === "done" ? <CircleCheck /> : item.icon}</span>
            <span className="tm-step-copy"><b><i>{n}</i>{item.title}</b>{firstRun ? <small>{item.hint}</small> : null}</span>
          </li>
        );
      })}
      {firstRun ? <li className="tm-step-close"><button type="button" onClick={dismiss} aria-label="فهمت، أخفِ الشرح" data-guide-ignore="يخفي شرح الخطوات فقط"><X aria-hidden="true" /></button></li> : null}
    </ol>
  );
}

function TimeMachineBody({ context, reload }: { key?: string; context: LoadedContext; reload: () => void }) {
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
  const [labBasket, setLabBasket] = useState(0);
  const base = useMemo(() => boardOf(context), [context]);
  /* «جرّبه» يرسم الأثر أسفل الصفحة: ننتقل إليه فوراً، فلا يضغط القارئ ولا يرى شيئاً. */
  const benchRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chosen) return;
    const frame = requestAnimationFrame(() => benchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [chosen?.id]);
  const solutionsRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!problem || chosen) return;
    const frame = requestAnimationFrame(() => solutionsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [problem]);

  const loadSaved = () => fetch(`/api/time-machine/scenarios?${scopeQuery(context)}`, { credentials: "include" })
    .then(r => r.json()).then(body => setSaved(Array.isArray(body?.scenarios) ? body.scenarios : [])).catch(() => setSaved([]));
  useEffect(() => { void loadSaved(); }, [context]);
  /* جملةٌ جاءت من شاشةٍ أخرى (التنبؤ، التخطيط): تُكتب في خانة الطوارئ وتُحلّ فوراً، مرّةً واحدة. */
  useEffect(() => {
    const ask = takeTimeMachineAsk();
    if (!ask) return;
    setMode("emergency"); setText(ask); run(parseProblem(ask, context));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const step: 1 | 2 | 3 = mode === "lab" ? (labBasket ? 2 : 1) : chosen ? 3 : problem ? 2 : 1;

  return (
    <>
      <TmSteps step={step} />

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

      {mode === "lab" ? <SectionSimulatorBody context={context} reload={reload} onBasket={setLabBasket} /> : null}

      {mode !== "lab" && problem ? (
        <section className="tm-solutions" aria-label="حلول جاهزة" ref={solutionsRef}>
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
        <div ref={benchRef} className="tm-bench-anchor">
          <ScenarioWorkbench context={context} changes={chosen.changes} mode={problem ? (mode === "goal" ? "goal" : "emergency") : (scenario?.mode || "lab")}
            problem={problemLabel || scenario?.problem} scenario={scenario} onScenario={onScenario}
            defaultName={problemLabel || chosen.title} onDiscard={() => { setChosen(null); setScenario(null); }} onApplied={() => { reload(); void loadSaved(); }} />
        </div>
      ) : null}

      <SavedScenarios list={saved} context={context} onOpen={record => { setMode("emergency"); openSaved(record); }} />
    </>
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
