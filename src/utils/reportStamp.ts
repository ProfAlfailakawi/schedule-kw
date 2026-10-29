/**
 * ── ختمُ الورقة: من أيِّ نسخةٍ من الجدول طُبعت ──────────────────────────────
 *
 * الورقةُ الرسمية (الشامل وتقرير التغييرات) تحمل في ذيلها رمز QR صغيراً.
 * من يمسكها بعد أسبوع أو شهر يمسحه، فيعرف: هل ما زالت مطابقةً للجدول الآن،
 * أم تغيّر بعدها موعدٌ أو قاعةٌ أو مدرس — وأيُّ سطرٍ منها بالذات.
 *
 * الرمزُ مشتقٌّ من مضمون الورقة نفسه لا من لحظة طباعتها: الصفوفُ نفسها تعطي
 * الرمزَ نفسه، فنسختان من الجدول نفسه تحملان ختماً واحداً، وأيُّ تعديلٍ قبل
 * الطباعة يعطي ختماً آخر. ولذلك يُحسب في المتصفح لحظةَ الأمر بلا انتظار —
 * أمرُ الطباعة لا يحتمل قراءةً شبكية قبله — ثم يُسجَّل في الخادم بعده.
 *
 * والملفُّ نفسه يعمل في المتصفح وفي الخادم: البصمةُ تُحسب بالدالة ذاتها في
 * الطرفين، فلا تختلف ورقةٌ عن سجلّها بفرق كتابة.
 *
 * ليست تعمية ولا تدّعي ذلك: هي ما يجعل ورقةً في ملفٍّ قابلةً للمطابقة مع
 * الجدول الحيّ، بدل أن تكون ورقةً تشبه غيرها.
 */
import type { AdCourse, FSchedule } from "../types";

export type ReportStampKind = "comprehensive" | "comprehensive-branch" | "authority-pdf";

export const REPORT_STAMP_KIND_LABEL: Record<ReportStampKind, string> = {
  comprehensive: "تقرير القسم العلمي الشامل",
  "comprehensive-branch": "تقرير القسم العلمي الشامل — كل الفروع",
  "authority-pdf": "تقرير تغييرات الجدول",
};

export interface ReportStampSite { collegeId: number; sectionId: number }

/** ما يرسله المتصفح بعد الطباعة: الرمز، وما طُبع، وبصمة كل صف كما رآه. */
export interface ReportStampClaim {
  code: string;
  kind: ReportStampKind;
  termId: number;
  sites: ReportStampSite[];
  /** في تقرير التغييرات: نسخةُ ملف الهيئة التي قورن بها كل موقع. */
  draftIds: string[];
  /** الورقة تضم كل مواعيد نطاقها (لا مرشّح يضيّقها)، فالموعد الجديد بعدها نقصٌ فيها. */
  wholeScope: boolean;
  rows: Array<{ id: number; h: string }>;
}

/** السجلّ في الخادم: ما كانت عليه صفوف الورقة ساعةَ طباعتها الأولى، بحقولها. */
export interface ReportStampRecord {
  code: string;
  kind: ReportStampKind;
  termId: number;
  sites: ReportStampSite[];
  draftIds: string[];
  wholeScope: boolean;
  /** `s`: قسم الصف (لرقم المقرر السباعي في صفحة التحقق)، `v`: قيم الحقول بترتيب STAMP_FIELDS. */
  rows: Array<{ id: number; s: number; v: string[] }>;
  /** صفوفٌ اختلف ما على الورقة منها عمّا في النظام ساعةَ الطباعة: شاشةٌ لم تُحدَّث. */
  staleRowIds: number[];
  firstPrintedAt: string;
  lastPrintedAt: string;
  printCount: number;
}

/**
 * ما يُقارَن من كل صف، بالترتيب المخزَّن. حقولٌ مطبوعة في الورقتين معاً؛
 * والرقم المرجعي ليس منها: هو من ملف الهيئة لا من الصف، ويحرسه `draftIds`.
 */
export const STAMP_FIELDS = [
  { key: "course", label: "رقم المقرر" },
  { key: "name", label: "اسم المقرر" },
  { key: "section", label: "الشعبة" },
  { key: "facts", label: "الوحدات والساعات والسعة" },
  { key: "instructor", label: "المدرس" },
  { key: "days", label: "الأيام" },
  { key: "time", label: "الوقت" },
  { key: "place", label: "المبنى والقاعة" },
] as const;

/** أقصى صفوفٍ يحملها ختمٌ واحد؛ ما زاد يُطبع بلا ختم، ولا يُثقل السجلّ. */
export const REPORT_STAMP_MAX_ROWS = 3000;

const text = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const number = (value: unknown) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "" : String(Number(value)));
const clock = (value: unknown) => {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : text(value);
};

type StampCourse = Pick<AdCourse, "CourseCode" | "CourseName"> & { CourseCredit?: unknown; CourseHours?: unknown; MaxStudent?: unknown };

/** قيم الصف كما تُقرأ في الورقة، بترتيب STAMP_FIELDS. */
export function stampRowValues(row: FSchedule, course?: StampCourse | null): string[] {
  return [
    /* الرمزان معاً: الشامل يطبع رمز الموعد المحفوظ قبل رمز الكتالوج، وتقرير التغييرات بالعكس. */
    `${Number(row.AdCourseId) || 0}|${text(course?.CourseCode)}|${text(row.CourseCodeSnapshot)}`,
    text(row.CourseNameSnapshot || row.AdCourseName || course?.CourseName),
    text(row.SCode),
    `${number(course?.CourseCredit)}|${number(course?.CourseHours)}|${number(course?.MaxStudent)}`,
    String(Number(row.AdInstructorId) || 0),
    [row.fsunday, row.fmonday, row.ftuesday, row.fwednesday, row.fthursday].map(day => (day ? "1" : "0")).join(""),
    `${clock(row.fstarttime)}-${clock(row.fendtime)}`,
    `${text(row.AdRoomCode)}/${text(row.AdRoomHall)}`,
  ];
}

/**
 * cyrb53: تجزئةٌ بثلاثةٍ وخمسين بتاً، ثابتةٌ في المتصفح والخادم معاً. لكشف
 * التغيير لا للتعمية.
 */
function hash53(source: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charCodeAt(index);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const stampRowHash = (id: number, values: string[]): string => hash53(`v1|${Number(id)}|${values.join("\u001f")}`).toString(36);

/** أبجدية Crockford: لا I ولا L ولا O ولا U، فلا يُخلط حرفٌ برقم عند الكتابة باليد. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const sortedSites = (sites: ReportStampSite[]): ReportStampSite[] => {
  const seen = new Set<string>();
  return sites
    .map(site => ({ collegeId: Number(site.collegeId) || 0, sectionId: Number(site.sectionId) || 0 }))
    .filter(site => {
      const key = `${site.collegeId}:${site.sectionId}`;
      if (!site.collegeId || !site.sectionId || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.collegeId - b.collegeId || a.sectionId - b.sectionId);
};

/** ثمانية محارف من أربعين بتاً مشتقة من نوع الورقة ونطاقها وبصمات صفوفها. */
export function reportStampCode(input: Pick<ReportStampClaim, "kind" | "termId" | "sites" | "draftIds" | "wholeScope" | "rows">): string {
  const rows = [...input.rows].sort((a, b) => a.id - b.id).map(row => `${row.id}:${row.h}`).join(",");
  const sites = sortedSites(input.sites).map(site => `${site.collegeId}:${site.sectionId}`).join(",");
  const drafts = [...input.draftIds].map(String).sort().join(",");
  let rest = hash53(`v1|${input.kind}|${Number(input.termId) || 0}|${sites}|${drafts}|${input.wholeScope ? 1 : 0}|${rows}`) % 1099511627776;
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code = CROCKFORD[rest % 32] + code;
    rest = Math.floor(rest / 32);
  }
  return code;
}

/** يقبل الرمز كما يُكتب باليد: صغيراً، بشرطة أو بلا، و O مكان 0 و I/L مكان 1. */
export function normalizeReportStampCode(value: unknown): string {
  const code = String(value ?? "").toUpperCase().replace(/[\s\-·.]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code) ? code : "";
}

export const formatReportStampCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * رابط الختم كما يُرسم في QR. بالأحرف الكبيرة حين يسمح الأصل بذلك: وضعُ
 * «الحروف والأرقام» في QR أكثف من وضع البايت، فيخرج الرمز بمربعاتٍ أكبر في
 * المساحة نفسها، فيُمسح من ورقةٍ مطبوعة بسهولة. المسار لا يفرّق بين الحالتين.
 */
export function reportStampUrl(origin: string, code: string): string {
  const url = `${String(origin || "").replace(/\/+$/, "")}/v/${code}`;
  const upper = url.toUpperCase();
  return /^[0-9A-Z $%*+\-./:]+$/.test(upper) ? upper : url;
}

/** يبني الختم من الصفوف التي ستُطبع فعلاً. يعيد null حين لا يصلح للورقة ختم. */
export function buildReportStamp(input: {
  kind: ReportStampKind;
  termId: number;
  sites: ReportStampSite[];
  draftIds?: string[];
  wholeScope: boolean;
  rows: FSchedule[];
  courseById: Map<number, StampCourse>;
}): ReportStampClaim | null {
  const sites = sortedSites(input.sites);
  const termId = Number(input.termId) || 0;
  if (!termId || !sites.length || !input.rows.length || input.rows.length > REPORT_STAMP_MAX_ROWS) return null;
  const seen = new Set<number>();
  const rows: ReportStampClaim["rows"] = [];
  for (const row of input.rows) {
    const id = Number(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, h: stampRowHash(id, stampRowValues(row, input.courseById.get(Number(row.AdCourseId)))) });
  }
  if (!rows.length) return null;
  const draftIds = [...new Set((input.draftIds || []).map(String).filter(Boolean))].sort();
  const claim = { kind: input.kind, termId, sites, draftIds, wholeScope: input.wholeScope, rows };
  return { code: reportStampCode(claim), ...claim };
}

export interface ReportStampComparison {
  /** صفوفٌ في الورقة تغيّر منها شيء بعد طباعتها (أو قبلها من شاشةٍ لم تُحدَّث). */
  changed: Array<{ id: number; sectionId: number; values: string[]; fields: string[]; beforePrint: boolean }>;
  /** صفوفٌ في الورقة لم تعد في الجدول. */
  removed: Array<{ id: number; sectionId: number; values: string[] }>;
  /** مواعيد جديدة في نطاق ورقةٍ كاملة لم تكن فيها. */
  added: Array<{ id: number; sectionId: number; values: string[] }>;
}

/** يقارن صفوف الورقة بالجدول الآن، حقلاً حقلاً. */
export function compareReportStamp(
  record: Pick<ReportStampRecord, "rows" | "staleRowIds" | "wholeScope">,
  currentRows: FSchedule[],
  courseById: Map<number, StampCourse>,
): ReportStampComparison {
  const current = new Map(currentRows.map(row => [Number(row.id), row] as const));
  const stale = new Set((record.staleRowIds || []).map(Number));
  const printed = new Set<number>();
  const result: ReportStampComparison = { changed: [], removed: [], added: [] };
  for (const saved of record.rows) {
    printed.add(Number(saved.id));
    const row = current.get(Number(saved.id));
    if (!row) { result.removed.push({ id: saved.id, sectionId: saved.s, values: saved.v }); continue; }
    const now = stampRowValues(row, courseById.get(Number(row.AdCourseId)));
    const fields = STAMP_FIELDS.filter((_, index) => now[index] !== saved.v[index]).map(field => field.label);
    if (fields.length || stale.has(Number(saved.id))) {
      result.changed.push({ id: saved.id, sectionId: Number(row.AdSectionId) || saved.s, values: now, fields, beforePrint: stale.has(Number(saved.id)) });
    }
  }
  if (record.wholeScope) {
    for (const row of currentRows) {
      if (printed.has(Number(row.id))) continue;
      result.added.push({ id: Number(row.id), sectionId: Number(row.AdSectionId) || 0, values: stampRowValues(row, courseById.get(Number(row.AdCourseId))) });
    }
  }
  return result;
}
