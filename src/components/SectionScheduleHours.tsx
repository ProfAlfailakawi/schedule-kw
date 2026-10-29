import React, { useEffect, useMemo, useState } from "react";
import { CheckCheck, Clock3, Save } from "lucide-react";
import { PageTitle, PrimaryButton, SecondaryButton, Surface, Notice } from "./ui";
import { sortByName } from "../utils/sorting";
import { AR, countOf } from "../utils/arabicCount";

type College = { AdCollegeId:number; AdCollegeName:string };
type Section = { AdSectionId:number; AdSectionName:string; AdSectionCode:string; start:number; end:number; startTime:string; endTime:string };

/* شريطُ اليوم: من ٦ صباحاً إلى ١٠ مساءً، والدوامُ مقطعٌ ملوّن عليه — يُرى الفرقُ بين الأقسام بنظرة. */
const BAND_FROM = 6 * 60, BAND_TO = 22 * 60;
const toMinutes = (value: string) => { const [h, m] = String(value || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN; };
const bandAt = (minutes: number) => Math.min(100, Math.max(0, ((minutes - BAND_FROM) / (BAND_TO - BAND_FROM)) * 100));
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

export default function SectionScheduleHours({header,demoReadOnly=false}:{header?:React.ReactNode;demoReadOnly?:boolean}) {
  const [colleges,setColleges]=useState<College[]>([]),[sections,setSections]=useState<Section[]>([]);
  const [collegeId,setCollegeId]=useState(0),[selected,setSelected]=useState<number[]>([]);
  const [startTime,setStartTime]=useState("08:00"),[endTime,setEndTime]=useState("20:00");
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState<{text:string;bad?:boolean}|null>(null);
  useEffect(()=>{void fetch("/api/colleges").then(r=>r.json()).then((rows:College[])=>{const sorted=sortByName(rows||[],row=>row.AdCollegeName);setColleges(sorted);setCollegeId(current=>current||Number(sorted[0]?.AdCollegeId||0));}).catch(()=>setNotice({text:"تعذر تحميل الكليات",bad:true}));},[]);
  const loadCollege=async(id:number,preserveSelection=false)=>{
    if(!id)return;setLoading(true);setNotice(null);
    try{const response=await fetch(`/api/admin/section-schedule-windows?collegeId=${id}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذر تحميل الأقسام");
      setSections(data.sections||[]);
      if(!preserveSelection){setSelected([]);setStartTime("08:00");setEndTime("20:00");}
    }catch(error:any){setSections([]);setNotice({text:error.message||"تعذر تحميل إعدادات الأقسام",bad:true});}finally{setLoading(false);}
  };
  useEffect(()=>{void loadCollege(collegeId);},[collegeId]);
  useEffect(()=>{
    if(!selected.length)return;
    const chosen=sections.filter(section=>selected.includes(section.AdSectionId));
    if(!chosen.length)return;
    const first=chosen[0];
    const sameWindow=chosen.every(section=>section.startTime===first.startTime&&section.endTime===first.endTime);
    setStartTime(sameWindow?first.startTime:"08:00");setEndTime(sameWindow?first.endTime:"20:00");
  },[selected,sections]);
  const allSelected=sections.length>0&&selected.length===sections.length;
  const selectedSections=useMemo(()=>sections.filter(section=>selected.includes(section.AdSectionId)),[sections,selected]);
  const toggleAll=()=>setSelected(allSelected?[]:sections.map(section=>section.AdSectionId));
  const save=async()=>{
    if(demoReadOnly||!collegeId||!selected.length)return;
    setBusy(true);setNotice(null);
    try{const response=await fetch("/api/admin/section-schedule-windows",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionIds:selected,startTime,endTime})});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذر حفظ أوقات الدوام");
      // Keep the edited departments selected so the refreshed fields show the
      // values the server just saved instead of snapping back to 08:00–20:00.
      await loadCollege(collegeId,true);
      const outside=Number(data.outOfWindowAppointments||0);
      setNotice({text:`حُفظ وقت الدوام لـ ${countOf(Number(data.updated||0),AR.section)}.${outside?` يوجد ${countOf(outside,AR.appointment)} قائم خارج النطاق الجديد؛ لم يتغير تلقائيًا.`:""}`});
    }catch(error:any){setNotice({text:error.message||"تعذر حفظ أوقات الدوام",bad:true});}finally{setBusy(false);}
  };
  return <div className="content-stack admin-page section-schedule-hours">
    {header}<PageTitle eyebrow="إدارة النظام · للمدير الرئيسي فقط" subtitle="الافتراضي لكل قسم: ٨ص – ٨م.">أوقات الدوام للأقسام</PageTitle>
    {notice?<Notice>{notice.text}</Notice>:null}
    {demoReadOnly?<Notice type="info">الإعدادات للعرض في الديمو، والحفظ معطّل.</Notice>:null}
    <Surface className="form-card smart-form">
      <div className="form-grid section-hours-time-grid">
        <label className="field"><span>الكلية</span><select value={collegeId||""} onChange={event=>setCollegeId(Number(event.target.value))}><option value="">اختر كلية</option>{colleges.map(college=><option key={college.AdCollegeId} value={college.AdCollegeId}>{college.AdCollegeName}</option>)}</select></label>
        <label className="field"><span>بداية الدوام</span><input type="time" dir="ltr" lang="en" value={startTime} onChange={event=>setStartTime(event.target.value)} /></label>
        <label className="field"><span>نهاية الدوام</span><input type="time" dir="ltr" lang="en" value={endTime} onChange={event=>setEndTime(event.target.value)} /></label>
      </div>
      <DayBand start={startTime} end={endTime} />
      <div className="section-hours-intro"><span className="section-hours-clock"><Clock3 /></span><div><strong>تطبيق النطاق على الأقسام</strong><p>قسمٌ أو أكثر.</p></div><SecondaryButton type="button" data-guide-target="section-hours-select-all" disabled={!sections.length} onClick={toggleAll}><CheckCheck />{allSelected?"إلغاء تحديد الكل":"تحديد الكل"}</SecondaryButton></div>
      {loading?<p role="status">يجري تحميل أقسام الكلية…</p>:sections.length?<div className="section-hours-list">{sections.map(section=><label key={section.AdSectionId} className="section-hours-row"><input type="checkbox" checked={selected.includes(section.AdSectionId)} onChange={event=>setSelected(current=>event.target.checked?[...current,section.AdSectionId]:current.filter(id=>id!==section.AdSectionId))}/><span>{section.AdSectionName}</span><small dir="ltr">{section.startTime}–{section.endTime}</small><DayBand compact start={section.startTime} end={section.endTime} /></label>)}</div>:<p>لا توجد أقسام في الكلية المحددة.</p>}
      {selectedSections.length?<p className="muted-note">سيُطبّق النطاق على {countOf(selectedSections.length,AR.section)}.</p>:null}
      <div className="form-actions"><PrimaryButton type="button" data-guide-target="section-hours-save" disabled={busy||demoReadOnly||!selected.length||endTime<=startTime} onClick={()=>void save()}><Save />{busy?"جارٍ الحفظ…":"حفظ وقت الدوام"}</PrimaryButton></div>
    </Surface>
  </div>;
}
