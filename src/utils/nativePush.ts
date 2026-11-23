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
