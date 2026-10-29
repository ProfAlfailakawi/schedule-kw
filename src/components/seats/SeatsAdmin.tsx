import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Armchair, Building2, Crown, Plus, Search, Snowflake, UsersRound } from "lucide-react";
import SeatPanel from "./SeatPanel";
import SeatLinkCard from "./SeatLinkCard";
import { invitationHref } from "../../utils/invitationLink";
import "./seats.css";

/**
 * ── «الكراسي» في إدارة النظام (docs/SEATS.md) ────────────────────────────────
 *
 * كلُّ حسابٍ كرسيّ: من يجلس عليه، ومن معه، وماذا جرى عليه عبر السنوات. قائمةٌ إلى
 * جانب لوحة الكرسي المختار، وفوقها ما يحتاج انتباه مدير النظام: كراسيُّ لم يُسجَّل
 * شاغلوها، وفرقٌ مجمَّدة بعد تسليم، وكلياتٌ بلا رئيس تسجيل.
 */

type SeatRow = {
  id: number; login: string; name: string; role: string; roleLabel: string; order: number; active: boolean; mustChangePassword: boolean;
  scopeLabel: string; holder: { name: string; since: string } | null; deputy: { name: string } | null;
  team: { active: number; pending: number; frozen: number; ended: number } | null;
  lastEvent: { at: string; kind: string; detail: string } | null;
};
type Listing = { seats: SeatRow[]; missingCollegeRegistrars: Array<{ collegeId: number; collegeName: string }>; roles: Array<{ id: string; label: string; order: number }> };

const GROUPS: Array<{ id: string; label: string; roles: string[] }> = [
  { id: "all", label: "الكل", roles: [] },
  { id: "department", label: "الأقسام", roles: ["committeeChair", "departmentHead", "advisor"] },
  { id: "college", label: "العمادات", roles: ["dean", "viceDean"] },
  { id: "registration", label: "التسجيل", roles: ["registrarDean", "registrarHead", "collegeRegistrar", "registrarStaff"] },
];
const initialOf = (name?: string) => String(name || "").trim().replace(/^(د|أ|م)\.\s*/, "").charAt(0) || "؟";

async function call<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "تعذّر تنفيذ العملية");
  return body as T;
}

export default function SeatsAdmin({ header }: { header?: React.ReactNode }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [group, setGroup] = useState("all");
  const [focus, setFocus] = useState<"" | "noHolder" | "frozen">("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState<{ collegeId: number; collegeName: string } | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", mobile: "" });
  const [created, setCreated] = useState<{ login: string; password: string; seatName: string; holder: { name: string; mobile?: string } } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const next = await call<Listing>("/api/seats"); setListing(next); setError(""); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const seats = listing?.seats || [];
  const counts = useMemo(() => ({
    total: seats.length,
    noHolder: seats.filter(row => !row.holder).length,
    frozen: seats.filter(row => (row.team?.frozen || 0) > 0).length,
    members: seats.reduce((sum, row) => sum + (row.team?.active || 0) + (row.team?.pending || 0), 0),
  }), [seats]);
  const shown = useMemo(() => {
    const roles = GROUPS.find(row => row.id === group)?.roles || [];
    const q = query.trim();
    return seats.filter(row => (!roles.length || roles.includes(row.role))
      && (!focus || (focus === "noHolder" ? !row.holder : (row.team?.frozen || 0) > 0))
      && (!q || row.name.includes(q) || row.login.toLowerCase().includes(q.toLowerCase()) || String(row.holder?.name || "").includes(q)));
  }, [seats, group, query, focus]);
  useEffect(() => {
    if (shown.length && !shown.some(row => row.id === selected)) setSelected(shown[0].id);
  }, [shown, selected]);

  const createSeat = async () => {
    if (!creating) return;
    setBusy(true); setError("");
    try {
      const result = await call<{ seatId: number; login: string; password: string; seatName: string; holder: { name: string; mobile?: string } }>("/api/seats/college-registrar", {
        method: "POST", body: JSON.stringify({ collegeId: creating.collegeId, name: createForm.name, mobile: createForm.mobile }),
      });
      setCreated(result); setCreating(null); setCreateForm({ name: "", mobile: "" });
      await load(); setSelected(result.seatId);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="content-stack admin-page seats-admin">
      {header}
      <section className="seats-intro">
        <div>
          <span className="seats-eyebrow"><Armchair aria-hidden="true" />الكرسي ثابت، والشخص يتبدّل</span>
          <h2>الكراسي وشاغلوها</h2>
          <p>كلُّ حسابٍ منصب. سجّل من يجلس عليه، وسلّمه بضغطة حين يتبدّل، ويبقى تاريخه محفوظاً عبر السنوات.</p>
        </div>
        <div className="seats-stats" role="group" aria-label="ملخص">
          <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" className={focus === "" ? "on" : ""} onClick={() => setFocus("")}><b>{counts.total}</b><span>كرسي</span></button>
          <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" className={`warn ${focus === "noHolder" ? "on" : ""}`} onClick={() => setFocus(focus === "noHolder" ? "" : "noHolder")}><b>{counts.noHolder}</b><span>بلا شاغل مسجّل</span></button>
          <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" className={`cool ${focus === "frozen" ? "on" : ""}`} onClick={() => setFocus(focus === "frozen" ? "" : "frozen")}><b>{counts.frozen}</b><span>فريق مجمَّد</span></button>
          <div><b>{counts.members}</b><span>عضو فريق</span></div>
        </div>
      </section>

      {listing?.missingCollegeRegistrars.length ? (
        <section className="seats-missing" aria-label="كراسي ناقصة">
          <Building2 aria-hidden="true" />
          <div>
            <strong>كلياتٌ بلا رئيس تسجيل</strong>
            <div className="seats-missing-list">
              {listing.missingCollegeRegistrars.map(row => (
                <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" key={row.collegeId} onClick={() => { setCreating(row); setCreated(null); }}><Plus aria-hidden="true" />{row.collegeName}</button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {error ? <p className="seat-error" role="alert">{error}</p> : null}

      <div className="seats-layout">
        <aside className="seats-list" aria-label="الكراسي">
          <div className="seats-filters">
            <div className="seats-groups" role="tablist" aria-label="نوع الكرسي">
              {GROUPS.map(row => <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" role="tab" key={row.id} aria-selected={group === row.id} className={group === row.id ? "on" : ""} onClick={() => setGroup(row.id)}>{row.label}</button>)}
            </div>
            <label className="seat-search"><Search aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث بالكرسي أو الشاغل" aria-label="ابحث بالكرسي أو الشاغل" /></label>
          </div>
          {!listing ? <div className="seat-skeleton" /> : shown.length ? (
            <ul>
              {shown.map(row => (
                <li key={row.id}>
                  <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" className={`seats-row ${selected === row.id ? "on" : ""}`} onClick={() => setSelected(row.id)} aria-current={selected === row.id ? "true" : undefined}>
                    <i className={`seat-avatar sm ${row.holder ? "" : "empty"}`} aria-hidden="true">{row.holder ? initialOf(row.holder.name) : <Armchair />}</i>
                    <span className="seats-row-text">
                      <small>{row.roleLabel}{row.active ? "" : " · موقوف"}</small>
                      <strong>{row.name}</strong>
                      <span className={row.holder ? "" : "none"}>{row.holder ? <><Crown aria-hidden="true" />{row.holder.name}</> : "لم يُسجَّل الشاغل"}</span>
                    </span>
                    <span className="seats-row-tags">
                      {row.team ? <em title="الفريق"><UsersRound aria-hidden="true" />{row.team.active + row.team.pending}</em> : null}
                      {row.team?.frozen ? <em className="cool" title="مجمَّد"><Snowflake aria-hidden="true" />{row.team.frozen}</em> : null}
                      {row.mustChangePassword ? <em className="warn" title="ينتظر اختيار كلمة السر">جديد</em> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="seat-empty-line">لا كراسي مطابقة.</p>}
        </aside>
        <section className="seats-detail" aria-live="polite">
          {created ? (
            <div className="seats-created">
              <SeatLinkCard title={created.holder.name} subtitle={`الشاغل · ${created.seatName}`} url={invitationHref(`${window.location.origin}/`, created.login, created.password)}
                mobile={created.holder.mobile} credentials={{ login: created.login, password: created.password }}
                message={[`أهلاً ${created.holder.name}`, `أُنشئ لك كرسي «${created.seatName}» في SCHEDULE.`, "ادخل من هذا الرابط، واختر كلمة سرّك الخاصة عند أول دخول:", invitationHref(`${window.location.origin}/`, created.login, created.password)].join("\n")}
                onDone={() => setCreated(null)} />
            </div>
          ) : null}
          {creating ? (
            <div className="seat-panel seats-create">
              <header className="seat-hero"><span className="seat-role-chip"><Armchair aria-hidden="true" />رئيس تسجيل الكلية</span><h2>{creating.collegeName}</h2><p>كرسيٌّ جديد يمدّد التسليم لكليته، ويضيف موظفي التسجيل فيها.</p></header>
              <div className="seat-form-grid">
                <label><span>الشاغل</span><input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="الاسم كاملاً" autoFocus /></label>
                <label><span>الجوال</span><input value={createForm.mobile} onChange={e => setCreateForm({ ...createForm, mobile: e.target.value })} placeholder="99887766" inputMode="tel" dir="ltr" /></label>
              </div>
              <div className="seat-sheet-actions">
                <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" className="btn btn-primary" disabled={busy || createForm.name.trim().length < 3} onClick={() => void createSeat()}><Plus aria-hidden="true" /> أنشئ الكرسي</button>
                <button data-guide-ignore="تصفّح كراسي إدارة النظام واختيار أحدها؛ الكتابة من لوحة الكرسي ويحرسها الخادم" type="button" className="btn btn-ghost" onClick={() => setCreating(null)}>إلغاء</button>
              </div>
            </div>
          ) : selected ? <React.Fragment key={selected}><SeatPanel seatId={selected} onChanged={() => void load()} /></React.Fragment> : null}
        </section>
      </div>
    </div>
  );
}
