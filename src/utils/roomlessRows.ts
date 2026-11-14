/**
 * ── مواعيدُ بلا قاعة، قبل النشر ───────────────────────────────────────────────────
 * القسمُ ينشر الجدولَ أو بطاقةَ الأستاذ ومنها مواعيدُ لم تُختر لها قاعة: لا يرى الأستاذُ ولا الطالبُ قاعةً لها، ولا يستطيع
 * الفحصُ كشفَ تعارض قاعتها. تنبيهٌ للقسم وحده (قاعدة المالك: التنبيهُ الناعم لا يمنع)، لا يعرض قاعاتٍ لأحد.
 * «بلا قاعة» بالحكم نفسه الذي يقرأ به نموذجُ الموعد ما اختاره المستخدم فعلاً (chosenFields.room): معرّفُ قاعة، أو رمزٌ وقاعةٌ
 * معاً — أما «قاعةٌ معلّقة» (PENDING_ROOM) فاختيارٌ مؤجَّل، ويُحسب هنا بلا قاعة لأن أحداً لن يرى قاعةً له.
 */
export interface RoomlessCandidate {
  id?: number;
  roomId?: unknown;
  AdRoomCode?: unknown;
  AdRoomHall?: unknown;
  locationStatus?: unknown;
}

const filled = (value: unknown) => String(value ?? "").trim() !== "" && String(value) !== "0";

export function hasRoomChosen(row: RoomlessCandidate): boolean {
  if (row.locationStatus === "PENDING_ROOM") return false;
  return filled(row.roomId) || (filled(row.AdRoomCode) && filled(row.AdRoomHall));
}

export function roomlessRows<T extends RoomlessCandidate>(rows: readonly T[]): T[] {
  return rows.filter(row => !hasRoomChosen(row));
}
