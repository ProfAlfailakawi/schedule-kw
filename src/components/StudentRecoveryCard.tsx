import React, { useEffect, useState } from "react";
import { Check, Copy, IdCard, KeyRound, RotateCcw, ShieldCheck } from "lucide-react";
import "./student-recovery.css";

/**
 * ── رمز استعادة لطالب ───────────────────────────────────────────────────────
 *
 * الطالبُ أمامك ومعه بطاقتُه المدنية ونسي رمز «مساري» (أو وجد ملفّه أنشأه غيره).
 * تكتب رقمه، فيظهر رمزٌ من ستة أرقام: يومٌ واحد، مرةٌ واحدة، والجديدُ يُلغي السابق.
 * يكتبه في «نسيت رمزي ← معي رمزٌ من قسمي» مع رمزٍ جديد فيعود ملفُّه وتسقط كلُّ جلسةٍ قديمة.
 * لا يُعرض لك من الطالب إلا آخرُ ثلاثة أرقام والاسمُ المحفوظ لتطابقه بالبطاقة.
 * المنطقُ والصلاحيةُ والنطاقُ في الخادم (src/server/studentRecovery.ts).
 */

interface Issued { code: string; expiresAt: string; civilMasked: string; name: string; sectionName: string; replaced: boolean }

const civilChecksum = (value: string): boolean => {
  if (!/^\d{12}$/.test(value)) return false;
  const weights = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const sum = weights.reduce((total, w, i) => total + Number(value[i]) * w, 0);
  return 11 - (sum % 11) === Number(value[11]);
};
const latin = (value: string) => value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, 12);

function useCountdown(until: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const left = Math.max(0, Date.parse(until) - now);
  if (!left) return "انتهى";
  const hours = Math.floor(left / 3_600_000), minutes = Math.floor((left % 3_600_000) / 60_000);
  return hours ? `${hours} س ${minutes} د` : `${minutes} د`;
}

function IssuedCode({ issued, onAgain }: { issued: Issued; onAgain: () => void }) {
  const [copied, setCopied] = useState(false);
  const left = useCountdown(issued.expiresAt);
  const copy = () => {
    void navigator.clipboard?.writeText(issued.code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }, () => undefined);
  };
  return (
    <div className="srec-result" role="status">
      <div className="srec-who">
        <IdCard aria-hidden="true" />
        <span><b>{issued.name || "بلا اسمٍ محفوظ"}</b><small><bdi dir="ltr">{issued.civilMasked}</bdi>{issued.sectionName ? ` · ${issued.sectionName}` : ""}</small></span>
      </div>
      <p className="srec-match"><ShieldCheck aria-hidden="true" /> طابِق الاسمَ بالبطاقة. إن اختلف فقد أنشأ الملفَّ غيرُ صاحبه، والرمزُ يعيده إليه.</p>
      <div className="srec-code" dir="ltr" aria-label={`رمز الاستعادة ${issued.code.split("").join(" ")}`}>
        {issued.code.split("").map((digit, i) => <span key={i}>{digit}</span>)}
      </div>
      <div className="srec-meta">
        <span>صالحٌ مرةً واحدة · ينتهي بعد <b>{left}</b></span>
        {issued.replaced ? <span className="srec-replaced">أُلغي الرمز السابق</span> : null}
      </div>
      <div className="srec-actions">
        <button type="button" className="srec-btn" onClick={copy} data-guide-ignore="نسخ الرمز — لا يكتب شيئاً">{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "نُسخ" : "انسخ"}</button>
        <button type="button" className="srec-btn ghost" onClick={onAgain} data-guide-ignore="طالبٌ آخر — يمسح الشاشة"><RotateCcw aria-hidden="true" />طالبٌ آخر</button>
      </div>
      <p className="srec-hint">يكتبه الطالب في «مساري»: نسيت رمزي ← معي رمزٌ من قسمي.</p>
    </div>
  );
}

export default function StudentRecoveryCard() {
  const [civil, setCivil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const valid = civilChecksum(civil);

  const issue = async () => {
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/student-recovery/code", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ civil }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || "تعذّر إصدار الرمز."); return; }
      setIssued(data); setCivil("");
    } catch { setError("تعذّر الاتصال. أعد المحاولة."); }
    finally { setBusy(false); }
  };

  return (
    <details className="surface srec">
      <summary><span className="srec-badge"><KeyRound aria-hidden="true" /></span><span className="srec-title"><b>رمز استعادة لطالب</b><small>نسي رمز «مساري»؟ بعد رؤية بطاقته المدنية</small></span></summary>
      {issued ? <IssuedCode issued={issued} onAgain={() => { setIssued(null); setError(""); }} /> : (
        <form className="srec-form" onSubmit={event => { event.preventDefault(); void issue(); }}>
          <label htmlFor="srec-civil">الرقم المدني</label>
          <div className="srec-row">
            <input id="srec-civil" inputMode="numeric" autoComplete="off" dir="ltr" maxLength={12} placeholder="من البطاقة المدنية" value={civil}
              aria-invalid={civil.length === 12 && !valid} onChange={event => { setCivil(latin(event.target.value)); setError(""); }} />
            <button type="submit" className="srec-btn" disabled={!valid || busy} data-guide-ignore="يصدر رمز استعادةٍ لطالبٍ حاضرٍ ببطاقته المدنية — إجراءٌ للموظف في القسم">
              <KeyRound aria-hidden="true" />{busy ? "يصدر…" : "أصدر الرمز"}
            </button>
          </div>
          {civil.length === 12 && !valid ? <p className="srec-error" role="alert">الرقم غير صحيح — راجع البطاقة.</p> : null}
          {error ? <p className="srec-error" role="alert">{error}</p> : null}
        </form>
      )}
    </details>
  );
}
