/**
 * ── «الطلب الفعلي» في التجربة: تقريرٌ محفوظ بالنسختين، من مقررات الديمو ومواعيده ──────────
 *
 * «تخطيط الشعب» و«نبض الطلبة» داخل الموعد يقرآن تقرير الطلب الفعلي المرفوع من Excel (عامّ + خريجون)،
 * وفي التجربة لا تقرير مرفوع فكانت الشاشتان فارغتين. هنا يُبذر التقريران (src/server/actualDemand.ts: storeDemandVariant)
 * لعائلة قسم القصة في فصلها، **مشتقَّين من جدول الصندوق نفسه**: مقرراتُه وسعاتُه وشعبُه ومواعيدُه — فكلُّ رقمٍ يطابق صفاً حقيقياً.
 *
 * ما يُبنى، بالترتيب الثابت (بلا عشوائية، فكلُّ زائرٍ يرى الأرقام نفسها):
 *   • خريجون بلا مقعد: مقررٌ بشعبةٍ واحدة يزيد خريجوه على مقاعدها (سعة × شعب).
 *   • عجز: مقرران أو أكثر يحتاجان شعبتين إضافيتين؛ وفائض: مقرران بشعبٍ أكثر مما يلزم؛ ومتوازن: ثلاثة مقررات.
 *   • نبض الطلبة: زوجٌ من المقررات (شعبةٌ واحدة لكلٍّ) يتداخل موعداهما ويحتاجهما خريجو البرنامج نفسه — فالنبض أحمر باسم المقرر
 *     المتعارض وعدد الخريجين؛ وزوجٌ آخر يتشاركان جزءاً يسيراً من الطلبة فالنبض متوسط؛ وما سواهما يناسب أكثر الطلبة (أخضر).
 *     البرامجُ تُوزَّع على المقررات بتلوين تداخل المواعيد، فلا يتعارض بالصدفة إلا ما صُمّم له.
 *
 * يُبذر داخل صندوق الزائر وحده (Repository.isDemoRequest) ولا يلمس بيانات الجامعة. الأرقامُ كلُّها وهمية.
 */
import { createHash } from "crypto";
import { Repository } from "../db/repository";
import type { AdCourse, FSchedule } from "../types";
import { demandFamilyFor, readStoredDemand, storeDemandVariant } from "./actualDemand";
import { DEMO_STORY_SCOPE } from "./core/demo";
import { sectionsClash, type ClashRow } from "../utils/actualDemandGraduates";
import type { DemandCourse, DemandProgram, DemandReport } from "../utils/actualDemand";

/** البرامج (BA-xxxx) كما تطبعها التقارير: الأول للقسم، والبقية مساراتٌ فيه. */
export const DEMO_DEMAND_PROGRAMS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "BA-0115", name: "تكنولوجيا التعليم" },
  { code: "BA-0136", name: "تكنولوجيا التعليم - مسار التصميم التعليمي" },
  { code: "BA-0124", name: "تكنولوجيا التعليم - مسار الوسائط التعليمية" },
  { code: "BA-0140", name: "تكنولوجيا التعليم - مسار التعلم الإلكتروني" },
  { code: "BA-0152", name: "تكنولوجيا التعليم - مسار الحاسوب التعليمي" },
];
const [P_MAIN, P_DESIGN, P_MEDIA, P_ELEARN, P_COMPUTER] = DEMO_DEMAND_PROGRAMS.map(item => item.code);
export const DEMO_DEMAND_UPLOADED_BY = "رئيس لجنة الجدول (عرض تجريبي)";
const DEFAULT_CAP = 60;
const MIN_REPORTED_CAP = 12;

export type DemoDemandRole = "gradShort" | "deficit" | "surplus" | "balanced" | "light";
export interface DemoDemandInput {
  termName: string;
  department: string;
  courses: ReadonlyArray<Pick<AdCourse, "AdCourseId" | "CourseCode" | "CourseName" | "CourseCredit" | "MaxStudent">>;
  rows: ReadonlyArray<ClashRow & { AdInstructorId?: number }>;
}
export interface DemoDemandStory {
  gradShort: string;
  deficit: string[];
  surplus: string[];
  balanced: string[];
  /** المتعارضان بخريجيهما: نبضُهما أحمر. */
  clash: [string, string] | null;
  /** المتعارضان جزئياً: نبضُهما متوسط. */
  mild: [string, string] | null;
}

interface Item {
  course: Pick<AdCourse, "AdCourseId" | "CourseCode" | "CourseName" | "CourseCredit" | "MaxStudent">;
  code: string; sections: number; cap: number; seats: number; single: ClashRow[] | null;
  role: DemoDemandRole;
  students: number; graduates: number;
  /** اسمُ البرنامج ← حصّته من الطلبة (الحصص مجموعها 1). */
  programs: Array<[string, number]>;
  gradPrograms: Array<[string, number]> | null;
}

const rowsOfSection = (rows: readonly ClashRow[], courseId: number, code: string) =>
  rows.filter(row => Number(row.AdCourseId) === courseId && String(row.SCode || "").trim() === code);

/** «تقرير الطلب الفعلي» كما يُقرأ من PDF: الفصلُ مقلوبَ السنوات («الفصل الدراسي الأول 2027-2026»). */
export function demoDemandTermLabel(termName: string): string {
  const season = /الصيف/.test(termName) ? "الصيفي" : /الثاني/.test(termName) ? "الثاني" : "الأول";
  const years = termName.match(/(\d{4})\s*[/-]\s*(\d{4})/);
  return years ? `الفصل الدراسي ${season} ${years[2]}-${years[1]}` : termName;
}

/** يوزّع عدداً على حصصٍ بالأعداد الصحيحة، وآخرُ برنامجٍ يأخذ الباقي: المجموع محفوظ. */
function splitBy(total: number, shares: ReadonlyArray<[string, number]>): Array<[string, number]> {
  let left = total;
  return shares.map(([code, share], at) => {
    const count = at === shares.length - 1 ? left : Math.min(left, Math.round(total * share));
    left -= count;
    return [code, count] as [string, number];
  }).filter(([, count]) => count > 0);
}
/** بناتٌ أكثر من البنين في تخصصٍ تربوي، وتتفاوت النسبة بين المقررات بحسب رقم المقرر لا بالصدفة. */
const girlsOf = (code: string, count: number) => Math.min(count, Math.round(count * (0.56 + (Number(code.slice(-1)) % 5) * 0.03)));

/**
 * يبني التقريرين (عام + خريجون) من مقررات القسم ومواعيد فصله. دالةٌ نقيّة: تُختبر بلا شبكة ولا مخزن.
 * لا مقرر مؤهّلاً لدورٍ (لا شعبةٌ واحدة ولا سعةٌ كافية) فالدورُ يُسند لأقرب ما يصلح؛ والقصةُ المرجعة تقول ما أُسند فعلاً.
 */
export function buildDemoDemandReports(input: DemoDemandInput): { general: DemandReport; graduates: DemandReport; story: DemoDemandStory } {
  const offeredIds = new Set(input.rows.map(row => Number(row.AdCourseId)));
  const items: Item[] = input.courses
    /* مقرراتٌ ضيّق الرادارُ مقاعدَها عمداً (١–٥ مقاعد) لا تدخل التقرير: ما فيها من طلبةٍ لا يُصدَّق في تقرير تسجيل. */
    .filter(course => offeredIds.has(Number(course.AdCourseId)) && /^\d{7}$/.test(String(course.CourseCode || "").trim()) && !(Number(course.MaxStudent) > 0 && Number(course.MaxStudent) < MIN_REPORTED_CAP))
    .sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode), "en") || Number(a.AdCourseId) - Number(b.AdCourseId))
    .map(course => {
      const id = Number(course.AdCourseId);
      const codes = [...new Set(input.rows.filter(row => Number(row.AdCourseId) === id).map(row => String(row.SCode || "").trim()))];
      const cap = Number(course.MaxStudent) > 0 ? Math.round(Number(course.MaxStudent)) : DEFAULT_CAP;
      return {
        course, code: String(course.CourseCode).trim(), sections: codes.length, cap, seats: codes.length * cap,
        single: codes.length === 1 ? rowsOfSection(input.rows, id, codes[0]) : null,
        role: "light" as DemoDemandRole, students: 0, graduates: 0, programs: [[P_MAIN, 1]] as Array<[string, number]>, gradPrograms: null,
      };
    });
  const take = (count: number, fits: (item: Item) => boolean, fallback: (item: Item) => boolean = () => true): Item[] => {
    const free = (item: Item) => item.role === "light" && !reserved.has(item.code);
    const picked = items.filter(item => free(item) && fits(item)).slice(0, count);
    if (picked.length < count) picked.push(...items.filter(item => free(item) && !picked.includes(item) && fallback(item)).slice(0, count - picked.length));
    for (const item of picked) reserved.add(item.code);
    return picked;
  };
  const reserved = new Set<string>();

  /* ── زوجا التداخل: مقرران بشعبةٍ واحدة لكلٍّ ومواعيدُهما متداخلة (يُحجزان قبل الأدوار) ── */
  const singles = items.filter(item => item.single && item.cap >= 20);
  const overlapping = (a: Item, b: Item) => Boolean(a.single && b.single && sectionsClash(a.single, b.single));
  const pairAfter = (skip: ReadonlySet<string>): [Item, Item] | null => {
    for (let i = 0; i < singles.length; i += 1) for (let j = i + 1; j < singles.length; j += 1) {
      if (skip.has(singles[i].code) || skip.has(singles[j].code) || !overlapping(singles[i], singles[j])) continue;
      return [singles[i], singles[j]];
    }
    return null;
  };
  const clash = pairAfter(new Set());
  if (clash) clash.forEach(item => reserved.add(item.code));
  const mild = pairAfter(reserved);
  if (mild) mild.forEach(item => reserved.add(item.code));

  /* ── الأدوار ── */
  /* أرقامٌ معتدلة: سعةُ الشعبة بين ٢٥ و٤٥ أولاً (٣٠ مقعداً مثلاً)، فلا يُقال إن ٨٥ خريجاً يحتاجون مقرراً واحداً. */
  const normal = (item: Item) => item.cap >= 25;
  const moderate = (item: Item) => item.cap >= 25 && item.cap <= 45 && item.sections === 1;
  const [gradShort] = take(1, moderate, item => normal(item) && item.sections === 1);
  const deficit = take(2, moderate, item => normal(item) && item.sections === 1);
  const surplus = take(2, item => item.sections >= 2 && item.cap >= 12, item => item.sections >= 2);
  const balanced = take(3, item => item.cap >= 20, () => true);
  if (gradShort) gradShort.role = "gradShort";
  deficit.forEach(item => { item.role = "deficit"; });
  surplus.forEach(item => { item.role = "surplus"; });
  balanced.forEach(item => { item.role = "balanced"; });

  for (const item of items) {
    const { cap, seats, sections } = item;
    switch (item.role) {
      case "gradShort": item.graduates = cap + Math.ceil(cap * 0.3); item.students = item.graduates + Math.ceil(cap * 0.45); break;
      case "deficit": item.students = seats + cap + Math.ceil(cap * 0.4); break;
      case "surplus": item.students = Math.max(2, Math.floor(seats * 0.35)); break;
      case "balanced": item.students = Math.max(1, seats - Math.max(1, Math.ceil(cap * 0.1))); break;
      default: item.students = Math.max(1, Math.round(seats * (sections > 1 ? 0.62 : 0.7)));
    }
  }
  /* خريجو التداخل الأحمر: A يحتاجه جميع خريجيه من البرنامج الرئيس، و B يشاركه فيه 70٪ من مقدار A وله برنامجٌ آخر. */
  if (clash) {
    const [a, b] = clash;
    a.students = Math.max(a.students, Math.round(a.cap * 0.9)); b.students = Math.max(b.students, Math.round(b.cap * 0.8));
    a.graduates = Math.max(6, Math.round(a.students * 0.4));
    const shared = Math.max(4, Math.round(a.graduates * 0.7));
    b.graduates = Math.min(b.students, shared + Math.max(3, Math.round(a.graduates * 0.5)));
    a.programs = [[P_MAIN, 1]]; a.gradPrograms = [[P_MAIN, 1]];
    b.programs = [[P_MAIN, shared / b.graduates], [P_ELEARN, 1 - shared / b.graduates]];
    b.gradPrograms = b.programs;
  }
  /* التداخل المتوسط: C ثلاثة أرباع طلابه يتشاركون معه الدفعة، و D أقل منه بكثير فيحجب ثلثهم. */
  if (mild) {
    const [c, d] = mild;
    c.students = Math.max(c.students, Math.round(c.cap * 0.85)); d.students = Math.max(3, Math.round(c.students * 0.34));
    c.programs = [[P_DESIGN, 1]]; d.programs = [[P_DESIGN, 1]];
  }

  /* ── البرامج: تلوين تداخل مواعيد المقررات ذات الشعبة الواحدة، فلا يشارك برنامجٌ واحد مقرّرين متداخلين إلا ما صُمّم ── */
  const palette = [P_MAIN, P_DESIGN, P_MEDIA, P_COMPUTER];
  const fixed = new Set([...(clash || []), ...(mild || [])].map(item => item.code));
  const colour = new Map<string, string>();
  for (const item of [...(clash || []), ...(mild || [])]) colour.set(item.code, item.programs[0][0]);
  let rotate = 0;
  for (const item of items) {
    if (fixed.has(item.code)) continue;
    const taken = new Map<string, number>();
    for (const other of items) if (other !== item && colour.has(other.code) && overlapping(item, other)) taken.set(colour.get(other.code)!, (taken.get(colour.get(other.code)!) || 0) + 1);
    const free = palette.filter(code => !taken.has(code));
    const choice = free.length ? free[rotate % free.length] : [...palette].sort((x, y) => (taken.get(x) || 0) - (taken.get(y) || 0))[0];
    rotate += 1;
    colour.set(item.code, choice);
    item.programs = [[choice, 1]];
  }

  /* ── الخريجون: من يحتاجه خريجٌ ثلثُ طلابه تقريباً في مقرراتٍ مختارة؛ ولا خريجَ في الفائض ولا في المتوازن الصغير ── */
  const gradIds = new Set<string>();
  for (const item of items) {
    if (item.graduates > 0) { gradIds.add(item.code); continue; }
    if (item.role === "deficit" || (item.role === "balanced" && item.cap >= 25)) { item.graduates = Math.max(2, Math.round(item.students * 0.28)); gradIds.add(item.code); }
  }

  const faculty = new Set(input.rows.map(row => Number(row.AdInstructorId || 0)).filter(Boolean));
  const course = (item: Item, side: "students" | "graduates"): DemandCourse => {
    const total = side === "students" ? item.students : item.graduates;
    const girls = girlsOf(item.code, total), boys = total - girls;
    const shares = (side === "graduates" && item.gradPrograms) || item.programs;
    const programs: DemandProgram[] = splitBy(total, shares).map(([code, count]) => {
      const g = Math.min(count, Math.round(count * girls / Math.max(1, total)));
      return { code, name: DEMO_DEMAND_PROGRAMS.find(program => program.code === code)?.name || code, boys: count - g, girls: g, total: count };
    });
    /* التجزئةُ تُقرّب كلَّ برنامجٍ على حدة: يُصحَّح المجموع بالبرنامج الأول فيتّسق بنون + بنات = الكلّ. */
    const sumBoys = programs.reduce((sum, program) => sum + program.boys, 0), sumGirls = programs.reduce((sum, program) => sum + program.girls, 0);
    if (programs.length) { programs[0].boys += boys - sumBoys; programs[0].girls += girls - sumGirls; }
    const offered = { boys: Math.ceil(item.sections * 0.4), girls: item.sections - Math.ceil(item.sections * 0.4) };
    const average = { boys: offered.boys ? Math.min(item.cap, Math.round(boys / offered.boys)) : 0, girls: offered.girls ? Math.min(item.cap, Math.round(girls / offered.girls)) : 0 };
    return {
      code: item.code, name: String(item.course.CourseName || "").trim(), units: Number(item.course.CourseCredit) || 3, offered, average,
      students: { boys, girls, total },
      suggested: { boys: Math.ceil(boys / item.cap), girls: Math.ceil(girls / item.cap), total: Math.ceil(boys / item.cap) + Math.ceil(girls / item.cap) },
      programs,
    };
  };
  const header = { termLabel: demoDemandTermLabel(input.termName), department: input.department, facultyCount: faculty.size, legalLoad: 12, warnings: [] as string[] };
  const general: DemandReport = { ...header, courses: items.map(item => course(item, "students")) };
  const graduates: DemandReport = { ...header, courses: items.filter(item => gradIds.has(item.code)).map(item => course(item, "graduates")) };
  return {
    general, graduates,
    story: {
      gradShort: gradShort?.code || "",
      deficit: deficit.map(item => item.code), surplus: surplus.map(item => item.code), balanced: balanced.map(item => item.code),
      clash: clash ? [clash[0].code, clash[1].code] : null, mild: mild ? [mild[0].code, mild[1].code] : null,
    },
  };
}

/**
 * يحفظ تقريرَي الطلب الفعلي لعائلة قسم القصة في فصلها. في صندوق الزائر وحده، ولا يكرّر إن وُجد تقريرٌ محفوظ.
 * الوقتُ مشتقٌّ من بدء الفصل لا من الساعة: فلا يتغيّر بين جلسةٍ وأخرى.
 */
export async function seedDemoActualDemand(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const family = await demandFamilyFor(null, collegeId, sectionId);
  if (!family.members.length || await readStoredDemand(termId, family.key)) return;
  const [terms, courses, rows] = await Promise.all([
    Repository.getTerms(),
    Repository.getCourses() as Promise<AdCourse[]>,
    Promise.all(family.members.map(member => Repository.getSchedulesByScope({ collegeId: member.collegeId, sectionId: member.sectionId, termId }))).then(list => list.flat() as FSchedule[]),
  ]);
  const term = (terms as any[]).find(row => Number(row.AdTermId) === termId);
  if (!term || !rows.length) return;
  const memberIds = new Set(family.members.map(member => member.sectionId));
  const built = buildDemoDemandReports({
    termName: String(term.AdTermName || ""), department: family.name,
    courses: courses.filter(row => memberIds.has(Number(row.AdSectionId))), rows,
  });
  const start = Date.parse(`${String(term.AdTermStart || "2026-10-18").slice(0, 10)}T09:00:00Z`);
  for (const [variant, report] of [["general", built.general], ["graduates", built.graduates]] as const) {
    if (!report.courses.length) continue;
    const at = new Date(start - (variant === "general" ? 14 : 13) * 86_400_000).toISOString();
    await storeDemandVariant(termId, family.key, variant, {
      report, uploadedAt: at, uploadedBy: DEMO_DEMAND_UPLOADED_BY, hash: createHash("sha256").update(JSON.stringify(report)).digest("hex"),
    });
  }
}
