/**
 * ── بابُ الطالب: رابطٌ واحدٌ للجامعة ────────────────────────────────────────
 *
 * كان لكل قسمٍ رابطُه، فيضيع الطالبُ بين الروابط، وكان ما يراه الطالبُ يتحدّد
 * بالرابط الذي وصله. هنا **الطالبُ هو المفتاح**: رقمُه المدني ورمزُه الشخصي،
 * وما يراه يتحدّد بحالته وبمرحلة الفصل (utils/termStudentPhases) لا بالرابط.
 *
 * ثوابتُ لا تُكسر:
 *   · لا اسمَ ولا رقمَ مدنيّاً في الملف الدائم — بصمةٌ وأرقامُ مقرّرات.
 *   · الرمزُ الشخصي مُلحَّم (scrypt)، وخطؤه يُعدّ على الملف نفسه ويقفل، لا على
 *     العنوان وحده (شبكةُ جامعةٍ واحدةٌ تخدم ألوفاً).
 *   · الجلسةُ كوكي موقَّع لا يحمل هويةً، وتغييرُ الرمز يُنهي كلَّ الجلسات.
 *   · قراءةُ ما يُطرح تأتي من فهرسٍ في الذاكرة يُجدَّد كل بضع دقائق، لا من
 *     قاعدة البيانات في كل زيارة: ٢٥ ألف طالبٍ لا يقرأون الجدولَ ٢٥ ألف مرة.
 *   · ما يراه الطالبُ من الجدول أعدادٌ لا مواعيد: المسودةُ للأقسام والعمادة.
 */
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createHash, randomUUID } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { Repository } from "../db/repository";
import { studentUnitFloorOf } from "../utils/studentUnitCap";
import { offeringStatesForTerm } from "./offeringStates";
import { offeringBadge, offeringBlocked } from "../utils/courseOffering";
import type { AdCourse, StudentNeed, StudentProfile, StudentWishes } from "../types";
import { validateCivilId } from "../utils/civilId";
import { toEnglishDigits } from "../utils/digits";
import { doorColleges, doorSpecializations, type DoorCollegeIn, type DoorSectionIn } from "../utils/studentCatalog";
import { AR, countOf } from "../utils/arabicCount";
import {
  AFTER_GRADUATION_DAYS, CODE_LENGTH, CODE_MAX_FAILURES, REMEMBER_DAYS, afterCodeFailure, codeProblem, expectedGraduation,
  lockState, planProgress, profileLifetime, resetLifetime, sanitizePassed, shouldTouch, unitsOf, RESET_COOLDOWN_DAYS, TYPICAL_TERM_UNITS, DEFAULT_TERM_UNITS, peerCourseCounts,
} from "../utils/studentProfile";
import { buildSimulationOfferings, ticketContext, universityUnitCap } from "./simulationData";
import { readTravelPolicy } from "./core/travelPolicy";
import { auditSimOfferings, SIM_UNITS_DEFAULT } from "../utils/registrationSim";
import { verifiedUnresolvableStudentConflicts } from "../utils/studentCaseConflict";
import { remainingNeed, unmetPrereq } from "../utils/curriculumRules";
import { adviseStudent } from "../utils/studentAdvice";
import { buildStudentMap } from "../utils/studentMap";
import { closePassed } from "../utils/passedClosure";
import { isTechnologyEducation } from "../utils/curriculumReference";
import { REFERENCE_CATEGORIES, referenceCategoryResolver } from "./planReviewRoutes";
import { buildSheetModel } from "./planSheetRoutes";
import { buildPlanSheet } from "./planSheetPage";
import { buildStudentNotices } from "../utils/studentNotices";
import { studentNeedsCommitteeHelp } from "../utils/studentNeedRequest";
import { caseRefFor, studentNeedKind } from "../db/repository";
import { isCaseLevelNeed, studentCaseStatus } from "../utils/studentCaseDecision";
import { pickDoorTerm, readStudentPhase, studentTimeline } from "../utils/termStudentPhases";
import { deadlineDateShort } from "../utils/submissionDeadlines";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { createAttemptLimiter } from "./publicAttemptLimiter";
import { createTtlMemo } from "./notificationCache";
import {
  clearDoorCookie, codeVersion, doorCookie, hashCode, readCookie, readDoorSession, signDoorSession, verifyCode, DOOR_COOKIE,
} from "./studentDoor";
import { RECOVERY_MAX_FAILURES, calendarFingerprint, calendarToken, calendarTokenValid, readRecovery } from "./studentRecovery";
import { buildReminder, calendarSubscribeLinks, type CalendarLecture } from "../utils/icalendar";
import { sendCalendar } from "./routes/publicCalendarRoutes";

export interface StudentDoorDeps {
  surveyFingerprint: (civil: string) => Promise<string>;
  /** يختم الاسمَ والرقم المدني للطلب (AES-GCM) كما تفعل صفحةُ الاستبيان. */
  sealIdentity: (value: string) => Promise<string>;
  /** يفتح ما ختمه `sealIdentity` — ليرى الطالبُ اسمَه ويتأكّد أنّ بياناته صحيحة. */
  openIdentity?: (cipher: string) => Promise<string>;
  identityKey: () => Promise<Buffer>;
  isProduction: () => boolean;
  /** قالبُ صفحة الصحيفة (public/plans/_template/sheet.html) لخريطة الطالب الكاملة بالأسهم. */
  planSheetTemplate?: string;
  /** طلبُ الخريج: قواعدُ الاستبيان القديم وتحقّقُه من الصحيفة، تُحقن من الخادم فلا تُنسخ. */
  graduate?: {
    rule: (sectionId: number, planId: string | undefined, termName: string) => Promise<{ saved: boolean; summer: boolean; threshold?: number; minThreshold?: number; degreeUnits?: number }>;
    proof: (input: { collegeId: number; termId: number; civil: string; name: string; sectionId: number; bytes: Buffer; mime: string }) => Promise<{ status: number; body: any }>;
    submit: (input: { civil: string; sectionId: number; termId: number; proofToken: string }) => Promise<any>;
  };
}

/** صحيفةُ التخرّج المرفوعة: حدٌّ واحدٌ يُقال للطالب ويُفرض هنا (كما في الاستبيان القديم). */
const PROOF_MAX_BYTES = 14 * 1024 * 1024;
const GRADUATE_REASONS = ["field-conflict", "field-prerequisite-conflict"] as const;

const SESSION_HOURS = 12;

type Door = { fingerprint: string; profile: StudentProfile };

const intFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
};

/* ── ما يُقرأ مراراً: كتالوجُ القسم وفهرسُ المطروح ─────────────────────────── */

interface SectionCatalog {
  plans: Array<{ id: string; name: string; status: string }>;
  /** مقرراتُ كل صحيفة. */
  byPlan: Map<string, number[]>;
  /** بلا صحائف: كتالوجُ القسم الفعّال. */
  catalog: number[];
  courses: Map<number, { code: string; name: string; credit: number; sectionId?: number }>;
}

/* صندوقُ التجربة (/me/demo) بياناتُه غيرُ الحقيقية وأرقامُه تتصادم مع أرقام الحقيقي: فلا يدخل ذاكرةً مشتركة ولا يقرأ منها. */
const scoped = <T,>(memo: ReturnType<typeof createTtlMemo<T>>): ReturnType<typeof createTtlMemo<T>> => ({
  ...memo, get: (key, load) => (Repository.isDemoRequest() ? load() : memo.get(key, load)),
});
const catalogMemo = scoped(createTtlMemo<SectionCatalog>({ ttlMs: 10 * 60_000 }));
const sectionsMemo = scoped(createTtlMemo<any>({ ttlMs: 10 * 60_000 }));
const offeringMemo = scoped(createTtlMemo<Map<number, { sections: number }>>({ ttlMs: 5 * 60_000 }));
/** شعبٌ فُتحت من اقتراحٍ حديثاً: [مقرر → رمز الشعبة]. دقيقتان تكفيان: الإشعارُ لا يُلحّ. */
const openedMemo = scoped(createTtlMemo<Map<number, string>>({ ttlMs: 2 * 60_000 }));
/** كم قسّمٌ أرسلوا رغباتهم: عددٌ واحد لكل (قسم، فصل)، لا قراءةَ كلّ الملفات لكل طالب. */
const wishCountMemo = scoped(createTtlMemo<{ n: number; of: number; byCourse: Record<number, number> }>({ ttlMs: 10 * 60_000 }));
const OPENED_WINDOW_DAYS = 21;
/** قواعدُ الصحيفة المعتمدة: تُقرأ في كل فتحةٍ لمساري، فتُحفظ دقائق. */
const ruleSetMemo = scoped(createTtlMemo<Awaited<ReturnType<typeof Repository.getRuleSet>> | null>({ ttlMs: 5 * 60_000 }));
const ruleSetOf = (planId: string) => ruleSetMemo.get(planId, async () => (await Repository.getRuleSet(planId)) || null);
/** قواعدُ كل الصحائف المعتمدة: لمسبقات المقررات الغريبة عن قسم الطالب (تُقرأ من قسمها المالك). */
const allRuleSetsMemo = scoped(createTtlMemo<Awaited<ReturnType<typeof Repository.listRuleSets>>>({ ttlMs: 5 * 60_000 }));
const allRuleSets = () => allRuleSetsMemo.get("all", () => Repository.listRuleSets());

async function sectionCatalog(sectionId: number): Promise<SectionCatalog> {
  return catalogMemo.get(String(sectionId), async () => {
    const [plans, links, operational, courses] = await Promise.all([
      Repository.getCurriculumPlans(sectionId), Repository.getCurriculumPlanCourses(sectionId),
      Repository.getOperationalCourseIds(sectionId), Repository.getCourses(),
    ]);
    const live = plans.filter(plan => plan.status !== "archived");
    const byPlan = new Map<string, number[]>();
    /* المتطلباتُ العامة (مقررات أقسامٍ أخرى) تُحتسب في تقدّم الطالب من القواعد المعتمدة، ولا تدخل كتالوجَ القسم. */
    const approvedSets = new Map((await Promise.all(live.map(async plan => [plan.id, await Repository.getRuleSet(plan.id)] as const))));
    for (const plan of live) byPlan.set(plan.id, [...new Set([...links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)), ...(approvedSets.get(plan.id)?.externals || []).map(Number)])]);
    const known = new Map<number, { code: string; name: string; credit: number; sectionId?: number }>();
    for (const course of courses as AdCourse[]) {
      known.set(Number(course.AdCourseId), { code: String(course.CourseCode || ""), name: String(course.CourseName || ""), credit: Number(course.CourseCredit) || 0, sectionId: Number(course.AdSectionId) || 0 });
    }
    const catalog = (courses as AdCourse[]).filter(course => Number(course.AdSectionId) === sectionId && operational.has(Number(course.AdCourseId))).map(course => Number(course.AdCourseId));
    /* صحيفةٌ بلا مقرر (مسارٌ «جديد» لم تصدر صحيفته بعد) لا تُعرض للطالب: لا يختار صحيفةً فارغة فيتوهّم أنها صحيفته. */
    const filled = live.filter(plan => (byPlan.get(plan.id) || []).length > 0);
    return { plans: filled.map(plan => ({ id: plan.id, name: plan.name, status: plan.status })), byPlan, catalog, courses: known };
  });
}

/**
 * قاعدةُ كل مقررٍ في صحيفة الطالب: قواعدُ صحيفته لمقررات قسمه، ولمقرر قسمٍ آخر (الإنجليزية، التربية الخاصة…) مسبقاتُه
 * ومقرناتُه من صحيفة قسمه المالك المعتمدة. واحدةٌ لخريطتي وللمنجَز وللرغبات والتذكرة، فلا يختلف حدُّ «ما يحقّ لك».
 */
async function planRules(profile: StudentProfile, catalog: SectionCatalog): Promise<{ own: NonNullable<Awaited<ReturnType<typeof ruleSetOf>>>["rules"]; all: NonNullable<Awaited<ReturnType<typeof ruleSetOf>>>["rules"] }> {
  const rules = profile.curriculumPlanId ? await ruleSetOf(profile.curriculumPlanId) : null;
  const own = rules?.rules || [];
  const planIds = allowedFor(catalog, profile.curriculumPlanId);
  const covered = new Set(own.map(rule => rule.courseId));
  const foreignIds = planIds.filter(id => !covered.has(id) && Number(catalog.courses.get(id)?.sectionId || 0) > 0 && Number(catalog.courses.get(id)!.sectionId) !== profile.AdSectionId);
  const borrowed: typeof own = [];
  if (foreignIds.length) {
    const sets = (await allRuleSets()).filter(set => set.planId !== profile.curriculumPlanId);
    for (const id of foreignIds) {
      const owner = Number(catalog.courses.get(id)!.sectionId);
      const rule = sets.filter(set => Number(set.AdSectionId) === owner).map(set => set.rules.find(row => row.courseId === id)).find(row => row && (row.prereq || row.coreq?.length));
      if (rule) borrowed.push({ courseId: id, ...(rule.prereq ? { prereq: rule.prereq } : {}), ...(rule.coreq?.length ? { coreq: rule.coreq } : {}) });
    }
  }
  /* المسبقاتُ تُحصر في مقررات صحيفة الطالب (كما تفعل خريطتي): مسبقٌ خارج صحيفته لا يُمكنه اجتيازُه فلا يُقفل به مقررٌ أبداً. */
  const inPlan = new Set(planIds);
  const restrict = (rule: (typeof own)[number]): (typeof own)[number] => {
    if (!rule.prereq) return rule;
    const prereq = { ...rule.prereq, all: rule.prereq.all.filter(id => inPlan.has(id)), anyOf: rule.prereq.anyOf.map(group => group.filter(id => inPlan.has(id))).filter(group => group.length) };
    return { ...rule, prereq };
  };
  return { own, all: [...own, ...borrowed].map(restrict) };
}

/** ما ينقص الطالبَ من مسبقاتٍ قبل أن يأخذ كل مقرر (أسماءٌ جاهزة للعرض). واحدةٌ للمطروح وللتذكرة. */
async function prereqNeeds(profile: StudentProfile, catalog: SectionCatalog): Promise<(id: number) => string[]> {
  const { all } = await planRules(profile, catalog);
  const byCourse = new Map(all.map(rule => [rule.courseId, rule]));
  const passedSet = new Set(profile.passedCourseIds);
  const nameOf = (id: number) => catalog.courses.get(id)?.name || `مقرر ${id}`;
  return (id: number): string[] => {
    const rule = byCourse.get(id);
    if (!rule?.prereq) return [];
    const lack = unmetPrereq(rule.prereq, passedSet, profile.passedUnits);
    return [...lack.all.map(nameOf), ...lack.anyOf.map(group => `(${group.map(nameOf).join(" أو ")})`), ...(lack.unitsShort ? [countOf(lack.unitsShort, AR.unit)] : [])];
  };
}

/** مقرراتُ صحيفةٍ بعينها، أو كتالوجُ القسم إن لم تكن له صحائف. */
function allowedFor(catalog: SectionCatalog, planId?: string): number[] {
  if (planId && catalog.byPlan.has(planId)) return catalog.byPlan.get(planId)!;
  return catalog.plans.length ? [] : catalog.catalog;
}

/** كم شعبةً تُطرح من كل مقرّر في فصل الباب (من المسودة أو المعتمد): أعدادٌ فقط. */
async function offeringIndex(termId: number): Promise<Map<number, { sections: number }>> {
  /* C5: مقررٌ 🔒 أو 🌱 ليس مطروحاً لمساري ولو كانت له شعبٌ في المسودة — مصدرٌ واحد (offeringStates). */
  const [raw, states] = await Promise.all([rawOfferingIndex(termId), offeringStatesForTerm(termId)]);
  if (!states.size) return raw;
  return new Map([...raw].filter(([course]) => !offeringBlocked(states, course)));
}
async function rawOfferingIndex(termId: number): Promise<Map<number, { sections: number }>> {
  return offeringMemo.get(String(termId), async () => {
    const rows = await Repository.getSchedulesByScope({ termId });
    const seen = new Map<number, Set<string>>();
    for (const row of rows) {
      const course = Number(row.AdCourseId);
      if (!seen.has(course)) seen.set(course, new Set());
      seen.get(course)!.add(String(row.SCode || row.id));
    }
    return new Map([...seen].map(([course, codes]) => [course, { sections: codes.size }]));
  });
}

/** ما يعرفه الطالبُ عن ملفّه. لا رمزَ ولا تجزئة ولا بصمة. */
let identityOpener: ((cipher: string) => Promise<string>) | null = null;

/** اسمُ الطالب ورقمُه المدني مقنَّعاً (آخر ثلاثة أرقام) — لصاحب الجلسة وحده، ليتأكّد أنّ بياناته صحيحة. */
async function identityOf(profile: StudentProfile): Promise<{ name: string; civilMasked: string } | null> {
  if (!identityOpener || !profile.nameCipher || !profile.civilCipher) return null;
  try {
    const [name, civil] = await Promise.all([identityOpener(profile.nameCipher), identityOpener(profile.civilCipher)]);
    if (!name || !civil) return null;
    return { name, civilMasked: `${"•".repeat(Math.max(0, civil.length - 3))}${civil.slice(-3)}` };
  } catch { return null; }
}

async function summaryOf(profile: StudentProfile) {
  const setupDone = profile.AdSectionId > 0;
  let progress = null as null | ReturnType<typeof planProgress>;
  let sectionName = "", planName = "";
  /* رموز مقررات رغباته: لمتصفحه وحده، يفصل بها الإعلانات الموجَّهة بالطلب فلا يعرف الخادم ما طلب. */
  let wishCodes: string[] = [];
  if (setupDone) {
    const [sections, catalog] = await Promise.all([Repository.getSections(), sectionCatalog(profile.AdSectionId)]);
    sectionName = String((sections as any[]).find(row => Number(row.AdSectionId) === profile.AdSectionId)?.AdSectionName || "");
    planName = catalog.plans.find(plan => plan.id === profile.curriculumPlanId)?.name || "";
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    progress = planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit);
    wishCodes = [...new Set((profile.wishes?.courseIds || []).map(id => String(catalog.courses.get(Number(id))?.code || "").trim().toLowerCase()).filter(Boolean))].slice(0, 12);
    /* الاختياريُّ يُحسب بمجموعته: من أنجز «٢ من ٥» لا يبقى عليه الثلاثةُ الباقية — وإلا بالغنا في المتبقّي والفصول. */
    const rules = profile.curriculumPlanId ? await ruleSetOf(profile.curriculumPlanId) : null;
    if (rules && rules.groups.length) {
      const need = remainingNeed(allowedFor(catalog, profile.curriculumPlanId), rules, new Set(profile.passedCourseIds), credit);
      const total = Math.max(need.requiredUnits, progress.passedUnits);
      progress = { ...progress, totalUnits: total, remainingUnits: need.remainingUnits, percent: total > 0 ? Math.max(0, Math.min(100, Math.round(((total - need.remainingUnits) / total) * 100))) : 0 };
    }
  }
  return {
    setupDone, collegeId: profile.AdCollegeId || 0, sectionId: profile.AdSectionId, sectionName, planId: profile.curriculumPlanId || "", planName,
    passedCourseIds: profile.passedCourseIds, passedUnits: profile.passedUnits, transfer: profile.transfer === true, equivalentCourseIds: profile.equivalentCourseIds || [],
    progress, wishes: profile.wishes || null, wishCodes, masariAck: profile.masariAck || "",
    createdAt: profile.createdAt, keepsUntil: profile.deleteAt, keepsReason: profile.deleteReason, hasIdentity: Boolean(profile.nameCipher && profile.civilCipher),
    /* طلبُ حذفٍ معلَّق: يراه صاحبُ الجلسة ليلغيه برمزه (فتحُ الصفحة وحده لا يُلغيه). */
    resetPending: Boolean(profile.resetRequestedAt),
    identity: await identityOf(profile),
  };
}

/** عمرُ الملف بعد كتابةٍ بالجلسة: طلبُ حذفٍ معلَّق يبقى بموعده (لا يمدّه حضورٌ ولا حفظ)، وإلا القاعدةُ العادية. */
function keptLifetime(profile: StudentProfile, now: Date): Pick<StudentProfile, "deleteAt" | "deleteReason"> {
  return profile.resetRequestedAt ? { deleteAt: profile.deleteAt, deleteReason: "reset" } : profileLifetime(profile, now);
}

/** الاسمُ الثلاثي: ٦–٨٠ حرفاً بلا أرقامٍ ولا رموز. فارغٌ إن لم يصلح. */
function cleanName(value: unknown): string {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  return name.length >= 6 && name.length <= 80 && !/[<>{}\\\d]/.test(name) ? name : "";
}

export function registerStudentDoorRoutes(app: Express, deps: StudentDoorDeps): void {
  identityOpener = deps.openIdentity || null;
  /* الهويةُ تُسأل كثيراً (كل طالبٍ مرة)، فيُعدّ كل سؤالٍ بحدٍّ سخيّ؛ أما الرمز فيُعدّ خطؤه وحده.
     والحدّان على العنوان، وشبكةُ الجامعة (أو مشغّلُ الجوال خلف NAT) عنوانٌ واحدٌ لألوف الطلبة: كان
     الافتراضيُّ ٢٤٠ سؤالاً و٤٠ خطأً في عشر دقائق، فحُجب ٩٦٪ من ستمئة طالبٍ دخلوا من عنوانٍ واحد في
     دقيقتين (scripts/loadtest، 2026-10-24). صار أربعةً وعشرين ألف سؤالٍ (≈ ألفين وأربعمئة طالبٍ في الدقيقة من عنوانٍ
     واحد) وستمئةَ خطأ؛ وكلُّ ملفٍّ يُقفل بعد خمسة أخطاءٍ عليه هو (CODE_MAX_FAILURES)، فالرمزُ لا يُخمَّن. */
  const identityLimiter = createAttemptLimiter({ maxFailures: intFromEnv("STUDENT_DOOR_IDENTITY_MAX", 24_000), windowMs: 10 * 60_000, capacity: 20_000 });
  /* الراجعون يدخلون برمزهم، ونسبةٌ منهم تخطئ؛ ولا يُحجب العنوان إلا إذا غلبت أخطاؤه نجاحاته (creditSuccesses)،
     وفوق ذلك سقفٌ مطلقٌ خمسةُ أضعاف. ولا يُحسب على العنوان إلا تخمينٌ فعلي: رمزٌ خطأ لملفٍّ موجود. */
  const codeMax = intFromEnv("STUDENT_DOOR_CODE_MAX_FAILURES", 600);
  const codeLimiter = createAttemptLimiter({ maxFailures: codeMax, hardMaxFailures: codeMax * 5, creditSuccesses: true, windowMs: 10 * 60_000, capacity: 20_000 });
  const ip = (req: Request) => req.ip || "unknown";
  const secure = deps.isProduction();
  const noStore = (res: Response) => { res.setHeader("Cache-Control", "no-store"); };
  const fail = (res: Response, status: number, error: string, code?: string, extra: Record<string, unknown> = {}) => {
    noStore(res); res.status(status).json({ error, ...(code ? { code } : {}), ...extra });
  };
  const civilOf = (body: any): string | null => {
    const civil = toEnglishDigits(body?.civil).replace(/\D/g, "");
    return civil.length === 12 && validateCivilId(civil).isValid ? civil : null;
  };

  /* ── حدُّ الكتابة: لكل طالب، وسقفٌ عالٍ لكل عنوان ─────────────────────────
     كان الحدُّ ستين كتابةً في الدقيقة لكل عنوان، والطالبُ في أول زيارةٍ يكتب ثلاثاً (الدخول والقسم
     والرغبات): فعشرون طالباً في الدقيقة من شبكة الجامعة، والباقون «طلباتٌ كثيرة». صار الحدُّ نفسُه
     (ستين) لكل طالب — رقمُه المدني في الدخول، وكوكي جلسته بعده — وفوقه سقفٌ لكل عنوانٍ يتّسع لنحو
     أربعمئة طالبٍ في الدقيقة من عنوانٍ واحد، ويبقى حدّاً لمن يدور على أرقامٍ مدنيةٍ مختلفة. والمفتاحُ
     بصمةٌ (sha256) لا الرقمُ نفسُه: الذاكرةُ لا تحمل رقماً مدنياً.
     والجلسةُ الموقَّعة تسبق الرقمَ في الجسم: كان الرقمُ المدنيُّ في الجسم يُقدَّم عليها، فمن بيده جلسةٌ
     يبدّل الرقمَ في كل طلبٍ فيصير له مفتاحٌ جديد وحدٌّ جديد. الآن: جلسةٌ صحيحة ← بصمتُها، وإلا الرقم،
     وإلا العنوان. والكوكيُّ يُتحقَّق من توقيعه، فكوكيٌّ مزوَّرٌ يتبدّل لا يصنع مفتاحاً. */
  const keyHash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);
  const studentWriteKey = async (req: Request): Promise<string> => {
    const session = readDoorSession(await deps.identityKey(), readCookie(req.headers.cookie, DOOR_COOKIE), Date.now());
    if (session) return `door:${keyHash(session.fingerprint)}`;
    const civil = civilOf(req.body);
    if (civil) return `civil:${keyHash(civil)}`;
    return `ip:${ipKeyGenerator(ip(req))}`;
  };
  const writeLimit = [
    rateLimit({
      windowMs: 60_000, limit: intFromEnv("STUDENT_DOOR_WRITES_PER_IP_PER_MINUTE", 1200), standardHeaders: true, legacyHeaders: false,
      message: { error: "طلباتٌ كثيرة من هذه الشبكة في وقتٍ قصير. انتظر دقيقةً ثم أعد المحاولة." },
    }),
    rateLimit({
      windowMs: 60_000, limit: intFromEnv("STUDENT_DOOR_WRITES_PER_MINUTE", 60), standardHeaders: true, legacyHeaders: false,
      keyGenerator: studentWriteKey,
      message: { error: "طلباتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
    }),
  ];

  const issueSession = async (res: Response, profile: StudentProfile, remember: boolean) => {
    const maxAgeSeconds = remember ? REMEMBER_DAYS * 86_400 : SESSION_HOURS * 3600;
    const token = signDoorSession(await deps.identityKey(), {
      fingerprint: profile.fingerprint, exp: Date.now() + maxAgeSeconds * 1000, cv: codeVersion(profile.codeHash),
    });
    /* append لا setHeader: يبقى معه مسحُ كوكي التجربة إن سبقه (studentShowcase). */
    res.append("Set-Cookie", doorCookie(token, { remember, maxAgeSeconds, secure }));
  };

  /** خطأٌ في رمزٍ لملفٍّ موجود: يُعدّ على قفل الملف (٥ ← ١٥ دقيقة)، ولرمز الاستعادة عدّادُه أيضاً (٥ تُسقطه). */
  const countCodeFailure = async (fingerprint: string, now: number, recovery = false): Promise<{ left: number; voided: boolean }> => {
    let left = CODE_MAX_FAILURES, voided = false;
    await Repository.updateStudentProfile(fingerprint, current => {
      if (!current) return undefined;
      if (lockState(current, now).locked) { left = 0; return current; }
      const failures = afterCodeFailure(current, now);
      left = failures.lockedUntil ? 0 : CODE_MAX_FAILURES - failures.count;
      let rec = current.recovery;
      if (recovery && rec) {
        const count = Number(rec.failures || 0) + 1;
        voided = count >= RECOVERY_MAX_FAILURES;
        rec = voided ? undefined : { ...rec, failures: count };
        left = voided ? 0 : Math.min(left, RECOVERY_MAX_FAILURES - count);
      }
      return { ...current, codeFailures: failures, recovery: rec };
    });
    return { left, voided };
  };

  /** من هذا الزائر؟ كوكي موقَّع + ملفٌّ ما زال بالرمز نفسه. */
  const readDoor = async (req: Request): Promise<Door | null> => {
    const session = readDoorSession(await deps.identityKey(), readCookie(req.headers.cookie, DOOR_COOKIE), Date.now());
    if (!session) return null;
    let profile = await Repository.getStudentProfile(session.fingerprint);
    if (!profile || codeVersion(profile.codeHash) !== session.cv) return null;
    const now = Date.now();
    /* صاحبُ الجلسة حاضر: مرةً في اليوم يُكتب حضورُه. ولا يُلغى طلبُ الحذف بمجرّد فتح الصفحة:
       كان أيُّ طلبٍ بجلسةٍ (ولو GET state) يُلغيه، فمن أنشأ ملفَّ غيره يُبطل «نسيت رمزي» بفتح الصفحة.
       الإلغاءُ بإدخال الرمز وحده (الدخول، أو «أبقِ ملفّي»، أو تغيير الرمز، أو الاستعادة). */
    if (shouldTouch(profile.lastSeenAt, now)) {
      profile = (await Repository.updateStudentProfile(session.fingerprint, current => {
        if (!current) return undefined;
        const lastSeenAt = new Date(now).toISOString();
        return { ...current, lastSeenAt, ...keptLifetime({ ...current, lastSeenAt }, new Date(now)) };
      })) || profile;
    }
    return { fingerprint: session.fingerprint, profile };
  };
  const requireDoor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const door = await readDoor(req);
      if (!door) { fail(res, 401, "انتهت جلستك. أدخل رقمك المدني ورمزك من جديد.", "signed-out"); return; }
      (res.locals as any).door = door;
      next();
    } catch (error) { next(error); }
  };
  const doorOf = (res: Response): Door => (res.locals as any).door;

  /* ── الحالة: أيُّ مرحلة، وهل أنت داخل ───────────────────────────────────── */
  app.get("/api/public/me/state", async (req: Request, res: Response) => {
    noStore(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    const today = kuwaitDateISO();
    const reading = readStudentPhase(term?.AdTermStudentPhases, today);
    const door = await readDoor(req).catch(() => null);
    /* «هذا جهازي» يُقرأ من عمر الجلسة نفسها: تغييرُ الرمز يُصدر جلسةً بالعمر نفسه فلا تقصر جلسةُ ١٨٠ يوماً إلى جلسة متصفح. */
    const session = door ? readDoorSession(await deps.identityKey(), readCookie(req.headers.cookie, DOOR_COOKIE), Date.now()) : null;
    res.json({
      demo: Repository.isDemoRequest(),
      term: term ? { id: Number(term.AdTermId), name: String(term.AdTermName || "") } : null,
      phase: {
        key: reading.key, mode: reading.mode, label: reading.forStudent.label, line: reading.forStudent.line,
        canEditWishes: reading.canEditWishes, canReport: reading.canReport, nextAt: reading.nextAt || "", nextLabel: reading.nextLabel || "",
        until: reading.until || "", today,
        roundName: reading.round?.name || "",
      },
      timeline: studentTimeline(term?.AdTermStudentPhases, term?.AdTermSubmissionDeadline, today, "student"),
      signedIn: Boolean(door),
      session: session ? { remember: session.exp - Date.now() > SESSION_HOURS * 3_600_000 } : null,
      profile: door ? await summaryOf(door.profile) : null,
      limits: { codeLength: CODE_LENGTH, ...(await (async () => { const cap = await universityUnitCap(); return { wishUnitsMin: studentUnitFloorOf(cap), wishUnitsMax: cap }; })()), termUnits: TYPICAL_TERM_UNITS, afterGraduationDays: AFTER_GRADUATION_DAYS },
    });
  });

  /* ── الهوية: هل لهذا الرقم ملف؟ (نعم/لا فقط) ───────────────────────────── */
  app.post("/api/public/me/identity", async (req: Request, res: Response) => {
    if (identityLimiter.blocked(ip(req))) { fail(res, 429, "محاولاتٌ كثيرة. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    identityLimiter.fail(ip(req));
    const civil = civilOf(req.body);
    if (!civil) { fail(res, 400, "الرقم المدني غير صحيح. راجع الأرقام كما هي في بطاقتك.", "bad-civil"); return; }
    const profile = await Repository.getStudentProfile(await deps.surveyFingerprint(civil));
    /* تاريخُ الإنشاء (يومٌ لا ساعة): من لم يُنشئ ملفاً قطّ ثم وجد «أهلاً بعودتك» يرى أنه أُنشئ بغير علمه، فيذهب إلى قسمه. */
    noStore(res); res.json({ exists: Boolean(profile), resetPending: Boolean(profile?.resetRequestedAt), resetAt: profile?.resetRequestedAt ? profile.deleteAt : "", since: profile ? String(profile.createdAt || "").slice(0, 10) : "" });
  });

  /* ── نسيتُ رمزي ──────────────────────────────────────────────────────────── */
  app.post("/api/public/me/reset", writeLimit, async (req: Request, res: Response) => {
    if (identityLimiter.blocked(ip(req))) { fail(res, 429, "محاولاتٌ كثيرة. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    identityLimiter.fail(ip(req));
    const civil = civilOf(req.body);
    if (!civil) { fail(res, 400, "الرقم المدني غير صحيح.", "bad-civil"); return; }
    const now = new Date();
    const saved = await Repository.updateStudentProfile(await deps.surveyFingerprint(civil), current => {
      if (!current) return undefined;
      return { ...current, resetRequestedAt: current.resetRequestedAt || now.toISOString(), ...resetLifetime(current, now) };
    });
    if (!saved) { fail(res, 404, "لا ملف لهذا الرقم المدني.", "no-profile"); return; }
    noStore(res); res.json({ ok: true, deleteAt: saved.deleteAt, days: RESET_COOLDOWN_DAYS });
  });

  /* ── الدخول والإنشاء ─────────────────────────────────────────────────────── */
  app.post("/api/public/me/enter", writeLimit, async (req: Request, res: Response) => {
    const attempt = codeLimiter.reserve(ip(req));
    if (!attempt) { fail(res, 429, "أخطأت في الرمز مراتٍ كثيرة من هذا الاتصال. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    const done = () => attempt.release();
    /* لا يُحسب على العنوان إلا تخمينُ رمزٍ لملفٍّ موجود. غيرُه (رقمٌ خطأ، لا ملف، ملفٌّ موجود، ملفٌّ مقفول،
       إنشاءٌ ناقص) يُرجَع بلا رصيد: قفلُ الملف يحمي الرمز، وسؤالُ الوجود يُعدّ في حدّ الهوية. */
    const notGuess = () => attempt.release(false);
    try {
      const civil = civilOf(req.body);
      if (!civil) { notGuess(); fail(res, 400, "الرقم المدني غير صحيح. راجع الأرقام كما هي في بطاقتك.", "bad-civil"); return; }
      const code = toEnglishDigits(req.body?.code).replace(/\D/g, "");
      const remember = req.body?.remember === true;
      const fingerprint = await deps.surveyFingerprint(civil);
      const now = Date.now();

      if (req.body?.create === true) {
        if (req.body?.agree !== true) { notGuess(); fail(res, 400, "وافق على حفظ ملفك أولاً.", "no-consent"); return; }
        const problem = codeProblem(code);
        if (problem) { notGuess(); fail(res, 400, problem, "weak-code"); return; }
        const name = cleanName(req.body?.name);
        if (!name) { notGuess(); fail(res, 400, "اكتب اسمك الثلاثي كما في الجامعة.", "bad-name"); return; }
        const { hash, salt } = await hashCode(code);
        const nameCipher = await deps.sealIdentity(name), civilCipher = await deps.sealIdentity(civil);
        let existed = false;
        const iso = new Date(now).toISOString();
        const created = await Repository.updateStudentProfile(fingerprint, current => {
          if (current) { existed = true; return undefined; }
          const base = { createdAt: iso, lastSeenAt: iso };
          return {
            id: fingerprint, fingerprint, AdCollegeId: 0, AdSectionId: 0, passedCourseIds: [], passedUnits: 0,
            codeHash: hash, codeSalt: salt, nameCipher, civilCipher, updatedAt: iso, ...base, ...profileLifetime(base, new Date(now)),
          };
        });
        if (existed || !created) { notGuess(); fail(res, 409, "لهذا الرقم المدني ملفٌّ بالفعل — أدخل رمزك.", "exists"); return; }
        done();
        await issueSession(res, created, remember);
        noStore(res); res.status(201).json({ ok: true, profile: await summaryOf(created) });
        return;
      }

      const profile = await Repository.getStudentProfile(fingerprint);
      if (!profile) { notGuess(); identityLimiter.fail(ip(req)); fail(res, 404, "لا ملف لهذا الرقم المدني. أنشئ ملفك أولاً.", "no-profile"); return; }
      const lock = lockState(profile, now);
      if (lock.locked) {
        notGuess();
        fail(res, 423, `أخطأت في الرمز مراتٍ كثيرة. جرّب بعد ${countOf(Math.ceil(lock.retryInMs / 60_000), AR.minute)}.`, "locked", { retryInSeconds: Math.ceil(lock.retryInMs / 1000) });
        return;
      }
      if (!(await verifyCode(code, profile.codeHash, profile.codeSalt))) {
        let left = CODE_MAX_FAILURES, locked = false;
        await Repository.updateStudentProfile(fingerprint, current => {
          if (!current) return undefined;
          /* قفلٌ نشأ بينما كان التحقّق جارياً (طلباتٌ متوازية): يبقى كما هو ولا يُستبدل بعدّادٍ جديد. */
          if (lockState(current, now).locked) { locked = true; left = 0; return current; }
          const failures = afterCodeFailure(current, now);
          locked = Boolean(failures.lockedUntil);
          left = locked ? 0 : CODE_MAX_FAILURES - failures.count;
          return { ...current, codeFailures: failures };
        });
        fail(res, 401, locked ? "أخطأت في الرمز مراتٍ كثيرة. جرّب بعد 15 دقيقة." : "الرمز غير صحيح.", locked ? "locked" : "bad-code", { attemptsLeft: left });
        return;
      }
      done();
      let lockedMeanwhile = false;
      const entered = (await Repository.updateStudentProfile(fingerprint, current => {
        if (!current) return undefined;
        /* رمزٌ صحيح وصل بعد أن قُفل الملفُّ بخطأٍ متوازٍ: القفلُ يسري ولا يُمحى. */
        if (lockState(current, now).locked) { lockedMeanwhile = true; return current; }
        const lastSeenAt = new Date(now).toISOString();
        return { ...current, codeFailures: undefined, resetRequestedAt: undefined, lastSeenAt, ...profileLifetime({ ...current, lastSeenAt }, new Date(now)) };
      })) || profile;
      if (lockedMeanwhile) {
        fail(res, 423, "أخطأت في الرمز مراتٍ كثيرة. جرّب بعد 15 دقيقة.", "locked");
        return;
      }
      await issueSession(res, entered, remember);
      noStore(res); res.json({ ok: true, profile: await summaryOf(entered) });
    } catch (error) {
      done();
      console.error("[student-door] enter:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر الدخول الآن. أعد المحاولة بعد قليل.");
    }
  });

  app.post("/api/public/me/exit", (_req: Request, res: Response) => {
    res.setHeader("Set-Cookie", clearDoorCookie(secure));
    noStore(res); res.json({ ok: true });
  });

  /* ── الكليات والأقسام (عامّة): يختار الطالبُ كليتَه ثم قسمَه ───────────────────
     كلُّ كليةٍ في الجامعة (لها أقسام) تعمل، لا كليةٌ بعينها. بلا `collegeId` تعود قائمةُ الكليات؛ ومعه تعود أقسامُ تلك الكلية
     بمعرّفاتها، فلا يُدمج قسمٌ بقسمٍ في كليةٍ أو موقعٍ آخر. `track` (بنين/بنات) يُضيّق القائمة ويُبقي الكلياتِ التي لا مسارَ لها. */
  app.get("/api/public/me/catalog", async (req: Request, res: Response) => {
    const track = req.query.track === "boys" || req.query.track === "girls" ? req.query.track : "";
    const data = await sectionsMemo.get("all", async () => {
      const [colleges, sections] = await Promise.all([Repository.getColleges(), Repository.getSections()]);
      return { colleges: colleges as DoorCollegeIn[], sections: sections as DoorSectionIn[] };
    });
    const colleges = doorColleges(data.colleges, data.sections, track);
    const asked = req.query.collegeId === undefined ? 0 : Number(req.query.collegeId);
    res.setHeader("Cache-Control", "public, max-age=300");
    if (!asked) { res.json({ track: track || null, colleges, college: null, specializations: [] }); return; }
    const college = doorColleges(data.colleges, data.sections).find(row => row.id === asked);
    if (!college) { fail(res, 400, "اختر كليتك من القائمة.", "bad-college"); return; }
    res.json({ track: track || null, colleges: [], college, specializations: doorSpecializations(asked, data.sections) });
  });

  /* ── صحيفةُ قسمٍ: الصحائف ومقرراتها ─────────────────────────────────────── */
  app.get("/api/public/me/plan", requireDoor, async (req: Request, res: Response) => {
    const sectionId = Number(req.query.sectionId || 0);
    const sections = await Repository.getSections();
    if (!sectionId || !(sections as any[]).some(row => Number(row.AdSectionId) === sectionId)) { fail(res, 400, "اختر قسماً صحيحاً.", "bad-section"); return; }
    const catalog = await sectionCatalog(sectionId);
    /* لكل مقررٍ مسبقاتُه (من صحيفة قسمه، ولمقررات الأقسام الأخرى من صحيفة قسمها): شاشةُ «ما أنجزتُه» لا تسمح بتعليم ما لم تُعلَّم مسبقاتُه. */
    const withRules = async (planId: string, ids: number[]) => {
      const { all } = await planRules({ AdSectionId: sectionId, curriculumPlanId: planId || undefined } as StudentProfile, catalog);
      const byCourse = new Map(all.map(rule => [rule.courseId, rule.prereq]));
      return ids.map(id => {
        const prereq = byCourse.get(id), known = catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
        return { id, ...known, ...(prereq && (prereq.all.length || prereq.anyOf.length || prereq.minUnits) ? { prereq: { all: prereq.all, anyOf: prereq.anyOf, minUnits: prereq.minUnits || 0 } } : {}) };
      }).sort((a, b) => a.code.localeCompare(b.code, "en"));
    };
    const lists = catalog.plans.length
      ? await Promise.all(catalog.plans.map(async plan => ({ ...plan, courses: await withRules(plan.id, catalog.byPlan.get(plan.id) || []) })))
      : [{ id: "", name: "مقررات القسم", status: "catalog", courses: await withRules("", catalog.catalog) }];
    noStore(res); res.json({ source: catalog.plans.length ? "plan" : "catalog", plans: lists });
  });

  /* ── خريطتي: صحيفتي كلُّها (مقرراتُ قسمي والأقسام الأخرى والعامة) بقواعدها، بلا أيّ بيانٍ عني ──
     الحالةُ (اجتزته/متاح/ينتظر) تُحسب في المتصفح من إنجازي، فتتجدّد لحظةَ أعلّم مقرراً. */
  /* ── الرئيسية بطلبٍ واحد ──────────────────────────────────────────────────
     كانت الصفحة تطلب تسعة مسارات بعد الدخول. تُسجَّل هذه المسارات هنا كما كانت (الاختبارات تعتمد عليها)، وتُحفظ معالجاتها،
     فيستدعيها /home معاً على الخادم ويعيد جوابَ كلٍّ منها كما هو: لا منطقَ جديد ولا أرقامَ تختلف بين الطريقين. */
  type HomeHandler = (req: Request, res: Response) => Promise<void>;
  const homeHandlers = new Map<string, HomeHandler>();
  const homeGet = (name: string, handler: HomeHandler) => {
    homeHandlers.set(name, handler);
    app.get(`/api/public/me/${name}`, requireDoor, handler);
  };
  const HOME_PART_MS = 8000;
  const HOME_KEYS = ["notices", "cases", "graduate", "request-context", "ticket", "report", "advice", "offered", "map"] as const;
  app.get("/api/public/me/home", requireDoor, async (req: Request, res: Response) => {
    noStore(res);
    const door = doorOf(res);
    const parts: Record<string, { ok: boolean; status: number; d: any }> = {};
    await Promise.all(HOME_KEYS.map(async key => {
      const handler = homeHandlers.get(key);
      if (!handler) { parts[key] = { ok: false, status: 404, d: {} }; return; }
      const out = { ok: true, status: 200, d: {} as any };
      const fake = {
        locals: { door },
        setHeader() { return fake; },
        status(code: number) { out.status = code; out.ok = code < 400; return fake; },
        json(body: unknown) { out.d = body; return fake; },
      };
      /* جزءٌ بطيء (استعلامٌ بطيء أو اعتمادٌ معلَّق) لا يحجب بقية الأجزاء: يُسقَط بعد مهلةٍ ويعود العميلُ إلى مساره الخاص لهذا الجزء وحده. */
      const run = (async () => {
        try { await handler(req, fake as unknown as Response); }
        catch (error) { out.ok = false; out.status = 500; out.d = {}; console.error(`[student-door] home/${key}:`, error instanceof Error ? error.message : error); }
      })();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const verdict = await Promise.race([run.then(() => "done" as const), new Promise<"slow">(resolve => { timer = setTimeout(() => resolve("slow"), HOME_PART_MS); })]);
      if (timer) clearTimeout(timer);
      parts[key] = verdict === "slow" ? { ok: false, status: 504, d: {} } : out;
    }));
    res.json({ parts });
  });

  homeGet("map", async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const [catalog, sections, terms] = await Promise.all([sectionCatalog(profile.AdSectionId), Repository.getSections(), Repository.getTerms()]);
    const planIds = allowedFor(catalog, profile.curriculumPlanId);
    if (!planIds.length) { res.json({ ready: false, reason: "no-plan" }); return; }
    const term = pickDoorTerm(terms as any);
    const [index, rules, planR] = await Promise.all([term ? offeringIndex(Number(term.AdTermId)) : Promise.resolve(null), profile.curriculumPlanId ? ruleSetOf(profile.curriculumPlanId) : Promise.resolve(null), planRules(profile, catalog)]);
    const nameOfSection = new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
    const mine = nameOfSection.get(profile.AdSectionId) || "";
    const resolver = isTechnologyEducation(mine) ? referenceCategoryResolver(sections as any[]) : null;
    const known = new Map([...catalog.courses].map(([id, course]) => [id, { code: course.code, name: course.name, credit: course.credit, sectionId: Number(course.sectionId) || 0 }]));
    const model = buildStudentMap({
      planCourseIds: planIds, courses: known, rules: planR.all, groups: rules?.groups || [], studentSectionId: profile.AdSectionId,
      sectionName: id => nameOfSection.get(id) || "", offered: index,
      categoryOf: resolver ? id => resolver(known.get(id)?.code || "", known.get(id)?.sectionId || 0) : undefined,
      categoryOrder: resolver ? REFERENCE_CATEGORIES.order : undefined,
      planName: catalog.plans.find(plan => plan.id === profile.curriculumPlanId)?.name || "", studentSectionName: mine, termName: term ? String(term.AdTermName || "") : "",
    });
    const termId = Number(term?.AdTermId || 0), day = kuwaitDateISO();
    const passedIds = profile.passedCourseIds.filter(id => model.courses.some(course => course.id === id));
    const passed = new Set(passedIds);
    const passedUnitsNow = passedIds.reduce((sum, id) => sum + (known.get(id)?.credit || 0), 0);
    const completedGroups = new Set(model.groups.filter(group => {
      const ids = group.courseIds.filter(id => passed.has(id));
      const units = ids.reduce((sum, id) => sum + (known.get(id)?.credit || 0), 0);
      return ids.length >= group.minCourses && units >= group.minUnits;
    }).map(group => group.id));
    const availableIds = model.courses.filter(course => {
      if (passed.has(course.id) || (course.group && completedGroups.has(course.group))) return false;
      const rule = model.rules[course.id];
      if (!rule) return true;
      return rule.all.every(id => passed.has(id)) && rule.anyOf.every(group => group.some(id => passed.has(id)))
        && passedUnitsNow >= rule.minUnits;
    }).map(course => course.id);
    const offeredIds = Object.keys(model.offered).map(Number);
    const snapshot = { termId, day, passedIds, offeredIds, availableIds };
    const prior = profile.visitSnapshot?.termId === termId ? profile.visitSnapshot : null;
    const changes = prior ? {
      passed: passedIds.filter(id => !prior.passedIds.includes(id)),
      offered: offeredIds.filter(id => !prior.offeredIds.includes(id)),
      available: availableIds.filter(id => !prior.availableIds.includes(id)),
    } : null;
    if (termId && profile.visitSnapshot?.day !== day) {
      /* خريطة الطالب محسوبة؛ لا نؤخر عرضها على كتابة لقطة الزيارة. */
      void Repository.updateStudentProfile(fingerprint, current => current ? { ...current, visitSnapshot: snapshot } : undefined).catch(() => undefined);
    }
    res.json({ ready: true, hasRules: Boolean(rules?.rules.length), model, changes });
  });

  /* خريطةُ قسمي ملوّنةً بإنجازي؛ QR المطبوع يعيد إلى باب مساري العام، لا إلى جلسة الطالب الخاصة. */
  app.get("/api/public/me/map-page", requireDoor, async (_req: Request, res: Response) => {
    const { profile } = doorOf(res);
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", "noindex");
    const message = (status: number, text: string) => res.status(status).type("text/html; charset=utf-8").send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>خريطتي</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;background:#F2F3EF;color:#131817;text-align:center;padding:24px"><div><p style="font-size:18px;font-weight:700">${text}</p><p><a href="/me#plan" style="color:#1F6B5C;font-weight:700">‹ خريطتي</a></p></div></body></html>`);
    if (!deps.planSheetTemplate) { message(503, "الصفحة غير متاحة الآن."); return; }
    const planId = profile.curriculumPlanId || "";
    if (profile.AdSectionId <= 0 || !planId) { message(404, "لا صحيفةَ مرتبطة بملفّك بعد."); return; }
    const [plans, live, catalog] = await Promise.all([Repository.getCurriculumPlans(profile.AdSectionId), ruleSetOf(planId), sectionCatalog(profile.AdSectionId)]);
    const plan = plans.find(row => row.id === planId && !row.virtual);
    if (!plan || !live) { message(404, "لم تُعتمد قواعد صحيفتك بعد."); return; }
    const { model } = await buildSheetModel(plan, live);
    const passedCodes = profile.passedCourseIds.map(id => catalog.courses.get(id)?.code || "").filter(Boolean);
    res.type("text/html; charset=utf-8").send(buildPlanSheet(model, { template: deps.planSheetTemplate }, { passed: passedCodes, back: "/me#plan", qrUrl: "https://schedule-kw.com/me#plan" }));
  });

  /* ── ملفي: القراءة والحفظ ────────────────────────────────────────────────── */
  app.get("/api/public/me/profile", requireDoor, async (_req: Request, res: Response) => {
    noStore(res); res.json(await summaryOf(doorOf(res).profile));
  });

  app.put("/api/public/me/profile", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    const sectionId = Number(req.body?.sectionId || 0);
    const section = (await Repository.getSections() as any[]).find(row => Number(row.AdSectionId) === sectionId);
    if (!section) { fail(res, 400, "اختر قسمك العلمي.", "bad-section"); return; }
    /* الكليةُ تُشتقّ من القسم؛ وإن أرسلتها الصفحةُ فلتطابقه، فلا يُحفظ ملفٌّ بقسمِ كليةٍ غير التي اختارها. */
    if (req.body?.collegeId !== undefined && Number(req.body.collegeId) !== Number(section.AdCollegeId)) { fail(res, 400, "هذا القسم ليس من الكلية المختارة.", "bad-college"); return; }
    const catalog = await sectionCatalog(sectionId);
    let planId = String(req.body?.curriculumPlanId || "");
    if (catalog.plans.length === 1) planId = catalog.plans[0].id;
    if (catalog.plans.length >= 2 && !catalog.plans.some(plan => plan.id === planId)) { fail(res, 400, "اختر صحيفتك: السابقة أم الجديدة.", "bad-plan"); return; }
    if (!catalog.plans.length) planId = "";
    const allowed = allowedFor(catalog, planId);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    /* المنجَزُ يتبع المسبقات بالضبط (في القسم وفي غيره): ما اختلّ شرطُه يُسقَط مع ما بُني عليه. */
    const candidate = sanitizePassed(req.body?.passedCourseIds, new Set(allowed));
    const ruleView = await planRules({ ...profile, AdSectionId: sectionId, curriculumPlanId: planId || undefined } as StudentProfile, catalog);
    const byCourse = new Map(ruleView.all.map(rule => [rule.courseId, rule.prereq]));
    /* المحوَّل المعادَلة له مقررات: ما أعلنه معادَلاً لا يُسقَط (ويُعدّ مسبقاً لما بعده)، وبغير إعلان «محوَّل» يُهمَل. */
    const transfer = req.body?.transfer === true;
    const equivalentAsked = transfer ? new Set(sanitizePassed(req.body?.equivalentCourseIds, new Set(candidate))) : new Set<number>();
    const { kept: passed, dropped } = closePassed(candidate, id => byCourse.get(id), credit, equivalentAsked);
    const equivalent = passed.filter(id => equivalentAsked.has(id));
    const passedSet = new Set(passed), passedUnits = unitsOf(passed, credit);
    const prereqOk = (id: number) => { const lack = unmetPrereq(byCourse.get(id), passedSet, passedUnits); return !lack.all.length && !lack.anyOf.length && !lack.unitsShort; };
    const progress = planProgress(allowed, passed, credit);
    const now = new Date();
    const saved = await Repository.updateStudentProfile(fingerprint, current => {
      if (!current) return undefined;
      const sameSection = current.AdSectionId === sectionId;
      const base = { ...current, AdCollegeId: Number(section.AdCollegeId), AdSectionId: sectionId, curriculumPlanId: planId || undefined,
        passedCourseIds: passed, passedUnits: unitsOf(passed, credit), updatedAt: now.toISOString(),
        transfer: transfer || undefined, equivalentCourseIds: equivalent.length ? equivalent : undefined,
        expectedGraduationAt: expectedGraduation(progress.remainingUnits, now),
        /* الرغباتُ تُبقى ما دامت صالحةً للصحيفة الجديدة: القسمُ نفسُه والصحيفةُ نفسُها،
           وما أُنجز من مقرراتها المرغوبة يسقط منها. */
        wishes: sameSection && (current.curriculumPlanId || "") === planId && current.wishes
          ? { ...current.wishes, courseIds: current.wishes.courseIds.filter(id => allowed.includes(id) && !passed.includes(id) && prereqOk(id)) }
          : undefined };
      return { ...base, ...keptLifetime(base, now) };
    });
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    noStore(res); res.json({ ...(await summaryOf(saved)), droppedPassed: dropped.length });
  });

  /* ── الرغبات: ما أريده هذا الفصل (مرحلة الرغبات وحدها) ──────────────────── */
  app.put("/api/public/me/wishes", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    const reading = readStudentPhase(term?.AdTermStudentPhases);
    if (!term || !reading.canEditWishes) { fail(res, 409, "الرغبات غير مفتوحة الآن.", "wishes-closed", { line: reading.line }); return; }
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك أولاً: القسم والمقررات المنجزة.", "no-setup"); return; }
    const units = Math.round(Number(req.body?.targetUnits));
    const unitCap = await universityUnitCap(), unitFloor = studentUnitFloorOf(unitCap);
    if (!Number.isFinite(units) || units < unitFloor || units > unitCap) { fail(res, 400, `الوحدات من ${unitFloor} إلى ${unitCap}.`, "bad-units"); return; }
    const catalog = await sectionCatalog(profile.AdSectionId);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remaining = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    /* ما ينقصه مسبقُه لا يدخل رغباتِه: لا يطلب مقرراً لا يستطيع تسجيله، فلا يُفسد الرادار بطلبٍ وهميّ. */
    const needsOf = await prereqNeeds(profile, catalog);
    const wanted = sanitizePassed(req.body?.courseIds, remaining).filter(id => needsOf(id).length === 0).slice(0, 12);
    const c = req.body?.constraints || {};
    const wishes: StudentWishes = {
      termId: Number(term.AdTermId), targetUnits: units, courseIds: wanted,
      constraints: { noMorning: c.noMorning === true, noAfternoon: c.noAfternoon === true, freeDay: c.freeDay === true },
      updatedAt: new Date().toISOString(),
    };
    const now = new Date();
    /* الرغباتُ كتابةٌ في الملف كغيرها: تُحدَّث «آخرُ تعديل» (شارةُ «عدّلت ملفّك بعد آخر حساب» تعتمد عليه) وعمرُ الملف. */
    const saved = await Repository.updateStudentProfile(fingerprint, current => {
      if (!current) return undefined;
      const base = { ...current, wishes, updatedAt: now.toISOString() };
      return { ...base, ...keptLifetime(base, now) };
    });
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    noStore(res); res.json({ ok: true, wishes });
  });

  /* ── مقترحي: «سجّل هذه الثلاثة لأنها تفتح لك كذا وتتخرّج بعد كذا» — من صحيفته ومسبقاتها وما يُطرح فعلاً ── */
  homeGet("advice", async (_req: Request, res: Response) => {
    const { profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const termId = Number(term.AdTermId);
    const [catalog, index, rules] = await Promise.all([sectionCatalog(profile.AdSectionId), offeringIndex(termId), profile.curriculumPlanId ? ruleSetOf(profile.curriculumPlanId) : Promise.resolve(null)]);
    const plan = allowedFor(catalog, profile.curriculumPlanId);
    if (!plan.length) { res.json({ ready: false, reason: "no-plan" }); return; }
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const advice = adviseStudent({
      planCourseIds: plan, passed: profile.passedCourseIds, passedUnits: profile.passedUnits,
      rules: rules?.rules || [], groups: rules?.groups || [], credit,
      name: id => catalog.courses.get(id)?.name || `مقرر ${id}`, code: id => catalog.courses.get(id)?.code || "",
      offered: id => (index.get(id)?.sections || 0) > 0,
      targetUnits: profile.wishes && profile.wishes.termId === termId ? profile.wishes.targetUnits : DEFAULT_TERM_UNITS,
      maxUnits: await universityUnitCap(),
    });
    res.json({ ready: true, termName: String(term.AdTermName || ""), ...advice });
  });

  /* ── «أنت واحدٌ من …»: كم زميلٍ في قسمك أرسلوا رغباتهم. عددٌ فقط، ولا يظهر إلا حين يكثر العدد (لا يُستدلّ منه على أحد). ── */
  app.get("/api/public/me/wishes-count", requireDoor, async (_req: Request, res: Response) => {
    const { profile } = doorOf(res);
    noStore(res);
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term || profile.AdSectionId <= 0) { res.json({ ready: false }); return; }
    const mine = Boolean(profile.wishes && profile.wishes.termId === Number(term.AdTermId));
    const termId = Number(term.AdTermId), sectionId = profile.AdSectionId;
    const stat = await wishCountMemo.get(`${termId}:${sectionId}`, async () => {
      /* القسمُ وحده لا الكليةُ كلُّها: كان كلُّ قسمٍ يقرأ ملفاتِ كليته جميعاً ثم يرشّح، فتُدفع قراءةُ
         الكلية مرةً لكل قسمٍ في كل نافذة (القراءاتُ هي ما يُحسب على المشروع). */
      const list = (await Repository.getStudentProfilesBySection(sectionId)).filter(row => Number(row.AdCollegeId) === Number(profile.AdCollegeId));
      const wishers = list.filter(row => row.wishes && row.wishes.termId === termId);
      return { of: list.length, n: wishers.length, byCourse: peerCourseCounts(wishers.map(row => row.wishes!)) };
    });
    const n = Math.max(1, stat.n), show = stat.of >= 10;
    /* العددان وعددُ كل مقررٍ يظهران في القسم الكبير وحده، وبعد حدٍّ أدنى؛ وفي القسم الصغير لا يُرسل شيءٌ منها أصلاً
       (حجمُ القسم نفسُه يدلّ على من أرسل رغباته). */
    res.json(show ? { ready: true, mine, n, of: Math.max(stat.of, n), show, byCourse: stat.byCourse } : { ready: true, mine, show, byCourse: {} });
  });

  /* ── حالاتي: متابعة آمنة لطلبات الاستبيان القديم من ملف مساري ─────────── */
  homeGet("cases", async (_req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    noStore(res);
    const [needs, courses, terms] = await Promise.all([
      Repository.getStudentNeedHistoryByFingerprint(fingerprint), Repository.getCourses(), Repository.getTerms(),
    ]);
    const courseById = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const termById = new Map((terms as any[]).map(term => [Number(term.AdTermId), String(term.AdTermName || "الفصل") ] as const));
    const statusText: Record<string, string> = {
      pending: "وصل طلبك · قيد مراجعة القسم", approved: "وافقت اللجنة · بانتظار الإجراء التالي",
      "committee-rejected": "تعذّر قبول الطلب من اللجنة", registered: "اكتملت مراجعة طلبك",
      rejected: "تعذّر قبول الطلب في المراجعة التالية",
    };
    const rows = needs
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, 100)
      .map(need => {
        const status = isCaseLevelNeed(need)
          ? studentCaseStatus(need.caseState)
          : (need.courseStates || []).some(item => item.state === "committee-rejected") ? "committee-rejected"
            : (need.courseStates || []).some(item => item.state === "rejected") ? "rejected"
              : (need.courseStates || []).some(item => item.state === "awaiting-registration") ? "approved"
                : (need.courseStates || []).length && (need.courseStates || []).every(item => item.state === "registered") ? "registered" : "pending";
        const courseIds = [...new Set([...(need.courseIds || []), ...(need.courseStates || []).map(state => Number(state.courseId))])];
        const coursesForNeed = courseIds.map(id => {
          const course = courseById.get(Number(id));
          const state = (need.courseStates || []).find(item => Number(item.courseId) === Number(id));
          const courseStatus: Record<string, string> = {
            pending: "قيد مراجعة القسم", "awaiting-registration": "وافقت اللجنة · بانتظار الإجراء التالي",
            "committee-rejected": "تعذّر قبوله من اللجنة", registered: "اكتملت مراجعته",
            rejected: "تعذّر قبوله في المراجعة التالية",
          };
          return { code: String(course?.CourseCode || ""), name: String(course?.CourseName || "مقرر"),
            dropped: Boolean(state?.droppedByStudent), state: String(state?.state || "pending"),
            status: state?.droppedByStudent ? "أزلته من طلبك بعد القرار" : courseStatus[state?.state || "pending"] };
        });
        return {
          caseRef: caseRefFor(need), term: termById.get(Number(need.AdTermId)) || "فصل سابق",
          requestType: String(need.requestType || "new-course"), isCaseLevel: isCaseLevelNeed(need),
          title: need.requestType === "graduate" ? "مراجعة حالة التخرج والميداني" : need.requestType === "course-conflict" ? "مراجعة تعارض مقررات" : "مراجعة مقررات",
          status: statusText[status] || "وصل طلبك", statusCode: status,
          /* لا نعيد ملاحظات اللجنة الداخلية إلى بوابة الطالب؛ تُعرض فقط حالة
             القرار العامة. تفاصيل الطالب التي كتبها تبقى في سجل القسم. */
          courses: coursesForNeed, sentAt: String(need.createdAt || ""), updatedAt: String(need.updatedAt || need.createdAt || ""),
        };
      });
    res.json({ cases: rows });
  });

  /* ── طلب استثنائي من مساري: فتح مقرر أو تعارض، من الملف الموثّق نفسه ── */
  /* ── طلبُ الخريج / المتوقَّع تخرّجه: يعرف من وحداته المجتازة، ثم يرفع صحيفته للتدقيق كما كان في الاستبيان ── */
  const proofLimiter = createAttemptLimiter({ maxFailures: intFromEnv("STUDENT_DOOR_PROOF_MAX", 12), windowMs: 10 * 60_000, capacity: 20_000 });
  const identityOfProfile = async (profile: StudentProfile): Promise<{ name: string; civil: string } | null> => {
    if (!deps.openIdentity || !profile.nameCipher || !profile.civilCipher) return null;
    try {
      const [name, civil] = await Promise.all([deps.openIdentity(profile.nameCipher), deps.openIdentity(profile.civilCipher)]);
      return name && civil ? { name, civil } : null;
    } catch { return null; }
  };

  homeGet("graduate", async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0 || !deps.graduate) { res.json({ ready: false, reason: "no-setup" }); return; }
    const term = pickDoorTerm((await Repository.getTerms()) as any[]);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const phase = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId), termName = String(term.AdTermName || "");
    const rule = await deps.graduate.rule(profile.AdSectionId, profile.curriculumPlanId, termName);
    const need = (await Repository.getStudentNeedsByFingerprint(fingerprint, profile.AdCollegeId, termId)).find(row => row.requestType === "graduate");
    const passed = Number(profile.passedUnits) || 0;
    const threshold = rule.threshold ?? rule.minThreshold ?? 0;
    res.json({
      ready: true, canRequest: phase.mode !== "closed", line: phase.line, termName, summer: rule.summer,
      ruleSaved: rule.saved, threshold, thresholdExact: rule.threshold !== undefined, degreeUnits: rule.degreeUnits || 0,
      passedUnits: passed, enough: Boolean(rule.saved && threshold > 0 && passed >= threshold), short: rule.saved ? Math.max(0, threshold - passed) : 0,
      reasons: GRADUATE_REASONS.map(code => ({ code })),
      existing: need ? { caseRef: caseRefFor(need), eligibility: need.eligibility || "not-checked", reason: need.graduateReason || "" } : null,
    });
  });

  app.post("/api/public/me/graduate/proof", writeLimit, requireDoor, express.raw({ type: "application/octet-stream", limit: PROOF_MAX_BYTES }), async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (!deps.graduate) { fail(res, 404, "غير متاح.", "off"); return; }
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك الأكاديمي أولاً.", "no-setup"); return; }
    const identity = await identityOfProfile(profile);
    if (!identity) { fail(res, 409, "حدّث بيانات هويتك في ملف مساري قبل رفع الصحيفة.", "identity-needed"); return; }
    const attempt = proofLimiter.reserve(fingerprint);
    if (!attempt) { fail(res, 429, "محاولاتٌ كثيرة لرفع الصحيفة. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    const term = pickDoorTerm((await Repository.getTerms()) as any[]);
    if (!term || readStudentPhase(term.AdTermStudentPhases).mode === "closed") { fail(res, 409, "الطلبات مغلقة الآن.", "requests-closed"); return; }
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!bytes.length) { fail(res, 400, "ارفع صحيفة التخرج PDF أو صورة واضحة.", "no-file"); return; }
    const result = await deps.graduate.proof({
      collegeId: Number(profile.AdCollegeId), termId: Number(term.AdTermId), civil: identity.civil, name: identity.name,
      sectionId: profile.AdSectionId, bytes, mime: String(req.get("x-file-type") || "application/pdf").slice(0, 80),
    });
    if (result.status === 200) attempt.release();
    res.status(result.status).json(result.body);
  });

  /** إرسالُ طلب الخريج من «مساري»: الإثباتُ حيّ، والعتبةُ من القاعدة الحالية، والملاحظةُ والنوعُ مطلوبان — كالاستبيان تماماً. */
  async function submitGraduate(req: Request, res: Response, ctx: { fingerprint: string; profile: StudentProfile; termId: number; closed: boolean; line: string; termName: string }) {
    const { fingerprint, profile, termId } = ctx;
    if (!deps.graduate) { fail(res, 404, "غير متاح.", "off"); return; }
    if (ctx.closed) { fail(res, 409, "الطلبات مغلقة الآن.", "requests-closed", { line: ctx.line }); return; }
    const reason = GRADUATE_REASONS.find(code => code === req.body?.graduateReason);
    if (!reason) { fail(res, 400, "اختر نوع طلب الميداني.", "bad-reason"); return; }
    const details = String(req.body?.details || "").normalize("NFKC").replace(/[<>]/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 600);
    if (details.length < 3) { fail(res, 400, "اكتب ملاحظات الطلب وسبب احتياجك قبل الإرسال.", "details-needed"); return; }
    const identity = await identityOfProfile(profile);
    if (!identity) { fail(res, 409, "حدّث بيانات هويتك في ملف مساري قبل إرسال طلب للقسم.", "identity-needed"); return; }
    const checked = await deps.graduate.submit({ civil: identity.civil, sectionId: profile.AdSectionId, termId, proofToken: String(req.body?.proofToken || "") });
    if (checked.error) { fail(res, checked.error.status, checked.error.body.error, checked.error.body.code); return; }
    const saved = await Repository.saveStudentNeed({
      fingerprint, AdCollegeId: Number(profile.AdCollegeId), AdSectionId: Number(profile.AdSectionId), studentSectionId: Number(profile.AdSectionId),
      surveySectionId: Number(profile.AdSectionId), AdTermId: termId, courseIds: [], requestType: "graduate",
      curriculumPlanId: checked.provenPlanId || profile.curriculumPlanId, nameCipher: profile.nameCipher!, civilCipher: profile.civilCipher!, details,
      graduateReason: reason, passedUnits: checked.passedUnits, requiredUnits: checked.requiredUnits, degreeUnits: checked.degreeUnits,
      eligibility: checked.eligibility, proofNameMatched: checked.nameMatched,
    }, { byKind: true });
    const sections = await Repository.getSections();
    noStore(res);
    res.status(201).json({ ok: true, requestType: "graduate", termId, caseRef: caseRefFor(saved), cases: [{
      sectionName: String((sections as any[]).find(section => Number(section.AdSectionId) === Number(profile.AdSectionId))?.AdSectionName || "القسم المختص"), caseRef: caseRefFor(saved), courseIds: [],
    }] });
  }

  homeGet("request-context", async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const [terms, courses, catalog] = await Promise.all([Repository.getTerms(), Repository.getCourses(), sectionCatalog(profile.AdSectionId)]);
    const term = pickDoorTerm(terms as any[]);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const phase = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId);
    const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
    const eligible = studentNeedsCommitteeHelp(profile, run, ticket, termId);
    if (!eligible || !(phase.canEditWishes || phase.canReport)) {
      res.json({ ready: true, canRequest: false, line: phase.line, termId, termName: String(term.AdTermName || ""), courses: [], conflictOwnCourses: [], conflictCourses: [], conflictPairs: [] });
      return;
    }
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remaining = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    const openable = new Set(eligible ? ticket!.unmet.filter(item => item.reason === "not-offered" || item.reason === "full").map(item => Number(item.courseId)) : []);
    const conflictBlocked = new Set(eligible ? ticket!.unmet.filter(item => item.reason === "conflict").map(item => Number(item.courseId)) : []);
    const all = (courses as AdCourse[]).filter(course => Number(course.AdCollegeId) === Number(profile.AdCollegeId)
      && Number.isInteger(Number(course.AdCourseId)) && Number(course.AdCourseId) > 0)
      .map(course => ({ id: Number(course.AdCourseId), code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
        own: Number(course.AdSectionId) === Number(profile.AdSectionId), remaining: remaining.has(Number(course.AdCourseId)) }))
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }) || a.name.localeCompare(b.name, "ar"));
    const courseById = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    let pairs: ReturnType<typeof verifiedUnresolvableStudentConflicts> = [], conflictCourses: Array<(typeof all)[number] & { sectionName: string }> = [];
    if (conflictBlocked.size && all.some(course => !course.own)) {
      const [schedules, sections, published] = await Promise.all([
        Repository.getSchedulesByScope({ termId }), Repository.getSections(), ticketContext(termId),
      ]);
      const table = buildSimulationOfferings(termId, schedules, courseById);
      const confirmed = auditSimOfferings(table.offerings).confirmed;
      pairs = verifiedUnresolvableStudentConflicts([...conflictBlocked], all.filter(course => !course.own).map(course => course.id), confirmed, published.signed,
        { collegeId: Number(profile.AdCollegeId), sectionId: Number(profile.AdSectionId) });
      const eligibleOtherIds = new Set(pairs.map(pair => pair.otherCourseId));
      const conflictCourseInfo = new Map(all.filter(course => eligibleOtherIds.has(course.id)).map(course => {
        const row = courseById.get(course.id);
        return [course.id, { ...course, sectionName: String((sections as any[]).find(section => Number(section.AdSectionId) === Number(row?.AdSectionId))?.AdSectionName || "قسم آخر") }];
      }));
      conflictCourses = [...conflictCourseInfo.values()];
    }
    res.json({ ready: true, canRequest: eligible && (phase.canEditWishes || phase.canReport), line: phase.line,
      termId, termName: String(term.AdTermName || ""),
      courses: eligible ? all.filter(course => course.own && course.remaining && openable.has(course.id)) : [],
      conflictOwnCourses: eligible ? all.filter(course => course.own && course.remaining && conflictBlocked.has(course.id)) : [],
      conflictCourses,
      conflictPairs: pairs });
  });

  app.post("/api/public/me/request", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك الأكاديمي أولاً.", "no-setup"); return; }
    if (!profile.nameCipher || !profile.civilCipher) { fail(res, 409, "حدّث بيانات هويتك في ملف مساري قبل إرسال طلب للقسم.", "identity-needed"); return; }
    if (req.body?.consent !== true) { fail(res, 400, "وافق على إرسال بيانات هويتك للقسم لمراجعة الطلب.", "consent-needed"); return; }
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any[]);
    if (!term) { fail(res, 409, "لا يوجد فصل دراسي مفتوح للطلبات الآن.", "no-term"); return; }
    const phase = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId);
    /* الخريجُ لا ينتظر نافذة الرغبات: طلبُه مفتوحٌ ما دامت الطلبات لم تُغلق (كما كان في الاستبيان). */
    if (req.body?.requestType === "graduate") { await submitGraduate(req, res, { fingerprint, profile, termId, closed: phase.mode === "closed", line: phase.line, termName: String(term.AdTermName || "") }); return; }
    if (!phase.canEditWishes && !phase.canReport) { fail(res, 409, "نافذة الطلبات غير مفتوحة الآن.", "requests-closed", { line: phase.line }); return; }
    const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
    if (!studentNeedsCommitteeHelp(profile, run, ticket, termId)) {
      fail(res, 409, "جدولك المقترح الأخير لا يُظهر مقرراً متعذّراً يحتاج طلباً للقسم. حدّث رغباتك وانتظر التحديث القادم.", "no-proven-blocker"); return;
    }
    const openable = new Set(ticket!.unmet.filter(item => item.reason === "not-offered" || item.reason === "full").map(item => Number(item.courseId)));

    const requestType = req.body?.requestType === "course-conflict" ? "course-conflict" : req.body?.requestType === "new-course" ? "new-course" : "";
    if (!requestType) { fail(res, 400, "اختر فتح مقرر أو مراجعة تعارض مقررين.", "bad-request-type"); return; }
    const [courses, catalog] = await Promise.all([Repository.getCourses(), sectionCatalog(profile.AdSectionId)]);
    const byId = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remaining = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    const ids: number[] = [...new Set<number>((Array.isArray(req.body?.courseIds) ? req.body.courseIds : []).map(Number)
      .filter(id => Number.isInteger(id) && id > 0))];
    if (requestType === "new-course" && (ids.length < 1 || ids.length > 12 || ids.some(id => !remaining.has(id) || !openable.has(id) || Number(byId.get(id)?.AdSectionId) !== Number(profile.AdSectionId)))) {
      fail(res, 400, "اختر من مقرراتك المتبقية التي تعذّرت في جدولك المقترح (حتى 12 مقرراً).", "course-outside-plan"); return;
    }
    if (requestType === "course-conflict") {
      if (ids.length !== 2 || ids[0] === ids[1]) { fail(res, 400, "اختر مقررين مختلفين للتعارض.", "bad-conflict-pair"); return; }
      const rows = ids.map(id => byId.get(id));
      const ownId = ids.find(id => Number(byId.get(id)?.AdSectionId) === Number(profile.AdSectionId));
      const otherId = ids.find(id => id !== ownId);
      const schedules = await Repository.getSchedulesByScope({ termId });
      const table = buildSimulationOfferings(termId, schedules, byId);
      const confirmed = auditSimOfferings(table.offerings).confirmed;
      const published = await ticketContext(termId);
      const pairs = verifiedUnresolvableStudentConflicts(ownId ? [ownId] : [], otherId ? [otherId] : [], confirmed, published.signed,
        { collegeId: Number(profile.AdCollegeId), sectionId: Number(profile.AdSectionId) });
      if (!ownId || !otherId || rows.some(course => !course || Number(course.AdCollegeId) !== Number(profile.AdCollegeId))
        || !remaining.has(ownId) || !ticket!.unmet.some(item => Number(item.courseId) === ownId && item.reason === "conflict")
        || !pairs.some(pair => pair.ownCourseId === ownId && pair.otherCourseId === otherId)) {
        fail(res, 409, "لم يثبت تعذّر حل هذا التعارض من الجداول المنشورة المكتملة. جرّب الشعب البديلة في جدولك المقترح.", "conflict-not-proven"); return;
      }
    }
    const details = String(req.body?.details || "").normalize("NFKC").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (details.length < 3) { fail(res, 400, "اكتب سبباً مختصراً يساعد القسم على مراجعة الطلب.", "details-needed"); return; }
    const existing = (await Repository.getStudentNeedsByFingerprint(fingerprint, profile.AdCollegeId, termId))
      .find(need => need.requestType === "graduate" && Number(need.surveySectionId || need.AdSectionId) === Number(profile.AdSectionId));
    if (existing?.requestType === "graduate" && existing.eligibility === "eligible") {
      fail(res, 409, "لديك حالة تخرج موثّقة لهذا الفصل. تابعها من «حالاتي» أو حدّثها من مسارها الحالي.", "verified-graduate-case"); return;
    }
    const requestGroupId = randomUUID();
    const grouped = new Map<number, number[]>();
    for (const id of ids) {
      const owner = Number(byId.get(id)?.AdSectionId);
      if (!owner) continue;
      grouped.set(owner, [...(grouped.get(owner) || []), id]);
    }
    const sections = await Repository.getSections();
    const byOwner: Array<{ sectionId: number; caseRef: string; courseIds: number[] }> = [];
    for (const [ownerSectionId, ownerCourseIds] of grouped) {
      const ownerCollegeId = Number(byId.get(ownerCourseIds[0])?.AdCollegeId);
      const paired = ids.filter(id => !ownerCourseIds.includes(id)).map(id => {
        const course = byId.get(id);
        return `${String(course?.CourseCode || "")} ${String(course?.CourseName || "")}`.trim();
      }).filter(Boolean);
      const ownerDetails = requestType === "course-conflict" && paired.length
        ? `${details} · تعارض مع: ${paired.join("، ")}` : details;
      const entry: Omit<StudentNeed, "id" | "createdAt"> = {
        fingerprint, AdCollegeId: ownerCollegeId,
        AdSectionId: ownerCollegeId === Number(profile.AdCollegeId) ? Number(profile.AdSectionId) : ownerSectionId,
        studentSectionId: Number(profile.AdSectionId), surveySectionId: ownerSectionId, AdTermId: termId,
        curriculumPlanId: profile.curriculumPlanId, courseIds: ownerCourseIds, requestType,
        requestGroupId, nameCipher: profile.nameCipher, civilCipher: profile.civilCipher,
        details: ownerDetails, eligibility: "not-checked",
      };
      const saved = await Repository.saveStudentNeed(entry, { byKind: true });
      byOwner.push({ sectionId: ownerSectionId, caseRef: caseRefFor(saved), courseIds: ownerCourseIds });
    }
    const primary = byOwner.find(row => row.sectionId === Number(profile.AdSectionId)) || byOwner[0];
    noStore(res); res.status(201).json({ ok: true, caseRef: primary?.caseRef || "", cases: byOwner.map(row => ({
      sectionName: String((sections as any[]).find(section => Number(section.AdSectionId) === row.sectionId)?.AdSectionName || "القسم المختص"),
      caseRef: row.caseRef, courseIds: row.courseIds,
    })), requestGroupId, requestType, termId, courseIds: ids });
  });

  /* ── المطروح لي: متبقّي صحيفتي أيُّه يُطرح هذا الفصل؟ (أعدادٌ لا مواعيد) ─── */
  homeGet("offered", async (_req: Request, res: Response) => {
    const { profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const [catalog, index, states] = await Promise.all([sectionCatalog(profile.AdSectionId), offeringIndex(Number(term.AdTermId)), offeringStatesForTerm(Number(term.AdTermId))]);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const progress = planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit);
    /* قواعدُ الصحيفة المعتمدة (إن وُجدت): ما ينقص الطالبَ من مسبقاتٍ قبل أن يستطيع أخذ المقرر. */
    const needsOf = await prereqNeeds(profile, catalog);
    const courses = progress.remainingIds.map(id => {
      const info = catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
      const badge = offeringBadge(states, id);
      return { id, ...info, sections: index.get(id)?.sections || 0, needs: needsOf(id), ...(badge ? { offering: badge } : {}) };
    }).sort((a, b) => b.sections - a.sections || a.code.localeCompare(b.code, "en"));
    const offered = courses.filter(course => course.sections > 0);
    res.json({
      ready: true, termName: String(term.AdTermName || ""), remainingCount: courses.length, offeredCount: offered.length,
      offeredUnits: offered.reduce((sum, course) => sum + course.credit, 0), courses,
    });
  });

  /* ── ما الجديد؟ ── إشعاراتُ الطالب مشتقّةٌ من حاله لحظةَ السؤال (utils/studentNotices). */
  homeGet("notices", async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ notices: [] }); return; }
    const termId = Number(term.AdTermId);
    const reading = readStudentPhase(term.AdTermStudentPhases);
    const [run, ticket, needs, catalog] = await Promise.all([
      Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint),
      Repository.getStudentNeedsByFingerprint(fingerprint, 0, termId), profile.AdSectionId > 0 ? sectionCatalog(profile.AdSectionId) : Promise.resolve(null),
    ]);
    const courseNames = new Map((await Repository.getCourses() as any[]).map(course => [Number(course.AdCourseId), String(course.CourseName || "")] as const));
    const nameOf = (id: number) => courseNames.get(id) || catalog?.courses.get(id)?.name || `مقرر ${id}`;
    const live = run && ticket && ticket.runId === run.runId ? ticket : null;
    const round = live ? term.AdTermStudentPhases?.rounds?.[live.window - 1] : undefined;
    /* شعبٌ فتحها القسمُ حديثاً لما أراده الطالبُ أو لم يجد له مقعداً — يُقرأ من أصل صفّ الجدول (origin) لا من مخزنٍ جديد. */
    const wanted = new Set<number>([
      ...(profile.wishes && profile.wishes.termId === termId ? profile.wishes.courseIds : []),
      ...(profile.registration && profile.registration.termId === termId ? profile.registration.answers.filter(a => a.state === "stuck").map(a => a.courseId) : []),
      ...(live ? live.unmet.filter(entry => entry.reason === "full" || entry.reason === "not-offered").map(entry => entry.courseId) : []),
    ]);
    const openedAll = await openedMemo.get(String(termId), async () => {
      const out = new Map<number, string>();
      const since = Date.now() - OPENED_WINDOW_DAYS * 86_400_000;
      for (const row of await Repository.getSchedulesByScope({ termId })) {
        const origin = (row as any).origin as { kind?: string; refId?: string; at?: string } | undefined;
        if (!origin || (origin.kind !== "radar" && origin.kind !== "intelligence") || !String(origin.refId || "").startsWith("course:")) continue;
        if (!(Date.parse(String(origin.at || "")) >= since)) continue;
        out.set(Number(row.AdCourseId), String(row.SCode || ""));
      }
      return out;
    });
    const wished = new Set<number>(profile.wishes && profile.wishes.termId === termId ? profile.wishes.courseIds : []);
    const opened = [...wanted].filter(id => openedAll.has(id)).slice(0, 4).map(id => ({ courseId: id, name: nameOf(id), section: openedAll.get(id) || "", wished: wished.has(id) }));
    /* العددُ نفسُه الذي تعرضه بطاقةُ «هل سجلت؟»: خطّةُ (أ) إن وُجدت، وإلا ما طُرح من متبقّي صحيفته. */
    const reportCourses = profile.AdSectionId > 0 ? ((await reportContext(profile, fingerprint))?.ids.length || 0) : 0;
    const cases = needs.flatMap(need => need.courseIds.map(courseId => {
      const state = (need.courseStates || []).find(row => Number(row.courseId) === courseId);
      return { courseId, name: nameOf(courseId), state: (state?.state || "pending") as any, reasonCode: state?.reasonCode, note: state?.note, dropped: state?.droppedByStudent, opened: Boolean(state?.scheduleId) };
    }));
    res.json({
      notices: buildStudentNotices({
        setupDone: profile.AdSectionId > 0,
        phase: { mode: reading.mode, canEditWishes: reading.canEditWishes, canReport: reading.canReport, line: reading.forStudent.line, nextAt: reading.nextAt ? (reading.nextAt === kuwaitDateISO() ? "اليوم" : deadlineDateShort(reading.nextAt)) : "", nextLabel: reading.nextLabel },
        hasWishes: Boolean(profile.wishes && profile.wishes.termId === termId),
        ticket: live ? { stale: Date.parse(profile.updatedAt) > Date.parse(run!.ranAt), window: live.window, of: run!.rounds, windowName: round?.name, start: round?.start ? deadlineDateShort(round.start) : "", end: round?.end ? deadlineDateShort(round.end) : "" } : null,
        reportAnswered: Boolean(profile.registration && profile.registration.termId === termId),
        reportCourses, cases, opened,
      }),
    });
  });

  /* ── هل سجلت؟ ── بعد جولة التسجيل: ما سجّلتَه وما تعثّرتَ فيه ولماذا.
     من تعثّر وطلب المساعدة كتب اسمَه ورقمَه المدني (يُختمان) فتصل حالتُه قسمَ المقرر؛
     ولا يُحفظ الاسمُ في ملفّه الدائم أبداً. ما يقوله لنا يُضاف إلى عدّادات الرادار
     (أعداد لا أسماء) فيعرف صاحبُ القرار أين صدقت الرادارُ وأين لم تصدق. */
  const REASONS = new Set(["full", "prereq", "conflict", "other"]);
  const REASON_TEXT: Record<string, string> = { full: "امتلأت الشعب", prereq: "المسبق لا يسمح", conflict: "تعارض مع مقرر آخر", other: "سبب آخر" };

  async function reportContext(profile: StudentProfile, fingerprint: string) {
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) return null;
    const reading = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId);
    const catalog = await sectionCatalog(profile.AdSectionId);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const [run, ticket, index] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint), offeringIndex(termId)]);
    const info = (id: number) => catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
    const planned = run && ticket && ticket.runId === run.runId ? (ticket.plans.find(plan => plan.label === "A")?.items.map(item => item.courseId) || []) : [];
    const remaining = planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds.filter(id => (index.get(id)?.sections || 0) > 0);
    const ids = [...new Set([...planned, ...(planned.length ? [] : remaining.slice(0, 12))])];
    /* ما يُعرض له هو ما يُقبل منه: لا مقررَ مخفيّاً يُرسَل مباشرةً فيُفسد العدّادات أو يُنشئ حالةً لقسمٍ لم تكن في خطّته. */
    return { term, termId, reading, ids, info, allowed: new Set(ids) };
  }

  homeGet("report", async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const ctx = await reportContext(profile, fingerprint);
    if (!ctx) { res.json({ ready: false, reason: "no-term" }); return; }
    const mine = profile.registration && profile.registration.termId === ctx.termId ? profile.registration : null;
    res.json({
      ready: true, canReport: ctx.reading.canReport, line: ctx.reading.line,
      courses: ctx.ids.map(id => ({ courseId: id, ...ctx.info(id) })),
      answers: mine?.answers || [], answeredAt: mine?.at || "",
    });
  });

  app.post("/api/public/me/report", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك أولاً.", "no-setup"); return; }
    const ctx = await reportContext(profile, fingerprint);
    if (!ctx || !ctx.reading.canReport) { fail(res, 409, "سؤال «هل سجلت؟» غير مفتوح الآن.", "report-closed", { line: ctx?.reading.line || "" }); return; }
    const raw = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, 40) : [];
    const answers: NonNullable<StudentProfile["registration"]>["answers"] = [];
    const seen = new Set<number>();
    for (const item of raw) {
      const courseId = Number(item?.courseId);
      if (!Number.isInteger(courseId) || seen.has(courseId) || !ctx.allowed.has(courseId)) continue;
      seen.add(courseId);
      if (item?.state === "registered") answers.push({ courseId, state: "registered" });
      else if (item?.state === "stuck") answers.push({ courseId, state: "stuck", reason: REASONS.has(String(item?.reason)) ? item.reason : "other" });
    }
    if (!answers.length) { fail(res, 400, "اختر حالة مقرّرٍ واحدٍ على الأقل.", "empty"); return; }
    const stuck = answers.filter(answer => answer.state === "stuck");
    const help = req.body?.help;
    /* الاسمُ والرقمُ مختومان في ملفّه منذ إنشائه: لا يُسألان ثانيةً. أما ملفٌّ أُنشئ قبل ذلك فيُسأل مرةً ويُحفظ مختوماً. */
    let sealed: { nameCipher: string; civilCipher: string } | null = profile.nameCipher && profile.civilCipher ? { nameCipher: profile.nameCipher, civilCipher: profile.civilCipher } : null;
    let remember: { nameCipher: string; civilCipher: string } | null = null;
    if (stuck.length && help && !sealed) {
      const civil = toEnglishDigits(help?.civil).replace(/\D/g, "");
      const name = cleanName(help?.name);
      if (!name) { fail(res, 400, "اكتب اسمك الثلاثي كما في الجامعة.", "bad-name"); return; }
      if (civil.length !== 12 || !validateCivilId(civil).isValid) { fail(res, 400, "الرقم المدني غير صحيح.", "bad-civil"); return; }
      if ((await deps.surveyFingerprint(civil)) !== fingerprint) { fail(res, 403, "هذا الرقم المدني ليس رقمَ هذا الملف.", "civil-mismatch"); return; }
      sealed = remember = { nameCipher: await deps.sealIdentity(name), civilCipher: await deps.sealIdentity(civil) };
    }

    const saved = await Repository.recordRegistrationAnswers(fingerprint, ctx.termId, current => {
      if (!current) return undefined;
      return { ...current, ...(remember || {}), registration: { termId: ctx.termId, at: new Date().toISOString(), answers } };
    });
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }

    /* حالةٌ لكل قسمٍ يملك مقرراً تعثّر فيه: يصله الطلبُ على كشف التسجيل كأيّ طلب. */
    const cases: Array<{ sectionName: string; caseRef: string }> = [];
    if (sealed && help) {
      const [courses, sections] = await Promise.all([Repository.getCourses(), Repository.getSections()]);
      const courseOf = new Map((courses as any[]).map(course => [Number(course.AdCourseId), course] as const));
      const byOwner = new Map<number, typeof stuck>();
      for (const answer of stuck) {
        const owner = Number(courseOf.get(answer.courseId)?.AdSectionId) || 0;
        if (owner) byOwner.set(owner, [...(byOwner.get(owner) || []), answer]);
      }
      const { nameCipher, civilCipher } = sealed;
      const earlier = await Repository.getStudentNeedsByFingerprint(fingerprint, 0, ctx.termId);
      for (const [ownerSectionId, list] of byOwner) {
        const ownerCollegeId = Number(courseOf.get(list[0].courseId)?.AdCollegeId) || profile.AdCollegeId;
        const homeInOwnerCollege = profile.AdCollegeId === ownerCollegeId;
        const afterText = `من «مساري» بعد التسجيل — ${list.map(answer => `${ctx.info(answer.courseId).name}: ${REASON_TEXT[answer.reason || "other"]}`).join("؛ ")}`;
        /* طالبٌ له طلبُ فتح مقرّرٍ قائمٌ عند هذا القسم: ما تعثّر فيه بعد التسجيل يُضمّ إليه
           (بطاقةٌ واحدة يقرؤها القسم، وقراراتُه السابقة باقية)، لا حالةٌ ثانية للطالب نفسه. */
        const open = earlier.find(need => studentNeedKind(need) === "course"
          && Number(need.surveySectionId || need.AdSectionId) === Number(ownerSectionId) && need.requestType !== "graduate");
        if (open) {
          const priorText = String(open.details || "").replace(/ · بعد التسجيل: [\s\S]*$/, "");
          const need = await Repository.saveStudentNeed({
            ...open, id: undefined, createdAt: undefined,
            courseIds: [...new Set([...(open.courseIds || []).map(Number), ...list.map(answer => answer.courseId)])],
            details: `${priorText} · بعد التسجيل: ${afterText.replace(/^من «مساري» بعد التسجيل — /, "")}`.slice(0, 900),
            nameCipher, civilCipher,
          } as any, { byKind: true });
          cases.push({ sectionName: String((sections as any[]).find(row => Number(row.AdSectionId) === ownerSectionId)?.AdSectionName || ""), caseRef: caseRefFor(need) });
          continue;
        }
        const need = await Repository.saveStudentNeed({
          fingerprint, AdCollegeId: ownerCollegeId, AdSectionId: homeInOwnerCollege ? profile.AdSectionId : ownerSectionId,
          studentSectionId: profile.AdSectionId, surveySectionId: ownerSectionId, AdTermId: ctx.termId,
          curriculumPlanId: profile.curriculumPlanId, courseIds: list.map(answer => answer.courseId), requestType: "new-course",
          nameCipher, civilCipher, eligibility: "not-checked",
          details: afterText,
        } as any, { byKind: true });
        cases.push({ sectionName: String((sections as any[]).find(row => Number(row.AdSectionId) === ownerSectionId)?.AdSectionName || ""), caseRef: caseRefFor(need) });
      }
    }
    noStore(res); res.json({ ok: true, registered: answers.length - stuck.length, stuck: stuck.length, cases });
  });

  /* ── تذكرتي: خططي (أ/ب/ج) ونافذتي من رادار التسجيل ──────────────────────────
     تقديرٌ لا حجز. والشعبةُ وموعدُها لا يظهران إلا إن وُقّع جدولُ قسمها؛ قبل ذلك
     يرى الطالبُ المقرراتِ ووحداتها، لا الأوقات (المسوّداتُ للأقسام والعمادة). */
  homeGet("ticket", async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const termId = Number(term.AdTermId);
    const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
    if (!run || !ticket || ticket.runId !== run.runId) { res.json({ ready: false, reason: profile.AdSectionId > 0 ? "no-run" : "no-setup" }); return; }
    const [catalog, context, states] = await Promise.all([sectionCatalog(profile.AdSectionId), ticketContext(termId), offeringStatesForTerm(termId)]);
    const info = (id: number) => catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
    const alternativesFor = (courseId: number, currentId: string) => {
      const seen = new Set<string>();
      return ticket.plans.flatMap(plan => plan.items.filter(item => Number(item.courseId) === Number(courseId)).map(item => {
        const id = String(item.offeringId || ""), offering = context.offerings.get(id);
        if (!id || id === currentId || seen.has(id) || !offering?.slots.length || offeringBlocked(states, Number(courseId))
          || !context.signed.has(`${offering.collegeId}:${offering.sectionId}`)) return null;
        seen.add(id);
        return { offeringId: id, section: offering.code, slots: offering.slots, tight: item.tight };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item)));
    };
    /* مخزنُ التبديل: كلُّ مقررٍ متبقٍّ له شعبٌ بمواعيد معتمدة — ليجرّب الطالبُ استبدال مقررٍ بآخر على أسبوعه.
       معاينةٌ شخصية: لا يُكتب منها شيء. ما ينقصه مسبقُه يُعرض مقفلاً بسببه. */
    const needsOf = await prereqNeeds(profile, catalog);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remainingIds = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    const byCourse = new Map<number, Array<{ offeringId: string; section: string; slots: Array<{ day: number; start: number; end: number }> }>>();
    for (const [key, offering] of context.offerings) {
      const parts = key.split("|");
      if (parts.length !== 5) continue;
      const courseId = Number(parts[3]);
      /* C5: مخزنُ التبديل لا يعرض مقرراً 🔒/🌱. */
      if (!remainingIds.has(courseId) || offeringBlocked(states, courseId) || !offering.slots.length || !context.signed.has(`${offering.collegeId}:${offering.sectionId}`)) continue;
      const list = byCourse.get(courseId) || [];
      if (list.length < 8) list.push({ offeringId: key, section: offering.code, slots: offering.slots });
      byCourse.set(courseId, list);
    }
    const pool = [...byCourse.entries()].slice(0, 40).map(([courseId, offerings]) => ({ courseId, ...info(courseId), needs: needsOf(courseId), offerings }))
      .sort((a, b) => a.needs.length - b.needs.length || a.code.localeCompare(b.code, "en"));
    const round = term.AdTermStudentPhases?.rounds?.[ticket.window - 1];
    /* دقائقُ التنقّل بين الحرمين من وثيقة السياسة (الأصلُ عند غيابها)، مفاتيحُ أزواجٍ ودقائقُ فقط: لا مستثنَون ولا أساتذة. */
    const travelPolicy = await readTravelPolicy();
    const travel: Record<string, number> = {};
    for (const [key, rule] of Object.entries(travelPolicy.pairs)) if (rule.minutes > 0) travel[key] = rule.minutes;
    res.json({
      ready: true, travel, termName: String(term.AdTermName || ""), ranAt: run.ranAt, pool,
      stale: Date.parse(profile.updatedAt) > Date.parse(run.ranAt),
      window: { n: ticket.window, of: run.rounds, name: round?.name || "", start: round?.start || "", end: round?.end || "" },
      remainingUnits: ticket.remainingUnits, defaulted: ticket.defaulted, defaultUnits: SIM_UNITS_DEFAULT,
      plans: ticket.plans.map(plan => ({
        label: plan.label, units: plan.units,
        items: plan.items.map(item => {
          const offering = context.offerings.get(item.offeringId);
          const visible = Boolean(offering && context.signed.has(`${offering.collegeId}:${offering.sectionId}`));
          return { courseId: item.courseId, ...info(item.courseId), tight: item.tight, timesVisible: visible,
            section: visible ? offering!.code : "", slots: visible ? offering!.slots : [],
            offeringId: visible ? item.offeringId : "", alternatives: visible ? alternativesFor(item.courseId, item.offeringId) : [] };
        }),
      })),
      unmet: ticket.unmet.map(entry => ({ courseId: entry.courseId, ...info(entry.courseId), reason: entry.reason })),
    });
  });

  /* ── اسمي: يصحّحه الطالبُ إن أخطأ (الرقمُ المدنيُّ هو المفتاح فلا يتغيّر) ── */
  app.put("/api/public/me/name", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    const name = cleanName(req.body?.name);
    if (!name) { fail(res, 400, "اكتب اسمك الثلاثي كما في الجامعة.", "bad-name"); return; }
    const nameCipher = await deps.sealIdentity(name);
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, nameCipher } : undefined));
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    noStore(res); res.json(await summaryOf(saved));
  });

  /* ── M2: «فهمت ✓» على بطاقة «مقترحات فقط» — مفتاحُ الفصل/المسار في الملف (لا في المتصفح). ── */
  app.post("/api/public/me/ack", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    const key = String(req.body?.key || "");
    if (!/^masari-ack:\d{0,9}:\d{0,9}:[A-Za-z0-9_-]{0,80}$/.test(key)) { fail(res, 400, "مفتاح غير صالح", "bad-ack"); return; }
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, masariAck: key } : undefined));
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    noStore(res); res.json({ ok: true, masariAck: key });
  });

  /* ── الرمز: تغييرٌ، ونسيانُ الملف كلِّه ──────────────────────────────────────
     خطأُ «الرمز الحالي» هنا يُعدّ على قفل الملف نفسه كما في الدخول (٥ ← ١٥ دقيقة): كان يُعدّ على
     العنوان وحده، فمن بيده جلسةٌ مسروقة يخمّن الرمزَ بسرعة العنوان. */
  const checkCurrentCode = async (req: Request, res: Response, fingerprint: string, code: string): Promise<boolean> => {
    const attempt = codeLimiter.reserve(ip(req));
    if (!attempt) { fail(res, 429, "محاولاتٌ كثيرة. انتظر دقائق.", "rate"); return false; }
    const now = Date.now();
    const profile = await Repository.getStudentProfile(fingerprint);
    if (!profile) { attempt.release(false); fail(res, 401, "انتهت جلستك.", "signed-out"); return false; }
    const lock = lockState(profile, now);
    if (lock.locked) {
      attempt.release(false);
      fail(res, 423, `أخطأت في الرمز مراتٍ كثيرة. جرّب بعد ${countOf(Math.ceil(lock.retryInMs / 60_000), AR.minute)}.`, "locked", { retryInSeconds: Math.ceil(lock.retryInMs / 1000) });
      return false;
    }
    if (await verifyCode(code, profile.codeHash, profile.codeSalt)) { attempt.release(); return true; }
    const { left } = await countCodeFailure(fingerprint, now);
    fail(res, 401, left === 0 ? "أخطأت في الرمز مراتٍ كثيرة. جرّب بعد 15 دقيقة." : "الرمز الحالي غير صحيح.", left === 0 ? "locked" : "bad-code", { attemptsLeft: left });
    return false;
  };

  app.post("/api/public/me/code", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    const oldCode = toEnglishDigits(req.body?.oldCode).replace(/\D/g, ""), newCode = toEnglishDigits(req.body?.newCode).replace(/\D/g, "");
    if (!(await checkCurrentCode(req, res, fingerprint, oldCode))) return;
    const problem = codeProblem(newCode);
    if (problem) { fail(res, 400, problem, "weak-code"); return; }
    const { hash, salt } = await hashCode(newCode);
    const now = new Date();
    /* تغييرُ الرمز إدخالٌ للرمز الصحيح: يُلغي طلبَ الحذف المعلَّق كما يُلغيه الدخول. */
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? {
      ...current, codeHash: hash, codeSalt: salt, codeFailures: undefined, resetRequestedAt: undefined, updatedAt: now.toISOString(),
      ...profileLifetime(current, now),
    } : undefined));
    if (!saved) { fail(res, 401, "انتهت جلستك.", "signed-out"); return; }
    await issueSession(res, saved, req.body?.remember === true);
    noStore(res); res.json({ ok: true });
  });

  /* «أبقِ ملفّي»: طُلب حذفُ الملف (من صاحبه أو من غيره) وصاحبُه داخلٌ بجلسته — رمزُه يُلغي الطلب. */
  app.post("/api/public/me/keep", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    const code = toEnglishDigits(req.body?.code).replace(/\D/g, "");
    if (!(await checkCurrentCode(req, res, fingerprint, code))) return;
    const now = new Date();
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? {
      ...current, codeFailures: undefined, resetRequestedAt: undefined, ...profileLifetime(current, now),
    } : undefined));
    if (!saved) { fail(res, 401, "انتهت جلستك.", "signed-out"); return; }
    noStore(res); res.json({ ok: true, profile: await summaryOf(saved) });
  });

  app.post("/api/public/me/forget", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    const code = toEnglishDigits(req.body?.code).replace(/\D/g, "");
    if (!(await checkCurrentCode(req, res, fingerprint, code))) return;
    await Repository.updateStudentProfile(fingerprint, () => null);
    res.setHeader("Set-Cookie", clearDoorCookie(secure));
    noStore(res); res.json({ ok: true });
  });

  /* ── الاستعادةُ برمز القسم ─────────────────────────────────────────────────
     موظفُ القسم رأى البطاقةَ المدنية وأصدر رمزاً من ستة أرقام (src/server/studentRecovery.ts).
     الطالبُ يكتبه مع رمزٍ شخصيٍّ جديد: يُستبدل الرمز، فتسقط كلُّ الجلسات القديمة (نسخةُ الرمز
     في الجلسة)، ويُلغى طلبُ الحذف، ويسقط رمزُ الاستعادة فلا يُستعمل مرتين. خطؤه يُعدّ على قفل
     الملف (٥ ← ١٥ دقيقة) وعلى الرمز نفسه (٥ أخطاءٍ تُسقطه فيُطلب غيرُه). */
  app.post("/api/public/me/recover", writeLimit, async (req: Request, res: Response) => {
    const attempt = codeLimiter.reserve(ip(req));
    if (!attempt) { fail(res, 429, "محاولاتٌ كثيرة من هذا الاتصال. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    const notGuess = () => attempt.release(false);
    try {
      const civil = civilOf(req.body);
      if (!civil) { notGuess(); fail(res, 400, "الرقم المدني غير صحيح.", "bad-civil"); return; }
      const newCode = toEnglishDigits(req.body?.code).replace(/\D/g, "");
      const problem = codeProblem(newCode);
      if (problem) { notGuess(); fail(res, 400, problem, "weak-code"); return; }
      const fingerprint = await deps.surveyFingerprint(civil);
      const profile = await Repository.getStudentProfile(fingerprint);
      if (!profile) { notGuess(); fail(res, 404, "لا ملف لهذا الرقم المدني. أنشئ ملفك.", "no-profile"); return; }
      const now = Date.now();
      const lock = lockState(profile, now);
      if (lock.locked) {
        notGuess();
        fail(res, 423, `أخطأت مراتٍ كثيرة. جرّب بعد ${countOf(Math.ceil(lock.retryInMs / 60_000), AR.minute)}.`, "locked", { retryInSeconds: Math.ceil(lock.retryInMs / 1000) });
        return;
      }
      const reading = readRecovery(await deps.identityKey(), profile, String(req.body?.recovery ?? ""), now);
      if (reading === "none" || reading === "expired") {
        notGuess();
        fail(res, 400, reading === "expired" ? "انتهت مدة رمز القسم. اطلب رمزاً جديداً من قسمك." : "لا رمز استعادة لهذا الملف. اطلبه من قسمك ومعك بطاقتك المدنية.", "no-recovery");
        return;
      }
      if (reading === "wrong") {
        const { left, voided } = await countCodeFailure(fingerprint, now, true);
        fail(res, 401, voided ? "أخطأت مراتٍ كثيرة فأُلغي رمز القسم. اطلب رمزاً جديداً من قسمك." : left === 0 ? "أخطأت مراتٍ كثيرة. جرّب بعد 15 دقيقة." : "رمز القسم غير صحيح.",
          voided ? "recovery-void" : left === 0 ? "locked" : "bad-recovery", { attemptsLeft: left });
        return;
      }
      const { hash, salt } = await hashCode(newCode);
      const at = new Date(now);
      let used = false;
      const saved = await Repository.updateStudentProfile(fingerprint, current => {
        /* الرمزُ نفسُه ما زال حيّاً في المعاملة (لم يُستعمل بطلبٍ متوازٍ ولم يُستبدل). */
        if (!current || !current.recovery || current.recovery.hash !== profile.recovery?.hash || lockState(current, now).locked) return undefined;
        used = true;
        const lastSeenAt = at.toISOString(), issuedAt = current.recovery.issuedAt;
        const log = (current.recoveryLog || []).map(entry => (entry.at === issuedAt && !entry.usedAt ? { ...entry, usedAt: lastSeenAt } : entry));
        const next: StudentProfile = { ...current, codeHash: hash, codeSalt: salt, codeFailures: undefined, resetRequestedAt: undefined, recovery: undefined, recoveryLog: log, lastSeenAt, updatedAt: lastSeenAt };
        return { ...next, ...profileLifetime(next, at) };
      });
      if (!used || !saved) { notGuess(); fail(res, 409, "استُعمل هذا الرمز أو تغيّر. اطلب رمزاً جديداً من قسمك.", "recovery-used"); return; }
      attempt.release();
      await issueSession(res, saved, req.body?.remember === true);
      noStore(res); res.json({ ok: true, profile: await summaryOf(saved) });
    } catch (error) {
      notGuess();
      console.error("[student-door] recover:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّرت الاستعادة الآن. أعد المحاولة بعد قليل.");
    }
  });

  /* ── تذكيرٌ في التقويم (ICS ليومٍ كامل) ─────────────────────────────────────
     كان رابطاً عامّاً بلا جلسة يقبل عنواناً حرّاً (‎/api/public/ics-reminder?t=…‎): أيُّ أحدٍ يصنع به ملفَّ
     تقويمٍ بنصّه هو باسم الموقع. الآن نوعان معروفان، بجلسة الطالب، والعنوانُ والتاريخ من الخادم:
     next = المحطةُ القادمة في رحلة الفصل، round = يومُ دور تسجيله في «جدولي المقترح». */
  app.get("/api/public/me/reminder", requireDoor, async (req: Request, res: Response) => {
    const kind = String(req.query.kind || "");
    if (kind !== "next" && kind !== "round") { fail(res, 400, "نوع تذكيرٍ غير معروف.", "bad-kind"); return; }
    const { fingerprint } = doorOf(res);
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term) { fail(res, 404, "لا فصلَ مفتوحاً.", "no-term"); return; }
    const termName = String(term.AdTermName || "");
    let reminder: { title: string; date: string; note: string } | null = null;
    if (kind === "next") {
      const reading = readStudentPhase(term.AdTermStudentPhases, kuwaitDateISO());
      if (reading.nextAt) reminder = { title: `${reading.nextLabel || "موعد مساري"} — ${termName}`, date: String(reading.nextAt).slice(0, 10), note: `من مساري: ${reading.line}` };
    } else {
      const termId = Number(term.AdTermId);
      const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
      const round = run && ticket && ticket.runId === run.runId ? term.AdTermStudentPhases?.rounds?.[ticket.window - 1] : undefined;
      if (round?.start) reminder = { title: `موعد تسجيلي — دور ${ticket!.window} من ${run!.rounds}`, date: String(round.start).slice(0, 10), note: `من مساري: جدولي المقترح — ${round.name || ""}` };
    }
    if (!reminder || !/^\d{4}-\d{2}-\d{2}$/.test(reminder.date)) { fail(res, 404, "لا موعدَ لهذا التذكير الآن.", "no-date"); return; }
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", req.query.dl ? 'attachment; filename="masari.ics"' : 'inline; filename="masari.ics"');
    res.setHeader("Cache-Control", "no-store");
    res.send(buildReminder(reminder));
  });

  /* ── اشتراكُ «جدولي المقترح» في تقويم الهاتف ────────────────────────────────
     رابطٌ ثابتٌ لكل طالب (webcal://) يقرؤه تطبيقُ التقويم كل بضع ساعات بلا كوكي: مفتاحُه ختمٌ لبصمة
     الملف مع نسخة الرمز (src/server/studentRecovery.ts) — لا رقمَ مدنياً ولا بصمةً مكشوفة. يتبع الخطةَ
     «أ» من تذكرته بمواعيدها المعتمدة، فيتحدّث وحده كلما أُعيدت المحاكاة أو اعتُمد جدولُ قسم؛ وقبل ذلك
     تقويمٌ صالحٌ فارغ. تغييرُ الرمز أو استعادتُه أو حذفُ الملف يُبطل الرابط (٤٠٤). */
  const CALENDAR_NAME = "جدولي المقترح — مساري";
  app.get("/api/public/me/calendar", requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    const token = calendarToken(await deps.identityKey(), fingerprint, codeVersion(profile.codeHash));
    const links = calendarSubscribeLinks(`${req.protocol}://${req.get("host")}/api/public/me/cal/${token}.ics`, CALENDAR_NAME);
    noStore(res); res.json({ ...links, name: CALENDAR_NAME });
  });

  app.get("/api/public/me/cal/:file", async (req: Request, res: Response) => {
    const notFound = () => { res.setHeader("Cache-Control", "no-store"); res.status(404).type("text/plain; charset=utf-8").send("Not found"); };
    const token = /^([A-Za-z0-9_-]{40,200})\.ics$/.exec(String(req.params.file || ""))?.[1] || "";
    const key = await deps.identityKey();
    const fingerprint = token ? calendarFingerprint(key, token) : null;
    const profile = fingerprint ? await Repository.getStudentProfile(fingerprint) : undefined;
    if (!fingerprint || !profile || !calendarTokenValid(key, token, fingerprint, codeVersion(profile.codeHash))) { notFound(); return; }
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term) { notFound(); return; }
    const termId = Number(term.AdTermId);
    const lectures: CalendarLecture[] = [];
    const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
    if (run && ticket && ticket.runId === run.runId && profile.AdSectionId > 0) {
      const [catalog, context, states] = await Promise.all([sectionCatalog(profile.AdSectionId), ticketContext(termId), offeringStatesForTerm(termId)]);
      const planA = ticket.plans.find(plan => plan.label === "A") || ticket.plans[0];
      const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      for (const item of planA?.items || []) {
        const offering = context.offerings.get(item.offeringId);
        /* ما يراه الطالبُ في «جدولي المقترح» نفسُه: شعبةٌ بجدولٍ موقَّعٍ لقسمها، ومقررٌ غيرُ موقوف. */
        if (!offering?.slots.length || !context.signed.has(`${offering.collegeId}:${offering.sectionId}`) || offeringBlocked(states, Number(item.courseId))) continue;
        const course = catalog.courses.get(Number(item.courseId)) || { code: "", name: `مقرر ${item.courseId}` };
        /* أيامٌ بالساعة نفسها موعدٌ أسبوعيٌّ واحد؛ ساعةٌ أخرى موعدٌ آخر. */
        const groups = new Map<string, number[]>();
        for (const slot of offering.slots) groups.set(`${slot.start}-${slot.end}`, [...(groups.get(`${slot.start}-${slot.end}`) || []), slot.day]);
        for (const [at, days] of groups) {
          const [start, end] = at.split("-").map(Number);
          lectures.push({
            /* معرّفٌ ثابتٌ لهذا الطالب ولهذه الشعبة وساعتها: إعادةُ القراءة تحدّث الموعد ولا تكرّره. */
            id: `m${createHash("sha256").update(`${token}|${item.offeringId}|${at}`).digest("hex").slice(0, 20)}`,
            title: [course.code, course.name].filter(Boolean).join(" · "), code: course.code, section: offering.code,
            start: clock(start), end: clock(end), days,
          });
        }
      }
    }
    await sendCalendar(req, res, CALENDAR_NAME, termId, lectures);
  });
}

/**
 * حذفُ الملفات التي انتهى عمرُها: عند الإقلاع ثم كل ست ساعات. دفعةٌ محدودة
 * (الحذفُ يُحسب من الحصة اليومية)، ومكرّرةُ الأمان بين النسخ.
 */
export function scheduleStudentProfilePurge(log: (message: string) => void = console.log): void {
  const tick = () => {
    Repository.purgeExpiredStudentProfiles(new Date().toISOString())
      .then(count => { if (count) log(`[student-door] حُذف ${countOf(count, AR.profile)} انتهى عمرها.`); })
      .catch(error => console.error("[student-door] تعذّر حذف الملفات المنتهية:", error instanceof Error ? error.message : error));
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 6 * 3_600_000).unref?.();
}
