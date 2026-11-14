import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { CatalogFormDrawer, Field, Notice, PrimaryButton, SecondaryButton } from "./ui";

/**
 * ── «طلب حذف الحساب» (App Store 5.1.1(v)) ────────────────────────────────────
 * خطوتان: بيانٌ صادقٌ بما سيحدث، ثم تأكيدٌ بكلمة السر. الخادمُ يسجّل الطلب ويُنبّه مدير النظام
 * ويغلق الجلسات؛ وبعد النجاح نخرج من الحساب على هذا الجهاز. لا يُحذف الحسابُ لحظتَها:
 * ينفّذه مدير النظام خلال 30 يوماً (src/server/accountDeletion.ts).
 */
export default function AccountDeletion({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"info" | "confirm" | "done">("info");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّر تسجيل الطلب. حاول مرة أخرى.");
      setPassword("");
      setMessage(String(data.message || ""));
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "تعذّر تسجيل الطلب. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CatalogFormDrawer label="طلب حذف الحساب" onClose={step === "done" ? onDone : onClose}>
      <div className="account-deletion" dir="rtl">
        <h2>طلب حذف الحساب</h2>
        {step === "info" ? (
          <>
            <p>عند التأكيد نسجّل طلب حذف حسابك ونُبلغ مدير النظام، ثم تخرج من حسابك على كل أجهزتك.</p>
            <p>لا يُحذف الحساب في اللحظة نفسها: ينفّذ مدير النظام الطلب خلال 30 يوماً من تاريخه. وقد نحتفظ بما تقتضيه سجلات الجامعة وسجلات التدقيق.</p>
            <div className="form-actions">
              <PrimaryButton type="button" onClick={() => setStep("confirm")}>متابعة</PrimaryButton>
              <SecondaryButton type="button" onClick={onClose}>تراجع</SecondaryButton>
            </div>
          </>
        ) : null}
        {step === "confirm" ? (
          <form onSubmit={submit}>
            <p>للتأكيد، أدخل كلمة سرّك الحالية.</p>
            {error ? <Notice inline>{error}</Notice> : null}
            <Field label="كلمة السر" required>
              <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} required maxLength={128} autoFocus />
            </Field>
            <div className="form-actions">
              <PrimaryButton type="submit" disabled={busy || !password} data-guide-ignore="يسجّل طلب حذف الحساب ويخرج من الحساب؛ لا يمسّ بيانات الجدول">
                {busy ? <span className="button-spinner" /> : <><Trash2 aria-hidden="true" /> تأكيد طلب الحذف</>}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={onClose} disabled={busy}>تراجع</SecondaryButton>
            </div>
          </form>
        ) : null}
        {step === "done" ? (
          <>
            <Notice type="success" inline>{message || "سجّلنا طلب حذف حسابك."}</Notice>
            <div className="form-actions"><PrimaryButton type="button" onClick={onDone}>حسناً</PrimaryButton></div>
          </>
        ) : null}
      </div>
    </CatalogFormDrawer>
  );
}
