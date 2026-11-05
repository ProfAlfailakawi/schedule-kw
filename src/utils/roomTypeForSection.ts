/**
 * ── نوعُ القاعة يختلف باختلاف القسم ────────────────────────────────────────
 *
 * ملاحظة المالك (27): G49 استوديو لقسمٍ ومختبرٌ أو قاعةٌ لغيره. القاعةُ واحدة، فلها
 * نوعٌ عام `roomType`، ولكل قسمٍ يخالفه سطرٌ في `sectionRoomTypes`. غيابُ السطر = النوع
 * العام، فلا يتغيّر شيءٌ لقاعةٍ لم يُضبط لها استثناء.
 */
export function roomTypeIn(room: { roomType?: unknown; sectionRoomTypes?: Record<string, string> } | null | undefined, sectionId: unknown): string {
  const own = room?.sectionRoomTypes?.[String(Number(sectionId) || 0)];
  return String(own || room?.roomType || "").normalize("NFKC").trim();
}

/** القاعةُ كما يراها قسمٌ بعينه: لمن يقرأ `roomType` مباشرة. */
export function roomForSection<T extends { roomType?: unknown; sectionRoomTypes?: Record<string, string> }>(room: T | null | undefined, sectionId: unknown): T | null | undefined {
  if (!room) return room;
  const type = roomTypeIn(room, sectionId);
  return type === room.roomType ? room : { ...room, roomType: type };
}

/** سطورُ القاعة المرسلة للحفظ: أقسامٌ مرتبطةٌ بها وحدها، ونوعٌ يخالف العام. */
export function cleanSectionRoomTypes(value: unknown, sectionIds: readonly number[], baseType: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  const allowed = new Set(sectionIds.map(id => String(Number(id))));
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const type = String(raw || "").normalize("NFKC").trim().slice(0, 60);
    if (allowed.has(String(Number(key))) && type && type !== baseType) out[String(Number(key))] = type;
  }
  return out;
}
