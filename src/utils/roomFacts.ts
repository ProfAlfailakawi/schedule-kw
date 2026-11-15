/**
 * حقائقُ القاعة (السعة والنوع) لمستكشف القاعات. نقيّة بلا React.
 *
 * المصدر: سجلُّ المواقع الذي تقرؤه الشاشة نفسُها من «/api/location-registry» (طلبٌ واحد لكل نطاق،
 * لا طلبَ لكل قاعة)، وفيه `capacity` و`roomType` و`sectionRoomTypes`. صفوفُ الجدول لا تحملهما.
 *
 * القاعدة (الأقلّ مفاجأة): ما لا يُعرف لا يُحذف. فلترُ «40 مقعد» و«مختبر» يُسقط القاعةَ التي نعرف
 * أنها أصغر أو ليست مختبراً فقط؛ أما القاعة التي لا سعةَ لها (أو لا نوعَ) في السجل فتبقى في القائمة
 * مع وسمٍ هادئ «السعة غير مسجّلة» / «النوع غير مسجّل»، فلا تختفي قاعةٌ ربما تناسب. ولا يُطبع صفرٌ
 * ولا رقمٌ مخترع أبداً: السعة غير الموجبة تُعدّ مجهولة.
 */
import { AR, countOf } from "./arabicCount";
import { roomMatchesQuery, type RoomQuery, type RoomQueryRow } from "./roomQuery";
import { roomTypeIn } from "./roomTypeForSection";

export interface RoomFacts { capacity: number | null; roomType: string }

/** سعةٌ موجبةٌ صحيحة أو null (0 وNaN والنصوص الفارغة = غير معروفة). */
export function cleanCapacity(value: unknown): number | null {
  const n = Math.round(Number(value));
  return value != null && value !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

export const isLabRoomType = (type: unknown): boolean => /lab|مختبر|معمل/i.test(String(type ?? ""));

/** «40 مقعداً · مختبر»؛ تُحذف الأجزاء المجهولة بصمت، وتعود "" إن جُهل كلاهما. */
export function roomFactsText(room: { capacity?: number | null; roomType?: string } | null | undefined): string {
  const capacity = cleanCapacity(room?.capacity);
  return [capacity ? countOf(capacity, AR.seat) : "", isLabRoomType(room?.roomType) ? "مختبر" : ""].filter(Boolean).join(" · ");
}

/** خريطةُ حقائق القاعات بمفتاح المستكشف، من حمولة السجل. keyOf = نفسُ تطبيع مفتاح القاعة في الشاشة. */
export function roomFactsByKey(
  registry: { buildings?: unknown; rooms?: unknown } | null | undefined,
  keyOf: (buildingCode: string, hall: string) => string,
  sectionId: number,
): Map<string, RoomFacts> {
  const out = new Map<string, RoomFacts>();
  const buildings = new Map((Array.isArray(registry?.buildings) ? registry!.buildings as any[] : []).map(b => [String(b?.id), String(b?.officialCode || "")]));
  for (const room of Array.isArray(registry?.rooms) ? registry!.rooms as any[] : []) {
    const code = buildings.get(String(room?.buildingId));
    if (!code || !room?.canonicalCode) continue;
    out.set(keyOf(code, String(room.canonicalCode)), { capacity: cleanCapacity(room.capacity), roomType: roomTypeIn(room, sectionId) });
  }
  return out;
}

export interface NeedVerdict { match: boolean; capacityUnknown: boolean; typeUnknown: boolean }

/** هل تناسب القاعةُ الحاجة؟ المعلومُ المخالف يُسقط، والمجهول يبقى موسوماً. اليوم والوقت من roomMatchesQuery. */
export function roomMatchesNeed(
  room: { capacity?: number | null; roomType?: string },
  rows: readonly RoomQueryRow[],
  query: RoomQuery,
): NeedVerdict {
  const capacity = cleanCapacity(room.capacity);
  const type = String(room.roomType ?? "").trim();
  /* «0 مقعد» ليس شرطاً. */
  const minCapacity = query.minCapacity != null && query.minCapacity > 0 ? query.minCapacity : null;
  const capacityUnknown = minCapacity != null && capacity == null;
  const typeUnknown = Boolean(query.lab) && !type;
  const fits = (minCapacity == null || capacityUnknown || (capacity as number) >= minCapacity)
    && (!query.lab || typeUnknown || isLabRoomType(type));
  const timeOnly: RoomQuery = { day: query.day, from: query.from, to: query.to, rest: "" };
  return { match: fits && roomMatchesQuery({}, rows, timeOnly), capacityUnknown, typeUnknown };
}
