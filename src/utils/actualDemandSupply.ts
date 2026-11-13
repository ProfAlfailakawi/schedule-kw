/**
 * ── العرض والطلب: مقاعدُ جدولنا مقابل حاجة الطلبة الفعلية ──────────────────────────
 *
 * لكل مقرر في تقرير التسجيل (src/utils/actualDemand.ts): الطلبةُ الذين يحتاجونه (بنين/بنات)،
 * ومقاعدُ شعبه في جدول العائلة للفصل — والمقعدُ بسقف لائحتنا (م.8 وم.9، src/utils/capacityLimits.ts)
 * لا بمتوسط التقرير (30/35). النتيجة لكل مسار: عجزٌ أو فائضٌ بالشعب، وإن عجز مسارٌ وفاض آخر
 * فالاقتراح نقلُ شعبةٍ (وأستاذها) بينهما قبل فتح شعبةٍ جديدة.
 *
 * ورقمٌ واحد للجدول: «نسبة خدمة الطلب» = مجموع min(الطلب، المقاعد) ÷ مجموع الطلب، لكل مسار ثم للكل،
 * ومعها نسبة الخريجين. ما لم يُطابَق أو عُلِّم «لا يخص القسم» لا يدخل النسبة (يُعرض وحده).
 * دوالُّ نقيّة: تُحسب على الخادم وتُختبر بلا شبكة.
 */
import { capacityCourseKey, capacityRange, type CapacitySpecialization } from "./capacityLimits";
import type { DemandMatch, DemandReport, DemandSplit } from "./actualDemand";

export type SupplyTrack = "boys" | "girls" | "";
export interface SupplyMember { collegeId: number; sectionId: number; collegeName: string; track: SupplyTrack }
export interface SupplyCourse { AdCourseId: number; AdSectionId: number; CourseCode: string; CourseName?: string; MaxStudent?: number; CourseTeachingMode?: string }
export interface SupplyRow { AdCourseId: number; AdCollegeId: number; SCode: string }
export interface SupplyCapacity { specialization: CapacitySpecialization; excused: ReadonlySet<string> }

/** مقرر لا طبيعة له ولا سعة: سقفُ الشعبة النظرية في م.8 (الحالة الغالبة)، ويُوسَم «مفترض». */
export const DEFAULT_SEAT_CAP = 60;

/**
 * مقاعد الشعبة الواحدة بلائحتنا: سعة المقرر المدخلة ما لم تتجاوز أقصى طبيعته (م.8)؛ والمستثنى
 * بقرار المدير (م.9) سعتُه كما أُدخلت. بلا سعة: أقصى الطبيعة؛ وبلا طبيعة ولا سعة: الافتراضي.
 */
export function seatCap(course: Pick<SupplyCourse, "MaxStudent" | "CourseTeachingMode" | "CourseCode"> | undefined, capacity: SupplyCapacity): { cap: number; assumed: boolean } {
  const entered = Number(course?.MaxStudent) > 0 ? Math.round(Number(course!.MaxStudent)) : 0;
  const range = capacityRange(course?.CourseTeachingMode, capacity.specialization);
  if (course && capacity.excused.has(capacityCourseKey(course.CourseCode))) return entered ? { cap: entered, assumed: false } : { cap: range?.[1] || DEFAULT_SEAT_CAP, assumed: !range };
  if (range) return { cap: entered ? Math.min(entered, range[1]) : range[1], assumed: false };
  return entered ? { cap: entered, assumed: false } : { cap: DEFAULT_SEAT_CAP, assumed: true };
}

export interface SupplyCollege { collegeId: number; sectionId: number; collegeName: string; courseId: number; sections: number; seats: number }
export interface SupplyBranch {
  track: SupplyTrack;
  demand: number;
  graduates: number;
  sections: number;
  seats: number;
  /** موجبٌ عجزٌ بالشعب، وسالبٌ فائضٌ يمكن الاستغناء عنه، وصفرٌ متوازن. */
  gap: number;
  colleges: SupplyCollege[];
}
export interface SupplyMove { from: SupplyTrack; to: SupplyTrack; sections: number }
export interface SupplyItem {
  code: string;
  name: string;
  demand: number;
  graduates: number;
  cap: number;
  capAssumed: boolean;
  sections: number;
  seats: number;
  /** عجزٌ بالشعب بعد احتساب النقل الممكن (موجب)، أو فائض (سالب). */
  gap: number;
  unmetStudents: number;
  unmetGraduates: number;
  branches: SupplyBranch[];
  move: SupplyMove | null;
}
export interface SupplyReading {
  /** نسبة خدمة الطلب (0–100) للعام وللخريجين؛ null بلا طلب. */
  service: { general: number | null; graduates: number | null };
  byTrack: Array<{ track: SupplyTrack; general: number | null; graduates: number | null }>;
  items: SupplyItem[];
}

const pct = (served: number, need: number) => (need > 0 ? Math.round((served / need) * 1000) / 10 : null);
const sideOf = (split: DemandSplit | undefined, track: SupplyTrack) => !split ? 0 : track === "boys" ? split.boys : track === "girls" ? split.girls : split.total;

/** الشعب في الجدول لكل (مقرر، كلية): رموزٌ مختلفة. */
function sectionCounts(rows: readonly SupplyRow[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${Number(row.AdCourseId)}|${Number(row.AdCollegeId)}`;
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(String(row.SCode || "").trim());
  }
  return new Map([...seen].map(([key, set]) => [key, set.size] as const));
}

export function demandSupply(input: {
  general: DemandReport | null;
  graduates: DemandReport | null;
  matches: ReadonlyMap<string, DemandMatch>;
  catalogue: readonly SupplyCourse[];
  members: readonly SupplyMember[];
  rows: readonly SupplyRow[];
  capacity: SupplyCapacity;
}): SupplyReading {
  const grads = new Map((input.graduates?.courses || []).map(course => [course.code, course.students] as const));
  const counts = sectionCounts(input.rows);
  const byId = new Map(input.catalogue.map(course => [Number(course.AdCourseId), course] as const));
  /* المسارات: بنين وبنات إن عُرفت الكليات؛ وإلا مسارٌ واحد يخدم الطلبة كلهم. */
  const tracked = input.members.some(member => member.track);
  const tracks: SupplyTrack[] = tracked ? ["boys", "girls"] : [""];
  const totals = new Map<string, { need: number; served: number; gNeed: number; gServed: number }>();
  const tally = (key: string, need: number, served: number, gNeed: number, gServed: number) => {
    const at = totals.get(key) || { need: 0, served: 0, gNeed: 0, gServed: 0 };
    at.need += need; at.served += served; at.gNeed += gNeed; at.gServed += gServed;
    totals.set(key, at);
  };
  const items: SupplyItem[] = [];
  /* المقررات اتحادُ التقريرين: مقررٌ لا يذكره إلا تقريرُ الخريجين لا يسقط من النسبة والقائمة والشارة. */
  const generalCodes = new Set((input.general?.courses || []).map(course => course.code));
  const union = [...(input.general?.courses || []), ...(input.graduates?.courses || []).filter(course => !generalCodes.has(course.code))];
  for (const course of union) {
    const match = input.matches.get(course.code);
    if (!match || !match.courseIds.length || match.status === "ignored" || match.status === "unmatched") continue;
    const own = match.courseIds.map(id => byId.get(id)).filter(Boolean) as SupplyCourse[];
    /* سقفُ المقرر لا يتبع العضو المفتوح أولاً: لكل نسخةٍ سقفُها، والمعروضُ أكبرها بترتيبٍ ثابت. */
    const caps = own.map(item => seatCap(item, input.capacity)).sort((a, b) => b.cap - a.cap || Number(a.assumed) - Number(b.assumed));
    const { cap, assumed } = caps[0] || seatCap(undefined, input.capacity);
    /* الخريجون طلبةٌ أيضاً: مقررٌ غاب عن التقرير العام يُحسب طلبُه العامّ بخريجيه على الأقل. */
    const demandSplit = input.general?.courses.find(item => item.code === course.code)?.students
      || (input.general ? grads.get(course.code) : undefined) || { boys: 0, girls: 0, total: 0 };
    const gradSplit = grads.get(course.code);
    const branches: SupplyBranch[] = tracks.map(track => {
      const colleges = input.members
        .filter(member => !tracked || member.track === track)
        .map(member => {
          const copy = own.find(item => Number(item.AdSectionId) === member.sectionId);
          if (!copy) return null;
          const sections = counts.get(`${Number(copy.AdCourseId)}|${member.collegeId}`) || 0;
          const memberCap = seatCap(copy, input.capacity).cap;
          return { collegeId: member.collegeId, sectionId: member.sectionId, collegeName: member.collegeName, courseId: Number(copy.AdCourseId), sections, seats: sections * memberCap };
        }).filter(Boolean) as SupplyCollege[];
      const demand = sideOf(demandSplit, track);
      const graduates = sideOf(gradSplit, track);
      const need = Math.max(demand, graduates);
      const sections = colleges.reduce((sum, item) => sum + item.sections, 0);
      const seats = colleges.reduce((sum, item) => sum + item.seats, 0);
      /* عجزُ المسار وفائضُه بسقف نسخته هو (بنين 20 وبنات 60 لا يُقرآن بسقفٍ واحد). */
      const branchCap = colleges.length
        ? Math.max(...colleges.map(item => item.sections ? item.seats / item.sections : seatCap(own.find(copy => Number(copy.AdCourseId) === item.courseId), input.capacity).cap))
        : cap;
      const gap = need > seats ? Math.ceil((need - seats) / branchCap) : -Math.min(sections, Math.floor((seats - need) / branchCap));
      tally(track, demand, Math.min(demand, seats), graduates, Math.min(graduates, seats));
      return { track, demand, graduates, sections, seats, gap, colleges };
    }).filter(branch => branch.colleges.length || branch.demand || branch.graduates);
    /* مسارٌ عاجز وآخر فائض: شعبةٌ تُنقل قبل أن تُفتح أخرى. */
    const short = branches.filter(branch => branch.gap > 0).sort((a, b) => b.gap - a.gap)[0];
    const spare = branches.filter(branch => branch.gap < 0).sort((a, b) => a.gap - b.gap)[0];
    const move = short && spare ? { from: spare.track, to: short.track, sections: Math.min(short.gap, -spare.gap) } : null;
    const shortage = branches.reduce((sum, branch) => sum + Math.max(0, branch.gap), 0);
    const surplus = branches.reduce((sum, branch) => sum + Math.max(0, -branch.gap), 0);
    const gap = shortage - (move?.sections || 0) > 0 ? shortage - (move?.sections || 0) : shortage > 0 ? 0 : -surplus;
    items.push({
      code: course.code, name: course.name,
      demand: demandSplit.total, graduates: gradSplit?.total || 0,
      cap, capAssumed: assumed,
      sections: branches.reduce((sum, branch) => sum + branch.sections, 0),
      seats: branches.reduce((sum, branch) => sum + branch.seats, 0),
      gap,
      unmetStudents: branches.reduce((sum, branch) => sum + Math.max(0, branch.demand - branch.seats), 0),
      unmetGraduates: branches.reduce((sum, branch) => sum + Math.max(0, branch.graduates - branch.seats), 0),
      branches, move,
    });
  }
  /* الأشد أولاً: خريجون بلا مقعد، ثم طلبةٌ بلا مقعد، ثم نقلٌ ممكن، ثم الفائض، ثم المتوازن. */
  const rank = (item: SupplyItem) => item.unmetGraduates > 0 ? 0 : item.unmetStudents > 0 ? 1 : item.move ? 2 : item.gap < 0 ? 3 : 4;
  items.sort((a, b) => rank(a) - rank(b) || b.unmetGraduates - a.unmetGraduates || b.unmetStudents - a.unmetStudents || a.gap - b.gap || b.demand - a.demand);
  const all = [...totals.values()].reduce((acc, at) => ({ need: acc.need + at.need, served: acc.served + at.served, gNeed: acc.gNeed + at.gNeed, gServed: acc.gServed + at.gServed }), { need: 0, served: 0, gNeed: 0, gServed: 0 });
  return {
    service: { general: input.general ? pct(all.served, all.need) : null, graduates: input.graduates ? pct(all.gServed, all.gNeed) : null },
    byTrack: tracks.map(track => { const at = totals.get(track); return { track, general: at && input.general ? pct(at.served, at.need) : null, graduates: at && input.graduates ? pct(at.gServed, at.gNeed) : null }; }),
    items,
  };
}

/** ما يحتاجه حكمُ «حذف مقرر» وشارةُ المراجعة لكل AdCourseId. */
export interface CourseDemandFact { students: number; graduates: number; seats: number; gap: number; unmetStudents: number; unmetGraduates: number }
export function courseDemandFacts(reading: SupplyReading, matches: ReadonlyMap<string, DemandMatch>): Record<string, CourseDemandFact> {
  const out: Record<string, CourseDemandFact> = {};
  for (const item of reading.items) {
    const fact: CourseDemandFact = { students: item.demand, graduates: item.graduates, seats: item.seats, gap: item.gap, unmetStudents: item.unmetStudents, unmetGraduates: item.unmetGraduates };
    for (const id of matches.get(item.code)?.courseIds || []) out[String(id)] = fact;
  }
  return out;
}

/**
 * نبرةُ شارة المراجعة: خريجون بلا مقعد، أو عجز (ومنه ما يغطّيه نقلٌ مقترح لم يُنفَّذ بعد)، أو فائض،
 * أو متوازن — والأخضر لا يُعطى ما دام طالبٌ بلا مقعد.
 */
export function demandBadgeTone(fact: CourseDemandFact): "grad" | "short" | "spare" | "ok" {
  if (fact.unmetGraduates > 0) return "grad";
  if (fact.gap > 0 || fact.unmetStudents > 0) return "short";
  return fact.gap < 0 ? "spare" : "ok";
}

/**
 * ── تنبيه الجدول الدراسي: رقمان لعائلة القسم، ومعهما توزيعهما على المسارين ──
 * «بلا شعبة»: مقررٌ يطلبه طلبةٌ أو خريجون ولا شعبة له في العائلة كلها. «نقص المقاعد»: مجموعُ
 * الطلبة بلا مقعد في كل المسارات. ولكل مسار عددُه: مقررٌ له شعبٌ للبنين فقط يُعدّ «بلا شعبة» للبنات.
 * لا تنبيه (show = false) حين خُدم كل طالب — ولا تنبيه أصلاً بلا تقرير، فلا بنود.
 */
export interface DemandAlertItem {
  sections: number; unmetStudents: number; unmetGraduates: number;
  branches: ReadonlyArray<{ track: string; demand: number; graduates: number; sections: number; seats: number }>;
}
export interface DemandAlertSummary {
  show: boolean;
  /** مقرراتٌ مطلوبة بلا شعبة في العائلة كلها. */
  uncovered: number;
  /** مقاعدُ ناقصة (طلبةٌ بلا مقعد) في كل المسارات. */
  seats: number;
  /** خريجون بلا مقعد. */
  graduates: number;
  byTrack: Array<{ track: string; uncovered: number; seats: number }>;
}
export function demandAlertSummary(items: readonly DemandAlertItem[]): DemandAlertSummary {
  const uncovered = items.filter(item => item.sections === 0 && (item.unmetStudents > 0 || item.unmetGraduates > 0)).length;
  const seats = items.reduce((sum, item) => sum + Math.max(0, item.unmetStudents), 0);
  const graduates = items.reduce((sum, item) => sum + Math.max(0, item.unmetGraduates), 0);
  const tracks = new Map<string, { uncovered: number; seats: number }>();
  for (const item of items) {
    for (const branch of item.branches) {
      if (!branch.track) continue;
      const at = tracks.get(branch.track) || { uncovered: 0, seats: 0 };
      if (branch.sections === 0 && Math.max(branch.demand, branch.graduates) > 0) at.uncovered += 1;
      at.seats += Math.max(0, branch.demand - branch.seats);
      tracks.set(branch.track, at);
    }
  }
  const order = (track: string) => (track === "boys" ? 0 : track === "girls" ? 1 : 2);
  return {
    show: uncovered > 0 || seats > 0 || graduates > 0,
    uncovered, seats, graduates,
    byTrack: [...tracks].sort((a, b) => order(a[0]) - order(b[0])).map(([track, at]) => ({ track, ...at })),
  };
}

/** حدُّ القائمة المرسلة إلى الشاشة؛ والأرقام الكلية تُحسب قبله من كل البنود. */
export const SUPPLY_LIST_LIMIT = 40;

/**
 * ما يُرسل للشاشة من العرض والطلب: القائمةُ (ما فيه عجزٌ أو فائضٌ أو نقل) مقصوصةً بحدّها،
 * وملخّصُ التنبيه وعددُ البنود من البنود كلها — فلا ينقص رقمُ الشارة حين تطول القائمة.
 */
export function supplyView<T extends SupplyItem>(items: readonly T[], limit = SUPPLY_LIST_LIMIT): { list: T[]; total: number; summary: DemandAlertSummary } {
  const notable = items.filter(item => item.gap !== 0 || item.unmetGraduates > 0 || item.unmetStudents > 0 || item.move);
  return { list: notable.slice(0, limit), total: notable.length, summary: demandAlertSummary(items) };
}
