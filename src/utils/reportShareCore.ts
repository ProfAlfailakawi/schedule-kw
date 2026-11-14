/**
 * ── التقرير المحفوظ والرابط المشارَك ─────────────────────────────────────────
 *
 * حالُ الاستعلام (العدسة والنطاق والمرشّحات) تُختصر في نصٍّ واحد يُحمل في الرابط
 * (`?r=`) ويُحفظ باسمٍ في متصفّح صاحبه. والرابط لا يحمل صلاحية: من يفتحه يُقرأ له
 * بنطاقه هو، فما لا يملكه لا يُفتح له. والصيغةُ نفسها تكتبها صفحةُ التحقق من الختم
 * (رابط «نسخة اليوم») على الخادم بـ base64url.
 */
export interface SharedReportState {
  v: 1;
  lens: string;
  /** الكلية والقسم والفصل. */
  c: number; s: number; t: number;
  /** المرشّحات الإضافية كما هي في الشاشة (بلا النطاق). */
  f?: Record<string, string | number | boolean>;
}

export const FILTER_KEYS = ["instructorId", "instructorQuery", "civil", "building", "hall", "courseId", "courseCode", "startTime", "endTime", "sun", "mon", "tue", "wed", "thr"] as const;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

/** المرشّحات الفعّالة وحدها: الفارغ والصفر والكاذب لا يُحمل. */
export function compactFilters(filters: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value === undefined || value === null || value === "" || value === 0 || value === false) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

export function encodeReportState(state: SharedReportState): string {
  return toBase64Url(JSON.stringify(state));
}

/** يتحقق من شكل الحال (من رابط أو من الخادم)؛ وما لا يُفهم يعود null ولا يُكسر به شيء. */
export function sanitizeReportState(value: any): SharedReportState | null {
  if (!value || value.v !== 1 || typeof value.lens !== "string") return null;
  const f: Record<string, string | number | boolean> = {};
  for (const key of FILTER_KEYS) {
    const item = value.f?.[key];
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") f[key] = typeof item === "string" ? item.slice(0, 120) : item;
  }
  return { v: 1, lens: value.lens.slice(0, 32), c: Number(value.c) || 0, s: Number(value.s) || 0, t: Number(value.t) || 0, f };
}

/** يقرأ النص ويتحقق من شكله؛ وما لا يُفهم يعود null ولا يُكسر به شيء. */
export function decodeReportState(text: unknown): SharedReportState | null {
  try { return sanitizeReportState(JSON.parse(fromBase64Url(String(text || "")))); } catch { return null; }
}

export function reportShareUrl(origin: string, path: string, state: SharedReportState): string {
  return `${origin}${path}?r=${encodeReportState(state)}`;
}


/** بصمةُ نتائج: عددُها ومجموعُ مفاتيحها وأوقاتها — يتغيّر بإضافة موعدٍ أو حذفه أو تحريكه. */
export function resultsFingerprint(rows: ReadonlyArray<{ id: number; fstarttime?: string; fendtime?: string; AdRoomHall?: string; AdInstructorId?: number }>): string {
  let hash = 0;
  for (const row of rows) {
    const text = `${row.id}|${row.fstarttime}|${row.fendtime}|${row.AdRoomHall}|${row.AdInstructorId}`;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `${rows.length}:${hash.toString(36)}`;
}
