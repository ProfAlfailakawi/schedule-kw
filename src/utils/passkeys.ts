/**
 * ── «الدخول بالبصمة» من المتصفح (WebAuthn) ─────────────────────────────────────
 *
 * الخادمُ هو الحَكَم (src/server/passkeys.ts). هنا ما يلزم لتحدّث المتصفحَ والجهاز: كشفُ الدعم،
 * وتحويلُ الخيارات والاستجابات بين JSON وبايتات، ونصوصُ الأخطاء بالفصحى صادقةً بما حدث.
 * ولا يُخزَّن في المتصفح غيرُ علامتين غيرِ حسّاستين: «سُجّل هذا الجهاز»، و«رفض العرض».
 */
import { safeStorage } from "./safeStorage";

const DEVICE_KEY = "schedule-passkey-device";
const OFFER_KEY = "schedule-passkey-offer";

export type PasskeyFailure = "cancelled" | "unsupported" | "not-registered" | "expired" | "password-required" | "password-wrong" | "limit" | "unavailable" | "failed";

export class PasskeyError extends Error {
  readonly failure: PasskeyFailure;
  constructor(failure: PasskeyFailure, message: string) { super(message); this.name = "PasskeyError"; this.failure = failure; }
}

export const PASSKEY_TEXT: Record<PasskeyFailure, string> = {
  cancelled: "أُلغي الطلب أو انتهت مهلته. جرّب مرة أخرى، أو ادخل بالاسم وكلمة السر.",
  unsupported: "هذا المتصفح أو الجهاز لا يدعم الدخول بالبصمة. ادخل بالاسم وكلمة السر.",
  "not-registered": "هذا الجهاز غير مسجَّل للدخول بالبصمة. ادخل بكلمة السر ثم فعّل البصمة من حسابك.",
  expired: "انتهت مهلة الطلب. أعد المحاولة.",
  "password-required": "أكّد كلمة السر لتفعيل الدخول بالبصمة على هذا الجهاز.",
  "password-wrong": "كلمة السر غير صحيحة.",
  limit: "بلغتَ الحدّ الأقصى من الأجهزة. أزل جهازاً لتضيف غيره.",
  unavailable: "الدخول بالبصمة غير متاح على هذا العنوان.",
  failed: "تعذّر إكمال الطلب. أعد المحاولة، أو ادخل بالاسم وكلمة السر.",
};

/* ── الدعم ──────────────────────────────────────────────────────────────────── */
/** المتصفحُ يملك WebAuthn وفي الجهاز ما يتحقّق من صاحبه (بصمة، وجه، رمز). داخل التطبيق الرسمي يعمل ما دام الغلافُ يعرضه وإلا فلا يظهر الزر. */
export async function passkeySupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || typeof window.PublicKeyCredential === "undefined" || !navigator.credentials?.create || !navigator.credentials?.get) return false;
    const probe = (window.PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof probe !== "function") return false;
    return Boolean(await probe.call(window.PublicKeyCredential));
  } catch { return false; }
}

/* ── ما يُتذكَّر على الجهاز ─────────────────────────────────────────────────── */
export const passkeyDeviceRemembered = (): boolean => safeStorage.get(DEVICE_KEY) === "1";
export const rememberPasskeyDevice = () => safeStorage.set(DEVICE_KEY, "1");
export const forgetPasskeyDevice = () => safeStorage.remove(DEVICE_KEY);
export const passkeyOfferDismissed = (): boolean => safeStorage.get(OFFER_KEY) === "dismissed";
export const dismissPasskeyOffer = () => safeStorage.set(OFFER_KEY, "dismissed");

/** اسمٌ مقترحٌ للجهاز يراه صاحبُه في قائمته. */
export function suggestedDeviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iphone/i.test(ua)) return "آيفون";
  if (/ipad/i.test(ua)) return "آيباد";
  if (/android/i.test(ua)) return "هاتف أندرويد";
  if (/macintosh/i.test(ua)) return (navigator.maxTouchPoints || 0) > 1 ? "آيباد" : "ماك";
  if (/windows/i.test(ua)) return "ويندوز";
  return "هذا الجهاز";
}

/* ── ترميز ──────────────────────────────────────────────────────────────────── */
const toBytes = (text: string): ArrayBuffer => {
  const base = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
};
const toText = (buffer: ArrayBuffer | null | undefined): string => {
  if (!buffer) return "";
  let raw = ""; new Uint8Array(buffer).forEach(byte => { raw += String.fromCharCode(byte); });
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const descriptor = (item: any) => ({ ...item, id: toBytes(String(item.id)) });

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => ({} as any));
  return { ok: response.ok, status: response.status, data };
}

/** يحوّل ردَّ الخادم إلى خطأٍ بنصٍّ صادق. رفضُ سياسةِ الحساب (موقوف، مقفل، تغيير الكلمة) نصُّه من الخادم كما هو. */
function serverFailure(data: any, status: number): PasskeyError {
  const code = String(data?.code || "");
  const text = String(data?.error || "");
  if (code === "not-registered") return new PasskeyError("not-registered", text || PASSKEY_TEXT["not-registered"]);
  if (code === "challenge-expired") return new PasskeyError("expired", text || PASSKEY_TEXT.expired);
  if (code === "password-required") return new PasskeyError("password-required", text || PASSKEY_TEXT["password-required"]);
  if (code === "password-wrong") return new PasskeyError("password-wrong", text || PASSKEY_TEXT["password-wrong"]);
  if (code === "passkey-limit") return new PasskeyError("limit", text || PASSKEY_TEXT.limit);
  if (code === "passkey-unavailable") return new PasskeyError("unavailable", text || PASSKEY_TEXT.unavailable);
  return new PasskeyError("failed", text || (status === 429 ? "محاولات كثيرة جداً. حاول بعد دقيقة." : PASSKEY_TEXT.failed));
}

/** ما يرميه المتصفحُ حين يُلغي صاحبُ الجهاز أو تنتهي المهلة. */
function browserFailure(error: any): PasskeyError {
  if (error instanceof PasskeyError) return error;
  const name = String(error?.name || "");
  if (name === "NotAllowedError" || name === "AbortError") {
    const failure = new PasskeyError("cancelled", PASSKEY_TEXT.cancelled);
    /* الصفحةُ بلا تركيز (داخل تطبيق iOS): تُعلَّم لتعيدها المحاولةُ التلقائية حين تستلم التركيز. */
    (failure as any).notFocused = /not focused/i.test(String(error?.message || ""));
    return failure;
  }
  if (name === "NotSupportedError" || name === "SecurityError") return new PasskeyError("unsupported", PASSKEY_TEXT.unsupported);
  if (name === "InvalidStateError") return new PasskeyError("failed", "هذا الجهاز مسجَّل لحسابك من قبل.");
  return new PasskeyError("failed", PASSKEY_TEXT.failed);
}

/** الدخولُ بالبصمة: يعود ببيانات الجلسة كما يعيدها الدخولُ بكلمة السر. */
export async function loginWithPasskey(): Promise<any> {
  if (!(await passkeySupported())) throw new PasskeyError("unsupported", PASSKEY_TEXT.unsupported);
  const asked = await post("/api/auth/passkey/login/options", {});
  if (!asked.ok) throw serverFailure(asked.data, asked.status);
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({ publicKey: {
      challenge: toBytes(asked.data.challenge), rpId: asked.data.rpId, timeout: asked.data.timeout,
      userVerification: "required", allowCredentials: (asked.data.allowCredentials || []).map(descriptor),
    } })) as PublicKeyCredential | null;
  } catch (error) { throw browserFailure(error); }
  if (!credential) throw new PasskeyError("cancelled", PASSKEY_TEXT.cancelled);
  const reply = credential.response as AuthenticatorAssertionResponse;
  const verified = await post("/api/auth/passkey/login/verify", { response: {
    id: credential.id, rawId: toText(credential.rawId), type: credential.type,
    authenticatorAttachment: (credential as any).authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: { clientDataJSON: toText(reply.clientDataJSON), authenticatorData: toText(reply.authenticatorData), signature: toText(reply.signature), userHandle: toText(reply.userHandle) },
  } });
  if (!verified.ok) throw serverFailure(verified.data, verified.status);
  rememberPasskeyDevice();
  return verified.data;
}

/** تسجيلُ هذا الجهاز لحساب الجلسة الحالية. `password` تُطلب من جلسةٍ مضى عليها وقت. */
export async function registerPasskey(opts: { label?: string; password?: string } = {}): Promise<void> {
  if (!(await passkeySupported())) throw new PasskeyError("unsupported", PASSKEY_TEXT.unsupported);
  const asked = await post("/api/passkeys/register/options", opts.password ? { password: opts.password } : {});
  if (!asked.ok) throw serverFailure(asked.data, asked.status);
  const o = asked.data;
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({ publicKey: {
      rp: o.rp, user: { ...o.user, id: toBytes(o.user.id) }, challenge: toBytes(o.challenge), pubKeyCredParams: o.pubKeyCredParams,
      timeout: o.timeout, attestation: "none", authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: (o.excludeCredentials || []).map(descriptor),
    } })) as PublicKeyCredential | null;
  } catch (error) { throw browserFailure(error); }
  if (!credential) throw new PasskeyError("cancelled", PASSKEY_TEXT.cancelled);
  const reply = credential.response as AuthenticatorAttestationResponse;
  const verified = await post("/api/passkeys/register/verify", { label: opts.label || suggestedDeviceLabel(), response: {
    id: credential.id, rawId: toText(credential.rawId), type: credential.type,
    authenticatorAttachment: (credential as any).authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: { clientDataJSON: toText(reply.clientDataJSON), attestationObject: toText(reply.attestationObject), transports: reply.getTransports?.() || [] },
  } });
  if (!verified.ok) throw serverFailure(verified.data, verified.status);
  rememberPasskeyDevice();
}

export type PasskeyItem = { ref: string; label: string; createdAt: string; lastUsedAt: string | null; synced: boolean };
export type PasskeyList = { available: boolean; limit: number; items: PasskeyItem[] };

export async function fetchPasskeys(): Promise<PasskeyList> {
  const response = await fetch("/api/passkeys", { cache: "no-store" });
  const data = await response.json().catch(() => ({} as any));
  if (!response.ok) throw new PasskeyError("failed", data?.error || PASSKEY_TEXT.failed);
  return { available: Boolean(data.available), limit: Number(data.limit) || 5, items: Array.isArray(data.items) ? data.items : [] };
}

export async function removePasskey(ref: string): Promise<void> {
  const response = await fetch(`/api/passkeys/${encodeURIComponent(ref)}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({} as any));
  if (!response.ok) throw new PasskeyError("failed", data?.error || PASSKEY_TEXT.failed);
}
