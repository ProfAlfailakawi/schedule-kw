/**
 * L3 — «🎟️ رصيد مقاعد المرشد».
 * لكل شعبة حلقةٌ «60 + 4/10» (أخضر/أصفر/أحمر)، وزرّ +1/+3 يضيف ذرّياً في الخادم، ورسالةٌ بأيقونة
 * («أضفت 3 · متبقي 7»، «آخر مقعدين»، «الشعبة ممتلئة» + شعبٌ بديلة)، وطلب استثناء للمسؤول.
 * المسؤول: السعة الأساسية، والرصيد (عام/مقرر/شعبة)، والتوزيع العادل، ولوحة القريب من الامتلاء، والبتّ في الاستثناء.
 * المرشد: يتراجع عن آخر إضافةٍ له هو (لا عن إضافة زميل). وفي فصلٍ سابق: قراءةٌ بلا كتابة.
 * الحساب كلّه: src/utils/advisorSeats.ts.
 */
import { AR, countOf } from "../utils/arabicCount";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ticket } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";
import CampusChip from "./CampusChip";
import CourseTags from "./CourseTags";
import { ColleagueWorkNotice } from "./ColleagueHoldNotice";
import { useStaleWrite } from "./StaleWriteToast";
import { useTeamPeers, useTeamWork } from "../hooks/useTeamWork";
import { onLiveSignal } from "../utils/livePulse";
import { configAfterLoad, isStaleWrite } from "../utils/staleWrite";
import { workClashes, type WorkMark } from "../utils/teamWork";
import { SEAT_CONFIG_MAX } from "../utils/advisorSeats";

type State = { capacity: number; quota: number; hardCap: number; limitedBy: "quota" | "room"; advisorAdded: number; remaining: number; fairShare?: number; tone: "green" | "yellow" | "red"; ringLabel: string };
type Section = { key: string; courseId: number; courseName: string; section: string; time: string; state: State; ledger: { roomCapacity?: number | null };
  /** ختمُ الإصدار: عددُ الإضافات التي رأيتُها (src/utils/staleWrite.ts). */
  rev?: number;
  /** ما أضفتُه أنا في الشعبة، وآخرُ إضافةٍ لي (للتراجع عنها). */
  mine?: { added: number; last: number } };
type SeatRequest = { id: string; key: string; count: number; note: string; at: string; by: string; status: string; resolvedBy?: string; resolution?: string };
type Payload = {
  config: { global: number; capacityDefault?: number; fairSplit: boolean; advisorCount?: number; byCourse: Record<string, number>; bySection: Record<string, number>; rev?: number };
  sections: Section[]; nearFull: Array<{ key: string; state: State; byAdvisor: Array<{ name: string; count: number }> }>;
  requests: SeatRequest[]; canConfigure: boolean;
  /** يضيف ويتراجع ويطلب استثناءً (المرشد أو صفةٌ تكتب) — حكمُ الخادم نفسه، فلا يُرسم زرٌّ يُردّ. */
  canAdd?: boolean;
  /** أقصى ما يُحفظ في الإعداد: الحدُّ نفسه في الخادم. */
  maxConfig?: number;
  /** فصلٌ سابق: قراءةٌ بلا كتابة. */
  frozen?: boolean;
};
type Message = { tone: "ok" | "warn" | "bad"; text: string; alternatives?: Array<{ key: string; section: string; time: string; remaining: number }> };

const STATUS_LABEL: Record<string, string> = { pending: "عند المسؤول", approved: "وافق المسؤول", declined: "اعتذر المسؤول" };

function Ring({ state }: { state: State }) {
  const extra = Math.max(0, state.hardCap - state.capacity);
  const p = extra ? Math.round((state.advisorAdded / extra) * 100) : 100;
  return <span className="of-ring" data-tone={state.tone} style={{ ["--p" as any]: p }} title={state.ringLabel} aria-label={`السعة ${state.ringLabel}`}><b>{state.capacity}+{state.advisorAdded}/{extra}</b></span>;
}

/** يقرأ ردّ الخادم ولو لم يكن JSON (خطأُ شبكةٍ أو بوابة): لا يُسقط الزرَّ في صمت. */
async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { error: response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).` }; }
}

export default function AdvisorSeatsPanel({ collegeId, sectionId, termId, collegeName }: { collegeId: number; sectionId: number; termId: number; collegeName?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<Record<string, Message>>({});
  const [busy, setBusy] = useState("");
  const [cfg, setCfg] = useState<Payload["config"] | null>(null);
  /* طلبُ استثناءٍ يُكتب في مكانه: العدد (1–50) وسطرٌ للمسؤول، ثم يُرسل. */
  const [asking, setAsking] = useState<{ key: string; count: number; note: string } | null>(null);
  /* مسوّدةُ إعدادٍ لم تُحفظ لا يمحوها تحديثٌ حيّ: حفظُ زميلٍ يُحدّث الشعبَ والأرقام، والمسوّدةُ تبقى
     بختم الإصدار الذي بدأت منه (cfg.rev) — فإن تقدّم الخادمُ ردّ حفظَها بـ«حدّث ثم أعد». */
  const cfgDirty = useRef(false);
  const draftStale = useRef(false);
  const editCfg = (next: Payload["config"]) => { cfgDirty.current = true; setCfg(next); };
  const load = async () => {
    try {
      const response = await fetch(`/api/advisor-seats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload?.error || "تعذّر القراءة");
      setData(payload);
      setError("");
      setCfg(current => configAfterLoad(current, payload.config, cfgDirty.current));
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { cfgDirty.current = false; if (collegeId && sectionId && termId) void load(); }, [collegeId, sectionId, termId]);
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
  /* «حدّث» بعد إعدادٍ رُدّ: المسوّدةُ القديمة تُترك ويُقرأ ما حفظه الزميل، ثم يُعاد التعديل عليه. */
  const { staleToast, catchStale } = useStaleWrite(() => {
    if (draftStale.current) { draftStale.current = false; cfgDirty.current = false; }
    return load();
  });
  const say = (key: string, message: Message) => setMsg(current => ({ ...current, [key]: message }));
  /* كلُّ كتابةٍ في البطاقة تمرّ من هنا: ختمُ الإصدار، و«حدّث ثم أعد»، والخطأُ يُقال على البطاقة نفسها لا يُبتلع. */
  const post = async (path: string, key: string, body: Record<string, unknown>, onDone: (out: any, ok: boolean) => void) => {
    setBusy(key);
    try {
      const response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, key, ...body }) });
      const out = await readJson(response);
      if (isStaleWrite(out)) { catchStale(Object.assign(new Error(out.error), { code: out.code })); return; }
      onDone(out, response.ok);
      await load();
    } catch (e: any) {
      say(key, { tone: "bad", text: `⛔ ${e?.message || "تعذّر الاتصال بالخادم."}` });
    } finally { setBusy(""); }
  };
  const add = (key: string, count: number) => {
    const seen = data?.sections.find(s => s.key === key);
    if (seen) touch(seen);
    return post("/api/advisor-seats/add", key, { count, rev: seen?.rev }, (out, ok) =>
      say(key, { tone: ok && out.ok ? (out.icon === "⚠️" ? "warn" : "ok") : "bad", text: `${out.icon || (out.ok ? "✅" : "⛔")} ${out.message || out.error || ""}`, alternatives: out.alternatives }));
  };
  const undo = (key: string) => {
    const seen = data?.sections.find(s => s.key === key);
    if (seen) touch(seen);
    return post("/api/advisor-seats/undo", key, { rev: seen?.rev }, (out, ok) =>
      say(key, { tone: ok ? "ok" : "bad", text: `${out.icon || (ok ? "↩️" : "⛔")} ${out.message || out.error || ""}` }));
  };
  const askException = (key: string, count: number, note: string) =>
    post("/api/advisor-seats/exception", key, { count, note }, (out, ok) => {
      say(key, { tone: ok ? "warn" : "bad", text: ok ? `📨 ${out.hint}` : `⛔ ${out.error || "تعذّر الإرسال."}` });
      if (ok) setAsking(null);
    });
  const resolve = (request: SeatRequest, decision: "approved" | "declined") =>
    post("/api/advisor-seats/exception/resolve", `resolve:${request.id}`, { id: request.id, decision }, (out, ok) => {
      if (!ok) setError(out.error || "تعذّر البتّ.");
    });
  const saveConfig = async () => {
    if (!cfg) return;
    setBusy("config");
    try {
      const response = await fetch("/api/advisor-seats/config", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, config: cfg, rev: cfg.rev ?? 0 }) });
      if (!response.ok) {
        const out = await readJson(response);
        if (isStaleWrite(out)) { draftStale.current = true; catchStale(Object.assign(new Error(out.error), { code: out.code })); return; }
        throw new Error(out?.error || "تعذّر الحفظ");
      }
      cfgDirty.current = false;
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  };
  const totals = useMemo(() => {
    const list = data?.sections || [];
    return { full: list.filter(s => s.state.tone === "red").length, near: list.filter(s => s.state.tone === "yellow").length, added: list.reduce((n, s) => n + s.state.advisorAdded, 0) };
  }, [data]);
  if (!data) return <section className="of-section" role="status">{error || "…"}</section>;
  const max = data.maxConfig || SEAT_CONFIG_MAX;
  const frozen = Boolean(data.frozen);
  const canAdd = data.canAdd !== false && !frozen;
  const canConfigure = data.canConfigure && !frozen;
  const clamp = (value: string) => Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));
  const label = (key: string) => { const s = data.sections.find(x => x.key === key); return s ? `${s.courseName} · ${s.section}` : key; };
  const needle = query.trim().toLowerCase();
  const shown = data.sections.filter(s => !needle || `${s.courseName} ${s.section}`.toLowerCase().includes(needle));
  const pending = data.requests.filter(r => r.status === "pending");
  return (
    <section className="of-section" aria-label="رصيد مقاعد المرشد">
      <h4><Ticket aria-hidden="true" /> 🎟️ رصيد مقاعد المرشد <CampusChip collegeName={collegeName} /></h4>
      {frozen ? <p className="of-msg" data-tone="warn">🔒 فصلٌ سابق: الرصيدُ للقراءة فقط.</p> : null}
      <div className="of-kpis">
        <div className="of-kpi"><span className="of-ic">🎟️</span><b>{totals.added}</b><span>المقاعد المضافة</span></div>
        <div className="of-kpi"><span className="of-ic">🟡</span><b>{totals.near}</b><span>قريبة من الامتلاء</span></div>
        <div className="of-kpi"><span className="of-ic">🔴</span><b>{totals.full}</b><span>ممتلئة</span></div>
        {data.config.fairSplit ? <div className="of-kpi"><span className="of-ic">⚖️</span><span>توزيع عادل</span></div> : null}
      </div>
      {!data.config.capacityDefault ? <p className="of-msg" data-tone="warn">⚠️ لم تُحدَّد السعة الأساسية للشعب بعد{canConfigure ? " — حدّدها أدناه" : " — يحدّدها المسؤول"}.</p> : null}
      {canConfigure && cfg ? (
        <div className="of-row" style={{ marginBottom: 10 }}>
          <label>🪑 السعة الأساسية<input type="number" min={1} max={max} value={cfg.capacityDefault || ""} onChange={e => editCfg({ ...cfg, capacityDefault: clamp(e.target.value) })} /></label>
          <label>🎟️ رصيد المرشدين<input type="number" min={0} max={max} value={cfg.global} onChange={e => editCfg({ ...cfg, global: clamp(e.target.value) })} /></label>
          <button data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" className="of-chip" aria-pressed={cfg.fairSplit} onClick={() => editCfg({ ...cfg, fairSplit: !cfg.fairSplit })}>⚖️ توزيع عادل</button>
          {cfg.fairSplit ? <label>👥 عدد المرشدين<input type="number" min={1} max={50} value={cfg.advisorCount || ""} onChange={e => editCfg({ ...cfg, advisorCount: Math.max(0, Math.min(50, Math.trunc(Number(e.target.value) || 0))) })} /></label> : null}
          <PrimaryButton data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" disabled={busy === "config"} onClick={() => void saveConfig()}>حفظ</PrimaryButton>
          <small className="of-hint">الحدُّ {max} لكل خانة.</small>
        </div>
      ) : null}
      <input type="search" placeholder="بحث عن مقرر…" aria-label="بحث عن مقرر" value={query} onChange={e => setQuery(e.target.value)} style={{ minHeight: 38, borderRadius: 10, border: "1px solid var(--line)", padding: "4px 10px", font: "inherit", marginBottom: 10, width: "100%", maxWidth: 320 }} />
      <div className="of-grid">
        {shown.map(s => (
          <div className="of-card" key={s.key} onFocusCapture={() => touch(s)}>
            <header><div><b>{s.courseName}</b><CourseTags courseId={s.courseId} /><small> · شعبة {s.section}</small><br /><small><bdi dir="ltr">{s.time}</bdi>{s.state.limitedBy === "room" ? " · 🏫 سقف القاعة" : ""}</small></div><Ring state={s.state} /></header>
            <div className="of-row">
              {canAdd ? <>
                <SecondaryButton data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" disabled={!!busy || s.state.remaining <= 0 || !s.state.capacity} onClick={() => void add(s.key, 1)}>+1</SecondaryButton>
                <SecondaryButton data-guide-ignore="رصيد مقاعد المرشد — إجراء محلي واضح في بطاقته" type="button" disabled={!!busy || s.state.remaining < 3 || !s.state.capacity} onClick={() => void add(s.key, 3)}>+3</SecondaryButton>
                {s.mine?.last ? <button data-guide-ignore="يتراجع عن آخر إضافةٍ لك أنت في هذه الشعبة؛ لا يمسّ إضافات الزملاء" type="button" className="of-chip" disabled={!!busy} onClick={() => void undo(s.key)} title="تراجع عن آخر إضافةٍ لك في هذه الشعبة">↩️ تراجع −{s.mine.last}</button> : null}
              </> : null}
              <span>{s.state.remaining > 0 ? `متبقٍّ ${s.state.remaining}` : "🔴 ممتلئة"}{s.state.fairShare !== undefined ? ` · نصيبك ${s.state.fairShare}` : ""}{s.mine?.added ? ` · أضفتَ ${s.mine.added}` : ""}</span>
            </div>
            <ColleagueWorkNotice clashes={workClashes(peers, { kind: "advisorSeats", id: String(s.courseId) })} className="of-colleague" />
            {msg[s.key] ? <div className="of-msg" data-tone={msg[s.key].tone} role="status">{msg[s.key].text}</div> : null}
            {msg[s.key]?.alternatives?.length ? <div className="of-chips">{msg[s.key].alternatives!.map(a => <span className="of-chip" key={a.key}>↪️ شعبة {a.section} · <bdi dir="ltr">{a.time}</bdi> · {countOf(a.remaining, AR.seat)}</span>)}</div> : null}
            {canAdd && s.state.remaining <= 0 && asking?.key !== s.key ? <button data-guide-ignore="يفتح خانتي طلب الاستثناء؛ لا يرسل قبل التأكيد" type="button" className="of-chip" disabled={!!busy} onClick={() => setAsking({ key: s.key, count: 1, note: "" })}>📨 طلب استثناء</button> : null}
            {asking?.key === s.key ? (
              <div className="of-row">
                <label>عدد المقاعد<input type="number" min={1} max={50} value={asking.count} onChange={e => setAsking({ ...asking, count: Math.max(1, Math.min(50, Math.trunc(Number(e.target.value) || 1))) })} /></label>
                <input value={asking.note} maxLength={300} onChange={e => setAsking({ ...asking, note: e.target.value })} placeholder="سطرٌ للمسؤول (اختياري)" aria-label="سطرٌ للمسؤول" style={{ flex: 1, minWidth: 160, minHeight: 36, borderRadius: 10, border: "1px solid var(--line)", padding: "4px 10px", font: "inherit" }} />
                <SecondaryButton data-guide-ignore="يرسل طلب الاستثناء إلى المسؤول" type="button" disabled={!!busy} onClick={() => void askException(s.key, asking.count, asking.note)}>أرسل</SecondaryButton>
                <button data-guide-ignore="يغلق خانتي طلب الاستثناء دون إرسال" type="button" className="of-chip" onClick={() => setAsking(null)}>تراجع</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {data.canConfigure && (data.nearFull.length || data.requests.length) ? (
        <div className="of-section">
          <h4>📊 القريبة من الامتلاء · من أضاف</h4>
          <table className="of-table"><thead><tr><th>الشعبة</th><th>المتبقي</th><th>المرشدون</th></tr></thead><tbody>
            {data.nearFull.map(row => <tr key={row.key}><td>{label(row.key)}</td><td>{row.state.remaining ? row.state.remaining : "🔴 0"}</td><td>{row.byAdvisor.map(a => `${a.name} (${a.count})`).join("، ") || "—"}</td></tr>)}
          </tbody></table>
          {data.requests.length ? <>
            <h4 style={{ marginTop: 12 }}>📨 طلبات استثناء{pending.length ? ` · ${pending.length} عند المسؤول` : ""}</h4>
            <ul className="of-requests">
              {data.requests.map(r => (
                <li key={r.id} className="of-chip" data-status={r.status}>
                  <span>📨 {label(r.key)} · {r.by} · +{r.count}{r.note ? ` — ${r.note}` : ""} · <b>{STATUS_LABEL[r.status] || r.status}</b></span>
                  {r.status === "pending" && canConfigure ? <>
                    <SecondaryButton data-guide-ignore="يوافق المسؤول على الاستثناء فيرفع رصيد الشعبة بعدده" type="button" disabled={!!busy} onClick={() => void resolve(r, "approved")}>وافق (+{r.count} للرصيد)</SecondaryButton>
                    <button data-guide-ignore="يعتذر المسؤول عن طلب الاستثناء" type="button" className="of-chip" disabled={!!busy} onClick={() => void resolve(r, "declined")}>اعتذر</button>
                    <small>💡 أو افتح شعبة جديدة</small>
                  </> : null}
                </li>
              ))}
            </ul>
          </> : null}
        </div>
      ) : null}
      {error ? <p className="of-msg" data-tone="bad">⛔ {error}</p> : null}
      {staleToast}
    </section>
  );
}
