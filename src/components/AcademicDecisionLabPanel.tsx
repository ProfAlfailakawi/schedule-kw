import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, BrainCircuit, CalendarClock, ChevronDown, Clock3,
  GitBranch, GraduationCap, Info, RefreshCw, Scale, ShieldCheck, Sparkles, Users
} from "lucide-react";
import type { AcademicDecisionLab, AcademicDecisionScenario } from "../utils/academicDecisionLab";
import "./academic-decision-lab.css";

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
  const active:AcademicDecisionScenario|undefined=scenarios.find(s=>s.id===selected)||scenarios[0];
  useEffect(()=>{setSelected("");},[courseId,lab?.sampledAt]);
  if(!lab || !scenarios.length) {
    if(!demo)return null;
    return <section className="adl-demo-empty" aria-label="مختبر القرار الأكاديمي">
      <div className="adl-demo-head"><BrainCircuit size={19} aria-hidden="true"/><strong>مختبر القرار الأكاديمي</strong><span>محاكاة حيّة</span></div>
      <p>ما ظهرت محاكاة مكتملة بعد؛ نعرض النتائج فقط عندما تتوفر رغبات مؤهلة وثلاثة مستفيدين أو أكثر.</p>
      <small>لا توجد أرقام استعراضية مصطنعة.</small>
    </section>;
  }
  return <section className="adl-lab" aria-label="مختبر القرار الأكاديمي">
    <div className="adl-head">
      <div className="adl-head-icon"><BrainCircuit size={20} aria-hidden="true"/></div>
      <div className="adl-head-copy"><strong>مختبر القرار الأكاديمي</strong><small>شوف الفرق قبل لا تقرر</small></div>
      <span className="adl-tag"><Sparkles size={12} aria-hidden="true"/> محاكاة</span>
    </div>
    <div className="adl-scenarios" role="group" aria-label="اختر فرصة للمقارنة">
      {scenarios.slice(0,compact?3:5).map(s=><button key={s.id} type="button"
        className={"adl-scenario"+(active.id===s.id?" adl-scenario-active":"")}
        aria-pressed={active.id===s.id} onClick={()=>setSelected(s.id)}>
        <span>{s.courseName}<small>شعبة {s.section} · {s.before} ← {s.after}</small></span>
        <strong>+{n(s.gain)}</strong>
      </button>)}
    </div>
    <div className="adl-stage" key={active.id}>
      <div className="adl-title-line"><CalendarClock size={16} aria-hidden="true"/>
        <strong>{active.courseName}</strong><span>شعبة {active.section}</span></div>
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
          <small>من {n(active.assessed)} طالباً ذا رغبات مؤهلة · تقدير غير رسمي</small></div>
      </div>
      <div className="adl-meter-grid">
        {meter("قبل",active.beforeFeasible,active.assessed,n(active.beforeFeasible)+" / "+n(active.assessed),"base")}
        {meter("بعد",active.afterFeasible,active.assessed,n(active.afterFeasible)+" / "+n(active.assessed),"gain")}
      </div>
      <div className="adl-impact-grid">
        <div className="adl-impact"><GitBranch size={17} aria-hidden="true"/><span>الأثر المتسلسل</span><strong>{active.rippleImproved? n(active.rippleImproved)+" تداخل أقل":"محسوب"}</strong></div>
        <div className="adl-impact"><GraduationCap size={17} aria-hidden="true"/><span>مسار التخرج</span><strong>{active.downstream?n(active.downstream)+" لاحقة":"بدون امتداد"}</strong></div>
        <div className="adl-impact"><Scale size={17} aria-hidden="true"/><span>توازن الأستاذ</span><strong>{n(active.facultyShiftMinutes)} دقيقة</strong></div>
        <div className="adl-impact"><ShieldCheck size={17} aria-hidden="true"/><span>الثقة</span><strong>{active.confidence==="qualified"?"مدعومة":"تحتاج تحققاً"}</strong></div>
      </div>
      <div className="adl-explain">
        <details><summary><Info size={14} aria-hidden="true"/> لماذا هذا الموعد؟ <ChevronDown size={14} aria-hidden="true"/></summary>
          <div className="adl-explain-body">{active.reasons.map((r,i)=><p key={i}>{r}</p>)}
            {active.rippleWorsened>0&&<p>قد تنشأ {n(active.rippleWorsened)} علاقة تعارض أخرى؛ تُراجع قبل اتخاذ القرار.</p>}</div>
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
      <button type="button" className="adl-refresh" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw size={13} aria-hidden="true"/>{refreshing?"يُحدّث…":"تحديث القراءة"}
      </button>
    </footer>
  </section>;
}
