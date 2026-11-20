/**
 * ── فحصُ جدول التسجيل: هل نفّذ ما أرسلناه؟ ───────────────────────────────────
 *
 * يعيد التسجيلُ أحياناً جدولَ القسم بملف PDF جديد ليراجعه القسم. السؤالان:
 *   ١) هل في ما طُبع خللٌ — موعدٌ أو أستاذٌ أو قاعةٌ تخالف جدولنا، أو شعبةٌ
 *      على طرفٍ دون الآخر؟
 *   ٢) هل نُفِّذ ما أرسلناه، وما الذي عدّلناه بعد آخر إرسال فلم يصلهم بعد؟
 *
 * مقارنةٌ نقيّة بين أربع صور: الجدول الحيّ (ما عندنا)، وصفوف الملف المقروءة (ما
 * طبعه التسجيل)، ونسخةُ آخر إرسال (ما رآه التسجيل قبل أن نعدّل)، وملفُّ التسجيل
 * الأصلي إن وُجد (ما كان عليه كل رقمٍ مرجعي قبل أي تعديل). لا كتابةَ ولا شبكةَ.
 *
 * **هوية الشعبة: رمز المقرر + الرقم المرجعي (CRN).** التسجيل يعيد ترقيم الشعب
 * كما يشاء، فاختلافُ رقم الشعبة وحده ليس فرقاً. الرقمُ المرجعي لصفوفنا يُؤخذ من
 * المصدر نفسه الذي يطبعه «تقرير تغييرات الجدول» (اقتران ملف التسجيل الأصلي بالجدول)
 * ويُمرَّر هنا جاهزاً. فإن غاب الرقم المرجعي عن أحد الطرفين رُجع إلى المقرر والموعد
 * نفسه، ثم المقرر وحده في «تحتاج نظرك». وقاعدتها الثابتة: **لا تخمين** — التباسٌ
 * أو قراءةٌ غير مؤكدة تُوضع في «تحتاج نظرك» ولا تُحسب مطابقةً ولا خللاً.
 */

import { AR, countOf } from "./arabicCount";

type Row = Record<string, any>;

export type RegistrarField = "days" | "time" | "room" | "instructor" | "course" | "section";
export const REGISTRAR_FIELD_LABEL: Record<RegistrarField, string> = {
  days: "الأيام", time: "الوقت", room: "القاعة", instructor: "الأستاذ", course: "المقرر", section: "الشعبة",
};

/**
 * notApplied: أرسلناه ولم يُنفَّذ. notSent: تعديلٌ جديد لم يُرسل بعد (ليس تقصيراً منهم).
 * mismatch: يخالف جدولنا. review: لا يُحكم فيه بيقين. matched: مطابق.
 */
export type FindingGroup = "notApplied" | "notSent" | "mismatch" | "review" | "matched";
export type FindingKind =
  | "ok" | "fields" | "onlyPdf" | "onlyOurs" | "misplaced"
  | "notChanged" | "notAdded" | "notRemoved"
  | "ambiguous" | "unreadable" | "fuzzy" | "noKey" | "crnChanged";

/** ما يُطلب من التسجيل في «طلب التعديل»: عدّلوا، أضيفوا، احذفوا. */
export type RequestAction = "edit" | "add" | "delete";

export interface FieldDelta {
  field: RegistrarField;
  label: string;
  /** ما عندنا الآن (المطلوب). */
  ours: string;
  /** ما طُبع في ملف التسجيل. */
  pdf: string;
  /** ما كان في النسخة المرسلة (لـ«لم يُرسل بعد»). */
  was?: string;
  /** مجموعةُ النتيجة التي جاء منها الحقل: حين تُدمج نتيجتان لشعبةٍ واحدة يبقى لكل حقلٍ أصلُه (تقصيرُهم أم تعديلُنا بعد الإرسال). */
  group?: FindingGroup;
}

export interface RegistrarFinding {
  id: string;
  group: FindingGroup;
  kind: FindingKind;
  key: string;
  /** هوية الشعبة التي يخصّها (تُعدّ مرّةً واحدة في الإجمالي ولو ظهرت في أكثر من مجموعة). */
  ref: string;
  /** الرقم المرجعي عند التسجيل (من ملفهم، وإلا ما عندنا). */
  crn?: string;
  courseCode: string;
  courseName: string;
  /** رقم المقرر في الكتالوج (لوسومه)؛ غائبٌ حين لم يُربط. */
  courseId?: number;
  /** رقم الشعبة عندنا (وإلا عندهم). */
  section: string;
  /** رقم الشعبة في ملفهم حين يختلف: يُعرض بهدوء، ولا يُعدّ فرقاً. */
  pdfSection?: string;
  /** موعدٌ عندنا يُفتح من البطاقة (غائبٌ حين لا موعد عندنا). */
  scheduleId?: number;
  page?: number;
  fields: FieldDelta[];
  /** سببُ وضعه في «تحتاج نظرك»، أو شرحٌ قصير. */
  reason?: string;
  /** كيف عُرفت الشعبة: بالرقم المرجعي، أو بالمقرر والموعد، أو تقريبياً. */
  match: "crn" | "exact" | "fuzzy" | "none";
  /** ما يُطلب من التسجيل؛ غائبٌ لما لا يُطلب (المطابق وما يحتاج نظراً). */
  action?: RequestAction;
}

export interface RegistrarCheckNames {
  instructorById?: Map<number, string>;
  courseCodeById?: Map<number, string>;
  courseNameById?: Map<number, string>;
  /** «هيئة تدريسية» وأمثالها: سجلٌّ ليس شخصاً، فلا يُحكم به على أستاذ. */
  placeholderIds?: ReadonlySet<number>;
}

/**
 * مصدر الرقم المرجعي لصفوفنا — هو نفسه ما يطبعه «تقرير تغييرات الجدول»:
 * `source.referenceNumber || row.referenceNumber` من اقتران ملف التسجيل الأصلي بالجدول.
 */
export interface RegistrarCrnSource {
  /** الرقم المرجعي لكل موعدٍ عندنا (الحيّ ونسخةُ آخر إرسال) بمعرّفه. */
  byId: ReadonlyMap<number, string>;
  /** صفوف ملف التسجيل الأصلي: ما كان عليه كل رقمٍ مرجعي قبل أي تعديلٍ منّا. */
  original?: readonly Row[];
  /** الرقم المرجعي الأصلي لموعدٍ اعتمد ترقيمَ التسجيل الأحدث: يبقى طريقَه إلى ملف التسجيل الأصلي. */
  originalById?: ReadonlyMap<number, string>;
}

/**
 * هويةُ شعبةٍ عندنا كما عرفها الفحص في ملفهم: منها يُبنى «اعتمد ترقيم التسجيل».
 * certain: عُرفت بالرقم المرجعي، أو بالمقرر والموعد والأستاذ وانفردت من الطرفين،
 * وقُرئ رقمها ومرجعيّها من طبقة النص. وما سواه لا يُعتمد ترقيمه (لا تخمين).
 */
export interface RegistrarIdentity {
  ref: string;
  ids: number[];
  courseId?: number;
  courseCode: string;
  courseName: string;
  /** المخزَّن عندنا الآن: رقم الشعبة والرقم المرجعي كما في الصف. */
  ours: { section: string; crn: string };
  /** ما طبعه ملفهم. */
  theirs: { section: string; crn: string };
  how: "crn" | "slot" | "key" | "misplaced";
  certain: boolean;
  reason?: string;
}

export interface RegistrarCheckInput {
  live: readonly Row[];
  pdf: readonly Row[];
  /** نسخة آخر ما رآه التسجيل؛ غائبةٌ إن لم يُرسَل شيء بعد. */
  sent?: readonly Row[];
  names?: RegistrarCheckNames;
  /** غائبٌ: يُقرأ الرقم المرجعي من حقل الصف نفسه. */
  crn?: RegistrarCrnSource;
}

export type RegistrarCounts = { matched: number; mismatch: number; notSent: number; notApplied: number; review: number; total: number };

export interface RegistrarCheckResult {
  findings: RegistrarFinding[];
  counts: RegistrarCounts;
  /** نسبة الشعب المطابقة من الكل (0–100)، أو null إن لم يوجد ما يُقارَن. */
  percent: number | null;
  baseline: { available: boolean; crn: boolean };
  reading: {
    pdfRows: number; liveRows: number; outOfScopeRows: number; uncertainRows: number;
    /** خاناتٌ لم يطبعها الملف (أو لم تُقرأ) فلم تُقارَن: عددُ الشعب لكل خانة. */
    notCompared: Record<"days" | "time" | "room" | "instructor", number>;
  };
  /** سببُ تعذّر المقارنة أصلاً. */
  empty: null | "pdfEmpty" | "liveEmpty" | "both";
  /** هويةُ كل شعبةٍ عندنا عُرفت في ملفهم (لترقيم التسجيل). */
  identities: RegistrarIdentity[];
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

/* ── الأسماء: التسجيل يقصّ الاسم الطويل («عبدالله عبدالعزيز عبدالله ال») ويكتب
   «بو حمد» و«بوحمد» كيفما اتفق، ويسبقه بـ«د.» أو «أ.د.». فالمقارنة بالكلمات بالترتيب،
   وآخرُ كلمةٍ من الأقصر يكفي أن تكون بدايةَ نظيرتها. ─────────────────────────── */
const NAME_TITLES = new Set(["د", "ا", "م", "دكتور", "دكتوره", "الدكتور", "الدكتوره", "استاذ", "استاذه", "الاستاذ", "الاستاذه", "منتدب", "مساعد", "محاضر"]);
const NAME_JOINERS = new Set(["عبد", "ابو", "بو", "ال", "ابن", "بن"]);
const foldLetters = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[ً-ْـ]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
export function nameTokens(value: unknown): string[] {
  const words = foldLetters(value).replace(/[^؀-ۿa-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean).filter(word => !NAME_TITLES.has(word));
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (NAME_JOINERS.has(word) && i + 1 < words.length) { out.push(word + words[i + 1]); i++; }
    else out.push(word);
  }
  return out;
}
const foldName = (value: unknown) => nameTokens(value).join(" ");
/** اسمان لشخصٍ واحد؟ يتسامح مع القصّ والألقاب و«بو حمد/بوحمد»، ولا يكفيه اسمٌ أول وحده. */
export function namesAgree(a: unknown, b: unknown): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length < 2) return false;
  return short.every((word, i) => i < short.length - 1
    ? word === long[i]
    : word === long[i] || long[i].startsWith(word) || word.startsWith(long[i]));
}

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

/** الرقم المرجعي (CRN) كما يُقارَن: أرقامٌ بلا أصفار بادئة. */
export const normalizeCrn = (value: unknown): string => asciiDigits(value).replace(/\D/g, "").replace(/^0+/, "");

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

/** لقاءاتٌ بيومٍ ووقتٍ واحد على الطرفين (اليومُ المجهول -1 لا يُقرَن). */
function sharedMeetings(a: Meeting[], b: Meeting[]): Array<[Meeting, Meeting]> {
  const out: Array<[Meeting, Meeting]> = [];
  for (const x of a) {
    if (x.day < 0 || !x.start) continue;
    const y = b.find(m => m.day === x.day && m.start === x.start && m.end === x.end);
    if (y) out.push([x, y]);
  }
  return out;
}

/**
 * اتفاقُ خانةٍ بين جانبين. «unknown»: أحد الجانبين فارغٌ لم يُطبع أصلاً (عمودُ
 * الأستاذ فارغٌ كثيراً في ملفات الجهة) فلا يُحسب اختلافاً. «unsure»: الاسمُ
 * مطبوعٌ ولم يُربط بسجلٍّ ولا يوافق الاسم الآخر، فلا يُحكم بشيء.
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
      /* القاعةُ للقاءٍ لا للشعبة: تبديلُ قاعتَي يومين يُقرأ خللاً. */
      const shared = sharedMeetings(ma, mb);
      if (shared.length) return shared.every(([x, y]) => !x.room || !y.room || x.room === y.room) ? "same" : "diff";
      return [...new Set(ra)].sort().join("|") === [...new Set(rb)].sort().join("|") ? "same" : "diff";
    }
    case "instructor": {
      const real = (ids: number[]) => ids.filter(id => !placeholders?.has(id));
      const ia = real(instructorIds(a)), ib = real(instructorIds(b));
      /* «هيئة تدريسية» على الطرفين: لا أستاذ مسمّى عند أحد، فلا فرق ولا حاجة لنظر. */
      const rawA = instructorIds(a), rawB = instructorIds(b);
      if (rawA.length && rawB.length && !ia.length && !ib.length) return "same";
      const textB = b.map(row => String(row.sourceInstructorText || "").trim()).filter(Boolean);
      const textA = a.map(row => String(row.sourceInstructorText || "").trim()).filter(Boolean);
      const namesOf = (ids: number[]) => ids.map(id => names?.get(id) || "").filter(Boolean);
      /* الاسمُ المطبوع المقصوص قد يُربط بسجلّ شخصٍ آخر يشاركه البداية؛ فإن وافق المطبوعُ اسمَ الطرف الآخر فهو هو. */
      const printedAgrees = () => textB.some(text => namesOf(ia).some(name => namesAgree(text, name)))
        || textA.some(text => namesOf(ib).some(name => namesAgree(text, name)));
      if (ia.length && ib.length) {
        const own = (m: Meeting) => [...m.instructors].filter(id => !placeholders?.has(id)).sort().join();
        const shared = sharedMeetings(ma, mb).filter(([x, y]) => own(x) && own(y));
        const verdict = shared.length ? (shared.every(([x, y]) => own(x) === own(y)) ? "same" : "diff") : (ia.join() === ib.join() ? "same" : "diff");
        return verdict === "diff" && printedAgrees() ? "same" : verdict;
      }
      if (!ia.length && !textA.length) return "unknown";
      if (!ib.length && !textB.length) return "unknown";
      /* اسمٌ مطبوعٌ بلا سجلٍّ مربوط: يُقارَن باسم الجانب الآخر بالتسامح نفسه، وما سواه «غير محسوم». */
      const label = (ids: number[], texts: string[]) => (ids.length ? namesOf(ids).join(" ") : texts.join(" "));
      const na = label(ia, textA), nb = label(ib, textB);
      if (!foldName(na) || !foldName(nb)) return "unknown";
      const fa = foldName(na), fb = foldName(nb);
      return fa === fb || fa.includes(fb) || fb.includes(fa) || namesAgree(na, nb) ? "same" : "unsure";
    }
    default: return "same";
  }
}

const DATA_FIELDS: Array<"days" | "time" | "room" | "instructor"> = ["days", "time", "room", "instructor"];

/* ── الفهرسة ──────────────────────────────────────────────────────────── */

interface Section {
  key: string;
  tail: string;
  full: string;
  /** رموزٌ كاملة مختلفة التقت على المفتاح نفسه (مقرران بنهايةٍ واحدة): التباس. */
  fulls: Set<string>;
  section: string;
  /** الرقم المرجعي الواحد للشعبة، أو فارغ (غائبٌ أو متعارض). */
  crn: string;
  rows: Row[];
  name: string;
  code: string;
}

function indexSections(rows: readonly Row[], codeOf: (row: Row) => string, nameOf: (row: Row) => string, crnOfRow: (row: Row) => string) {
  const sections = new Map<string, Section>();
  const crnSets = new Map<string, Set<string>>();
  for (const row of rows) {
    const code = codeOf(row);
    const tail = courseTail(code);
    const section = sectionOf(row.SCode);
    if (!tail || !section) continue;
    const key = `${tail}|${section}`;
    const found = sections.get(key);
    const full = courseFull(code);
    if (found) { found.rows.push(row); if (full) found.fulls.add(full); }
    else sections.set(key, { key, tail, full, fulls: new Set(full ? [full] : []), section, crn: "", rows: [row], name: nameOf(row), code: String(code || "") });
    const crn = crnOfRow(row);
    if (crn) crnSets.set(key, new Set([...(crnSets.get(key) || []), crn]));
  }
  for (const [key, set] of crnSets) if (set.size === 1) sections.get(key)!.crn = [...set][0];
  /* رقمٌ مرجعيّ واحد على شعبتين عندنا: لا يُثبت هويةَ أيٍّ منهما. */
  const owners = new Map<string, number>();
  for (const s of sections.values()) if (s.crn) owners.set(s.crn, (owners.get(s.crn) || 0) + 1);
  for (const s of sections.values()) if (s.crn && (owners.get(s.crn) || 0) > 1) s.crn = "";
  return sections;
}

/** صفوف الملف تُجمع بالرقم المرجعي إن طُبع، وإلا برمز المقرر ورقم الشعبة المطبوع (أو المولَّد). */
function groupPdfRows(rows: readonly Row[], codeOf: (row: Row) => string, nameOf: (row: Row) => string) {
  const sections = new Map<string, Section>();
  const keyless: Row[] = [];
  for (const row of rows) {
    const code = codeOf(row);
    const tail = courseTail(code);
    const section = sectionOf(row.sourceSectionText) || sectionOf(row.SCode);
    const crn = normalizeCrn(row.referenceNumber);
    const key = crn ? `#${crn}` : tail && section ? `${tail}|${section}` : "";
    if (!key) { keyless.push(row); continue; }
    const found = sections.get(key);
    const full = courseFull(code);
    if (found) { found.rows.push(row); if (full) found.fulls.add(full); if (!found.tail && tail) { found.tail = tail; found.code = String(code || ""); } }
    else sections.set(key, { key, tail, full, fulls: new Set(full ? [full] : []), section, crn, rows: [row], name: nameOf(row), code: String(code || "") });
  }
  return { sections, keyless };
}

const isCrossBranch = (row: Row) => String(row?.scopeMismatchType || "") === "CROSS_BRANCH";

/** ما يُطلب من التسجيل لهذه النتيجة. */
export function requestActionOf(finding: Pick<RegistrarFinding, "group" | "kind">): RequestAction | undefined {
  if (finding.group === "matched" || finding.group === "review") return undefined;
  if (finding.kind === "onlyOurs" || finding.kind === "notAdded") return "add";
  if (finding.kind === "onlyPdf" || finding.kind === "notRemoved") return "delete";
  return "edit";
}

/* ── الفحص ────────────────────────────────────────────────────────────── */

export function checkRegistrarPdf(input: RegistrarCheckInput): RegistrarCheckResult {
  const names = input.names || {};
  const instructorNames = names.instructorById;
  const placeholders = names.placeholderIds;
  const liveCode = (row: Row) => String(names.courseCodeById?.get(Number(row.AdCourseId || 0)) || row.CourseCodeSnapshot || row.CourseCode || "");
  const liveName = (row: Row) => String(names.courseNameById?.get(Number(row.AdCourseId || 0)) || row.AdCourseName || row.CourseNameSnapshot || "");
  /* رمزُ ملفهم كما طُبع؛ وإن طُبع مختصراً (112) وربطه القارئ بمقررٍ بالنهاية نفسها فبرمزه الكامل. */
  const pdfCode = (row: Row) => {
    const printed = String(row.sourceCourseCode || "");
    const catalogue = String(names.courseCodeById?.get(Number(row.AdCourseId || 0)) || "");
    if (courseFull(printed)) return printed;
    if (catalogue && (!printed || courseTail(catalogue) === courseTail(printed))) return catalogue;
    return printed || String(row.CourseCodeSnapshot || "");
  };
  const pdfName = (row: Row) => String(row.AdCourseName || row.sourceCourseText || names.courseNameById?.get(Number(row.AdCourseId || 0)) || "");
  /* الرقم المرجعي لصفّنا: من المصدر الممرَّر (كما في تقرير التغييرات)، وإلا من حقل الصف. */
  const crnSource = input.crn;
  const ourCrn = (row: Row) => normalizeCrn(crnSource ? crnSource.byId.get(Number(row.id)) : row.referenceNumber);
  /* الرقم الذي يُقرأ به ملف التسجيل الأصلي: رقمُ الصف الأصلي إن اعتمد ترقيمَ ملفٍّ أحدث. */
  const originalCrnOf = (section: { crn: string; rows: Row[] }) => {
    for (const row of section.rows) {
      const crn = normalizeCrn(crnSource?.originalById?.get(Number(row.id)));
      if (crn) return crn;
    }
    return section.crn;
  };

  const pdfAll = input.pdf.filter(row => row && typeof row === "object");
  const pdfRows = pdfAll.filter(row => !isCrossBranch(row));
  const outOfScopeRows = pdfAll.length - pdfRows.length;
  const liveRows = input.live.filter(row => row && typeof row === "object");
  const sentRows = input.sent ? input.sent.filter(row => row && typeof row === "object") : null;

  const live = indexSections(liveRows, liveCode, liveName, ourCrn);
  const sent = sentRows ? indexSections(sentRows, liveCode, liveName, ourCrn) : null;
  const sentById = new Map<number, Row>((sentRows || []).filter(row => Number(row.id) > 0).map(row => [Number(row.id), row]));
  const sentByCrn = new Map<string, Section>([...(sent?.values() || [])].filter(s => s.crn).map(s => [s.crn, s]));
  const originalByCrn = new Map<string, Row[]>();
  for (const row of crnSource?.original || []) {
    const crn = normalizeCrn(row?.referenceNumber);
    if (crn) originalByCrn.set(crn, [...(originalByCrn.get(crn) || []), row]);
  }
  const pdf = groupPdfRows(pdfRows, pdfCode, pdfName);

  const liveCrns = new Set([...live.values()].map(s => s.crn).filter(Boolean));
  const knownCrns = new Set<string>([...liveCrns, ...sentByCrn.keys(), ...originalByCrn.keys()]);
  const pdfByCrn = new Map<string, Section>([...pdf.sections.values()].filter(s => s.crn).map(s => [s.crn, s]));

  const findings: RegistrarFinding[] = [];
  let uncertainRows = 0;
  const notCompared = { days: 0, time: 0, room: 0, instructor: 0 };

  const codeText = (section?: Section) => (section?.code || "").replace(/\D/g, "") || section?.code || "";
  const add = (finding: Omit<RegistrarFinding, "id" | "ref" | "courseCode" | "courseName" | "courseId" | "section" | "pdfSection" | "crn" | "action"> & { ours?: Section; theirs?: Section; ref?: string }) => {
    const { ours, theirs, ref, ...rest } = finding;
    const id = `${rest.group}:${rest.kind}:${rest.key}`;
    const lead = ours || theirs;
    const crn = theirs?.crn || ours?.crn || "";
    const section = ours?.section || theirs?.section || "";
    const pdfSection = ours && theirs && theirs.section && theirs.section !== ours.section ? theirs.section : undefined;
    const item: RegistrarFinding = {
      id, ref: ref || rest.key, ...(crn ? { crn } : {}),
      courseCode: codeText(lead) || codeText(theirs), courseName: lead?.name || theirs?.name || "",
      courseId: Number(ours?.rows[0]?.AdCourseId || theirs?.rows[0]?.AdCourseId || 0) || undefined,
      section, ...(pdfSection ? { pdfSection } : {}), ...rest,
    };
    const action = requestActionOf(item);
    findings.push(action ? { ...item, action } : item);
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
  const courseDelta = (ours: Section, theirs: Section): FieldDelta => ({
    field: "course", label: REGISTRAR_FIELD_LABEL.course,
    ours: [codeText(ours), ours.name].filter(Boolean).join(" "), pdf: [codeText(theirs), theirs.name].filter(Boolean).join(" ") || "—",
  });
  const sameCourse = (a: Section, b: Section) => (a.full && b.full ? a.full === b.full : !a.tail || !b.tail || a.tail === b.tail);
  /* خانةٌ غير مؤكدة القراءة في أيّ صفٍّ من الشعبة. */
  const certain = (section: Section, field: RegistrarField) => section.rows.every(row => pdfCellCertain(row, field));
  /* النسخة المرسلة من شعبتنا: بمعرّفات صفوفها، ثم برقمها المرجعي، ثم بمفتاحها. */
  const priorOf = (ours: Section): Row[] | undefined => {
    if (!sent) return undefined;
    const byId = ours.rows.map(row => sentById.get(Number(row.id))).filter(Boolean) as Row[];
    if (byId.length) return byId;
    if (ours.crn && sentByCrn.get(ours.crn)) return sentByCrn.get(ours.crn)!.rows;
    return sent.get(ours.key)?.rows;
  };

  /* ── المفتاح الملتبس: مقرران عندنا بالرمز نفسه ───────────────────── */
  const tailCollisions = new Set<string>();
  {
    const seen = new Map<string, Set<string>>();
    for (const section of live.values()) {
      const fullSet = seen.get(section.tail) || new Set<string>();
      fullSet.add(section.full || section.code);
      seen.set(section.tail, fullSet);
    }
    for (const [tail, fulls] of seen) if (fulls.size > 1) tailCollisions.add(tail);
  }
  const usable = (section: Section) => !tailCollisions.has(section.tail) && section.fulls.size <= 1;

  type How = "crn" | "slot" | "key" | "misplaced";
  const pairs: Array<{ ours: Section; theirs: Section; how: How }> = [];
  const pairedLive = new Set<string>();
  const pairedPdf = new Set<string>();
  /* شعبٌ عندنا ذُكرت في التباسٍ: لا تُعدّ «غابت عن ملفهم»، ولا تُحجب عن صفٍّ لاحقٍ من ملفهم يلتبس بها أيضاً. */
  const heldLive = new Set<string>();
  const pair = (ours: Section, theirs: Section, how: How) => { pairs.push({ ours, theirs, how }); pairedLive.add(ours.key); pairedPdf.add(theirs.key); };

  /* ١) الرقم المرجعي: هويةُ الشعبة عند التسجيل نفسه. */
  for (const ours of live.values()) {
    const theirs = ours.crn ? pdfByCrn.get(ours.crn) : undefined;
    if (theirs && !pairedPdf.has(theirs.key)) pair(ours, theirs, "crn");
  }

  /* ما بعد الرقم المرجعي لا يجري إلا بين شعبتين لا يملك أيٌّ منهما رقماً يقرنه بغيرها:
     رقمُنا غائبٌ عن ملفهم، ورقمُهم لا نعرفه. */
  const looseOurs = () => [...live.values()].filter(s => !pairedLive.has(s.key) && (!s.crn || !pdfByCrn.has(s.crn)));
  const loosePdf = () => [...pdf.sections.values()].filter(s => !pairedPdf.has(s.key) && (!s.crn || !knownCrns.has(s.crn)));

  /* ٢) المقرر والموعد نفسه (التسجيل يعيد الترقيم، فالموعدُ قبل الرقم). */
  const signature = (section: Section): string => {
    const parts = meetingsOf(section.rows);
    if (!parts.length || parts.some(m => m.day < 0 || !m.start || !m.end)) return "";
    return [...new Set(parts.map(m => `${m.day}|${m.start}|${m.end}`))].sort().join(";");
  };
  const roomsOf = (section: Section) => meetingsOf(section.rows).map(m => m.room).join("|");
  const slotReady = (theirs: Section) => usable(theirs) && certain(theirs, "days") && certain(theirs, "time") && Boolean(signature(theirs));
  /* أ) الرقم نفسه والموعد نفسه. */
  for (const theirs of loosePdf()) {
    if (!slotReady(theirs)) continue;
    const ours = looseOurs().find(s => usable(s) && sameCourse(s, theirs) && s.section === theirs.section && signature(s) === signature(theirs));
    if (ours) pair(ours, theirs, "slot");
  }
  /* ب) الموعد نفسه برقمٍ آخر: إن انفرد مرشّحٌ واحد (أو انفرد بالقاعة)، وإلا لا تخمين. */
  for (const theirs of loosePdf()) {
    if (!slotReady(theirs)) continue;
    const candidates = looseOurs().filter(s => usable(s) && sameCourse(s, theirs) && signature(s) === signature(theirs));
    const rivals = loosePdf().filter(p => p.key !== theirs.key && slotReady(p) && sameCourse(p, theirs) && signature(p) === signature(theirs));
    const byRoom = candidates.filter(s => roomsOf(s) && roomsOf(s) === roomsOf(theirs));
    /* شعبتان للمقرر في الموعد نفسه بأستاذين: الأستاذ يفرّقهما إن انفرد من الطرفين. */
    const teacher = (a: Section, b: Section) => compareField("instructor", a.rows, b.rows, instructorNames, placeholders) === "same";
    const byTeacher = candidates.filter(s => teacher(s, theirs));
    const teacherRivals = byTeacher.length === 1 ? rivals.filter(p => teacher(byTeacher[0], p)) : [];
    const pick = candidates.length === 1 && !rivals.length ? candidates[0] : byRoom.length === 1 ? byRoom[0]
      : byTeacher.length === 1 && !teacherRivals.length ? byTeacher[0] : undefined;
    if (pick) pair(pick, theirs, "slot");
  }
  /* ب٢) شعبةٌ حذفناها ثم أعدناها، أو أعاد التسجيلُ إنشاءها برقمٍ مرجعيٍّ آخر: ملفُّهم يطبعها برقمٍ
     لا تحمله شعبةٌ عندنا، ورقمُنا (إن وُجد) غائبٌ عن ملفهم. تُعرف بالمقرر والموعد والأستاذ إن انفردت
     من الطرفين — فلا يُطلب منهم حذفُها وإضافتُها. */
  {
    const teacherSame = (a: Section, b: Section) => compareField("instructor", a.rows, b.rows, instructorNames, placeholders) === "same";
    const orphans = [...pdf.sections.values()].filter(t => !pairedPdf.has(t.key) && t.crn && knownCrns.has(t.crn) && !liveCrns.has(t.crn) && slotReady(t));
    for (const theirs of orphans) {
      const candidates = looseOurs().filter(s => usable(s) && sameCourse(s, theirs) && signature(s) === signature(theirs) && teacherSame(s, theirs));
      if (candidates.length !== 1) continue;
      const rivals = orphans.filter(t => t !== theirs && !pairedPdf.has(t.key) && sameCourse(t, theirs) && signature(t) === signature(theirs) && teacherSame(candidates[0], t));
      if (!rivals.length) pair(candidates[0], theirs, "slot");
    }
  }

  /* ج) المقرر ورقم الشعبة نفسه، والموعدُ مختلف: مطابقةٌ بالمفتاح كما كانت. */
  for (const theirs of loosePdf()) {
    if (!theirs.tail || !theirs.section) continue;
    const ours = looseOurs().find(s => s.tail === theirs.tail && s.section === theirs.section);
    if (!ours) continue;
    if (!usable(ours) || theirs.fulls.size > 1) {
      /* رمزان بالنهاية نفسها (قسمان أو كتالوجان): المفتاح لا يكفي لإثبات هويةٍ، فيُسأل صاحبُ الجدول. */
      pairedLive.add(ours.key); pairedPdf.add(theirs.key);
      add({ group: "review", kind: "ambiguous", key: ours.key, ours, theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields: [], match: "exact",
        reason: "مقرران عندكم برمزٍ ينتهي بالرقم نفسه؛ لا أستطيع إثبات أيّهما المقصود." });
      continue;
    }
    pair(ours, theirs, "key");
  }

  /* ٣) ما أضفناه فظهر عندهم بخطأ: الوقت نفسه والأستاذ نفسه، ومعهما المقرر نفسه أو الأيام نفسها.
     لا يُقرن إلا إن انفرد من الجهتين، وإلا «تحتاج نظرك». */
  {
    const daysKey = (section: Section) => [...new Set(meetingsOf(section.rows).filter(m => m.day >= 0).map(m => m.day))].sort().join();
    const timesKey = (section: Section) => [...new Set(meetingsOf(section.rows).filter(m => m.start && m.end).map(m => `${m.start}-${m.end}`))].sort().join();
    const evidence = (ours: Section, theirs: Section) => {
      if (!certain(theirs, "days") || !certain(theirs, "time") || !timesKey(theirs) || timesKey(ours) !== timesKey(theirs)) return false;
      const course = sameCourse(ours, theirs) && Boolean(ours.tail && theirs.tail);
      const days = Boolean(daysKey(theirs)) && daysKey(ours) === daysKey(theirs);
      if (!(course || days) || (course && days)) return false;
      return compareField("instructor", ours.rows, theirs.rows, instructorNames, placeholders) === "same" && instructorIds(theirs.rows).concat(theirs.rows.filter(r => String(r.sourceInstructorText || "").trim()).map(() => 1)).length > 0;
    };
    const oursList = looseOurs();
    const pdfList = loosePdf();
    const claims = new Map<string, Section[]>();
    for (const ours of oursList) {
      const candidates = pdfList.filter(theirs => evidence(ours, theirs));
      if (!candidates.length) continue;
      if (candidates.length > 1) {
        heldLive.add(ours.key);
        add({ group: "review", kind: "ambiguous", key: `${ours.key}~misplaced`, ours, scheduleId: liveId(ours), fields: [], match: "fuzzy",
          reason: `لم أجدها بمقررها وموعدها، ويشبهها في ملفهم ${countOf(candidates.length, AR.section)} بالوقت والأستاذ؛ لا أستطيع إثبات أيّها.` });
        continue;
      }
      claims.set(candidates[0].key, [...(claims.get(candidates[0].key) || []), ours]);
    }
    for (const [pKey, owners] of claims) {
      const theirs = pdf.sections.get(pKey)!;
      if (owners.length === 1 && !pairedLive.has(owners[0].key)) { pair(owners[0], theirs, "misplaced"); continue; }
      pairedPdf.add(pKey);
      owners.forEach(o => pairedLive.add(o.key));
      add({ group: "review", kind: "ambiguous", key: `${pKey}~misplaced`, theirs, page: pageOf(theirs), fields: [], match: "fuzzy",
        reason: "شعبةٌ في ملفهم تشبه أكثر من إضافةٍ عندكم بالوقت والأستاذ؛ لا أستطيع إثبات أيّها." });
    }
  }

  /* ٤) المقرر وحده: مطابقةٌ تقريبية لا تُحسب إلا في «تحتاج نظرك». */
  for (const theirs of loosePdf()) {
    const sameCourseList = looseOurs().filter(s => s.tail && s.tail === theirs.tail);
    const sameSection = looseOurs().filter(s => s.section === theirs.section && foldName(s.name) && foldName(s.name) === foldName(theirs.name));
    const candidates = sameCourseList.length ? sameCourseList : sameSection;
    if (!candidates.length) continue;
    pairedPdf.add(theirs.key);
    if ((candidates.length > 1 || heldLive.has(candidates[0].key)) && sameCourseList.length) {
      add({ group: "review", kind: "ambiguous", key: theirs.key, theirs, page: pageOf(theirs), fields: [], match: "fuzzy",
        reason: `لم أجد لها نظيراً بالرقم المرجعي ولا بالموعد، وللمقرر عندكم ${countOf(candidates.length, AR.section)}؛ لا أستطيع إثبات أيّها.` });
      candidates.forEach(s => heldLive.add(s.key));
      continue;
    }
    const ours = candidates[0];
    pairedLive.add(ours.key);
    const fields: FieldDelta[] = [];
    if (ours.tail !== theirs.tail) fields.push(courseDelta(ours, theirs));
    for (const field of DATA_FIELDS) if (compareField(field, ours.rows, theirs.rows, instructorNames, placeholders) === "diff") fields.push(delta(field, ours.rows, theirs.rows));
    add({ group: "review", kind: "fuzzy", key: `${ours.key}~${theirs.key}`, ref: ours.key, ours, theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields, match: "fuzzy",
      reason: ours.tail === theirs.tail ? "لا رقمَ مرجعيّاً يجمعهما ولا موعدَ؛ وقعت مطابقةٌ بالمقرر وحده." : "المطابقة بالاسم وحده، والرمز لا يوافق." });
  }

  /* ── المقارنة الحقلية لكل زوج ─────────────────────────────────────── */
  for (const { ours, theirs, how } of pairs) {
    const ref = ours.key;
    const match = how === "crn" ? "crn" : how === "misplaced" ? "fuzzy" : "exact";
    /* هويةٌ لم تُقرأ بيقين لا تُبنى عليها مطابقةٌ ولا خلل (الرقم المرجعي وحده يكفي هويةً). */
    if (how !== "crn" && (!certain(theirs, "course") || (how === "key" && !certain(theirs, "section")))) {
      uncertainRows++;
      add({ group: "review", kind: "unreadable", key: `${ref}|identity`, ref, ours, theirs, scheduleId: liveId(ours), page: pageOf(theirs), fields: [], match,
        reason: "قراءة رمز المقرر أو رقم الشعبة من الملف غير مؤكدة." });
      continue;
    }
    const prior = priorOf(ours);
    const original = originalCrnOf(ours) ? originalByCrn.get(originalCrnOf(ours)) : undefined;
    const notSent: FieldDelta[] = [];
    const notApplied: FieldDelta[] = [];
    const hard: FieldDelta[] = [];
    const unsure: Array<{ delta: FieldDelta; why: string }> = [];
    const cmp = (field: RegistrarField, a: readonly Row[], b: readonly Row[]) => compareField(field, a, b, instructorNames, placeholders);
    /* فرقٌ ثابت: هل غيّرناه بعد آخر إرسال (فلم يصلهم)، أم أرسلناه ولم يُنفَّذ، أم يخالف جدولنا؟ */
    const place = (field: RegistrarField, item: FieldDelta, priorSame: Verdict | null, priorTheirs: Verdict | null) => {
      if (prior && priorSame === "diff" && priorTheirs === "same") { notSent.push({ ...item, was: item.pdf }); return; }
      if (prior && priorSame === "same" && original && field !== "course"
        && cmp(field, original, theirs.rows) === "same" && cmp(field, original, ours.rows) === "diff") { notApplied.push(item); return; }
      hard.push(item);
    };
    if (!sameCourse(ours, theirs) && how !== "misplaced") {
      const priorCode = prior ? courseTail(liveCode(prior[0] || {})) : "";
      const item = courseDelta(ours, theirs);
      if (prior && priorCode && priorCode !== ours.tail && priorCode === theirs.tail) notSent.push({ ...item, was: item.pdf });
      else hard.push(item);
    }
    const misplacedFields: FieldDelta[] = [];
    if (how === "misplaced" && !sameCourse(ours, theirs)) misplacedFields.push(courseDelta(ours, theirs));
    for (const field of DATA_FIELDS) {
      const verdict = cmp(field, ours.rows, theirs.rows);
      if (verdict === "unknown") { notCompared[field]++; continue; }
      /* التساوي لا يكفي: خانةٌ لم تُقرأ بيقين تساوت صدفةً تبقى «تحتاج نظرك» لا «مطابق». */
      if (verdict === "same" && !certain(theirs, field)) { unsure.push({ delta: delta(field, ours.rows, theirs.rows), why: "قراءة هذه الخانة من الملف غير مؤكدة" }); continue; }
      if (verdict === "same") continue;
      if (verdict === "unsure") { unsure.push({ delta: delta(field, ours.rows, theirs.rows), why: "الاسم المطبوع لم يُربط بأستاذٍ مسجّل ولا يوافق اسمكم" }); continue; }
      if (!certain(theirs, field)) { unsure.push({ delta: delta(field, ours.rows, theirs.rows), why: "قراءة هذه الخانة من الملف غير مؤكدة" }); continue; }
      if (how === "misplaced") { misplacedFields.push(delta(field, ours.rows, theirs.rows)); continue; }
      place(field, delta(field, ours.rows, theirs.rows), prior ? cmp(field, prior, ours.rows) : null, prior ? cmp(field, prior, theirs.rows) : null);
    }
    const common = { ours, theirs, ref, scheduleId: liveId(ours), page: pageOf(theirs), match } as const;
    if (how === "misplaced") {
      add({ ...common, group: "mismatch", kind: "misplaced", key: `${ref}~${theirs.key}`, fields: misplacedFields,
        reason: "أضفتموها فظهرت في ملفهم بخطأ؛ عُرفت بالوقت والأستاذ." });
    }
    if (notApplied.length) add({ ...common, group: "notApplied", kind: "notChanged", key: ref, fields: notApplied });
    if (notSent.length) add({ ...common, group: "notSent", kind: "notChanged", key: ref, fields: notSent });
    if (hard.length) add({ ...common, group: "mismatch", kind: "fields", key: ref, fields: hard });
    for (const item of unsure) {
      uncertainRows++;
      add({ ...common, group: "review", kind: "unreadable", key: `${ref}|${item.delta.field}`, fields: [item.delta], reason: item.why });
    }
    /* رقمُنا المرجعي الأصلي غاب عن ملفهم، ووُجدت الشعبة برقمٍ جديد: يُنبَّه إليه. */
    const crnMoved = how !== "crn" && ours.crn && theirs.crn && ours.crn !== theirs.crn && originalByCrn.has(ours.crn) && !originalByCrn.has(theirs.crn);
    if (crnMoved) add({ ...common, group: "review", kind: "crnChanged", key: `${ref}|crn`, fields: [],
      reason: `رقمها المرجعي ${ours.crn} غاب عن ملفهم، ووُجدت بالموعد نفسه برقمٍ جديد ${theirs.crn}.` });
    if (how !== "misplaced" && !notApplied.length && !notSent.length && !hard.length && !unsure.length && !crnMoved) {
      add({ ...common, group: "matched", kind: "ok", key: ref, fields: [] });
    }
  }

  /* ── هويةُ كل شعبةٍ عُرفت: أساسُ «اعتمد ترقيم التسجيل» ───────────────── */
  const identities: RegistrarIdentity[] = [];
  {
    const sameSlot = <T extends Section>(list: Iterable<T>, target: Section) => [...list].filter(s => sameCourse(s, target) && signature(s) && signature(s) === signature(target)).length;
    const printedSection = (theirs: Section) => {
      const value = theirs.section;
      return /^\d{3}$/.test(value) && Number(value) >= 501 && Number(value) <= 999 ? value : "";
    };
    const storedCrn = (ours: Section) => {
      const set = new Set(ours.rows.map(row => normalizeCrn(row.referenceNumber)));
      return set.size === 1 ? [...set][0] : [...set].filter(Boolean).join("/");
    };
    for (const { ours, theirs, how } of pairs) {
      const ids = [...new Set(ours.rows.map(row => Number(row.id)).filter(id => id > 0))];
      const readable = theirs.rows.every(row => String(row.sourceReadMode || "") === "pdf-text") && certain(theirs, "course") && certain(theirs, "section");
      /* الانفراد بالمقرر والموعد والأستاذ معاً: شعبتان للمقرر في الموعد نفسه بأستاذين تُعرف كلٌّ بأستاذها. */
      const teacherAgrees = (a: Section, b: Section) => compareField("instructor", a.rows, b.rows, instructorNames, placeholders) === "same";
      const teacher = teacherAgrees(ours, theirs);
      const unique = [...live.values()].filter(s => sameSlot([s], theirs) && teacherAgrees(s, theirs)).length === 1
        && [...pdf.sections.values()].filter(p => sameSlot([p], ours) && teacherAgrees(ours, p)).length === 1;
      let reason = "";
      if (!ids.length) reason = "لا موعد عندكم يحمل هذه الشعبة.";
      else if (!readable) reason = "رقم الشعبة في ملفهم لم يُقرأ من طبقة النص.";
      else if (!printedSection(theirs) || !theirs.crn) reason = "ملفهم لم يطبع رقم شعبةٍ ورقماً مرجعياً صالحين.";
      else if (how === "misplaced" || how === "key") reason = "عُرفت تقريباً لا بيقين.";
      else if (how === "slot" && !teacher) reason = "الأستاذ لا يوافق، فلا أحكم بأنها هي.";
      else if (how === "slot" && !unique) reason = "في الموعد نفسه أكثر من شعبةٍ للمقرر بالأستاذ نفسه.";
      identities.push({
        ref: ours.key, ids, courseId: Number(ours.rows[0]?.AdCourseId || 0) || undefined,
        courseCode: codeText(ours) || codeText(theirs), courseName: ours.name || theirs.name || "",
        ours: { section: ours.section, crn: storedCrn(ours) },
        theirs: { section: printedSection(theirs) || theirs.section, crn: theirs.crn },
        how, certain: !reason, ...(reason ? { reason } : {}),
      });
    }
  }

  /* ── ما في ملفهم وحده ─────────────────────────────────────────────── */
  for (const theirs of pdf.sections.values()) {
    if (pairedPdf.has(theirs.key)) continue;
    const known = theirs.crn && knownCrns.has(theirs.crn);
    const sentAgain = theirs.crn ? sentByCrn.get(theirs.crn) : sent?.get(theirs.key);
    const deletedByUs = known || (!theirs.crn && sentAgain && !live.has(theirs.key));
    if (deletedByUs && sent) {
      if (sentAgain) add({ group: "notSent", kind: "notRemoved", key: theirs.key, ours: sentAgain, theirs, page: pageOf(theirs), fields: [], match: theirs.crn ? "crn" : "exact",
        reason: "حذفتموها بعد آخر إرسال، وما زالت في ملفهم." });
      else add({ group: "notApplied", kind: "notRemoved", key: theirs.key, theirs, page: pageOf(theirs), fields: [], match: "crn",
        reason: "طلبتم حذفها وما زالت في ملفهم." });
    } else if (deletedByUs) {
      add({ group: "mismatch", kind: "notRemoved", key: theirs.key, theirs, page: pageOf(theirs), fields: [], match: "crn",
        reason: "حذفتموها من جدولكم وما زالت في ملفهم." });
    } else {
      add({ group: "mismatch", kind: "onlyPdf", key: theirs.key, theirs, page: pageOf(theirs), fields: [
        delta("days", [], theirs.rows), delta("time", [], theirs.rows),
      ].map(item => ({ ...item, ours: "—" })), match: theirs.crn ? "crn" : "exact", reason: "في ملفهم وليست في جدولكم." });
    }
  }

  /* ── ما عندنا وحدنا ──────────────────────────────────────────────── */
  for (const ours of live.values()) {
    if (pairedLive.has(ours.key) || heldLive.has(ours.key)) continue;
    const prior = priorOf(ours);
    const original = Boolean(originalCrnOf(ours) && originalByCrn.has(originalCrnOf(ours)));
    const fields = (["days", "time", "room", "instructor"] as const).map(field => ({ ...delta(field, ours.rows, []), pdf: "—" }));
    const common = { ours, scheduleId: liveId(ours), fields, match: (ours.crn ? "crn" : "exact") as RegistrarFinding["match"] };
    if (sent && !prior) {
      add({ ...common, group: "notSent", kind: "notAdded", key: ours.key, reason: "أضفتموها بعد آخر إرسال، ولم تظهر في ملفهم." });
    } else if (sent && !original) {
      add({ ...common, group: "notApplied", kind: "notAdded", key: ours.key, reason: "أرسلتم إضافتها ولم تظهر في ملفهم." });
    } else {
      add({ ...common, group: "mismatch", kind: "onlyOurs", key: ours.key,
        reason: original && ours.crn ? `رقمها المرجعي ${ours.crn} غاب عن ملفهم.` : "في جدولكم وغابت عن ملفهم." });
    }
  }

  /* ── صفوف الملف التي بلا مفتاح: لا تُهمَل ولا تُخمَّن ─────────────── */
  for (const row of pdf.keyless) {
    uncertainRows++;
    const code = pdfCode(row);
    add({ group: "review", kind: "noKey", key: `nokey:${row.sourceOrder ?? findings.length}`, page: Number(row.sourcePage || 0) || undefined, fields: [], match: "none",
      theirs: { key: "", tail: "", full: "", fulls: new Set<string>(), section: sectionOf(row.sourceSectionText || row.SCode), crn: "", rows: [row], name: pdfName(row), code },
      reason: courseTail(code) ? "رقم الشعبة لم يُقرأ بوضوح." : "رمز المقرر لم يُقرأ بوضوح." });
  }

  const order: Record<FindingGroup, number> = { notApplied: 0, notSent: 1, mismatch: 2, review: 3, matched: 4 };
  findings.sort((a, b) => order[a.group] - order[b.group]
    || a.courseCode.localeCompare(b.courseCode, "en", { numeric: true })
    || a.section.localeCompare(b.section, "en", { numeric: true }));

  const count = (group: FindingGroup) => findings.filter(item => item.group === group).length;
  /* الشعبة تُحسب مرّةً واحدة في المجموعة ولو حملت أكثر من بطاقة. */
  const distinct = (group: FindingGroup) => new Set(findings.filter(item => item.group === group).map(item => item.ref)).size;
  const counts: RegistrarCounts = { matched: count("matched"), mismatch: distinct("mismatch"), notSent: distinct("notSent"), notApplied: distinct("notApplied"), review: distinct("review"), total: 0 };
  counts.total = new Set(findings.map(item => item.ref)).size;
  const empty = !pdfRows.length && !liveRows.length ? "both" : !pdfRows.length ? "pdfEmpty" : !liveRows.length ? "liveEmpty" : null;
  return {
    findings, counts,
    percent: empty || !counts.total ? null : Math.round((counts.matched / counts.total) * 100),
    baseline: { available: Boolean(input.sent), crn: Boolean(crnSource && originalByCrn.size) },
    reading: { pdfRows: pdfRows.length, liveRows: liveRows.length, outOfScopeRows, uncertainRows, notCompared },
    empty,
    identities,
  };
}

/**
 * ملفٌّ لا يشبه جدولنا: قُرئت منه شعبٌ كثيرة ولم تُعرف واحدةٌ منها شعبةً عندنا — ملفُّ قسمٍ آخر
 * أو فصلٍ آخر في الغالب. يُقال ذلك صراحةً، ولا يُحفظ منه طلبٌ ولا تُطابَق به أرقام.
 */
export function looksForeign(result: Pick<RegistrarCheckResult, "empty" | "reading" | "identities">): boolean {
  /* الحكم بالهوية لا بالتطابق: ملفٌّ صحيح تغيّرت فيه قاعاتُ الشعب كلّها يبقى ملفَّنا، ما دامت شعبُه
     عُرفت عندنا (بالرقم المرجعي أو بمطابقةٍ مؤكدة). */
  const paired = (result.identities || []).some(identity => identity.how === "crn" || identity.certain);
  return !result.empty && !paired && result.reading.pdfRows >= 5 && result.reading.liveRows >= 5;
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
