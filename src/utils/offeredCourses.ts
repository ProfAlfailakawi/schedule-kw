/**
 * ── مقرراتُ كل بطاقة (✏️ إرسالٌ لأساتذة محددين) ─────────────────────────────
 *
 * المنسّقُ يختار لكل أستاذٍ المقرراتِ التي تعرضها بطاقتُه. تُحفظ مع طلبه
 * (`InstructorRequest.offeredCourseIds`) ويحكم بها الخادمُ في القراءة والإرسال:
 * لا يرى مقرراً خارجها، ولا يُقبل منه طلبُ مقررٍ خارجها ولو أُرسل من خارج الواجهة.
 *
 * غيابُ القائمة (أو null) = اليوم كما هو: كلُّ المقررات. ومواعيدُه القائمة (إبقاء،
 * تغيير وقت، حذف) لا تمسّها القائمة: هي جدولُه هو، والقائمةُ لما يُضاف.
 */

/** القائمةُ المحفوظة كمجموعة، أو null حين لا قيد. */
export function offeredCourseSet(request: { offeredCourseIds?: readonly unknown[] | null } | null | undefined): Set<number> | null {
  const list = request?.offeredCourseIds;
  if (!Array.isArray(list)) return null;
  return new Set(list.map(Number).filter(id => Number.isSafeInteger(id) && id > 0));
}

/** المقررُ مسموحٌ في هذه البطاقة؟ */
export const offeredAllows = (set: ReadonlySet<number> | null, courseId: unknown): boolean =>
  !set || set.has(Number(courseId));

/**
 * ما يصل من «أرسل» لكل شخص: `{ [instructorId]: courseIds[] }`. يُبقى للمختارين وحدهم، بمعرّفاتٍ صحيحة
 * بلا تكرار؛ وقائمةٌ فارغة أو غيرُ قائمة = بلا قيد (لا تُحفظ).
 */
export function normalizeOfferedCourses(raw: unknown, picked: ReadonlySet<number>): Map<number, number[]> {
  const out = new Map<number, number[]>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    if (!picked.has(id) || !Array.isArray(value)) continue;
    const ids = [...new Set(value.map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 400);
    if (ids.length) out.set(id, ids);
  }
  return out;
}

/**
 * أولُ بندٍ يطلب مقرراً خارج القائمة (إضافةٌ حرّة أو شعبةٌ شاغرة)، أو ‎-1‎.
 * `offeringCourseOf` يقرأ مقررَ الشعبة الشاغرة من معرّفها (من جدول الفصل).
 */
export function offeredBreach(
  set: ReadonlySet<number> | null,
  items: ReadonlyArray<{ action?: unknown; courseId?: unknown; offeringId?: unknown }>,
  offeringCourseOf: (offeringId: number) => number | undefined,
  /** ما طلبه قبل أن تُقيَّد بطاقتُه يبقى له (يقرّره القسم)، فلا يُرفض إرسالُه من جديد. */
  heldBefore: (item: { courseId?: unknown; offeringId?: unknown }) => boolean = () => false,
): number {
  if (!set) return -1;
  return items.findIndex(item => {
    if (!item || item.action !== "add" || heldBefore(item)) return false;
    const courseId = item.offeringId ? offeringCourseOf(Number(item.offeringId)) : Number(item.courseId);
    return !courseId || !set.has(Number(courseId));
  });
}
