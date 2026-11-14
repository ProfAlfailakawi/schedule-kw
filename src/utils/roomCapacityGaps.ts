/**
 * ── «قاعات بلا سعة» ───────────────────────────────────────────────────────────
 * قاعدةُ «القاعة المختارة لطلب الأستاذ تتّسع لشعبته» لا تعمل إلا في قاعةٍ سعتُها مسجّلة. فهذه الدوالّ الخالصة
 * تحسب كم قاعةً فعّالةً معتمدةً بلا سعة، ونسبةَ الاكتمال، وتحكم على الرقم المُدخل. الخادمُ والواجهةُ يقرآنها معاً.
 */
import type { MasterBuilding, MasterRoom } from "../types";

export const CAPACITY_GAP_MIN = 1;
/** حدٌّ معقول لقاعةٍ واحدة في هذا الحرم؛ ما فوقه خطأُ إدخالٍ في الغالب (النموذج الكامل يقبل حتى 5000). */
export const CAPACITY_GAP_MAX = 2000;

export interface CapacityGapRoom {
  id: string;
  buildingId: string;
  buildingCode: string;
  code: string;
  fullCode: string;
  roomType: string;
  sectionIds: number[];
  collegeIds: number[];
}

export interface CapacityGapReport {
  /** القاعات الفعّالة المعتمدة وحدها. */
  total: number;
  withCapacity: number;
  missing: number;
  /** null حين لا قاعةَ تُحسب (لا نسبة لصفرٍ من صفر). */
  percent: number | null;
  gaps: CapacityGapRoom[];
}

/** سعةٌ مسجّلة = عددٌ صحيحٌ موجب. الصفرُ والفراغُ وغيرُ الرقم = غيرُ مسجّلة. */
export const hasRegisteredCapacity = (room: Pick<MasterRoom, "capacity">): boolean => {
  const value = Number(room.capacity);
  return room.capacity != null && Number.isInteger(value) && value >= CAPACITY_GAP_MIN;
};

/** نسبةُ الاكتمال: ١٠٠ لا تظهر وفي القاعات نقص، ولا يظهر ٠ وفيها سعةٌ واحدة. */
export function capacityPercent(total: number, withCapacity: number): number | null {
  if (!(total > 0)) return null;
  if (withCapacity >= total) return 100;
  if (withCapacity <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round((withCapacity / total) * 100)));
}

export function roomCapacityGaps(rooms: readonly MasterRoom[], buildings: readonly Pick<MasterBuilding, "id" | "officialCode">[] = []): CapacityGapReport {
  const codeOf = new Map(buildings.map(building => [building.id, String(building.officialCode || "")]));
  const counted = rooms.filter(room => room.active && room.confidence === "CONFIRMED");
  const gaps = counted.filter(room => !hasRegisteredCapacity(room)).map<CapacityGapRoom>(room => {
    const buildingCode = String(room.buildingCode || codeOf.get(room.buildingId) || "");
    return {
      id: room.id, buildingId: room.buildingId, buildingCode, code: room.canonicalCode, fullCode: `${buildingCode}${room.canonicalCode}`,
      roomType: String(room.roomType || ""), sectionIds: [...(room.sectionIds || [])], collegeIds: [...(room.collegeIds || [])],
    };
  }).sort((a, b) => a.buildingCode.localeCompare(b.buildingCode, "en", { numeric: true }) || a.code.localeCompare(b.code, "en", { numeric: true }));
  const withCapacity = counted.length - gaps.length;
  return { total: counted.length, withCapacity, missing: gaps.length, percent: capacityPercent(counted.length, withCapacity), gaps };
}

export interface CapacityParse { ok: boolean; value: number; error: string }

/** الرقمُ المُدخل: عددٌ صحيحٌ موجب لا يتجاوز الحدّ (الأرقام العربية والهندية تُقبل). */
export function parseGapCapacity(raw: unknown): CapacityParse {
  const text = String(raw ?? "").trim()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  if (!text) return { ok: false, value: 0, error: "اكتب عدد المقاعد." };
  if (!/^\d+$/.test(text)) return { ok: false, value: 0, error: "عددٌ صحيحٌ فقط، بلا فواصل." };
  const value = Number(text);
  if (value < CAPACITY_GAP_MIN) return { ok: false, value: 0, error: "السعة لا تقلّ عن مقعدٍ واحد." };
  if (value > CAPACITY_GAP_MAX) return { ok: false, value: 0, error: `السعة لا تتجاوز ${CAPACITY_GAP_MAX.toLocaleString("en-US")} مقعد.` };
  return { ok: true, value, error: "" };
}
