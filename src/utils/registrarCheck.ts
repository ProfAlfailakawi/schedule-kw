/**
 * ── فحصُ جدول التسجيل: هل نفّذ ما أرسلناه؟ ───────────────────────────────────
 *
 * يعيد التسجيلُ أحياناً جدولَ القسم بملف PDF جديد ليراجعه القسم. السؤالان:
 *   ١) هل في ما طُبع خللٌ — موعدٌ أو أستاذٌ أو قاعةٌ تخالف جدولنا، أو شعبةٌ
 *      على طرفٍ دون الآخر؟
 *   ٢) هل نُفِّذ ما غيّره القسم بعد آخر إرسال، أم ما زال الملف يعرض القديم؟
 *
 * مقارنةٌ نقيّة بين ثلاث صور: الجدول الحيّ (ما عندنا)، وصفوف الملف المقروءة (ما
 * طبعه التسجيل)، ونسخةُ آخر إرسال (ما رآه التسجيل قبل أن نعدّل). لا كتابةَ ولا
 * شبكةَ ولا مسّ بالجدول: الدالةُ تُرجع نتيجةً فقط.
 *
 * وقاعدتها الثابتة: **لا تخمين**. الشعبة تُعرف بـ(رمز المقرر + رقم الشعبة)؛ فإن لم
 * يثبت هذا المفتاح — رقمٌ غائب، أو مقرران بالرمز نفسه، أو مطابقةٌ بالاسم وحده،
 * أو خانةٌ لم تُقرأ بيقين — فالصفُّ يُوضع في «تحتاج نظرك» ولا يُحسب مطابقاً ولا
 * خللاً. والخانةُ الفارغة في الملف «غير معروفة» لا «تغيّرت».
 */

type Row = Record<string, any>;

export type RegistrarField = "days" | "time" | "room" | "instructor" | "course" | "section";
export const REGISTRAR_FIELD_LABEL: Record<RegistrarField, string> = {
  days: "الأيام", time: "الوقت", room: "القاعة", instructor: "الأستاذ", course: "المقرر", section: "الشعبة",
};

export type FindingGroup = "matched" | "mismatch" | "notCarried" | "review";
export type FindingKind =
  | "ok" | "fields" | "onlyPdf" | "onlyOurs"
  | "notChanged" | "notAdded" | "notRemoved"
  | "ambiguous" | "unreadable" | "fuzzy" | "noKey";

export interface FieldDelta {
  field: RegistrarField;
  label: string;
  /** ما عندنا الآن. */
  ours: string;
  /** ما طُبع في ملف التسجيل. */
  pdf: string;
  /** لـ«لم يُنفَّذ»: ما كان في النسخة المرسلة (القديم الذي ما زال الملف يعرضه). */
  was?: string;
}

export interface RegistrarFinding {
  id: string;
  group: FindingGroup;
  kind: FindingKind;
  key: string;
  /** هوية الشعبة التي يخصّها (تُعدّ مرّةً واحدة في الإجمالي ولو ظهرت في أكثر من مجموعة). */
  ref: string;
  courseCode: string;
  courseName: string;
  /** رقم المقرر في الكتالوج (لوسومه)؛ غائبٌ حين لم يُربط. */
  courseId?: number;
  section: string;
  /** موعدٌ عندنا يُفتح من البطاقة (غائبٌ حين لا موعد عندنا). */
  scheduleId?: number;
  page?: number;
  fields: FieldDelta[];
  /** سببُ وضعه في «تحتاج نظرك»، أو شرحٌ قصير. */
  reason?: string;
  /** المطابقة بالمفتاح الكامل، أو تقريبية. */
  match: "exact" | "fuzzy" | "none";
}

export interface RegistrarCheckNames {
  instructorById?: Map<number, string>;
  courseCodeById?: Map<number, string>;
  courseNameById?: Map<number, string>;
  /** «هيئة تدريسية» وأمثالها: سجلٌّ ليس شخصاً، فلا يُحكم به على أستاذ. */
  placeholderIds?: ReadonlySet<number>;
}

export interface RegistrarCheckInput {
  live: readonly Row[];
  pdf: readonly Row[];
  /** نسخة آخر ما رآه التسجيل؛ غائبةٌ إن لم يُرسَل شيء بعد. */
  sent?: readonly Row[];
  names?: RegistrarCheckNames;
}

export interface RegistrarCheckResult {
  findings: RegistrarFinding[];
  counts: { matched: number; mismatch: number; notCarried: number; review: number; total: number };
  /** نسبة الشعب المطابقة من الكل (0–100)، أو null إن لم يوجد ما يُقارَن. */
  percent: number | null;
  baseline: { available: boolean };
  reading: {
    pdfRows: number; liveRows: number; outOfScopeRows: number; uncertainRows: number;
    /** خاناتٌ لم يطبعها الملف (أو لم تُقرأ) فلم تُقارَن: عددُ الشعب لكل خانة. */
    notCompared: Record<"days" | "time" | "room" | "instructor", number>;
  };
  /** سببُ تعذّر المقارنة أصلاً. */
  empty: null | "pdfEmpty" | "liveEmpty" | "both";
}

/* ── التطبيع ──────────────────────────────────────────────────────────── */

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const asciiDigits = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

const clock = (value: unknown): string => {
  const text = asciiDigits(value).trim();
  const match = /(\d{1,2}):(\d{2})/.exec(text);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
};

const foldName = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[ً-ْـ]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/(^|\s)(د|أ|ا)\.?(?=\s)/g, " ")
  .replace(/(^|\s)(الدكتور|الدكتورة|دكتور|دكتورة|الأستاذ|الاستاذ|الأستاذة|أستاذ|استاذ|منتدب|مساعد|محاضر)(?=\s|$)/g, " ")
  .replace(/[^؀-ۿa-zA-Z0-9 ]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const sectionOf = (value: unknown): string => {
  const digits = asciiDigits(value).replace(/\D/g, "").replace(/^0+/, "");
  return digits || String(value ?? "").trim();
};

/** آخر ثلاث خانات من رمز المقرر: هوية المقرر داخل قسمٍ واحد (القسم نفسه ثابتٌ في هذا الفحص). */
const courseTail = (code: unknown): string => {
  const digits = asciiDigits(code).replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : digits;
};
const courseFull = (code: unknown): string => {
  const digits = asciiDigits(code).replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
};

/* المبنى والقاعة كما حسمهما النظام، وإلا كما طُبعا في الملف (قاعةٌ غير مسجّلة تبقى مطبوعةً لا فراغاً). */
const roomParts = (row: Row) => ({
  code: String(row.AdRoomCode || row.sourceBuildingText || ""),
  hall: String(row.AdRoomHall || row.sourceRoomText || ""),
});
const roomOf = (row: Row): string => {
  const code = roomParts(row).code.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  const hall = roomParts(row).hall.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  const isEmpty = (v: string) => !v || /^[-—ـ]+$/.test(v);
  const parts = [code, hall].filter(part => !isEmpty(part));
  return parts.join("-");
};

const roomText = (row: Row): string => {
  const { code, hall } = roomParts(row);
  return [code.trim(), hall.trim()].filter(Boolean).join(" / ");
};

/* ── خلايا الملف: ما قُرئ بيقين وما لم يُقرأ ───────────────────────────── */

const EVIDENCE_OF: Record<RegistrarField, string[]> = {
  course: ["course"], section: ["section"], days: ["days"], time: ["time"], instructor: ["instructor"], room: ["building", "room"],
};

/**
 * هل خانة الملف مقروءةٌ بيقين؟ طبقةُ النص تنقل الحرف كما طُبع، فما فيها يُحكم به
 * (وأدلّةُ الربط بسجلّات النظام شأنٌ آخر: أستاذٌ لم يُربط لا يعني أنّ الاسم لم يُقرأ).
 * أما المسحُ الضوئي فكلُّ خانةٍ فيه تحمل درجةَ ثقة، وما ليس «CONFIRMED» لا يُبنى عليه حكم.
 */
export function pdfCellCertain(row: Row, field: RegistrarField): boolean {
  const mode = String(row?.sourceReadMode || "");
  if (mode === "pdf-text") return true;
  const evidence = row?.importEvidence;
  if (!evidence || typeof evidence !== "object") return !mode;
  return EVIDENCE_OF[field].every(key => !evidence[key] || evidence[key].confidence === "CONFIRMED");
}

/* ── اللقاءات ─────────────────────────────────────────────────────────── */

interface Meeting { day: number; start: string; end: string; room: string; instructors: Set<number> }

function meetingsOf(rows: readonly Row[]): Meeting[] {
  const out: Meeting[] = [];
  for (const row of rows) {
    const id = Number(row.AdInstructorId || 0);
    let any = false;
    DAY_KEYS.forEach((key, day) => {
      const flag = row[key];
      const on = flag === true || flag === 1 || String(flag ?? "").toLowerCase() === "true" || String(flag ?? "") === "1";
      if (!on) return;
      any = true;
      out.push({ day, start: clock(row.fstarttime), end: clock(row.fendtime), room: roomOf(row), instructors: new Set(id > 0 ? [id] : []) });
    });
    /* صفٌّ لم تُقرأ أيامُه (خليةٌ فارغة) يبقى وقتُه وقاعتُه وأستاذُه قابلةً للمقارنة، تحت يومٍ مجهول (-1). */
    if (!any) out.push({ day: -1, start: clock(row.fstarttime), end: clock(row.fendtime), room: roomOf(row), instructors: new Set(id > 0 ? [id] : []) });
  }
  return out.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

const rangeOf = (m: Meeting) => (m.start && m.end ? `${m.start}–${m.end}` : m.start || m.end || "");

const daysText = (rows: readonly Row[]): string => {
  const set = new Set(meetingsOf(rows).map(m => m.day).filter(day => day >= 0));
  return [...set].sort().map(day => DAY_NAMES[day]).join(" · ") || "—";
};

/** الوقت: نطاقٌ واحدٌ إن اتّحد في الأيام كلها، وإلا «نطاق (أيامه)». */
const timeText = (rows: readonly Row[]): string => {
  const byRange = new Map<string, Set<number>>();
  for (const m of meetingsOf(rows)) {
    const range = rangeOf(m);
    if (!range) continue;
    byRange.set(range, new Set([...(byRange.get(range) || []), m.day]));
  }
  if (!byRange.size) return "—";
  if (byRange.size === 1 || [...byRange.values()].every(days => days.has(-1))) return [...byRange.keys()].join(" · ");
  return [...byRange.entries()].map(([range, days]) => `${range} (${[...days].sort().map(d => DAY_NAMES[d] || "؟").join("،")})`).join(" · ");
};

const roomsText = (rows: readonly Row[]): string => {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!meetingsOf([row]).length) continue;
    const text = roomText(row);
    if (text) seen.add(text);
  }
  return [...seen].join(" · ") || "—";
};

const instructorIds = (rows: readonly Row[]): number[] => [...new Set(rows.map(row => Number(row.AdInstructorId || 0)).filter(id => id > 0))].sort((a, b) => a - b);

function instructorTextOf(rows: readonly Row[], names?: Map<number, string>): string {
  const labels = new Set<string>();
  for (const row of rows) {
    const id = Number(row.AdInstructorId || 0);
    const label = (id > 0 && names?.get(id)) || String(row.sourceInstructorText || "").trim();
    if (label) labels.add(label.replace(/\s+/g, " "));
  }
  return [...labels].join(" · ") || "—";
}

const valueText = (field: RegistrarField, rows: readonly Row[], names?: Map<number, string>): string => {
  switch (field) {
    case "days": return daysText(rows);
    case "time": return timeText(rows);
    case "room": return roomsText(rows);
    case "instructor": return instructorTextOf(rows, names);
    case "course": return String(rows[0]?.AdCourseName || rows[0]?.CourseNameSnapshot || rows[0]?.CourseCodeSnapshot || "—");
    case "section": return String(rows[0]?.SCode || rows[0]?.sourceSectionText || "—");
  }
};

/* ── المقارنة الحقلية ─────────────────────────────────────────────────── */

type Verdict = "same" | "diff" | "unknown" | "unsure";

/**
 * اتفاقُ خانةٍ بين جانبين. «unknown»: أحد الجانبين فارغٌ لم يُطبع أصلاً (عمودُ
 * الأستاذ فارغٌ كثيراً في ملفات الجهة) فلا يُحسب اختلافاً. «unsure»: الاسمُ
 * مطبوعٌ ولم يُربط بسجلٍّ، فلا يُحكم بشيء.
 */
function compareField(field: RegistrarField, a: readonly Row[], b: readonly Row[], names?: Map<number, string>, placeholders?: ReadonlySet<number>): Verdict {
  const ma = meetingsOf(a), mb = meetingsOf(b);
  switch (field) {
    case "days": {
      const known = (list: Meeting[]) => list.filter(m => m.day >= 0);
      if (!known(ma).length || !known(mb).length) return "unknown";
      const da = [...new Set(known(ma).map(m => m.day))].join(), db = [...new Set(known(mb).map(m => m.day))].join();
      return da === db ? "same" : "diff";
    }
    case "time": {
      const withTime = (list: Meeting[]) => list.filter(m => m.start && m.end);
      const ta = withTime(ma), tb = withTime(mb);
      if (!ta.length || !tb.length) return "unknown";
      const daysB = new Set(tb.map(m => m.day));
      const common = [...new Set(ta.map(m => m.day))].filter(day => day >= 0 && daysB.has(day));
      const key = (list: Meeting[], days?: number[]) => list.filter(m => !days || days.includes(m.day)).map(m => `${m.day}@${m.start}-${m.end}`).join("|");
      if (common.length) return key(ta, common) === key(tb, common) ? "same" : "diff";
      const flat = (list: Meeting[]) => [...new Set(list.map(m => `${m.start}-${m.end}`))].sort().join("|");
      return flat(ta) === flat(tb) ? "same" : "diff";
    }
    case "room": {
      const ra = a.map(roomOf).filter(Boolean), rb = b.map(roomOf).filter(Boolean);
      if (!ra.length || !rb.length) return "unknown";
      return [...new Set(ra)].sort().join("|") === [...new Set(rb)].sort().join("|") ? "same" : "diff";
    }
    case "instructor": {
      const real = (ids: number[]) => ids.filter(id => !placeholders?.has(id));
      const ia = real(instructorIds(a)), ib = real(instructorIds(b));
      const textB = b.map(row => String(row.sourceInstructorText || "").trim()).filter(Boolean);
      const textA = a.map(row => String(row.sourceInstructorText || "").trim()).filter(Boolean);
      if (ia.length && ib.length) return ia.join() === ib.join() ? "same" : "diff";
      if (!ia.length && !textA.length) return "unknown";
      if (!ib.length && !textB.length) return "unknown";
      /* اسمٌ مطبوعٌ بلا سجلٍّ مربوط: يُقارَن باسم الجانب الآخر، والاحتواءُ تطابق، وما سواه «غير محسوم». */
      const label = (rows: readonly Row[], ids: number[], texts: string[]) =>
        foldName(ids.length ? ids.map(id => names?.get(id) || "").join(" ") : texts.join(" "));
      const na = label(a, ia, textA), nb = label(b, ib, textB);
      if (!na || !nb) return "unknown";
      return na === nb || na.includes(nb) || nb.includes(na) ? "same" : "unsure";
    }
    default: return "same";
  }
}

const DATA_FIELDS: RegistrarField[] = ["days", "time", "room", "instructor"];

/* ── الفهرسة ──────────────────────────────────────────────────────────── */

interface Section {
  key: string;
  tail: string;
  full: string;
  /** رموزٌ كاملة مختلفة التقت على المفتاح نفسه (مقرران بنهايةٍ واحدة): التباس. */
  fulls: Set<string>;
  section: string;
  rows: Row[];
  name: string;
  code: string;
}

interface Index { sections: Map<string, Section>; keyless: Row[]; byCrn: Map<string, string | null> }

/** الرقم المرجعي (CRN): هويةُ الشعبة عند جهة التسجيل نفسها، فهو أقوى من أيّ رقمٍ طُبع. */
const crnOf = (row: Row): string => asciiDigits(row?.referenceNumber).replace(/\D/g, "").replace(/^0+/, "");

function indexRows(rows: readonly Row[], codeOf: (row: Row) => string, nameOf: (row: Row) => string, sectionKey: (row: Row) => string): Index {
  const sections = new Map<string, Section>();
  const keyless: Row[] = [];
  const byCrn = new Map<string, string | null>();
  for (const row of rows) {
    const code = codeOf(row);
    const tail = courseTail(code);
    const section = sectionKey(row);
    if (!tail || !section) { keyless.push(row); continue; }
    const key = `${tail}|${section}`;
    const found = sections.get(key);
    const full = courseFull(code);
    if (found) { found.rows.push(row); if (full) found.fulls.add(full); }
    else sections.set(key, { key, tail, full, fulls: new Set(full ? [full] : []), section, rows: [row], name: nameOf(row), code: String(code || "") });
    const crn = crnOf(row);
    if (crn) byCrn.set(crn, byCrn.has(crn) && byCrn.get(crn) !== key ? null : key);
  }
  return { sections, keyless, byCrn };
}

/**
 * يوزّع صفوف الملف على شعب الجدول بهوية الشعبة، بالترتيب:
 *   ١) الرقم المرجعي (CRN) إن وُجد عند الطرفين ووافق المقرر؛
 *   ٢) رمز المقرر + رقم الشعبة المطبوع؛
 *   ٣) رمز المقرر + الرقم المولَّد للشعبة (ترقيم الاستيراد 501، 502…).
 * ما لم يقع على شعبةٍ عندنا جرّب بها نسخةَ آخر إرسال (لاكتشاف ما حذفناه)، وإلا بقي
 * بمفتاحه. وما لا مفتاحَ له (رمزٌ أو رقمٌ لم يُقرأ ولا مرجعيّ) يُعاد منفصلاً.
 */
function groupPdfRows(rows: readonly Row[], codeOf: (row: Row) => string, nameOf: (row: Row) => string, targets: Index[]) {
  const sections = new Map<string, Section>();
  const keyless: Row[] = [];
  for (const row of rows) {
    const code = codeOf(row);
    const tail = courseTail(code);
    const printed = sectionOf(row.sourceSectionText);
    const generated = sectionOf(row.SCode);
    const crn = crnOf(row);
    let key = "";
    for (const target of targets) {
      const viaCrn = crn ? target.byCrn.get(crn) : undefined;
      const crnSection = viaCrn ? target.sections.get(viaCrn) : undefined;
      if (crnSection && (!tail || crnSection.tail === tail)) { key = crnSection.key; break; }
      if (!tail) continue;
      const printedKey = printed ? `${tail}|${printed}` : "";
      const generatedKey = generated ? `${tail}|${generated}` : "";
      if (printedKey && target.sections.has(printedKey)) { key = printedKey; break; }
      if (generatedKey && target.sections.has(generatedKey)) { key = generatedKey; break; }
    }
    if (!key && tail && (printed || generated)) key = `${tail}|${printed || generated}`;
    if (!key) { keyless.push(row); continue; }
    const [keyTail, keySection] = key.split("|");
    const found = sections.get(key);
    const full = courseFull(code);
    if (found) { found.rows.push(row); if (full) found.fulls.add(full); }
    else sections.set(key, { key, tail: keyTail, full, fulls: new Set(full ? [full] : []), section: keySection, rows: [row], name: nameOf(row), code: String(code || "") });
  }
  return { sections, keyless };
}

const isCrossBranch = (row: Row) => String(row?.scopeMismatchType || "") === "CROSS_BRANCH";

/* ── الفحص ────────────────────────────────────────────────────────────── */

export function checkRegistrarPdf(input: RegistrarCheckInput): RegistrarCheckResult {
  const names = input.names || {};
  const instructorNames = names.instructorById;
  const placeholders = names.placeholderIds;
  const liveCode = (row: Row) => String(names.courseCodeById?.get(Number(row.AdCourseId || 0)) || row.CourseCodeSnapshot || row.CourseCode || "");
  const liveName = (row: Row) => String(names.courseNameById?.get(Number(row.AdCourseId || 0)) || row.AdCourseName || row.CourseNameSnapshot || "");
  const pdfCode = (row: Row) => String(row.sourceCourseCode || names.courseCodeById?.get(Number(row.AdCourseId || 0)) || row.CourseCodeSnapshot || "");
  const pdfName = (row: Row) => String(row.AdCourseName || row.sourceCourseText || "");

  const pdfAll = input.pdf.filter(row => row && typeof row === "object");
  const pdfRows = pdfAll.filter(row => !isCrossBranch(row));
  const outOfScopeRows = pdfAll.length - pdfRows.length;
  const liveRows = input.live.filter(row => row && typeof row === "object");

  const live = indexRows(liveRows, liveCode, liveName, row => sectionOf(row.SCode));
  const sent = input.sent ? indexRows(input.sent, liveCode, liveName, row => sectionOf(row.SCode)) : null;
  const pdf = groupPdfRows(pdfRows, pdfCode, pdfName, sent ? [live, sent] : [live]);

  const findings: RegistrarFinding[] = [];
  let uncertainRows = 0;
  const notCompared = { days: 0, time: 0, room: 0, instructor: 0 };

  const base = (section: Section | undefined, other: Section | undefined) => ({
    courseCode: (section?.code || other?.code || "").replace(/\D/g, "") || section?.code || other?.code || "",
    courseName: section?.name || other?.name || "",
    courseId: Number(section?.rows[0]?.AdCourseId || other?.rows[0]?.AdCourseId || 0) || undefined,
    section: section?.section || other?.section || "",
  });
  const add = (finding: Omit<RegistrarFinding, "id" | "ref" | "courseCode" | "courseName" | "courseId" | "section"> & { sec?: Section; other?: Section; ref?: string }) => {
    const { sec, other, ref, ...rest } = finding;
    const id = `${rest.group}:${rest.kind}:${rest.key}`;
    findings.push({ id, ref: ref || rest.key.split("|").slice(0, 2).join("|"), ...base(sec, other), ...rest });
  };
  const liveId = (section?: Section) => {
    const id = Number(section?.rows.find(row => Number(row.id) > 0)?.id || section?.rows[0]?.id || 0);
    return id > 0 ? id : undefined;
  };
  const pageOf = (section?: Section) => Number(section?.rows[0]?.sourcePage || 0) || undefined;
  const delta = (field: RegistrarField, ours: readonly Row[], theirs: readonly Row[], was?: readonly Row[]): FieldDelta => ({
    field, label: REGISTRAR_FIELD_LABEL[field],
    ours: valueText(field, ours, instructorNames),
    pdf: valueText(field, theirs, instructorNames),
    ...(was ? { was: valueText(field, was, instructorNames) } : {}),
  });
  /* خانةٌ غير مؤكدة القراءة في أيّ صفٍّ من الشعبة. */
  const certain = (section: Section, field: RegistrarField) => section.rows.every(row => pdfCellCertain(row, field));

  /* ── المفتاح الملتبس: مقرران عندنا بالرمز نفسه ───────────────────── */
  const liveByKey = live.sections;
  const consumedLive = new Set<string>();
  const consumedPdf = new Set<string>();
  const tailCollisions = new Set<string>();
  {
    const seen = new Map<string, Set<string>>();
    for (const section of liveByKey.values()) {
      const fullSet = seen.get(section.tail) || new Set<string>();
      fullSet.add(section.full || section.code);
      seen.set(section.tail, fullSet);
    }
    for (const [tail, fulls] of seen) if (fulls.size > 1) tailCollisions.add(tail);
  }

  /* ── الشعب التي على الطرفين بمفتاحٍ كامل ─────────────────────────── */
  for (const [key, ours] of liveByKey) {
    const theirs = pdf.sections.get(key);
    if (!theirs) continue;
    if (tailCollisions.has(ours.tail) || ours.fulls.size > 1) {
      /* رمزان بالنهاية نفسها (قسمان أو كتالوجان): المفتاح لا يكفي لإثبات هويةٍ، فيُسأل صاحبُ الجدول. */
      consumedLive.add(key); consumedPdf.add(key);
      add({ group: "review", kind: "ambiguous", key, sec: ours, other: theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields: [], match: "exact",
        reason: "مقرران عندكم برمزٍ ينتهي بالرقم نفسه؛ لا أستطيع إثبات أيّهما المقصود." });
      continue;
    }
    consumedLive.add(key); consumedPdf.add(key);
    const prior = sent?.sections.get(key);

    const hard: FieldDelta[] = [];
    const notCarried: FieldDelta[] = [];
    const unsure: Array<{ delta: FieldDelta; why: string }> = [];
    for (const field of DATA_FIELDS) {
      const verdict = compareField(field, ours.rows, theirs.rows, instructorNames, placeholders);
      if (verdict === "unknown") { notCompared[field as keyof typeof notCompared]++; continue; }
      if (verdict === "same") continue;
      if (verdict === "unsure") { unsure.push({ delta: delta(field, ours.rows, theirs.rows), why: "الاسم المطبوع لم يُربط بأستاذٍ مسجّل" }); continue; }
      if (!certain(theirs, field)) { unsure.push({ delta: delta(field, ours.rows, theirs.rows), why: "قراءة هذه الخانة من الملف غير مؤكدة" }); continue; }
      /* هل غيّره القسم بعد الإرسال، وما زال الملف يعرض القديم؟ */
      if (prior) {
        const changedSince = compareField(field, prior.rows, ours.rows, instructorNames, placeholders) === "diff";
        const stillOld = compareField(field, prior.rows, theirs.rows, instructorNames, placeholders) === "same";
        if (changedSince && stillOld) { notCarried.push(delta(field, ours.rows, theirs.rows, prior.rows)); continue; }
      }
      hard.push(delta(field, ours.rows, theirs.rows));
    }
    if (notCarried.length) add({ group: "notCarried", kind: "notChanged", key, sec: ours, other: theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields: notCarried, match: "exact" });
    if (hard.length) add({ group: "mismatch", kind: "fields", key, sec: ours, other: theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields: hard, match: "exact" });
    for (const item of unsure) {
      uncertainRows++;
      add({ group: "review", kind: "unreadable", key: `${key}|${item.delta.field}`, sec: ours, other: theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields: [item.delta], match: "exact", reason: item.why });
    }
    if (!notCarried.length && !hard.length && !unsure.length) add({ group: "matched", kind: "ok", key, sec: ours, other: theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields: [], match: "exact" });
  }

  /* ── ما بقي عندنا وحدنا ───────────────────────────────────────────── */
  const leftoverLive = [...liveByKey.entries()].filter(([key]) => !consumedLive.has(key));
  const leftoverPdf = [...pdf.sections.entries()].filter(([key]) => !consumedPdf.has(key));

  /* مطابقةٌ تقريبية: المقرر نفسه بشعبةٍ مختلفة، أو الشعبة نفسها بمقررٍ مختلف. لا تُحسب إلا في «تحتاج نظرك». */
  const usedLiveFuzzy = new Set<string>();
  const usedPdfFuzzy = new Set<string>();
  for (const [pKey, theirs] of leftoverPdf) {
    const sameCourse = leftoverLive.filter(([k, s]) => !usedLiveFuzzy.has(k) && s.tail === theirs.tail);
    const sameSection = leftoverLive.filter(([k, s]) => !usedLiveFuzzy.has(k) && s.section === theirs.section && foldName(s.name) && foldName(s.name) === foldName(theirs.name));
    const candidates = sameCourse.length ? sameCourse : sameSection;
    if (!candidates.length) continue;
    usedPdfFuzzy.add(pKey);
    if (candidates.length > 1 && sameCourse.length) {
      add({ group: "review", kind: "ambiguous", key: pKey, sec: undefined, other: theirs, page: pageOf(theirs), fields: [], match: "fuzzy",
        reason: `الشعبة ${theirs.section} غير موجودة عندكم، وللمقرر عدةُ شعبٍ أخرى؛ لا أستطيع إثبات أيّها المقصود.` });
      candidates.forEach(([k]) => usedLiveFuzzy.add(k));
      continue;
    }
    const [lKey, ours] = candidates[0];
    usedLiveFuzzy.add(lKey);
    const fields: FieldDelta[] = [];
    if (ours.section !== theirs.section) fields.push({ field: "section", label: REGISTRAR_FIELD_LABEL.section, ours: ours.section, pdf: theirs.section });
    if (ours.tail !== theirs.tail) fields.push({ field: "course", label: REGISTRAR_FIELD_LABEL.course, ours: ours.code.replace(/\D/g, "") || ours.name, pdf: theirs.code.replace(/\D/g, "") || theirs.name });
    for (const field of DATA_FIELDS) if (compareField(field, ours.rows, theirs.rows, instructorNames, placeholders) === "diff") fields.push(delta(field, ours.rows, theirs.rows));
    add({ group: "review", kind: "fuzzy", key: `${lKey}~${pKey}`, ref: lKey, sec: ours, other: theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields, match: "fuzzy",
      reason: ours.tail === theirs.tail ? "الشعبة بالرقم المطبوع غير موجودة؛ وقعت مطابقةٌ بالمقرر وحده." : "المطابقة بالاسم وحده، والرمز لا يوافق." });
  }

  for (const [key, theirs] of leftoverPdf) {
    if (usedPdfFuzzy.has(key)) continue;
    const prior = sent?.sections.get(key);
    if (prior) {
      /* كانت في النسخة المرسلة وحذفناها بعد الإرسال، وما زالت في الملف. */
      add({ group: "notCarried", kind: "notRemoved", key, sec: prior, other: theirs, page: pageOf(theirs), fields: [], match: "exact",
        reason: "حذفتموها بعد الإرسال وما زالت مطبوعةً في الملف." });
    } else {
      add({ group: "mismatch", kind: "onlyPdf", key, other: theirs, page: pageOf(theirs), fields: [
        delta("days", [], theirs.rows), delta("time", [], theirs.rows),
      ].map(item => ({ ...item, ours: "—" })), match: "exact", reason: "شعبةٌ في الملف ليست في جدولكم." });
    }
  }

  for (const [key, ours] of leftoverLive) {
    if (usedLiveFuzzy.has(key)) continue;
    const prior = sent?.sections.get(key);
    if (sent && !prior) {
      add({ group: "notCarried", kind: "notAdded", key, sec: ours, scheduleId: liveId(ours), fields: [], match: "exact",
        reason: "أضفتموها بعد الإرسال ولم تظهر في الملف." });
    } else {
      add({ group: "mismatch", kind: "onlyOurs", key, sec: ours, scheduleId: liveId(ours), fields: [
        delta("days", ours.rows, []), delta("time", ours.rows, []),
      ].map(item => ({ ...item, pdf: "—" })), match: "exact", reason: "شعبةٌ في جدولكم غابت عن الملف." });
    }
  }

  /* ── صفوف الملف التي بلا مفتاح: لا تُهمَل ولا تُخمَّن ─────────────── */
  for (const row of pdf.keyless) {
    uncertainRows++;
    const code = pdfCode(row);
    add({ group: "review", kind: "noKey", key: `nokey:${row.sourceOrder ?? findings.length}`, page: Number(row.sourcePage || 0) || undefined, fields: [], match: "none",
      other: { key: "", tail: "", full: "", fulls: new Set<string>(), section: sectionOf(row.sourceSectionText || row.SCode), rows: [row], name: pdfName(row), code },
      reason: courseTail(code) ? "رقم الشعبة لم يُقرأ بوضوح." : "رمز المقرر لم يُقرأ بوضوح." });
  }

  const order: Record<FindingGroup, number> = { notCarried: 0, mismatch: 1, review: 2, matched: 3 };
  findings.sort((a, b) => order[a.group] - order[b.group]
    || a.courseCode.localeCompare(b.courseCode, "en", { numeric: true })
    || a.section.localeCompare(b.section, "en", { numeric: true }));

  const count = (group: FindingGroup) => findings.filter(item => item.group === group).length;
  /* الشعبة تُحسب مرّةً واحدة في الإجمالي ولو ظهرت في أكثر من مجموعة. */
  const distinct = (group: FindingGroup) => new Set(findings.filter(item => item.group === group).map(item => item.ref)).size;
  const counts = { matched: count("matched"), mismatch: distinct("mismatch"), notCarried: distinct("notCarried"), review: distinct("review"), total: 0 };
  counts.total = new Set(findings.map(item => item.ref)).size;
  const empty = !pdfRows.length && !liveRows.length ? "both" : !pdfRows.length ? "pdfEmpty" : !liveRows.length ? "liveEmpty" : null;
  return {
    findings, counts,
    percent: empty || !counts.total ? null : Math.round((counts.matched / counts.total) * 100),
    baseline: { available: Boolean(input.sent) },
    reading: { pdfRows: pdfRows.length, liveRows: liveRows.length, outOfScopeRows, uncertainRows, notCompared },
    empty,
  };
}

/* ── صفٌّ نحيف: ما يلزم للمقارنة وحده ─────────────────────────────────────
 * يُبنى في المتصفح قبل الإرسال (فحجمُ الطلب لا يتجاوز حدّ الخادم) وفي الخادم
 * عند الاستقبال (فلا يدخل المقارنةَ نصٌّ طويلٌ ولا حقلٌ لم يُطلب). */
const EVIDENCE_KEYS = ["course", "section", "days", "time", "instructor", "building", "room"];
export function slimPdfRow(raw: any): Row {
  const text = (value: unknown, max = 80) => String(value ?? "").slice(0, max);
  const evidence: Record<string, { confidence: string }> = {};
  if (raw?.importEvidence && typeof raw.importEvidence === "object") {
    for (const key of EVIDENCE_KEYS) {
      const proof = raw.importEvidence[key];
      if (proof) evidence[key] = { confidence: text(proof.confidence, 20) };
    }
  }
  return {
    sourceOrder: Number(raw?.sourceOrder) || 0,
    sourcePage: Number(raw?.sourcePage) || 0,
    sourceReadMode: text(raw?.sourceReadMode, 20),
    sourceCourseCode: text(raw?.sourceCourseCode, 20),
    sourceSectionText: text(raw?.sourceSectionText, 12),
    referenceNumber: text(raw?.referenceNumber, 20),
    sourceInstructorText: text(raw?.sourceInstructorText, 120),
    AdCourseId: Number(raw?.AdCourseId) || 0,
    AdCourseName: text(raw?.AdCourseName, 120),
    SCode: text(raw?.SCode, 12),
    AdInstructorId: Number(raw?.AdInstructorId) || 0,
    fsunday: Boolean(raw?.fsunday), fmonday: Boolean(raw?.fmonday), ftuesday: Boolean(raw?.ftuesday), fwednesday: Boolean(raw?.fwednesday), fthursday: Boolean(raw?.fthursday),
    fstarttime: text(raw?.fstarttime, 8), fendtime: text(raw?.fendtime, 8),
    AdRoomCode: text(raw?.AdRoomCode, 24), AdRoomHall: text(raw?.AdRoomHall, 24),
    sourceBuildingText: text(raw?.sourceBuildingText, 24), sourceRoomText: text(raw?.sourceRoomText, 24),
    scopeMismatchType: raw?.scopeMismatchType === "CROSS_BRANCH" ? "CROSS_BRANCH" : undefined,
    ...(Object.keys(evidence).length ? { importEvidence: evidence } : {}),
  };
}
