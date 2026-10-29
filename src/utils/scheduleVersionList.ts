/**
 * ── قائمةُ النسخ: خفيفةٌ دائماً، ومرتّبةٌ في الخادم لا في قاعدة البيانات ──────
 *
 * كلُّ وثيقةٍ في `scheduleVersions` تحمل نسخةً كاملةً من فصل القسم (قد تقارب
 * 1 MiB). كان سؤالُ القائمة `where(scopeKey) + orderBy(createdAt desc)`؛ ولم
 * يجد Firestore (Enterprise) فهرساً يرتّب به فرتّب في الذاكرة الوثائقَ كاملة،
 * فسقط عند قسمٍ كثير النسخ: «RESOURCE_EXHAUSTED: 128.29 MiB when the limit is
 * 128.00 MiB» — فظهر في «قراءة القرار» خطأ 500، ومثله في «مسح الجدول».
 *
 * الآن: لا `orderBy` على هذه المجموعة. السؤالُ يرشّح بالنطاق ويطلب الحقول
 * الخفيفة وحدها (`select`)، والترتيبُ والقصُّ هنا. لا يعتمد على فهرسٍ قد لا
 * يكون أُنشئ في الإنتاج (الملفُّ لا يُنشر تلقائياً)، ولا يحمل لقطةً واحدة.
 */
import type { ScheduleVersion } from "../types";

/** ما تحتاجه القائمة. `rows` ليست منها أبداً. */
export const VERSION_META_FIELDS = [
  "id", "scopeKey", "createdAt", "SystemUserId", "userName",
  "AdCollegeId", "AdSectionId", "AdTermId", "label", "source", "rowCount",
] as const;

/** `createdAt` كما كُتب عبر السنين: نصٌّ ISO، أو Timestamp، أو Date، أو رقم. */
export function versionCreatedAt(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  const stamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number } | null;
  if (stamp && typeof stamp.toDate === "function") {
    try { const at = stamp.toDate(); return Number.isFinite(at.getTime()) ? at.toISOString() : ""; } catch { return ""; }
  }
  const seconds = Number(stamp?.seconds ?? stamp?._seconds);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
}

/**
 * وصفُ نسخةٍ بأيّ شكلٍ وصل: حقولٌ غائبة من مخططٍ قديم، `rows` مفقودة أو ليست
 * مصفوفة، `rowCount` نصّ، تاريخٌ من نوعٍ آخر. لا يرمي أبداً.
 */
export function normalizeVersionMeta(raw: unknown, fallbackId = ""): ScheduleVersion {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const counted = Number(value.rowCount);
  return {
    ...value,
    id: String(value.id || fallbackId || ""),
    scopeKey: String(value.scopeKey || ""),
    createdAt: versionCreatedAt(value.createdAt),
    SystemUserId: Number(value.SystemUserId || 0),
    userName: String(value.userName || ""),
    AdCollegeId: Number(value.AdCollegeId || 0),
    AdSectionId: Number(value.AdSectionId || 0),
    AdTermId: Number(value.AdTermId || 0),
    label: String(value.label || "نسخة"),
    source: (value.source || "manual") as ScheduleVersion["source"],
    rowCount: Number.isFinite(counted) && counted >= 0 ? counted : (Array.isArray(value.rows) ? rows.length : undefined),
    rows,
  };
}

/** الأحدث أولاً، ثم القصّ. نسخةٌ بلا تاريخ تُوضع آخراً لا تُسقط القائمة. */
export function newestVersions<T extends { createdAt?: unknown }>(list: T[], limit: number): T[] {
  const at = (row: T) => versionCreatedAt(row?.createdAt);
  return [...list].sort((a, b) => at(b).localeCompare(at(a))).slice(0, Math.max(0, limit));
}

/** سطرُ القائمة كما يُرسل: بلا لقطة، وبعددٍ لا يكون NaN. */
export function versionListItem(version: ScheduleVersion) {
  const { rows, ...meta } = normalizeVersionMeta(version);
  return { ...meta, rowCount: Number(meta.rowCount ?? rows.length) || 0 };
}
