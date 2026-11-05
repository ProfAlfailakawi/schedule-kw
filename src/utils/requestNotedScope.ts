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

type SentItem = { itemId?: unknown; action?: string; rowId?: unknown; courseId?: unknown; days?: unknown; start?: unknown };
type StoredItem = { itemId?: unknown; action?: string; rowId?: unknown; after?: { courseId?: unknown } | null; slots?: ReadonlyArray<{ day?: unknown; start?: unknown }> };

/** بندٌ مخزَّنٌ أُعيد إرسالُه كما هو: طلبٌ سابق على موعدٍ مقفل يبقى، فهو ليس تعديلاً جديداً. */
function sameAsStored(item: SentItem, stored: readonly StoredItem[]): boolean {
  /* الهويتان معاً: بندٌ قديم بمعرّفه على موعدٍ مقفلٍ آخر ليس البندَ نفسه. */
  const held = stored.find(row => String(row.itemId || "") === String(item.itemId || "") && Number(row.rowId || 0) === Number(item.rowId || 0));
  if (!held || held.action !== item.action) return false;
  if (item.action !== "change" && item.action !== "add") return true;
  if (item.action === "add" && Number(held.after?.courseId || 0) !== Number(item.courseId || 0)) return false;
  const daysOf = (days: unknown[]) => [...new Set(days.map(String))].sort().join();
  return daysOf((held.slots || []).map(slot => slot.day)) === daysOf(Array.isArray(item.days) ? item.days : [])
    && String(held.slots?.[0]?.start || "") === String(item.start || "");
}

/** هل في المُرسَل تعديلٌ جديدٌ خارج المواعيد المسموحة؟ يعيد رقم البند، أو -1. */
export function notedScopeBreach(notedRowIds: readonly number[] | undefined, items: readonly SentItem[], stored: readonly StoredItem[] = []): number {
  if (!notedRowIds?.length) return -1;
  const allowed = new Set(notedRowIds.map(Number));
  return items.findIndex(item => item.action !== "keep" && (item.action === "add" || !allowed.has(Number(item.rowId))) && !sameAsStored(item, stored));
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
