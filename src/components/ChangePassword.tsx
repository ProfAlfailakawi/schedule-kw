import React, { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { Field, Notice, PrimaryButton } from "./ui";
import BrandMark from "./BrandMark";

/**
 * ── اختيارُ كلمة السر قبل الدخول إلى العمل ──────────────────────────────────────
 *
 * حسابٌ وُلد بكلمةٍ أولى سلّمها المسؤول، أو ما زال يدخل بالكلمة الموحّدة القديمة: الخادمُ
 * لا يفتح له شيئاً حتى يختار كلمته (passwordChangeGate)، وهذه الشاشة هي ذلك الاختيار.
 *
 * من دخل للتوّ بالكلمة الأولى لا يُسأل عنها ثانيةً — كتبها المسؤول في بطاقته ولا يعرفها
 * (currentPasswordWaived في الخادم). فإن قال الخادمُ إنها مطلوبة (جلسةٌ قديمة) ظهر حقلُها.
 */
export default function ChangePassword({ name, askCurrent = true, onChanged, onLogout }: { name: string; askCurrent?: boolean; onChanged: () => void; onLogout: () => void }) {
  const [needsCurrent, setNeedsCurrent] = useState(askCurrent);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next.length < 8) { setError("كلمة السر الجديدة 8 أحرف على الأقل"); return; }
    if (next !== confirm) { setError("تأكيد كلمة السر لا يطابقها"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsCurrent ? { currentPassword: current, newPassword: next } : { newPassword: next }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        if (data.code === "current-password-required") setNeedsCurrent(true);
        throw new Error(data.error || "تعذّر تغيير كلمة السر");
      }
      onChanged();
    } catch (e: any) {
      setError(e?.message || "تعذّر تغيير كلمة السر");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="apex-login visual-minimal first-login" dir="rtl">
      <section className="apex-login-stage">
        <div className="apex-login-access">
          <div className="first-login-brand" aria-label="SCHEDULE">
            <BrandMark variant="tile" />
            <div aria-hidden="true"><b>SCHEDULE</b><small>نظام القرار الأكاديمي</small></div>
          </div>
          <div className="apex-access-head">
            <span>خطوة أولى</span>
            <div className="apex-access-title-row"><strong>اختر كلمة السر</strong></div>
            <div className="first-login-greeting">أهلاً <b>{name}</b></div>
            <div className="first-login-lead">قبل أن تبدأ، اختر كلمة سرٍّ خاصة بك بدل الكلمة التي وصلتك.</div>
          </div>
          {error ? <div className="login-error"><Notice inline>{error}</Notice></div> : null}
          <form className="apex-login-form" onSubmit={submit}>
            {needsCurrent ? (
              <Field label="كلمة السر الحالية" required>
                <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} disabled={busy} required autoFocus />
              </Field>
            ) : null}
            <Field label="كلمة السر الجديدة (8 أحرف على الأقل)" required>
              <input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} disabled={busy} required minLength={8} maxLength={128} autoFocus={!needsCurrent} />
            </Field>
            <Field label="أعد كتابة الكلمة الجديدة" required>
              <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} required minLength={8} maxLength={128} />
            </Field>
            <PrimaryButton type="submit" disabled={busy} data-guide-ignore="حفظ كلمة السر الجديدة قبل دخول مساحة العمل">
              {busy ? <span className="button-spinner" /> : <><KeyRound aria-hidden="true" /> احفظ كلمة السر وتابع</>}
            </PrimaryButton>
          </form>
          <footer>
            <button type="button" className="demo-entry-link" onClick={onLogout} disabled={busy} data-guide-ignore="خروج من الحساب قبل اختيار كلمة السر">
              <LogOut aria-hidden="true" /> خروج
            </button>
          </footer>
        </div>
      </section>
    </main>
  );
}
