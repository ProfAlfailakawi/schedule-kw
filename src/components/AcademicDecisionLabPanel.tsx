import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, BrainCircuit, CalendarClock, CheckCheck, ChevronDown,
  GitBranch, GraduationCap, Info, RefreshCw, Scale, ShieldCheck, Sparkles, Users
} from "lucide-react";
import type { AcademicDecisionLab, AcademicDecisionScenario } from "../utils/academicDecisionLab";
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
  const scenarios = useMemo(() => (lab?.scenarios || []).filter(s => !courseId || s.courseId === courseId), [lab, courseId]);
  const watched = (lab?.graduationWatch || []).filter(w => !courseId || w.courseId === courseId);
  const active: AcademicDecisionScenario | undefined = scenarios.find(s => s.id === selected) || scenarios[0];
  useEffect(() => { setSelected(""); }, [courseId, lab?.sampledAt]);
  if (!lab) {
    return demo ? <section className="adl-demo-empty" aria-label="مختبر القرار الأكاديمي">
      <div className="adl-demo-head"><BrainCircuit size={18} aria-hidden="true" /><strong>مختبر القرار الأكاديمي</strong></div>
      <small>البيانات قيد التحميل؛ لا تُعرض تقديرات غير محسوبة.</small>
    </section> : null;
  }
  const noEvidence = <div className="adl-no-evidence">
    <Info size={19} aria-hidden="true" />
    <div><strong>لا توجد محاكاة مؤكّدة لهذا النطاق</strong>
      <small>لا نقترح تغييراً دون رغبات مؤهلة وأثر محسوب لثلاثة مستفيدين على الأقل.</small></div>
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
    {lab.demoShowcase && <div className="adl-training-note" role="note">
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
        <small>{lab.demoShowcase ? "درس افتراضي" : "قراءة استرشادية"}</small>
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
      {feature === "domino" && (lab.chain && !courseId ? <>
        <div className="adl-positive">
          <span><GitBranch size={17} aria-hidden="true" />+{n(lab.chain.gain)}</span>
          <div><strong>تحسّن مجمع من خطوتين مترابطتين</strong>
            <small>عدد مستفيدين مميّز، بلا تكرار الحساب</small></div>
        </div>
        <div className="adl-chain-body adl-chain-standalone">
          {lab.chain.steps.map((step, index) => <div key={step.id}>
            <i>{index + 1}</i><strong>{step.courseName}</strong>
            <span>{step.before} ← {step.after}</span></div>)}
          <small>الخطوتان محسوبتان معاً، لكنهما غير مطبقتين على الجدول.</small>
        </div>
      </> : <div className="adl-no-evidence"><GitBranch size={18} aria-hidden="true" />
        <div><strong>لا توجد سلسلة تحسين مؤكّدة</strong>
          <small>تظهر عندما تؤدي خطوتان آمنتان لتحسّن أكبر من كل خطوة بمفردها.</small></div></div>)}
      {feature === "rescue" && watchList}
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
            {explain([...active.cautions, ...lab.limitations,
              "المجتازات والرغبات مدخلة من الطلبة، وليست سجلات قبول وتسجيل معتمدة.",
              "التخرج مسار مقررات، وليس وعداً بالتخرج المبكر.",
              "توازن الأستاذ لا يعبّر عن موافقته أو اختياراته."])}</details>
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
