/**
 * ── «لم نصل بعد» للفرع والفصل: قراءةٌ واحدة يسألها كلُّ مكان ───────────────────
 *
 * يجمع ما تحتاجه القاعدة الصرفة (src/utils/courseReach.ts) لقسمٍ في كليته (= فرع/حرم):
 * صحائفُ القسم الحيّة (الجديدة والقديمة، كلُّ مسارٍ بثنائيته) وعضويتُها وقواعدُها المعتمدة،
 * وتاريخُ شعب مقررات القسم في كل الفصول، وقرارُ القسم «افتحه للطرح» من وثيقة حالة الطرح.
 * ثم يُخرج حكماً لكل مقرر: في كل صحيفة، ومجموعاً (يكفي أن يصله الفرعُ في إحداها).
 *
 * يقرؤه: كرتُ الأستاذ والمدرّب، ونموذجُ الموعد، والمراجعةُ قبل الاعتماد، و«كل المقررات»،
 * والمقترحُ الدراسي، ولوحةُ حالة الطرح في النشر. ذاكرةٌ قصيرة تُمسح عند كل حفظٍ لحالة الطرح.
 *
 * قسمٌ بلا صحائف في فرعه يستعير صحيفةَ أخيه في فرعٍ آخر (العائلة نفسها) بمطابقة الرمز القصير،
 * فتبقى القاعدةُ واحدة والتاريخُ تاريخَ الفرع نفسه.
 */
import { Repository } from "../db/repository";
import type { AdCourse, CurriculumCourseRule, CurriculumPlan, CurriculumPlanCourse, CurriculumRuleSet } from "../types";
import { classifySheets, combineReach, sheetReach, sheetYearOf, shortCourseCode, type CourseReach, type ReachSheetKind } from "../utils/courseReach";
import { courseLevelFromCode, normalizeLevel } from "../utils/curriculumRules";
import { termChronology } from "../utils/termSequence";
import { offeringDocId, reachOverrides, type CourseOfferingDoc } from "../utils/courseOffering";
import { departmentFamily } from "../utils/sectionLabel";

export type { ReachSheetKind };

export interface ReachSheetView {
  planId: string;
  kind: ReachSheetKind;
  name: string;
  track: string;
  courseIds: number[];
  reach: Record<number, CourseReach>;
}

export interface CourseReachView extends CourseReach {
  /** الصحائفُ التي تضمّه. */
  sheets: ReachSheetKind[];
}

export interface ScopeReach {
  collegeId: number;
  sectionId: number;
  termId: number;
  /** للقسم صحائف وتاريخٌ يُحكم به. */
  known: boolean;
  sheets: ReachSheetView[];
  courses: Record<number, CourseReachView>;
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: Promise<ScopeReach> }>();
export function forgetCourseReach(): void { cache.clear(); }

async function sheetSource(collegeId: number, sectionId: number, courses: AdCourse[]) {
  const own = await Repository.getCurriculumPlans(sectionId).catch(() => [] as CurriculumPlan[]);
  if (own.some(plan => !plan.virtual && plan.status !== "archived")) {
    return { plans: own, members: await Repository.getCurriculumPlanCourses(sectionId).catch(() => [] as CurriculumPlanCourse[]), remap: (id: number) => id };
  }
  /* لا صحيفة لهذا الفرع: صحيفةُ أخيه في فرعٍ آخر، ومقرراتُها بالرمز القصير إلى مقررات هذا الفرع. */
  const family = departmentFamily(await Repository.getSections() as any[], collegeId, sectionId).filter(member => member.sectionId !== sectionId);
  for (const member of family) {
    const plans = await Repository.getCurriculumPlans(member.sectionId).catch(() => [] as CurriculumPlan[]);
    if (!plans.some(plan => !plan.virtual && plan.status !== "archived")) continue;
    const [members, theirCourses] = await Promise.all([
      Repository.getCurriculumPlanCourses(member.sectionId).catch(() => [] as CurriculumPlanCourse[]),
      Repository.getCoursesBySection(member.sectionId).catch(() => [] as AdCourse[]),
    ]);
    const mine = new Map(courses.map(course => [shortCourseCode(course.CourseCode), Number(course.AdCourseId)] as const));
    const map = new Map(theirCourses.map(course => [Number(course.AdCourseId), mine.get(shortCourseCode(course.CourseCode)) || 0] as const));
    return { plans, members, remap: (id: number) => map.get(Number(id)) || 0 };
  }
  return { plans: [] as CurriculumPlan[], members: [] as CurriculumPlanCourse[], remap: (id: number) => id };
}

const remapRule = (rule: CurriculumCourseRule, remap: (id: number) => number): CurriculumCourseRule => ({
  ...rule,
  courseId: remap(rule.courseId),
  ...(rule.prereq ? { prereq: { ...rule.prereq, all: rule.prereq.all.map(remap).filter(Boolean), anyOf: rule.prereq.anyOf.map(group => group.map(remap).filter(Boolean)).filter(group => group.length) } } : {}),
  ...(rule.coreq ? { coreq: rule.coreq.map(remap).filter(Boolean) } : {}),
});

async function computeReach(collegeId: number, sectionId: number, termId: number): Promise<ScopeReach> {
  const empty: ScopeReach = { collegeId, sectionId, termId, known: false, sheets: [], courses: {} };
  const courses = await Repository.getCoursesBySection(sectionId).catch(() => [] as AdCourse[]);
  if (!courses.length) return empty;
  const [{ plans, members, remap }, ruleSets, terms, offeringDoc] = await Promise.all([
    sheetSource(collegeId, sectionId, courses),
    Repository.listRuleSets().catch(() => [] as CurriculumRuleSet[]),
    Repository.getTerms(),
    Repository.getFeatureDoc<CourseOfferingDoc>("courseOfferingStates", offeringDocId(collegeId, sectionId, termId)).catch(() => null),
  ]);
  const sheets = classifySheets(plans);
  if (!sheets.length) return empty;
  const term = terms.find(row => Number(row.AdTermId) === Number(termId));
  const chronologyOf = new Map(terms.map(row => [Number(row.AdTermId), termChronology(row)] as const));
  const currentChronology = termChronology(term);
  const courseIds = courses.map(course => Number(course.AdCourseId));
  const rows = await Repository.getScheduleHistoryForCourses(courseIds).catch(() => []);
  const byTerm = new Map<number, Set<number>>();
  for (const row of rows as any[]) {
    const chronology = chronologyOf.get(Number(row.AdTermId));
    if (chronology == null) continue;
    byTerm.set(chronology, (byTerm.get(chronology) || new Set()).add(Number(row.AdCourseId)));
  }
  const history = [...byTerm].map(([chronology, ids]) => ({ chronology, courseIds: ids }));
  const codeById = new Map(courses.map(course => [Number(course.AdCourseId), String(course.CourseCode || "")] as const));
  const overrides = reachOverrides(offeringDoc);
  const own = new Set(courseIds);
  const views: ReachSheetView[] = [];
  for (const { plan, kind } of sheets) {
    const set = ruleSets.find(row => row.planId === plan.id && row.status !== "review");
    const rules = (set?.rules || []).map(rule => remapRule(rule, remap)).filter(rule => own.has(Number(rule.courseId)));
    const ruleLevel = new Map(rules.map(rule => [Number(rule.courseId), normalizeLevel(rule.level) || 0] as const));
    const memberIds = [...new Set(members.filter(row => row.planId === plan.id).map(row => remap(Number(row.AdCourseId))).filter(id => own.has(id)))];
    const year = sheetYearOf(plan);
    const reach = sheetReach({
      sheet: { courseIds: memberIds, rules, isNew: kind === "new", startChronology: kind === "new" && year ? year * 10 : null },
      history, currentChronology,
      levelOf: id => courseLevelFromCode(codeById.get(id)) || ruleLevel.get(id) || 0,
      codeOf: id => shortCourseCode(codeById.get(id)),
      overrides,
    });
    views.push({ planId: plan.id, kind, name: String(plan.name || ""), track: String(plan.track || ""), courseIds: memberIds, reach: Object.fromEntries(reach) });
  }
  const out: Record<number, CourseReachView> = {};
  for (const id of courseIds) {
    const holders = views.filter(view => view.reach[id]);
    const combined = combineReach(holders.map(view => view.reach[id]));
    if (combined) out[id] = { ...combined, sheets: [...new Set(holders.map(view => view.kind))] };
  }
  return { collegeId, sectionId, termId, known: history.some(term => term.chronology < currentChronology), sheets: views, courses: out };
}

/** حكمُ الوصول لكل مقررات القسم في كليته لهذا الفصل. */
export function reachForScope(collegeId: number, sectionId: number, termId: number): Promise<ScopeReach> {
  const key = `${Repository.currentDemoSessionId()}|${Number(collegeId)}:${Number(sectionId)}:${Number(termId)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = computeReach(Number(collegeId), Number(sectionId), Number(termId)).catch(() => ({ collegeId, sectionId, termId, known: false, sheets: [], courses: {} } as ScopeReach));
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** حكمُ مقررٍ واحد (أو null: لا صحيفة تضمّه، فلا حكم). */
export async function reachOf(collegeId: number, sectionId: number, termId: number, courseId: number): Promise<CourseReachView | null> {
  return (await reachForScope(collegeId, sectionId, termId)).courses[Number(courseId)] || null;
}

/**
 * ما يُرسل للواجهة: الحكمُ المجموع لكل مقرر (ما يراه الأستاذ في كرته)، وعضويةُ كل صحيفة
 * (لتبويبي النشر). مقررٌ في الصحيفتين يحمل الحكمَ نفسه في التبويبين: مصدرٌ واحد لا حكمان.
 */
export function compactReach(scope: ScopeReach) {
  return {
    known: scope.known,
    courses: scope.courses,
    sheets: scope.sheets.map(sheet => ({ planId: sheet.planId, kind: sheet.kind, name: sheet.name, track: sheet.track, courseIds: sheet.courseIds })),
  };
}
