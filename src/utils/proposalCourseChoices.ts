/**
 * ── منتقي «شعبة جديدة» في المقترح الدراسي: المقررُ مرّةً واحدة ──────────────────
 *
 * ملاحظةُ المالك (r2): القائمةُ كانت تُظهر كلَّ مقررٍ أربعَ مرّات («108 · أخلاقيات
 * استخدام التكنولوجيا» ×4، و453 ×4، و458 ×4…). السبب: كتالوجُ المساحة يُجمع من كل
 * أقسام العائلة (البنين والبنات… instructorRequestDepartmentScopes)، وفي القسم الواحد
 * قد يكون للمقرر سجلّان (رمزٌ قصير «108» من الصحيفة السابقة، ورمزٌ كامل «0109108»
 * من الجديدة). فيُعرض كلُّ سجلٍّ سطراً.
 *
 * القاعدة الآن:
 *   - الموقعُ (بنين/بنات/الكلية) اختيارٌ مستقلٌّ صغير فوق القائمة، يبدأ بموقع الطلب؛
 *     فلا يتكرّر المقررُ عبر المواقع.
 *   - داخل الموقع: المقررُ هويتُه رقمُه — الخاناتُ الثلاث الأخيرة («108» و«0109108»
 *     مقررٌ واحد، فالعائلةُ قسمٌ أكاديميٌّ واحد) — فإن لم يكن رقماً فاسمُه مطويّاً.
 *     الإملاءان للرقم نفسه سطرٌ واحد؛ ورقمان مختلفان («453 إدارة…» و«458 اداره…»)
 *     يبقيان سطرين، كلٌّ مرّةً واحدة.
 *   - السجلُّ الممثِّل: ما نزلت منه شعبٌ هذا الفصل (عليه يجري الطلبة)، ثم ما في
 *     الصحيفة الجديدة، ثم الأصغرُ معرّفاً. ورقمُ الشعبة المقترح يقرأ شعبَ السجلات كلّها.
 *   - وسمُ «🆕 صحيفة جديدة» لمقررٍ كلُّ سجلّاته في الصحيفة الجديدة وحدها.
 */
import { foldInstructorText } from "./instructorIdentity";
import { toEnglishDigits } from "./digits";
import { campusChips } from "./campusChip";
import type { CourseReach } from "./courseReach";

export interface ProposalCourseLike {
  id: number; code: string; name: string; hours?: number;
  collegeId: number; collegeName: string; sectionId: number;
  sheet?: "new" | "old" | "shared" | "service" | null;
  /** «وصلنا / لم نصل بعد» للمقرر في فرعه (courseReach.ts) — من الخادم. */
  reach?: CourseReach | null;
}

export interface ProposalCourseChoice {
  /** السجلُّ الممثِّل: قيمةُ الاختيار. */
  id: number;
  code: string;
  name: string;
  /** كلُّ سجلّات المقرر نفسه في هذا الموقع. */
  memberIds: number[];
  /** من الصحيفة الجديدة وحدها. */
  isNew: boolean;
  /** حكمُ الوصول للسجلّ الممثِّل. */
  reach: CourseReach | null;
}

export interface ProposalCourseScope {
  key: string;
  collegeId: number;
  sectionId: number;
  /** وسمٌ قصير: «بنين»/«بنات» أو اسمُ الكلية حين يلزم. */
  label: string;
  collegeName: string;
}

/** النصُّ من المصدر الواحد لوسوم المقرر (src/utils/courseTags.ts). */
export { NEW_SHEET_TAG as NEW_SHEET_BADGE } from "./courseTags";

export const scopeKeyOf = (course: { collegeId: number; sectionId: number }) => `${Number(course.collegeId)}:${Number(course.sectionId)}`;

/** هويةُ المقرر داخل عائلة القسم: رقمُه (الخانات الثلاث الأخيرة)، وإلا اسمُه مطويّاً. */
export function courseIdentityKey(course: { code?: string; name?: string }): string {
  const digits = toEnglishDigits(String(course.code || "")).replace(/\s/g, "");
  if (/^\d{3,}$/.test(digits)) return `#${digits.slice(-3)}`;
  if (digits) return `#${digits.toLowerCase()}`;
  return `@${foldInstructorText(String(course.name || "")).replace(/^ال/, "")}`;
}

/** المواقعُ التي في الكتالوج، موقعُ الطلب أولاً. */
export function proposalCourseScopes(courses: readonly ProposalCourseLike[], requestScope?: { collegeId: number; sectionId: number }): ProposalCourseScope[] {
  const seen = new Map<string, ProposalCourseScope>();
  for (const course of courses) {
    const key = scopeKeyOf(course);
    if (!seen.has(key)) seen.set(key, { key, collegeId: Number(course.collegeId), sectionId: Number(course.sectionId), label: "", collegeName: String(course.collegeName || "") });
  }
  const list = [...seen.values()];
  const chips = campusChips(list.map(scope => scope.collegeName));
  for (const scope of list) scope.label = chips.get(scope.collegeName.replace(/\s+/g, " ").trim()) || scope.collegeName || "القسم";
  /* الكليةُ نفسها في قسمين من العائلة: الاسمُ وحده لا يميّز، فيُلحق رقمُ القسم. */
  const counts = new Map<string, number>();
  for (const scope of list) counts.set(scope.label, (counts.get(scope.label) || 0) + 1);
  for (const scope of list) if ((counts.get(scope.label) || 0) > 1) scope.label = `${scope.label} · ${scope.sectionId}`;
  const own = requestScope ? scopeKeyOf(requestScope) : "";
  return list.sort((a, b) => Number(b.key === own) - Number(a.key === own));
}

/** مقرراتُ موقعٍ واحد، كلُّ مقررٍ مرّةً واحدة، مرتّبةً بالرقم ثم الاسم. */
export function proposalCourseChoices(
  courses: readonly ProposalCourseLike[],
  scope: { collegeId: number; sectionId: number } | null,
  usedCodes: Readonly<Record<string, readonly number[]>> = {},
): ProposalCourseChoice[] {
  const inScope = scope ? courses.filter(course => scopeKeyOf(course) === scopeKeyOf(scope)) : [...courses];
  const groups = new Map<string, ProposalCourseLike[]>();
  for (const course of inScope) {
    const key = courseIdentityKey(course);
    groups.set(key, [...(groups.get(key) || []), course]);
  }
  const used = (course: ProposalCourseLike) => (usedCodes[String(course.id)] || []).length;
  const isNewSheet = (course: ProposalCourseLike) => course.sheet === "new" || course.sheet === "shared";
  const out: ProposalCourseChoice[] = [];
  for (const members of groups.values()) {
    const ranked = [...members].sort((a, b) => used(b) - used(a) || Number(isNewSheet(b)) - Number(isNewSheet(a)) || a.id - b.id);
    const lead = ranked[0];
    const display = toEnglishDigits(String(lead.code || "")).replace(/\s/g, "");
    out.push({
      id: lead.id,
      /* الرمزُ المعروض قصيرٌ كما في بقية الشاشات (الخاناتُ السبع للتقارير وحدها). */
      code: /^\d{4,}$/.test(display) ? display.slice(-3) : String(lead.code || ""),
      name: String(lead.name || "").trim(),
      memberIds: ranked.map(course => course.id),
      isNew: members.every(course => course.sheet === "new"),
      reach: lead.reach || null,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }) || a.name.localeCompare(b.name, "ar"));
}

/** أرقامُ الشعب المستعملة للمقرر الممثِّل = شعبُ سجلّاته كلّها (فلا يُقترح رقمٌ مأخوذٌ في سجلٍّ أخيه). */
export function mergedUsedCodes(choices: readonly ProposalCourseChoice[], usedCodes: Readonly<Record<string, readonly number[]>>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [id, codes] of Object.entries(usedCodes)) out[id] = [...codes];
  for (const choice of choices) out[String(choice.id)] = [...new Set(choice.memberIds.flatMap(id => usedCodes[String(id)] || []))];
  return out;
}

/** المقررُ نفسُه في موقعٍ آخر (حين يُبدَّل الموقع وقد اختير مقرر). */
export function sameCourseIn(courses: readonly ProposalCourseLike[], courseId: number | null, scope: { collegeId: number; sectionId: number }, usedCodes: Readonly<Record<string, readonly number[]>> = {}): number | null {
  const current = courses.find(course => course.id === courseId);
  if (!current) return null;
  const key = courseIdentityKey(current);
  const twin = proposalCourseChoices(courses, scope, usedCodes).find(choice => courseIdentityKey({ code: choice.code, name: choice.name }) === key
    || courses.some(course => choice.memberIds.includes(course.id) && courseIdentityKey(course) === key));
  return twin ? twin.id : null;
}
