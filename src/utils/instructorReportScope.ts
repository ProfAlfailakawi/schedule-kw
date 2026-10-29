/**
 * ── من يدخل «تقرير الأستاذ» ─────────────────────────────────────────────────
 *
 * قائمة الطباعة في عدسة «الأساتذة» تقرأ صفوف النطاق المطلوب (الكلية المحددة أو
 * الكل) ثم تُبقي منها صفوف الأساتذة المقصودين. وكان المقصود أستاذاً واحداً
 * مختاراً لا غير: فإن لم يُختر أستاذ — وهي حال الشاشة أول ما تُفتح، إذ يُصفَّر
 * الأستاذ مع كل دخول — رجعت الدالة بصمتٍ، فلا ورقة ولا رسالة، وبقيت القائمة
 * مفتوحة. «تقرير الأستاذ ما يعمل».
 *
 * القاعدة الآن:
 *   أستاذٌ مختار            → هو وحده.
 *   بحثٌ بالاسم              → من يطابق اسمُه، ومعهم أساتذة العرض.
 *   لا اختيار               → أساتذة العرض الحالي كلهم (من تعرضهم العدسة)،
 *                             كلٌّ بحمله الكامل في النطاق المطلوب.
 * ولا أحد في العرض → رسالةٌ تقول ذلك، لا صمت.
 */
export type InstructorReportScopeInput = {
  instructorId: number;
  instructorQuery: string;
  /** معرّفات الأساتذة في العرض الحالي (نتائج المرشّحات). */
  viewInstructorIds: Iterable<number>;
  /** يطبّع الاسم للمقارنة (sortKey في الشاشة). */
  normalize: (value: string) => string;
  nameOf: (instructorId: number) => string;
};

export type InstructorReportScope =
  | { ok: true; matches: (row: { AdInstructorId?: number | string | null }) => boolean; label: string; count: number }
  | { ok: false; reason: string };

export function instructorReportScope(input: InstructorReportScopeInput): InstructorReportScope {
  const instructorId = Number(input.instructorId || 0);
  if (instructorId) {
    return { ok: true, matches: row => Number(row.AdInstructorId) === instructorId, label: input.nameOf(instructorId) || "استعلام", count: 1 };
  }
  const ids = new Set([...input.viewInstructorIds].map(Number).filter(id => id > 0));
  const query = input.normalize(String(input.instructorQuery || "").trim()).toLowerCase();
  /* البحث بالرقم المدني تطبّقه نتائج العرض نفسها؛ الاسم وحده يُطابَق هنا عبر الكليات. */
  const byName = query && !/^[\d٠-٩۰-۹]+$/.test(query)
    ? (id: number) => input.normalize(input.nameOf(id) || "").toLowerCase().includes(query)
    : null;
  if (!ids.size && !byName) return { ok: false, reason: "لا أساتذة في العرض الحالي لطباعة تقريرهم." };
  return {
    ok: true,
    matches: row => {
      const id = Number(row.AdInstructorId || 0);
      return id > 0 && (ids.has(id) || Boolean(byName && byName(id)));
    },
    label: String(input.instructorQuery || "").trim() || "أساتذة العرض",
    count: ids.size,
  };
}
