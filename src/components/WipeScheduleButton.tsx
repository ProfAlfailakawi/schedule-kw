import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";
import { GhostButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { WIPE_CONFIRM_TOKEN, WIPE_RESTORE_TOKEN } from "../utils/scheduleWipePolicy";

/**
 * ── مسحُ جدول القسم كاملاً ──────────────────────────────────────────────────
 *
 * لا يظهر الزرّ إلا لمن يقول الخادم إنه يملكه (الأدمن ورئيس لجنة الجدول، في الفصل
 * الذي يُعَدّ، والموقَّع للأدمن وحده). وقبل المسح ثلاثُ وقفات:
 *   ١) ما سيُمسح وكم موعداً.
 *   ٢) لا تراجع من هنا إلا بالإرجاع، واسمُ القسم يُكتب باليد.
 *   ٣) زرٌّ أحمر لا يُفعَّل إلا بعد عدٍّ تنازلي.
 * والطلبُ نفسه لا يمرّ بطابور «دون اتصال»: يُرسل مباشرةً أو لا يُرسل.
 */

interface WipeState {
  canWipe: boolean;
  reason: string;
  count: number;
  sectionName: string;
  termName: string;
  canRestore: boolean;
  lastWipe: { id: string; at: string; by: string; count: number } | null;
}

const COUNTDOWN_SECONDS = 5;

const CSS = `
.wipe-modal{position:fixed;inset:0;z-index:1250;display:grid;place-items:center;padding:16px;background:rgba(20,8,8,.5)}
.wipe-card{position:relative;inline-size:min(100%,440px);padding:22px 18px 18px;border-radius:20px;background:var(--surface,#fff);box-shadow:0 24px 60px rgba(20,8,8,.35);border-top:5px solid #c62828;text-align:center}
.wipe-close{position:absolute;inset-block-start:10px;inset-inline-end:10px;display:grid;place-items:center;inline-size:32px;block-size:32px;border:0;border-radius:10px;background:var(--surface-2,#f1f3ee);cursor:pointer}
.wipe-close svg{inline-size:16px;block-size:16px}
.wipe-icon{display:grid;place-items:center;margin:0 auto 10px;inline-size:64px;block-size:64px;border-radius:50%;background:#fdecea;color:#c62828}
.wipe-icon svg{inline-size:34px;block-size:34px}
.wipe-steps{display:flex;justify-content:center;gap:6px;margin:0 0 12px}
.wipe-steps i{inline-size:26px;block-size:5px;border-radius:9px;background:#e8dcdc}
.wipe-steps i[data-on="1"]{background:#c62828}
.wipe-card h3{margin:0 0 6px;font-size:17px;color:#7f1d1d}
.wipe-card p{margin:4px 0;font-size:13.5px;line-height:1.7;color:var(--ink,#131817)}
.wipe-scope{display:inline-flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:8px 0}
.wipe-scope b{padding:3px 10px;border-radius:999px;background:#fdecea;color:#7f1d1d;font-size:12.5px}
.wipe-count{display:block;margin:6px 0;font-size:30px;font-weight:800;color:#c62828;font-variant-numeric:tabular-nums}
.wipe-type{display:block;inline-size:100%;margin:10px 0 2px;padding:10px 12px;border:2px solid #e8b4b4;border-radius:12px;font:inherit;text-align:center}
.wipe-type:focus{outline:none;border-color:#c62828}
.wipe-actions{display:flex;gap:8px;margin-top:14px}
.wipe-actions button{flex:1;min-block-size:44px;border-radius:12px;font:inherit;font-weight:700;cursor:pointer;border:1px solid var(--line,#e3e6e0);background:var(--surface,#fff)}
.wipe-actions .wipe-go{border:0;background:#c62828;color:#fff}
.wipe-actions .wipe-go:disabled{background:#e9b7b7;cursor:not-allowed}
.wipe-actions .wipe-restore{border:0;background:#2e7d32;color:#fff}
.wipe-error{margin-top:10px;padding:8px 10px;border-radius:10px;background:#fdecea;color:#7f1d1d;font-size:12.5px}
.wipe-done{color:#2e7d32}
.wipe-trigger{color:#c62828;padding-inline:10px}
.wipe-trigger svg{inline-size:17px;block-size:17px}
`;

type Step = 0 | 1 | 2 | 3 | "restore" | "done";

export default function WipeScheduleButton({ collegeId, sectionId, termId, rowCount = 0, onChanged }: {
  collegeId: number; sectionId: number; termId: number; rowCount?: number; onChanged?: () => void;
  "data-guide-ignore"?: string;
}) {
  const [state, setState] = useState<WipeState | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [typed, setTyped] = useState("");
  const [left, setLeft] = useState(COUNTDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneText, setDoneText] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setState(null); return; }
    try {
      const res = await fetch(`/api/schedules/wipe-scope?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", cache: "no-store" });
      const next = res.ok ? await res.json() : null;
      setState(next);
      return next as WipeState | null;
    } catch { setState(null); return null; }
  }, [collegeId, sectionId, termId]);

  /* يُعاد السؤال كلما تغيّر عدد الصفوف في الشاشة: جدولٌ فارغٌ امتلأ يظهر له الزر. */
  useEffect(() => { void load(); }, [load, rowCount]);

  const close = useCallback(() => { if (busy) return; setStep(0); setTyped(""); setError(""); setLeft(COUNTDOWN_SECONDS); }, [busy]);

  useEffect(() => {
    if (step === 0) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, close]);

  useEffect(() => {
    if (step !== 3) return;
    setLeft(COUNTDOWN_SECONDS);
    const timer = window.setInterval(() => setLeft(value => (value > 0 ? value - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  if (!state || !state.canWipe) return null;
  /* العددُ يُقرأ من جديد لحظةَ الفتح: ما رآه في التحذير هو ما في الجدول الآن. */
  const open = async (next: Step) => {
    const fresh = await load();
    if (!fresh?.canWipe) return;
    if (next === 1 && !fresh.count) { setError(""); return; }
    setStep(next);
  };

  const post = async (url: string, token: string, body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const res = await fetch(url, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-schedule-confirm": token },
        body: JSON.stringify({ collegeId, sectionId, termId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(String(data?.error || "تعذّر تنفيذ الطلب.")); return null; }
      return data;
    } catch {
      setError("تعذّر الاتصال بالخادم. لم يتغيّر شيء.");
      return null;
    } finally { setBusy(false); }
  };

  const wipe = async () => {
    const data = await post("/api/schedules/wipe-scope", WIPE_CONFIRM_TOKEN, { expectedCount: state.count, confirmName: typed });
    if (!data) return;
    setDoneText(`مُسح ${countOf(Number(data.deleted || 0), AR.appointment)}، وحُفظت نسخة احتياطية يمكن إرجاعها.`);
    setStep("done"); await load(); onChanged?.();
  };
  const restore = async () => {
    if (!state.lastWipe) return;
    const data = await post("/api/schedules/wipe-scope/restore", WIPE_RESTORE_TOKEN, { versionId: state.lastWipe.id });
    if (!data) return;
    setDoneText(`أُرجع ${countOf(Number(data.restored || 0), AR.appointment)}.`);
    setStep("done"); await load(); onChanged?.();
  };

  const nameOk = typed.trim().replace(/\s+/g, " ") === state.sectionName.trim().replace(/\s+/g, " ");
  const stepDots = (n: number) => <div className="wipe-steps" aria-hidden="true">{[1, 2, 3].map(i => <i key={i} data-on={i <= n ? "1" : "0"} />)}</div>;
  const scope = <div className="wipe-scope"><b>{state.sectionName}</b><b>{state.termName}</b></div>;

  let body: React.ReactNode = null;
  if (step === 1) body = (<>
    {stepDots(1)}
    <div className="wipe-icon"><AlertTriangle aria-hidden="true" /></div>
    <h3>مسح الجدول بالكامل</h3>
    {scope}
    <span className="wipe-count">{countOf(state.count, AR.appointment)}</span>
    <p>كل مواعيد هذا القسم في هذا الفصل ستُمسح.</p>
    <p>المقررات والأساتذة والقاعات لا تُمس.</p>
    <div className="wipe-actions">
      <button ref={cancelRef} type="button" onClick={close} data-guide-ignore="إلغاء المسح">إلغاء</button>
      <button type="button" className="wipe-go" onClick={() => setStep(2)} data-guide-ignore="الانتقال إلى التحذير الثاني">متابعة</button>
    </div>
  </>);
  if (step === 2) body = (<>
    {stepDots(2)}
    <div className="wipe-icon"><ShieldAlert aria-hidden="true" /></div>
    <h3>تحذير ثانٍ</h3>
    <p>لا تراجع من هذه الشاشة إلا بزر «إرجاع آخر مسح».</p>
    <p>اكتب اسم القسم كما هو للتأكيد:</p>
    {scope}
    <input className="wipe-type" value={typed} onChange={event => setTyped(event.target.value)} aria-label="اكتب اسم القسم للتأكيد" placeholder={state.sectionName} autoComplete="off" data-guide-ignore="خانة تأكيد اسم القسم" />
    <div className="wipe-actions">
      <button ref={cancelRef} type="button" onClick={close} data-guide-ignore="إلغاء المسح">إلغاء</button>
      <button type="button" className="wipe-go" disabled={!nameOk} onClick={() => setStep(3)} data-guide-ignore="الانتقال إلى التأكيد الأخير">متابعة</button>
    </div>
  </>);
  if (step === 3) body = (<>
    {stepDots(3)}
    <div className="wipe-icon"><Trash2 aria-hidden="true" /></div>
    <h3>التأكيد الأخير</h3>
    {scope}
    <span className="wipe-count">{countOf(state.count, AR.appointment)}</span>
    <p>بالضغط على الزر الأحمر يُمسح الجدول الآن.</p>
    <div className="wipe-actions">
      <button ref={cancelRef} type="button" onClick={close} disabled={busy} data-guide-ignore="إلغاء المسح">إلغاء</button>
      <button type="button" className="wipe-go" disabled={left > 0 || busy} onClick={wipe} data-guide-ignore="يمسح جدول القسم في هذا الفصل بعد نسخة احتياطية">
        {busy ? "يمسح…" : left > 0 ? `امسح الآن (${left})` : "امسح الآن"}
      </button>
    </div>
  </>);
  if (step === "restore" && state.lastWipe) body = (<>
    <div className="wipe-icon" style={{ background: "#e8f5e9", color: "#2e7d32" }}><RotateCcw aria-hidden="true" /></div>
    <h3>إرجاع آخر مسح</h3>
    {scope}
    <span className="wipe-count" style={{ color: "#2e7d32" }}>{countOf(state.lastWipe.count, AR.appointment)}</span>
    <p>مُسح {state.lastWipe.at ? new Date(state.lastWipe.at).toLocaleString("ar-KW-u-nu-latn") : ""}{state.lastWipe.by ? ` · ${state.lastWipe.by}` : ""}</p>
    <div className="wipe-actions">
      <button ref={cancelRef} type="button" onClick={close} disabled={busy} data-guide-ignore="إلغاء الإرجاع">إلغاء</button>
      <button type="button" className="wipe-restore" disabled={busy} onClick={restore} data-guide-ignore="يرجع الجدول من النسخة المحفوظة قبل المسح">{busy ? "يُرجع…" : "أرجِع"}</button>
    </div>
  </>);
  if (step === "done") body = (<>
    <div className="wipe-icon" style={{ background: "#e8f5e9", color: "#2e7d32" }}><RotateCcw aria-hidden="true" /></div>
    <p className="wipe-done">{doneText}</p>
    <div className="wipe-actions"><button ref={cancelRef} type="button" onClick={close} data-guide-ignore="يغلق نافذة نتيجة المسح أو الإرجاع فقط">تم</button></div>
  </>);

  return (
    <>
      {state.count > 0 ? (
        <GhostButton type="button" className="wipe-trigger" onClick={() => { void open(1); }} aria-haspopup="dialog" aria-label="مسح الجدول بالكامل" title="مسح الجدول بالكامل" data-guide-ignore="يفتح تحذيرات مسح الجدول بالكامل؛ لا يمسح شيئاً بنفسه">
          <Trash2 aria-hidden="true" />
        </GhostButton>
      ) : null}
      {state.canRestore ? (
        <GhostButton type="button" className="wipe-trigger" style={{ color: "#2e7d32" }} onClick={() => { void open("restore"); }} aria-haspopup="dialog" aria-label="إرجاع آخر مسح" title="إرجاع آخر مسح" data-guide-ignore="يفتح تأكيد إرجاع الجدول الممسوح">
          <RotateCcw aria-hidden="true" />
        </GhostButton>
      ) : null}
      {step !== 0 ? createPortal(
        <div className="wipe-modal" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
          <style>{CSS}</style>
          <div className="wipe-card" role="alertdialog" aria-modal="true" aria-label="مسح الجدول بالكامل">
            <button type="button" className="wipe-close" onClick={close} disabled={busy} aria-label="إغلاق" data-guide-ignore="يغلق النافذة"><X aria-hidden="true" /></button>
            {body}
            {error ? <div className="wipe-error" role="alert">{error}</div> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
