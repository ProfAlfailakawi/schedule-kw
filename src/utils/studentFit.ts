/**
 * ── «نبض الطلبة»: كم ممن يحتاجون المقرر يناسبهم هذا الوقت؟ ─────────────────────────────
 *
 * من تقريرَي الطلب الفعلي (العام والخريجين) وحدهما — لا اختراع: كل مقرر فيهما يقول كم طالباً
 * من كل برنامج (BA-xxxx) يحتاجه، في كل مسار (بنين/بنات).
 *
 * الشعبةُ المقترحة «تحجب» طالباً عن مقررٍ آخر يحتاجه حين تتداخل مع كلّ شعبِ ذلك المقرر في
 * المسار نفسه — فلا شعبة بديلة له. ولكل برنامج: المحجوبون = min(طلبته في هذا المقرر،
 * أكبر عددٍ منهم في مقررٍ محجوب). والمجموع تقديرٌ أعلى من الصفر وأدنى من الحاجة.
 *
 * تقديري لا قطعي: التقرير يعدّ الطلبة لكل برنامج لا لكل طالب، فيُقال «تقريباً» في الشاشة.
 * لا يمنع شيئاً (التنبيهات الليّنة لا تمنع الحفظ أبداً).
 */
import type { DemandCourse, DemandMatch, DemandReport, DemandSplit } from "./actualDemand";
import { sectionsClash, sectionsOf, type ClashMember, type ClashRow } from "./actualDemandGraduates";

export type FitTrack = "boys" | "girls" | "";

export interface FitClash { code: string; name: string; students: number }

export interface FitSide {
  /** من يحتاجون المقرر في هذا المسار. */
  need: number;
  /** من يناسبهم الوقت (تقديراً). */
  fit: number;
  /** من يحجبهم الوقت عن مقررٍ آخر يحتاجونه. */
  blocked: number;
  /** نسبة من يناسبهم؛ null حين لا برامج في التقرير تُحسب بها. */
  percent: number | null;
  /** المقررات المحجوبة، الأشد أولاً (ثلاثة على الأكثر). */
  clashes: FitClash[];
  /**
   * من يجد شعبةً تناسبه في المقرر كله (لا في هذا الموعد وحده): قبل هذا الموعد وبعده. طالبٌ يُحجب عن شعبةٍ يأخذ غيرها،
   * فلا يُعدّ غير مخدوم إلا إن حُجب عن كل شعبه؛ ومقررٌ بلا شعبة يخدم 0٪. بيانٌ لسطر «يناسب الخريجين: 0٪ ← 94٪» بعد الحفظ.
   * يُحسب حين يُطلب (withCoverage) فلا يثقل قراءة عشرات الخانات.
   */
  coverage?: { before: number; after: number } | null;
}

export interface StudentFit {
  track: FitTrack;
  /** شعب المقرر في المسار قبل هذا الموعد وبعده. */
  sections: { before: number; after: number };
  students: FitSide | null;
  graduates: FitSide | null;
}

const sideOf = (track: FitTrack) => (value: DemandSplit | { boys: number; girls: number; total: number }) =>
  track === "boys" ? Number(value.boys) || 0 : track === "girls" ? Number(value.girls) || 0 : Number(value.total) || 0;

function sideFor(input: {
  report: DemandReport | null;
  code: string;
  matches: ReadonlyMap<string, DemandMatch>;
  rows: readonly ClashRow[];
  colleges: ReadonlySet<number>;
  candidateSection: ClashRow[];
  track: FitTrack;
  /** شعب المقرر في المسار قبل الموعد وبعده، لسطر التغطية. غائبتان = بلا تغطية. */
  beforeSections?: ClashRow[][];
  afterSections?: ClashRow[][];
  /**
   * كيف يُقدَّر من يحتاجون المقرّرَين معاً (التقرير يعدّ لكل برنامجٍ لا لكل طالب):
   *  • upper: الأدنى بين العددين — أقصى تداخلٍ ممكن؛ للخريجين الذين يُنهون ما بقي عليهم فيحتاجون ما يُذكر معاً.
   *  • independent: تداخلٌ متوقَّع بافتراض استقلال تسجيل المقررين داخل البرنامج: الحصّة = عدد من يأخذ المقرر الآخر ÷ حجم دفعة البرنامج
   *    (أكبر مقررٍ فيه)؛ فمقررٌ يأخذه الجميع يحجب الجميع، ومقررٌ لخُمس الدفعة يحجب خُمس من يحتاجون هذا. للطلبة عامةً:
   *    الأدنى كان يُشبع كلَّ خانةٍ بـ0٪ على بياناتٍ حقيقية فلا يميّز وقتاً من وقت.
   */
  model?: "upper" | "independent";
}): FitSide | null {
  const { report, code, track } = input;
  if (!report) return null;
  const side = sideOf(track);
  const course = report.courses.find(item => item.code === code);
  if (!course) return null;
  const need = side(course.students);
  if (need <= 0) return null;
  if (!course.programs.length) return { need, fit: need, blocked: 0, percent: null, clashes: [] };
  const mine = new Map(course.programs.map(program => [program.code, side(program)] as const));
  /* المقررات التي تحجبها الشعبة: كلُّ شعبها في المسار تتداخل معها. */
  const ZERO = { boys: 0, girls: 0, total: 0 };
  const blockingFor = (section: ClashRow[]) => report.courses.filter(other => {
    if (other.code === code || !other.programs.some(program => (mine.get(program.code) || 0) > 0)) return false;
    const match = input.matches.get(other.code);
    if (!match || !match.courseIds.length || !(match.status === "matched" || match.status === "linked")) return false;
    const sections = sectionsOf(input.rows, new Set(match.courseIds), input.colleges);
    return sections.length > 0 && sections.every(item => sectionsClash(section, item));
  });
  const blocking = blockingFor(input.candidateSection);
  const model = input.model || "upper";
  /* حجم دفعة كل برنامج: أكبر مقررٍ فيه (من يأخذه الجميع). */
  const cohort = new Map<string, number>();
  for (const item of report.courses) for (const program of item.programs) cohort.set(program.code, Math.max(cohort.get(program.code) || 0, side(program)));
  const countIn = (other: DemandCourse, program: string) => side(other.programs.find(item => item.code === program) || ZERO);
  /** كم من طلبة برنامجٍ يحتاجون هذا المقرر ويحجبهم أحدُ هذه المقررات المحجوبة. */
  const blockedIn = (program: string, count: number, list: readonly DemandCourse[]) => {
    if (model === "upper") return Math.min(count, Math.max(0, ...list.map(other => countIn(other, program))));
    const size = Math.max(cohort.get(program) || 0, count, 1);
    const free = list.reduce((acc, other) => acc * (1 - Math.min(1, countIn(other, program) / size)), 1);
    return Math.min(count, Math.round(count * (1 - free)));
  };
  /* من لا شعبة له في المقرر كله: لكل برنامج، المحجوبون عن كل شعبةٍ معاً (الأدنى بين الشعب). بلا شعبة: الحاجةُ كلها. */
  const unservedBy = (sections: ClashRow[][]) => {
    if (!sections.length) return need;
    let total = 0;
    for (const [program, count] of mine) {
      if (count <= 0) continue;
      total += Math.min(...sections.map(section => blockedIn(program, count, blockingFor(section))));
    }
    return Math.min(need, total);
  };
  const coverage = input.beforeSections && input.afterSections
    ? { before: Math.round(((need - unservedBy(input.beforeSections)) / need) * 100), after: Math.round(((need - unservedBy(input.afterSections)) / need) * 100) }
    : null;
  let blocked = 0;
  for (const [program, count] of mine) {
    if (count <= 0) continue;
    blocked += blockedIn(program, count, blocking);
  }
  blocked = Math.min(need, blocked);
  /* ما يحجبه كلُّ مقررٍ وحده، بالتقدير نفسه — فالشرائح تروي ما رُسم في النسبة. */
  const clashes = blocking.map(other => ({
    code: other.code,
    name: other.name,
    students: other.programs.reduce((sum, program) => sum + (mine.get(program.code) ? blockedIn(program.code, mine.get(program.code)!, [other]) : 0), 0),
  })).filter(item => item.students > 0).sort((a, b) => b.students - a.students).slice(0, 3);
  return { need, fit: need - blocked, blocked, percent: Math.round(((need - blocked) / need) * 100), clashes, coverage };
}

export function studentFitOf(input: {
  general: DemandReport | null;
  graduates: DemandReport | null;
  matches: ReadonlyMap<string, DemandMatch>;
  members: readonly ClashMember[];
  rows: readonly ClashRow[];
  candidate: ClashRow;
  /** الموعد المعدَّل: يُقرأ الجدول بالجديد مكانه. */
  replaces?: number;
  /** يحسب تغطية المقرر كله قبل الموعد وبعده (للسطر بعد الحفظ)؛ لا يُطلب في قراءة الخانات الكثيرة. */
  withCoverage?: boolean;
}): StudentFit | null {
  if (!input.general && !input.graduates) return null;
  const courseId = Number(input.candidate.AdCourseId);
  const code = [...input.matches.values()].find(match => (match.status === "matched" || match.status === "linked") && match.courseIds.includes(courseId))?.code;
  if (!code) return null;
  const tracked = input.members.some(member => member.track);
  const track: FitTrack = tracked ? (input.members.find(member => member.collegeId === Number(input.candidate.AdCollegeId))?.track || "") : "";
  const colleges = new Set(input.members.filter(member => !tracked || member.track === track).map(member => member.collegeId));
  if (!colleges.size) colleges.add(Number(input.candidate.AdCollegeId));
  const rest = input.rows.filter(row => !input.replaces || Number(row.id) !== Number(input.replaces));
  const sameSection = (row: ClashRow) => Number(row.AdCourseId) === courseId && Number(row.AdCollegeId) === Number(input.candidate.AdCollegeId)
    && String(row.SCode || "").trim() === String(input.candidate.SCode || "").trim();
  const candidateSection = [...rest.filter(sameSection), input.candidate];
  const ids = new Set(input.matches.get(code)!.courseIds);
  const beforeSections = sectionsOf(input.rows, ids, colleges), afterSections = sectionsOf([...rest, input.candidate], ids, colleges);
  const before = beforeSections.length, after = afterSections.length;
  const shared = { code, matches: input.matches, rows: rest, colleges, candidateSection, track,
    ...(input.withCoverage ? { beforeSections, afterSections } : {}) };
  const students = sideFor({ ...shared, report: input.general, model: "independent" });
  const graduates = sideFor({ ...shared, report: input.graduates, model: "upper" });
  if (!students && !graduates) return null;
  return { track, sections: { before, after }, students, graduates };
}

/**
 * «الوقت الذهبي للطلبة»: ما يخدم الخريجين ثم الطلبة أكثر يتقدّم على غيره، وداخل كل فئةٍ يبقى الترتيبُ كما هو
 * (الفراغ والتنقّل والتشتّت). ثلاث فئات لا نسبةٌ دقيقة — 85٪ فأكثر، ثم 60٪، ثم الباقي — فلا يقلب فرقُ نقطةٍ ترتيباً حسناً؛
 * وما لا نسبة له (بلا تقرير) يقع في الوسط فلا يتقدّم ولا يتأخر. الفرزُ مستقرٌّ، ولا يمسّ ما بعد `limit`.
 */
export const FIT_BANDS = { good: 85, ok: 60 } as const;
export const fitBand = (percent: number | null | undefined): 0 | 1 | 2 =>
  percent == null ? 1 : percent >= FIT_BANDS.good ? 0 : percent >= FIT_BANDS.ok ? 1 : 2;
export function rankByFitBand<T>(items: readonly T[], percentOf: (item: T) => number | null | undefined, limit = items.length): T[] {
  const head = items.slice(0, limit).map((item, index) => ({ item, index, band: fitBand(percentOf(item)) }));
  head.sort((a, b) => a.band - b.band || a.index - b.index);
  return [...head.map(entry => entry.item), ...items.slice(limit)];
}
