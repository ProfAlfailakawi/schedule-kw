import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, BrainCircuit, CalendarClock, ChevronDown,
  GitBranch, GraduationCap, Info, RefreshCw, Scale, ShieldCheck, Sparkles, Users
} from "lucide-react";
import type { AcademicDecisionLab, AcademicDecisionScenario } from "../utils/academicDecisionLab";
import { AR, countOf } from "../utils/arabicCount";

type Props = { lab?: AcademicDecisionLab; courseId?: number; compact?: boolean; demo: boolean; onRefresh: () => void; refreshing: boolean };
const readableDays: Record<string,string> = {fsunday:"أحد",fmonday:"اثنين",ftuesday:"ثلاثاء",fwednesday:"أربعاء",fthursday:"خميس"};
const n = (v: number) => Number(v).toLocaleString("ar-KW-u-nu-latn");
const percent = (value: number, max: number) => Math.max(0,Math.min(100,(value/Math.max(1,max))*100));
const meter = (label:string, value:number, max:number, detail:string, kind:"base"|"gain") =>
  <div className="adl-meter" aria-label={label+" "+detail}>
    <div className="adl-meter-label"><span>{label}</span><strong>{detail}</strong></div>
    <div className="adl-meter-track"><span className={kind==="gain"?"adl-meter-gain":""} style={{width:percent(value,max)+"%"}} /></div>
  </div>;
/**
 * This is a visual read-only preview. It never offers an "apply" action.
 * Every quantity shown has been computed on the server from approved rules.
 */
export default function AcademicDecisionLabPanel({lab,courseId,compact=false,demo,onRefresh,refreshing}:Props) {
  const [selected,setSelected]=useState<string>("");
  const scenarios=useMemo(()=> (lab?.scenarios||[]).filter(s=>!courseId||s.courseId===courseId),[lab,courseId]);
  const watched=(lab?.graduationWatch||[]).filter(w=>!courseId||w.courseId===courseId);
  const active:AcademicDecisionScenario=scenarios.find(s=>s.id===selected)||scenarios[0]!;
  useEffect(()=>{setSelected("");},[courseId,lab?.sampledAt]);
  if(!lab || !scenarios.length) {
    if(!demo && !watched.length)return null;
    return <section className="adl-demo-empty" aria-label="مختبر القرار الأكاديمي">
      <div className="adl-demo-head"><BrainCircuit size={19} aria-hidden="true"/><strong>مختبر القرار الأكاديمي</strong><span>محاكاة حيّة</span></div>
      {watched.length ? <div className="adl-watch-list">{watched.slice(0,3).map(w=>
        <div className="adl-watch-item" key={w.courseId}><GraduationCap size={15} aria-hidden="true"/>
          <strong>{w.courseName}</strong><small>{!w.offered?"غير مطروح":"مسار لاحق"} · {countOf(w.demand, AR.request)} مؤهلة</small></div>)}</div> :
        <p>ما ظهرت محاكاة مكتملة بعد؛ نعرض النتائج فقط عندما تتوفر رغبات مؤهلة وثلاثة مستفيدين أو أكثر.</p>}
      <small>استرشادي · بلا أرقام استعراضية مصطنعة.</small>
    </section>;
  }
  return <section className="adl-lab" aria-label="مختبر القرار الأكاديمي">
    <div className="adl-head">
      <div className="adl-head-icon"><BrainCircuit size={20} aria-hidden="true"/></div>
      <div className="adl-head-copy"><strong>مختبر القرار الأكاديمي</strong><small>شوف الفرق قبل لا تقرر</small></div>
      <span className="adl-tag"><Sparkles size={12} aria-hidden="true"/> محاكاة</span>
    </div>
    <div className="adl-scenarios" role="group" aria-label="اختر فرصة للمقارنة">
      {scenarios.slice(0,compact?3:5).map(s=><button key={s.id} type="button" data-guide-ignore="اختيار سيناريو للمعاينة البصرية فقط بلا حفظ"
        className={"adl-scenario"+(active.id===s.id?" adl-scenario-active":"")}
        aria-pressed={active.id===s.id} onClick={()=>setSelected(s.id)}>
        <span>{s.courseName}<small>رمز الشعبة: {s.section} · {s.before} ← {s.after}</small></span>
        <strong>+{n(s.gain)}</strong>
      </button>)}
    </div>
    <div className="adl-stage" key={active.id}>
      <div className="adl-title-line"><CalendarClock size={16} aria-hidden="true"/>
        <strong>{active.courseName}</strong><span>رمز الشعبة: {active.section}</span></div>
      <div className="adl-compare" aria-label="مقارنة الوضع الحالي والمقترح">
        <div className="adl-time-card">
          <span className="adl-card-kicker">الموعد الحالي</span>
          <strong>{active.before}</strong>
          <small>{active.days.map(d=>readableDays[d]||d).join(" · ")}</small>
          <div className="adl-count"><Users size={14} aria-hidden="true"/><b>{n(active.beforeFeasible)}</b><span>تركيبات مكتملة</span></div>
        </div>
        <div className="adl-mid-arrow"><ArrowLeftRight size={19} aria-hidden="true"/></div>
        <div className="adl-time-card adl-time-better">
          <span className="adl-card-kicker">الموعد المقترح</span>
          <strong>{active.after}</strong>
          <small>{active.days.map(d=>readableDays[d]||d).join(" · ")}</small>
          <div className="adl-count"><Users size={14} aria-hidden="true"/><b>{n(active.afterFeasible)}</b><span>تركيبات مكتملة</span></div>
        </div>
      </div>
      <div className="adl-positive" role="status">
        <span><Sparkles size={17} aria-hidden="true"/> +{n(active.gain)}</span>
        <div><strong>فرص إضافية لتركيب جدول كامل</strong>
          <small>من {countOf(active.assessed, AR.student)} ذوي رغبات مؤهلة · تقدير غير رسمي</small></div>
      </div>
      <div className="adl-meter-grid">
        {meter("قبل",active.beforeFeasible,active.assessed,n(active.beforeFeasible)+" / "+n(active.assessed),"base")}
        {meter("بعد",active.afterFeasible,active.assessed,n(active.afterFeasible)+" / "+n(active.assessed),"gain")}
      </div>
      <div className="adl-impact-grid">
        <div className="adl-impact"><GitBranch size={17} aria-hidden="true"/><span>الأثر المتسلسل</span><strong>{active.rippleImproved? countOf(active.rippleImproved, AR.clash)+" أقل":"محسوب"}</strong></div>
        <div className="adl-impact"><GraduationCap size={17} aria-hidden="true"/><span>مسار التخرج</span><strong>{active.downstream?countOf(active.downstream, AR.course)+" لاحقة":"بدون امتداد"}</strong></div>
        <div className="adl-impact"><Scale size={17} aria-hidden="true"/><span>توازن الأستاذ</span><strong>{countOf(active.facultyShiftMinutes, AR.minute)}</strong></div>
        <div className="adl-impact"><ShieldCheck size={17} aria-hidden="true"/><span>الثقة</span><strong>{active.confidence==="qualified"?"مدعومة":"تحتاج تحققاً"}</strong></div>
      </div>
      {lab.chain && <details className="adl-chain">
        <summary><GitBranch size={16} aria-hidden="true"/><strong>تأثير الدومينو · خطوتان</strong>
          <span>+{n(lab.chain.gain)} تحسّن</span><ChevronDown size={14} aria-hidden="true"/></summary>
        <div className="adl-chain-body">
          {lab.chain.steps.map((step,i)=><div key={step.id}><i>{i+1}</i><strong>{step.courseName}</strong><span>{step.before} ← {step.after}</span></div>)}
          <small>الأثر المجمع على {countOf(lab.chain.assessed, AR.occurrence)} مؤهلة؛ لا يُجمع أثر كل خطوة مرتين ولا يُطبّق أي تعديل.</small>
        </div>
      </details>}
      <div className="adl-explain">
        {Boolean(watched.length) && <details><summary><GraduationCap size={14} aria-hidden="true"/> إنقاذ المسار الأكاديمي <ChevronDown size={14} aria-hidden="true"/></summary>
          <div className="adl-watch-list">{watched.slice(0,4).map(w=>
            <div className="adl-watch-item" key={w.courseId}>
              <GraduationCap size={15} aria-hidden="true"/><strong>{w.courseName}</strong>
              <small>{!w.offered?"مقرر غير مطروح":"يفتح "+countOf(w.downstream, AR.course)+" لاحقة"} · {countOf(w.demand, AR.request)} مؤهلة
                {w.nearGraduation?" · "+countOf(w.nearGraduation, AR.student)+" قرب تخرج تقديري":""}</small>
            </div>)}
            <small>مؤشرات أولوية للمراجعة، وليست توقعاً رسمياً بموعد التخرج.</small>
          </div>
        </details>}
        <details><summary><Info size={14} aria-hidden="true"/> لماذا هذا الموعد؟ <ChevronDown size={14} aria-hidden="true"/></summary>
          <div className="adl-explain-body">{active.reasons.map((r,i)=><p key={i}>{r}</p>)}
            {active.rippleWorsened>0&&<p>قد تنشأ {countOf(active.rippleWorsened, AR.link)} ذات تعارض أخرى؛ تُراجع قبل اتخاذ القرار.</p>}</div>
        </details>
        <details><summary><ShieldCheck size={14} aria-hidden="true"/> البيانات والحدود <ChevronDown size={14} aria-hidden="true"/></summary>
          <div className="adl-explain-body">{active.cautions.map((r,i)=><p key={i}>{r}</p>)}
            <p>المجتازات والرغبات مدخلة من الطلبة، وليست سجلات قبول وتسجيل معتمدة.</p>
            <p>التخرج: عدد المقررات اللاحقة في الصحيفة، وليس وعداً بالتخرج المبكر.</p>
            <p>قياس التوازن يوضح مقدار إزاحة وقت الأستاذ، وليس موافقته أو تفضيلاته.</p></div>
        </details>
      </div>
    </div>
    <footer className="adl-footer">
      <span><ShieldCheck size={13} aria-hidden="true"/> للمعاينة فقط · لا تعديل تلقائي</span>
      <button type="button" data-guide-ignore="تحديث حسابات المحاكاة المعروضة فقط دون تغيير الجدول" className="adl-refresh" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw size={13} aria-hidden="true"/>{refreshing?"يُحدّث…":"تحديث القراءة"}
      </button>
    </footer>
  </section>;
}
