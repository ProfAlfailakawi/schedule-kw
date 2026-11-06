/**
 * ── المرشد ──
 *
 * من الخارج: سؤال واحد وجواب قصير و«أرني». ومن الداخل كل ما يلزم ليكون الجواب
 * صحيحاً لهذا الشخص في هذه اللحظة: فهم محلي بلا خادم ولا تكلفة، وصلاحيات من
 * المسند نفسه، ووعي بالموقف. الميزات الثانوية كلها خلف «المزيد».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ChevronLeft, Hand, X } from "lucide-react";
import { controlLabel } from "../../utils/controlLabel";
import { isPhoneDevice } from "../../utils/workspaceSize";
import { telemetryGuide, telemetryGuideJourney } from "../../utils/clientTelemetry";
import { sessionTrail } from "../../guide/sessionTrail";
import {
  type GuideFeature, allAllowedGuideFeatures, canAccessGuideFeature, featureById, guideUnreadSummary, loadGuideProfile,
  markAllGuideProductUpdatesSeen, markFeatureSeen, rankChangedFeatures, recordFeatureEvent, setGuideTask, setHintMode,
} from "../../guide/smartGuide";
import { GUIDE_BANK } from "../../guide/bank";
import { buildIndex, maskUnknownWords, understand, type Understood } from "../../guide/brain/engine";
import { anonymizeQuestion, finishedTours, greetingFor, loadTourProgress, readSituation, saveTourProgress, situationAnswer, suggestFor, unfinishedTour, type SituationAnswer } from "../../guide/awareness";
import { buildTour, type TourStepSpec } from "../../guide/tour/tours";
import { TourRunner, type TourSnapshot } from "../../guide/tour/runner";
import GuideTour from "./GuideTour";
import "../../styles/45-guide.css";

type Hint = { key?: string; featureId?: string; title: string; detail?: string; level?: "soft" | "strong" };
type Props = {
  open: boolean; onClose: () => void; activeView: string; user: any; permissions: number[]; root: boolean;
  hint: Hint | null; onDismissHint: () => void; context: any; onNavigate: (view: string) => void;
};
type Screen = "ask" | "more" | "all" | "new" | "unanswered";
const INDEX = buildIndex(Object.entries(GUIDE_BANK).map(([id, entry]) => {
  const feature = featureById(id);
  return { id, title: feature?.title || id, view: feature?.view, ask: entry.q.split("|") };
}));
const NOW_QUESTION = /وين كنت|وين وقفت|اين توقفت|اين كنت|ماذا الان|ماذا الآن|شنو الحين|شسوي الحين|what now|الخطوه التاليه/;
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function visible(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return box.width > 1 && box.height > 1 && getComputedStyle(element).visibility !== "hidden";
}
function findStep(step: TourStepSpec): HTMLElement | null {
  const query = step.target ? `[data-guide-target="${step.target}"],[data-guide-feature-id="${step.target}"]` : step.selector;
  if (!query) return null;
  return [...document.querySelectorAll<HTMLElement>(query)].find(visible) || null;
}
function revealSidebar(step: TourStepSpec) {
  const item = document.querySelector<HTMLElement>(`[data-guide-target="${step.target}"]`);
  if (!item) return;
  const drawer = document.querySelector<HTMLElement>(".mobile-dock-more");
  if (drawer && visible(drawer) && drawer.getAttribute("aria-expanded") !== "true") drawer.click();
  const fold = item.closest(".nav-section")?.querySelector<HTMLElement>(".nav-section-title");
  if (fold?.getAttribute("aria-expanded") === "false") fold.click();
}

const SuggestionRow: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => {
  return <button type="button" className="guide-row" onClick={onClick}><span>{label}</span><ChevronLeft aria-hidden="true" /></button>;
}

export default function GuideAssistant({ open, onClose, activeView, user, permissions, root, hint, onDismissHint, context, onNavigate }: Props) {
  const userId = Number(user?.SystemUserId || 0);
  const admin = Boolean(root || user?.IsAdminUser);
  const session = useMemo(() => ({ permissions, root, admin }), [permissions, root, admin]);
  const allowedList = useMemo(() => allAllowedGuideFeatures(permissions, root, admin), [permissions, root, admin]);
  const allowed = useMemo(() => new Map(allowedList.map(feature => [feature.id, feature])), [allowedList]);
  const allowedIds = useMemo(() => new Set(allowed.keys()), [allowed]);

  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [screen, setScreen] = useState<Screen>("ask");
  const [picked, setPicked] = useState<string | null>(null);
  const [pointing, setPointing] = useState(false);
  const [nowAsked, setNowAsked] = useState(false);
  const [profile, setProfile] = useState(() => loadGuideProfile(userId));
  const [progress, setProgress] = useState(() => loadTourProgress(userId));
  const [unanswered, setUnanswered] = useState<Array<{ text: string; count: number }>>([]);
  const [tourView, setTourView] = useState<{ state: TourSnapshot; element: HTMLElement | null } | null>(null);
  const [tourMeta, setTourMeta] = useState<{ feature: GuideFeature; note?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const logged = useRef(new Set<string>());
  const situationRefs = useRef({ selected: 0 });
  situationRefs.current.selected = Number(context?.selected?.id || 0);
  const metaRef = useRef(tourMeta); metaRef.current = tourMeta;
  const navigateRef = useRef(onNavigate); navigateRef.current = onNavigate;
  const closeRef = useRef(onClose); closeRef.current = onClose;

  const situation = useMemo(() => readSituation(activeView, context, sessionTrail(), { query: selector => document.querySelector(selector) }),
    // يُعاد الحساب عند كل فتح وتغير سياق، لا عند كل حرف.
    [activeView, context, open, tourView === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const fix: SituationAnswer | null = useMemo(() => situationAnswer(situation), [situation]);
  const finished = useMemo(() => finishedTours(progress), [progress]);
  const suggestions = useMemo(() => suggestFor(situation, allowed, profile, finished), [situation, allowed, profile, finished]);
  const resume = useMemo(() => {
    const row = unfinishedTour(progress);
    return row && allowed.has(row.featureId) ? { ...row, feature: allowed.get(row.featureId)! } : null;
  }, [progress, allowed]);
  const unread = useMemo(() => rankChangedFeatures(profile, guideUnreadSummary(profile, allowedList, activeView).product), [profile, allowedList, activeView]);

  const runner = useMemo(() => new TourRunner<HTMLElement>({
    find: findStep,
    command: step => { if (step.command) window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail: step.command })); },
    reveal: revealSidebar,
    navigate: view => navigateRef.current(view),
    bring: element => element.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center", inline: "nearest" }),
    press: element => element.click(),
    selection: () => situationRefs.current.selected,
    later: (fn, ms) => window.setTimeout(fn, ms),
    cancel: handle => window.clearTimeout(handle as number),
    onChange: (state, element) => setTourView(state.status === "done" ? null : { state, element }),
    onProgress: (index, step) => {
      const meta = metaRef.current;
      if (!meta) return;
      saveTourProgress(userId, meta.feature.id, { step: index, total: 99 });
      setGuideTask(userId, { id: `tour:${meta.feature.id}`, title: `إرشاد: ${meta.feature.title}`, featureId: meta.feature.id, target: step.target, startedAt: Date.now(), updatedAt: Date.now(), step: index });
    },
    onFinish: (completed, index) => {
      const meta = metaRef.current;
      if (meta) {
        const total = runner.snapshot().total;
        saveTourProgress(userId, meta.feature.id, { step: index, total, done: completed });
        setGuideTask(userId, undefined);
        telemetryGuideJourney({ featureId: meta.feature.id, step: "tour", outcome: completed ? "helped" : "abandoned" });
      }
      setProgress(loadTourProgress(userId));
      setTourMeta(null);
      closeRef.current();
    },
  }), [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (runner.status !== "done") runner.stop(); }, [runner]);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setProfile(loadGuideProfile(userId));
    setProgress(loadTourProgress(userId));
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
    return () => { const previous = returnFocus.current; window.setTimeout(() => previous?.focus?.(), 0); };
  }, [open, userId]);
  useEffect(() => { if (hint?.featureId && allowed.has(hint.featureId)) setPicked(hint.featureId); }, [hint?.featureId, allowed]);

  const understood: Understood[] = useMemo(() => {
    const text = query.trim();
    return text.length >= 2 ? understand(INDEX, text, allowedIds, { view: activeView, recentFeatureIds: situation.recent, boostFeatureIds: fix?.featureId ? [fix.featureId] : [] }) : [];
  }, [query, allowedIds, activeView, situation.recent, fix?.featureId]);
  const asksNow = NOW_QUESTION.test(query.replace(/[أإآ]/g, "ا"));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    setSubmitted(text);
    if (!text) return;
    if (asksNow) return;
    understood.filter(item => item.kind === "unsure").forEach(item => {
      const masked = maskUnknownWords(INDEX, anonymizeQuestion(item.query));
      if (!masked || logged.current.has(masked) || logged.current.size >= 5) return;
      logged.current.add(masked);
      const closest = item.kind === "unsure" ? item.closest[0] || "" : "";
      telemetryGuide(`unanswered|${masked.replace(/[|\n\r]/g, " ")}|${closest}`);
    });
  };

  const showTour = useCallback((feature: GuideFeature) => {
    if (!canAccessGuideFeature(feature, session)) return;
    const env = {
      activeView, scheduleView: situation.scheduleView, selectedId: Number(context?.selected?.id || 0),
      selectedCourse: "", phone: isPhone(), phoneReadOnly: isPhoneDevice(),
    };
    const plan = buildTour(feature, env);
    const row = unfinishedTour(loadTourProgress(userId), feature.id);
    const at = row && plan.steps[0]?.id !== "nav" ? Math.min(row.step, plan.steps.length - 1) : 0;
    const steps: TourStepSpec[] = plan.steps.length ? plan.steps : [{ id: "note", selector: ".content-frame", text: plan.note || feature.summary }];
    if (plan.note && plan.steps.length) steps.push({ id: "note", selector: ".content-frame", text: plan.note });
    recordFeatureEvent(userId, feature.id, "helped");
    markFeatureSeen(userId, feature.id);
    telemetryGuideJourney({ featureId: feature.id, version: feature.version, step: "guide", outcome: "helped" });
    if (hint) onDismissHint();
    setTourMeta({ feature, note: plan.note });
    metaRef.current = { feature, note: plan.note };
    runner.start(steps, at);
  }, [activeView, context?.selected?.id, hint, onDismissHint, runner, session, situation.scheduleView, userId]);

  const openFeature = (feature: GuideFeature) => { setPicked(feature.id); setScreen("ask"); setQuery(""); setSubmitted(""); };
  const tryIt = (feature: GuideFeature) => {
    if (!feature.simulationAction) return;
    try {
      sessionStorage.setItem("schedule-guide-simulation", JSON.stringify({ task: feature.simulationAction.task || "scenario", selectedId: Number(context?.selected?.id || 0), collegeId: Number(context?.collegeId || 0), sectionId: Number(context?.sectionId || 0), termId: Number(context?.termId || 0), createdAt: Date.now() }));
    } catch { /* التخزين غائب */ }
    onNavigate(String(feature.simulationAction.value || "intelligence"));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail: { scope: "intelligence", type: "scene", value: "try", task: feature.simulationAction?.task, featureId: feature.id } })), 500);
    onClose();
  };

  // ── أشّر لي: تحديد عنصر بلا تنفيذه؛ الالتقاط قبل أن يصل الضغط إلى الشاشة.
  useEffect(() => {
    if (!pointing) return;
    document.body.classList.add("guide-point-mode");
    const pick = (event: PointerEvent) => {
      const raw = event.target instanceof HTMLElement ? event.target : null;
      if (!raw || raw.closest(".guide-panel,.guide-point-bar") || raw.closest("[data-guide-ignore]")) return;
      const carrier = raw.closest<HTMLElement>("[data-guide-feature-id],[data-guide-target],button,a,[role='button'],select,input,textarea,[data-row-id],[tabindex]:not([tabindex='-1'])");
      if (!carrier) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      const owner = carrier.closest<HTMLElement>("[data-guide-feature-id],[data-guide-target]");
      const id = owner?.getAttribute("data-guide-feature-id") || owner?.getAttribute("data-guide-target") || "";
      const known = allowed.get(id);
      setPointing(false);
      if (known) { openFeature(known); return; }
      const label = controlLabel(carrier, 72);
      setQuery(label); setSubmitted(label); setPicked(null); setScreen("ask");
    };
    const swallow = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
    window.addEventListener("pointerdown", pick, true);
    return () => { document.body.classList.remove("guide-point-mode"); window.removeEventListener("pointerdown", pick, true); };
  }, [pointing, allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (screen !== "unanswered" || !root || !context?.collegeId || !context?.sectionId) return;
    let alive = true;
    fetch(`/api/intelligence/guide-friction?${new URLSearchParams({ collegeId: String(context.collegeId), sectionId: String(context.sectionId) })}`, { credentials: "include" })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (alive) setUnanswered(Array.isArray(data?.unanswered) ? data.unanswered : []); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [screen, root, context?.collegeId, context?.sectionId]);

  useEffect(() => {
    if (!open || tourView || pointing) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tourView, pointing, onClose]);

  const answerCard = (feature: GuideFeature, key: string, primary: boolean) => {
    const entry = GUIDE_BANK[feature.id];
    const row = unfinishedTour(progress, feature.id);
    return (
      <article className="guide-answer" key={key}>
        <h3>{feature.title}</h3>
        <ol>{(entry?.s || [feature.summary]).map(step => <li key={step}>{step}</li>)}</ol>
        {finished.has(feature.id) ? <p className="guide-quiet-line">أنهيت هذه الجولة مؤخراً.</p> : null}
        <div className="guide-answer-actions">
          <button type="button" className={primary ? "guide-primary" : "guide-secondary"} onClick={() => showTour(feature)}>{row ? `أكمل من الخطوة ${row.step + 1}` : "أرني"}</button>
          {feature.simulationAction ? <button type="button" className="guide-link" onClick={() => tryIt(feature)}>جرّب دون حفظ</button> : null}
        </div>
      </article>
    );
  };
  const fixCard = (item: SituationAnswer) => {
    const feature = item.featureId ? allowed.get(item.featureId) : undefined;
    return (
      <article className="guide-answer is-situation" key={item.key}>
        <h3>{item.title}</h3>
        <ol>{item.steps.map(step => <li key={step}>{step}</li>)}</ol>
        {feature && !situation.importState ? <div className="guide-answer-actions"><button type="button" className="guide-primary" onClick={() => showTour(feature)}>أرني</button></div> : null}
      </article>
    );
  };
  const nowCard = () => {
    if (fix) return fixCard(fix);
    if (resume) return answerCard(resume.feature, "resume", true);
    if (suggestions[0]) return <>{<p className="guide-quiet-line">لا شيء معلق. الأقرب لموقفك الآن:</p>}{answerCard(suggestions[0], "now", true)}</>;
    return <p className="guide-quiet-line">لا شيء معلق الآن.</p>;
  };
  const answers = understood.map((item, index) => {
    const primary = index === 0;
    if (item.kind === "answer") { const feature = allowed.get(item.id); return feature ? answerCard(feature, `${item.id}-${index}`, primary) : null; }
    if (item.kind === "live") {
      const feature = item.ids[0] ? allowed.get(item.ids[0]) : undefined;
      return <article className="guide-answer" key={`live-${index}`}>
        <h3>هذا سؤال عن بيانات حية</h3>
        <p>لا أقرأ بيانات الجدول؛ أعلّم استخدام البرنامج فقط.{feature ? ` تجد الجواب في «${feature.title}».` : ""}</p>
        {feature ? <div className="guide-answer-actions"><button type="button" className="guide-primary" onClick={() => showTour(feature)}>أرني أين</button></div> : null}
      </article>;
    }
    const closest = item.closest.map(id => allowed.get(id)).filter(Boolean) as GuideFeature[];
    return <article className="guide-answer is-unsure" key={`unsure-${index}`}>
      <p>{closest.length ? "لست متأكداً مما تقصد. الأقرب:" : "لا أعرف جواباً لهذا؛ أجيب عن استخدام البرنامج."}</p>
      {closest.map(feature => <SuggestionRow key={feature.id} label={feature.title} onClick={() => openFeature(feature)} />)}
    </article>;
  });

  const pickedFeature = picked ? allowed.get(picked) : undefined;
  if (!open) return null;
  if (tourView && tourMeta) {
    const entry = GUIDE_BANK[tourMeta.feature.id];
    return <GuideTour state={tourView.state} element={tourView.element} title={tourMeta.feature.title} when={entry?.w} note={tourMeta.note}
      onNext={() => runner.next()} onBack={() => runner.back()} onStop={() => runner.stop()} onRetry={() => runner.retry()} onSkipStep={() => runner.skipStep()} onLost={() => runner.relocate()} />;
  }
  if (pointing) return createPortal(
    <div className="guide-point-bar no-print" role="status" data-guide-ignore="شريط أشّر لي">
      <Hand aria-hidden="true" /><span>اضغط أي عنصر لأشرحه؛ لن يُنفَّذ.</span>
      <button type="button" onClick={() => setPointing(false)}>إلغاء</button>
    </div>, document.body);

  const asking = Boolean(query.trim());
  return createPortal(
    <>
      <div className="guide-scrim no-print" onPointerDown={onClose} aria-hidden="true" />
      <section className="guide-panel no-print" role="dialog" aria-modal="false" aria-label="المرشد" data-guide-ignore="لوحة المرشد نفسها">
        <header className="guide-head">
          {screen !== "ask" ? <button type="button" className="guide-icon" aria-label="رجوع" onClick={() => setScreen(screen === "more" ? "ask" : "more")}><ChevronLeft style={{ transform: "scaleX(-1)" }} aria-hidden="true" /></button> : null}
          <p>{screen === "ask" ? (hint?.title || greetingFor(situation)) : screen === "more" ? "المزيد" : screen === "all" ? "كل ما يمكنني شرحه" : screen === "new" ? "الجديد" : "أسئلة بلا جواب"}</p>
          <button type="button" className="guide-icon" aria-label="إغلاق المرشد" onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <div className="guide-body">
          {screen === "ask" ? <>
            <form className="guide-ask" onSubmit={submit} role="search">
              <input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setPicked(null); setSubmitted(""); }} placeholder="كيف أنقل مقرراً إلى قاعة أخرى؟" aria-label="اكتب سؤالك" dir="auto" enterKeyHint="send" autoComplete="off" />
              <button type="submit" aria-label="اسأل" disabled={!query.trim()}><ArrowUp aria-hidden="true" /></button>
            </form>
            <div className="guide-output" aria-live="polite">
              {asksNow ? nowCard() : asking ? answers : pickedFeature ? answerCard(pickedFeature, "picked", true) : <>
                {fix ? fixCard(fix) : null}
                {resume && !fix ? <SuggestionRow label={`أكمل «${resume.feature.title}»`} onClick={() => openFeature(resume.feature)} /> : null}
                {suggestions.slice(0, fix || resume ? 2 : 3).map(feature => <SuggestionRow key={feature.id} label={feature.title} onClick={() => openFeature(feature)} />)}
              </>}
            </div>
            <button type="button" className="guide-more" onClick={() => setScreen("more")}>المزيد{unread.length ? <i aria-label="يوجد جديد" /> : null}</button>
          </> : null}

          {screen === "more" ? <div className="guide-list">
            <SuggestionRow label="أشّر لي" onClick={() => { setScreen("ask"); setPointing(true); }} />
            <SuggestionRow label="ماذا الآن؟" onClick={() => { setScreen("ask"); setQuery("ماذا الآن"); setNowAsked(!nowAsked); }} />
            <SuggestionRow label={unread.length ? `الجديد (${unread.length.toLocaleString("ar-KW-u-nu-latn")})` : "الجديد"} onClick={() => setScreen("new")} />
            <SuggestionRow label="الكل" onClick={() => setScreen("all")} />
            {allowed.has("schedule.practice") ? <SuggestionRow label="جرّب دون حفظ" onClick={() => openFeature(allowed.get("schedule.practice")!)} /> : null}
            {root ? <SuggestionRow label="أسئلة بلا جواب" onClick={() => setScreen("unanswered")} /> : null}
            <label className="guide-toggle"><input type="checkbox" checked={profile.hintMode !== "off"} onChange={event => { setHintMode(userId, event.target.checked ? "auto" : "off"); setProfile(loadGuideProfile(userId)); }} /><span>تلميحات أثناء العمل</span></label>
          </div> : null}

          {screen === "all" ? <div className="guide-list">
            {[...new Set(allowedList.map(feature => feature.group))].map(group => (
              <details key={group}><summary>{group}</summary>
                {allowedList.filter(feature => feature.group === group).map(feature => <SuggestionRow key={feature.id} label={feature.title} onClick={() => openFeature(feature)} />)}
              </details>
            ))}
          </div> : null}

          {screen === "new" ? <div className="guide-list">
            {unread.length ? unread.slice(0, 12).map(feature => <SuggestionRow key={feature.id} label={feature.title} onClick={() => openFeature(feature)} />) : <p className="guide-quiet-line">لا جديد لم تطّلع عليه.</p>}
            {unread.length ? <button type="button" className="guide-link" onClick={() => { markAllGuideProductUpdatesSeen(userId, allowedList); setProfile(loadGuideProfile(userId)); }}>تعليم الكل كمقروء</button> : null}
          </div> : null}

          {screen === "unanswered" ? <div className="guide-list">
            {unanswered.length ? unanswered.map(row => <p className="guide-unanswered" key={row.text}><span>{row.text}</span><b>{row.count.toLocaleString("ar-KW-u-nu-latn")}</b></p>) : <p className="guide-quiet-line">لا أسئلة مسجلة لهذا القسم.</p>}
            <p className="guide-quiet-line">مجهولة الهوية، وتُطمس كل كلمة خارج مفردات البرنامج.</p>
          </div> : null}
        </div>
      </section>
    </>, document.body);
}
