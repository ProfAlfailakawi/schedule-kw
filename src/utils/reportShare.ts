/**
 * ── التقرير المحفوظ والرابط المشارَك ─────────────────────────────────────────
 *
 * حالُ الاستعلام (العدسة والنطاق والمرشّحات) تُختصر في نصٍّ واحد يُحمل في الرابط
 * (`?r=`) ويُحفظ باسمٍ في متصفّح صاحبه. والرابط لا يحمل صلاحية: من يفتحه يُقرأ له
 * بنطاقه هو، فما لا يملكه لا يُفتح له. والصيغةُ نفسها تكتبها صفحةُ التحقق من الختم
 * (رابط «نسخة اليوم») على الخادم بـ base64url.
 */
import { safeStorage } from "./safeStorage";

export interface SharedReportState {
  v: 1;
  lens: string;
  /** الكلية والقسم والفصل. */
  c: number; s: number; t: number;
  /** المرشّحات الإضافية كما هي في الشاشة (بلا النطاق). */
  f?: Record<string, string | number | boolean>;
}

export interface SavedReport { id: string; name: string; at: string; state: SharedReportState }

const FILTER_KEYS = ["instructorId", "instructorQuery", "civil", "building", "hall", "courseId", "courseCode", "startTime", "endTime", "sun", "mon", "tue", "wed", "thr"] as const;
const MAX_SAVED = 20;

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

/** يقرأ النص ويتحقق من شكله؛ وما لا يُفهم يعود null ولا يُكسر به شيء. */
export function decodeReportState(text: unknown): SharedReportState | null {
  try {
    const value = JSON.parse(fromBase64Url(String(text || "")));
    if (!value || value.v !== 1 || typeof value.lens !== "string") return null;
    const f: Record<string, string | number | boolean> = {};
    for (const key of FILTER_KEYS) {
      const item = value.f?.[key];
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") f[key] = typeof item === "string" ? item.slice(0, 120) : item;
    }
    return { v: 1, lens: value.lens.slice(0, 32), c: Number(value.c) || 0, s: Number(value.s) || 0, t: Number(value.t) || 0, f };
  } catch { return null; }
}

export function reportShareUrl(origin: string, path: string, state: SharedReportState): string {
  return `${origin}${path}?r=${encodeReportState(state)}`;
}

const savedKey = (owner: number) => `schedule-saved-reports-${owner}`;

export function readSavedReports(owner: number): SavedReport[] {
  try {
    const list = JSON.parse(safeStorage.get(savedKey(owner)) || "[]");
    return Array.isArray(list) ? list.filter(item => item && typeof item.name === "string" && item.state?.v === 1).slice(0, MAX_SAVED) : [];
  } catch { return []; }
}

export function saveReport(owner: number, name: string, state: SharedReportState, now = new Date()): SavedReport[] {
  const clean = name.trim().slice(0, 60);
  if (!clean) return readSavedReports(owner);
  const list = readSavedReports(owner).filter(item => item.name !== clean);
  const next = [{ id: `${now.getTime().toString(36)}`, name: clean, at: now.toISOString(), state }, ...list].slice(0, MAX_SAVED);
  safeStorage.set(savedKey(owner), JSON.stringify(next));
  return next;
}

export function removeSavedReport(owner: number, id: string): SavedReport[] {
  const next = readSavedReports(owner).filter(item => item.id !== id);
  safeStorage.set(savedKey(owner), JSON.stringify(next));
  return next;
}
