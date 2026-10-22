/**
 * ── المقررات المكررة في القسم الواحد ───────────────────────────────────────────
 * رفعٌ قديم ثم رفعٌ جديد يتركان المقرر مرتين (رمزٌ قصير وآخر كامل). المعاينة تُبقي الأولى بالبقاء (مربوطٌ بصحيفة أو بقواعد أو بجدول)
 * وتعرض غيرَه للحذف إن لم يُستعمل؛ والحذف مؤرشف ويُعيد الفحص قبل أن يمسّ شيئاً.
 */
import React, { useState } from "react";
import { AR, countOf } from "../utils/arabicCount";
import { Loader2 } from "lucide-react";

interface Dup { id: number; code: string; name: string; removable: boolean; reason: string }
interface Group { number: number; keeper: { id: number; code: string; name: string }; dups: Dup[] }
interface SectionRow { sectionId: number; section: string; groups: Group[] }

export default function DuplicateCoursesPanel() {
  const [data, setData] = useState<{ sections: SectionRow[]; total: number; removable: number } | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState("");
  const [working, setWorking] = useState("");
  const run = async (label: string, job: () => Promise<void>) => { if (working) return; setWorking(label); setMsg(""); try { await job(); } catch (e: any) { setMsg(String(e?.message || "تعذّر")); } finally { setWorking(""); } };

  const scan = async () => {
    const response = await fetch("/api/plan-review/sheet/duplicates", { credentials: "include" });
    const body = await response.json().catch(() => ({} as any));
    if (!response.ok) throw new Error(body.error || "تعذّر الفحص");
    setData({ sections: body.sections || [], total: Number(body.total || 0), removable: Number(body.removable || 0) });
    setOff(new Set());
  };
  const ids = (data?.sections || []).flatMap(row => row.groups.flatMap(group => group.dups.filter(dup => dup.removable && !off.has(dup.id)).map(dup => dup.id)));
  const remove = async () => {
    if (!ids.length || !window.confirm(`حذف ${countOf(ids.length, AR.course)} مكرراً؟ الحذف يُؤرشف.`)) return;
    const response = await fetch("/api/plan-review/sheet/duplicates/delete", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    const body = await response.json().catch(() => ({} as any));
    if (!response.ok) throw new Error(body.error || "تعذّر الحذف");
    setMsg(`حُذف ${countOf(Number(body.deleted || 0), AR.course)}`);
    await scan();
  };

  return (
    <div className="pr-sheet-result pr-sheet-duplicates" role="group" aria-label="المقررات المكررة">
      <button type="button" className="btn btn-secondary" disabled={Boolean(working)} onClick={() => void run("جارٍ فحص المكرر", scan)} data-guide-ignore="فحص المقررات المكررة في القسم الواحد؛ معاينةٌ فحسب">افحص المقررات المكررة</button>
      {working ? <small className="pr-working" role="status" aria-live="polite"><Loader2 aria-hidden="true" className="spin" size={14} /> {working}… قد يطول</small> : null}
      {msg ? <small role="status">{msg}</small> : null}
      {data ? (data.total ? (
        <>
          <small role="status">{countOf(data.total, AR.course)} مكرراً في الأقسام · القابل للحذف: {data.removable}</small>
          <ul>
            {data.sections.map(row => (
              <li key={row.sectionId}>
                <b>{row.section}</b>
                <ul>
                  {row.groups.map(group => (
                    <li key={`${row.sectionId}-${group.number}`}>
                      <small>يبقى: <bdi>{group.keeper.code}</bdi> {group.keeper.name}</small>
                      <ul>
                        {group.dups.map(dup => (
                          <li key={dup.id}>
                            {dup.removable ? <label><input type="checkbox" checked={!off.has(dup.id)} onChange={() => setOff(current => { const next = new Set(current); if (next.has(dup.id)) next.delete(dup.id); else next.add(dup.id); return next; })} data-guide-ignore="اختيار مقررٍ مكرر للحذف" /> <bdi>{dup.code}</bdi> {dup.name}</label> : <small><bdi>{dup.code}</bdi> {dup.name} — لا يُحذف ({dup.reason})</small>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" disabled={Boolean(working) || !ids.length} onClick={() => void run("جارٍ الحذف", remove)} data-guide-ignore="حذف المقررات المكررة المختارة (يُؤرشف) بعد المعاينة">احذف المختار ({ids.length})</button>
        </>
      ) : <small role="status">لا مقررات مكررة</small>) : null}
    </div>
  );
}
