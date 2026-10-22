/** جسرٌ خادميّ لشارة الصحيفة: تضع مسارات مراجعة الصحف مصدرها هنا، وتقرؤه الصفحات العامة (المقترح الدراسي) دون اعتماد متبادل. */
type Source = () => Promise<Array<{ courseId: number; label: string; collegeId: number; sectionId: number }>>;
let source: Source | null = null;

export const setPlanBadgeSource = (next: Source) => { source = next; };

/** شارة مقرر في قسمٍ بعينه (أو "" إن لم تكن له): الاسم لا يعبر حدود الأقسام. */
export async function planBadgeFor(courseId: unknown, sectionId: unknown): Promise<string> {
  if (!source) return "";
  try {
    const row = (await source()).find(item => item.courseId === Number(courseId) && item.sectionId === Number(sectionId));
    return row?.label || "";
  } catch { return ""; }
}
