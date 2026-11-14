/**
 * ── لا قاعةَ ولا مبنى في ما يصل الأستاذ (المالك 2026-11-14) ───────────────────
 *
 * «الأستاذ ممنوع يشوف القاعة مع المبنى». كلُّ جوابٍ من باب الأستاذ (/api/public/request/*)
 * يمرّ بهذه التنقية الأخيرة بعد ما ينزعه كلُّ مسارٍ بنفسه: أيُّ حقلٍ يحمل هويّةَ قاعةٍ أو مبنى
 * (مفتاحٌ أو رمزٌ أو اسمٌ أو معرّف) يُحذف أينما كان عمقُه، ويبقى ما ليس هويّة: roomAvailable،
 * ورموزُ الأسباب (source: "room"، why: "room")، والنصوصُ التي نُقّيت قبلها.
 *
 * دالّةٌ خالصة: لا تعدّل ما تُعطى، وتُختبر وحدها على أيّ جواب.
 */

/** أسماءُ الحقول التي تحمل هويّةَ قاعةٍ أو مبنى — أو قوائمَ مرشّحاتٍ للقسم وحده. */
export const TEACHER_PLACE_FIELDS: ReadonlySet<string> = new Set([
  "room", "hall", "roomId", "roomKey", "roomCode", "roomName", "roomLabel", "roomKeys",
  "building", "buildingId", "buildingCode", "buildingName", "buildingLabel",
  "AdRoomCode", "AdRoomHall", "canonicalCode", "officialCode",
  "companionRoomId", "companionRoomLabel", "companionLabel",
  "roomCandidates", "roomOptions", "roomPick", "reservedRoom", "roomSwitch", "roomSeats",
]);

export function withoutPlaceFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(entry => withoutPlaceFields(entry)) as unknown as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (TEACHER_PLACE_FIELDS.has(key)) continue;
    out[key] = withoutPlaceFields(entry);
  }
  return out as T;
}

/** أسماءُ حقول القاعة والمبنى الباقية في جوابٍ (للاختبار): فارغةٌ = نظيف. */
export function placeFieldsIn(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, at) => placeFieldsIn(entry, `${path}[${at}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
    TEACHER_PLACE_FIELDS.has(key) && entry !== undefined ? [`${path}.${key}`] : placeFieldsIn(entry, `${path}.${key}`));
}
