import React, { useEffect, useState } from "react";
import { Check, Clapperboard, Users, DoorOpen, Dumbbell, FlaskConical, Library, Monitor, Music, Palette, Pencil, Plus, Presentation, Theater, Trash2, Wrench, type LucideIcon } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { Notice, PrimaryButton, SecondaryButton, Surface } from "./ui";
import type { RoomTypeScopes } from "../utils/roomTypeForSection";

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذر إكمال العملية");
  return data;
}

/* أيقونةٌ لكل نوع: يُقرأ النوع بنظرة قبل اسمه. المطابقة بكلمات الاسم، والباب للبقية. */
const TYPE_ICONS: Array<[RegExp, LucideIcon]> = [
  [/استوديو|ستوديو|تصوير|تلفزيون|إنتاج|انتاج/, Clapperboard],
  [/حاسوب|حاسب|كمبيوتر|حاسوبي/, Monitor],
  [/مختبر|معمل/, FlaskConical],
  [/مسرح|مدرج/, Theater],
  [/رسم|فنون|فن |تصميم/, Palette],
  [/ورشة|مشغل/, Wrench],
  [/مكتبة/, Library],
  [/رياض|ملعب|صالة/, Dumbbell],
  [/موسيق|صوت/, Music],
  [/تدريس|دراسي|محاضر/, Presentation],
];
const typeIcon = (name: string): LucideIcon => TYPE_ICONS.find(([pattern]) => pattern.test(name))?.[1] || DoorOpen;

type ScopeSection = { AdSectionId: number; AdSectionName: string };

export default function LocationRoomTypeManager({ demoReadOnly = false, onTypesChange, sections = [], onScopesChange }: { demoReadOnly?: boolean; onTypesChange?: (types: string[]) => void; sections?: ScopeSection[]; onScopesChange?: (scopes: RoomTypeScopes) => void }) {
  const [types, setTypes] = useState<string[]>([]), [newType, setNewType] = useState("");
  const [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [scopes, setScopes] = useState<RoomTypeScopes>({}), [scoping, setScoping] = useState<string | null>(null), [scopeDraft, setScopeDraft] = useState<number[]>([]), [scopeQuery, setScopeQuery] = useState("");
  const applyScopes = (next: RoomTypeScopes) => { setScopes(next); onScopesChange?.(next); };
  const refresh = async () => { const result = await request("/api/location-room-types"); const next = Array.isArray(result.types) ? result.types.map(String) : []; setTypes(next); onTypesChange?.(next); applyScopes(result.scopes || {}); };
  const sectionName = (id: number) => sections.find(section => Number(section.AdSectionId) === id)?.AdSectionName || `قسم ${id}`;
  const scopeLabel = (type: string) => { const owners = scopes[type] || []; return owners.length ? `خاص: ${owners.map(sectionName).join(" · ")}` : "عام لكل الأقسام"; };
  const saveScope = async (type: string) => {
    setBusy(true); setError(""); setNotice("");
    try { const result = await request(`/api/admin/location-room-types/${encodeURIComponent(type)}/scope`, { method: "PUT", body: JSON.stringify({ sectionIds: scopeDraft }) }); applyScopes(result.scopes || {}); setScoping(null); setNotice(scopeDraft.length ? `«${type}» يظهر الآن لأقسامه وحدها.` : `«${type}» عام لكل الأقسام.`); }
    catch (e: any) { setError(e?.message || "تعذر حفظ أقسام النوع"); } finally { setBusy(false); }
  };
  useEffect(() => { void refresh().catch((e: any) => setError(e?.message || "تعذر تحميل أنواع القاعات")); }, []);
  const add = async () => {
    const name = newType.normalize("NFKC").trim(); if (!name) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await request("/api/admin/location-room-types", { method: "POST", body: JSON.stringify({ name }) }); const next = result.types || []; setTypes(next); onTypesChange?.(next); setNewType(""); setNotice(`أُضيف نوع القاعة «${name}»`); }
    catch (e: any) { setError(e?.message || "تعذرت إضافة نوع القاعة"); } finally { setBusy(false); }
  };
  const rename = async (oldName: string) => {
    const name = draft.normalize("NFKC").trim(); if (!name) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await request(`/api/admin/location-room-types/${encodeURIComponent(oldName)}`, { method: "PUT", body: JSON.stringify({ name }) }); const next = result.types || []; setTypes(next); onTypesChange?.(next); if (scopes[oldName]) { const { [oldName]: owners, ...rest } = scopes; applyScopes({ ...rest, [name]: owners }); } setEditing(null); setDraft(""); setNotice(`تم تغيير «${oldName}» إلى «${name}» وتحديث ${countOf(Number(result.updatedRooms || 0), AR.room)} و${countOf(Number(result.updatedCourses || 0), AR.course)} مرتبطة.`); }
    catch (e: any) { setError(e?.message || "تعذر تغيير نوع القاعة"); } finally { setBusy(false); }
  };
  const remove = async (name: string) => {
    if (!window.confirm(`حذف نوع «${name}»؟ لا يمكن حذفه إذا كان مرتبطًا بقاعة أو مقرر.`)) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await request(`/api/admin/location-room-types/${encodeURIComponent(name)}`, { method: "DELETE" }); const next = result.types || []; setTypes(next); onTypesChange?.(next); setNotice(`تم حذف نوع القاعة «${name}».`); }
    catch (e: any) { setError(e?.message || "تعذر حذف نوع القاعة"); } finally { setBusy(false); }
  };
  return <Surface className="location-type-manager">
    <div className="location-type-manager-heading"><span><DoorOpen/></span><div><h2>أنواع القاعات</h2><p>يُختار عند إضافة قاعة أو ربط مقرر. النوع الخاص يظهر لأقسامه وحدها، ويرى غيرها القاعة بنوعها العام.</p></div></div>
    {error ? <Notice>{error}</Notice> : null}{notice ? <Notice>{notice}</Notice> : null}
    <div className="location-type-list">{types.map(type=><div className="location-type-row" key={type}>{editing===type?<><input aria-label={`الاسم الجديد لنوع ${type}`} value={draft} maxLength={60} autoFocus onChange={event=>setDraft(event.target.value)}/><SecondaryButton type="button" data-guide-ignore="إدارة أنواع القاعات متاحة للمدير الرئيسي فقط" disabled={!draft.trim()||busy||demoReadOnly} onClick={()=>void rename(type)}><Check/>حفظ الاسم</SecondaryButton><button type="button" data-guide-ignore="إلغاء تحرير اسم نوع القاعة" className="location-type-cancel" onClick={()=>{setEditing(null);setDraft("");}}>إلغاء</button></>:<>{React.createElement(typeIcon(type), { className: "location-type-icon", "aria-hidden": true })}<strong>{type}</strong><button type="button" data-guide-ignore="تحديد الأقسام التي يظهر لها نوع القاعة" className="location-type-scope" disabled={busy} aria-expanded={scoping===type} onClick={()=>{setScoping(scoping===type?null:type);setScopeDraft(scopes[type]||[]);setScopeQuery("");}}><Users aria-hidden="true"/><span>{scopeLabel(type)}</span></button><span className="location-type-tools"><button type="button" data-guide-ignore="تغيير اسم نوع القاعة" className="location-type-edit" disabled={busy||demoReadOnly} aria-label={`تغيير اسم ${type}`} title="تغيير الاسم" onClick={()=>{setEditing(type);setDraft(type);}}><Pencil/></button><button type="button" data-guide-ignore="حذف نوع قاعة غير مرتبط" className="location-type-delete" disabled={busy||demoReadOnly} aria-label={`حذف نوع ${type}`} title="حذف النوع" onClick={()=>void remove(type)}><Trash2/></button></span></>}{scoping===type?<div className="location-type-scope-panel"><p>هذا النوع لنا: اختر القسم أو الأقسام التي يخصها. بلا اختيار يبقى عامًّا.</p><input aria-label="بحث عن قسم" placeholder="ابحث عن قسم" value={scopeQuery} onChange={event=>setScopeQuery(event.target.value)}/><div className="location-type-scope-list">{sections.filter(section=>String(section.AdSectionName).includes(scopeQuery.trim())||scopeDraft.includes(Number(section.AdSectionId))).map(section=><label key={section.AdSectionId}><input type="checkbox" checked={scopeDraft.includes(Number(section.AdSectionId))} onChange={event=>setScopeDraft(current=>event.target.checked?[...current,Number(section.AdSectionId)]:current.filter(id=>id!==Number(section.AdSectionId)))}/><span>{section.AdSectionName}</span></label>)}</div><div className="location-type-scope-actions"><button type="button" data-guide-ignore="إلغاء تحديد أقسام النوع" className="location-type-cancel" onClick={()=>setScoping(null)}>إلغاء</button><SecondaryButton type="button" data-guide-ignore="حفظ أقسام نوع القاعة للمدير الرئيسي" disabled={busy||demoReadOnly} onClick={()=>void saveScope(type)}><Check/>حفظ الأقسام</SecondaryButton></div></div>:null}</div>)}</div>
    <div className="location-type-add"><input aria-label="نوع قاعة جديد" placeholder="مثال: مختبر كيمياء" value={newType} maxLength={60} onChange={event=>setNewType(event.target.value)}/><PrimaryButton type="button" data-guide-ignore="إضافة نوع قاعة جديد للمدير الرئيسي" disabled={!newType.trim()||busy||demoReadOnly} onClick={()=>void add()}><Plus/>إضافة نوع</PrimaryButton></div>
    <small className="location-type-hint">تغيير الاسم يحدّث القاعات والمقررات التي تستخدمه.</small>
  </Surface>;
}
