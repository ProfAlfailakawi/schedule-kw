/**
 * ── اختيارُ القاعة الذكي لطلب الأستاذ (C2) ───────────────────────────────────
 *
 * الإلزاميُّ يُحكم في محرّك الحكم نفسه ولا يُكرَّر هنا: القاعةُ خاليةٌ طوال
 * الموعد (بفاصلها)، ومن قاعات الكلية/القسم أو المستعارة المعتمدة، ومعها المرفقُ
 * المطلوب إن كان للمقرر مرفق. وتُضاف هنا السعةُ المسجّلة: قاعةٌ سعتُها المعروفة
 * أقلُّ من سعة المقرر لا تُرشَّح (السعةُ غيرُ المسجّلة لا تُسقط القاعة).
 *
 * ثم التفضيليّ، بالترتيب: قاعاتُ قسم المقرر، قربُ قاعات الأستاذ في اليوم نفسه
 * (المبنى نفسه)، القاعةُ التي كان فيها هذا المقرر، أقربُ سعةٍ لحاجته، وتوزيعٌ
 * عادل (الأقلُّ إشغالاً في الفصل). كلُّ تفضيلٍ رمزٌ يُرسم أيقونة — لا جُمل.
 *
 * دالّةٌ خالصة: تُختبر وحدها، ويستعملها الحكمُ والحجزُ معاً فلا يختلفان.
 */
import type { RequestRoomReason } from "../types";

export interface RankableRoom {
  key: string;
  roomId?: string;
  buildingId?: string;
  capacity?: number;
  /** ملاءمةُ نوع القاعة لنوع المقرر كما تحسبها roomSuitability (أعلى = أنسب). */
  fit: number;
  /** أقسامُ القاعة في السجلّ. */
  sectionIds?: readonly number[];
}

export interface RoomRankingContext {
  /** قسمُ المقرر المطلوب. */
  courseSectionId: number;
  /** مباني قاعات الأستاذ في أيام الموعد نفسها. */
  nearBuildingIds: ReadonlySet<string>;
  /** القاعاتُ التي دُرّس فيها هذا المقرر (الصفّ الأصلي أو صفوف الأستاذ للمقرر). */
  previousRoomIds: ReadonlySet<string>;
  /** سعةُ المقرر (MaxStudent)، صفرٌ إن لم تُسجَّل. */
  seats: number;
  /** كم لقاءً في الفصل تشغله كلُّ قاعة — للتوزيع العادل. */
  usage: ReadonlyMap<string, number>;
  /** للمقرر مرفقٌ مرافق: كلُّ مرشّحٍ بقي يحمل مرفقه، فيُوسم بذلك. */
  facility?: boolean;
}

export interface RankedRoom extends RankableRoom { why: RequestRoomReason[]; score: number }

export function rankRequestRooms(rooms: readonly RankableRoom[], context: RoomRankingContext): RankedRoom[] {
  const seats = Number(context.seats || 0);
  const adequate = rooms.filter(room => !(seats > 0 && Number(room.capacity || 0) > 0 && Number(room.capacity) < seats));
  const usages = adequate.map(room => context.usage.get(String(room.roomId || room.key)) || 0);
  const least = usages.length ? Math.min(...usages) : 0;
  const ranked = adequate.map((room, at) => {
    const why: RequestRoomReason[] = [];
    let score = room.fit * 10;
    if ((room.sectionIds || []).includes(Number(context.courseSectionId))) { score += 400; why.push("dept"); }
    if (room.buildingId && context.nearBuildingIds.has(String(room.buildingId))) { score += 300; why.push("near"); }
    if (room.roomId && context.previousRoomIds.has(String(room.roomId))) { score += 200; why.push("previous"); }
    const capacity = Number(room.capacity || 0);
    if (seats > 0 && capacity >= seats) {
      /* أقربُ سعةٍ للحاجة: قاعةُ مئةٍ لشعبةِ ثلاثين هدرٌ لقاعةٍ يحتاجها غيرُه. */
      score += Math.max(0, 100 - Math.round(((capacity - seats) / seats) * 100));
      if (capacity - seats <= Math.max(10, seats * 0.5)) why.push("capacity");
    }
    if (usages[at] === least && adequate.length > 1) { score += 20; why.push("fair"); }
    score -= usages[at];
    if (context.facility) why.push("facility");
    return { ...room, why, score };
  });
  /* الترتيبُ ثابت: التساوي يُحسم بالمفتاح، فلا يتبدّل «الأنسب» بين قراءتين. */
  return ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
