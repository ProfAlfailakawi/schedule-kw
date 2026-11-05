/**
 * ── ما ينقص الكتالوج من ملف الهيئة ─────────────────────────────────────────
 *
 * صف من طبقة النص لم يُربط بمقرر في قسم الرأس يقع في واحدة من حالتين: مقرر غير
 * مسجل يُنشأ برقمه واسمه المطبوعين بعد تأكيد المستخدم، أو رقم يوافق صف الكتالوج
 * القصير بذيله وحده فلا يُربط تلقائياً ويُعرض للاختيار (0114324 رياضيات أمام 324
 * تربية فنية). المسح خارج هذا كله: أرقامه قراءة، ولا يُنشأ مقرر من قراءة.
 */
import { academicDigits, authorityCatalogueCourseDigits, authorityForeignCourseKey, authorityPrintedCourseKey } from "./authorityAcademicCodes";

export type GapCourse = { code: string; name: string; rows: number; credit: number; hours: number };
export type GapChoice = GapCourse & { candidates: Array<{ AdCourseId: number; code: string; name: string }> };
export type GapSite = { collegeId: number; siteLabel: string; rows: number };
export type CatalogueGaps = { courses: GapCourse[]; choices: GapChoice[]; sites?: GapSite[] };

type GapRow = { AdCourseId?: unknown; sourceReadMode?: unknown; sourceCourseCode?: unknown; sourceCourseText?: unknown };
type GapCatalogue = { AdCourseId?: unknown; CourseCode?: unknown; CourseName?: unknown; CourseCredit?: unknown; CourseHours?: unknown };

/** الرقم المطبوع لصف لم يُربط، أو فارغ إن لم يثبت (مسح، أو رقم من كلية أخرى). */
export function gapKeyOf(row: GapRow, departmentCode: string): string {
  if (Number(row.AdCourseId || 0) || row.sourceReadMode !== "pdf-text") return "";
  return authorityPrintedCourseKey(row.sourceCourseCode, departmentCode);
}

/**
 * حكم الخادم على صف قيل قبل أن يختار المستخدم مقرره: «المقرر غير صالح» و«الشعبة» (صف
 * بلا مقرر لا شعبة له). يسقطان عن صفوف الربط وحدها، وما عداهما يبقى، ويُعاد الفحص عند الحفظ.
 */
export function withoutLinkedRowIssues<T>(issues: readonly T[], linkedLines: ReadonlySet<number>): T[] {
  return issues.filter(issue => {
    const line = /^السطر (\d+): (?:المقرر غير صالح|شعبة جدول PDF)/.exec(String(issue || ""));
    return !(line && linkedLines.has(Number(line[1])));
  });
}

type NameScore = (printed: string, catalogueName: string) => number;
export const GAP_NAME_MIN = .7;

/**
 * أصل المقرر في الكتالوج كله، بأشكال رقمه الثلاثة: 0114101 و114101 و101. الاسم شرط في
 * كلها، حتى المفتاح الكامل: الرقم لا يكفي وحده. يُقدَّم المفتاح الكامل على الذيل، ثم الأعلى
 * اسماً، ثم الأكثر تكراراً؛ وصف بلا وحدات ليس مصدراً.
 */
export function catalogueOrigin(code: string, printedName: string, templates: readonly GapCatalogue[], nameScore: NameScore): GapCatalogue | undefined {
  const tail = code.slice(-3);
  const scored = templates.flatMap(course => {
    const digits = authorityCatalogueCourseDigits(course.CourseCode);
    const exact = digits === code, short = digits.length <= 3 && digits.padStart(3, "0") === tail;
    if ((!exact && !short) || !(Number(course.CourseCredit) > 0)) return [];
    const score = nameScore(printedName, String(course.CourseName || ""));
    return score >= GAP_NAME_MIN ? [{ course, exact, score }] : [];
  });
  const shape = (item: { course: GapCatalogue }) => `${item.course.CourseCredit}|${item.course.CourseHours}`;
  const votes = new Map<string, number>();
  for (const item of scored) votes.set(shape(item), (votes.get(shape(item)) || 0) + 1);
  return scored.sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || votes.get(shape(b))! - votes.get(shape(a))!)[0]?.course;
}

/** طبقة نص الهيئة تعكس الأقواس في العربية: «طرق تدريس )علوم(». */
export const printedCourseName = (value: unknown) => String(value || "").replace(/\)([^()]*)\(/g, "($1)").replace(/\s+/g, " ").trim();

/**
 * @param courses مقررات قسم الرأس.
 * @param templates الكتالوج كله، كل كلية وفرع: منه الوحدات والساعات والاسم (قرار المالك).
 * الهيئة لا تطبعهما، فما لا مصدر له في الجامعة كلها يبقى صفراً ويراه المستخدم في الملخص.
 */
export function catalogueGaps(rows: readonly GapRow[], courses: readonly GapCatalogue[], departmentCode: string, templates: readonly GapCatalogue[] = [], nameScore: NameScore = () => 0): CatalogueGaps {
  const department = academicDigits(departmentCode);
  const ownTails = new Set(rows.map(row => academicDigits(row.sourceCourseCode))
    .filter(code => code.length === 7 && code.startsWith(department)).map(code => code.slice(-3)));
  const groups = new Map<string, { name: string; rows: number }>();
  for (const row of rows) {
    const code = gapKeyOf(row, department);
    if (!code) continue;
    const group = groups.get(code);
    if (group) group.rows += 1;
    else groups.set(code, { name: printedCourseName(row.sourceCourseText), rows: 1 });
  }
  const gaps: CatalogueGaps = { courses: [], choices: [] };
  for (const [code, group] of groups) {
    const tail = code.slice(-3);
    const origin = catalogueOrigin(code, group.name, templates, nameScore);
    const printed = { code, ...group, name: String(origin?.CourseName || "").trim() || group.name, credit: Number(origin?.CourseCredit) || 0, hours: Number(origin?.CourseHours) || 0 };
    const sameTail = courses.filter(course => {
      const digits = authorityCatalogueCourseDigits(course.CourseCode);
      return digits.length <= 3 ? digits.padStart(3, "0") === tail : digits === `${department}${tail}`;
    });
    /* رأى الملف رقم القسم نفسه بهذا الذيل: فالصف القصير له، و0114464 مقرر آخر يُنشأ. */
    const separate = authorityForeignCourseKey(code, department) && ownTails.has(tail);
    if (sameTail.length && !separate) {
      gaps.choices.push({ ...printed, candidates: sameTail.map(course => ({
        AdCourseId: Number(course.AdCourseId), code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
      })) });
      continue;
    }
    gaps.courses.push(printed);
  }
  return gaps;
}
