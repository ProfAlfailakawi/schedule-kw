/**
 * المنتدب في جدولٍ مستورد يصير «هيئة تدريسية».
 *
 * والمتقاعد والمتفرّغ بوضع المنتدب نفسه: لا يُدرِّسان الفصل، فلا يبقى اسمهما في
 * صفوف الجدول الجديد. ووضعهما (AdInstructorStatus) على السجل لا على القسم، فيسري
 * عليهما أينما وردا، ولا يُستثنى منهما من هو في هيئة القسم.
 *
 * المنتدبون يتغيّرون كل فصل، فلا يُحمَّل الفصل الجديد بأسمائهم: كل صف أستاذه
 * منتدب يُسنَد إلى سجل «هيئة تدريسية» الخاص بالقسم. التغيير في صفوف هذا الجدول
 * وحدها، ولا يُمَس وضع المنتدب نفسه في النظام. وبلا سجلٍّ واحدٍ لـ«هيئة تدريسية»
 * للقسم (`placeholderId` صفر) يبقى كل صفٍّ كما هو.
 */
import { instructorIdentityTokens } from "./instructorIdentity";

export type VisitingPlan = { visiting: Set<number>; placeholderId: number };

/** يستبدل في الصفوف (على الموضع) كل منتدبٍ بسجل «هيئة تدريسية»؛ يُرجع عدد ما استُبدل. */
export function applyVisitingToFaculty(rows: Array<{ AdInstructorId?: unknown; replacedVisitingInstructorId?: number; importEvidence?: any }>, plan: VisitingPlan): number {
  if (!plan.placeholderId || !plan.visiting.size) return 0;
  let replaced = 0;
  for (const row of rows) {
    const id = Number(row?.AdInstructorId || 0);
    if (!plan.visiting.has(id)) continue;
    row.replacedVisitingInstructorId = id;
    row.AdInstructorId = plan.placeholderId;
    /* دليل الاستيراد يطابق الصف بعد الاستبدال: قاعدةٌ معلنة لا اسمٌ مقروء، فيبقى الصف جاهزاً. */
    if (row.importEvidence?.instructor) {
      row.importEvidence = {
        ...row.importEvidence,
        instructor: { ...row.importEvidence.instructor, canonical: plan.placeholderId, confidence: "CONFIRMED", score: 100, method: "VISITING_TO_FACULTY", derived: true, reason: "أستاذها منتدب أو متقاعد أو متفرغ فصار «هيئة تدريسية»" },
      };
    }
    replaced += 1;
  }
  return replaced;
}

/** معرّفات من لا يُدرِّس الفصل بحكم وضعه: متقاعد أو متفرّغ. */
export function retiredOrSabbaticalIds(instructors: Iterable<{ AdInstructorId?: unknown; AdInstructorStatus?: unknown } | null | undefined>): Set<number> {
  const ids = new Set<number>();
  for (const person of instructors || []) {
    const id = Number(person?.AdInstructorId || 0);
    if (id > 0 && (person?.AdInstructorStatus === "retired" || person?.AdInstructorStatus === "sabbatical")) ids.add(id);
  }
  return ids;
}

/**
 * المتقاعد والمتفرّغ لا يدخلان كتالوج مطابقة الأسماء في قراءة PDF، فيخرج صفّهما بلا أستاذ.
 * هنا يُردّ إليهما الصف بالاسم المطبوع كاملاً وحده (رمزان فأكثر، يساوي اسمهما تماماً،
 * ولا يشاركهما أستاذٌ فعّال الاسم نفسه)، ثم يُستبدل كغيرهما. لا تقريب ولا اختصار.
 */
export function recoverRetiredFromPrintedName(
  rows: Array<{ AdInstructorId?: unknown; sourceInstructorText?: unknown }>,
  instructors: Array<{ AdInstructorId?: unknown; AdInstructorName?: unknown; AdInstructorStatus?: unknown }>,
): number {
  const keyOf = (value: unknown) => instructorIdentityTokens(String(value || "")).join(" ");
  const away = new Map<string, number[]>(), active = new Set<string>();
  for (const person of instructors) {
    const key = keyOf(person.AdInstructorName), id = Number(person.AdInstructorId || 0);
    if (!key || key.split(" ").length < 2 || id <= 0) continue;
    if (person.AdInstructorStatus === "retired" || person.AdInstructorStatus === "sabbatical") away.set(key, [...(away.get(key) || []), id]);
    else active.add(key);
  }
  let recovered = 0;
  for (const row of rows) {
    if (Number(row.AdInstructorId || 0) > 0) continue;
    const key = keyOf(row.sourceInstructorText), ids = away.get(key);
    if (!key || !ids || ids.length !== 1 || active.has(key)) continue;
    row.AdInstructorId = ids[0];
    recovered += 1;
  }
  return recovered;
}
