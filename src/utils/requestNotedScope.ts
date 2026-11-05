/**
 * ── النشرُ بعد ملاحظات التسجيل (ملاحظة المالك 7) ────────────────────────────
 *
 * يُرجع التسجيلُ الجدولَ بملاحظاتٍ على مواعيد بعينها، فيُعاد النشر لأصحابها: يختار
 * الأستاذ فيما عليه ملاحظة وحده، وما سواه مقفلٌ كما هو. نصُّ الملاحظة لا يصل إليه لأنه
 * قد يذكر قاعة. `notedRowIds` الفارغة أو الغائبة = بطاقةٌ عادية.
 */
export function notedRowsOf(notes: ReadonlyArray<{ origin?: string; resolved?: boolean; scheduleId?: unknown }>): number[] {
  return [...new Set(notes.filter(note => note.origin === "registrar" && !note.resolved).map(note => Number(note.scheduleId)).filter(id => id > 0))];
}

/** هل في المُرسَل ما يخرج عن المواعيد المسموحة؟ يعيد رقم البند، أو -1. */
export function notedScopeBreach(notedRowIds: readonly number[] | undefined, items: ReadonlyArray<{ action?: string; rowId?: unknown }>): number {
  if (!notedRowIds?.length) return -1;
  const allowed = new Set(notedRowIds.map(Number));
  return items.findIndex(item => item.action !== "keep" && (item.action === "add" || !allowed.has(Number(item.rowId))));
}

/**
 * سهمُ التخطيط بجانب المقرر (ملاحظة المالك 6): تنبيهٌ فقط، لا يمنع.
 * `target` عددُ الشعب في «تخطيط الشعب»، و`existing` القائمُ في الجدول.
 */
export function coursePlanHint(target: unknown, existing: number): { kind: "open" | "over"; line: string } | null {
  if (target === undefined || target === null || target === "") return null;
  const planned = Number(target);
  if (!Number.isFinite(planned) || planned < 0) return null;
  if (existing < planned) return { kind: "open", line: `يُفتح · ${existing} من ${planned}` };
  return { kind: "over", line: `تجاوز العدد · المخطط ${planned}` };
}
