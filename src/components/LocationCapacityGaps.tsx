/**
 * ── «قاعات بلا سعة» أعلى «إضافة المباني والقاعات» ───────────────────────────────
 * قاعدةُ «القاعة المختارة لطلب الأستاذ تتّسع لشعبته» لا تعمل إلا في قاعةٍ سعتُها مسجّلة. فهنا حلقةُ الاكتمال،
 * وعدّادُ ما ينقص، وبطاقةٌ لكل قاعةٍ بحقل سعةٍ وزرّ حفظ. الأرقامُ يحسبها الخادم (GET /api/admin/location-setup/capacity-gaps)،
 * والحفظُ بمسار تعديل القاعة القائم (سجلُّه وصلاحيتُه كما هما) — لا مساراً ثانياً.
 *
 * حفظٌ متفائل: تغيب البطاقةُ وتتقدّم الحلقةُ فوراً، فإن ردّ الخادمُ عادت البطاقةُ إلى مكانها بسبب الرفض.
 * Enter يحفظ وينقل التركيزَ إلى القاعة التالية.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, CircleCheck, DoorOpen, Loader2, Search, Sparkles } from "lucide-react";
import MiniRing from "./MiniRing";
import { Badge, Surface } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { capacityPercent, CAPACITY_GAP_MAX, CAPACITY_GAP_MIN, parseGapCapacity, type CapacityGapReport, type CapacityGapRoom } from "../utils/roomCapacityGaps";
import type { AdSection, MasterBuilding } from "../types";

const NO_TYPE = "بلا تصنيف";
const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذّر إكمال العملية");
  return data;
}

export default function LocationCapacityGaps({ buildings, sections, demoReadOnly = false, onSaved }: {
  buildings: MasterBuilding[]; sections: AdSection[]; demoReadOnly?: boolean; onSaved?: () => void;
}) {
  const [report, setReport] = useState<CapacityGapReport | null>(null);
  const [failed, setFailed] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  /* ما حُفظ متفائلاً ولم يردّ الخادمُ بعد (أو ردّ فثبت): يغيب من القائمة ويُحسب مكتملاً. */
  const [optimistic, setOptimistic] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [buildingFilter, setBuildingFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ask, setAsk] = useState("");
  const [announce, setAnnounce] = useState("");
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const load = useCallback(async () => {
    try { setReport(await call("/api/admin/location-setup/capacity-gaps") as CapacityGapReport); setFailed(""); }
    catch (e: any) { setFailed(e?.message || "تعذّرت قراءة السعات"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const gaps = report?.gaps || [];
  const open = useMemo(() => gaps.filter(room => !(room.id in optimistic)), [gaps, optimistic]);
  const doneNow = Object.keys(optimistic).filter(id => gaps.some(room => room.id === id)).length;
  const total = report?.total ?? 0;
  const withCapacity = (report?.withCapacity ?? 0) + doneNow;
  const missing = open.length;
  const percent = report ? capacityPercent(total, withCapacity) : null;

  const typeOf = (room: CapacityGapRoom) => room.roomType || NO_TYPE;
  const buildingChips = useMemo(() => {
    const tally = new Map<string, number>();
    open.forEach(room => tally.set(room.buildingCode, (tally.get(room.buildingCode) || 0) + 1));
    return [...tally].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  }, [open]);
  const typeChips = useMemo(() => {
    const tally = new Map<string, number>();
    open.forEach(room => tally.set(typeOf(room), (tally.get(typeOf(room)) || 0) + 1));
    return [...tally].sort(([a], [b]) => a.localeCompare(b, "ar"));
  }, [open]);
  /* مرشّحٌ لم يعد تحته شيءٌ (حُفظت قاعاتُه كلُّها) يسقط وحدَه فلا تبقى قائمةٌ فارغةٌ بلا سبب. */
  useEffect(() => {
    if (buildingFilter && !buildingChips.some(([code]) => code === buildingFilter)) setBuildingFilter("");
    if (typeFilter && !typeChips.some(([type]) => type === typeFilter)) setTypeFilter("");
  }, [buildingChips, typeChips, buildingFilter, typeFilter]);

  const needle = ask.trim().toUpperCase().replace(/\s+/g, "");
  const shown = useMemo(() => open.filter(room => (!buildingFilter || room.buildingCode === buildingFilter) && (!typeFilter || typeOf(room) === typeFilter)
    && (!needle || room.fullCode.toUpperCase().includes(needle) || room.code.toUpperCase().includes(needle))), [open, buildingFilter, typeFilter, needle]);
  const buildingLabel = (room: CapacityGapRoom) => {
    const building = buildings.find(item => item.id === room.buildingId);
    return String(building?.branchName || building?.siteName || "").trim();
  };
  const sectionLine = (room: CapacityGapRoom) => room.sectionIds.map(id => sections.find(item => Number(item.AdSectionId) === Number(id))?.AdSectionName)
    .filter(Boolean).map(name => String(name).replace(/^قسم\s+/, "")).slice(0, 2).join(" · ");

  const focusNeighbour = (id: string) => {
    const at = shown.findIndex(room => room.id === id);
    const target = shown[at + 1] || shown[at - 1];
    if (target) window.setTimeout(() => inputs.current.get(target.id)?.focus(), 0);
  };

  const save = async (room: CapacityGapRoom) => {
    if (demoReadOnly || saving[room.id]) return;
    const parsed = parseGapCapacity(drafts[room.id]);
    if (!parsed.ok) { setErrors(current => ({ ...current, [room.id]: parsed.error })); inputs.current.get(room.id)?.focus(); return; }
    setErrors(current => { const next = { ...current }; delete next[room.id]; return next; });
    setSaving(current => ({ ...current, [room.id]: true }));
    focusNeighbour(room.id);
    setOptimistic(current => ({ ...current, [room.id]: parsed.value }));
    try {
      await call(`/api/admin/location-registry/rooms/${encodeURIComponent(room.id)}`, { method: "PUT", body: JSON.stringify({ capacity: parsed.value }) });
      setAnnounce(`حُفظت سعة ${room.fullCode}: ${countOf(parsed.value, AR.seat)}.`);
      onSaved?.();
    } catch (e: any) {
      /* التراجعُ: تعود البطاقةُ إلى مكانها وتحمل سببَ الرفض. */
      setOptimistic(current => { const next = { ...current }; delete next[room.id]; return next; });
      setErrors(current => ({ ...current, [room.id]: e?.message || "تعذّر الحفظ" }));
      setAnnounce(`تعذّر حفظ سعة ${room.fullCode}.`);
    } finally {
      setSaving(current => { const next = { ...current }; delete next[room.id]; return next; });
    }
  };

  if (failed && !report) return <Surface className="cap-gaps" ><p className="cap-gaps-fail" role="alert">{failed} <button type="button" className="cap-gaps-retry" data-guide-ignore="إعادة قراءة قاعات بلا سعة" onClick={() => void load()}>أعد المحاولة</button></p></Surface>;
  if (!report) return <Surface className="cap-gaps is-loading"><div className="cap-gaps-head"><MiniRing value={null} size={84} decorative /><div className="cap-gaps-copy"><strong>قاعات بلا سعة</strong><small>جارٍ الحساب…</small></div></div></Surface>;

  const complete = total > 0 && missing === 0;
  return <Surface className={`cap-gaps${complete ? " is-complete" : ""}`}>
    <div className="cap-gaps-head">
      <MiniRing value={percent} size={84} label="اكتمال سعات القاعات">{percent == null ? "—" : `${num(percent)}%`}</MiniRing>
      <div className="cap-gaps-copy">
        <strong>قاعات بلا سعة</strong>
        {total === 0 ? <small>لا قاعات فعّالة معتمدة بعد.</small> : <small>{num(percent ?? 0)}% من القاعات لها سعة · {num(withCapacity)} من {num(total)}</small>}
        <p className="cap-gaps-effect"><Sparkles aria-hidden="true" /> بعد الحفظ تُرشَّح القاعة لشعب بهذا الحجم</p>
      </div>
      <div className="cap-gaps-count" data-zero={missing === 0 ? "1" : undefined} aria-live="polite">
        {complete ? <CircleCheck aria-hidden="true" /> : <DoorOpen aria-hidden="true" />}
        <b>{missing === 0 ? (total === 0 ? "لا قاعات" : "اكتملت") : countOf(missing, AR.room)}</b>
        <span>{missing === 0 ? "" : "بلا سعة"}</span>
      </div>
    </div>
    <p className="cap-gaps-sr" role="status" aria-live="polite">{announce}</p>

    {complete ? <div className="cap-gaps-done"><CircleCheck aria-hidden="true" /><strong>كل القاعات المعتمدة لها سعة</strong><span>يُرشَّح لكل شعبة ما يتّسع لها.</span></div> : null}

    {missing > 0 ? <>
      <div className="cap-gaps-tools">
        <label className="cap-gaps-search"><Search aria-hidden="true" /><span className="sr-only">بحث برمز القاعة</span>
          <input type="search" inputMode="search" dir="ltr" placeholder="رمز القاعة" value={ask} onChange={event => setAsk(event.target.value)} data-guide-ignore="بحث في القاعات بلا سعة"/></label>
        {buildingChips.length > 1 ? <div className="cap-gaps-chips" role="group" aria-label="المبنى">
          <button type="button" aria-pressed={!buildingFilter} data-guide-ignore="تصفية القاعات بلا سعة بالمبنى" onClick={() => setBuildingFilter("")}><Building2 aria-hidden="true" />الكل <b>{num(missing)}</b></button>
          {buildingChips.map(([code, count]) => <button key={code} type="button" aria-pressed={buildingFilter === code} data-guide-ignore="تصفية القاعات بلا سعة بالمبنى" onClick={() => setBuildingFilter(buildingFilter === code ? "" : code)}><span dir="ltr">{code}</span><b>{num(count)}</b></button>)}
        </div> : null}
        {typeChips.length > 1 ? <div className="cap-gaps-chips" role="group" aria-label="النوع">
          {typeChips.map(([type, count]) => <button key={type} type="button" aria-pressed={typeFilter === type} data-guide-ignore="تصفية القاعات بلا سعة بالنوع" onClick={() => setTypeFilter(typeFilter === type ? "" : type)}>{type}<b>{num(count)}</b></button>)}
        </div> : null}
      </div>

      {shown.length ? <ul className="cap-gaps-grid">
        {shown.map(room => {
          const error = errors[room.id];
          const label = buildingLabel(room), sectionsText = sectionLine(room);
          return <li key={room.id} className="cap-gaps-card" data-error={error ? "1" : undefined}>
            <header><span className="cap-gaps-door"><DoorOpen aria-hidden="true" /></span><strong dir="ltr">{room.fullCode}</strong><Badge tone={room.roomType ? "info" : "neutral"}>{typeOf(room)}</Badge></header>
            {label || sectionsText ? <small>{[label, sectionsText].filter(Boolean).join(" · ")}</small> : null}
            <div className="cap-gaps-entry">
              <input type="number" inputMode="numeric" min={CAPACITY_GAP_MIN} max={CAPACITY_GAP_MAX} step={1} dir="ltr" placeholder="المقاعد"
                aria-label={`سعة القاعة ${room.fullCode}`} aria-invalid={error ? true : undefined} aria-describedby={error ? `cap-err-${room.id}` : undefined}
                value={drafts[room.id] ?? ""} disabled={demoReadOnly}
                ref={node => { if (node) inputs.current.set(room.id, node); else inputs.current.delete(room.id); }}
                data-guide-ignore="إدخال سعة القاعة"
                onChange={event => { setDrafts(current => ({ ...current, [room.id]: event.target.value })); if (error) setErrors(current => { const next = { ...current }; delete next[room.id]; return next; }); }}
                onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save(room); } }} />
              <button type="button" className="cap-gaps-save" disabled={demoReadOnly || saving[room.id] || !(drafts[room.id] ?? "").trim()} data-guide-ignore="حفظ سعة القاعة" aria-label={`حفظ سعة ${room.fullCode}`} onClick={() => void save(room)}>
                {saving[room.id] ? <Loader2 className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}<span>حفظ</span>
              </button>
            </div>
            {error ? <p className="cap-gaps-error" id={`cap-err-${room.id}`} role="alert">{error}</p> : null}
          </li>;
        })}
      </ul> : <p className="cap-gaps-none">لا قاعة مطابقة للتصفية.</p>}
    </> : null}
  </Surface>;
}
