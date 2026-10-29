import React, { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { Field, Notice, PrimaryButton } from "./ui";
import BrandMark from "./BrandMark";

/**
 * ── اختيارُ كلمة السر قبل الدخول إلى العمل ──────────────────────────────────────
 *
 * حسابٌ وُلد بكلمةٍ أولى سلّمها المسؤول، أو ما زال يدخل بالكلمة الموحّدة القديمة: الخادمُ
 * لا يفتح له شيئاً حتى يختار كلمته (passwordChangeGate)، وهذه الشاشة هي ذلك الاختيار.
 */
export default function ChangePassword({ name, onChanged, onLogout }: { name: string; onChanged: () => void; onLogout: () => void }) {
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
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّر تغيير كلمة السر");
      onChanged();
    } catch (e: any) {
      setError(e?.message || "تعذّر تغيير كلمة السر");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="apex-login visual-minimal" dir="rtl">
      <section className="apex-login-stage">
        <div className="apex-login-access">
          <div className="apex-access-head">
            <span className="apex-login-mark" aria-hidden="true"><BrandMark /></span>
            <span>خطوة أولى</span>
            <div className="apex-access-title-row"><strong>اختر كلمة سرّك</strong></div>
            <p>أهلاً {name}. قبل أن تبدأ، اختر كلمة سرٍّ خاصة بك بدل الكلمة التي وصلتك.</p>
          </div>
          {error ? <div className="login-error"><Notice inline>{error}</Notice></div> : null}
          <form className="apex-login-form" onSubmit={submit}>
            <Field label="كلمة السر الحالية" required>
              <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} disabled={busy} required autoFocus />
            </Field>
            <Field label="كلمة السر الجديدة (8 أحرف على الأقل)" required>
              <input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} disabled={busy} required minLength={8} maxLength={128} />
            </Field>
            <Field label="أعد كتابة الكلمة الجديدة" required>
              <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} required minLength={8} maxLength={128} />
            </Field>
            <PrimaryButton type="submit" disabled={busy}>
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
