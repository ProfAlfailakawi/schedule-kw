import React, { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, DoorOpen, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import type { AdCollege, AdSection, MasterBuilding, MasterRoom } from "../types";
import { Badge, Field, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface, visualConfirm } from "./ui";
import { officialCollegeSitePrefix, officialSiteLabel } from "../utils/locationCollegePrefixes";
import { byArabic, sortByName } from "../utils/sorting";
import { AR, countOf } from "../utils/arabicCount";
import LocationRoomTypeManager from "./LocationRoomTypeManager";
import { visibleRoomTypes, type RoomTypeScopes } from "../utils/roomTypeForSection";
import { RoomDoorBuildingActions, RoomDoorQr, useRoomDoorLinks } from "./RoomDoorTools";

type SetupData = { colleges: AdCollege[]; sections: AdSection[]; buildings: MasterBuilding[]; rooms: MasterRoom[] };
const empty: SetupData = { colleges: [], sections: [], buildings: [], rooms: [] };
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  /* الخطأ يحمل ردَّ الخادم كاملاً: «موجود موقوفاً» و«مستعمل في الجدول» يُقرآن برمزهما لا بنصّهما. */
  if (!response.ok) throw Object.assign(new Error(data.error || "تعذر إكمال العملية"), { data });
  return data;
}
const IN_USE = "location-in-use";
/** كم موعداً يقف في القاعة/المبنى الآن وفيما بعد — يُقرأ قبل الإيقاف ليُؤكَّد على بيّنة. */
const usageLine = (usage: { current: number; future: number }) =>
  usage.current || usage.future
    ? `يقف فيه الآن ${countOf(usage.current, AR.appointment)} في الفصل الحالي و${countOf(usage.future, AR.appointment)} فيما بعده؛ تبقى هذه المواعيد كما هي لكن لا يُحجز فيه جديد.`
    : "لا مواعيد فيه في الفصل الحالي ولا فيما بعده.";

export default function LocationQuickSetup({ header, demoReadOnly = false, demoSandbox = false }: { header?: React.ReactNode; demoReadOnly?: boolean; demoSandbox?: boolean }) {
  const [data, setData] = useState<SetupData>(empty);
  const [collegeId, setCollegeId] = useState(0);
  const [sectionId, setSectionId] = useState(0);
  const [buildingId, setBuildingId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "shared">("all");
  const [roomStateFilter, setRoomStateFilter] = useState<"active" | "inactive" | "all">("active");
  const [buildingNumber, setBuildingNumber] = useState("");
  const [roomCodes, setRoomCodes] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("");
  const [roomType, setRoomType] = useState("");
  const [roomTypeScopes, setRoomTypeScopes] = useState<RoomTypeScopes>({});
  const [roomBookingPolicy, setRoomBookingPolicy] = useState<NonNullable<MasterRoom["bookingPolicy"]>>("normal");
  const [roomTypes, setRoomTypes] = useState<string[]>(["تدريسية", "مختبر", "مختبر حاسوب"]);
  const [roomSectionIds, setRoomSectionIds] = useState<number[]>([]);
  const [addBuilding, setAddBuilding] = useState(false);
  const [addRooms, setAddRooms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingBuilding, setEditingBuilding] = useState<MasterBuilding | null>(null);
  const [buildingDraft, setBuildingDraft] = useState<{ siteName: string; branchName: string; description: string; active: boolean; sectionIds: number[] }>({ siteName: "", branchName: "", description: "", active: true, sectionIds: [] });
  const [buildingDeptsOpen, setBuildingDeptsOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<MasterRoom | null>(null);
  const [roomDraft, setRoomDraft] = useState<{ canonicalCode: string; sectionIds: number[]; capacity: string; roomType: string; sectionRoomTypes?: Record<string, string>; bookingPolicy: NonNullable<MasterRoom["bookingPolicy"]>; active: boolean }>({ canonicalCode: "", sectionIds: [], capacity: "", roomType: "", bookingPolicy: "normal", active: true });

  const load = async () => {
    setLoading(true); setError("");
    try { const [setup,types]=await Promise.all([request("/api/admin/location-setup"),request("/api/location-room-types")]);setData(setup as SetupData);if(Array.isArray(types.types))setRoomTypes(types.types.map((value:unknown)=>String(value))); }
    catch (e: any) { setError(e?.message || "تعذر تحميل سجل المواقع"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const colleges = useMemo<AdCollege[]>(() => sortByName(data.colleges.filter((item: AdCollege) => officialCollegeSitePrefix(item.AdCollegeName)), (item: AdCollege) => item.AdCollegeName), [data.colleges]);
  const sections = useMemo<AdSection[]>(() => sortByName(data.sections.filter((item: AdSection) => !collegeId || Number(item.AdCollegeId) === collegeId), (item: AdSection) => item.AdSectionName), [data.sections, collegeId]);
  const buildings = useMemo(() => data.buildings.filter(item => (item.active || roomStateFilter !== "active") && item.confidence === "CONFIRMED" && (!collegeId || item.collegeIds.includes(collegeId)) && (!sectionId || !item.sectionIds.length || item.sectionIds.includes(sectionId))), [data.buildings, collegeId, sectionId, roomStateFilter]);
  const currentBuilding = buildings.find(item => item.id === buildingId);
  const doorLinks = useRoomDoorLinks(currentBuilding?.id);
  const visibleRooms = useMemo(() => data.rooms.filter(room => (roomStateFilter === "all" || room.active === (roomStateFilter === "active")) && (!collegeId || room.collegeIds.includes(collegeId)) && (!sectionId || !room.sectionIds.length || room.sectionIds.includes(sectionId)) && (statusFilter === "all" || room.sectionIds.length > 1) && (!currentBuilding || room.buildingId === currentBuilding.id)).sort((a, b) => byArabic(a.canonicalCode, b.canonicalCode)), [data.rooms, collegeId, sectionId, statusFilter, roomStateFilter, currentBuilding?.id]);
  const prefix = officialCollegeSitePrefix(colleges.find(item => Number(item.AdCollegeId) === collegeId)?.AdCollegeName);

  const buildingSections = useMemo<AdSection[]>(() => editingBuilding ? sortByName(data.sections.filter((item: AdSection) => !editingBuilding.collegeIds.length || editingBuilding.collegeIds.includes(Number(item.AdCollegeId))), (item: AdSection) => item.AdSectionName) : [], [data.sections, editingBuilding]);
  const buildingDeptsLine = (() => { const names = buildingDraft.sectionIds.map(id => data.sections.find(item => Number(item.AdSectionId) === id)?.AdSectionName).filter(Boolean) as string[]; return !names.length ? "كل الأقسام" : names.length <= 2 ? names.join("، ") : `${names.slice(0, 2).join("، ")} +${names.length - 2}`; })();
  useEffect(() => { if (buildingId && !buildings.some(item => item.id === buildingId)) setBuildingId(""); }, [buildings, buildingId]);
  useEffect(() => { setRoomSectionIds(sectionId ? [sectionId] : []); }, [sectionId, collegeId]);

  const createBuilding = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const building = await request("/api/admin/location-setup/buildings", { method: "POST", body: JSON.stringify({ collegeId, sectionId, buildingNumber }) }) as MasterBuilding;
      const next = await request("/api/admin/location-setup") as SetupData;
      setData(next); setBuildingId(building.id); setBuildingNumber(""); setAddBuilding(false); setNotice(`تمت إضافة المبنى ${building.officialCode}`);
    } catch (e: any) {
      /* مبنى «حُذف» قبلاً موقوفٌ لا ممحوّ: يُعرض إعادةُ تفعيله بدل رفضٍ لا مخرج منه. */
      if (e?.data?.code === "inactive-exists" && e.data.id) { setBusy(false); await reactivate([{ kind: "building", id: String(e.data.id) }], e.message); return; }
      setError(e?.message || "تعذرت إضافة المبنى");
    }
    finally { setBusy(false); }
  };
  const reactivate = async (items: Array<{ kind: "building" | "room"; id: string }>, message: string) => {
    if (!(await visualConfirm({ title: "إعادة تفعيل", message, confirmLabel: "إعادة تفعيل", tone: "info" }))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      for (const item of items) {
        await request(item.kind === "building" ? `/api/admin/location-setup/buildings/${encodeURIComponent(item.id)}` : `/api/admin/location-registry/rooms/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify({ active: true }) });
      }
      setAddBuilding(false); setAddRooms(false); setBuildingNumber(""); setRoomCodes("");
      if (items[0]?.kind === "building") setBuildingId(items[0].id);
      setNotice(items[0]?.kind === "building" ? "أُعيد تفعيل المبنى. قاعاته الموقوفة تظهر في «غير الفعّالة» لتُفعَّل واحدةً واحدة." : `أُعيد تفعيل ${countOf(items.length, AR.room)}.`);
      await load();
    } catch (e: any) { setError(e?.message || "تعذرت إعادة التفعيل"); }
    finally { setBusy(false); }
  };

  const createRooms = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const codes = roomCodes.split(/[\n,،;；]+/).map(code => code.trim().toUpperCase().replace(/\s+/g, "")).filter(Boolean);
    try {
      const result = await request("/api/admin/location-setup/rooms", { method: "POST", body: JSON.stringify({ buildingId: currentBuilding?.id, roomCodes: codes, sectionIds: roomSectionIds, capacity: roomCapacity === "" ? undefined : Number(roomCapacity), roomType, bookingPolicy: roomBookingPolicy }) });
      setData(await request("/api/admin/location-setup") as SetupData); setRoomCodes(""); setRoomCapacity(""); setRoomType(""); setRoomBookingPolicy("normal"); setAddRooms(false);
      setNotice(`أُضيفت ${countOf(result.created, AR.room)}${roomSectionIds.length > 1 ? " مشتركة" : ""} إلى ${currentBuilding?.officialCode}`);
    } catch (e: any) {
      if (e?.data?.code === "inactive-exists" && Array.isArray(e.data.ids) && e.data.ids.length) { setBusy(false); await reactivate(e.data.ids.map((id: string) => ({ kind: "room" as const, id })), e.message); return; }
      setError(e?.message || "تعذرت إضافة القاعات");
    }
    finally { setBusy(false); }
  };

  const startBuildingEdit = (building: MasterBuilding) => {
    setBuildingDraft({ siteName: building.siteName || "", branchName: building.branchName || "", description: building.description || "", active: building.active, sectionIds: [...building.sectionIds] });
    setBuildingDeptsOpen(false); setEditingBuilding(building); setError(""); setNotice("");
  };
  const saveBuildingEdit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editingBuilding) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/admin/location-setup/buildings/${encodeURIComponent(editingBuilding.id)}`, { method: "PUT", body: JSON.stringify(buildingDraft) });
      if (buildingDraft.active !== editingBuilding.active) setRoomStateFilter("all");
      setEditingBuilding(null); setNotice(`تم تحديث بيانات المبنى ${editingBuilding.officialCode}`); await load();
    } catch (e: any) { setError(e?.message || "تعذر تعديل المبنى"); }
    finally { setBusy(false); }
  };
  const deleteBuilding = async (building: MasterBuilding) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const usage = await request(`/api/admin/location-setup/usage?buildingId=${encodeURIComponent(building.id)}`);
      const inUse = Boolean(usage.current || usage.future);
      setBusy(false);
      if (!(await visualConfirm({ title: `حذف المبنى ${building.officialCode}`, message: `ستتوقف قاعاته عن الاستخدام الجديد، مع الاحتفاظ بسجل المواعيد القديمة. ${usageLine(usage)}`, confirmLabel: inUse ? "أوقفه رغم المواعيد" : "حذف المبنى", tone: "danger" }))) return;
      setBusy(true);
      const result = await request(`/api/admin/location-setup/buildings/${encodeURIComponent(building.id)}`, { method: "DELETE", headers: inUse ? { "X-Schedule-Confirm": IN_USE } : {} });
      setBuildingId(""); setEditingBuilding(null); setData(current => ({ ...current, buildings: current.buildings.filter(item => item.id !== building.id), rooms: current.rooms.filter(room => room.buildingId !== building.id) })); setNotice(`حُذف المبنى ${building.officialCode} وأُوقفت ${countOf(result.deactivatedRoomCount, AR.room)} تابعة له.`);
    } catch (e: any) { setError(e?.message || "تعذر حذف المبنى"); }
    finally { setBusy(false); }
  };
  const startRoomEdit = (room: MasterRoom) => {
    setRoomDraft({ canonicalCode: room.canonicalCode, sectionIds: [...room.sectionIds], capacity: room.capacity == null ? "" : String(room.capacity), roomType: room.roomType || "", sectionRoomTypes: { ...(room.sectionRoomTypes || {}) }, bookingPolicy: room.bookingPolicy || "normal", active: room.active });
    setEditingRoom(room); setError(""); setNotice("");
  };
  const saveRoomEdit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editingRoom) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request(`/api/admin/location-registry/rooms/${encodeURIComponent(editingRoom.id)}`, { method: "PUT", body: JSON.stringify({ ...roomDraft, capacity: roomDraft.capacity === "" ? null : Number(roomDraft.capacity), roomType: roomDraft.roomType }) });
      if (roomDraft.active !== editingRoom.active) setRoomStateFilter("all");
      setEditingRoom(null); setNotice(`تم تحديث القاعة ${result.canonicalCode}${roomDraft.active ? "" : " · القاعة غير فعّالة ولا تظهر في خيارات الحجز"}${result.updatedScheduleCount ? ` · جرى تحديث ${countOf(result.updatedScheduleCount, AR.record)} في الجداول الحالية والقادمة` : ""}`); await load();
    } catch (e: any) { setError(e?.message || "تعذر تعديل القاعة"); }
    finally { setBusy(false); }
  };
  const deleteRoom = async (room: MasterRoom) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const usage = await request(`/api/admin/location-setup/usage?roomId=${encodeURIComponent(room.id)}`);
      const inUse = Boolean(usage.current || usage.future);
      setBusy(false);
      if (!(await visualConfirm({ title: `حذف القاعة ${room.canonicalCode}`, message: `ستتوقف عن الاستخدام الجديد، مع الاحتفاظ بسجل المواعيد القديمة. ${usageLine(usage)}`, confirmLabel: inUse ? "أوقفها رغم المواعيد" : "حذف القاعة", tone: "danger" }))) return;
      setBusy(true);
      await request(`/api/admin/location-setup/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE", headers: inUse ? { "X-Schedule-Confirm": IN_USE } : {} });
      setEditingRoom(null); setData(current => ({ ...current, rooms: current.rooms.filter(item => item.id !== room.id) })); setNotice(`حُذفت القاعة ${room.canonicalCode} وحُفظ سجلها التاريخي.`);
    } catch (e: any) { setError(e?.message || "تعذر حذف القاعة"); }
    finally { setBusy(false); }
  };

  return <div className="content-stack location-quick-setup">
    {header}
    <PageTitle eyebrow="إدارة النظام · للمدير الرئيسي فقط" subtitle="إضافة المباني وقاعات الأقسام المشتركة، مع بقاء السجل الإداري الكامل كما هو.">إضافة المباني والقاعات</PageTitle>
    {demoReadOnly ? <Notice type="info">العرض التجريبي: الحفظ متوقف.</Notice> : demoSandbox ? <Notice type="info" inline>العرض التجريبي: ما تضيفه هنا يبقى في جلستك فقط ولا يصل إلى بيانات الجامعة.</Notice> : null}
    {error ? <Notice>{error}</Notice> : null}{notice ? <div className="location-quick-notice" role="status">{notice}</div> : null}
    <LocationRoomTypeManager demoReadOnly={demoReadOnly} onTypesChange={setRoomTypes} sections={data.sections} onScopesChange={setRoomTypeScopes} />
    <Surface className="location-quick-filters">
      <Field label="الحرم / الموقع"><select value={collegeId || ""} onChange={event => { setCollegeId(Number(event.target.value)); setSectionId(0); setBuildingId(""); }}><option value="">كل المواقع</option>{colleges.map(item => <option key={item.AdCollegeId} value={item.AdCollegeId}>{officialSiteLabel(officialCollegeSitePrefix(item.AdCollegeName), item.AdCollegeName)}</option>)}</select></Field>
      <Field label="القسم"><select value={sectionId || ""} onChange={event => setSectionId(Number(event.target.value))}><option value="">كل الأقسام</option>{sections.map(item => <option key={item.AdSectionId} value={item.AdSectionId}>{item.AdSectionName}</option>)}</select></Field>
      <Field label="المبنى"><select value={currentBuilding?.id || ""} onChange={event => setBuildingId(event.target.value)}><option value="">كل المباني</option>{buildings.map(item => <option key={item.id} value={item.id}>{item.officialCode} · {item.siteName || item.branchName}{item.active ? "" : " · غير فعّال"}</option>)}</select></Field>
      <Field label="نوع القاعات"><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as "all" | "shared")}><option value="all">كل القاعات</option><option value="shared">المشتركة فقط</option></select></Field>
      <Field label="حالة القاعات"><select aria-label="تصفية القاعات حسب حالة التفعيل" value={roomStateFilter} onChange={event => setRoomStateFilter(event.target.value as "active" | "inactive" | "all")}><option value="active">الفعّالة فقط</option><option value="inactive">غير الفعّالة فقط</option><option value="all">الفعّالة وغير الفعّالة</option></select></Field>
    </Surface>

    {currentBuilding ? <Surface className={`location-quick-building-tools${currentBuilding.active ? "" : " is-inactive"}`}><div><strong dir="ltr">{currentBuilding.officialCode}</strong><span>{currentBuilding.branchName || currentBuilding.siteName || "المبنى المحدد"}{currentBuilding.active ? "" : " · غير فعّال"}</span></div><div className="location-quick-item-actions"><button type="button" data-guide-ignore="تعديل بيانات المبنى المحدد" aria-label={`تعديل بيانات المبنى ${currentBuilding.officialCode}`} title="تعديل المبنى" disabled={busy || demoReadOnly} onClick={() => startBuildingEdit(currentBuilding)}><Pencil aria-hidden="true"/><span>تعديل</span></button><button type="button" data-guide-ignore="حذف المبنى المحدد مع حفظ السجل التاريخي" aria-label={`حذف المبنى ${currentBuilding.officialCode}`} title="حذف المبنى" disabled={busy || demoReadOnly} onClick={() => void deleteBuilding(currentBuilding)}><Trash2 aria-hidden="true"/><span>حذف</span></button></div></Surface> : null}

    {editingBuilding ? <Surface className="location-quick-form"><form onSubmit={saveBuildingEdit}><div><h2>تعديل بيانات المبنى <b dir="ltr">{editingBuilding.officialCode}</b></h2><p>الكود الرسمي ثابت لسلامة ربط القاعات والجداول.</p></div><Field label="الموقع"><input value={buildingDraft.siteName} onChange={event => setBuildingDraft(current => ({ ...current, siteName: event.target.value }))} required/></Field><Field label="الفرع"><input value={buildingDraft.branchName} onChange={event => setBuildingDraft(current => ({ ...current, branchName: event.target.value }))}/></Field><Field label="وصف مختصر"><input value={buildingDraft.description} onChange={event => setBuildingDraft(current => ({ ...current, description: event.target.value }))}/></Field><Field label="حالة المبنى"><div className="active-choice" role="radiogroup" aria-label="حالة المبنى"><button type="button" role="radio" data-guide-ignore="اختيار حالة التفعيل: فعّال أو غير فعّال" aria-checked={buildingDraft.active} data-on="1" onClick={() => setBuildingDraft(current => ({ ...current, active: true }))}>فعّال</button><button type="button" role="radio" data-guide-ignore="اختيار حالة التفعيل: فعّال أو غير فعّال" aria-checked={!buildingDraft.active} data-on="0" onClick={() => setBuildingDraft(current => ({ ...current, active: false }))}>غير فعّال</button></div>{buildingDraft.active ? null : <small>لن يظهر في خيارات الحجز الجديدة، مع الاحتفاظ بسجل المواعيد القديمة.</small>}</Field>{buildingSections.length ? <div className="location-quick-depts"><button type="button" aria-expanded={buildingDeptsOpen} data-guide-ignore="يفتح أو يطوي أقسام المبنى" onClick={() => setBuildingDeptsOpen(value => !value)}><span>الأقسام: {buildingDeptsLine}</span><ChevronDown aria-hidden="true"/></button>{buildingDeptsOpen ? <div role="group" aria-label="الأقسام المرتبطة بالمبنى">{buildingSections.map(item => <label key={item.AdSectionId}><input type="checkbox" checked={buildingDraft.sectionIds.includes(Number(item.AdSectionId))} onChange={event => setBuildingDraft(current => ({ ...current, sectionIds: event.target.checked ? [...new Set([...current.sectionIds, Number(item.AdSectionId)])] : current.sectionIds.filter(id => id !== Number(item.AdSectionId)) }))}/><span>{item.AdSectionName}</span></label>)}</div> : null}</div> : null}<div className="location-quick-form-actions"><SecondaryButton type="button" data-guide-ignore="إلغاء تعديل المبنى" onClick={() => setEditingBuilding(null)}>إلغاء</SecondaryButton><PrimaryButton type="submit" data-guide-ignore="حفظ تعديل المبنى" disabled={busy || demoReadOnly}>حفظ التعديل</PrimaryButton></div></form></Surface> : null}

    {editingRoom ? <Surface className="location-quick-form"><form onSubmit={saveRoomEdit}><div><h2><b dir="ltr">{editingRoom.canonicalCode}</b> · تعديل القاعة</h2><p>تغيير الرمز يحدّث القاعات المرتبطة في الجداول الحالية والقادمة، ويحفظ الرمز السابق في السجل.</p></div><Field label="رمز القاعة"><input dir="ltr" value={roomDraft.canonicalCode} maxLength={12} autoCapitalize="characters" onChange={event => setRoomDraft(current => ({ ...current, canonicalCode: event.target.value.toUpperCase().replace(/\s+/g, "") }))} required/></Field><Field label="نوع القاعة (اختياري)"><select value={roomDraft.roomType} onChange={event => setRoomDraft(current => ({ ...current, roomType: event.target.value }))}><option value="">بلا تصنيف</option>{roomTypes.map(type=><option key={type} value={type}>{type}</option>)}{roomDraft.roomType&&!roomTypes.includes(roomDraft.roomType)?<option value={roomDraft.roomType}>{roomDraft.roomType}</option>:null}</select></Field>{roomDraft.sectionIds.length?<Field label="نوعها عند قسمٍ بعينه (اختياري)"><div className="section-room-types">{roomDraft.sectionIds.map((id:number)=><label key={id}><span>{data.sections.find(section=>Number(section.AdSectionId)===Number(id))?.AdSectionName||`قسم ${id}`}</span><select aria-label="نوع القاعة لهذا القسم" value={roomDraft.sectionRoomTypes?.[String(id)]||""} onChange={event=>setRoomDraft(current=>({...current,sectionRoomTypes:{...current.sectionRoomTypes,[String(id)]:event.target.value}}))}><option value="">مثل النوع العام</option>{visibleRoomTypes(roomTypes,id,roomTypeScopes).map(type=><option key={type} value={type}>{type}</option>)}{roomDraft.sectionRoomTypes?.[String(id)]&&!visibleRoomTypes(roomTypes,id,roomTypeScopes).includes(roomDraft.sectionRoomTypes[String(id)])?<option value={roomDraft.sectionRoomTypes[String(id)]}>{roomDraft.sectionRoomTypes[String(id)]}</option>:null}</select></label>)}</div></Field>:null}<Field label="سياسة حجز القاعة"><select aria-label="سياسة حجز القاعة" value={roomDraft.bookingPolicy} onChange={event => setRoomDraft(current => ({ ...current, bookingPolicy: event.target.value as NonNullable<MasterRoom["bookingPolicy"]> }))}>
  <option value="normal">حجز عادي</option><option value="companion_only">مرفق مرافق فقط (لا يُحجز مستقلاً)</option><option value="blocked">غير متاحة للحجز</option>
</select><small>للاستوديو المرافق اختر «مرفق مرافق فقط»؛ ونوع القاعة يجب أن يطابق متطلب المقرر.</small></Field><Field label="حالة القاعة"><div className="active-choice" role="radiogroup" aria-label="حالة القاعة"><button type="button" role="radio" data-guide-ignore="اختيار حالة التفعيل: فعّال أو غير فعّال" aria-checked={roomDraft.active} data-on="1" onClick={() => setRoomDraft(current => ({ ...current, active: true }))}>فعّالة</button><button type="button" role="radio" data-guide-ignore="اختيار حالة التفعيل: فعّال أو غير فعّال" aria-checked={!roomDraft.active} data-on="0" onClick={() => setRoomDraft(current => ({ ...current, active: false }))}>غير فعّالة</button></div><small>{roomDraft.active ? "القاعة معتمدة للاستخدام حسب سياسة حجزها." : "لن تظهر ضمن القاعات والمرافق المتاحة للحجوزات الجديدة، مع الاحتفاظ بسجل المواعيد القديمة."}</small></Field><Field label="السعة الداخلية (اختياري)"><input type="number" min="1" max="5000" step="1" inputMode="numeric" value={roomDraft.capacity} onChange={event => setRoomDraft(current => ({ ...current, capacity: event.target.value }))}/></Field><fieldset className="location-quick-section-picker"><legend>الأقسام المرتبطة</legend><div>{sections.map(item => <label key={item.AdSectionId}><input type="checkbox" checked={roomDraft.sectionIds.includes(Number(item.AdSectionId))} onChange={event => setRoomDraft(current => ({ ...current, sectionIds: event.target.checked ? [...new Set([...current.sectionIds, Number(item.AdSectionId)])] : current.sectionIds.filter(id => id !== Number(item.AdSectionId)) }))}/><span>{item.AdSectionName}</span></label>)}</div></fieldset><div className="location-quick-form-actions"><SecondaryButton type="button" data-guide-ignore="إلغاء تعديل القاعة" onClick={() => setEditingRoom(null)}>إلغاء</SecondaryButton><PrimaryButton type="submit" data-guide-ignore="حفظ تعديل القاعة" disabled={busy || demoReadOnly || !roomDraft.canonicalCode.trim() || (roomDraft.capacity !== "" && (!Number.isInteger(Number(roomDraft.capacity)) || Number(roomDraft.capacity) < 1 || Number(roomDraft.capacity) > 5000))}>حفظ التعديل</PrimaryButton></div></form></Surface> : null}

    <div className="location-quick-actions">
      <Surface><span className="location-quick-icon"><Building2/></span><div><strong>إضافة مبنى</strong><small>اختر الموقع والقسم، ثم أدخل رقم المبنى.</small></div><PrimaryButton type="button" data-guide-ignore="فتح نموذج إضافة مبنى" onClick={() => { setAddBuilding(value => !value); setAddRooms(false); }} disabled={!collegeId}><Plus/>مبنى جديد</PrimaryButton></Surface>
      <Surface><span className="location-quick-icon"><DoorOpen/></span><div><strong>إضافة قاعات</strong><small>أضف قاعة أو عدة قاعات للمبنى المحدد.</small></div><PrimaryButton type="button" data-guide-ignore="فتح نموذج إضافة قاعات" onClick={() => { setAddRooms(value => !value); setAddBuilding(false); }} disabled={!currentBuilding}><Plus/>قاعات جديدة</PrimaryButton></Surface>
    </div>

    {addBuilding ? <Surface className="location-quick-form"><form onSubmit={createBuilding}><div><h2>مبنى جديد</h2><p>الموقع: {officialSiteLabel(prefix, "اختر الموقع")} · الرمز الرسمي سيُنشأ تلقائيًا.</p></div><Field label="رقم المبنى"><input inputMode="numeric" value={buildingNumber} onChange={event => setBuildingNumber(event.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="مثال: 07" required/></Field><div className="location-quick-preview" dir="ltr">{prefix || "----"}{buildingNumber ? buildingNumber.padStart(2, "0") : "##"}</div><div className="location-quick-form-actions"><SecondaryButton type="button" data-guide-ignore="إغلاق نموذج إضافة مبنى" onClick={() => setAddBuilding(false)}>إلغاء</SecondaryButton><PrimaryButton type="submit" data-guide-ignore="حفظ مبنى جديد" disabled={busy || demoReadOnly || !collegeId || !buildingNumber}>حفظ المبنى</PrimaryButton></div></form></Surface> : null}

    {addRooms ? <Surface className="location-quick-form"><form onSubmit={createRooms}><div><h2>قاعات {currentBuilding?.officialCode}</h2><p>أدخل الأرقام أو الرموز، مفصولة بفاصلة أو كل قاعة في سطر.</p></div><Field label="رموز القاعات"><textarea rows={3} value={roomCodes} onChange={event => setRoomCodes(event.target.value)} placeholder={"F01, F02, F03"} required/></Field><Field label="نوع القاعات (اختياري)"><select value={roomType} onChange={event => setRoomType(event.target.value)}><option value="">بلا تصنيف</option>{roomTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></Field><Field label="سياسة حجز القاعات"><select aria-label="سياسة حجز القاعات الجديدة" value={roomBookingPolicy} onChange={event => setRoomBookingPolicy(event.target.value as NonNullable<MasterRoom["bookingPolicy"]>)}>
  <option value="normal">حجز عادي</option><option value="companion_only">مرفق مرافق فقط (مثل الاستوديو)</option><option value="blocked">غير متاحة للحجز</option>
</select><small>تُضاف القاعات فعّالة، وتُطبّق هذه السياسة على القاعات الجديدة فقط.</small></Field><Field label="عدد الطلبة في كل قاعة (اختياري)"><input type="number" min="1" max="5000" step="1" inputMode="numeric" value={roomCapacity} onChange={event => setRoomCapacity(event.target.value)} placeholder="مثال: 40"/><small>يُطبّق على الدفعة، ويمكن تعديل كل قاعة لاحقًا.</small></Field><fieldset className="location-quick-section-picker"><legend>تخصيص القاعات للأقسام</legend><div>{sections.map(item => <label key={item.AdSectionId}><input type="checkbox" checked={roomSectionIds.includes(Number(item.AdSectionId))} onChange={event => setRoomSectionIds(current => event.target.checked ? [...new Set([...current, Number(item.AdSectionId)])] : current.filter(id => id !== Number(item.AdSectionId)))}/><span>{item.AdSectionName}</span></label>)}</div></fieldset><div className="location-quick-shared"><UsersRound/><span>{roomSectionIds.length > 1 ? <><strong>قاعة مشتركة</strong> · {roomSectionIds.map(id => sections.find(item => Number(item.AdSectionId) === id)?.AdSectionName).filter(Boolean).join("، ")}</> : "اختر قسمًا واحدًا، أو أكثر من قسم لتصبح القاعات مشتركة تلقائيًا."}</span></div><div className="location-quick-form-actions"><SecondaryButton type="button" data-guide-ignore="إغلاق نموذج إضافة قاعات" onClick={() => setAddRooms(false)}>إلغاء</SecondaryButton><PrimaryButton type="submit" data-guide-ignore="حفظ القاعات الجديدة" disabled={busy || demoReadOnly || !roomCodes.trim() || roomSectionIds.length === 0 || (roomCapacity !== "" && (!Number.isInteger(Number(roomCapacity)) || Number(roomCapacity) < 1 || Number(roomCapacity) > 5000))}>حفظ القاعات</PrimaryButton></div></form></Surface> : null}

    <Surface className="location-quick-directory"><header><div><h2>{currentBuilding ? `${currentBuilding.officialCode} · القاعات` : "المباني والقاعات"}</h2><p>{loading ? "جارٍ تحميل السجل…" : `${countOf(buildings.length, AR.building)} · ${countOf(visibleRooms.length, AR.room)} ظاهرة`}</p></div><SecondaryButton type="button" data-guide-ignore="تحديث سجل المباني والقاعات" onClick={() => void load()}>تحديث</SecondaryButton></header>
      {currentBuilding ? <RoomDoorBuildingActions links={doorLinks}/> : null}
      {!loading && !currentBuilding ? <div className="location-quick-empty"><Building2/><strong>اختر موقعًا لعرض مبانيه</strong></div> : null}
      {visibleRooms.length ? <div className="location-quick-room-list">{visibleRooms.map(room => { const fullCode = `${room.buildingCode}${room.canonicalCode}`; return <article key={room.id}><div className="location-room-code-line"><DoorOpen aria-hidden="true"/><strong className="location-room-full-code" dir="ltr">{fullCode}</strong>{room.sectionIds.length > 1 ? <Badge>مشتركة</Badge> : null}{room.active?<Badge>فعّالة</Badge>:<Badge>غير فعّالة</Badge>}{room.bookingPolicy==="companion_only"?<Badge>مرفق مرافق فقط</Badge>:room.bookingPolicy==="blocked"?<Badge>الحجز غير متاح</Badge>:null}</div><small>{room.sectionIds.map(id => data.sections.find(item => Number(item.AdSectionId) === Number(id))?.AdSectionName).filter(Boolean).join(" · ") || "غير مخصصة"}{room.roomType ? ` · ${room.roomType}` : ""}</small><div className="location-quick-item-actions"><RoomDoorQr links={doorLinks} roomId={room.id}/><button type="button" data-guide-ignore="تعديل القاعة" aria-label={`تعديل القاعة ${fullCode}`} title="تعديل القاعة" disabled={busy || demoReadOnly} onClick={() => startRoomEdit(room)}><Pencil aria-hidden="true"/><span>تعديل</span></button><button type="button" data-guide-ignore="حذف القاعة مع حفظ السجل التاريخي" aria-label={`حذف القاعة ${fullCode}`} title="حذف القاعة" disabled={busy || demoReadOnly} onClick={() => void deleteRoom(room)}><Trash2 aria-hidden="true"/><span>حذف</span></button></div></article>; })}</div> : null}
      {!visibleRooms.length && !loading ? <div className="location-quick-empty"><DoorOpen/><strong>لا توجد قاعات مطابقة للفلاتر</strong><span>يمكنك إضافة قاعات من بطاقة المبنى المحدد.</span></div> : null}
    </Surface>
  </div>;
}
