import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Command,
  KeyRound,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  FlaskConical,
} from "lucide-react";
import { Field, Notice, PrimaryButton } from "./ui";
import InstallApp from "./InstallApp";
import ScheduleJourney from "./ScheduleJourney";
import BrandMark from "./BrandMark";
import { parseInvitationHash } from "../utils/invitationLink";
interface LoginProps {
  onLoginSuccess: (data: {
    user: any;
    permissions: number[];
    scopes: any[];
  }) => void;
}
export default function Login({ onLoginSuccess }: LoginProps) {
  const normalizeLogin = (value: unknown) => String(value || "").trim().toLocaleLowerCase();
  const wasSeen = (value: unknown) => {
    const login = normalizeLogin(value);
    if (!login) return false;
    try { return localStorage.getItem(`schedule-login-seen:${login}`) === "1"; } catch { return false; }
  };
  const rememberLogin = (value: unknown) => {
    const login = normalizeLogin(value);
    if (!login) return;
    try { localStorage.setItem(`schedule-login-seen:${login}`, "1"); } catch { /* private mode */ }
  };
  const [username, setUsername] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("username")?.slice(0, 200) || ""),
    [password, setPassword] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [identityOpen, setIdentityOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("journey") === "1"),
    [demoLoading, setDemoLoading] = useState(false),
    /* «نسيت كلمة السر؟»: تحقّقٌ بآخر أربعة أرقام من الرقم المدني، ثم كلمةٌ جديدة (src/server/staffRecovery.ts). */
    [recovery, setRecovery] = useState<null | { step: "verify" } | { step: "set"; ticket: string }>(null),
    [tail, setTail] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [demoEnabled, setDemoEnabled] = useState(false),
    [knownLogin, setKnownLogin] = useState(() => {
      if (typeof window === "undefined") return false;
      const initial = new URLSearchParams(window.location.search).get("username")?.slice(0, 200) || "";
      return wasSeen(initial);
    });

  const updateUsername = (value: string) => {
    setUsername(value);
    setKnownLogin(wasSeen(value));
  };

  /* Chrome on iOS keeps its toolbars up on a page that cannot scroll, yet
     reports svh/dvh as if they were retracted — the "fixed" login is then
     taller than what the person actually sees and the story collapses onto
     the card. window.innerHeight/visualViewport are the visible truth in both
     Safari and Chrome, so the screen is sized from them and compacts itself
     (data-short) when that visible height is small. */
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = mainRef.current;
    if (!node) return;
    const measure = () => {
      const h = Math.round(window.visualViewport?.height || window.innerHeight || 0);
      if (!h) return;
      node.style.setProperty("--login-vh", `${h}px`);
      node.dataset.short = h <= 720 ? "true" : "false";
    };
    measure();
    const vv = window.visualViewport;
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    vv?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      vv?.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const invite = parseInvitationHash(hash);
    if (invite) {
      updateUsername(invite.username);
      if (invite.password) setPassword(invite.password);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/demo/config", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      if (!alive) return;
      setDemoEnabled(Boolean(data?.enabled));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const enterDemo = async () => {
    setError(null);
    if (!demoEnabled) return;
    setDemoLoading(true);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر بدء البيئة التجريبية");
      rememberLogin(data.user?.SystemUserLogin || data.user?.login || "demo");
      onLoginSuccess(data);
    } catch (err: any) { setError(err.message || "تعذر بدء البيئة التجريبية"); }
    finally { setDemoLoading(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة السر");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        }),
        data = await res.json();
      // A reference the reader can quote; the reason itself stays in the log.
      if (!res.ok) throw new Error(data.ref ? `${data.error} (مرجع: ${data.ref})` : (data.error || "خطأ في تسجيل الدخول"));
      rememberLogin(data.user?.SystemUserLogin || data.user?.login || username);
      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || "خطأ في تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };
  const openRecovery = () => { setError(null); setTail(""); setNewPassword(""); setConfirmPassword(""); setRecovery({ step: "verify" }); };
  const closeRecovery = () => { setError(null); setTail(""); setNewPassword(""); setConfirmPassword(""); setRecovery(null); };
  const verifyRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || tail.length !== 4) { setError("اكتب اسم المستخدم وآخر أربعة أرقام من رقمك المدني."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/recover/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), tail }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ticket) throw new Error(data.error || "تعذّر التحقق.");
      setTail("");
      setRecovery({ step: "set", ticket: String(data.ticket) });
    } catch (err: any) { setError(err.message || "تعذّر التحقق."); }
    finally { setLoading(false); }
  };
  const completeRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recovery?.step !== "set") return;
    setError(null);
    if (newPassword.length < 8) { setError("كلمة السر الجديدة ثمانية أحرف على الأقل."); return; }
    if (newPassword !== confirmPassword) { setError("الكلمتان غير متطابقتين."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/recover/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: recovery.ticket, newPassword }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "recovery-ticket") setRecovery({ step: "verify" });
        throw new Error(data.error || "تعذّر الحفظ.");
      }
      /* الكلمةُ الجديدة محفوظة: يدخل بها مباشرة. */
      const login = String(data.login || username).trim();
      const signIn = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: login, password: newPassword }) });
      const session = await signIn.json().catch(() => ({}));
      setNewPassword(""); setConfirmPassword(""); setRecovery(null);
      if (!signIn.ok) { setPassword(""); updateUsername(login); setError("حُفظت كلمة السر الجديدة. ادخل بها."); return; }
      rememberLogin(session.user?.SystemUserLogin || login);
      onLoginSuccess(session);
    } catch (err: any) { setError(err.message || "تعذّر الحفظ."); }
    finally { setLoading(false); }
  };
  return (
    <main ref={mainRef} className="apex-login visual-minimal" dir="rtl">
      <div className="apex-login-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="apex-login-brand apex-login-brand--mark-only" aria-hidden="true">
        <span className="apex-login-mark">
          <BrandMark variant="tile" />
        </span>
      </header>
      <section className="apex-login-stage">
        <div className="apex-login-story">
          <span className="apex-login-kicker">
            <i /> نظام القرار الأكاديمي
          </span>
          <h1>
            الجدول
            <br />
            <em>يبدأ من قرار.</em>
          </h1>
          <div className="apex-login-principles" aria-hidden="true">
            <span>
              <ShieldCheck />
              <b>صلاحيات دقيقة</b>
            </span>
            <span>
              <Sparkles />
              <b>ذكاء في السياق</b>
            </span>
            <span>
              <Command />
              <b>وصول مباشر</b>
            </span>
          </div>
        </div>
        <div className="apex-login-access">
          <div className="apex-access-head">
            <span>دخول آمن</span>
            <div className="apex-access-title-row">
              <strong>{knownLogin ? "أهلاً بعودتك" : "مرحباً بك"}</strong>
              {/* A quiet, named door. The old version pulsed three rings next
                  to the password field — an animation competing with the one
                  thing this screen exists for. The journey deserves a name,
                  not a heartbeat. */}
              <button
                type="button"
                className="apex-login-identity-trigger"
                onClick={() => setIdentityOpen(true)}
                aria-label="افتح رحلة SCHEDULE"
                title="ما صنعه النظام عبر السنوات"
                data-guide-ignore="زر تعريفي قبل تسجيل الدخول يفتح رحلة SCHEDULE فقط ولا ينفذ إجراءً داخل النظام"
              >
                <Sparkles aria-hidden="true" />
                <span>الرحلة</span>
              </button>
            </div>
            <p>{knownLogin ? "أكمل من حيث توقفت" : "سجّل دخولك للبدء"}</p>
          </div>
          {error ? (
            <div className="login-error">
              <Notice inline>{error}</Notice>
            </div>
          ) : null}
          {recovery ? null : (
          <form className="apex-login-form" onSubmit={submit}>
            <Field label="اسم المستخدم" required>
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => updateUsername(e.target.value)}
                disabled={loading}
                required
              />
            </Field>
            <Field label="كلمة السر" required>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </Field>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <span className="button-spinner" />
              ) : (
                <>
                  <LockKeyhole /> دخول إلى البرنامج <ArrowLeft />
                </>
              )}
            </PrimaryButton>
          </form>
          )}
          {recovery ? null : (
            <button type="button" className="demo-entry-link login-forgot-toggle" onClick={openRecovery} data-guide-ignore="يفتح استعادة كلمة السر بالرقم المدني">
              <KeyRound aria-hidden="true" /> نسيت كلمة السر؟
            </button>
          )}
          {recovery?.step === "verify" ? (
            <form className="apex-login-form login-recover" onSubmit={verifyRecovery} aria-label="استعادة كلمة السر">
              <p className="login-recover-head"><KeyRound aria-hidden="true" /><b>استعادة كلمة السر</b></p>
              <Field label="اسم المستخدم" required>
                <input autoComplete="username" value={username} onChange={(e) => updateUsername(e.target.value)} disabled={loading} required />
              </Field>
              <Field label="آخر أربعة أرقام من رقمك المدني" required>
                <input className="login-recover-tail" inputMode="numeric" autoComplete="off" dir="ltr" maxLength={4} pattern="[0-9]{4}"
                  value={tail} onChange={(e) => setTail(e.target.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, 4))}
                  disabled={loading} required autoFocus />
              </Field>
              <PrimaryButton type="submit" disabled={loading}>
                {loading ? <span className="button-spinner" /> : <><ShieldCheck /> تحقّق</>}
              </PrimaryButton>
              <button type="button" className="demo-entry-link login-recover-back" onClick={closeRecovery} data-guide-ignore="يعود إلى الدخول دون تغيير شيء">
                <ArrowRight aria-hidden="true" /> رجوع
              </button>
              <small className="login-recover-note"><Link2 aria-hidden="true" /> عضو الفريق يدخل برابطه الشخصي.</small>
            </form>
          ) : null}
          {recovery?.step === "set" ? (
            <form className="apex-login-form login-recover" onSubmit={completeRecovery} aria-label="كلمة السر الجديدة">
              <p className="login-recover-head"><LockKeyhole aria-hidden="true" /><b>كلمة سرّ جديدة</b></p>
              <Field label="كلمة السر الجديدة" required>
                <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={loading} required autoFocus minLength={8} />
              </Field>
              <Field label="أعد كتابتها" required>
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} required minLength={8} />
              </Field>
              <PrimaryButton type="submit" disabled={loading}>
                {loading ? <span className="button-spinner" /> : <><LockKeyhole /> احفظ وادخل <ArrowLeft /></>}
              </PrimaryButton>
              <button type="button" className="demo-entry-link login-recover-back" onClick={closeRecovery} data-guide-ignore="يلغي الاستعادة؛ كلمة السر الحالية باقية">
                <ArrowRight aria-hidden="true" /> إلغاء
              </button>
            </form>
          ) : null}
          <footer>
            {/* Identity and year read as one quiet signature; the two real
                doors — trying the system, installing it — carry their names. */}
            <span className="apex-login-signature">
              الجدول الأكاديمي <small>{new Date().getFullYear()}</small>
            </span>
            <span className="apex-login-doors">
              {demoEnabled ? (
                <button type="button" className="demo-entry-link" onClick={enterDemo} disabled={loading || demoLoading} data-guide-ignore="دخول اختياري إلى بيئة Demo معزولة">
                  {demoLoading ? <span className="button-spinner" /> : <FlaskConical aria-hidden="true" />}
                  تجربة النظام
                </button>
              ) : null}
              <InstallApp variant="login" />
            </span>
          </footer>
        </div>
      </section>
      {identityOpen ? <ScheduleJourney onClose={() => {
        /* Students arrive from مساري (/me?…→/?journey=1&back=/me); closing returns them there. */
        const back = new URLSearchParams(window.location.search).get("back");
        if (back === "/me") { window.location.href = "/me"; return; }
        setIdentityOpen(false);
      }} /> : null}
    </main>
  );
}
