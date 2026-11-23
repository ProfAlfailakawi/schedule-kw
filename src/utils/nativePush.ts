/**
 * ── تنبيهاتُ النظام (APNs) داخل غلاف iOS الأصلي ─────────────────────────────
 *
 * الصفحةُ تُحمَّل من الموقع داخل WKWebView، حيث لا Service Worker ولا Notification؛ فنكلّم
 * إضافةَ @capacitor/push-notifications المسجّلة في التطبيق الأصلي عبر الجسر. خارج التطبيق
 * تعيد الدوالُ "unsupported" ولا تفعل شيئاً.
 */

export type NativePushPermission = "granted" | "denied" | "default" | "unsupported";

type Handle = { remove: () => Promise<void> };
type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, cb: (payload: any) => void) => Promise<Handle>;
};

const getPlugin = (): PushPlugin | null => {
  try {
    const cap = (globalThis as any).window?.Capacitor || (globalThis as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    if (cap.getPlatform?.() !== "ios") return null;
    return (cap.Plugins?.PushNotifications as PushPlugin) || null;
  } catch {
    return null;
  }
};

export const isNativePushAvailable = (): boolean => !!getPlugin();

const mapPermission = (value: string | undefined): NativePushPermission =>
  value === "granted" ? "granted" : value === "denied" ? "denied" : "default";

export async function readNativePushPermission(): Promise<NativePushPermission> {
  const plugin = getPlugin();
  if (!plugin) return "unsupported";
  try { return mapPermission((await plugin.checkPermissions()).receive); } catch { return "unsupported"; }
}

/** يطلب إذنَ النظام إن لم يُحسم بعد (نافذةُ iOS الأصلية). لا يسأل مرتين. */
export async function requestNativePushPermission(): Promise<NativePushPermission> {
  const plugin = getPlugin();
  if (!plugin) return "unsupported";
  try {
    const current = await readNativePushPermission();
    if (current !== "default") return current;
    return mapPermission((await plugin.requestPermissions()).receive);
  } catch {
    return "unsupported";
  }
}

/** يسجّل الجهازَ لدى APNs ويعيد توكنَه (hex) أو "" عند الفشل أو انتهاء المهلة. */
export async function registerNativePushToken(timeoutMs = 15000): Promise<string> {
  const plugin = getPlugin();
  if (!plugin) return "";
  const handles: Handle[] = [];
  try {
    return await new Promise<string>(async resolve => {
      const timer = setTimeout(() => resolve(""), timeoutMs);
      const done = (value: string) => { clearTimeout(timer); resolve(value); };
      try {
        handles.push(await plugin.addListener("registration", (t: any) => done(String(t?.value || ""))));
        handles.push(await plugin.addListener("registrationError", () => done("")));
        await plugin.register();
      } catch {
        done("");
      }
    });
  } finally {
    await Promise.all(handles.map(handle => handle.remove().catch(() => undefined)));
  }
}

/** بصمةُ التوكن كما يحفظها الخادم (sha256 لـ "apns:<token>"). */
export async function nativePushSubscriptionId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`apns:${token.toLowerCase()}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * لمسُ تنبيه التطبيق: الرابطُ الذي يحمله جسمُ APNs (url، هو نفسه رابطُ Web Push) يُحوَّل إلى مسارٍ
 * من الموقع نفسه، وإلا فلا شيء. لا يُتبَع رابطٌ إلى أصلٍ آخر ولا مخطّطٌ غير http(s).
 */
export function nativePushTargetPath(action: unknown, origin: string): string {
  try {
    const raw = (action as any)?.notification?.data?.url;
    if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return "";
    const base = new URL(origin);
    const url = new URL(raw.trim(), base);
    if (url.origin !== base.origin || (url.protocol !== "https:" && url.protocol !== "http:")) return "";
    return url.pathname + url.search + url.hash;
  } catch {
    return "";
  }
}

let openInstalled = false;
/**
 * يُسجَّل في main.tsx قبل رسم التطبيق: الإضافةُ تحتفظ بلمسة التشغيل البارد حتى يُضاف المستمع،
 * فتُسلَّم هنا ويُفتح المسارُ داخل الصفحة نفسها (App يقرأ المسار من popstate) بلا إعادة تحميل.
 * خارج التطبيق لا يفعل شيئاً.
 */
export function installNativePushOpen(navigate?: (path: string) => void): boolean {
  const plugin = getPlugin();
  if (!plugin || openInstalled) return false;
  openInstalled = true;
  const go = navigate || ((path: string) => {
    if (window.location.pathname + window.location.search + window.location.hash === path) return;
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  try {
    void plugin.addListener("pushNotificationActionPerformed", (action: unknown) => {
      const path = nativePushTargetPath(action, window.location.origin);
      if (path) go(path);
    }).catch(() => { openInstalled = false; });
  } catch {
    openInstalled = false;
    return false;
  }
  return true;
}

/** للاختبار وحده. */
export function resetNativePushOpenForTest(): void { openInstalled = false; }
