import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CalendarDays, Check, CheckCircle2, History, RotateCcw, ShieldCheck, UsersRound, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, visualConfirm, useDialogDismiss } from "./ui";
import { applyWithOverwriteConfirm } from "../utils/scopeOverwrite";
import "./ta-conversion.css";

type Summary = { id: number; name: string; appointments: number; sections: number };
type Preview = {
  people: Summary[];
  affected: number;
  sections: number;
  previewKey: string;
  allowed: boolean;
  reason?: string;
  termName: string;
  sectionName: string;
};
type Result = { changed: number; undoVersionId?: string };

export default function TAConversionPanel({ collegeId, sectionId, termId, onClose, onChanged }: {
  collegeId: number; sectionId: number; termId: number;
  onClose: () => void; onChanged: () => void;
}) {
  useDialogDismiss(true, onClose);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) }).toString();

  const reload = useCallback(async () => {
    const response = await fetch("/api/schedules/ta-conversion?" + query, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذّرت قراءة الجدول");
    setPreview(data as Preview);
  }, [query]);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    fetch("/api/schedules/ta-conversion?" + query, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "تعذّرت قراءة الجدول");
        if (live) setPreview(data as Preview);
      })
      .catch(reason => { if (live && reason?.name !== "AbortError") setError(reason?.message || "تعذّرت قراءة الجدول"); });
    return () => { live = false; controller.abort(); };
  }, [query]);

  const convert = async () => {
    if (!preview?.affected || !preview.allowed || busy) return;
    const accepted = await visualConfirm({
      title: "تحويل هيئة التدريب",
      message: "سيُستبدل اسم الأستاذ فقط في " + preview.affected + " موعداً من هذا الفصل. المقررات والشعب والقاعات والأوقات لا تتغيّر.",
      confirmLabel: "تأكيد التحويل",
    });
    if (!accepted) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/schedules/ta-conversion", {
        method: "POST", headers: { "Content-Type": "application/json", "x-schedule-confirm": "ta-conversion" },
        body: JSON.stringify({ collegeId, sectionId, termId, previewKey: preview.previewKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذّر التحويل");
      setResult({ changed: Number(data.changed) || 0, undoVersionId: data.undoVersionId });
      onChanged();
      await reload();
    } catch (reason: any) {
      setError(reason?.message || "تعذّر التحويل");
    } finally { setBusy(false); }
  };

  const undo = async () => {
    if (!result?.undoVersionId || busy) return;
    setBusy(true); setError("");
    try {
      const done = await applyWithOverwriteConfirm("restore", async confirm => {
        const response = await fetch("/api/intelligence/versions/" + encodeURIComponent(result.undoVersionId!) + "/restore", {
          method: "POST", headers: { "x-schedule-confirm": confirm },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(data.error || "تعذّر التراجع"), { data });
        return data;
      }, options => visualConfirm(options));
      if (done !== null) {
        setResult(null);
        onChanged();
        await reload();
      }
    } catch (reason: any) { setError(reason?.message || "تعذّر التراجع"); }
    finally { setBusy(false); }
  };

  return (
    <div className="transfer-backdrop no-print ta-conversion-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="transfer-sheet visual-minimal ta-conversion-sheet" role="dialog" aria-modal="true" aria-label="تحويل هيئة التدريب">
        <header className="ta-conversion-header">
          <div className="ta-conversion-heading">
            <span className="ta-conversion-symbol"><UsersRound aria-hidden="true" /></span>
            <div>
              <span className="surface-kicker">الجدول الدراسي · المزيد</span>
              <h2>تحويل هيئة التدريب</h2>
              <small>TA <ArrowLeftRight aria-hidden="true" /> هيئة تدريسية</small>
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} disabled={busy} aria-label="إغلاق"><X /></button>
        </header>
        <div className="ta-conversion-content">
          {!preview && !error ? <p className="ta-conversion-loading">جارٍ قراءة أسماء هيئة التدريب…</p> : null}
          {preview ? (
            <>
              <div className="ta-conversion-scope"><CalendarDays size={15} aria-hidden="true" /><span>{preview.termName}</span><span className="ta-conversion-dot">·</span><span>{preview.sectionName}</span></div>
              <div className="ta-conversion-numbers" role="group" aria-label="ملخص التحويل">
                <div><UsersRound aria-hidden="true" /><strong>{preview.people.length}</strong><small>أعضاء TA</small></div>
                <div><CalendarDays aria-hidden="true" /><strong>{preview.affected}</strong><small>مواعيد</small></div>
                <div><CheckCircle2 aria-hidden="true" /><strong>{preview.sections}</strong><small>شعب</small></div>
              </div>
              {preview.people.length ? (
                <div className="ta-conversion-people">
                  {preview.people.map(person => (
                    <div className="ta-conversion-person" key={person.id}>
                      <span className="ta-conversion-avatar"><UsersRound aria-hidden="true" /></span>
                      <strong>{person.name}</strong>
                      <small>{person.appointments} موعد</small>
                    </div>
                  ))}
                </div>
              ) : <div className="ta-conversion-empty"><CheckCircle2 aria-hidden="true" /><strong>لا أسماء TA تحتاج تحويلاً</strong><small>حدّد صفة «هيئة تدريب · TA» من بطاقة الأستاذ عند الحاجة.</small></div>}
              <p className="ta-conversion-protection"><ShieldCheck aria-hidden="true" /> تتغير الأسماء فقط؛ يبقى الجدول كما هو.</p>
              {!preview.allowed ? <p className="ta-conversion-error"><AlertTriangle aria-hidden="true" /> {preview.reason || "هذا الفصل غير قابل للتعديل"}</p> : null}
            </>
          ) : null}
          {result ? <div className="ta-conversion-done" role="status"><Check aria-hidden="true" /><span>تم تحويل {result.changed} موعداً بنجاح.</span></div> : null}
          {error ? <p role="alert" className="ta-conversion-error"><AlertTriangle aria-hidden="true" /> {error}</p> : null}
          <div className="ta-conversion-actions">
            <SecondaryButton type="button" disabled={busy} onClick={onClose}>إغلاق</SecondaryButton>
            {result?.undoVersionId ? <SecondaryButton type="button" disabled={busy} onClick={() => void undo()}><RotateCcw aria-hidden="true" /> تراجع</SecondaryButton> : null}
            <PrimaryButton type="button" disabled={busy || !preview?.allowed || !preview?.affected} onClick={() => void convert()}>
              <Check aria-hidden="true" /> {busy ? "جارٍ التنفيذ…" : "تحويل الأسماء"}
            </PrimaryButton>
          </div>
          {result?.undoVersionId ? <p className="ta-conversion-undo-hint"><History aria-hidden="true" /> نسخة آمنة قبل التحويل</p> : null}
        </div>
      </section>
    </div>
  );
}
