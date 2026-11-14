/**
 * ── اختيارُ القاعة الذكي لطلب الأستاذ (C2) ───────────────────────────────────
 *
 * الإلزاميُّ يُحكم في محرّك الحكم نفسه ولا يُكرَّر هنا: القاعةُ خاليةٌ طوال
 * الموعد (بفاصلها)، ومن قاعات الكلية/القسم أو المستعارة المعتمدة، ومعها المرفقُ
 * المطلوب إن كان للمقرر مرفق. وتُضاف هنا السعةُ — وهي شرطٌ لا تفضيل (المالك 2026-11-14:
 * «لما يتم اختيار القاعة له لازم تكون مناسبة لسعة المقرر — هذا ضروري جداً»):
 *
 *   • المقاعدُ المطلوبة = سعةُ الشعبة MaxStudent إن كانت، وإلا سقفُ اللائحة (seatCap، م.8)
 *     ولو كان مفترَضاً (مقررٌ بلا سعةٍ ولا طبيعة) — ويُقال للقسم إنه مفترَض.
 *   • قاعةٌ سعتُها المسجّلة أقلُّ من المقاعد لا تُختار آلياً أبداً (لا «آخرَ الترتيب»).
 *   • قاعةٌ بلا سعةٍ مسجّلة لا تُختار ما دامت قاعةٌ معروفةُ السعة تكفي وخالية؛ فإن لم تكن
 *     حُجزت موسومةً «سعة غير مسجّلة» ليؤكّدها القسم — لا بصمت.
 *   • وقتٌ لا قاعةَ فيه تكفي ليس «متاحاً»: يقول الحكمُ للأستاذ «لا قاعة تتسع لشعبتك في هذا الوقت»
 *     (بلا اسم قاعةٍ ولا مبنى)، ويرى القسمُ المقاعدَ مقابل سعات الخالي، ولا يقترحه محرّكُ البدائل.
 *
 * ثم التفضيليّ بين ما يكفي، بالترتيب: قاعاتُ قسم المقرر، قربُ قاعات الأستاذ في اليوم نفسه
 * (المبنى نفسه)، القاعةُ التي كان فيها هذا المقرر، أقربُ سعةٍ لحاجته، وتوزيعٌ
 * عادل (الأقلُّ إشغالاً في الفصل). كلُّ تفضيلٍ رمزٌ يُرسم أيقونة — لا جُمل.
 *
 * دوالُّ خالصة: تُختبر وحدها، ويستعملها الحكمُ والحجزُ والبدائلُ معاً فلا يختلفون.
 */
import type { RequestRoomReason, RoomSeatFitCode } from "../types";

export interface RankableRoom {
  key: string;
  roomId?: string;
  buildingId?: string;
  capacity?: number;
  /** ملاءمةُ نوع القاعة لنوع المقرر كما تحسبها roomSuitability (أعلى = أنسب). */
  fit: number;
  /** أقسامُ القاعة في السجلّ. */
  sectionIds?: readonly number[];
  /** نوعُ القاعة المسجّل يخالف نوعَ المقرر أو نمطَ تدريسه (roomSuitability: typeRank صفر). */
  typeMismatch?: boolean;
}

export interface RoomRankingContext {
  /** قسمُ المقرر المطلوب. */
  courseSectionId: number;
  /** مباني قاعات الأستاذ في أيام الموعد نفسها. */
  nearBuildingIds: ReadonlySet<string>;
  /** القاعاتُ التي دُرّس فيها هذا المقرر (الصفّ الأصلي أو صفوف الأستاذ للمقرر). */
  previousRoomIds: ReadonlySet<string>;
  /** مقاعدُ الشعبة: MaxStudent أو سقفُ اللائحة (seatCap)؛ صفرٌ = لا يُحكم بالسعة. */
  seats: number;
  /** السقفُ مفترَض (لا سعةَ ولا طبيعة للمقرر): يُحكم به كاملاً، ويُقال للقسم إنه مفترَض. */
  seatsAssumed?: boolean;
  /** كم لقاءً في الفصل تشغله كلُّ قاعة — للتوزيع العادل. */
  usage: ReadonlyMap<string, number>;
  /** للمقرر مرفقٌ مرافق: كلُّ مرشّحٍ بقي يحمل مرفقه، فيُوسم بذلك. */
  facility?: boolean;
}

/** ملاءمةُ سعة القاعة للمقاعد: تكفي (معروفةٌ ≥ المقاعد)، غيرُ مسجّلة، أو أصغر (لا تُختار أبداً). */
export type RoomSeatFit = RoomSeatFitCode;

export interface RankedRoom extends RankableRoom { why: RequestRoomReason[]; score: number; seatFit: RoomSeatFit }

/** النصُّ الذي يقرؤه الأستاذ حين لا قاعةَ تتّسع لشعبته: لا اسمَ قاعةٍ ولا مبنى ولا رقم. */
export const ROOM_TOO_SMALL_TEXT = "لا قاعة تتسع لشعبتك في هذا الوقت.";
/** وسمُ القسم لقاعةٍ حُجزت وسعتُها غير مسجّلة. */
export const ROOM_CAPACITY_UNKNOWN_LABEL = "سعة غير مسجّلة";

/** المقاعدُ المطلوبة للشعبة: MaxStudent إن كانت موجبة، وإلا سقفُ اللائحة (ولو مفترَضاً). */
export function requiredSeats(maxStudent: unknown, regulationCap: { cap: number; assumed: boolean }): { seats: number; assumed: boolean } {
  const entered = Number(maxStudent);
  if (Number.isFinite(entered) && entered > 0) return { seats: Math.round(entered), assumed: false };
  return { seats: Math.max(0, Math.round(Number(regulationCap?.cap || 0))), assumed: Boolean(regulationCap?.assumed) };
}

/** القاعدةُ الواحدة: هل تصلح هذه السعةُ لهذه المقاعد؟ صفرُ مقاعد = لا يُحكم بالسعة. */
export function roomSeatFit(capacity: unknown, seats: number): RoomSeatFit {
  const known = Number(capacity || 0) > 0;
  if (!(Number(seats) > 0)) return known ? "fits" : "unknown";
  if (!known) return "unknown";
  return Number(capacity) >= Number(seats) ? "fits" : "short";
}

/**
 * الاختيارُ الآلي من قاعاتٍ خاليةٍ مرتّبة: أوّلُ ما يكفي، وإلا أوّلُ غيرِ مسجّلةٍ موسومةً للقسم، ولا شيءَ أصغر أبداً.
 * `free` القاعاتُ الخالية في الوقت نفسه بترتيب rankRequestRooms.
 */
export function pickRequestRoom<T extends { seatFit?: RoomSeatFit }>(free: readonly T[]): { room: T; flagged: boolean } | null {
  const fits = free.find(room => room.seatFit === "fits" || room.seatFit == null);
  if (fits) return { room: fits, flagged: false };
  const unknown = free.find(room => room.seatFit === "unknown");
  return unknown ? { room: unknown, flagged: true } : null;
}

export function rankRequestRooms(rooms: readonly RankableRoom[], context: RoomRankingContext): RankedRoom[] {
  const seats = Number(context.seats || 0);
  /* السعةُ المسجّلة دون المقاعد المطلوبة لا تُرشَّح أبداً — ولو كانت المقاعدُ سقفاً مفترَضاً (المالك 2026-11-14).
     ونوعُ القاعة المخالفُ لنوع المقرر (مختبرٌ لمقررٍ نظري، أو قاعةُ محاضرةٍ لمقررٍ عملي) لا يُرشَّح ما دامت
     قاعةٌ من النوع الصحيح تتّسع (المالك 2026-11-12: اختار النظامُ قاعةً لا تلائم المقرر). فإن لم تكن قاعةٌ من نوعه
     تتّسع بقي المخالفُ الذي يتّسع آخرَ الترتيب، ويراه القسمُ ملاءمةً تحتاج مراجعة. السعةُ أوّلاً ثم النوع. */
  const fitOf = (room: RankableRoom) => roomSeatFit(room.capacity, seats);
  const roomy = rooms.filter(room => fitOf(room) !== "short");
  /* طبقةُ السعة قبل كل تفضيل: معروفةٌ تكفي، ثم غيرُ مسجّلة (تُحجز موسومةً للقسم حين لا يخلو غيرُها). */
  const tier = (room: RankableRoom) => fitOf(room) === "fits" ? 0 : 1;
  const adequate = roomy.some(room => !room.typeMismatch) ? roomy.filter(room => !room.typeMismatch) : roomy;
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
    return { ...room, why, score, seatFit: fitOf(room) };
  });
  /* الترتيبُ ثابت: التساوي يُحسم بالمفتاح، فلا يتبدّل «الأنسب» بين قراءتين. */
  return ranked.sort((a, b) => tier(a) - tier(b) || b.score - a.score || a.key.localeCompare(b.key));
}

/** القاعاتُ التي أسقطتها السعةُ وحدها (معروفةٌ أصغر من المقاعد): ليقول الحكمُ «لا قاعة تتسع» لا «لا قاعة». */
export function undersizedRequestRooms<T extends RankableRoom>(rooms: readonly T[], seats: number): T[] {
  return rooms.filter(room => roomSeatFit(room.capacity, seats) === "short");
}
