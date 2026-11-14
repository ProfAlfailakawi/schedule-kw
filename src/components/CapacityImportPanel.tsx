/**
 * ── «استيراد السعات» داخل «قاعات بلا سعة» ─────────────────────────────────────────
 * ملفُ Excel/CSV ← معاينةٌ لا تكتب شيئاً (✅ تُملأ · 🔁 تغيّر سعةً مسجّلة · ⚠️ تُتخطّى بسببها · ❌ قيمةٌ غير صالحة)
 * ← اعتمادٌ واحد ← تراجعٌ يعيد ما كتبته الدفعةُ بعينه. القراءةُ والمطابقةُ والكتابةُ كلُّها في الخادم
 * (src/server/routes/capacityImportRoutes.ts)؛ هنا العرضُ وحده. «شمل التعديلات» مطفأٌ افتراضياً فلا تُمسّ سعةٌ مسجّلة إلا بتأشيره.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CircleCheck, Download, FileSpreadsheet, Loader2, RotateCcw, Upload, X } from "lucide-react";
import MiniRing from "./MiniRing";
import { AR, countOf, nounFor } from "../utils/arabicCount";

const P = "/api/admin/location-setup/capacity-import";
const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
const PAGE = 40;

type Status = "set" | "change" | "same" | "skip" | "invalid";
interface PreviewRow { line: number; status: Status; reason: string; note: string; code: string; fullCode: string; old: number | null; value: number | null }
interface Preview {
  token: string; fileName: string; maxApply: number;
  counts: { total: number; set: number; change: number; same: number; skip: number; invalid: number };
  coverage: { total: number; withCapacity: number; percentNow: number | null; percentAfter: number | null };
  items: Array<{ roomId: string; kind: "set" | "change"; old: number | null; value: number }>;
  rows: PreviewRow[];
}
interface ResultRow { roomId: string; fullCode: string; status: "applied" | "skipped" | "undone" | "refused"; old: number | null; value: number | null; note: string }
interface Outcome { kind: "applied" | "undone"; batchId: string; results: ResultRow[]; done: number; other: number }
type Tab = "set" | "change" | "skip" | "invalid";

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذّر إكمال العملية");
  return data;
}

export default function CapacityImportPanel({ demoReadOnly = false, onChanged }: { demoReadOnly?: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<"" | "read" | "apply" | "undo">("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [includeChanges, setIncludeChanges] = useState(false);
  const [tab, setTab] = useState<Tab>("set");
  const [shown, setShown] = useState(PAGE);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [last, setLast] = useState<{ batchId: string; undoable: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const working = useRef(false);

  const loadLast = useCallback(async () => {
    try { const data = await api(`${P}/last`); setLast(data.batch ? { batchId: data.batch.batchId, undoable: data.batch.undoable } : null); } catch { setLast(null); }
  }, []);
  useEffect(() => { void loadLast(); }, [loadLast]);

  const pick = async (chosen: File) => {
    if (working.current) return;
    working.current = true; setBusy("read"); setError(""); setOutcome(null);
    try {
      const data = await api(`${P}/preview`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(chosen.name) }, body: await chosen.arrayBuffer() }) as Preview;
      setPreview(data); setIncludeChanges(false); setShown(PAGE);
      setTab(data.counts.set ? "set" : data.counts.change ? "change" : data.counts.invalid ? "invalid" : "skip");
    } catch (e: any) { setPreview(null); setError(e?.message || "تعذّرت قراءة الملف"); }
    finally { working.current = false; setBusy(""); }
  };

  const toApply = preview ? preview.counts.set + (includeChanges ? preview.counts.change : 0) : 0;
  const approve = async () => {
    if (!preview || !toApply || working.current || demoReadOnly) return;
    working.current = true; setBusy("apply"); setError("");
    try {
      const data = await api(`${P}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: preview.token, items: preview.items, includeChanges }) });
      setOutcome({ kind: "applied", batchId: data.batchId, results: data.results, done: data.counts.applied, other: data.counts.skipped });
      setPreview(null); onChanged(); void loadLast();
    } catch (e: any) { setError(e?.message || "تعذّر الاعتماد"); }
    finally { working.current = false; setBusy(""); }
  };
  const undo = async (batchId: string) => {
    if (working.current || demoReadOnly) return;
    working.current = true; setBusy("undo"); setError("");
    try {
      const data = await api(`${P}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }) });
      setOutcome({ kind: "undone", batchId, results: data.results, done: data.counts.undone, other: data.counts.refused });
      setPreview(null); onChanged(); void loadLast();
    } catch (e: any) { setError(e?.message || "تعذّر التراجع"); }
    finally { working.current = false; setBusy(""); }
  };

  const tabs = useMemo(() => {
    if (!preview) return [] as Array<{ key: Tab; icon: string; label: string; count: number }>;
    const c = preview.counts;
    return ([
      { key: "set", icon: "✅", label: "تُملأ", count: c.set },
      { key: "change", icon: "🔁", label: "تعديل", count: c.change },
      { key: "skip", icon: "⚠️", label: "تُتخطّى", count: c.skip + c.same },
      { key: "invalid", icon: "❌", label: "غير صالحة", count: c.invalid },
    ] as const).filter(item => item.count > 0) as Array<{ key: Tab; icon: string; label: string; count: number }>;
  }, [preview]);
  const rows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter(row => tab === "skip" ? (row.status === "skip" || row.status === "same") : row.status === tab);
  }, [preview, tab]);

  const percent = preview?.coverage.percentAfter ?? null;
  const rowCode = (row: { fullCode: string; code?: string }) => row.fullCode || row.code || "—";

  return <section className="cap-imp" aria-label="استيراد السعات من ملف">
    <input ref={file} type="file" hidden accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      data-guide-ignore="اختيار ملف السعات (xlsx أو csv) لمعاينته قبل أي حفظ"
      onChange={event => { const chosen = event.target.files?.[0]; if (chosen) void pick(chosen); event.target.value = ""; }} />
    <div className="cap-imp-bar">
      <button type="button" className="cap-imp-btn is-main" disabled={demoReadOnly || busy !== ""} data-guide-ignore="استيراد السعات من ملف Excel أو CSV: معاينة ثم اعتماد أو تراجع" onClick={() => file.current?.click()}>
        {busy === "read" ? <Loader2 className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}<span>استيراد السعات</span>
      </button>
      <a className="cap-imp-btn" href={`${P}/template`} download data-guide-ignore="تنزيل نموذج xlsx بأعمدة رمز القاعة والمبنى والسعة">
        <Download aria-hidden="true" /><span>نزّل النموذج</span>
      </a>
      {last && !outcome && !preview ? <button type="button" className="cap-imp-btn is-undo" disabled={demoReadOnly || busy !== ""} data-guide-ignore="التراجع عن آخر دفعة استيراد سعات" onClick={() => void undo(last.batchId)}>
        {busy === "undo" ? <Loader2 className="spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}<span>تراجع عن آخر استيراد · {countOf(last.undoable, AR.room)}</span>
      </button> : null}
    </div>
    {error ? <p className="cap-imp-error" role="alert">{error}</p> : null}

    {preview ? <div className="cap-imp-card">
      <div className="cap-imp-top">
        <MiniRing value={percent} size={72} decorative>{percent == null ? "—" : `${num(percent)}%`}</MiniRing>
        <div className="cap-imp-copy">
          <strong>سيكتمل <bdi dir="ltr">{percent == null ? "—" : `${num(percent)}%`}</bdi> من السعات</strong>
          <small><FileSpreadsheet aria-hidden="true" /> <bdi dir="ltr">{preview.fileName || "الملف"}</bdi> · {countOf(preview.counts.total, AR.row)}{preview.coverage.percentNow != null ? <> · الآن <bdi dir="ltr">{num(preview.coverage.percentNow)}%</bdi></> : null}</small>
        </div>
      </div>
      <div className="cap-gaps-chips cap-imp-tabs" role="group" aria-label="نتيجة المعاينة">
        {tabs.map(item => <button key={item.key} type="button" aria-pressed={tab === item.key} data-guide-ignore="تصفية نتيجة معاينة الاستيراد" onClick={() => { setTab(item.key); setShown(PAGE); }}>
          <span aria-hidden="true">{item.icon}</span>{item.label}<b>{num(item.count)}</b></button>)}
      </div>
      {preview.counts.change > 0 ? <label className="cap-imp-switch">
        <input type="checkbox" role="switch" checked={includeChanges} data-guide-ignore="شمل تعديل السعات المسجّلة؛ مطفأ افتراضياً فلا تُمسّ إلا القاعات بلا سعة" onChange={event => setIncludeChanges(event.target.checked)} />
        <span className="cap-imp-track" aria-hidden="true"><i /></span>
        <span>شمل التعديلات <b>{num(preview.counts.change)}</b></span>
      </label> : null}
      <ul className="cap-imp-list">
        {rows.slice(0, shown).map(row => <li key={row.line} data-status={row.status}>
          <strong dir="ltr">{rowCode(row)}</strong>
          {row.status === "set" ? <span className="cap-imp-val"><b>{num(row.value || 0)}</b><small>{nounFor(row.value || 0, AR.seat)}</small></span>
            : row.status === "change" ? <span className="cap-imp-val"><s>{num(row.old || 0)}</s><ArrowLeft aria-hidden="true" /><b>{num(row.value || 0)}</b></span>
            : <span className="cap-imp-note">{row.note}</span>}
          <small className="cap-imp-line">سطر {num(row.line)}</small>
        </li>)}
      </ul>
      {rows.length > shown ? <button type="button" className="cap-imp-more" data-guide-ignore="عرض مزيدٍ من أسطر المعاينة" onClick={() => setShown(value => value + PAGE)}>عرض المزيد · {num(rows.length - shown)}</button> : null}
      {toApply > preview.maxApply ? <p className="cap-imp-error" role="alert">الاعتماد الواحد حتى {countOf(preview.maxApply, AR.room)}. قسّم الملف.</p> : null}
      <div className="cap-imp-actions">
        {toApply > 0 ? <button type="button" className="cap-gaps-save cap-imp-go" disabled={demoReadOnly || busy !== "" || toApply > preview.maxApply} data-guide-ignore="اعتماد ما عُرض في المعاينة وكتابته مرةً واحدة" onClick={() => void approve()}>
          {busy === "apply" ? <Loader2 className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}<span>اعتمد {countOf(toApply, AR.room)}</span>
        </button> : <p className="cap-imp-none">لا قاعة بلا سعة في الملف{preview.counts.change ? ". أشّر «شمل التعديلات» لتغيير سعاتٍ مسجّلة" : ""}.</p>}
        <button type="button" className="cap-imp-btn" disabled={busy !== ""} data-guide-ignore="إلغاء المعاينة دون كتابة شيء" onClick={() => { setPreview(null); setError(""); }}><X aria-hidden="true" /><span>إلغاء</span></button>
      </div>
    </div> : null}

    {outcome ? <div className="cap-imp-card" data-kind={outcome.kind}>
      <div className="cap-imp-top">
        <span className="cap-imp-badge"><CircleCheck aria-hidden="true" /></span>
        <div className="cap-imp-copy">
          <strong>{outcome.kind === "applied" ? `اعتُمدت ${countOf(outcome.done, AR.room)}` : outcome.done ? `أُعيدت ${countOf(outcome.done, AR.room)}` : "لا شيء للإعادة"}</strong>
          <small>{outcome.other ? (outcome.kind === "applied" ? `تُخطّيت ${countOf(outcome.other, AR.room)}` : `رُفضت ${countOf(outcome.other, AR.room)}: عُدّلت بعد الدفعة`) : "كل شيء كما في المعاينة"}</small>
        </div>
        {outcome.kind === "applied" && outcome.done > 0 ? <button type="button" className="cap-imp-btn is-undo" disabled={demoReadOnly || busy !== ""} data-guide-ignore="التراجع عن الدفعة التي اعتُمدت للتوّ" onClick={() => void undo(outcome.batchId)}>
          {busy === "undo" ? <Loader2 className="spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}<span>تراجع</span></button> : null}
        <button type="button" className="cap-imp-btn" data-guide-ignore="إغلاق نتيجة الاستيراد" onClick={() => setOutcome(null)}><X aria-hidden="true" /><span>إغلاق</span></button>
      </div>
      {outcome.results.some(row => row.status === "skipped" || row.status === "refused") ? <ul className="cap-imp-list">
        {outcome.results.filter(row => row.status === "skipped" || row.status === "refused").map(row => <li key={row.roomId} data-status="skip"><strong dir="ltr">{row.fullCode || "—"}</strong><span className="cap-imp-note">{row.note}</span></li>)}
      </ul> : null}
    </div> : null}
  </section>;
}
