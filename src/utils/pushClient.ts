/**
 * ── تنبيهاتُ الجوال في التطبيق: جانبُ المتصفّح ─────────────────────────────
 *
 * عاملُ الدفع (/push-sw.js) مستقلٌّ عن sw.js بنطاقٍ لا صفحةَ فيه ("/push/"):
 * يستقبل التنبيه ويفتح الوارد، ولا يخزّن ولا يجيب طلباً. ولهذا وحده يُستثنى من
 * «الاستعادة» في main.tsx و index.html — تلك تُسقط كلَّ عاملٍ لتشفي صفحةً
 * عالقةً على إصدارٍ قديم، وإسقاطُ عامل الدفع يُلغي اشتراكَ الجهاز بصمت.
 */

export const PUSH_WORKER_URL = "/push-sw.js";
export const APP_PUSH_SCOPE = "/push/";
/** رسالةُ العامل حين يُلمس تنبيه: افتح هذا الرابط في اللسان المفتوح. */
export const PUSH_OPEN_MESSAGE = "schedule-push-open";

type RegistrationLike = { scope?: string; active?: { scriptURL?: string } | null; waiting?: { scriptURL?: string } | null; installing?: { scriptURL?: string } | null; unregister?: () => Promise<boolean> };

/** هل هذا تسجيلُ عامل التنبيهات؟ (في التطبيق أو في كرت أستاذ) */
export function isPushWorkerRegistration(registration: RegistrationLike | null | undefined): boolean {
  if (!registration) return false;
  const scripts = [registration.active, registration.waiting, registration.installing].map(worker => String(worker?.scriptURL || ""));
  return scripts.some(url => /\/push-sw\.js(?:[?#]|$)/.test(url)) || /\/push\/$/.test(String(registration.scope || ""));
}

/**
 * يُسقط عمّالَ التطبيق ويُبقي عاملَ التنبيهات: لا ذاكرةَ له تشيخ، وإسقاطُه يُلغي
 * الاشتراك. كلُّ مسار استعادةٍ في main.tsx يمرّ من هنا.
 */
export async function unregisterAppWorkers(container: { getRegistrations?: () => Promise<readonly RegistrationLike[]> } | undefined
  = typeof navigator !== "undefined" ? (navigator.serviceWorker as any) : undefined): Promise<number> {
  const registrations = (await container?.getRegistrations?.()) || [];
  const stale = registrations.filter(registration => !isPushWorkerRegistration(registration));
  await Promise.all(stale.map(registration => registration.unregister?.()));
  return stale.length;
}

export type PushSupport = "ok" | "ios-install" | "none";

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as any).standalone === true || Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
}

/** «ok» يُدفع إليه هنا؛ «ios-install» يحتاج الشاشة الرئيسية أولاً (iOS 16.4+)؛ «none» لا. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "none";
  const api = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
  if (api) return "ok";
  return isIos() && !isStandalone() ? "ios-install" : "none";
}

export function keyBytes(base64url: string): Uint8Array {
  const text = String(base64url || "").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(text + "=".repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export function sameServerKey(subscription: PushSubscription | null, publicKey: string): boolean {
  const key = subscription?.options?.applicationServerKey;
  if (!key) return true;
  const a = new Uint8Array(key as ArrayBuffer), b = keyBytes(publicKey);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** بصمةُ رابط الاشتراك كما يحفظها الخادم (sha256 hex). */
export async function subscriptionId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function findPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.find(registration => /\/push\/$/.test(registration.scope) && isPushWorkerRegistration(registration)) || null;
}

function whenActive(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active) return Promise.resolve(registration);
  return new Promise(resolve => {
    const worker = registration.installing || registration.waiting;
    if (!worker) { resolve(registration); return; }
    worker.addEventListener("statechange", () => { if (registration.active) resolve(registration); });
    window.setTimeout(() => resolve(registration), 8000);
  });
}

/** يسجّل العامل (مرّةً) وينتظر تفعيله: الاشتراكُ يحتاج عاملاً نشطاً. */
export async function ensurePushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await findPushRegistration();
  return whenActive(existing || await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: APP_PUSH_SCOPE }));
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await findPushRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * يشترك هذا الجهاز. يُستدعى من لمسةٍ: سفاري لا يسأل عن الإذن إلا داخلها، فإن
 * كان العاملُ نشطاً سلفاً يُطلب الاشتراكُ مباشرةً (وهو يسأل عن الإذن بنفسه).
 */
export function subscribeThisDevice(publicKey: string, ready: ServiceWorkerRegistration | null): Promise<PushSubscription> {
  const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource };
  /* لا انتظارَ قبل الطلب: اللمسةُ تبقى لمسةً. (اشتراكٌ قديمٌ بمفتاحٍ آخر أُسقط عند فتح اللوحة.) */
  if (ready?.active) return ready.pushManager.subscribe(options);
  return (async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw Object.assign(new Error("permission"), { permission });
    const registration = await ensurePushRegistration();
    return registration.pushManager.subscribe(options);
  })();
}

/**
 * يُهيّئ الجهاز عند فتح اللوحة (بلا لمسة): يسجّل العامل وينتظر تفعيله، ويُسقط
 * اشتراكاً قديماً صُنع بمفتاحٍ آخر — فتبقى اللمسةُ للإذن والاشتراك وحدهما.
 */
export async function prepareThisDevice(publicKey: string): Promise<{ registration: ServiceWorkerRegistration | null; subscription: PushSubscription | null }> {
  if (Notification.permission === "denied") return { registration: await findPushRegistration(), subscription: null };
  const registration = await ensurePushRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameServerKey(subscription, publicKey)) { await subscription.unsubscribe().catch(() => false); subscription = null; }
  return { registration, subscription };
}

/** تسجيلُ الخروج الصريح يُسقط اشتراكَ هذا الجهاز: جهازٌ مشترك لا يحمل تنبيهاتِ من خرج. */
export async function forgetPushDevice(timeoutMs = 2500): Promise<void> {
  const work = (async () => {
    const subscription = await currentPushSubscription().catch(() => null);
    if (!subscription) return;
    await fetch("/api/push/unsubscribe", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  })();
  await Promise.race([work, new Promise(resolve => window.setTimeout(resolve, timeoutMs))]);
}

/** لمسُ تنبيهٍ ولسانُ التطبيق مفتوح: يُفتح الوارد في اللسان نفسه بلا إعادة تحميل. */
export function listenForPushOpen(navigate: (path: string) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => undefined;
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type !== PUSH_OPEN_MESSAGE) return;
    try {
      const url = new URL(String(event.data.url || "/"), window.location.origin);
      if (url.origin === window.location.origin) navigate(url.pathname + url.search);
    } catch { /* رابطٌ معطوب */ }
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  navigator.serviceWorker.startMessages?.();
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}

/** علامةُ «التنبيهات تصل هذا الجهاز» لصاحب الحساب: تمنع تنبيهَ اللسان المكرَّر. */
const ACTIVE_KEY = (userKey: string) => `schedule-push-on:${userKey}`;
export function markPushActive(userKey: string, on: boolean): void {
  try { if (on) localStorage.setItem(ACTIVE_KEY(userKey), "1"); else localStorage.removeItem(ACTIVE_KEY(userKey)); } catch { /* تفضيلٌ لا أكثر */ }
}
export function pushActiveHere(userKey: string): boolean {
  try { return localStorage.getItem(ACTIVE_KEY(userKey)) === "1"; } catch { return false; }
}
