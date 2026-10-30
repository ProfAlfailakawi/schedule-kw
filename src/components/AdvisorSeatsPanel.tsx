/**
 * L3 — «🎟️ رصيد مقاعد المرشد».
 * لكل شعبة حلقةٌ «60 + 4/10» (أخضر/أصفر/أحمر)، وزرّ +1/+3 يضيف ذرّياً في الخادم، ورسالةٌ بأيقونة
 * («أضفت 3 · متبقي 7»، «آخر مقعدين»، «الشعبة ممتلئة» + شعبٌ بديلة)، وطلب استثناء للمسؤول.
 * المسؤول: السعة الأساسية، والرصيد (عام/مقرر/شعبة)، والتوزيع العادل، ولوحة القريب من الامتلاء.
 * الحساب كلّه: src/utils/advisorSeats.ts.
 */
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { useEffect, useMemo, useState } from "react";
import { Ticket } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";
import CampusChip from "./CampusChip";
import { ColleagueWorkNotice } from "./ColleagueHoldNotice";
import { useStaleWrite } from "./StaleWriteToast";
import { useTeamPeers, useTeamWork } from "../hooks/useTeamWork";
import { onLiveSignal } from "../utils/livePulse";
import { isStaleWrite } from "../utils/staleWrite";
import { workClashes, type WorkMark } from "../utils/teamWork";

type State = { capacity: number; quota: number; hardCap: number; limitedBy: "quota" | "room"; advisorAdded: number; remaining: number; fairShare?: number; tone: "green" | "yellow" | "red"; ringLabel: string };
type Section = { key: string; courseId: number; courseName: string; section: string; time: string; state: State; ledger: { roomCapacity?: number | null };
  /** ختمُ الإصدار: عددُ الإضافات التي رأيتُها (src/utils/staleWrite.ts). */
  rev?: number };
type Payload = {
  config: { global: number; capacityDefault?: number; fairSplit: boolean; advisorCount?: number; byCourse: Record<string, number>; bySection: Record<string, number>; rev?: number };
  sections: Section[]; nearFull: Array<{ key: string; state: State; byAdvisor: Array<{ name: string; count: number }> }>;
  requests: Array<{ id: string; key: string; count: number; note: string; at: string; by: string; status: string }>; canConfigure: boolean;
};

function Ring({ state }: { state: State }) {
  const extra = Math.max(0, state.hardCap - state.capacity);
  const p = extra ? Math.round((state.advisorAdded / extra) * 100) : 100;
  return <span className="of-ring" data-tone={state.tone} style={{ ["--p" as any]: p }} title={state.ringLabel} aria-label={`السعة ${state.ringLabel}`}><b>{state.capacity}+{state.advisorAdded}/{extra}</b></span>;
}

export default function AdvisorSeatsPanel({ collegeId, sectionId, termId, collegeName }: { collegeId: number; sectionId: number; termId: number; collegeName?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<Record<string, { tone: "ok" | "warn" | "bad"; text: string; alternatives?: Array<{ key: string; section: string; time: string; remaining: number }> }>>({});
  const [busy, setBusy] = useState("");
  const [cfg, setCfg] = useState<Payload["config"] | null>(null);
  const load = async () => {
    try {
      const response = await fetch(`/api/advisor-seats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "تعذّر القراءة");
      setData(payload); setCfg(payload.config);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { if (collegeId && sectionId && termId) void load(); }, [collegeId, sectionId, termId]);
  /* «زميلان يعملان الآن»: مقاعدُ المقرر الذي لمستُه قبل دقيقة هي ما أعمل عليه، ومن يعمل على
     مقاعد المقرر نفسه يُقال على بطاقته. وحفظُ زميلٍ يصل بلا إعادة تحميل (نبضة «work»). */
  const { peers } = useTeamPeers();
  const [touched, setTouched] = useState<WorkMark | null>(null);
  useEffect(() => {
    if (!touched) return;
    const timer = window.setTimeout(() => setTouched(null), 60_000);
    return () => window.clearTimeout(timer);
  }, [touched]);
  useTeamWork(touched);
  const touch = (s: Section) => setTouched(current => current?.id === String(s.courseId) ? current : { kind: "advisorSeats", id: String(s.courseId), label: s.courseName.slice(0, 40) });
  useEffect(() => onLiveSignal(["work"], () => { if (collegeId && sectionId && termId) void load(); }), [collegeId, sectionId, termId]);
  const { staleToast, catchStale } = useStaleWrite(() => load());
  const add = async (key: string, count: number) => {
    setBusy(key);
    const seen = data?.sections.find(s => s.key === key);
    if (seen) touch(seen);
    try {
      const response = await fetch("/api/advisor-seats/add", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, key, count, rev: seen?.rev }) });
      const out = await response.json();
      /* أضاف زميلٌ قبلي: لا «أضفت» ولا «ممتلئة» — «حدّث ثم أعد» بلمسة. */
      if (isStaleWrite(out)) { catchStale(Object.assign(new Error(out.error), { code: out.code })); return; }
      setMsg(current => ({ ...current, [key]: { tone: out.ok ? (out.icon === "⚠️" ? "warn" : "ok") : "bad", text: `${out.icon || (out.ok ? "✅" : "⛔")} ${out.message || out.error || ""}`, alternatives: out.alternatives } }));
      await load();
    } finally { setBusy(""); }
  };
  const askException = async (key: string) => {
    setBusy(key);
    try {
      const response = await fetch("/api/advisor-seats/exception", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, key, count: 1 }) });
      const out = await response.json();
      setMsg(current => ({ ...current, [key]: { tone: response.ok ? "warn" : "bad", text: response.ok ? `📨 ${out.hint}` : `⛔ ${out.error}` } }));
      await load();
    } finally { setBusy(""); }
  };
  const saveConfig = async () => {
    if (!cfg) return;
    setBusy("config");
    try {
      const response = await fetch("/api/advisor-seats/config", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, config: cfg, rev: data?.config.rev ?? 0 }) });
      if (!response.ok) {
        const out = await response.json().catch(() => ({}));
        if (isStaleWrite(out)) { catchStale(Object.assign(new Error(out.error), { code: out.code })); return; }
        throw new Error(out?.error || "تعذّر الحفظ");
      }
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  };
  const totals = useMemo(() => {
    const list = data?.sections || [];
    return { full: list.filter(s => s.state.tone === "red").length, near: list.filter(s => s.state.tone === "yellow").length, added: list.reduce((n, s) => n + s.state.advisorAdded, 0) };
  }, [data]);
  if (!data) return <section className="of-section" role="status">{error || "…"}</section>;
  const label = (key: string) => { const s = data.sections.find(x => x.key === key); return s ? `${s.courseName} · ${s.section}` : key; };
  const shown = data.sections.filter(s => !query || `${s.courseName} ${s.section}`.includes(query));
  return (
    <section className="of-section" aria-label="رصيد مقاعد المرشد">
      <h4><Ticket aria-hidden="true" /> 🎟️ رصيد مقاعد المرشد <CampusChip collegeName={collegeName} /></h4>
      <div className="of-kpis">
        <div className="of-kpi"><span className="of-ic">🎟️</span><b>{totals.added}</b><span>المقاعد المضافة</span></div>
        <div className="of-kpi"><span className="of-ic">🟡</span><b>{totals.near}</b><span>قريبة من الامتلاء</span></div>
        <div className="of-kpi"><span className="of-ic">🔴</span><b>{totals.full}</b><span>ممتلئة</span></div>
        {data.config.fairSplit ? <div className="of-kpi"><span className="of-ic">⚖️</span><span>توزيع عادل</span></div> : null}
      </div>
      {!data.config.capacityDefault ? <p className="of-msg" data-tone="warn">⚠️ لم تُحدَّد السعة الأساسية للشعب بعد{data.canConfigure ? " — حدّدها أدناه" : " — يحدّدها المسؤول"}.</p> : null}
      {data.canConfigure && cfg ? (
        <div className="of-row" style={{ marginBottom: 10 }}>
          <label>🪑 السعة الأساسية<input type="number" min={1} max={500} value={cfg.capacityDefault || ""} onChange={e => setCfg({ ...cfg, capacityDefault: Number(e.target.value) })} /></label>
          <label>🎟️ رصيد المرشدين<input type="number" min={0} max={200} value={cfg.global} onChange={e => setCfg({ ...cfg, global: Number(e.target.value) })} /></label>
          <button data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" className="of-chip" aria-pressed={cfg.fairSplit} onClick={() => setCfg({ ...cfg, fairSplit: !cfg.fairSplit })}>⚖️ توزيع عادل</button>
          {cfg.fairSplit ? <label>👥 عدد المرشدين<input type="number" min={1} max={50} value={cfg.advisorCount || ""} onChange={e => setCfg({ ...cfg, advisorCount: Number(e.target.value) })} /></label> : null}
          <PrimaryButton data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" disabled={busy === "config"} onClick={() => void saveConfig()}>حفظ</PrimaryButton>
        </div>
      ) : null}
      <input type="search" placeholder="بحث عن مقرر…" value={query} onChange={e => setQuery(e.target.value)} style={{ minHeight: 38, borderRadius: 10, border: "1px solid var(--line)", padding: "4px 10px", font: "inherit", marginBottom: 10, width: "100%", maxWidth: 320 }} />
      <div className="of-grid">
        {shown.map(s => (
          <div className="of-card" key={s.key} onFocusCapture={() => touch(s)}>
            <header><div><b>{s.courseName}</b><small> · شعبة {s.section}</small><br /><small><bdi dir="ltr">{s.time}</bdi>{s.state.limitedBy === "room" ? " · 🏫 سقف القاعة" : ""}</small></div><Ring state={s.state} /></header>
            <div className="of-row">
              <SecondaryButton data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" disabled={!!busy || s.state.remaining <= 0 || !s.state.capacity} onClick={() => void add(s.key, 1)}>+1</SecondaryButton>
              <SecondaryButton data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" disabled={!!busy || s.state.remaining < 3 || !s.state.capacity} onClick={() => void add(s.key, 3)}>+3</SecondaryButton>
              <span>{s.state.remaining > 0 ? `متبقٍّ ${s.state.remaining}` : "🔴 ممتلئة"}{s.state.fairShare !== undefined ? ` · نصيبك ${s.state.fairShare}` : ""}</span>
            </div>
            <ColleagueWorkNotice clashes={workClashes(peers, { kind: "advisorSeats", id: String(s.courseId) })} className="of-colleague" />
            {msg[s.key] ? <div className="of-msg" data-tone={msg[s.key].tone} role="status">{msg[s.key].text}</div> : null}
            {msg[s.key]?.alternatives?.length ? <div className="of-chips">{msg[s.key].alternatives!.map(a => <span className="of-chip" key={a.key}>↪️ شعبة {a.section} · <bdi dir="ltr">{a.time}</bdi> · {countOf(a.remaining, AR.seat)}</span>)}</div> : null}
            {s.state.remaining <= 0 ? <button data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" className="of-chip" disabled={!!busy} onClick={() => void askException(s.key)}>📨 طلب استثناء</button> : null}
          </div>
        ))}
      </div>
      {data.canConfigure && (data.nearFull.length || data.requests.length) ? (
        <div className="of-section">
          <h4>📊 القريبة من الامتلاء · من أضاف</h4>
          <table className="of-table"><thead><tr><th>الشعبة</th><th>المتبقي</th><th>المرشدون</th></tr></thead><tbody>
            {data.nearFull.map(row => <tr key={row.key}><td>{label(row.key)}</td><td>{row.state.remaining ? row.state.remaining : "🔴 0"}</td><td>{row.byAdvisor.map(a => `${a.name} (${a.count})`).join("، ") || "—"}</td></tr>)}
          </tbody></table>
          {data.requests.length ? <><h4 style={{ marginTop: 12 }}>📨 طلبات استثناء</h4><div className="of-chips">{data.requests.map(r => <span className="of-chip" key={r.id}>📨 {label(r.key)} · {r.by} · +{r.count} — 💡 فتح شعبة جديدة؟</span>)}</div></> : null}
        </div>
      ) : null}
      {error ? <p className="of-msg" data-tone="bad">⛔ {error}</p> : null}
      {staleToast}
    </section>
  );
}
