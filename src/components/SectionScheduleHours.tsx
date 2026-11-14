import React, { useEffect, useMemo, useState } from "react";
import { CheckCheck, Clock3, Save } from "lucide-react";
import { PageTitle, PrimaryButton, SecondaryButton, Surface, Notice } from "./ui";
import { sortByName } from "../utils/sorting";
import { AR, countOf } from "../utils/arabicCount";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START, SCHEDULE_DAY_START_TIME, universityDayIssue } from "../utils/scheduleTime";
import { adoptUniversityDay } from "../utils/universityDayClient";

type College = { AdCollegeId:number; AdCollegeName:string };
type Section = { AdSectionId:number; AdSectionName:string; AdSectionCode:string; start:number; end:number; startTime:string; endTime:string };

/* شريطُ اليوم: من ٦ صباحاً إلى ١٠ مساءً ويتّسع للدوام الشامل، والدوامُ مقطعٌ ملوّن عليه — يُرى الفرقُ بين الأقسام بنظرة. */
const bandFrom = () => Math.min(6 * 60, SCHEDULE_DAY_START), bandTo = () => Math.max(22 * 60, SCHEDULE_DAY_END);
const toMinutes = (value: string) => { const [h, m] = String(value || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN; };
const bandAt = (minutes: number) => Math.min(100, Math.max(0, ((minutes - bandFrom()) / (bandTo() - bandFrom())) * 100));
function DayBand({ start, end, compact = false }: { start: string; end: string; compact?: boolean }) {
  const from = toMinutes(start), to = toMinutes(end);
  const valid = Number.isFinite(from) && Number.isFinite(to) && to > from;
  const hours = valid ? Math.round(((to - from) / 60) * 10) / 10 : 0;
  return <div className={compact ? "day-band is-compact" : "day-band"} aria-hidden="true">
    <div className="day-band-track">
      {valid ? <i className="day-band-fill" style={{ insetInlineStart: `${bandAt(from)}%`, inlineSize: `${bandAt(to) - bandAt(from)}%` }} /> : null}
      {compact ? null : [8, 12, 16, 20].map(hour => <b key={hour} style={{ insetInlineStart: `${bandAt(hour * 60)}%` }}>{hour}</b>)}
    </div>
    {compact || !valid ? null : <span className="day-band-total">{countOf(hours, AR.hour)}</span>}
  </div>;
}

/** الدوام الشامل: للمدير الرئيسي يعدّله، ولغيره يُقرأ. قبل الحفظ يظهر عددُ المواعيد القائمة خارجه، ولا يمنع. */
function UniversityDayCard({canEdit,demoReadOnly,onSaved}:{canEdit:boolean;demoReadOnly:boolean;onSaved:()=>void}) {
  const [current,setCurrent]=useState({startTime:SCHEDULE_DAY_START_TIME,endTime:SCHEDULE_DAY_END_TIME});
  const [startTime,setStartTime]=useState(current.startTime),[endTime,setEndTime]=useState(current.endTime);
  const [outside,setOutside]=useState<number|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const issue=universityDayIssue(startTime,endTime),changed=startTime!==current.startTime||endTime!==current.endTime;
  useEffect(()=>{
    setOutside(null);
    if(!canEdit||!changed||issue)return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{void fetch(`/api/admin/university-day/impact?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`,{cache:"no-store",signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(data)setOutside(Number(data.outside||0));}).catch(()=>undefined);},300);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[canEdit,changed,issue,startTime,endTime]);
  const save=async()=>{
    setBusy(true);setNotice("");
    try{const response=await fetch("/api/admin/university-day",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({startTime,endTime})});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذر الحفظ");
      adoptUniversityDay({startTime:data.startTime,endTime:data.endTime});setCurrent({startTime:data.startTime,endTime:data.endTime});setOutside(null);onSaved();
      setNotice(`حُفظ الدوام الشامل.${Number(data.outside)?` ${countOf(Number(data.outside),AR.appointment)} خارجه يبقى كما هو.`:""}`);
    }catch(error:any){setNotice(error.message||"تعذر الحفظ");}finally{setBusy(false);}
  };
  return <Surface className="form-card section-hours-full">
    <span className="section-hours-clock"><Clock3 /></span>
    <div><strong>الدوام الشامل</strong><p>حدٌّ يمنع في كل مكان، للبرنامج كله.</p></div>
    {canEdit?null:<b dir="ltr">{current.startTime}–{current.endTime}</b>}
    {canEdit?<div className="section-hours-full-edit">
      <div className="form-grid section-hours-time-grid">
        <label className="field"><span>بداية الدوام الشامل</span><input type="text" inputMode="numeric" dir="ltr" lang="en" maxLength={5} placeholder="08:00" value={startTime} onChange={event=>setStartTime(event.target.value.trim())} /></label>
        <label className="field"><span>نهاية الدوام الشامل</span><input type="text" inputMode="numeric" dir="ltr" lang="en" maxLength={5} placeholder="20:00" value={endTime} onChange={event=>setEndTime(event.target.value.trim())} /></label>
      </div>
      {issue?<p className="muted-note" role="alert">{issue}</p>:null}
      {outside?<p className="muted-note" role="status">{countOf(outside,AR.appointment)} في الفصل الحالي خارج هذا الدوام. يبقى كما هو ولا يُمنع الحفظ.</p>:null}
      {notice?<p className="muted-note" role="status">{notice}</p>:null}
      <div className="form-actions"><PrimaryButton type="button" data-guide-target="university-day-save" disabled={busy||demoReadOnly||!changed||Boolean(issue)} onClick={()=>void save()}><Save />{busy?"جارٍ الحفظ…":"حفظ الدوام الشامل"}</PrimaryButton></div>
    </div>:null}
  </Surface>;
}

export default function SectionScheduleHours({header,demoReadOnly=false,rootAdmin=true}:{header?:React.ReactNode;demoReadOnly?:boolean;rootAdmin?:boolean}) {
  const [colleges,setColleges]=useState<College[]>([]),[sections,setSections]=useState<Section[]>([]);
  const [collegeId,setCollegeId]=useState(0),[selected,setSelected]=useState<number[]>([]);
  const [startTime,setStartTime]=useState(SCHEDULE_DAY_START_TIME),[endTime,setEndTime]=useState(SCHEDULE_DAY_END_TIME);
  const [dayKey,setDayKey]=useState(0);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState<{text:string;bad?:boolean}|null>(null);
  useEffect(()=>{if(!rootAdmin)return;void fetch("/api/colleges").then(r=>r.json()).then((rows:College[])=>{const sorted=sortByName(rows||[],row=>row.AdCollegeName);setColleges(sorted);setCollegeId(current=>current||Number(sorted[0]?.AdCollegeId||0));}).catch(()=>setNotice({text:"تعذر تحميل الكليات",bad:true}));},[]);
  const loadCollege=async(id:number,preserveSelection=false)=>{
    if(!id)return;setLoading(true);setNotice(null);
    try{const response=await fetch(`/api/admin/section-schedule-windows?collegeId=${id}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذر تحميل الأقسام");
      setSections(data.sections||[]);
      if(!preserveSelection){setSelected([]);setStartTime(SCHEDULE_DAY_START_TIME);setEndTime(SCHEDULE_DAY_END_TIME);}
    }catch(error:any){setSections([]);setNotice({text:error.message||"تعذر تحميل إعدادات الأقسام",bad:true});}finally{setLoading(false);}
  };
  useEffect(()=>{if(rootAdmin)void loadCollege(collegeId);},[collegeId,dayKey]);
  useEffect(()=>{
    if(!selected.length)return;
    const chosen=sections.filter(section=>selected.includes(section.AdSectionId));
    if(!chosen.length)return;
    const first=chosen[0];
    const sameWindow=chosen.every(section=>section.startTime===first.startTime&&section.endTime===first.endTime);
    setStartTime(sameWindow?first.startTime:SCHEDULE_DAY_START_TIME);setEndTime(sameWindow?first.endTime:SCHEDULE_DAY_END_TIME);
  },[selected,sections]);
  const outsideUniversityDay=startTime<SCHEDULE_DAY_START_TIME||endTime>SCHEDULE_DAY_END_TIME;
  const allSelected=sections.length>0&&selected.length===sections.length;
  const selectedSections=useMemo(()=>sections.filter(section=>selected.includes(section.AdSectionId)),[sections,selected]);
  const toggleAll=()=>setSelected(allSelected?[]:sections.map(section=>section.AdSectionId));
  const save=async()=>{
    if(demoReadOnly||!collegeId||!selected.length)return;
    setBusy(true);setNotice(null);
    try{const response=await fetch("/api/admin/section-schedule-windows",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionIds:selected,startTime,endTime})});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذر حفظ أوقات الدوام");
      // Keep the edited departments selected so the refreshed fields show the
      // values the server just saved instead of snapping back to the full day.
      await loadCollege(collegeId,true);
      const outside=Number(data.outOfWindowAppointments||0);
      setNotice({text:`حُفظ وقت الدوام لـ ${countOf(Number(data.updated||0),AR.section)}.${outside?` يوجد ${countOf(outside,AR.appointment)} قائم خارج النطاق الجديد؛ لم يتغير تلقائيًا.`:""}`});
    }catch(error:any){setNotice({text:error.message||"تعذر حفظ أوقات الدوام",bad:true});}finally{setBusy(false);}
  };
  return <div className="content-stack admin-page section-schedule-hours">
    {header}<PageTitle eyebrow="إدارة النظام" subtitle="الدوام المسموح لكل قسم يساوي الدوام الشامل ما لم يُضيَّق.">أوقات دوام الأقسام</PageTitle>
    {notice?<Notice>{notice.text}</Notice>:null}
    {demoReadOnly?<Notice type="info">الإعدادات للعرض في الديمو، والحفظ معطّل.</Notice>:null}
    <UniversityDayCard canEdit={rootAdmin} demoReadOnly={demoReadOnly} onSaved={()=>setDayKey(value=>value+1)} />
    {rootAdmin?<Surface className="form-card smart-form">
      <div className="section-hours-allowed"><strong>الدوام المسموح</strong><p>للقسم، ويساوي الدوام الشامل افتراضاً. تضييقُه استثناء: يمنع بطاقة الأستاذ، وفي «موعد» تنبيهٌ فقط.</p></div>
      <div className="form-grid section-hours-time-grid">
        <label className="field"><span>الكلية</span><select value={collegeId||""} onChange={event=>setCollegeId(Number(event.target.value))}><option value="">اختر كلية</option>{colleges.map(college=><option key={college.AdCollegeId} value={college.AdCollegeId}>{college.AdCollegeName}</option>)}</select></label>
        <label className="field"><span>بداية الدوام المسموح</span><input type="time" dir="ltr" lang="en" value={startTime} onChange={event=>setStartTime(event.target.value)} /></label>
        <label className="field"><span>نهاية الدوام المسموح</span><input type="time" dir="ltr" lang="en" value={endTime} onChange={event=>setEndTime(event.target.value)} /></label>
      </div>
      <DayBand start={startTime} end={endTime} />
      {outsideUniversityDay?<p className="muted-note" role="alert">الدوام المسموح يبقى داخل الدوام الشامل ({SCHEDULE_DAY_START_TIME}–{SCHEDULE_DAY_END_TIME}).</p>:null}
      <div className="section-hours-intro"><span className="section-hours-clock"><Clock3 /></span><div><strong>تطبيق النطاق على الأقسام</strong><p>قسمٌ أو أكثر.</p></div><SecondaryButton type="button" data-guide-target="section-hours-select-all" disabled={!sections.length} onClick={toggleAll}><CheckCheck />{allSelected?"إلغاء تحديد الكل":"تحديد الكل"}</SecondaryButton></div>
      {loading?<p role="status">يجري تحميل أقسام الكلية…</p>:sections.length?<div className="section-hours-list">{sections.map(section=><label key={section.AdSectionId} className="section-hours-row"><input type="checkbox" checked={selected.includes(section.AdSectionId)} onChange={event=>setSelected(current=>event.target.checked?[...current,section.AdSectionId]:current.filter(id=>id!==section.AdSectionId))}/><span>{section.AdSectionName}</span><small dir="ltr">{section.startTime}–{section.endTime}</small><DayBand compact start={section.startTime} end={section.endTime} /></label>)}</div>:<p>لا توجد أقسام في الكلية المحددة.</p>}
      {selectedSections.length?<p className="muted-note">سيُطبّق النطاق على {countOf(selectedSections.length,AR.section)}.</p>:null}
      <div className="form-actions"><PrimaryButton type="button" data-guide-target="section-hours-save" disabled={busy||demoReadOnly||!selected.length||endTime<=startTime||outsideUniversityDay} onClick={()=>void save()}><Save />{busy?"جارٍ الحفظ…":"حفظ وقت الدوام"}</PrimaryButton></div>
    </Surface>:null}
  </div>;
}
