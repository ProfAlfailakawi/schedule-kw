/**
 * ── التقرير المحفوظ والرابط المشارَك ─────────────────────────────────────────
 * الحال وترميزها في reportShareCore (يقرؤها الخادم أيضاً)؛ وهنا ما يخصّ المتصفح: الحفظ المحلي القديم
 * (يُرحَّل إلى الخادم مرةً واحدة) ومفاتيح «ما رأيته آخر مرة».
 */
import { safeStorage } from "./safeStorage";
import type { SharedReportState } from "./reportShareCore";
export * from "./reportShareCore";

export interface SavedReport {
  id: string; name: string; at: string; state: SharedReportState;
  /** للقسم كلّه (يراه من له صلاحية القسم) أم لصاحبه وحده. */
  shared?: boolean;
  /** يُنبَّه صاحبه إن تغيّرت نتائجه. */
  watch?: boolean;
  owner?: number; ownerName?: string; mine?: boolean;
}

const localKey = (owner: number) => `schedule-saved-reports-${owner}`;
/** ما كان محفوظاً في المتصفح قبل أن تنتقل «تقاريري» إلى الخادم. */
export function readLocalSavedReports(owner: number): SavedReport[] {
  try {
    const list = JSON.parse(safeStorage.get(localKey(owner)) || "[]");
    return Array.isArray(list) ? list.filter(item => item && typeof item.name === "string" && item.state?.v === 1).slice(0, 20) : [];
  } catch { return []; }
}
export const clearLocalSavedReports = (owner: number) => safeStorage.set(localKey(owner), "[]");

/** ما رآه صاحب التقرير آخر مرة (بصمة نتائجه)، لتنبيهه إن تغيّر. */
const seenKey = (owner: number, id: string) => `schedule-saved-seen-${owner}-${id}`;
export const readSeen = (owner: number, id: string) => safeStorage.get(seenKey(owner, id));
export const writeSeen = (owner: number, id: string, fingerprint: string) => safeStorage.set(seenKey(owner, id), fingerprint);

/** بصمةُ نتائج: عددُها ومجموعُ مفاتيحها وأوقاتها — يتغيّر بإضافة موعدٍ أو حذفه أو تحريكه. */
export function resultsFingerprint(rows: ReadonlyArray<{ id: number; fstarttime?: string; fendtime?: string; AdRoomHall?: string; AdInstructorId?: number }>): string {
  let hash = 0;
  for (const row of rows) {
    const text = `${row.id}|${row.fstarttime}|${row.fendtime}|${row.AdRoomHall}|${row.AdInstructorId}`;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `${rows.length}:${hash.toString(36)}`;
}
