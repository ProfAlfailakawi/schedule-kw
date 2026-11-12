/**
 * ── الطلب الفعلي: تقرير التسجيل «دراسة احصائيات بالمقررات التي يحتاجها الطالب» (SWRDASH) ──
 *
 * يصل من التسجيل لكل قسم كل فصل، PDF وحده. لكل مقرر: رقمه (المادة + المقرر = سبع خانات)،
 * واسمه ووحداته، والشعب المطروحة (بنين/بنات)، ومتوسط الطلبة في الشعبة، وعدد الطلبة الذين
 * يحتاجونه (بنين/بنات/مجموع)، والشعب المقترحة، وتوزيع الطلبة على برامجهم (BA-xxxx).
 * ونسختان: «عام» (وحدات متبقية 1–300) و«خريجون» (وحدات متبقية 1–30).
 *
 * هذا الملف نقيّ: يقرأ عناصر النص بإحداثياتها (من pdfjs على الخادم) ويُرجع التقرير، ثم يطابق
 * المقررات بالكتالوج، ويستخرج التنبيه الأحمر. لا شبكة ولا تخزين هنا.
 *
 * القراءة بالأعمدة لا بالترتيب: الخلايا الفارغة كثيرة (شعبٌ مقترحة بلا رقم، برامج بلا بنات)،
 * فيُحسب لكل رقم عمودُه من ترويسة الصفحة نفسها («مجموع/بنات/بنين»)، ولا يُخمَّن مكانٌ لرقم.
 */
import { arabicMatchKey } from "./arabicText";
import { parseTermName } from "./pdfTermRule";
import { authorityCourseCodeMatches } from "./authorityAcademicCodes";
import { capacityCourseKey } from "./capacityLimits";

export interface DemandTextItem { str: string; x: number; y: number; w: number }

export type DemandVariant = "general" | "graduates";
export const DEMAND_VARIANTS: readonly DemandVariant[] = ["general", "graduates"];
export const DEMAND_VARIANT_LABEL: Record<DemandVariant, string> = { general: "عام", graduates: "خريجون" };

export interface DemandSplit { boys: number; girls: number; total: number }
export interface DemandProgram { code: string; name: string; boys: number; girls: number; total: number }
export interface DemandCourse {
  /** رقم المقرر بسبع خانات (0109105). */
  code: string;
  name: string;
  units: number;
  offered: { boys: number; girls: number };
  average: { boys: number; girls: number };
  students: DemandSplit;
  suggested: DemandSplit;
  programs: DemandProgram[];
}
export interface DemandReport {
  /** «الفصل الدراسي الثاني 2027-2026» كما طُبع. */
  termLabel: string;
  department: string;
  facultyCount: number;
  legalLoad: number;
  courses: DemandCourse[];
  /** ما لم يتّسق حسابياً (المجموع ≠ بنين + بنات…): يُذكر ولا يُرفض به الملف. */
  warnings: string[];
}

const DIGITS = /^\d+$/;
const PROGRAM_CODE = /^[A-Z]{2,4}-\d{3,}$/;
const toNumber = (value: string) => Number(String(value).replace(/[^\d]/g, "")) || 0;
const center = (item: DemandTextItem) => item.x + (item.w || 0) / 2;
const clean = (text: string) => String(text || "").normalize("NFKC").replace(/[‎‏‪-‮]/g, "").replace(/\s+/g, " ").trim();

/** اسمٌ عربيٌّ كما يُطبع بأقواسٍ معكوسة («التصوير)1(») ← «التصوير (1)». */
export function demandName(text: string): string {
  return clean(String(text || "").replace(/[()]/g, ch => (ch === "(" ? ")" : "(")))
    .replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ") ").replace(/\s+/g, " ").trim();
}

/** يجمع العناصر في أسطر بحسب ارتفاعها (تسامحُ ٣ نقاط). */
function linesOf(items: readonly DemandTextItem[]): DemandTextItem[][] {
  const sorted = items.filter(item => clean(item.str)).map(item => ({ ...item, str: clean(item.str) })).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: DemandTextItem[][] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= 3) last.push(item);
    else lines.push([item]);
  }
  return lines.map(line => line.sort((a, b) => a.x - b.x));
}

const SUB_LABEL = /^(مجموع|بنات|بنين)$/;
type NumberColumn =
  | "program.total" | "program.girls" | "program.boys"
  | "suggested.total" | "suggested.girls" | "suggested.boys"
  | "students.total" | "students.girls" | "students.boys"
  | "average.girls" | "average.boys" | "offered.girls" | "offered.boys" | "units";
/** الترويسة تُطبع يساراً ← يميناً بهذا الترتيب (الجدول من اليمين إلى اليسار). */
const SUB_ORDER: NumberColumn[] = [
  "program.total", "program.girls", "program.boys",
  "suggested.total", "suggested.girls", "suggested.boys",
  "students.total", "students.girls", "students.boys",
  "average.girls", "average.boys", "offered.girls", "offered.boys",
];

interface PageColumns { headerY: number; numbers: Array<{ column: NumberColumn; x: number }>; nameFrom: number }

/** أعمدة الصفحة من ترويستها: ثلاثة عشر عنواناً فرعياً ووحدات المقرر. null = صفحةٌ بلا جدول. */
function columnsOf(lines: DemandTextItem[][]): PageColumns | null {
  const row = lines.find(line => line.filter(item => SUB_LABEL.test(item.str)).length >= 9);
  if (!row) return null;
  const labels = lines.filter(line => Math.abs(line[0].y - row[0].y) <= 10)
    .flatMap(line => line.filter(item => SUB_LABEL.test(item.str)))
    .sort((a, b) => center(a) - center(b));
  if (labels.length !== SUB_ORDER.length) return null;
  const numbers = labels.map((item, index) => ({ column: SUB_ORDER[index], x: center(item) }));
  const units = lines.flatMap(line => line).find(item => item.str === "وحدات" && Math.abs(item.y - row[0].y) <= 40);
  const unitsX = units ? center(units) : numbers[numbers.length - 1].x + 33;
  numbers.push({ column: "units", x: unitsX });
  return { headerY: Math.max(...labels.map(item => item.y)), numbers, nameFrom: unitsX + 12 };
}

function nearestColumn(columns: PageColumns, item: DemandTextItem): NumberColumn | null {
  let best: { column: NumberColumn; distance: number } | null = null;
  for (const column of columns.numbers) {
    const distance = Math.abs(center(item) - column.x);
    if (!best || distance < best.distance) best = { column: column.column, distance };
  }
  return best && best.distance <= 14 ? best.column : null;
}

export class DemandReportError extends Error {}

/**
 * يقرأ التقرير من عناصر نص صفحاته. يرفض ما ليس SWRDASH أو ما لا جدول فيه.
 * التقرير لقسمٍ واحد؛ وإن حمل الملفُّ أكثر من قسم أُخذ الأول وذُكر الباقي تحذيراً.
 */
export function parseDemandReport(pages: readonly (readonly DemandTextItem[])[]): DemandReport {
  const all = pages.flat();
  if (!all.some(item => /SWRDASH/i.test(item.str)) && !all.some(item => /المقررات التي يحتاجها الطالب/.test(clean(item.str))))
    throw new DemandReportError("هذا ليس تقرير «المقررات التي يحتاجها الطالب» (SWRDASH).");
  const report: DemandReport = { termLabel: "", department: "", facultyCount: 0, legalLoad: 0, courses: [], warnings: [] };
  const departments: string[] = [];
  let course: DemandCourse | null = null;
  let lastProgram: DemandProgram | null = null;
  let skipping = false;
  for (const page of pages) {
    const lines = linesOf(page);
    const columns = columnsOf(lines);
    for (const line of lines) {
      const text = line.map(item => item.str).join(" ");
      if (!report.termLabel && /الفصل الدراسي/.test(text)) report.termLabel = clean(line.filter(item => /الفصل|\d{4}/.test(item.str)).map(item => item.str).join(" "));
      if (/عدد اعضاء هيئة التدريس|عدد أعضاء هيئة التدريس/.test(text)) {
        const name = clean(line.filter(item => !DIGITS.test(item.str) && !/عدد اعضاء|عدد أعضاء|النصاب/.test(item.str)).sort((a, b) => b.x - a.x).map(item => item.str).join(" "));
        const counts = line.filter(item => DIGITS.test(item.str)).sort((a, b) => b.x - a.x).map(item => toNumber(item.str));
        departments.push(name);
        skipping = departments.length > 1;
        if (!skipping) { report.department = name; report.facultyCount = counts[0] || 0; report.legalLoad = counts[1] || 0; }
        continue;
      }
      if (!columns || skipping || line[0].y >= columns.headerY - 3) continue;
      const right = line.filter(item => item.x >= columns.nameFrom);
      const subject = right.find(item => /^\d{4}$/.test(item.str));
      const number = right.filter(item => /^\d{2,3}$/.test(item.str)).sort((a, b) => b.x - a.x)[0];
      const codeItem = line.find(item => PROGRAM_CODE.test(item.str));
      if (subject && number) {
        course = {
          code: `${subject.str}${number.str.padStart(3, "0")}`,
          name: demandName(right.filter(item => !DIGITS.test(item.str)).sort((a, b) => b.x - a.x).map(item => item.str).join(" ")),
          units: 0, offered: { boys: 0, girls: 0 }, average: { boys: 0, girls: 0 },
          students: { boys: 0, girls: 0, total: 0 }, suggested: { boys: 0, girls: 0, total: 0 }, programs: [],
        };
        report.courses.push(course);
        lastProgram = null;
        for (const item of line.filter(entry => DIGITS.test(entry.str) && entry.x < columns.nameFrom)) {
          const column = nearestColumn(columns, item);
          if (!column || column.startsWith("program.")) continue;
          const value = toNumber(item.str);
          if (column === "units") course.units = value;
          else { const [group, key] = column.split(".") as [string, string]; (course as any)[group][key] = value; }
        }
      }
      if (codeItem && course) {
        const program: DemandProgram = {
          code: codeItem.str,
          name: demandName(line.filter(item => item.x < codeItem.x && !DIGITS.test(item.str)).sort((a, b) => b.x - a.x).map(item => item.str).join(" ")),
          boys: 0, girls: 0, total: 0,
        };
        for (const item of line.filter(entry => DIGITS.test(entry.str))) {
          const column = nearestColumn(columns, item);
          if (column?.startsWith("program.")) (program as any)[column.slice(8)] = toNumber(item.str);
        }
        course.programs.push(program);
        lastProgram = program;
        continue;
      }
      if (!subject && !codeItem && course && line.every(item => !DIGITS.test(item.str))) {
        /* اسمٌ طويل انكسر إلى سطرٍ ثانٍ: يُلحق بصاحبه بحسب عموده. */
        const tail = demandName(line.sort((a, b) => b.x - a.x).map(item => item.str).join(" "));
        if (line[0].x >= columns.nameFrom - 20) course.name = `${course.name} ${tail}`.trim();
        else if (lastProgram) lastProgram.name = `${lastProgram.name} ${tail}`.trim();
      }
    }
  }
  if (!report.courses.length) throw new DemandReportError("لم يُقرأ أي مقرر من الملف.");
  if (departments.length > 1) report.warnings.push(`الملف يحمل ${departments.length} أقسام؛ قُرئ الأول وحده (${departments[0]}).`);
  for (const item of report.courses) {
    const { boys, girls, total } = item.students;
    if (boys + girls !== total) report.warnings.push(`${item.code}: المجموع ${total} لا يساوي البنين والبنات.`);
    const sum = item.programs.reduce((acc, program) => acc + program.total, 0);
    if (item.programs.length && sum !== total) report.warnings.push(`${item.code}: البرامج ${sum} لا تساوي المجموع ${total}.`);
  }
  return report;
}

/** النسخة من اسم الملف: «من 1 ل 30» خريجون، وغيره عام. */
export function guessDemandVariant(fileName: string): DemandVariant {
  const text = clean(fileName).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return /(?:^|\D)1\s*(?:ل|الى|إلى|-)\s*30(?!\d)/.test(text) || /خريج/.test(text) ? "graduates" : "general";
}

/** هل فصل التقرير هو الفصل المختار؟ null = لا يُعرف (اسمٌ لا يُقرأ). */
export function demandTermMatches(reportTerm: string, systemTermName: string): boolean | null {
  const a = parseTermName(reportTerm), b = parseTermName(systemTermName);
  if (!a || !b) return null;
  const years = (list: number[]) => [...new Set(list)].sort().join("-");
  return a.season === b.season && years(a.years) === years(b.years);
}

/** هل قسم التقرير هو عائلة القسم المفتوح؟ */
export function demandDepartmentMatches(reportDepartment: string, familyKey: string): boolean {
  const key = (value: string) => arabicMatchKey(value).replace(/^قسم\s+/, "").replace(/\s+/g, "");
  return Boolean(familyKey) && key(reportDepartment) === key(familyKey);
}

/* ── المطابقة بالكتالوج ─────────────────────────────────────────────────── */

export interface DemandCatalogueCourse { AdCourseId: number; AdSectionId: number; AdCollegeId: number; CourseCode: string; CourseName: string; MaxStudent?: number; CourseTeachingMode?: string }
export interface DemandMember { collegeId: number; sectionId: number; departmentKey: string }
export type DemandLink = { courseCode: string; by?: string; at?: string } | { ignore: true; by?: string; at?: string };
export type DemandMatchStatus = "matched" | "linked" | "ignored" | "unmatched";
export interface DemandMatch { code: string; status: DemandMatchStatus; courseIds: number[] }

/**
 * لكل مقرر في التقرير: نسخُه في كتالوج كل عضوٍ من العائلة (بنين وبنات في كل كلية).
 * الرقم وحده هوية (لا يُطابَق بالاسم)؛ والربطُ الذي حفظه المستخدم يُقرأ لما لم يُطابَق.
 */
export function matchDemandCourses(
  courses: readonly Pick<DemandCourse, "code">[],
  catalogue: readonly DemandCatalogueCourse[],
  members: readonly DemandMember[],
  links: Readonly<Record<string, DemandLink>> = {},
): DemandMatch[] {
  const memberIds = new Set(members.map(member => Number(member.sectionId)));
  const own = catalogue.filter(course => memberIds.has(Number(course.AdSectionId)));
  return courses.map(({ code }) => {
    const link = links[code];
    if (link && "ignore" in link) return { code, status: "ignored" as const, courseIds: [] };
    const ids: number[] = [];
    for (const member of members) {
      const rows = own.filter(course => Number(course.AdSectionId) === Number(member.sectionId) && authorityCourseCodeMatches(code, course.CourseCode, member.departmentKey));
      if (rows.length === 1) ids.push(Number(rows[0].AdCourseId));
    }
    if (ids.length) return { code, status: "matched" as const, courseIds: ids };
    if (link && "courseCode" in link) {
      const key = capacityCourseKey(link.courseCode);
      const linked = own.filter(course => capacityCourseKey(course.CourseCode) === key).map(course => Number(course.AdCourseId));
      if (linked.length) return { code, status: "linked" as const, courseIds: linked };
    }
    return { code, status: "unmatched" as const, courseIds: [] };
  });
}

/* ── التنبيه الأحمر: طلبٌ كبير بلا شعبة ─────────────────────────────────── */

/** أقلّ عددٍ يُعدّ «طلباً كبيراً»: الحدّ الأدنى لشعبة نظرية في م.8 — ما يكفي لفتح شعبة. */
export const DEMAND_ALERT_MIN_STUDENTS = 20;

export interface DemandAlert { code: string; name: string; students: number; boys: number; girls: number; graduates: number; courseIds: number[] }

/**
 * المقررات التي يحتاجها عددٌ يكفي لشعبة ولا شعبة لها: في جدولنا إن طوبق المقرر،
 * وفي التقرير نفسه إن لم يُطابَق. مرتبةٌ بالأشدّ (الخريجون أولاً، ثم عدد الطلبة).
 */
export function demandAlerts(input: {
  general: DemandReport | null;
  graduates: DemandReport | null;
  matches: ReadonlyMap<string, DemandMatch>;
  /** عدد الشعب المطروحة في جدولنا لكل AdCourseId (الفصل نفسه، العائلة كلها). */
  scheduledSections: ReadonlyMap<number, number>;
  minStudents?: number;
}): DemandAlert[] {
  const min = input.minStudents ?? DEMAND_ALERT_MIN_STUDENTS;
  const grads = new Map((input.graduates?.courses || []).map(course => [course.code, course.students.total] as const));
  const base = input.general || input.graduates;
  if (!base) return [];
  const out: DemandAlert[] = [];
  for (const course of base.courses) {
    const match = input.matches.get(course.code);
    if (match?.status === "ignored") continue;
    const students = course.students.total;
    const graduates = grads.get(course.code) || 0;
    if (students < min && graduates <= 0) continue;
    const offered = match && match.courseIds.length
      ? match.courseIds.reduce((sum, id) => sum + (input.scheduledSections.get(id) || 0), 0)
      : course.offered.boys + course.offered.girls;
    if (offered > 0) continue;
    out.push({ code: course.code, name: course.name, students, boys: course.students.boys, girls: course.students.girls, graduates, courseIds: match?.courseIds || [] });
  }
  return out.sort((a, b) => (b.graduates > 0 ? 1 : 0) - (a.graduates > 0 ? 1 : 0) || b.graduates - a.graduates || b.students - a.students);
}

export const demandStudents = (report: DemandReport | null | undefined) => (report?.courses || []).reduce((sum, course) => sum + course.students.total, 0);
