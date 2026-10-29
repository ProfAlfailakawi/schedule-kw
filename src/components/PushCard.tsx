import React, { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, Handshake, Inbox, Lock, Send, Settings, Share, Smartphone, SquarePlus } from "lucide-react";
import {
  currentPushSubscription, isIos, markPushActive, prepareThisDevice, pushSupport, subscribeThisDevice, subscriptionId,
} from "../utils/pushClient";

/**
 * ── 🔔 «فعّل التنبيهات على جوالك» — بطاقةٌ في مركز الإشعارات ────────────────
 *
 * لمن يملك وارد طلبات الأساتذة وحده (الخادمُ يقول audience). مفتاحٌ واحد يُفعّل
 * التنبيه على هذا الجهاز، و«جرّب» يدفع تنبيهاً إليه الآن. وعلى iPhone خارج
 * الشاشة الرئيسية ثلاثُ أيقوناتٍ تقول الطريق، وفي المتصفّح المحظور طريقُ السماح.
 */

type Phase = "loading" | "hidden" | "ios" | "off" | "on" | "blocked" | "busy";

interface Status { enabled?: boolean; audience?: boolean; publicKey?: string; ids?: string[]; bound?: string[] }

export default function PushCard({ userKey }: { userKey: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = pushSupport();
      if (support === "none") { setPhase("hidden"); return; }
      const status: Status | null = await fetch("/api/push/status", { credentials: "include" })
        .then(response => (response.ok ? response.json() : null)).catch(() => null);
      if (!alive) return;
      if (!status?.enabled || !status.audience || !status.publicKey) { setPhase("hidden"); return; }
      setPublicKey(status.publicKey);
      if (support === "ios-install") { setPhase("ios"); return; }
      if (Notification.permission === "denied") { setPhase("blocked"); markPushActive(userKey, false); return; }
      try {
        const prepared = await prepareThisDevice(status.publicKey);
        if (!alive) return;
        setRegistration(prepared.registration);
        setSubscription(prepared.subscription);
        const id = prepared.subscription ? await subscriptionId(prepared.subscription.endpoint) : "";
        const on = Boolean(id) && (status.ids || []).includes(id);
        if (!alive) return;
        setPhase(on ? "on" : "off");
        markPushActive(userKey, on);
        /* يُربط الجهازُ بالجلسة الحاضرة: خروجُها الصريح يُسقطه على الخادم أيضاً. */
        if (on && prepared.subscription && !(status.bound || []).includes(id)) {
          void fetch("/api/push/subscribe", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: prepared.subscription.toJSON() }) }).catch(() => undefined);
        }
      } catch {
        if (alive) setPhase("off");
      }
    })();
    return () => { alive = false; };
  }, [userKey]);

  const enable = useCallback(() => {
    setNote(null);
    setPhase("busy");
    subscribeThisDevice(publicKey, registration)
      .then(async next => {
        const response = await fetch("/api/push/subscribe", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: next.toJSON() }),
        });
        if (!response.ok) throw new Error("save");
        setSubscription(next);
        setPhase("on");
        markPushActive(userKey, true);
        setNote({ tone: "ok", text: "✓ تصل التنبيهات هذا الجهاز" });
      })
      .catch(() => {
        if (typeof Notification !== "undefined" && Notification.permission === "denied") { setPhase("blocked"); return; }
        setPhase("off");
        setNote({ tone: "bad", text: "تعذّر التفعيل. حاول مرة أخرى." });
      });
  }, [publicKey, registration, userKey]);

  const disable = useCallback(async () => {
    setNote(null);
    setPhase("busy");
    const current = subscription || await currentPushSubscription().catch(() => null);
    await fetch("/api/push/unsubscribe", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: current?.endpoint || "" }),
    }).catch(() => undefined);
    await current?.unsubscribe().catch(() => false);
    setSubscription(null);
    setPhase("off");
    markPushActive(userKey, false);
  }, [subscription, userKey]);

  const test = useCallback(async () => {
    setTesting(true);
    setNote(null);
    try {
      const response = await fetch("/api/push/test", { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => null);
      setNote(response.ok && data?.sent ? { tone: "ok", text: "📨 أُرسل — انظر إشعارات جهازك" } : { tone: "bad", text: data?.error || "لم يصل. أطفئ المفتاح وأعد تشغيله." });
    } catch {
      setNote({ tone: "bad", text: "تعذّر الاتصال." });
    } finally {
      setTesting(false);
    }
  }, []);

  if (phase === "loading" || phase === "hidden") return null;
  const on = phase === "on";
  const ios = isIos();

  return (
    <section className="push-card" data-state={phase} aria-label="تنبيهات الجوال">
      <span className="push-icon" aria-hidden="true">
        {phase === "blocked" ? <BellOff /> : phase === "ios" ? <Smartphone /> : <BellRing />}
      </span>
      <div className="push-text">
        <strong>{phase === "blocked" ? "التنبيهات محظورة على هذا الجهاز" : "فعّل التنبيهات على جوالك"}</strong>
        {phase === "ios" ? (
          <ol className="push-steps" aria-label="ثلاث خطوات على iPhone">
            <li><span><Share aria-hidden="true" /></span><small>مشاركة ⬆︎</small></li>
            <li><span><SquarePlus aria-hidden="true" /></span><small>الشاشة الرئيسية</small></li>
            <li><span><BellRing aria-hidden="true" /></span><small>افتحه واضغط 🔔</small></li>
          </ol>
        ) : phase === "blocked" ? (
          <small className="push-how">
            {ios ? <><Settings aria-hidden="true" /> الإعدادات ← الإشعارات ← SCHEDULE</> : <><Lock aria-hidden="true" /> بجانب الرابط ← الإشعارات ← سماح</>}
          </small>
        ) : (
          <small className="push-kinds">
            <span><Inbox aria-hidden="true" /> طلبات جديدة</span>
            <span><Handshake aria-hidden="true" /> ردود الأساتذة</span>
          </small>
        )}
      </div>
      {phase === "off" || phase === "on" || phase === "busy" ? (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-busy={phase === "busy" || undefined}
          className="push-switch"
          disabled={phase === "busy"}
          aria-label={on ? "إيقاف التنبيهات على هذا الجهاز" : "تفعيل التنبيهات على هذا الجهاز"}
          data-guide-ignore="مفتاح تنبيهات الجوال تفضيلٌ لصاحب الحساب على جهازه ولا يعدّل البيانات"
          onClick={() => { if (on) void disable(); else enable(); }}
        ><i aria-hidden="true" /></button>
      ) : null}
      {on ? (
        <button
          type="button"
          className="push-try"
          disabled={testing}
          data-guide-ignore="تجربة التنبيهات ترسل تنبيهاً إلى أجهزة صاحب الحساب وحده ولا تعدّل البيانات"
          onClick={() => { void test(); }}
        ><Send aria-hidden="true" /> {testing ? "يرسل…" : "جرّب"}</button>
      ) : null}
      {note ? <p className="push-note" data-tone={note.tone} role="status">{note.text}</p> : null}
    </section>
  );
}
