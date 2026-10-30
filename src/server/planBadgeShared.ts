/** جسرٌ خادميّ لشارة الصحيفة: تضع مسارات مراجعة الصحف مصدرها هنا، وتقرؤه الصفحات العامة (المقترح الدراسي) دون اعتماد متبادل. */
import type { RequirementKind } from "../utils/courseTags";
import { sheetSideOf, type Membership, type SheetSide } from "../utils/sheetMembership";
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

/* ── شاراتُ المقرر الموحّدة لبطاقة الأستاذ (src/utils/courseTags.ts) ───────────────────────────────────────
   الصحيفةُ كلُّها (صحيفةُ القسم المالك ثم صحيفةُ مقرر الخدمة) ونوعُ المتطلب، لكل «قسم:مقرر». للعرض وحده:
   اقتراحُ المقررات المستقبلية يبقى على planBadgesFor (صحيفة القسم نفسه). */
type CourseFactSource = () => Promise<{
  sheets: Array<{ courseId: number; label: string; sectionId: number }>;
  kinds: Array<{ courseId: number; kind: RequirementKind; service: boolean; sectionId: number }>;
}>;
let factSource: CourseFactSource | null = null;
export const setCourseFactSource = (next: CourseFactSource) => { factSource = next; };

export async function courseTagFactsFor(pairs: Array<{ courseId: unknown; sectionId: unknown }>): Promise<{ sheets: Record<string, string>; kinds: Record<string, RequirementKind>; services: string[] }> {
  const out = { sheets: {} as Record<string, string>, kinds: {} as Record<string, RequirementKind>, services: [] as string[] };
  if (!factSource) return out;
  const wanted = new Set(pairs.map(pair => `${Number(pair.sectionId)}:${Number(pair.courseId)}`));
  try {
    const facts = await factSource();
    /* صحيفةُ القسم المالك أولاً: لا تكتب صحيفةُ الخدمة فوقها. */
    for (const row of facts.sheets) { const key = `${row.sectionId}:${row.courseId}`; if (wanted.has(key) && row.label && !out.sheets[key]) out.sheets[key] = row.label; }
    for (const row of facts.kinds) {
      const key = `${row.sectionId}:${row.courseId}`;
      if (!wanted.has(key)) continue;
      out.kinds[key] = row.kind;
      if (row.service) out.services.push(key);
    }
  } catch { /* الشارة زينة: غيابُها لا يكسر الكرت */ }
  return out;
}

/* ── عضويةُ الصحيفة: الوسمُ والتبويبان من مصدرٍ واحد (src/utils/sheetMembership.ts) ─────────────────────────
   تضعها مساراتُ مراجعة الصحف، وتقرؤها لوحةُ حالة الطرح وقائمةُ المقررات («كل المقررات»، محاكي الشعب). */
type MembershipSource = () => Promise<Map<string, Membership>>;
let membershipSource: MembershipSource | null = null;
export const setSheetMembershipSource = (next: MembershipSource) => { membershipSource = next; };

/**
 * جهةُ كل مقررٍ من مقررات القسم («new» / «old» / «shared»)؛ ما لا جهةَ له لا يُذكر.
 * null: لا ثنائيةَ في القسم (لا جديدةَ أو لا قديمة) — فيبقى كلُّ شيءٍ كما كان، قائمةً واحدة.
 */
export async function sheetSidesFor(sectionId: unknown, courseIds: readonly unknown[]): Promise<Record<number, SheetSide> | null> {
  if (!membershipSource) return null;
  try {
    const rows = await membershipSource();
    const sid = Number(sectionId);
    let fresh = false, old = false;
    for (const row of rows.values()) if (row.sectionId === sid) { fresh ||= Boolean(row.fresh); old ||= row.old; }
    if (!fresh || !old) return null;
    const out: Record<number, SheetSide> = {};
    for (const id of courseIds) {
      const side = sheetSideOf(rows.get(`${sid}:${Number(id)}`));
      if (side) out[Number(id)] = side;
    }
    return out;
  } catch { return null; }
}
