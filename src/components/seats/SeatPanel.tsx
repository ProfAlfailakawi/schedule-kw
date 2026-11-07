import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, BadgeCheck, Building2, CalendarClock, Crown, History, IdCard, KeyRound, Link2, RotateCcw, Search, Snowflake,
  UserCheck, UserMinus, UserPlus, UsersRound, X,
} from "lucide-react";
import SeatLinkCard, { SeatHolderCard } from "./SeatLinkCard";
import { invitationHref } from "../../utils/invitationLink";
import { memberCardModel, seatCaption, temporaryPasswordCardModel } from "../../utils/seatAccessCard";
import { handoverSearchTokens } from "../../utils/handoverPick";
import { SEAT_MEMBER_BADGE_LABEL, type SeatEventKind, type SeatMemberBadge } from "../../utils/seats";
import "../account-invitation.css";
import "./seats.css";

/**
 * ── لوحةُ الكرسي (docs/SEATS.md) ─────────────────────────────────────────────
 *
 * لوحةٌ واحدة لمدير النظام ولشاغل الكرسي: من يجلس عليه، والتسليم، والفريق (أعضاءُ
 * لجنة الجدول أو موظفو التسجيل) برابطٍ شخصيٍّ لكلٍّ منهم، والنائب، وتاريخُ الكرسي.
 * الخادمُ يقرّر ما يُسمح لكلٍّ منهما؛ واللوحةُ تعرض ما قاله.
 */

type Person = { name: string; instructorId?: number; mobile?: string; since?: string; by?: string };
type Member = Person & {
  id: string; status: "active" | "frozen" | "ended"; badge: SeatMemberBadge; civilTail?: string;
  scopeNames?: string[]; scopes?: Array<{ AdCollegeId: number; AdSectionId: number }>;
  hasLink: boolean; linkToken?: string; linkExpiresAt?: string; firstEnteredAt?: string; lastEnteredAt?: string; addedAt: string;
};
type Candidate = { id: number; name: string; hasMobile: boolean };
type Found = { id: number; name: string; department: string; hasPhone: boolean };
type ScopeTree = Array<{ collegeId: number; collegeName: string; sections: Array<{ sectionId: number; name: string }> }>;
export interface SeatDetail {
  seat: { id: number; login: string; name: string; role: string; roleLabel: string; active: boolean; mustChangePassword: boolean; firstPasswordExpiresAt?: string; firstPasswordExpired?: boolean; scopes: string[] };
  canReissuePassword?: boolean;
  canResetPassword?: boolean;
  holder: Person | null;
  deputy: { memberId: string; name: string; until: string } | null;
  team: null | { teamLabel: string; memberLabel: string; source: "department" | "manual"; scope: "seat" | "college" | "any"; members: Member[] };
  history: Array<{ at: string; kind: SeatEventKind; by: string; detail: string }>;
  canManage: boolean;
  canHandOver: boolean;
  holderSource: "department" | "college" | "all" | "manual";
  candidates?: Candidate[];
  scopeTree?: ScopeTree;
  /** لمدير النظام على كرسيّ «رئيس تسجيل الكلية»: الحرمُ كلُّها، وما عليه منها. */
  campusOptions?: Array<{ familyName: string; colleges: Array<{ collegeId: number; collegeName: string; chip: string; selected: boolean; takenElsewhere: boolean }> }> | null;
}

async function call<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`الخادم مشغول حالياً (${response.status}). أعد المحاولة بعد قليل.`); }
  if (!response.ok) throw new Error(body.error || "تعذّر تنفيذ العملية");
  return body as T;
}

const DAY = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
const STAMP = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayOf = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : DAY.format(d); };
const stampOf = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : STAMP.format(d); };
const initialOf = (name?: string) => String(name || "").trim().replace(/^(د|أ|م)\.\s*/, "").charAt(0) || "؟";
const origin = () => (typeof window !== "undefined" ? window.location.origin : "https://schedule-kw.com");

const EVENT_ICON: Record<SeatEventKind, React.ReactNode> = {
  "seat-created": <UsersRound />, "seat-colleges": <Building2 />, "holder-set": <Crown />, handover: <ArrowLeftRight />,
  "member-added": <UserPlus />, "member-continued": <UserCheck />, "member-ended": <UserMinus />, "member-frozen": <Snowflake />,
  "member-scopes": <UsersRound />, "link-issued": <Link2 />, "link-locked": <KeyRound />, "deputy-set": <BadgeCheck />, "deputy-ended": <CalendarClock />, "password-reset": <KeyRound />,
};
const EVENT_LABEL: Record<SeatEventKind, string> = {
  "seat-created": "أُنشئ الفريق", "seat-colleges": "تغيير الحرم", "holder-set": "سُجّل الرئيس", handover: "تسليم الرئاسة",
  "member-added": "عضوٌ جديد", "member-continued": "استمرار عضو", "member-ended": "انتهاء عضوية", "member-frozen": "تجميد الأعضاء",
  "member-scopes": "نطاق موظف", "link-issued": "رابطٌ جديد", "link-locked": "أُقفل رابط", "deputy-set": "تكليف نائب", "deputy-ended": "انتهاء النيابة", "password-reset": "إعادة تعيين كلمة السر",
};

type Sheet =
  | { kind: "handover" } | { kind: "holder" } | { kind: "add" } | { kind: "deputy" } | { kind: "campuses" } | { kind: "holderCard" }
  | { kind: "link"; title: string; subtitle?: string; url: string; mobile?: string; message: string; note?: string; fileStem?: string; credentials?: { login: string; password: string }; temporary?: boolean; after?: () => void };

function PersonPicker({ candidates, value, onPick, placeholder }: { candidates: Candidate[]; value: number | null; onPick: (id: number) => void; placeholder: string }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim();
    return (q ? candidates.filter(row => row.name.includes(q)) : candidates).slice(0, 60);
  }, [candidates, query]);
  return (
    <div className="seat-picker">
      <label className="seat-search"><Search aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>
      <div className="seat-picker-list" role="listbox" aria-label={placeholder}>
        {shown.length ? shown.map(row => (
          <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" key={row.id} role="option" aria-selected={value === row.id} className={value === row.id ? "on" : ""} onClick={() => onPick(row.id)}>
            <i aria-hidden="true">{initialOf(row.name)}</i><span>{row.name}</span>{row.hasMobile ? null : <small>بلا جوال</small>}
          </button>
        )) : <p className="seat-muted">لا أسماء مطابقة.</p>}
      </div>
    </div>
  );
}

/** الرئيس الجديد بالبحث: لا قائمة مقدّمة؛ اكتب حرفين فتظهر المطابقات، والمختار شارةٌ واحدة بزرّ إزالة. */
function HandoverPicker({ seatId, chosen, onChoose, placeholder }: { seatId: number; chosen: Found | null; onChoose: (row: Found | null) => void; placeholder: string }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Found[] | null>(null);
  const [failed, setFailed] = useState("");
  const ready = handoverSearchTokens(query).length > 0;
  useEffect(() => {
    if (!ready || chosen) { setRows(null); setFailed(""); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      call<{ people: Found[] }>(`/api/seats/${seatId}/handover-candidates?q=${encodeURIComponent(query.trim())}`)
        .then(result => { if (live) { setRows(result.people); setFailed(""); } })
        .catch((e: any) => { if (live) { setRows(null); setFailed(e.message); } });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query, ready, chosen, seatId]);
  if (chosen) {
    return (
      <div className="seat-picker">
        <span className="seat-chosen">
          <i aria-hidden="true">{initialOf(chosen.name)}</i>
          <span>{chosen.name}{chosen.department ? <small>{chosen.department}</small> : null}</span>
          <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" onClick={() => { onChoose(null); setQuery(""); }} aria-label="إزالة الاختيار"><X aria-hidden="true" /></button>
        </span>
      </div>
    );
  }
  return (
    <div className="seat-picker">
      <label className="seat-search"><Search aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoFocus /></label>
      {failed ? <p className="seat-error" role="alert">{failed}</p> : null}
      {ready && rows ? (
        rows.length ? (
          <div className="seat-picker-list" role="listbox" aria-label={placeholder}>
            {rows.map(row => (
              <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" key={row.id} role="option" aria-selected={false} onClick={() => onChoose(row)}>
                <i aria-hidden="true">{initialOf(row.name)}</i><span>{row.name}{row.department ? <small>{row.department}</small> : null}</span>
              </button>
            ))}
          </div>
        ) : <p className="seat-muted">لا أسماء مطابقة.</p>
      ) : null}
    </div>
  );
}

function ScopePicker({ tree, value, onChange }: { tree: ScopeTree; value: Set<string>; onChange: (next: Set<string>) => void }) {
  const toggle = (key: string) => { const next = new Set(value); if (next.has(key)) next.delete(key); else next.add(key); onChange(next); };
  return (
    <div className="seat-scope-tree" role="group" aria-label="النطاق">
      {tree.map(college => {
        const whole = value.has(`${college.collegeId}:0`);
        return (
          <details key={college.collegeId} open={tree.length === 1}>
            <summary>
              <label onClick={e => e.stopPropagation()}><input type="checkbox" checked={whole} onChange={() => toggle(`${college.collegeId}:0`)} /> {college.collegeName} <small>كاملة</small></label>
            </summary>
            <div className="seat-scope-sections">
              {college.sections.map(section => (
                <label key={section.sectionId} className={whole ? "muted" : ""}>
                  <input type="checkbox" disabled={whole} checked={whole || value.has(`${college.collegeId}:${section.sectionId}`)} onChange={() => toggle(`${college.collegeId}:${section.sectionId}`)} /> {section.name}
                </label>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export default function SeatPanel({ seatId, source = "seat", onChanged, compact = false }: { seatId: number | "mine"; source?: "seat" | "mine"; onChanged?: () => void; compact?: boolean }) {
  const [detail, setDetail] = useState<SeatDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [chosenMobile, setChosenMobile] = useState("");
  const [manual, setManual] = useState({ name: "", mobile: "", civil: "" });
  const [scopes, setScopes] = useState<Set<string>>(new Set());
  const [deputy, setDeputy] = useState({ memberId: "", until: "" });
  const [campuses, setCampuses] = useState<Set<number>>(new Set());
  const url = source === "mine" ? "/api/seats/mine" : `/api/seats/${seatId}`;

  const load = useCallback(async () => {
    setError("");
    try { setDetail(await call<SeatDetail>(url)); }
    catch (e: any) { setError(e.message); }
  }, [url]);
  useEffect(() => { setDetail(null); void load(); }, [load]);

  const id = detail?.seat.id;
  const closeSheet = () => { setSheet(null); setPick(null); setChosen(null); setChosenMobile(""); setManual({ name: "", mobile: "", civil: "" }); setScopes(new Set()); setDeputy({ memberId: "", until: "" }); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const showMemberLink = (name: string, token: string, mobile?: string, withTail = true, reset = false) => {
    const card = memberCardModel({ origin: origin(), token, name, memberLabel: detail?.team?.memberLabel, teamLabel: detail?.team?.teamLabel, seatName: detail?.seat.name || "", withTail, reset });
    setSheet({ kind: "link", title: name, subtitle: card.caption, url: card.url, mobile, message: card.message, note: card.note, fileStem: card.fileStem });
  };

  const personBody = (fromList: boolean) => fromList && chosen ? { instructorId: chosen.id, ...(chosen.hasPhone ? {} : { mobile: chosenMobile.trim() }) } : { name: manual.name.trim(), mobile: manual.mobile, civil: manual.civil };

  const handOver = (fromList: boolean) => run(async () => {
    const result = await call<{ login: string; password: string; holder: Person; seatName: string; selfHandover: boolean }>(`/api/seats/${id}/handover`, { method: "POST", body: JSON.stringify(personBody(fromList)) });
    const link = invitationHref(`${origin()}/`, result.login, result.password);
    setSheet({
      kind: "link", title: result.holder.name, subtitle: seatCaption(detail?.seat.roleLabel || "الرئيس الجديد", result.seatName), url: link, mobile: result.holder.mobile, fileStem: "SCHEDULE-seat",
      credentials: { login: result.login, password: result.password },
      message: [`أهلاً ${result.holder.name}`, `تسلّمتَ رئاسة فريق «${result.seatName}» في SCHEDULE.`, "ادخل من هذا الرابط، واختر كلمة سرّك الخاصة عند أول دخول:", link].join("\n"),
      after: result.selfHandover ? () => window.location.replace("/") : undefined,
    });
    onChanged?.();
    if (!result.selfHandover) await load();
  });
  const setHolder = (fromList: boolean) => run(async () => {
    await call(`/api/seats/${id}/holder`, { method: "POST", body: JSON.stringify(personBody(fromList)) });
    closeSheet(); onChanged?.(); await load();
  });
  const addMember = () => run(async () => {
    const team = detail!.team!;
    const body = team.source === "department" ? { instructorId: pick } : {
      ...personBody(false),
      scopes: [...scopes].map(key => { const [c, s] = key.split(":").map(Number); return { AdCollegeId: c, AdSectionId: s }; })
        .filter(row => row.AdSectionId === 0 || !scopes.has(`${row.AdCollegeId}:0`)),
    };
    const result = await call<{ token: string; mobile: string; member: Member }>(`/api/seats/${id}/members`, { method: "POST", body: JSON.stringify(body) });
    showMemberLink(result.member.name, result.token, result.mobile, Boolean(result.member.civilTail));
    onChanged?.(); await load();
  });
  const reissue = (member: Member) => run(async () => {
    const result = await call<{ token: string; mobile: string; name: string }>(`/api/seats/${id}/members/${member.id}/link`, { method: "POST" });
    showMemberLink(result.name, result.token, result.mobile, Boolean(member.civilTail));
    await load();
  });
  const resetMember = (member: Member) => run(async () => {
    if (!window.confirm(`إعادة تعيين دخول ${member.name}؟ يُبطَل رابطه الحالي ويخرج من كل جهاز، ويعمل الرابط الجديد 24 ساعة.`)) return;
    const result = await call<{ token: string; mobile: string; name: string }>(`/api/seats/${id}/members/${member.id}/reset`, { method: "POST" });
    showMemberLink(result.name, result.token, result.mobile, Boolean(member.civilTail), true);
    await load();
  });
  const resetHolder = () => run(async () => {
    const name = detail?.holder?.name || detail?.seat.name || "";
    if (!window.confirm(`إعادة تعيين كلمة سرّ ${name}؟ تسقط كلمته الحالية ويخرج من كل جهاز، ويبقى أعضاء الفريق داخلين.`)) return;
    const result = await call<{ login: string; password: string; seatName: string; roleLabel: string }>(`/api/seats/${id}/password-reset`, { method: "POST" });
    const card = temporaryPasswordCardModel({ origin: origin(), login: result.login, password: result.password, seatName: result.seatName, roleLabel: result.roleLabel, holderName: name });
    setSheet({ kind: "link", title: name, subtitle: card.caption, url: card.url, mobile: detail?.holder?.mobile, message: card.message, note: card.note, fileStem: card.fileStem, credentials: { login: result.login, password: result.password }, temporary: true });
    onChanged?.();
    await load();
  });
  const linkExpired = (member: Member) => Boolean(member.linkExpiresAt) && Date.parse(member.linkExpiresAt!) <= Date.now();
  const showLink = (member: Member) => member.linkToken && !linkExpired(member) ? showMemberLink(member.name, member.linkToken, member.mobile, Boolean(member.civilTail)) : void reissue(member);
  const setStatus = (member: Member, status: "active" | "ended") => run(async () => {
    if (status === "ended" && !window.confirm(`إنهاء عضوية ${member.name}؟ يُبطَل رابطه ويخرج من كل جهاز.`)) return;
    await call(`/api/seats/${id}/members/${member.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
    onChanged?.(); await load();
  });
  const saveDeputy = () => run(async () => {
    await call(`/api/seats/${id}/deputy`, { method: "POST", body: JSON.stringify(deputy) });
    closeSheet(); await load();
  });
  const saveCampuses = () => run(async () => {
    await call(`/api/seats/${id}/colleges`, { method: "POST", body: JSON.stringify({ collegeIds: [...campuses] }) });
    closeSheet(); onChanged?.(); await load();
  });
  const endDeputy = () => run(async () => { await call(`/api/seats/${id}/deputy/end`, { method: "POST" }); await load(); });

  if (error && !detail) return <div className="seat-panel seat-panel-empty"><p className="seat-error" role="alert">{error}</p></div>;
  if (!detail) return <div className="seat-panel seat-panel-empty" aria-busy="true"><div className="seat-skeleton" /><div className="seat-skeleton short" /></div>;
  if (!detail.seat) return <div className="seat-panel seat-panel-empty"><p className="seat-muted">هذا الحساب ليس فريقاً.</p></div>;

  const team = detail.team;
  const live = team?.members.filter(m => m.status !== "ended") || [];
  const ended = team?.members.filter(m => m.status === "ended") || [];
  const frozen = live.filter(m => m.status === "frozen");
  const activeMembers = live.filter(m => m.status === "active");
  const manualValid = manual.name.trim().length >= 3;
  const today = new Date().toISOString().slice(0, 10);

  /* أساتذةُ القسم أو الكلية: بالبحث وحده ومن الأساتذة القائمين فقط؛ ومكتبُ التسجيل (موظفون لا أساتذة) يُكتب اسمُه. */
  const fromList = detail.holderSource !== "manual";
  const phoneNeeded = fromList && Boolean(chosen) && !chosen!.hasPhone;
  const personReady = fromList ? Boolean(chosen) && (!phoneNeeded || chosenMobile.replace(/\D/g, "").length >= 8) : manualValid;
  const personForm = () => (
    fromList ? (
      <>
        <HandoverPicker seatId={detail.seat.id} chosen={chosen} onChoose={row => { setChosen(row); setChosenMobile(""); }} placeholder="ابحث باسم العضو" />
        {phoneNeeded ? (
          <label className="seat-phone-need"><span>لا جوال له في السجل. اكتب جواله</span><input value={chosenMobile} onChange={e => setChosenMobile(e.target.value)} placeholder="99887766" inputMode="tel" dir="ltr" autoComplete="off" /></label>
        ) : null}
      </>
    ) : (
      <div className="seat-form-grid">
        <label><span>الاسم</span><input value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} placeholder="الاسم كاملاً" autoComplete="off" /></label>
        <label><span>الجوال</span><input value={manual.mobile} onChange={e => setManual({ ...manual, mobile: e.target.value })} placeholder="99887766" inputMode="tel" dir="ltr" /></label>
      </div>
    )
  );

  return (
    <div className={`seat-panel ${compact ? "compact" : ""}`.trim()}>
      <header className="seat-hero">
        <span className="seat-role-chip"><UsersRound aria-hidden="true" />{detail.seat.roleLabel}</span>
        <h2>{detail.seat.name}</h2>
        <p>
          {detail.seat.scopes.length ? detail.seat.scopes.slice(0, 3).join("، ") : "كل الكليات"}
          {detail.seat.scopes.length > 3 ? ` و${detail.seat.scopes.length - 3} غيرها` : ""}
          <span className="seat-login" dir="ltr">{detail.seat.login}</span>
        </p>
        {detail.seat.mustChangePassword ? <span className="seat-flag"><KeyRound aria-hidden="true" /> {detail.seat.firstPasswordExpired ? "انتهت الكلمة الأولى" : "ينتظر أن يختار رئيسه كلمة سرّه"}</span> : null}
      </header>

      {error ? <p className="seat-error" role="alert">{error}</p> : null}

      {detail.campusOptions ? (
        <section className="seat-campuses" aria-label="الحرم">
          <Building2 aria-hidden="true" />
          <div>
            <small>الحرم التي يتابعها</small>
            <span>{detail.campusOptions.flatMap(family => family.colleges.filter(c => c.selected).map(c => family.colleges.length > 1 ? `${family.familyName} · ${c.chip}` : c.collegeName)).join("، ") || "لا حرم"}</span>
          </div>
          <button type="button" data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => {
            setCampuses(new Set(detail.campusOptions!.flatMap(family => family.colleges.filter(c => c.selected).map(c => c.collegeId))));
            setSheet({ kind: "campuses" });
          }}>تعديل الحرم</button>
        </section>
      ) : null}

      <section className="seat-holder" aria-label="رئيس الفريق">
        <div className={`seat-avatar ${detail.holder ? "" : "empty"}`} aria-hidden="true">{detail.holder ? initialOf(detail.holder.name) : <UsersRound />}</div>
        <div className="seat-holder-text">
          <small>رئيس الفريق</small>
          <strong>{detail.holder ? detail.holder.name : "لم يُسجَّل رئيس هذا الفريق بعد"}</strong>
          {detail.holder?.since ? <span>منذ {dayOf(detail.holder.since)}</span> : null}
        </div>
        <div className="seat-holder-actions">
          {detail.canResetPassword ? <button data-guide-ignore="إعادة تعيين كلمة سرّ رئيس الفريق؛ لمدير النظام ويحرسها الخادم" type="button" className="btn btn-ghost" onClick={() => void resetHolder()} disabled={busy}><RotateCcw aria-hidden="true" /> إعادة تعيين</button> : null}
          {detail.canHandOver ? <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-primary" onClick={() => setSheet({ kind: "handover" })} disabled={busy}><ArrowLeftRight aria-hidden="true" /> تسليم الرئاسة</button> : null}
          {detail.canManage && source === "seat" ? <button data-guide-ignore="يعرض بطاقة دخول رئيس الفريق لإرسالها إليه؛ لا يغيّر كلمة المرور ولا بيانات" type="button" className="btn btn-secondary" onClick={() => setSheet({ kind: "holderCard" })} disabled={busy}><IdCard aria-hidden="true" /> البطاقة</button> : null}
          {detail.canManage && source === "seat" && !detail.holder ? <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-secondary" onClick={() => setSheet({ kind: "holder" })} disabled={busy}><Crown aria-hidden="true" /> سجّل الرئيس الحالي</button> : null}
        </div>
      </section>

      {team ? (
        <section className="seat-team" aria-label={team.teamLabel}>
          <header>
            <h3><UsersRound aria-hidden="true" />{team.teamLabel}</h3>
            <span className="seat-count">{activeMembers.length} يعمل{frozen.length ? ` · ${frozen.length} مجمَّد` : ""}</span>
            {detail.canManage ? <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-secondary btn-sm" onClick={() => setSheet({ kind: "add" })} disabled={busy}><UserPlus aria-hidden="true" /> إضافة</button> : null}
          </header>
          {frozen.length && detail.canManage ? (
            <div className="seat-frozen-banner"><Snowflake aria-hidden="true" /><div><strong>تسلّمتَ رئاسة الفريق حديثاً</strong><span>اختر لكلّ عضو: «مستمر» فيعود برابطه نفسه، أو «انتهت عضويته».</span></div></div>
          ) : null}
          {live.length ? (
            <ul className="seat-members">
              {live.map(member => (
                <li key={member.id} data-badge={member.badge}>
                  <i className="seat-member-avatar" aria-hidden="true">{initialOf(member.name)}</i>
                  <div className="seat-member-text">
                    <strong>{member.name}{detail.deputy?.memberId === member.id ? <em className="seat-deputy-tag">نائب حتى {detail.deputy.until}</em> : null}</strong>
                    <span className="seat-badge" data-badge={member.badge}><b aria-hidden="true" />{SEAT_MEMBER_BADGE_LABEL[member.badge]}{member.lastEnteredAt ? ` · آخر دخول ${stampOf(member.lastEnteredAt)}` : ""}</span>
                    {member.scopeNames?.length ? <span className="seat-member-scopes">{member.scopeNames.join("، ")}</span> : null}
                  </div>
                  {detail.canManage ? (
                    <div className="seat-member-actions">
                      {member.status === "frozen" ? (
                        <>
                          <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-primary btn-sm" onClick={() => void setStatus(member, "active")} disabled={busy}><UserCheck aria-hidden="true" /> مستمر</button>
                          <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost btn-sm" onClick={() => void setStatus(member, "ended")} disabled={busy}><UserMinus aria-hidden="true" /> انتهت عضويته</button>
                        </>
                      ) : (
                        <>
                          <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-secondary btn-sm" onClick={() => showLink(member)} disabled={busy}><Link2 aria-hidden="true" /> الرابط</button>
                          <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost btn-sm" onClick={() => void resetMember(member)} disabled={busy}><RotateCcw aria-hidden="true" /> إعادة تعيين</button>
                          <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="icon-btn danger" title="إنهاء العضوية" aria-label={`إنهاء عضوية ${member.name}`} onClick={() => void setStatus(member, "ended")} disabled={busy}><UserMinus aria-hidden="true" /></button>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="seat-empty-line">لا أحد في الفريق بعد.{detail.canManage ? " أضف الأعضاء ليعمل كلٌّ منهم باسمه." : ""}</p>}
          {ended.length ? (
            <details className="seat-ended">
              <summary>انتهت عضويتهم ({ended.length})</summary>
              <ul>{ended.map(member => (
                <li key={member.id}><span>{member.name}</span>{detail.canManage ? <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost btn-sm" onClick={() => void setStatus(member, "active")} disabled={busy}>أعده</button> : null}</li>
              ))}</ul>
            </details>
          ) : null}
          {detail.canManage && activeMembers.length ? (
            <div className="seat-deputy">
              <BadgeCheck aria-hidden="true" />
              {detail.deputy
                ? <><span><strong>{detail.deputy.name}</strong> ينوب عنك ويوقّع حتى {detail.deputy.until}</span><button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost btn-sm" onClick={() => void endDeputy()} disabled={busy}>إنهاء النيابة</button></>
                : <><span>في إجازة أو تفرغ؟ كلّف عضواً ينوب عنك ويوقّع حتى تاريخٍ تحدّده.</span><button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: "deputy" })} disabled={busy}>تكليف نائب</button></>}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="seat-timeline" aria-label="تاريخ الفريق">
        <h3><History aria-hidden="true" />تاريخ الفريق</h3>
        {detail.history.length ? (
          <ol>
            {detail.history.slice(0, compact ? 8 : 40).map((event, index) => (
              <li key={`${event.at}-${index}`} data-kind={event.kind}>
                <i aria-hidden="true">{EVENT_ICON[event.kind] || <History />}</i>
                <div><strong>{EVENT_LABEL[event.kind] || event.kind}</strong><span>{event.detail}</span><small>{stampOf(event.at)} · {event.by}</small></div>
              </li>
            ))}
          </ol>
        ) : <p className="seat-empty-line">لا شيء بعد. يبدأ التاريخ بتسجيل الرئيس.</p>}
      </section>

      {sheet ? (
        <div className="seat-sheet-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && sheet.kind !== "link" && sheet.kind !== "holderCard") closeSheet(); }}>
          <div className={`seat-sheet ${sheet.kind === "link" || sheet.kind === "holderCard" ? "is-card" : ""}`.trim()} role="dialog" aria-modal="true" aria-label={sheet.kind === "link" ? sheet.title : sheet.kind === "holderCard" ? `بطاقة الدخول: ${detail.holder?.name || ""}` : "الفريق"}>
            <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="seat-sheet-close" onClick={() => { const after = sheet.kind === "link" ? sheet.after : undefined; closeSheet(); after?.(); }} aria-label="إغلاق"><X aria-hidden="true" /></button>
            {sheet.kind === "link" ? (
              <SeatLinkCard title={sheet.title} subtitle={sheet.subtitle} url={sheet.url} mobile={sheet.mobile} message={sheet.message} credentials={sheet.credentials} temporary={sheet.temporary} note={sheet.note} fileStem={sheet.fileStem}
                onDone={() => { const after = sheet.after; closeSheet(); after?.(); }} />
            ) : null}
            {/* فريقٌ بلا رئيسٍ مسجَّل: البطاقة باسم الكرسي، كما كانت في «المستخدمون»، فلا يبقى حسابٌ بلا بطاقة. */}
            {sheet.kind === "holderCard" ? (
              <SeatHolderCard origin={origin()} seat={detail.seat} holder={detail.holder || { name: detail.seat.name }} onDone={closeSheet}
                onReissue={detail.canReissuePassword ? async () => {
                  const result = await call<{ password: string }>(`/api/seats/${id}/first-password`, { method: "POST" });
                  onChanged?.(); void load();
                  return result.password;
                } : undefined} />
            ) : null}
            {sheet.kind === "handover" ? (
              <>
                <h3 className="seat-sheet-title"><ArrowLeftRight aria-hidden="true" />تسليم {detail.seat.name}</h3>
                <p className="seat-sheet-lead">اختر الرئيس الجديد. تُصدَر له الكلمة الأولى الافتراضية لسبعة أيام، ويغيّرها عند أول دخول، ويخرج كل جهازٍ مفتوح على حساب الفريق{team ? "، ويُجمَّد الأعضاء حتى يقرّر من يستمر" : ""}.</p>
                {personForm()}
                <div className="seat-sheet-actions">
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-primary" disabled={busy || !personReady} onClick={() => void handOver(fromList)}><ArrowLeftRight aria-hidden="true" /> سلّم الرئاسة</button>
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost" onClick={closeSheet}>إلغاء</button>
                </div>
              </>
            ) : null}
            {sheet.kind === "holder" ? (
              <>
                <h3 className="seat-sheet-title"><Crown aria-hidden="true" />من رئيس هذا الفريق اليوم؟</h3>
                <p className="seat-sheet-lead">تسجيلٌ فقط: لا تتغيّر كلمة السر ولا يخرج أحد. ويبدأ بها تاريخ الفريق.</p>
                {personForm()}
                <div className="seat-sheet-actions">
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-primary" disabled={busy || !personReady} onClick={() => void setHolder(fromList)}><Crown aria-hidden="true" /> سجّل</button>
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost" onClick={closeSheet}>إلغاء</button>
                </div>
              </>
            ) : null}
            {sheet.kind === "add" && team ? (
              <>
                <h3 className="seat-sheet-title"><UserPlus aria-hidden="true" />{team.memberLabel} جديد</h3>
                {team.source === "department" ? (
                  <>
                    <p className="seat-sheet-lead">من أساتذة القسم. يصله رابطٌ شخصي، ويؤكّد عند فتحه آخر أربعة أرقام من رقمه المدني.</p>
                    <PersonPicker candidates={(detail.candidates || []).filter(row => !live.some(m => m.instructorId === row.id) && row.id !== detail.holder?.instructorId)} value={pick} onPick={setPick} placeholder="ابحث في أساتذة القسم" />
                  </>
                ) : (
                  <>
                    <p className="seat-sheet-lead">يصله رابطٌ شخصي. ويُحفظ من رقمه المدني آخر أربعة أرقام فقط، ليؤكّدها عند فتح الرابط.</p>
                    <div className="seat-form-grid three">
                      <label><span>الاسم</span><input value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} placeholder="الاسم كاملاً" autoComplete="off" /></label>
                      <label><span>الجوال</span><input value={manual.mobile} onChange={e => setManual({ ...manual, mobile: e.target.value })} placeholder="99887766" inputMode="tel" dir="ltr" /></label>
                      <label><span>الرقم المدني</span><input value={manual.civil} onChange={e => setManual({ ...manual, civil: e.target.value })} placeholder="اختياري" inputMode="numeric" dir="ltr" autoComplete="off" /></label>
                    </div>
                    <span className="seat-field-label">ما يتابعه</span>
                    <ScopePicker tree={detail.scopeTree || []} value={scopes} onChange={setScopes} />
                  </>
                )}
                <div className="seat-sheet-actions">
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-primary" disabled={busy || (team.source === "department" ? !pick : !manualValid || !scopes.size)} onClick={() => void addMember()}><UserPlus aria-hidden="true" /> أضف وأصدر رابطه</button>
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost" onClick={closeSheet}>إلغاء</button>
                </div>
              </>
            ) : null}
            {sheet.kind === "campuses" && detail.campusOptions ? (
              <>
                <h3 className="seat-sheet-title"><Building2 aria-hidden="true" />الحرم التي يتابعها الفريق</h3>
                <p className="seat-sheet-lead">فريقٌ واحد لحرمٍ أو أكثر. الحرمُ الذي له رئيس تسجيلٍ آخر لا يُختار هنا. ونطاقُ الموظفين يتبع الفريق: ما يُرفع عنه يسقط من نطاقهم.</p>
                <div className="seat-campus-families">
                  {detail.campusOptions.map(family => (
                    <fieldset key={family.familyName}>
                      <legend>{family.familyName}</legend>
                      {family.colleges.map(college => (
                        <label key={college.collegeId} className={college.takenElsewhere ? "muted" : ""}>
                          <input type="checkbox" disabled={college.takenElsewhere} checked={campuses.has(college.collegeId)} onChange={() => {
                            const next = new Set(campuses);
                            if (next.has(college.collegeId)) next.delete(college.collegeId); else next.add(college.collegeId);
                            setCampuses(next);
                          }} /> {college.chip}{college.takenElsewhere ? <small> · له رئيس تسجيل آخر</small> : null}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                <div className="seat-sheet-actions">
                  <button type="button" data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" className="btn btn-primary" disabled={busy || !campuses.size} onClick={() => void saveCampuses()}><Building2 aria-hidden="true" /> احفظ الحرم</button>
                  <button type="button" data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" className="btn btn-ghost" onClick={closeSheet}>إلغاء</button>
                </div>
              </>
            ) : null}
            {sheet.kind === "deputy" && team ? (
              <>
                <h3 className="seat-sheet-title"><BadgeCheck aria-hidden="true" />تكليف نائب</h3>
                <p className="seat-sheet-lead">ينوب عنك ويوقّع باسمه «نائباً عنك» حتى آخر يومٍ تحدّده، ثم تعود الصلاحية إليك وحدك.</p>
                <div className="seat-picker-list" role="listbox" aria-label="النائب">
                  {activeMembers.map(member => (
                    <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" key={member.id} role="option" aria-selected={deputy.memberId === member.id} className={deputy.memberId === member.id ? "on" : ""} onClick={() => setDeputy({ ...deputy, memberId: member.id })}>
                      <i aria-hidden="true">{initialOf(member.name)}</i><span>{member.name}</span>
                    </button>
                  ))}
                </div>
                <label className="seat-date"><span>حتى</span><input type="date" min={today} value={deputy.until} onChange={e => setDeputy({ ...deputy, until: e.target.value })} /></label>
                <div className="seat-sheet-actions">
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-primary" disabled={busy || !deputy.memberId || !deputy.until} onClick={() => void saveDeputy()}><BadgeCheck aria-hidden="true" /> كلّف</button>
                  <button data-guide-ignore="إجراء في لوحة الفريق (الرئيس والأعضاء والنائب)؛ يحرسه الخادم بصلاحية رئيس الفريق أو مدير النظام" type="button" className="btn btn-ghost" onClick={closeSheet}>إلغاء</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
