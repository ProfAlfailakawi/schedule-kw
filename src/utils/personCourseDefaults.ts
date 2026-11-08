/**
 * ── مقرراتُ الأستاذ الافتراضية في بطاقته (✏️ و🎓) ─────────────────────────────
 *
 * ورقةُ «المقررات» لكل شخص تبدأ من تاريخه:
 *   - تبويبُ «الصحيفة السابقة»: ما درّسه قبلُ مختارٌ بساعة 🕘 «درّسه».
 *   - تبويبُ الصحيفة الجديدة (باسمها، «صحيفة 2026»): لا مقابلةَ مخزّنة بين الصحيفتين
 *     (courseTransitions فارغة)، فيُطابق بالاسم بعد توحيده (arabicMatchKey): مقررٌ جديد
 *     يطابق اسمُه ما درّسه مختارٌ بسلسلة 🔗 «مقابل»؛ ومقررٌ جديد لا مقابل له في القديمة
 *     يحمل ✨ «جديد» ولا يُختار.
 * القسمُ بلا صحيفتين ⇒ قائمةٌ واحدة، وما درّسه مختارٌ بالساعة.
 */
import { arabicMatchKey } from "./arabicText";

export type PlanSide = "new" | "old" | "shared";
export type CourseMark = "taught" | "match" | "fresh" | "plain";

export interface DeptCourse { id: number; name: string; code?: string; side?: PlanSide | null; collegeId?: number; collegeName?: string }
export interface TaughtCourse { id: number; name: string }

/**
 * مفتاحُ مطابقة الاسم: توحيدُ الهمزات والتاء المربوطة والياء والأرقام، بلا تشكيل ولا تطويل
 * (arabicMatchKey)، ثم تُطوى علاماتُ الترقيم والأقواس مسافاتٍ، ويُسقط «ال» أولَ كل كلمة.
 * الأرقامُ تبقى: «رياضيات 1» غيرُ «رياضيات 2».
 */
export function courseNameKey(name: unknown): string {
  return arabicMatchKey(name)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(word => (word.length > 3 && word.startsWith("ال") ? word.slice(2) : word))
    .join(" ");
}

export interface PersonCourseDefaults {
  /** التبويبان قائمان (في القسم صحيفتان)؟ */
  tabs: boolean;
  old: Array<{ id: number; mark: CourseMark }>;
  fresh: Array<{ id: number; mark: CourseMark }>;
  /** المختارُ ابتداءً: ما درّسه في القديمة، ومقابلُه بالاسم في الجديدة. */
  selected: number[];
}

/** جهةُ المقرر في التبويبين: «shared» في الاثنين، وما لا جهةَ له في القديمة. */
const inOld = (side: PlanSide | null | undefined) => side !== "new";
const inNew = (side: PlanSide | null | undefined) => side === "new" || side === "shared";

export function personCourseDefaults(courses: readonly DeptCourse[], taught: readonly TaughtCourse[]): PersonCourseDefaults {
  const tabs = courses.some(course => inNew(course.side)) && courses.some(course => course.side === "old" || course.side === "shared");
  const taughtIds = new Set(taught.map(row => Number(row.id)));
  const taughtNames = new Set(taught.map(row => courseNameKey(row.name)).filter(Boolean));
  /* «مقابل» يُبحث عنه في القديمة كلّها (لا فيما درّسه وحده): الجديدُ بلا مقابلٍ قديم هو «جديد» حقاً. */
  const oldNames = new Set(courses.filter(course => course.side === "old").map(course => courseNameKey(course.name)).filter(Boolean));
  const old = (tabs ? courses.filter(course => inOld(course.side)) : courses)
    /* المقررُ نفسُه في موقعٍ شقيق برقمٍ آخر: الاسمُ يكفي («درّسه» هناك = درّسه). */
    .map(course => ({ id: course.id, mark: (taughtIds.has(course.id) || taughtNames.has(courseNameKey(course.name)) ? "taught" : "plain") as CourseMark }));
  const fresh = tabs ? courses.filter(course => inNew(course.side)).map(course => {
    const key = courseNameKey(course.name);
    const mark: CourseMark = taughtIds.has(course.id) || (key && taughtNames.has(key)) ? "match"
      : course.side === "new" && !(key && oldNames.has(key)) ? "fresh" : "plain";
    return { id: course.id, mark };
  }) : [];
  const selected = [...new Set([
    ...old.filter(row => row.mark === "taught").map(row => row.id),
    ...fresh.filter(row => row.mark === "match").map(row => row.id),
  ])];
  return { tabs, old, fresh, selected };
}

/** سطرُ الملخّص: كم مقرراً، وكم منها في الصحيفة الجديدة. */
export function selectionCounts(courses: readonly DeptCourse[], selected: Iterable<number>): { total: number; fresh: number } {
  const chosen = new Set([...selected].map(Number));
  const side = new Map(courses.map(course => [course.id, course.side] as const));
  let fresh = 0;
  for (const id of chosen) if (inNew(side.get(id))) fresh++;
  return { total: chosen.size, fresh };
}
