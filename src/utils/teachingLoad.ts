/**
 * ── النصاب التدريسي: الحسابُ وحده ────────────────────────────────────────────
 *
 * ميزةٌ اختيارية يديرها المسؤول المخوّل من إعدادات الإدارة. هذا الملفُّ نقيٌّ لا يعرف قاعدةَ بيانات ولا
 * واجهة، ويقرؤه الخادمُ (الحفظ والتنبيه) والواجهةُ (شاشةُ الإعداد) بالتعريف نفسه.
 *
 *   العبء   = مجموعُ ساعات المقررات المسجَّلة للعضو في الفصل (CourseHours)، شعبةً واحدةً مرّة واحدة
 *             مهما تعدّدت صفوفُ مواعيدها.
 *   السقف   = الحدُّ الأعلى + الإضافي، كلاهما من استثناء العضو إن وُجد وسرى، وإلا من درجته.
 *   الإضافي = ما بين الأعلى والسقف: حالةٌ هادئة («إضافي»)، لا خطأ.
 *   التجاوز = ما زاد على السقف. وهو تنبيهٌ يُقال ولا يمنع: لا يُرفض به حفظُ موعد.
 *
 * حدودُ النصاب ساعاتٌ صحيحةٌ دائماً: الواجهةُ تقرّب، والتحقّقُ يرفض الكسر، والتنقيةُ تقرّب ما خُزّن قديماً.
 *
 * عضوٌ بلا درجةٍ ولا نصابٍ خاصّ «غيرُ مضبوط»: لا يُفرَض عليه رقمٌ مخترَع، ولا يظهر له تنبيه.
 */
import { AR, countOf } from "./arabicCount";
import type { AcademicRank, AdInstructor, FSchedule, InstructorLoadPolicy, LoadExceptionReason, TeachingLoadAssignment, TeachingLoadConfig } from "../types";
import { termChronology } from "./termSequence";

export const TEACHING_LOAD_DOC_ID = "main" as const;
export const MAX_ACADEMIC_RANKS = 30;
export const MAX_RANK_NAME_LENGTH = 60;
export const MAX_LOAD_HOURS = 60;
export const MAX_EXTRA_HOURS = 30;
/** «الإضافي» في الدرجة وفي الاستثناء له الحدُّ نفسه. */
export const MAX_OVERTIME_HOURS = MAX_EXTRA_HOURS;

/** رقائقُ سبب الاستثناء بترتيب عرضها. */
export const LOAD_EXCEPTION_REASONS: ReadonlyArray<{ id: LoadExceptionReason; label: string }> = [
  { id: "admin", label: "منصب إداري" },
  { id: "task", label: "مهمة" },
  { id: "sabbatical", label: "تفرّغ" },
  { id: "other", label: "أخرى" },
];
const REASON_IDS = new Set<string>(LOAD_EXCEPTION_REASONS.map(item => item.id));
export const loadExceptionReasonLabel = (reason: unknown) => LOAD_EXCEPTION_REASONS.find(item => item.id === reason)?.label || "أخرى";

export const emptyTeachingLoadConfig = (): TeachingLoadConfig => ({ id: TEACHING_LOAD_DOC_ID, enabled: false, ranks: [], assignments: {}, updatedAt: "" });

/** حدٌّ صحيحٌ بين صفرٍ وسقفه، أو undefined لغيابه. الكسرُ القديم (8.5) يُقرَّب ولا يُخزَّن كسراً. */
const hoursOf = (value: unknown, max: number): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(max, Math.round(n));
};
const blank = (value: unknown) => value === undefined || value === null || value === "";
/** هل في الإسناد استثناءٌ (حدٌّ خاصٌّ بالعضو)؟ الدرجةُ وحدها ليست استثناء. */
export const hasLoadOverride = (entry: TeachingLoadAssignment | undefined | null) =>
  Boolean(entry) && (entry!.minHours !== undefined || entry!.maxHours !== undefined || entry!.extraHours !== undefined);
const cleanName = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_RANK_NAME_LENGTH);

/** ما يُقرأ من التخزين أو يصل من العميل، مُنقّىً إلى الشكل الصحيح (لا يرمي). */
export function normalizeTeachingLoadConfig(raw: unknown): TeachingLoadConfig {
  const input: any = raw && typeof raw === "object" ? raw : {};
  const seen = new Set<string>();
  const ranks: AcademicRank[] = [];
  for (const item of Array.isArray(input.ranks) ? input.ranks : []) {
    const name = cleanName(item?.name);
    let id = String(item?.id ?? "").trim().slice(0, 40);
    if (!name) continue;
    if (!id || seen.has(id)) id = `rank-${ranks.length + 1}-${Math.random().toString(36).slice(2, 7)}`;
    seen.add(id);
    ranks.push({
      id, name, minHours: hoursOf(item?.minHours, MAX_LOAD_HOURS) ?? 0, maxHours: hoursOf(item?.maxHours, MAX_LOAD_HOURS) ?? 0,
      overtimeHours: hoursOf(item?.overtimeHours, MAX_OVERTIME_HOURS) ?? 0,
    });
  }
  const assignments: Record<string, TeachingLoadAssignment> = {};
  for (const [key, value] of Object.entries(input.assignments && typeof input.assignments === "object" ? input.assignments : {})) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) continue;
    const row: any = value || {};
    const rankId = String(row.rankId ?? "").trim();
    const entry: TeachingLoadAssignment = {};
    if (rankId && seen.has(rankId)) entry.rankId = rankId;
    const min = hoursOf(row.minHours, MAX_LOAD_HOURS), max = hoursOf(row.maxHours, MAX_LOAD_HOURS), extra = hoursOf(row.extraHours, MAX_EXTRA_HOURS);
    if (min !== undefined) entry.minHours = min;
    if (max !== undefined) entry.maxHours = max;
    if (extra !== undefined) entry.extraHours = extra;
    if (hasLoadOverride(entry)) {
      /* السببُ والفصلُ يتبعان الاستثناء: بلا حدٍّ خاصٍّ لا معنى لهما فيسقطان. */
      entry.reason = REASON_IDS.has(String(row.reason)) ? row.reason : "other";
      const until = Number(row.untilTermId);
      if (Number.isInteger(until) && until > 0) entry.untilTermId = until;
    }
    if (Object.keys(entry).length) assignments[String(id)] = entry;
  }
  return {
    id: TEACHING_LOAD_DOC_ID, enabled: input.enabled === true, ranks, assignments,
    updatedAt: String(input.updatedAt || ""), ...(input.updatedBy ? { updatedBy: String(input.updatedBy).slice(0, 120) } : {}),
  };
}

/** رسالةٌ عربيةٌ واحدة لأول خللٍ في ما يرسله المسؤول، أو null إن صحّ. */
export function teachingLoadProblem(raw: any): string | null {
  const ranks: any[] = Array.isArray(raw?.ranks) ? raw.ranks : [];
  if (ranks.length > MAX_ACADEMIC_RANKS) return `الحدّ الأقصى ${MAX_ACADEMIC_RANKS} درجةً علمية.`;
  const names = new Set<string>();
  for (const rank of ranks) {
    const name = cleanName(rank?.name);
    if (!name) return "اكتب اسماً لكل درجة علمية.";
    const key = name.toLowerCase();
    if (names.has(key)) return `الدرجة «${name}» مكرّرة.`;
    names.add(key);
    const min = Number(rank?.minHours), max = Number(rank?.maxHours);
    if (![min, max].every(n => Number.isFinite(n) && n >= 0 && n <= MAX_LOAD_HOURS)) return `نصاب «${name}» يجب أن يكون بين صفر و${countOf(MAX_LOAD_HOURS, AR.hour)}.`;
    if (![min, max].every(Number.isInteger)) return `نصاب «${name}» بالساعات الصحيحة فقط، بلا كسور.`;
    if (min > max) return `الحدّ الأدنى لنصاب «${name}» أكبر من الأعلى.`;
    if (!blank(rank?.overtimeHours)) {
      const overtime = Number(rank.overtimeHours);
      if (!Number.isFinite(overtime) || overtime < 0 || overtime > MAX_OVERTIME_HOURS) return `إضافيّ «${name}» بين صفر و${countOf(MAX_OVERTIME_HOURS, AR.hour)}.`;
      if (!Number.isInteger(overtime)) return `إضافيّ «${name}» بالساعات الصحيحة فقط، بلا كسور.`;
    }
  }
  for (const [key, row] of Object.entries(raw?.assignments && typeof raw.assignments === "object" ? raw.assignments : {}) as Array<[string, any]>) {
    const min = row?.minHours, max = row?.maxHours, extra = row?.extraHours;
    for (const value of [min, max, extra]) {
      if (blank(value)) continue;
      if (!Number.isFinite(Number(value)) || Number(value) < 0) return `ساعاتُ العضو رقم ${key} غير صالحة.`;
      if (!Number.isInteger(Number(value))) return `ساعاتُ العضو رقم ${key} صحيحةٌ فقط، بلا كسور.`;
      if (Number(value) > MAX_LOAD_HOURS) return `ساعاتُ العضو رقم ${key} لا تتجاوز ${MAX_LOAD_HOURS}.`;
    }
    if (!blank(row?.reason) && !REASON_IDS.has(String(row.reason))) return `سببُ استثناء العضو رقم ${key} غير معروف.`;
    if (extra !== undefined && extra !== null && extra !== "" && Number(extra) > MAX_EXTRA_HOURS) return `الساعات الإضافية لا تتجاوز ${MAX_EXTRA_HOURS}.`;
    if (min !== undefined && min !== null && min !== "" && max !== undefined && max !== null && max !== "" && Number(min) > Number(max)) return `الحدّ الأدنى للعضو رقم ${key} أكبر من الأعلى.`;
  }
  return null;
}

/** عبءُ كل عضو في الفصل: شعبةٌ (مقرر + رمز) تُحسب مرّةً لأستاذها، بساعات مقرّرها. */
export function teachingHoursByInstructor(
  rows: readonly Pick<FSchedule, "AdInstructorId" | "AdCourseId" | "SCode" | "AdCollegeId" | "AdSectionId">[],
  courseHours: ReadonlyMap<number, number>,
): Map<number, number> {
  const counted = new Set<string>();
  const out = new Map<number, number>();
  for (const row of rows) {
    const instructorId = Number(row.AdInstructorId || 0), courseId = Number(row.AdCourseId || 0);
    if (!instructorId || !courseId) continue;
    /* «01» يتكرر بين فروع القسم؛ نعدّ شعبة المقرر في نطاقها الأكاديمي، لا كل صف موعد ولا كل رمز شعبة متشابه. */
    const key = `${instructorId}|${Number(row.AdCollegeId || 0)}|${Number(row.AdSectionId || 0)}|${courseId}|${String(row.SCode ?? "")}`;
    if (counted.has(key)) continue;
    counted.add(key);
    const hours = Number(courseHours.get(courseId) || 0);
    if (hours > 0) out.set(instructorId, Math.round(((out.get(instructorId) || 0) + hours) * 100) / 100);
  }
  return out;
}

export interface TeachingLoadLimits {
  rank: AcademicRank | null;
  min: number | null;
  max: number | null;
  /** «الإضافي» الفعّال (من الاستثناء وإلا من الدرجة). */
  extra: number;
  /** السقفُ المطلق: الأعلى + الإضافي؛ null إن لم يُضبط نصابٌ لهذا العضو. */
  allowed: number | null;
  /** الاستثناءُ الساري (حدودٌ خاصّة بالعضو)، أو null. */
  exception: { reason: LoadExceptionReason; untilTermId?: number } | null;
}

/** أين يقع الحساب زمنياً: لاستثناءٍ له فصلُ انتهاء. بلا سياقٍ يُعدّ الاستثناء سارياً. */
export interface LoadTermContext {
  /** هل انتهى استثناءٌ آخرُ فصوله هذا؟ */
  expired?: (untilTermId: number) => boolean;
}

/** سياقُ الفصل من قائمة الفصول: الاستثناء ينتهي حين يكون الفصلُ المحسوب بعد فصل انتهائه. */
export function loadTermContext(terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string }>, atTermId: number): LoadTermContext {
  const at = terms.find(term => Number(term.AdTermId) === Number(atTermId));
  if (!at) return {};
  const now = termChronology(at);
  return { expired: untilTermId => {
    const until = terms.find(term => Number(term.AdTermId) === Number(untilTermId));
    return Boolean(until) && now > termChronology(until);
  } };
}

/** الأسبقية: استثناءُ العضو الساري ← درجتُه. لا رقمَ مخترَع: بلا هذين «غيرُ مضبوط». */
export function teachingLoadLimits(config: TeachingLoadConfig, instructorId: number, context: LoadTermContext = {}): TeachingLoadLimits {
  const entry = config.assignments[String(instructorId)];
  const rank = entry?.rankId ? config.ranks.find(item => item.id === entry.rankId) || null : null;
  const active = hasLoadOverride(entry) && !(entry!.untilTermId && context.expired?.(entry!.untilTermId));
  const own: TeachingLoadAssignment = active ? entry! : {};
  const min = own.minHours ?? rank?.minHours ?? null;
  const max = own.maxHours ?? rank?.maxHours ?? null;
  const extra = Math.round(Number(own.extraHours ?? rank?.overtimeHours ?? 0));
  return {
    rank, min, max, extra, allowed: max === null ? null : Math.round(max + extra),
    exception: active ? { reason: entry!.reason || "other", ...(entry!.untilTermId ? { untilTermId: entry!.untilTermId } : {}) } : null,
  };
}

/** نصابُ العضو الفعّال (للتزيين عند القراءة)، أو null إن كانت الميزة معطّلة أو لم يُضبط له شيء. */
export function instructorLoadPolicy(config: TeachingLoadConfig, instructorId: number, context: LoadTermContext = {}): InstructorLoadPolicy | null {
  if (!config.enabled) return null;
  const limits = teachingLoadLimits(config, instructorId, context);
  if (limits.max === null || limits.allowed === null) return null;
  return { min: limits.min, max: limits.max, overtime: limits.extra, ceiling: limits.allowed, rankName: limits.rank?.name || "", exception: limits.exception };
}

/**
 * يضيف `LoadPolicy` إلى نسخٍ من الأعضاء (لا يمسّ الأصل ولا `AdInstructorLoad`)، محسوباً في سياق الفصل المعطى.
 * ويُسقط نصاباً فعّالاً قديماً حُسب لفصلٍ آخر إن لم يبقَ له نصابٌ في هذا الفصل (استثناءٌ انتهى ولا درجة).
 * معطَّلةً: القائمةُ كما هي.
 */
export function withLoadPolicies<T extends { AdInstructorId: number }>(people: readonly T[], config: TeachingLoadConfig, context: LoadTermContext = {}): T[] {
  if (!config.enabled) return people as T[];
  return people.map(person => {
    const policy = instructorLoadPolicy(config, Number(person.AdInstructorId), context);
    if (policy) return { ...person, LoadPolicy: policy };
    if (!(person as any).LoadPolicy) return person;
    const { LoadPolicy: _stale, ...rest } = person as any;
    return rest as T;
  });
}

type LoadBearer = Pick<AdInstructor, "AdInstructorLoad" | "LoadPolicy"> | null | undefined;
/**
 * السقفُ الذي يُقاس عليه «تجاوز النصاب» في كل مكان: سقفُ الدرجة/الاستثناء إن ضُبط، وإلا النصابُ المسجّل،
 * وإلا null (لا قيد). والصفرُ الصريح (إعفاءٌ كامل: أعلى 0 وإضافيّ 0) قيدٌ حقيقي لا «لا قيد».
 */
export function loadLimitOf(person: LoadBearer): number | null {
  const policy = person?.LoadPolicy;
  if (policy && Number.isFinite(Number(policy.ceiling))) return Math.max(0, Math.round(Number(policy.ceiling)));
  const own = Number(person?.AdInstructorLoad || 0);
  return own > 0 ? own : null;
}
/** الرقمُ نفسه للعرض والحساب حيث «لا قيد» = 0 (قائمةٌ أو رقمٌ يُطبع). لا يُستعمل حيث يجب التمييز. */
export function loadCapOf(person: LoadBearer): number {
  return loadLimitOf(person) ?? 0;
}
/** للحلقات: النصابُ (الأعلى) وإضافيّه منفصلَين، ليُرسم الإضافيُّ بلونٍ هادئ لا كتجاوز. `limited`: للعضو قيدٌ ولو صفراً. */
export function loadNisabOf(person: LoadBearer): { nisab: number; overtime: number; exception: boolean; limited: boolean } {
  const policy = person?.LoadPolicy;
  if (policy && Number.isFinite(Number(policy.max))) return { nisab: Math.max(0, Math.round(Number(policy.max))), overtime: Math.max(0, Math.round(Number(policy.overtime || 0))), exception: Boolean(policy.exception), limited: true };
  const own = Number(person?.AdInstructorLoad || 0) || 0;
  return { nisab: own, overtime: 0, exception: false, limited: own > 0 };
}

export type TeachingLoadState = "unset" | "under" | "within" | "overtime" | "over";
export interface TeachingLoadStatus extends TeachingLoadLimits {
  instructorId: number;
  hours: number;
  state: TeachingLoadState;
  /** ما زاد على السقف (موجبٌ في «over» فقط). */
  excess: number;
  /** ما وقع بين الأعلى والسقف: ساعاتٌ إضافية لا تجاوز. */
  overtimeUsed: number;
}

export function evaluateTeachingLoad(config: TeachingLoadConfig, instructorId: number, hours: number, context: LoadTermContext = {}): TeachingLoadStatus {
  const limits = teachingLoadLimits(config, instructorId, context);
  const total = Math.round(Number(hours || 0) * 100) / 100;
  let state: TeachingLoadState = "unset";
  let excess = 0, overtimeUsed = 0;
  if (limits.allowed !== null && limits.max !== null) {
    if (total > limits.allowed) { state = "over"; excess = Math.round((total - limits.allowed) * 100) / 100; overtimeUsed = limits.extra; }
    else if (total > limits.max) { state = "overtime"; overtimeUsed = Math.round((total - limits.max) * 100) / 100; }
    else if (limits.min !== null && total < limits.min) state = "under";
    else state = "within";
  }
  return { ...limits, instructorId, hours: total, state, excess, overtimeUsed };
}

/**
 * ما يكتبه المسؤول في خانة ساعات: الفارغُ غيابٌ، والكسرُ (8.5 أو ٨٫٥) يُقرَّب إلى أقرب ساعةٍ صحيحة
 * ويُعلَم بذلك (`rounded`) ليُقال له بلطف. الأرقامُ العربية تُقرأ كاللاتينية.
 */
export function parseWholeHours(text: string, max = MAX_LOAD_HOURS): { value: number | undefined; rounded: boolean } {
  const latin = String(text ?? "").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٫,]/g, ".").trim();
  if (!latin) return { value: undefined, rounded: false };
  const n = Number(latin);
  if (!Number.isFinite(n) || n < 0) return { value: undefined, rounded: false };
  const whole = Math.min(max, Math.round(n));
  return { value: whole, rounded: whole !== n };
}

/** «ساعة» / «ساعتان» / «٣ ساعات»: الصيغةُ العربية نفسها لبقية الشاشات، وللكسور «٢٫٥ ساعة». */
export function hoursLabel(value: number): string {
  const n = Math.round(Number(value || 0) * 100) / 100;
  return countOf(n, AR.hour);
}
