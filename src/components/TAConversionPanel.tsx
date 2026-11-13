import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CalendarDays, Check, CheckCircle2, CornerDownLeft, History, Replace, RotateCcw, ShieldCheck, UsersRound, X } from "lucide-react";
import InstructorPicker from "./InstructorPicker";
import { taTargetsQuery } from "../utils/taConversion";
import { PrimaryButton, SecondaryButton, visualConfirm, useDialogDismiss } from "./ui";
import { settleRegulationException } from "./RegulationExceptionSheet";
import { applyWithOverwriteConfirm } from "../utils/scopeOverwrite";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import "./ta-conversion.css";

type Summary = { id: number; name: string; appointments: number; sections: number };
type TargetCheck = { id: number; target: number; clash: boolean; over: boolean };
type Preview = {
  people: Summary[];
  affected: number;
  sections: number;
  previewKey: string;
  allowed: boolean;
  reason?: string;
  termName: string;
  sectionName: string;
  /** عائلةُ القسم كما في قائمة أستاذ المقرر: الخادمُ يقبل الهدف منها وحدها. */
  familyIds?: number[];
  checks?: TargetCheck[];
};
type Result = { changed: number; undoVersionId?: string };

export default function TAConversionPanel({ collegeId, sectionId, termId, onClose, onChanged, instructors = [], visitingIds, visitingRosterIds, embedded = false }: {
  collegeId: number; sectionId: number; termId: number;
  /** داخل «أدوات الجدول ← الأساتذة»: لوحةٌ في النافذة لا نافذةٌ فوقها (المالك 2026-11-14). */
  embedded?: boolean;
  onClose: () => void; onChanged: () => void;
  /** ما تعرفه شاشة الجدول من أسماء وشارات «منتدب»، كما تمرّره لقائمة أستاذ المقرر. */
  instructors?: any[]; visitingIds?: Iterable<number>; visitingRosterIds?: Iterable<number>;
}) {
  useDialogDismiss(!embedded, onClose);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [checks, setChecks] = useState<TargetCheck[]>([]);
  const targetText = taTargetsQuery(targets);
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

  /* تنبيهاتُ من اختير: تعارضٌ أو تجاوزُ نصاب. تُعرض ولا تمنع. */
  useEffect(() => {
    if (!targetText) { setChecks([]); return; }
    const controller = new AbortController();
    fetch("/api/schedules/ta-conversion?" + query + "&targets=" + encodeURIComponent(targetText), { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data && Array.isArray(data.checks)) setChecks(data.checks); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [query, targetText]);

  const family = useMemo(() => new Set((preview?.familyIds || []).map(Number)), [preview?.familyIds]);
  const chosenCount = (preview?.people || []).filter(person => (targets[person.id] || 0) > 0).reduce((sum, person) => sum + person.appointments, 0);

  const convert = async () => {
    if (!preview?.affected || !preview.allowed || busy) return;
    const accepted = await visualConfirm({
      title: "تحويل هيئة التدريب",
      message: "سيُستبدل اسم الأستاذ فقط في " + countOf(preview.affected, AR.appointment) + " من هذا الفصل"
        + (chosenCount ? ": " + countOf(chosenCount, AR.appointment) + " إلى أساتذة القسم" + (preview.affected - chosenCount ? "، والباقي إلى هيئة تدريسية" : "") : "")
        + ". المقررات والشعب والقاعات والأوقات لا تتغيّر.",
      confirmLabel: "تأكيد التحويل",
    });
    if (!accepted) return;
    setBusy(true); setError("");
    try {
      /* التحويلُ حفظٌ من القسم: تتالي من تُنقل إليه المواعيد يفتح ورقةَ «المتابعة استثناءً» (409)، وبالموافقة يُعاد موسوماً. */
      const send = async (body: string) => {
        const response = await fetch("/api/schedules/ta-conversion", { method: "POST", headers: { "Content-Type": "application/json", "x-schedule-confirm": "ta-conversion" }, body });
        return { response, data: await response.json().catch(() => ({})) as any };
      };
      const sent = JSON.stringify({ collegeId, sectionId, termId, previewKey: preview.previewKey, targets });
      let { response, data } = await send(sent);
      const settled = await settleRegulationException(response.status, data, sent, send);
      if (settled) ({ response, data } = settled.value);
      if (!response.ok) throw new Error(data.error || "تعذّر التحويل");
      setResult({ changed: Number(data.changed) || 0, undoVersionId: data.undoVersionId });
      setTargets({});
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
        setTargets({});
        onChanged();
        await reload();
      }
    } catch (reason: any) { setError(reason?.message || "تعذّر التراجع"); }
    finally { setBusy(false); }
  };

  return (
    <div className={embedded ? "ta-conversion-embedded" : "transfer-backdrop no-print ta-conversion-backdrop"} onMouseDown={embedded ? undefined : event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className={embedded ? "ta-conversion-sheet is-embedded" : "transfer-sheet visual-minimal ta-conversion-sheet"} role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label="تحويل هيئة التدريب">
        <header className="ta-conversion-header">
          <div className="ta-conversion-heading">
            <span className="ta-conversion-symbol"><Replace aria-hidden="true" /></span>
            <div>
              <span className="surface-kicker">{embedded ? "أدوات الجدول · الأساتذة" : "الجدول الدراسي · المزيد"}</span>
              <h2>تحويل هيئة التدريب</h2>
              <small>TA <ArrowLeftRight aria-hidden="true" /> هيئة تدريسية</small>
            </div>
          </div>
          {embedded ? null : <button type="button" data-guide-ignore="إغلاق معاينة تحويل هيئة التدريب دون تغيير" className="drawer-close" onClick={onClose} disabled={busy} aria-label="إغلاق"><X /></button>}
        </header>
        <div className="ta-conversion-content">
          {!preview && !error ? <p className="ta-conversion-loading">جارٍ قراءة أسماء هيئة التدريب…</p> : null}
          {preview ? (
            <>
              <div className="ta-conversion-scope"><CalendarDays size={15} aria-hidden="true" /><span>{preview.termName}</span><span className="ta-conversion-dot">·</span><span>{preview.sectionName}</span></div>
              <div className="ta-conversion-numbers" role="group" aria-label="ملخص التحويل">
                <div><UsersRound aria-hidden="true" /><strong>{preview.people.length}</strong><small>أعضاء TA</small></div>
                <div><CalendarDays aria-hidden="true" /><strong>{preview.affected}</strong><small>{nounFor(preview.affected, AR.appointment)}</small></div>
                <div><CheckCircle2 aria-hidden="true" /><strong>{preview.sections}</strong><small>{nounFor(preview.sections, AR.section)}</small></div>
              </div>
              {preview.people.length ? (
                <div className="ta-conversion-people">
                  {preview.people.map(person => {
                    const target = targets[person.id] || 0;
                    const flag = target ? checks.find(item => item.id === person.id && item.target === target) : undefined;
                    return (
                      <div className="ta-conversion-person" key={person.id}>
                        <span className="ta-conversion-avatar"><UsersRound aria-hidden="true" /></span>
                        <strong>{person.name}</strong>
                        <small>{countOf(person.appointments, AR.appointment)}</small>
                        <div className="ta-conversion-target" role="group" aria-label={"تحويل " + person.name + " إلى"}>
                          <CornerDownLeft aria-hidden="true" />
                          <InstructorPicker
                            value={target}
                            onChange={id => setTargets(current => ({ ...current, [person.id]: family.has(Number(id)) ? Number(id) : 0 }))}
                            instructors={instructors}
                            departmentIds={preview.familyIds || []}
                            visitingIds={visitingIds}
                            visitingRosterIds={visitingRosterIds}
                            onlyIds={preview.familyIds || []}
                            emptyLabel="هيئة تدريسية"
                            canCreate={false}
                            strictDepartmentOnly
                            collegeId={collegeId} sectionId={sectionId} termId={termId}
                            disabled={busy || !preview.allowed}
                          />
                        </div>
                        {flag && (flag.clash || flag.over) ? (
                          <ul className="ta-conversion-flags" aria-label="تنبيه">
                            {flag.clash ? <li><AlertTriangle aria-hidden="true" />تعارض</li> : null}
                            {flag.over ? <li><AlertTriangle aria-hidden="true" />فوق النصاب</li> : null}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : <div className="ta-conversion-empty"><CheckCircle2 aria-hidden="true" /><strong>لا أسماء TA تحتاج تحويلاً</strong><small>حدّد صفة «هيئة تدريب · TA» من بطاقة الأستاذ عند الحاجة.</small></div>}
              <p className="ta-conversion-protection"><ShieldCheck aria-hidden="true" /> تتغير الأسماء فقط؛ يبقى الجدول كما هو.</p>
              {!preview.allowed ? <p className="ta-conversion-error"><AlertTriangle aria-hidden="true" /> {preview.reason || "هذا الفصل غير قابل للتعديل"}</p> : null}
            </>
          ) : null}
          {result ? <div className="ta-conversion-done" role="status"><Check aria-hidden="true" /><span>تم تحويل {countOf(result.changed, AR.appointment)} بنجاح.</span></div> : null}
          {error ? <p role="alert" className="ta-conversion-error"><AlertTriangle aria-hidden="true" /> {error}</p> : null}
          <div className="ta-conversion-actions">
            {embedded ? null : <SecondaryButton type="button" data-guide-ignore="إغلاق معاينة هيئة التدريب" disabled={busy} onClick={onClose}>إغلاق</SecondaryButton>}
            {result?.undoVersionId ? <SecondaryButton type="button" data-guide-ignore="التراجع المراجع عن عملية تحويل هيئة التدريب بعد تأكيد مستقل" disabled={busy} onClick={() => void undo()}><RotateCcw aria-hidden="true" /> تراجع</SecondaryButton> : null}
            <PrimaryButton type="button" data-guide-ignore="تحويل هيئة التدريب بعد معاينة صريحة وتأكيد مع حفظ نسخة للتراجع" disabled={busy || !preview?.allowed || !preview?.affected} onClick={() => void convert()}>
              <Check aria-hidden="true" /> {busy ? "جارٍ التنفيذ…" : "تحويل الأسماء"}
            </PrimaryButton>
          </div>
          {result?.undoVersionId ? <p className="ta-conversion-undo-hint"><History aria-hidden="true" /> نسخة آمنة قبل التحويل</p> : null}
        </div>
      </section>
    </div>
  );
}
