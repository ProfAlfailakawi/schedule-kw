/**
 * ── نوعُ القاعة يختلف باختلاف القسم ────────────────────────────────────────
 *
 * ملاحظة المالك (27): G49 استوديو لقسمٍ ومختبرٌ أو قاعةٌ لغيره. القاعةُ واحدة، فلها
 * نوعٌ عام `roomType`، ولكل قسمٍ يخالفه سطرٌ في `sectionRoomTypes`. غيابُ السطر = النوع
 * العام، فلا يتغيّر شيءٌ لقاعةٍ لم يُضبط لها استثناء.
 */
export function roomTypeIn(room: { roomType?: unknown; sectionRoomTypes?: Record<string, string> } | null | undefined, sectionId: unknown, scopes?: RoomTypeScopes): string {
  const own = room?.sectionRoomTypes?.[String(Number(sectionId) || 0)];
  const type = String(own || room?.roomType || "").normalize("NFKC").trim();
  return !own && type && scopes && !roomTypeOpenTo(type, sectionId, scopes) ? GENERAL_ROOM_LABEL : type;
}

/* ── الأنواعُ لها أهلُها (قرار المالك) ──────────────────────────────────────
 * القاعةُ سجلٌّ واحدٌ أبداً؛ الذي يتعدّد هو اسمُ نوعها في عين كل قسم. نوعٌ بلا سطرٍ
 * هنا عامٌّ يراه الجميع، فلا يتغيّر شيءٌ قبل أن يُضبط نوعٌ بعينه. ونوعٌ له أقسامٌ لا
 * يظهر في قوائم غيرها، ومن رأى قاعةً نوعُها العام متخصّصٌ لغيره قرأها «قاعة عامة». */
export type RoomTypeScopes = Record<string, number[]>;
export const GENERAL_ROOM_LABEL = "قاعة عامة";

const typeKey = (value: unknown) => String(value || "").normalize("NFKC").trim();

/** نوعٌ عامٌّ أو خاصٌّ بهذا القسم؟ */
export function roomTypeOpenTo(type: unknown, sectionId: unknown, scopes: RoomTypeScopes | undefined): boolean {
  const owners = scopes?.[typeKey(type)];
  return !owners?.length || owners.includes(Number(sectionId) || 0);
}

/** قائمةُ الأنواع كما تُعرض لقسمٍ؛ `null` للمدير الذي يرى السجل كلّه. */
export function visibleRoomTypes(types: readonly string[], sectionId: number | null, scopes: RoomTypeScopes | undefined): string[] {
  return sectionId === null ? [...types] : types.filter(type => roomTypeOpenTo(type, sectionId, scopes));
}

export function cleanRoomTypeScopes(value: unknown): RoomTypeScopes {
  const out: RoomTypeScopes = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const type = typeKey(key), ids = Array.isArray(raw) ? [...new Set(raw.map(Number).filter(id => Number.isInteger(id) && id > 0))] : [];
    if (type && ids.length) out[type] = ids.sort((a, b) => a - b);
  }
  return out;
}

/** أقسامٌ تخصّها هذه القاعة بنوعٍ متخصّص: من نوعها العام أو من سطور أقسامها. */
export function specialisedOwners(room: { roomType?: unknown; sectionRoomTypes?: Record<string, string> } | null | undefined, scopes: RoomTypeScopes | undefined): number[] {
  if (!room || !scopes) return [];
  const types = [room.roomType, ...Object.values(room.sectionRoomTypes || {})].map(typeKey);
  return [...new Set(types.flatMap(type => scopes[type] || []))];
}

/** قاعةٌ متخصّصةٌ لغير هذا القسم، وليس من أقسامها المرتبطة: موضعُ تنبيه الاستعارة. */
export function isForeignSpecialised(room: { roomType?: unknown; sectionRoomTypes?: Record<string, string>; sectionIds?: number[] } | null | undefined, sectionId: unknown, scopes: RoomTypeScopes | undefined): boolean {
  const section = Number(sectionId) || 0, owners = specialisedOwners(room, scopes);
  return owners.length > 0 && !owners.includes(section) && !room?.sectionIds?.includes(section);
}

/**
 * القاعةُ كما تُرسل لقسم: اسمُ نوعها في عينه وحده. سطور الأقسام الأخرى وسجلُّ تعديلها
 * يحملان أسماء أنواعٍ لا يراها، فلا يصلان متصفحه.
 */
export function roomViewForSection<T extends { roomType?: unknown; sectionRoomTypes?: Record<string, string>; sectionIds?: number[]; auditHistory?: unknown[] }>(room: T, sectionId: unknown, scopes: RoomTypeScopes | undefined) {
  const { sectionRoomTypes: _hidden, ...rest } = room;
  return { ...rest, roomType: roomTypeIn(room, sectionId, scopes || {}), auditHistory: [] as never[], foreignSpecialised: isForeignSpecialised(room, sectionId, scopes) };
}

/** القاعةُ كما يراها قسمٌ بعينه: لمن يقرأ `roomType` مباشرة. */
export function roomForSection<T extends { roomType?: unknown; sectionRoomTypes?: Record<string, string> }>(room: T | null | undefined, sectionId: unknown, scopes?: RoomTypeScopes): T | null | undefined {
  if (!room) return room;
  const type = roomTypeIn(room, sectionId, scopes);
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
