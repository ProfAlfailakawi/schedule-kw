/**
 * ── تخطيط الشعب من تقرير التسجيل (SWRDASH) ────────────────────────────────────────────
 *
 * مصدرٌ واحد: تقرير «المقررات التي يحتاجها الطالب» — «الكل» يكفي، و«الخريجون» يقدّم أهلَه.
 * لكل مقرر ولكل حرم (بنين / بنات) سطرٌ واحد:
 *
 *   الحاجة الكاملة   = ⌈الطلبة ÷ سعة الشعبة⌉   (يعدّ التقرير كل من يحتاج المقرر، لا من سيسجّله الآن)
 *   منه للخريجين     = ⌈الخريجون ÷ سعة الشعبة⌉   (الخريجون جزءٌ من الكل، لا يُضافون إليه)
 *   المقترح          = ما فتحه القسم فعلاً في الفصول المماثلة (متوسطها)، والطلبة يحرّكونه ±١ (±٢ لمن فوق ٤)؛
 *                      ومقرر بلا تاريخ = الحاجة الكاملة بسعته. والخريجون لا ينزل المقترح عن شعبهم.
 *   المطروح          = شعبُ المقرر في جدولنا للحرم نفسه
 *   ينقصه / فائض     = المقترح − المطروح     (والحاجة الكاملة تُعرض دائماً تحته: لا يُخفى الرقم الحقيقي)
 *
 * سعة الشعبة: سعة المقرر المسجّلة عندنا كما هي (٥ أو ٢٥ أو ٦٠)، وإلا «متوسط الطلبة في الشعبة»
 * من التقرير موسوماً، وإلا لا حساب («أدخل السعة»). متوسط التقرير لا يتقدّم على سعتنا أبداً.
 *
 * درجتان: الخريجون أولاً (من ينقص شعبَ خريجيه)، ثم بقية الطلبة. الترتيب برقم المقرر.
 * والمنتدبون: ساعاتٌ بلا أستاذ − ما بقي في أنصبة أساتذة العائلة ومنتدبيها ÷ ٦ ساعات لكل منتدب.
 * كل شيءٍ هنا اقتراح: لا يكتب، ولا يمنع. دوالُّ نقيّة تُحسب على الخادم وتُختبر بلا شبكة.
 */
import type { DemandMatch, DemandReport, DemandSplit } from "./actualDemand";

/** ما يحمله المنتدب الواحد افتراضاً، للجميع. */
export const VISITOR_HOURS = 6;

export type PlanTrack = "boys" | "girls" | "";
export type PlanCapSource = "course" | "report" | "none";
export type PlanTier = "grad" | "short" | "surplus" | "ok" | "nocap";

export interface PlanMember { collegeId: number; sectionId: number; track: PlanTrack }
export interface PlanCatalogueCourse { AdCourseId: number; AdSectionId: number; MaxStudent?: number; CourseHours?: number; CourseCode?: string }
export interface PlanScheduleRow { AdCourseId: number; AdCollegeId: number; SCode: string; AdInstructorId?: number }

/** شعبُ فصلٍ سابق مماثل (الموسم نفسه) لعائلة القسم. */
export interface PlanPastTerm { termName: string; rows: readonly PlanScheduleRow[] }
/** حالة الطرح: المقفل والمؤجَّل لا يُقترح لهما شيء، والمسقوف لا يتجاوز سقفه. */
export interface PlanOffering { state: string; maxSections?: number }
export type PlanBasis = "history" | "calc" | "locked";

/** سقف التعديل عن المعتاد: ±١، و±٢ إن كان المعتاد ٤ شعب فأكثر. */
export const historyBand = (usual: number) => (usual >= 4 ? 2 : 1);

/** المقترح من التاريخ: المعتاد، والحاجة تحرّكه داخل النطاق. */
export function suggestFromHistory(usual: number, required: number): number {
  const band = historyBand(usual);
  const lean = required > 0 ? Math.max(-band, Math.min(band, required - usual)) : 0;
  return Math.max(1, usual + lean);
}

export interface PlanRow {
  code: string;
  name: string;
  track: PlanTrack;
  /** ساعات الشعبة الواحدة (للمنتدبين). */
  hours: number;
  students: number;
  graduates: number;
  cap: number;
  capSource: PlanCapSource;
  /** الحاجة الكاملة: ⌈الطلبة ÷ السعة⌉. */
  required: number;
  gradRequired: number;
  /** المقترح: من التاريخ إن وُجد، وإلا الحاجة الكاملة؛ لا ينزل عن شعب الخريجين. */
  plan: number;
  basis: PlanBasis;
  /** المعتاد في الفصول المماثلة (متوسط ما فُتح)، وعدد تلك الفصول. null بلا تاريخ. */
  usual: number | null;
  historyTerms: number;
  offered: number;
  /** شعبُ خريجين ناقصة: ⌈الخريجون ÷ السعة⌉ − المطروح. */
  gradShort: number;
  /** المقترح − المطروح: موجبٌ ينقصه، وسالبٌ فائض. */
  gap: number;
  /** الحاجة الكاملة − المطروح (للعرض تحت المقترح). */
  fullGap: number;
  tier: PlanTier;
  /** طلبةٌ بلا مقعد بعد المطروح. */
  unseated: number;
  /** ما اقترحه التسجيل نفسه (بمتوسطه)، للمقارنة فقط. */
  registrar: number;
  /** شعبٌ قائمة بلا أستاذٍ حقيقي («هيئة تدريسية» أو فارغة). */
  unassigned: number;
  /** أين تُفتح شعبةٌ أو تُراجَع: نسخة المقرر في كلية هذا الحرم. */
  target: { courseId: number; collegeId: number; sectionId: number } | null;
}

export interface PlanVisitors {
  /** ساعاتٌ بلا أستاذ: شعبٌ تُفتح + شعبٌ قائمة بلا أستاذ. */
  hours: number;
  /** ما بقي في أنصبة أساتذة العائلة ومنتدبيها الحاليين. */
  free: number;
  visitors: number;
}

export interface SectionPlanReading {
  hasGeneral: boolean;
  hasGraduates: boolean;
  rows: PlanRow[];
  totals: {
    /** شعبُ خريجين ناقصة. */
    gradOpen: number;
    /** كل الشعب الناقصة بالمقترح (ومنها شعبُ الخريجين). */
    open: number;
    /** الشعب الناقصة بالحاجة الكاملة، بلا تاريخ: الرقم الحقيقي للمشكلة. */
    needAll: number;
    close: number;
    /** مقرراتٌ لا سعة لها عندنا ولا في التقرير. */
    nocap: number;
  };
  /** الخريجون لهم مقعد: نسبةٌ من 0 إلى 100، أو null بلا تقرير خريجين أو بلا خريجين. */
  graduatesServed: number | null;
  visitors: { graduates: PlanVisitors; all: PlanVisitors; perVisitor: number };
}

const sideOf = (split: DemandSplit | undefined, track: PlanTrack) =>
  !split ? 0 : track === "boys" ? split.boys : track === "girls" ? split.girls : split.total;
const splitOf = (pair: { boys: number; girls: number } | undefined, track: PlanTrack) =>
  !pair ? 0 : track === "boys" ? pair.boys : track === "girls" ? pair.girls : Math.max(pair.boys, pair.girls);
const sectionsFor = (students: number, cap: number) => (students > 0 && cap > 0 ? Math.ceil(students / cap) : 0);
const code3 = (code: string) => Number(String(code).slice(-3)) || 0;

/** المنتدبون لساعاتٍ بعينها: ما زاد على المتاح ÷ ساعات المنتدب. */
export function visitorsFor(hours: number, free: number): PlanVisitors {
  const need = Math.max(0, Math.round(hours));
  const room = Math.max(0, Math.round(free));
  return { hours: need, free: room, visitors: Math.ceil(Math.max(0, need - room) / VISITOR_HOURS) };
}

export function sectionPlan(input: {
  general: DemandReport | null;
  graduates: DemandReport | null;
  matches: ReadonlyMap<string, DemandMatch>;
  catalogue: readonly PlanCatalogueCourse[];
  members: readonly PlanMember[];
  rows: readonly PlanScheduleRow[];
  /** أستاذٌ حقيقي (لا «هيئة تدريسية»)؛ غيابه = كل رقمٍ أستاذ. */
  isTeacher?: (instructorId: number) => boolean;
  /** ساعاتٌ بقيت في أنصبة أساتذة العائلة ومنتدبيها هذا الفصل. */
  freeHours?: number;
  /** الفصول المماثلة السابقة لعائلة القسم (الأحدث أولاً). */
  past?: readonly PlanPastTerm[];
  /** مقررٌ أُعيد ترقيمه: سلفُه يُورِّثه شعبَه إن لم يُفتح هو بعدُ. */
  ancestors?: ReadonlyMap<number, readonly number[]>;
  /** حالة الطرح لكل AdCourseId. */
  offering?: ReadonlyMap<number, PlanOffering>;
}): SectionPlanReading {
  const general = input.general, graduates = input.graduates;
  const empty: SectionPlanReading = {
    hasGeneral: Boolean(general), hasGraduates: Boolean(graduates), rows: [],
    totals: { gradOpen: 0, open: 0, needAll: 0, close: 0, nocap: 0 }, graduatesServed: null,
    visitors: { graduates: visitorsFor(0, input.freeHours || 0), all: visitorsFor(0, input.freeHours || 0), perVisitor: VISITOR_HOURS },
  };
  if (!general && !graduates) return empty;
  const isTeacher = input.isTeacher || (() => true);
  const byId = new Map(input.catalogue.map(course => [Number(course.AdCourseId), course] as const));
  const tracked = input.members.some(member => member.track);
  const tracks: PlanTrack[] = tracked ? ["boys", "girls"] : [""];
  const gradByCode = new Map((graduates?.courses || []).map(course => [course.code, course] as const));
  const generalCodes = new Set((general?.courses || []).map(course => course.code));
  const courses = [...(general?.courses || []), ...(graduates?.courses || []).filter(course => !generalCodes.has(course.code))];

  /* الشعب في الجدول: (مقرر، كلية) ← رموزها، ومن يدرّس كلَّ رمز. */
  const sections = new Map<string, Map<string, Set<number>>>();
  for (const row of input.rows) {
    const key = `${Number(row.AdCourseId)}|${Number(row.AdCollegeId)}`;
    if (!sections.has(key)) sections.set(key, new Map());
    const code = String(row.SCode || "").trim();
    const teachers = sections.get(key)!;
    if (!teachers.has(code)) teachers.set(code, new Set());
    const id = Number(row.AdInstructorId || 0);
    if (id) teachers.get(code)!.add(id);
  }

  /* شعب كل فصلٍ سابق: (فصل، مقرر، كلية) ← عدد رموز الشعب. */
  const pastCount = (past: PlanPastTerm, courseId: number, collegeId: number) => {
    const seen = new Set<string>();
    for (const row of past.rows) if (Number(row.AdCourseId) === courseId && Number(row.AdCollegeId) === collegeId) seen.add(String(row.SCode || "").trim());
    return seen.size;
  };
  const pastTerms = input.past || [];
  const ancestorsOf = (id: number) => input.ancestors?.get(id) || [];

  const out: PlanRow[] = [];
  let gradNeed = 0, gradSeated = 0;
  for (const course of courses) {
    const match = input.matches.get(course.code);
    if (!match || match.status === "ignored" || match.status === "unmatched" || !match.courseIds.length) continue;
    const copies = match.courseIds.map(id => byId.get(Number(id))).filter(Boolean) as PlanCatalogueCourse[];
    const grad = gradByCode.get(course.code);
    const studentsSplit = general ? general.courses.find(item => item.code === course.code)?.students : grad?.students;
    for (const track of tracks) {
      const members = input.members.filter(member => !tracked || member.track === track);
      const own = members.flatMap(member => copies.filter(copy => Number(copy.AdSectionId) === member.sectionId).map(copy => ({ member, copy })));
      let offered = 0, unassigned = 0;
      for (const { member, copy } of own) {
        const codes = sections.get(`${Number(copy.AdCourseId)}|${member.collegeId}`);
        if (!codes) continue;
        offered += codes.size;
        for (const teachers of codes.values()) if (![...teachers].some(isTeacher)) unassigned += 1;
      }
      const students = Math.max(sideOf(studentsSplit, track), sideOf(grad?.students, track));
      const graduatesHere = sideOf(grad?.students, track);
      if (!students && !graduatesHere && !offered) continue;
      const entered = Math.max(0, ...own.map(({ copy }) => Math.round(Number(copy.MaxStudent) || 0)));
      const average = splitOf(course.average, track) || splitOf(grad?.average, track);
      const cap = entered > 0 ? entered : average > 0 ? average : 0;
      const capSource: PlanCapSource = entered > 0 ? "course" : average > 0 ? "report" : "none";
      const required = sectionsFor(students, cap);
      const gradRequired = Math.min(required || Infinity, sectionsFor(graduatesHere, cap));
      const gradShort = cap ? Math.max(0, gradRequired - offered) : 0;

      /* المعتاد من التاريخ: ما فتحه القسم فعلاً في كل فصلٍ مماثل (لا يُحسب فصلٌ لم يُفتح فيه المقرر). */
      const perTerm = pastTerms.map(term => {
        const own = members.flatMap(member => copies.filter(copy => Number(copy.AdSectionId) === member.sectionId).map(copy => ({ member, copy })));
        const ownCount = own.reduce((sum, { member, copy }) => sum + pastCount(term, Number(copy.AdCourseId), member.collegeId), 0);
        return { term, ownCount, own };
      });
      const ownOpened = perTerm.some(item => item.ownCount > 0);
      const counts = perTerm.map(item => ownOpened ? item.ownCount
        : item.own.reduce((sum, { member, copy }) => sum + ancestorsOf(Number(copy.AdCourseId)).reduce((inner, from) => inner + pastCount(item.term, from, member.collegeId), 0), 0)).filter(n => n > 0);
      const usual = counts.length ? Math.max(1, Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)) : null;

      const offering = own.map(({ copy }) => input.offering?.get(Number(copy.AdCourseId))).find(Boolean);
      const locked = offering?.state === "closed" || offering?.state === "future";
      let plan = !cap && usual === null ? 0 : usual !== null ? suggestFromHistory(usual, required) : required;
      if (!locked && offering?.state === "limited" && Number(offering.maxSections) > 0) plan = Math.min(plan, Number(offering.maxSections));
      if (cap) plan = Math.max(plan, gradRequired);
      if (locked) plan = Math.min(plan, offered);
      const basis: PlanBasis = locked ? "locked" : usual !== null ? "history" : "calc";
      const planned = Boolean(cap) || usual !== null;
      const gap = planned ? plan - offered : 0;
      const fullGap = cap ? required - offered : 0;
      const tier: PlanTier = !planned && students ? "nocap" : gradShort > 0 ? "grad" : gap > 0 ? "short" : gap < 0 ? "surplus" : "ok";
      const hours = Math.max(0, ...own.map(({ copy }) => Number(copy.CourseHours) || 0)) || course.units || grad?.units || 0;
      if (graduatesHere && cap) { gradNeed += graduatesHere; gradSeated += Math.min(graduatesHere, offered * cap); }
      const first = own[0];
      out.push({
        code: course.code, name: course.name || grad?.name || "", track, hours,
        students, graduates: graduatesHere, cap, capSource, required, gradRequired, plan, basis, usual, historyTerms: counts.length, offered, gradShort, gap, fullGap, tier,
        unseated: cap ? Math.max(0, students - offered * cap) : students,
        registrar: sideOf(course.suggested, track) || sideOf(grad?.suggested, track),
        unassigned,
        target: first ? { courseId: Number(first.copy.AdCourseId), collegeId: first.member.collegeId, sectionId: first.member.sectionId } : null,
      });
    }
  }
  const order = (track: PlanTrack) => (track === "boys" ? 0 : track === "girls" ? 1 : 2);
  out.sort((a, b) => code3(a.code) - code3(b.code) || a.code.localeCompare(b.code) || order(a.track) - order(b.track));

  const unassignedHours = out.reduce((sum, row) => sum + row.unassigned * row.hours, 0);
  const free = input.freeHours || 0;
  return {
    hasGeneral: Boolean(general), hasGraduates: Boolean(graduates), rows: out,
    totals: {
      gradOpen: out.reduce((sum, row) => sum + row.gradShort, 0),
      open: out.reduce((sum, row) => sum + Math.max(0, row.gap), 0),
      needAll: out.reduce((sum, row) => sum + Math.max(0, row.fullGap), 0),
      close: out.reduce((sum, row) => sum + Math.max(0, -row.gap), 0),
      nocap: out.filter(row => row.tier === "nocap").length,
    },
    graduatesServed: graduates && gradNeed > 0 ? Math.round((gradSeated / gradNeed) * 100) : null,
    visitors: {
      graduates: visitorsFor(out.reduce((sum, row) => sum + row.gradShort * row.hours, 0) + unassignedHours, free),
      all: visitorsFor(out.reduce((sum, row) => sum + Math.max(0, row.gap) * row.hours, 0) + unassignedHours, free),
      perVisitor: VISITOR_HOURS,
    },
  };
}

/** درجةُ السطر في الشاشة: الخريجون أولاً، ثم بقية الطلبة؛ والمتوازن لا يُعرض. */
export const planStage = (row: Pick<PlanRow, "tier">): "graduates" | "students" | null =>
  row.tier === "grad" ? "graduates" : row.tier === "ok" ? null : "students";

/**
 * ما تقرؤه الشاشات الأخرى لكل AdCourseId (شارة المراجعة، محرّر الموعد، لوحة القرار):
 * المطلوب والمطروح في نسخة كل كلية، من سطر حرمها.
 */
export interface PlanCourseFact { code: string; name: string; courseCode: string; sectionId: number; track: PlanTrack; required: number; plan: number; offered: number; gap: number; gradShort: number; graduates: number; students: number; tier: PlanTier }
export function planCourseFacts(reading: SectionPlanReading, matches: ReadonlyMap<string, DemandMatch>, catalogue: readonly PlanCatalogueCourse[], members: readonly PlanMember[]): Record<string, PlanCourseFact> {
  const out: Record<string, PlanCourseFact> = {};
  const trackOfSection = new Map(members.map(member => [member.sectionId, member.track] as const));
  const byId = new Map(catalogue.map(course => [Number(course.AdCourseId), course] as const));
  for (const row of reading.rows) {
    for (const id of matches.get(row.code)?.courseIds || []) {
      const copy = byId.get(Number(id));
      if (!copy) continue;
      const track = trackOfSection.get(Number(copy.AdSectionId)) ?? "";
      if (row.track && track !== row.track) continue;
      out[String(id)] = { code: row.code, name: row.name, courseCode: String(copy.CourseCode || "").trim(), sectionId: Number(copy.AdSectionId), track: row.track, required: row.required, plan: row.plan, offered: row.offered, gap: row.gap, gradShort: row.gradShort, graduates: row.graduates, students: row.students, tier: row.tier };
    }
  }
  return out;
}
