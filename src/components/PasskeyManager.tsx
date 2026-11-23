import React, { useCallback, useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { CatalogFormDrawer, Notice } from "./ui";
import { fetchPasskeys, forgetPasskeyDevice, passkeySupported, PasskeyError, registerPasskey, removePasskey, suggestedDeviceLabel, type PasskeyList } from "../utils/passkeys";
import { AR, countOf } from "../utils/arabicCount";
import { isNativeApp } from "../utils/nativeApp";

/**
 * ── «الدخول بالبصمة» في حسابي ────────────────────────────────────────────────
 *
 * أجهزتي المسجَّلة، وتسجيلُ هذا الجهاز، وإزالةُ أيّ جهاز. الخادمُ يضع سقفاً من خمسة أجهزة، ويطلب كلمةَ
 * السر ممن مضى على دخوله وقتٌ قبل أن يسجّل جهازاً جديداً (فجلسةٌ مسروقة لا تزرع بصمةً دائمة).
 * المكانُ بجوار كلمة السر في الحساب: كلاهما بابُ دخول.
 */
const dateText = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "short", day: "numeric" });
};

export default function PasskeyManager({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<PasskeyList | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [label, setLabel] = useState(suggestedDeviceLabel());
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try { setList(await fetchPasskeys()); }
    catch (e) { setError(e instanceof PasskeyError ? e.message : "تعذّر تحميل قائمة الأجهزة."); }
  }, []);
  useEffect(() => { void load(); void passkeySupported().then(setSupported); }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await registerPasskey({ label: label.trim() || undefined, password: needPassword ? password : undefined });
      setPassword(""); setNeedPassword(false);
      setNotice("فُعّل الدخول بالبصمة على هذا الجهاز.");
      await load();
    } catch (e) {
      const failure = e instanceof PasskeyError ? e : null;
      if (failure?.failure === "password-required" || failure?.failure === "password-wrong") setNeedPassword(true);
      setError(failure?.message || "تعذّر تفعيل الدخول بالبصمة. أعد المحاولة.");
    } finally { setBusy(false); }
  };
  const remove = async (ref: string) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await removePasskey(ref);
      setConfirming("");
      const next = await fetchPasskeys();
      setList(next);
      if (!next.items.length) forgetPasskeyDevice();
      setNotice("أُزيل الجهاز. لن يدخل بعد الآن بالبصمة.");
    } catch (e) { setError(e instanceof PasskeyError ? e.message : "تعذّرت الإزالة. أعد المحاولة."); }
    finally { setBusy(false); }
  };

  const items = list?.items || [];
  const full = Boolean(list) && items.length >= (list?.limit || 5);
  return (
    <CatalogFormDrawer label="الدخول بالبصمة" onClose={onClose}>
      <div className="passkey-manager" dir="rtl">
        <h2><Fingerprint aria-hidden="true" /> الدخول بالبصمة</h2>
        <p>تدخل بلمسة على بصمتك أو وجهك أو رمز جهازك، دون كتابة كلمة السر. لا تُحفظ البصمةُ عندنا ولا تغادر جهازك. وكلمةُ السر تبقى طريقةً للدخول.</p>
        {error ? <Notice inline>{error}</Notice> : null}
        {notice ? <Notice type="success" inline>{notice}</Notice> : null}
        {list && !list.available ? <Notice type="info" inline>الدخول بالبصمة غير متاح على هذا العنوان أو في هذه البيئة.</Notice> : null}
        {list?.available ? (
          <>
            <h3>أجهزتي</h3>
            {items.length ? (
              <ul className="passkey-list" aria-label="الأجهزة المسجَّلة للدخول بالبصمة">
                {items.map(item => (
                  <li key={item.ref}>
                    <span className="passkey-list-name"><b>{item.label}</b>
                      <small>أُضيف {dateText(item.createdAt)}{item.lastUsedAt ? ` · آخر دخول ${dateText(item.lastUsedAt)}` : " · لم يُستعمل بعد"}</small></span>
                    {confirming === item.ref ? (
                      <span className="passkey-list-confirm">
                        <button type="button" className="passkey-danger" onClick={() => remove(item.ref)} disabled={busy} aria-label={`تأكيد إزالة ${item.label}`} data-guide-ignore="يزيل جهازاً من الدخول بالبصمة بعد تأكيدك؛ لا يمسّ بيانات الجدول">تأكيد الإزالة</button>
                        <button type="button" className="passkey-plain" onClick={() => setConfirming("")} disabled={busy} data-guide-ignore="يلغي الإزالة ولا يغيّر شيئاً">تراجع</button>
                      </span>
                    ) : (
                      <button type="button" className="passkey-plain passkey-remove" onClick={() => setConfirming(item.ref)} disabled={busy} aria-label={`إزالة ${item.label}`} title="إزالة الجهاز" data-guide-ignore="يطلب تأكيد إزالة جهاز من الدخول بالبصمة؛ لا يغيّر شيئاً قبل التأكيد">
                        <Trash2 aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="passkey-empty">لا جهاز مسجَّلاً بعد.</p>}
            {supported === false ? (
              <Notice type="info" inline>{isNativeApp() ? "هذا الجهاز" : "هذا المتصفح أو الجهاز"} لا يدعم الدخول بالبصمة، فلا يمكن تسجيله من هنا. افتح الحساب من جهازٍ يدعمها.</Notice>
            ) : full ? (
              <Notice type="info" inline>بلغتَ الحدّ الأقصى ({countOf(list?.limit || 5, AR.device)}). أزل جهازاً لتضيف غيره.</Notice>
            ) : (
              <form className="passkey-add" onSubmit={add}>
                <label>
                  <span>اسم هذا الجهاز</span>
                  <input value={label} maxLength={40} onChange={event => setLabel(event.target.value)} disabled={busy} autoComplete="off" />
                </label>
                {needPassword ? (
                  <label>
                    <span>كلمة السر (للتأكيد)</span>
                    <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
                  </label>
                ) : null}
                <button type="submit" className="passkey-primary" disabled={busy || supported !== true || (needPassword && !password)} data-guide-ignore="يسجّل هذا الجهاز للدخول بالبصمة بعد موافقتك على الجهاز؛ لا يمسّ بيانات الجدول">
                  {busy ? <span className="button-spinner" /> : <><Fingerprint aria-hidden="true" /> فعّل البصمة على هذا الجهاز</>}
                </button>
              </form>
            )}
          </>
        ) : null}
        <div className="passkey-manager-foot">
          <button type="button" className="passkey-plain" onClick={onClose} data-guide-ignore="يغلق النافذة ولا يغيّر شيئاً">إغلاق</button>
        </div>
      </div>
    </CatalogFormDrawer>
  );
}
