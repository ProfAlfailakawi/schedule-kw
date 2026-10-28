/**
 * L4 — تعبئة أسماء الأساتذة في استيراد PDF.
 * 📋 من الجدول الحالي، أو 📄 من PDF ثانٍ فيه الأسماء. يُملأ حقلُ الاسم وحده، وعند تطابق السطر ١٠٠٪
 * (المقرر والرمز، الشعبة، الأيام، الوقت، القاعة — والكلية والفصل نطاقُ الاستيراد). ⚠️ الجزئيّ يُعرض فرقُه
 * بالضبط ويقرّر المستخدم، ❌ لا تخمين. معاينة قبل/بعد، اعتماد، تراجع. القاعدة: src/utils/importNameFill.ts.
 */
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { useMemo, useRef, useState } from "react";
import { ClipboardCopy, FileText, RotateCcw, Check } from "lucide-react";
import { applyNameFill, FILL_FIELD_LABEL, fillSummary, planNameFill, type FillDecision, type SourceRow } from "../utils/importNameFill";
import { PrimaryButton, SecondaryButton } from "./ui";

type Row = any;
type Person = { AdInstructorId: number; AdInstructorName: string };

export default function ImportNameFillPanel({ rows, onRows, people, collegeId, sectionId, termId, courseName }: {
  rows: Row[]; onRows: (next: Row[]) => void; people: Person[]; collegeId: number; sectionId: number; termId: number; courseName?: (id: number) => string;
}) {
  const missing = useMemo(() => rows.filter(row => !Number(row.AdInstructorId || 0)).length, [rows]);
  const [plan, setPlan] = useState<{ source: "schedule" | "pdf"; decisions: FillDecision[] } | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [undo, setUndo] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  if (!missing && !plan && !undo) return null;

  const fromSchedule = async () => {
    setBusy("schedule"); setError("");
    try {
      const response = await fetch(`/api/schedules?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
      const list = await response.json();
      if (!response.ok || !Array.isArray(list)) throw new Error(list?.error || "تعذّر قراءة الجدول الحالي");
      setPlan({ source: "schedule", decisions: planNameFill(rows, list as SourceRow[], people) }); setAccepted(new Set());
    } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  };
  const fromPdf = async (file: File) => {
    setBusy("pdf"); setError("");
    try {
      const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
      const response = await fetch(`/api/intelligence/pdf-import?${query}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/octet-stream", Accept: "application/x-ndjson", "x-file-name": encodeURIComponent(file.name) },
        body: await file.arrayBuffer(),
      });
      const text = await response.text();
      let result: any = null, failure: any = null;
      for (const line of text.split("\n")) { try { const event = JSON.parse(line); if (event.type === "done") result = event.result; if (event.type === "error") failure = event; } catch { /* سطر تقدّم */ } }
      if (!result) throw new Error(failure?.error || failure?.message || "تعذّر قراءة الملف الثاني");
      const source: SourceRow[] = (result.rows || []).map((row: any) => ({ ...row, instructorText: row.sourceInstructorText || "" }));
      setPlan({ source: "pdf", decisions: planNameFill(rows, source, people) }); setAccepted(new Set());
    } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  };
  const approve = () => {
    if (!plan) return;
    setUndo(rows);
    onRows(applyNameFill(rows, plan.decisions, accepted));
    setPlan(null);
  };
  const summary = plan ? fillSummary(plan.decisions) : null;
  const pct = (n: number) => (summary && summary.total ? Math.round((n / summary.total) * 100) : 0);
  const label = (row: Row) => `${courseName?.(Number(row.AdCourseId)) || row.AdCourseName || row.sourceCourseText || row.AdCourseId} · ${row.SCode || "—"}`;

  return (
    <section className="of-section" aria-label="تعبئة أسماء الأساتذة">
      <h4>👤 أسماء الأساتذة · {countOf(missing, AR.row)} بلا اسم</h4>
      {!plan ? (
        <div className="of-row">
          <SecondaryButton data-guide-ignore="تعبئة أسماء الاستيراد — معاينة ثم اعتماد أو تراجع" type="button" disabled={!!busy} onClick={() => void fromSchedule()}><ClipboardCopy aria-hidden="true" /> 📋 من الجدول الحالي</SecondaryButton>
          <SecondaryButton data-guide-ignore="تعبئة أسماء الاستيراد — معاينة ثم اعتماد أو تراجع" type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}><FileText aria-hidden="true" /> 📄 من PDF ثانٍ</SecondaryButton>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void fromPdf(f); e.target.value = ""; }} />
          {busy ? <span role="status">…</span> : null}
          {undo ? <SecondaryButton data-guide-ignore="تعبئة أسماء الاستيراد — معاينة ثم اعتماد أو تراجع" type="button" onClick={() => { onRows(undo); setUndo(null); }}><RotateCcw aria-hidden="true" /> تراجع</SecondaryButton> : null}
        </div>
      ) : (
        <>
          <div className="of-kpis" aria-label="ملخص المطابقة">
            <div className="of-kpi"><span className="of-ring" style={{ ["--p" as any]: pct(summary!.match) }}><b>{summary!.match}</b></span><span>✅ تطابق تام</span></div>
            <div className="of-kpi"><span className="of-ring" data-tone="yellow" style={{ ["--p" as any]: pct(summary!.partial) }}><b>{summary!.partial}</b></span><span>⚠️ فرقٌ يحتاج قرارك</span></div>
            <div className="of-kpi"><span className="of-ring" data-tone="red" style={{ ["--p" as any]: pct(summary!.none) }}><b>{summary!.none}</b></span><span>❌ بلا مطابقة</span></div>
          </div>
          <table className="of-table">
            <thead><tr><th>السطر</th><th>قبل</th><th>بعد</th><th>الحالة</th></tr></thead>
            <tbody>
              {plan.decisions.filter(d => d.reason !== "السطر يحمل أستاذاً").map(d => (
                <tr key={d.index}>
                  <td>{label(rows[d.index])}</td>
                  <td>—</td>
                  <td>{d.status === "match" || (d.status === "partial" && accepted.has(d.index)) ? <b>{d.instructorName}</b> : d.status === "partial" ? <s>{d.instructorName}</s> : "—"}</td>
                  <td>
                    {d.status === "match" ? "✅" : d.status === "none" ? <span title={d.reason}>❌ {d.reason}</span> : (
                      <span className="of-row">
                        {d.diffs.map(diff => <span className="of-diff" key={diff.field}>⚠️ {FILL_FIELD_LABEL[diff.field]}: <bdi dir="ltr">{diff.mine}</bdi> ≠ <bdi dir="ltr">{diff.theirs}</bdi></span>)}
                        <button data-guide-ignore="تعبئة أسماء الاستيراد — معاينة ثم اعتماد أو تراجع" type="button" className="of-chip" aria-pressed={accepted.has(d.index)} onClick={() => setAccepted(cur => { const next = new Set(cur); next.has(d.index) ? next.delete(d.index) : next.add(d.index); return next; })}>{accepted.has(d.index) ? "✓ معتمد" : "اعتمد الاسم"}</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="of-row" style={{ marginTop: 10 }}>
            <PrimaryButton data-guide-ignore="تعبئة أسماء الاستيراد — معاينة ثم اعتماد أو تراجع" type="button" disabled={!summary!.match && !accepted.size} onClick={approve}><Check aria-hidden="true" /> اعتمد {summary!.match + accepted.size} اسم</PrimaryButton>
            <SecondaryButton data-guide-ignore="تعبئة أسماء الاستيراد — معاينة ثم اعتماد أو تراجع" type="button" onClick={() => setPlan(null)}>إلغاء</SecondaryButton>
          </div>
        </>
      )}
      {error ? <p className="of-msg" data-tone="bad" role="alert">⛔ {error}</p> : null}
    </section>
  );
}
