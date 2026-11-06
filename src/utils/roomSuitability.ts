import { isForeignSpecialised, roomTypeIn, type RoomTypeScopes } from "./roomTypeForSection";

/** Suitability ranks suggestions; a mismatch never becomes a save prohibition. */
export function roomSuitability(course: { CourseRoomType?: unknown; CourseTeachingMode?: unknown; MaxStudent?: unknown } | null | undefined,
  room: { roomType?: unknown; capacity?: unknown; sectionRoomTypes?: Record<string, string> } | null | undefined, sectionId?: unknown, scopes?: RoomTypeScopes) {
  const expected = String(course?.CourseRoomType || "").trim();
  const actual = roomTypeIn(room as any, sectionId ?? (course as any)?.AdSectionId, scopes);
  const seats = Number(course?.MaxStudent || 0), capacity = Number(room?.capacity || 0);
  let adjustment = 0;
  const reasons: string[] = [];
  if (expected) {
    if (actual === expected) { adjustment += 12; reasons.push(`يلائم نوع المقرر · ${expected}`); }
    else if (actual) { adjustment -= 18; reasons.push(`نوع القاعة ${actual} مختلف عن ${expected}`); }
    else reasons.push("نوع القاعة غير مسجّل");
  }
  const mode = String(course?.CourseTeachingMode || "");
  const mismatch = mode === "theoretical" ? /مختبر|عملي|تطبيقي/.test(actual)
    : /^(applied|practical|field_training)$/.test(mode) && /تدريس|محاضرة|نظر/.test(actual);
  if (mismatch) { adjustment -= 12; reasons.push("طبيعة القاعة تختلف عن نمط تدريس المقرر"); }
  if (seats > 0 && capacity > 0) {
    if (capacity >= seats) { adjustment += 8; reasons.push("السعة المسجلة مناسبة"); }
    else { adjustment -= 24; reasons.push("السعة المسجلة أقل من سعة المقرر"); }
  } else if (seats > 0) reasons.push("سعة القاعة غير مسجلة");
  return { adjustment, reasons, typeRank: expected ? (actual === expected ? 2 : actual ? 0 : 1) : mismatch ? 0 : 1 };
}

/**
 * ملاءمةُ الاستعارة: تنبيهٌ يُقرأ ولا يَمنع. قاعةٌ متخصّصةٌ لقسمٍ آخر، أو سعتُها دون
 * طلبة القسم المستعير، تُقال صراحةً، والقرارُ له. لا يرد هنا اسمُ النوع المتخصّص.
 */
export function borrowFit(room: { roomType?: unknown; sectionRoomTypes?: Record<string, string>; sectionIds?: number[]; capacity?: unknown } | null | undefined, sectionId: unknown, seats: unknown, scopes?: RoomTypeScopes) {
  const capacity = Number(room?.capacity || 0), needed = Number(seats || 0);
  const specialised = isForeignSpecialised(room, sectionId, scopes);
  const capacityShort = capacity > 0 && needed > capacity;
  return { specialised, capacityShort, capacity, seats: needed, warn: specialised || capacityShort };
}
