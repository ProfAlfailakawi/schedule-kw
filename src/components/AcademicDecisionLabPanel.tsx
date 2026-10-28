import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight, BrainCircuit, CalendarClock, CheckCheck, ChevronDown,
  GitBranch, GraduationCap, Info, RefreshCw, Scale, ShieldCheck, Sparkles, Users
} from "lucide-react";
import type { AcademicDecisionLab, AcademicDecisionScenario } from "../utils/academicDecisionLab";
import { buildAcademicDecisionLabTrainingPreview } from "../utils/academicDecisionLabDemo";
import { AR, countOf } from "../utils/arabicCount";

type Props = {
  lab?: AcademicDecisionLab; courseId?: number; compact?: boolean;
  demo: boolean; onRefresh: () => void; refreshing: boolean;
};
const readableDays: Record<string, string> = {
  fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء",
  fwednesday: "أربعاء", fthursday: "خميس",
};
const n = (value: number) => Number(value).toLocaleString("ar-KW-u-nu-latn");
const percent = (value: number, total: number) => Math.max(0, Math.min(100, value / Math.max(1, total) * 100));
const features = [
  { id: "twin", title: "التوأم الأكاديمي", hint: "جدول الطالب الكامل", icon: BrainCircuit },
  { id: "whatif", title: "قبل / بعد", hint: "جرّب الموعد", icon: ArrowLeftRight },
  { id: "domino", title: "تأثير الدومينو", hint: "سلسلة التحسين", icon: GitBranch },
  { id: "rescue", title: "إنقاذ المسار", hint: "مقررات مؤثرة", icon: GraduationCap },
  { id: "balance", title: "التوازن العادل", hint: "الأستاذ والموارد", icon: Scale },
  { id: "trust", title: "الثقة والتفسير", hint: "لماذا هذه النتيجة؟", icon: ShieldCheck },
] as const;
type Feature = typeof features[number]["id"];
const meter = (label: string, value: number, assessed: number, kind: "base" | "gain") =>
  <div className="adl-meter" aria-label={label + " " + n(value) + " / " + n(assessed)}>
    <div className="adl-meter-label"><span>{label}</span><strong>{n(value)} / {n(assessed)}</strong></div>
    <div className="adl-meter-track"><span className={kind === "gain" ? "adl-meter-gain" : ""}
      style={{ width: percent(value, assessed) + "%" }} /></div>
  </div>;
const explain = (items: string[]) => <div className="adl-explain-body">{items.map((item, index) =>
  <p key={index}>{item}</p>)}</div>;

/** Six explicitly discoverable, read-only views; honest when a live calculation has no evidence. */
export default function AcademicDecisionLabPanel({ lab, courseId, compact = false, demo, onRefresh, refreshing }: Props) {
  const [feature, setFeature] = useState<Feature>("whatif");
  const [selected, setSelected] = useState("");
  // The tutorial is calculated from a completely fictional timetable. It
  // never replaces live course recommendations returned by the API.
  const lesson = useMemo(buildAcademicDecisionLabTrainingPreview, []);
  /* The department's own reading first (K1): the tutorial is one click away, not the default. */
  const [viewMode, setViewMode] = useState<"training" | "live">(lab ? "live" : "training");
  const pickedMode = useRef(false);
  useEffect(() => { if (lab && !pickedMode.current) setViewMode("live"); }, [lab]);
  const viewingTraining = viewMode === "training";
  const shownLab = viewingTraining ? lesson : lab;
  const liveWatch = (lab?.graduationWatch || []).filter(w => !courseId || w.courseId === courseId);
  const scenarios = useMemo(() => (shownLab?.scenarios || []).filter(s => viewingTraining || !courseId || s.courseId === courseId), [shownLab, courseId, viewingTraining]);
  const watched = (shownLab?.graduationWatch || []).filter(w => viewingTraining || !courseId || w.courseId === courseId);
  const active: AcademicDecisionScenario | undefined = scenarios.find(s => s.id === selected) || scenarios[0];
  useEffect(() => { setSelected(""); }, [courseId, viewMode, lab?.sampledAt]);
  /* ── لماذا لا نتيجة؟ (K1) ───────────────────────────────────────────────
     The same sentence under four tools told the reader nothing. The funnel is
     the lab's own count of real records at each stage, so the empty state says
     exactly where the evidence stops — and what would make the tool speak. */
  const diagnostics = shownLab?.diagnostics;
  const funnel = diagnostics ? (() => {
    const stages = [
      { key: "profiles", label: "ملفات طلبة القسم", value: diagnostics.profiles, icon: Users },
      { key: "wishes", label: "رغبات لهذا الفصل", value: diagnostics.withWishes, icon: CalendarClock },
      { key: "plan", label: "على صحيفة معتمدة", value: diagnostics.withPlan, icon: GraduationCap },
      { key: "eligible", label: "تركيبة قابلة للفحص", value: diagnostics.eligible, icon: BrainCircuit },
      { key: "tested", label: "مواعيد بديلة جُرّبت", value: diagnostics.timesTested, icon: RefreshCw },
      { key: "found", label: "فرص مؤكّدة", value: scenarios.length, icon: Sparkles },
    ];
    const top = Math.max(1, ...stages.map(stage => stage.value));
    const stop = stages.findIndex((stage, index) => index < 4 ? stage.value < diagnostics.minimum : stage.value === 0);
    const why = stop === 0 ? "لا ملفات طلبة لهذا القسم بعد."
      : stop === 1 ? "لم يسجّل الطلبة رغباتهم لهذا الفصل بعد."
      : stop === 2 ? "الطلبة غير مربوطين بصحيفة معتمدة."
      : stop === 3 ? `أقل من ${countOf(diagnostics.minimum, AR.student)} لديهم مقرران مطروحان مؤهلان أو أكثر.`
      : stop === 4 ? "لم يُجرَّب موعدٌ بديل: لا مقرر يطلبه ثلاثة طلاب مؤهلين أو أكثر."
      : stop === 5 ? (diagnostics.resourceConflicts >= diagnostics.timesTested
          ? `كل بديلٍ مجرَّب يصطدم بأستاذ أو قاعة (${n(diagnostics.resourceConflicts)}).`
          : [
            `لا موعد بديل آمن يزيد من يكتمل جدولهم بـ${countOf(diagnostics.minimum, AR.student)} أو أكثر.`,
            diagnostics.resourceConflicts ? `اصطدم ${n(diagnostics.resourceConflicts)} من ${n(diagnostics.timesTested)} بأستاذ أو قاعة.` : "",
            diagnostics.belowFloor ? `${n(diagnostics.belowFloor)} يفيد أقل من ذلك فلا يُعرض حمايةً للخصوصية.` : "",
          ].filter(Boolean).join(" "))
      : "";
    return <div className="adl-funnel" data-adl-funnel={stop < 0 ? "complete" : stages[stop]?.key}>
      <ol>{stages.map((stage, index) => <li key={stage.key}
        className={index === stop ? "adl-funnel-stop" : stop >= 0 && index > stop ? "adl-funnel-after" : ""}>
        <stage.icon size={14} aria-hidden="true" />
        <span>{stage.label}</span>
        <i aria-hidden="true"><b style={{ width: percent(stage.value, top) + "%" }} /></i>
        <strong>{n(stage.value)}</strong>
      </li>)}</ol>
      {why ? <p><Info size={14} aria-hidden="true" />{why}</p> : null}
    </div>;
  })() : null;
  const noEvidence = <div className="adl-no-evidence-wrap">
    <div className="adl-no-evidence">
      <Info size={19} aria-hidden="true" />
      <div><strong>لا فرصة مؤكّدة لهذا النطاق الآن</strong>
        <small>لا نقترح تغييراً دون أثر محسوب لثلاثة مستفيدين على الأقل.</small></div>
    </div>
    {funnel}
  </div>;
  const watchList = watched.length ? <div className="adl-watch-list">
    {watched.slice(0, compact ? 3 : 6).map(w => <div className="adl-watch-item" key={w.courseId}>
      <GraduationCap size={16} aria-hidden="true" />
      <strong>{w.courseName}</strong>
      <small>{!w.offered ? "غير مطروح" : "مسار لاحق"}
        {w.downstream ? " · يفتح " + countOf(w.downstream, AR.course) + " لاحقة" : ""}
        {" · " + countOf(w.demand, AR.request) + " مؤهلة"}
        {w.nearGraduation ? " · " + countOf(w.nearGraduation, AR.student) + " قرب تخرج تقديري" : ""}
      </small>
    </div>)}
    <small>تنبيه مراجعة أكاديمية فقط؛ لا يتنبأ بموعد التخرج.</small>
  </div> : <div className="adl-no-evidence"><GraduationCap size={18} aria-hidden="true" />
    <div><strong>لا توجد اختناقات مؤهلة</strong><small>ستظهر المقررات المؤثرة حين تدعمها الصحائف والرغبات.</small></div></div>;

  return <section className="adl-lab" aria-label="مختبر القرار الأكاديمي">
    <div className="adl-head">
      <div className="adl-head-icon"><BrainCircuit size={20} aria-hidden="true" /></div>
      <div className="adl-head-copy"><strong>مختبر القرار الأكاديمي</strong>
        <small>ست أدوات ذكية · اختر الميزة لاستعراض نتيجتها</small></div>
      <span className="adl-tag"><Sparkles size={12} aria-hidden="true" /> ٦ أدوات</span>
    </div>
    {liveWatch.length > 0 && <div className="adl-live-courses">
      <div className="adl-live-heading"><GraduationCap size={17} aria-hidden="true" />
        <strong>مقررات المسار الأكاديمي</strong><small>من بيانات القسم · {countOf(liveWatch.length, AR.course)}</small></div>
      <div className="adl-watch-list">{liveWatch.slice(0, 6).map(w =>
        <div className="adl-watch-item" key={w.courseId}><GraduationCap size={16} aria-hidden="true" />
          <strong>{w.courseName}</strong>
          <small>{!w.offered ? "غير مطروح" : "مسار لاحق"}
            {" · " + countOf(w.demand, AR.request) + " مؤهلة"}
            {w.downstream ? " · يفتح " + countOf(w.downstream, AR.course) + " لاحقة" : ""}</small>
        </div>)}</div>
      <small className="adl-live-foot">هذه مقررات القسم الفعلية، وليست من المثال التدريبي.</small>
    </div>}
    <div className="adl-view-modes" role="group" aria-label="مصدر نتائج المختبر">
      <button type="button" data-guide-ignore="معاينة المحاكاة الافتراضية المنفصلة عن بيانات القسم"
        className={viewingTraining ? "adl-view-mode adl-view-mode-active" : "adl-view-mode"}
        aria-pressed={viewingTraining} onClick={() => { pickedMode.current = true; setViewMode("training"); }}>تجربة الأدوات الست</button>
      <button type="button" data-guide-ignore="عرض التحليل الحقيقي للنطاق المختار دون حفظ"
        className={!viewingTraining ? "adl-view-mode adl-view-mode-active" : "adl-view-mode"}
        aria-pressed={!viewingTraining} onClick={() => { pickedMode.current = true; setViewMode("live"); }}>بيانات القسم الفعلية</button>
    </div>
    {viewingTraining && <div className="adl-training-note" role="note">
      <Info size={17} aria-hidden="true" />
      <span><strong>تجربة تعليمية محسوبة</strong> · حالة افتراضية منفصلة عن جدول القسم؛
        النتائج مستخرجة من محرك المحاكاة نفسه، ولا تعبّر عن أعداد أو مواعيد الجامعة.</span>
    </div>}
    <div className="adl-features" role="group" aria-label="اختر إحدى المزايا الست">
      {features.map(item => <button type="button" key={item.id}
        className={"adl-feature" + (feature === item.id ? " adl-feature-active" : "")}
        aria-pressed={feature === item.id} data-guide-ignore="اختيار تبويب استرشادي لا يغيّر الجدول"
        onClick={() => setFeature(item.id)}>
        <item.icon size={18} aria-hidden="true" />
        <span><strong>{item.title}</strong><small>{item.hint}</small></span>
        {feature === item.id && <span className="adl-feature-current"><CheckCheck size={13} aria-hidden="true" /></span>}
      </button>)}
    </div>
    {Boolean(scenarios.length) && (feature === "twin" || feature === "whatif" || feature === "balance" || feature === "trust") &&
      <div className="adl-scenarios" role="group" aria-label="اختر فرصة محسوبة">
        {scenarios.slice(0, compact ? 3 : 5).map(s => <button key={s.id} type="button"
          className={"adl-scenario" + (active?.id === s.id ? " adl-scenario-active" : "")}
          data-guide-ignore="اختيار سيناريو للمعاينة البصرية فقط بلا حفظ"
          aria-pressed={active?.id === s.id} onClick={() => setSelected(s.id)}>
          <span>{s.courseName}<small>الشعبة {s.section} · {s.before} ← {s.after}</small></span>
          <strong>+{n(s.gain)}</strong>
        </button>)}
      </div>}
    <div className="adl-stage" key={feature + "-" + (active?.id || "")}>
      <div className="adl-section-head">
        {features.filter(x => x.id === feature).map(item =>
          <span key={item.id}><item.icon size={16} aria-hidden="true" /><strong>{item.title}</strong></span>)}
        <small>{viewingTraining ? "درس افتراضي محسوب" : "بيانات القسم الفعلية"}</small>
      </div>
      {(feature === "twin" || feature === "whatif") && (active ? <>
        <div className="adl-title-line"><CalendarClock size={15} aria-hidden="true" />
          <strong>{active.courseName}</strong><span>الشعبة {active.section}</span></div>
        <div className="adl-compare" aria-label="مقارنة الوضع الحالي والمقترح">
          <div className="adl-time-card">
            <span className="adl-card-kicker">{feature === "twin" ? "جداول مكتملة الآن" : "الموعد الحالي"}</span>
            <strong>{feature === "twin" ? n(active.beforeFeasible) : active.before}</strong>
            <small>{feature === "twin" ? "من رغبات مؤهلة" : active.days.map(d => readableDays[d] || d).join(" · ")}</small>
            <div className="adl-count"><Users size={14} aria-hidden="true" />
              <b>{n(active.beforeFeasible)}</b><span>تركيبات مكتملة</span></div>
          </div>
          <div className="adl-mid-arrow"><ArrowLeftRight size={18} aria-hidden="true" /></div>
          <div className="adl-time-card adl-time-better">
            <span className="adl-card-kicker">{feature === "twin" ? "جداول مكتملة بعد التحسين" : "الموعد المقترح"}</span>
            <strong>{feature === "twin" ? n(active.afterFeasible) : active.after}</strong>
            <small>{feature === "twin" ? "على جميع المقررات المطلوبة" : active.days.map(d => readableDays[d] || d).join(" · ")}</small>
            <div className="adl-count"><Users size={14} aria-hidden="true" />
              <b>{n(active.afterFeasible)}</b><span>تركيبات مكتملة</span></div>
          </div>
        </div>
        <div className="adl-positive">
          <span><Sparkles size={17} aria-hidden="true" />+{n(active.gain)}</span>
          <div><strong>{feature === "twin" ? "طلاب يمكنهم تركيب جميع مقرراتهم" : "فرص إضافية لجدول كامل"}</strong>
            <small>من {countOf(active.assessed, AR.student)} ذوي رغبات مؤهلة · تقدير غير رسمي</small></div>
        </div>
        <div className="adl-meter-grid">
          {meter("قبل", active.beforeFeasible, active.assessed, "base")}
          {meter("بعد", active.afterFeasible, active.assessed, "gain")}
        </div>
        <small className="adl-view-caption">{feature === "twin"
          ? "التوأم يفحص تركيبة الطالب كاملة، وليس تعارض مقررين منفصلين."
          : "تغيير افتراضي في وقت الشعبة؛ لا تعديل ولا حجز ولا موافقة تلقائية."}</small>
      </> : noEvidence)}
      {feature === "domino" && (shownLab?.chain && (viewingTraining || !courseId) ? <>
        <div className="adl-positive">
          <span><GitBranch size={17} aria-hidden="true" />+{n(shownLab.chain.gain)}</span>
          <div><strong>تحسّن مجمع من خطوتين مترابطتين</strong>
            <small>عدد مستفيدين مميّز، بلا تكرار الحساب</small></div>
        </div>
        <div className="adl-chain-body adl-chain-standalone">
          {shownLab.chain.steps.map((step, index) => <div key={step.id}>
            <i>{index + 1}</i><strong>{step.courseName}</strong>
            <span>{step.before} ← {step.after}</span></div>)}
          <small>الخطوتان محسوبتان معاً، لكنهما غير مطبقتين على الجدول.</small>
        </div>
      </> : <div className="adl-no-evidence"><GitBranch size={18} aria-hidden="true" />
        <div><strong>لا توجد سلسلة تحسين مؤكّدة</strong>
          <small>تظهر عندما تؤدي خطوتان آمنتان لتحسّن أكبر من كل خطوة بمفردها.</small></div></div>)}
      {feature === "rescue" && <>
        {viewingTraining && <small className="adl-view-caption">المقررات أدناه من الحالة التدريبية الافتراضية؛ مقررات القسم الفعلية معروضة فوق الأدوات.</small>}
        {watchList}
      </>}
      {feature === "balance" && (active ? <>
        <div className="adl-balance-grid">
          <div className="adl-impact"><CalendarClock size={17} aria-hidden="true" /><span>إزاحة موعد الأستاذ</span>
            <strong>{countOf(active.facultyShiftMinutes, AR.minute)}</strong></div>
          <div className="adl-impact"><ShieldCheck size={17} aria-hidden="true" /><span>فحص تضارب الموارد</span>
            <strong>{active.resources === "checked" ? "لا تضارب مكتشف" : "يتطلب تحققاً"}</strong></div>
          <div className="adl-impact"><Scale size={17} aria-hidden="true" /><span>حالة الاقتراح</span>
            <strong>غير ملزم · غير مطبق</strong></div>
        </div>
        <small className="adl-view-caption">التوازن الحالي يقيس إزاحة الوقت وتعارض القاعة والأستاذ فقط؛
          لا يعني تفضيل الأستاذ أو موافقته أو تحقق العدالة الشاملة.</small>
      </> : noEvidence)}
      {feature === "trust" && (active ? <>
        <div className="adl-trust-status"><ShieldCheck size={21} aria-hidden="true" />
          <div><strong>{active.confidence === "qualified" ? "نتيجة مدعومة بالتحقق الأولي" : "نتيجة تحتاج تحققاً إضافياً"}</strong>
            <small>{countOf(active.assessed, AR.student)} ضمن عينة الأثر · بلا هويات أو أرقام مدنية</small></div></div>
        <div className="adl-explain">
          <details open><summary><Info size={14} aria-hidden="true" />لماذا هذا الموعد؟
            <ChevronDown size={14} aria-hidden="true" /></summary>{explain(active.reasons)}</details>
          <details open><summary><ShieldCheck size={14} aria-hidden="true" />البيانات والحدود
            <ChevronDown size={14} aria-hidden="true" /></summary>
            {explain([...active.cautions, ...(shownLab?.limitations || []),
              "المجتازات والرغبات مدخلة من الطلبة، وليست سجلات قبول وتسجيل معتمدة.",
              "التخرج مسار مقررات، وليس وعداً بالتخرج المبكر.",
              "توازن الأستاذ لا يعبّر عن موافقته أو اختياراته."])}</details>
          {funnel ? <details open><summary><BrainCircuit size={14} aria-hidden="true" />من أين جاء الرقم؟<ChevronDown size={14} aria-hidden="true" /></summary>{funnel}</details> : null}
        </div>
      </> : noEvidence)}
    </div>
    <div className="adl-footer">
      <span><ShieldCheck size={14} aria-hidden="true" />استرشادي فقط · لا يؤثر في الحفظ أو الاعتماد</span>
      <button type="button" className="adl-refresh" disabled={refreshing} onClick={onRefresh}
        data-guide-ignore="تحديث القراءة الاسترشادية فقط دون حفظ">
        <RefreshCw size={13} aria-hidden="true" />{refreshing ? "جارٍ التحديث" : "تحديث التحليل"}
      </button>
    </div>
  </section>;
}
