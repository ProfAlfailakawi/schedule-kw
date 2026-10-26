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

/** مقرراتُ الخدمة (تطلبها صحائفُ أقسامٍ أخرى): «رقم المقرر:رقم قسمه المالك». تضعها مسارات مراجعة الصحف وتقرؤها بطاقةُ الأستاذ. */
type ServiceSource = () => Promise<Map<number, { sectionId: number }>>;
let serviceSource: ServiceSource | null = null;
export const setServiceSource = (next: ServiceSource) => { serviceSource = next; };
/** شارات الصحيفة للمقررات المطلوبة في كرت الأستاذ من المصدر المشترك، بقراءة واحدة. */
export async function planBadgesFor(pairs: Array<{ courseId: unknown; sectionId: unknown }>): Promise<Record<string, string>> {
  if (!source) return {};
  const wanted = new Set(pairs.map(pair => `${Number(pair.sectionId)}:${Number(pair.courseId)}`));
  try {
    const badges: Record<string, string> = {};
    for (const row of await source()) {
      const key = `${row.sectionId}:${row.courseId}`;
      if (wanted.has(key) && row.label) badges[key] = row.label;
    }
    return badges;
  } catch { return {}; }
}

export async function serviceCourseKeys(): Promise<Set<string>> {
  if (!serviceSource) return new Set();
  try {
    const rows = await serviceSource();
    return new Set([...rows].map(([courseId, row]) => `${courseId}:${row.sectionId}`));
  } catch { return new Set(); }
}
