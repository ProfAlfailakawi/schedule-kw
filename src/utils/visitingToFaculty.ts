/**
 * المنتدب في جدولٍ مستورد يصير «هيئة تدريسية».
 *
 * المنتدبون يتغيّرون كل فصل، فلا يُحمَّل الفصل الجديد بأسمائهم: كل صف أستاذه
 * منتدب يُسنَد إلى سجل «هيئة تدريسية» الخاص بالقسم. التغيير في صفوف هذا الجدول
 * وحدها، ولا يُمَس وضع المنتدب نفسه في النظام. وبلا سجلٍّ واحدٍ لـ«هيئة تدريسية»
 * للقسم (`placeholderId` صفر) يبقى كل صفٍّ كما هو.
 */
export type VisitingPlan = { visiting: Set<number>; placeholderId: number };

/** يستبدل في الصفوف (على الموضع) كل منتدبٍ بسجل «هيئة تدريسية»؛ يُرجع عدد ما استُبدل. */
export function applyVisitingToFaculty(rows: Array<{ AdInstructorId?: unknown; replacedVisitingInstructorId?: number }>, plan: VisitingPlan): number {
  if (!plan.placeholderId || !plan.visiting.size) return 0;
  let replaced = 0;
  for (const row of rows) {
    const id = Number(row?.AdInstructorId || 0);
    if (!plan.visiting.has(id)) continue;
    row.replacedVisitingInstructorId = id;
    row.AdInstructorId = plan.placeholderId;
    replaced += 1;
  }
  return replaced;
}
