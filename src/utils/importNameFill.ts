/**
 * ── تعبئة أسماء الأساتذة في استيراد PDF (L4) ─────────────────────────────────
 *
 * سطورٌ مستوردة بلا اسم أستاذ تُعبّأ من مصدرٍ ثانٍ — الجدول الحالي، أو PDF ثانٍ فيه
 * الأسماء — بشرطٍ واحدٍ لا يُتساهل فيه: **تطابقُ السطر ١٠٠٪** في المقرر (ورمزه)،
 * والشعبة، والأيام، والوقت، والقاعة (والكلية والفصل نطاقُ الاستيراد نفسه).
 *
 *   ✅ match    تطابقٌ تامّ لسطرٍ واحد ← يُملأ حقلُ الاسم وحده
 *   ⚠️ partial  سطرٌ واحدٌ يطابق في المقرر والشعبة ويختلف في شيءٍ آخر ← يُعرض الفرقُ بالضبط، والمستخدمُ يقرّر
 *   ❌ none     لا سطرَ مقابل، أو أكثرُ من سطرٍ تام (لا تخمين)، أو اسمٌ لا يُعرف صاحبُه
 *
 * لا يُغيَّر في السطر إلا AdInstructorId، ولا يُمسّ سطرٌ يحمل أستاذاً. والتراجعُ
 * يعيد السطور كما كانت حرفاً بحرف.
 */
import { sortTermsNewest } from "./termSequence";

export interface FillRow {
  AdCourseId: number;
  SCode: string;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
  fstarttime: string; fendtime: string;
  AdRoomCode?: string; AdRoomHall?: string;
  AdInstructorId: number;
  [extra: string]: unknown;
}
export interface SourceRow extends FillRow {
  /** للمصدر PDF: نصُّ الاسم كما قُرئ (يُحلّ إلى رقم أستاذ بقاعدة الأسماء أدناه). */
  instructorText?: string;
  sourceCourseCode?: string;
}
export type FillField = "days" | "time" | "room" | "course" | "section";
export interface FillDecision {
  index: number;
  status: "match" | "partial" | "none";
  instructorId: number;
  instructorName: string;
  /** للجزئي: الحقول المختلفة بقيمتيها. */
  diffs: Array<{ field: FillField; mine: string; theirs: string }>;
  reason?: string;
}

const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const DAY_LETTER = ["ح", "ن", "ث", "ر", "خ"];
const clock = (value: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim()); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : String(value || "").trim(); };
const token = (value: unknown) => String(value ?? "").replace(/[\s‏‎ـ]+/g, "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).toUpperCase();
const daysOf = (row: FillRow) => DAYS.map((day, i) => (row[day] ? DAY_LETTER[i] : "")).join("");
const timeOf = (row: FillRow) => `${clock(row.fstarttime)}–${clock(row.fendtime)}`;
const roomOf = (row: FillRow) => `${token(row.AdRoomCode)}/${token(row.AdRoomHall)}`;

function compare(a: FillRow, b: FillRow): Array<{ field: FillField; mine: string; theirs: string }> {
  const out: Array<{ field: FillField; mine: string; theirs: string }> = [];
  if (Number(a.AdCourseId) !== Number(b.AdCourseId)) out.push({ field: "course", mine: String(a.AdCourseId), theirs: String(b.AdCourseId) });
  if (token(a.SCode) !== token(b.SCode)) out.push({ field: "section", mine: String(a.SCode), theirs: String(b.SCode) });
  if (daysOf(a) !== daysOf(b)) out.push({ field: "days", mine: daysOf(a), theirs: daysOf(b) });
  if (timeOf(a) !== timeOf(b)) out.push({ field: "time", mine: timeOf(a), theirs: timeOf(b) });
  if (roomOf(a) !== roomOf(b)) out.push({ field: "room", mine: `${a.AdRoomCode || ""}/${a.AdRoomHall || ""}`, theirs: `${b.AdRoomCode || ""}/${b.AdRoomHall || ""}` });
  return out;
}

/**
 * ── مطابقة الاسم بلا تخمين ────────────────────────────────────────────────────
 * تسامحٌ في الكتابة وحدها: «د./أ./م.» في أوله، الهمزات (أإآ←ا، ؤ←و، ئ←ي، ة←ه، ى←ي)،
 * المسافات والتطويل. ثم تطابقٌ تامّ للاسم المطبَّع مع اسمٍ واحدٍ من أعضاء القسم ومنتدبيه
 * في ذلك الفصل. اسمان يطابقان ← لا شيء (لا يُختار أحدهما).
 */
/* وسمُ الصفة بعد الاسم — «(منتدب)»، «- منتدبة»، «متقاعد»، «متفرغ» — ليس من الاسم:
   الجدول والسجلّ يكتبانه حيناً ويتركانه حيناً، فكان الاسمُ الصحيح «لا يُعرف صاحبه». */
const ROLE_SUFFIX = /[\s\-–—(]*(?:منتدب|منتدبه|منتدبة|متقاعد|متقاعده|متقاعدة|متفرغ|متفرغه|متفرغة)\s*\)?\s*$/u;

export function normalizeArabicName(value: unknown): string {
  let text = String(value ?? "").normalize("NFKC")
    .replace(/[\u064B-\u0652\u0670\u0640\u200c-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/^\s*(?:(?:أ\.?\s*م\.?\s*د|ا\.?\s*م\.?\s*د|أ\.?\s*د|ا\.?\s*د|د|أ|ا|م|الدكتور|الدكتورة|الاستاذ|الأستاذ|الاستاذة|الأستاذة)\s*[./]\s*|(?:الدكتور|الدكتورة|الاستاذ|الأستاذ|الاستاذة|الأستاذة)\s+)+/u, "");
  for (let guard = 0; guard < 3 && ROLE_SUFFIX.test(text); guard++) text = text.replace(ROLE_SUFFIX, "");
  return text
    .replace(/[أإآٱ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, "").trim();
}

export function resolveInstructorName(text: unknown, people: ReadonlyArray<{ AdInstructorId: number; AdInstructorName: string }>): { id: number; name: string } | { id: 0; reason: "empty" | "unknown" | "ambiguous" } {
  const wanted = normalizeArabicName(text);
  if (!wanted) return { id: 0, reason: "empty" };
  const hits = people.filter(person => normalizeArabicName(person.AdInstructorName) === wanted);
  const unique = [...new Map(hits.map(person => [Number(person.AdInstructorId), person])).values()];
  if (unique.length === 1) return { id: Number(unique[0].AdInstructorId), name: unique[0].AdInstructorName };
  return { id: 0, reason: unique.length ? "ambiguous" : "unknown" };
}

/**
 * يقرّر لكل سطرٍ بلا أستاذ. `source` إمّا صفوفُ الجدول الحالي (تحمل AdInstructorId)
 * أو سطورُ PDF ثانٍ (تحمل instructorText تُحلّ بـ`people`).
 */
export function planNameFill(rows: readonly FillRow[], source: readonly SourceRow[],
  people: ReadonlyArray<{ AdInstructorId: number; AdInstructorName: string }>, placeholderIds: ReadonlySet<number> = new Set()): FillDecision[] {
  const nameOf = new Map(people.map(person => [Number(person.AdInstructorId), person.AdInstructorName]));
  const personOf = (src: SourceRow): { id: number; name: string; reason?: string } => {
    const id = Number(src.AdInstructorId || 0);
    if (id && !placeholderIds.has(id)) return { id, name: nameOf.get(id) || "" };
    if (src.instructorText) {
      const hit = resolveInstructorName(src.instructorText, people);
      return hit.id ? { id: hit.id, name: (hit as any).name } : { id: 0, name: "", reason: (hit as any).reason === "ambiguous" ? "الاسم يطابق أكثر من أستاذ" : "الاسم ليس من أعضاء القسم أو منتدبيه" };
    }
    return { id: 0, name: "", reason: "المصدر بلا أستاذ" };
  };
  return rows.map((row, index) => {
    if (Number(row.AdInstructorId || 0) && !placeholderIds.has(Number(row.AdInstructorId))) {
      return { index, status: "none" as const, instructorId: 0, instructorName: "", diffs: [], reason: "السطر يحمل أستاذاً" };
    }
    const exact = source.filter(src => compare(row, src).length === 0);
    if (exact.length === 1) {
      const who = personOf(exact[0]);
      return who.id
        ? { index, status: "match" as const, instructorId: who.id, instructorName: who.name, diffs: [] }
        : { index, status: "none" as const, instructorId: 0, instructorName: "", diffs: [], reason: who.reason };
    }
    if (exact.length > 1) {
      const ids = new Set(exact.map(src => personOf(src).id));
      if (ids.size === 1 && !ids.has(0)) { const who = personOf(exact[0]); return { index, status: "match" as const, instructorId: who.id, instructorName: who.name, diffs: [] }; }
      return { index, status: "none" as const, instructorId: 0, instructorName: "", diffs: [], reason: "أكثر من سطرٍ مطابق بأساتذة مختلفين" };
    }
    /* الجزئي: نفس المقرر والشعبة، سطرٌ واحد، والفرقُ معروضٌ بالضبط. */
    const near = source.filter(src => Number(src.AdCourseId) === Number(row.AdCourseId) && token(src.SCode) === token(row.SCode));
    if (near.length === 1) {
      const who = personOf(near[0]);
      if (who.id) return { index, status: "partial" as const, instructorId: who.id, instructorName: who.name, diffs: compare(row, near[0]) };
      return { index, status: "none" as const, instructorId: 0, instructorName: "", diffs: [], reason: who.reason };
    }
    return { index, status: "none" as const, instructorId: 0, instructorName: "", diffs: [], reason: near.length ? "أكثر من سطرٍ قريب — لا تخمين" : "لا سطرَ مقابل" };
  });
}

export function fillSummary(decisions: readonly FillDecision[]) {
  const eligible = decisions.filter(row => row.reason !== "السطر يحمل أستاذاً");
  return {
    total: eligible.length,
    match: eligible.filter(row => row.status === "match").length,
    partial: eligible.filter(row => row.status === "partial").length,
    none: eligible.filter(row => row.status === "none").length,
  };
}

/**
 * يطبّق: المطابقُ التامّ دائماً، والجزئيُّ ما وافق عليه المستخدم فقط. يغيّر الاسم وحده
 * — ومعه برهانُه. كان البرهانُ يبقى «UNRESOLVED» من القراءة الأولى، فتُصبغ خانةُ الأستاذ
 * بالأحمر وفيها الاسمُ الصحيح (الأحمر في المعاينة يقرأ البرهان لا الاسم). الاسمُ هنا
 * اعتمده المستخدم بعد معاينةٍ صريحة، فبرهانُه يدويّ مؤكَّد كأنه اختاره من القائمة.
 */
export function applyNameFill<T extends FillRow>(rows: readonly T[], decisions: readonly FillDecision[], acceptedPartials: ReadonlySet<number> = new Set(), sourceLabel = ""): T[] {
  const byIndex = new Map(decisions.map(row => [row.index, row]));
  return rows.map((row, index) => {
    const decision = byIndex.get(index);
    if (!decision || !decision.instructorId) return row;
    if (decision.status === "match" || (decision.status === "partial" && acceptedPartials.has(index))) {
      const evidence = (row as any).importEvidence;
      const prior = (evidence && typeof evidence === "object" ? evidence.instructor : null) || {};
      return {
        ...row,
        AdInstructorId: decision.instructorId,
        importEvidence: {
          ...(evidence && typeof evidence === "object" ? evidence : {}),
          instructor: {
            ...prior,
            canonical: String(decision.instructorId),
            confidence: "CONFIRMED", score: 100, source: "MANUAL", method: "NAME_FILL", derived: false,
            reason: `عُبّئ الاسم ${sourceLabel ? `${sourceLabel} ` : ""}${decision.status === "match" ? "بتطابق السطر ١٠٠٪" : "بعد قبول الفرق"} واعتُمد في المعاينة.`,
          },
        },
      };
    }
    return row;
  });
}

export const FILL_FIELD_LABEL: Record<FillField, string> = { course: "المقرر", section: "الشعبة", days: "الأيام", time: "الوقت", room: "القاعة" };

/**
 * ── من أيّ فصلٍ تُؤخذ الأسماء ─────────────────────────────────────────────
 * الفصلُ المفتوح نفسه، والفصلُ الدراسي الذي قبله مباشرة (الصيفي لا يُعدّ «سابقاً»:
 * جدوله قصيرٌ وأساتذته غير أساتذة الفصل). كلاهما مقبول، والمطابقةُ ١٠٠٪ هي هي.
 */
export function nameFillSourceTerms(terms: ReadonlyArray<{ AdTermId: number; AdTermName: string }>, termId: number): Array<{ id: number; name: string; short: string }> {
  const sorted = sortTermsNewest(terms.filter(term => Number(term.AdTermId) > 0));
  const at = sorted.findIndex(term => Number(term.AdTermId) === Number(termId));
  const current = at >= 0 ? sorted[at] : null;
  const out = [{ id: Number(termId), name: String(current?.AdTermName || "هذا الفصل"), short: "هذا الفصل" }];
  if (at < 0) return out;
  const previous = sorted.slice(at + 1).find(term => !/صيفي|صيفى/.test(String(term.AdTermName || "")));
  if (previous) out.push({ id: Number(previous.AdTermId), name: String(previous.AdTermName || ""), short: "الفصل السابق" });
  return out;
}

/**
 * ── ما ردّه الخادم على الملف الثاني، بكلماتٍ يعمل بها المستخدم ─────────────────
 * الخادم يردّ بطريقتين: سطورَ NDJSON (تقدّم، ثم `done` أو `error`)، أو كائنَ JSON
 * واحداً بلا `type` حين يرفض قبل القراءة (403 نطاق، 409 فصل/فرع/قسم آخر، 413 حجم،
 * 422 ترويسة أو صورة، 503 القراءة مشغولة). كانت الشاشة تقرأ الأولى وحدها، فكل رفضٍ
 * من الثانية صار «تعذّر قراءة الملف الثاني» بلا سبب.
 */
export function nameFillPdfOutcome(status: number, text: string): { rows: any[] } | { error: string; code?: string } {
  let result: any = null, failure: any = null, plain: any = null;
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: any;
    try { event = JSON.parse(trimmed); } catch { continue; }
    if (event?.type === "done") result = event.result;
    else if (event?.type === "error") failure = event;
    else if (!event?.type && event && typeof event === "object") plain = event;
  }
  if (!result && plain && Array.isArray(plain.rows)) result = plain;
  const problem = failure || (!result ? plain : null);
  if (problem?.error) {
    const code = String(problem.code || "");
    /* «للفصل الفارغ فقط» لا معنى له هنا: التعبئة لا تكتب، فلا يُعرض للمستخدم سببُ حفظٍ لم يطلبه. */
    if (code === "PDF_TARGET_TERM_OCCUPIED") return { error: "الخادم عامل الملف الثاني كاستيرادٍ للحفظ لا كقراءةٍ للأسماء. حدّث الصفحة ثم أعد المحاولة.", code };
    return { error: `الملف الثاني: ${String(problem.error)}`, code: code || undefined };
  }
  if (!result) {
    if (status === 0) return { error: "انقطع الاتصال قبل أن يصل الملف الثاني. تحقّق من الشبكة ثم أعد الرفع." };
    if (status === 401) return { error: "انتهت الجلسة. سجّل الدخول ثم أعد رفع الملف الثاني." };
    if (status === 403) return { error: "لا صلاحية لك لقراءة جداول هذا القسم." };
    if (status === 413) return { error: "الملف الثاني أكبر من 24 ميغابايت. صغّر حجمه أو ارفع صفحات الجدول وحدها." };
    if (status === 503) return { error: "قراءة المستندات مشغولة الآن. أعد المحاولة بعد دقيقة." };
    if (status >= 500) return { error: `توقّف الخادم أثناء قراءة الملف الثاني (رمز ${status}). أعد المحاولة؛ وإن تكرّر فأبلغ إدارة النظام.` };
    return { error: "انقطعت قراءة الملف الثاني قبل نهايتها. أعد الرفع؛ وإن تكرّر فارفع نسخةً أوضح." };
  }
  const rows = Array.isArray(result.rows) ? result.rows : [];
  if (!rows.length) return { error: "لم تُقرأ من الملف الثاني أي شعبة. ارفع جدول القسم الرسمي نفسه بصيغة PDF.", code: "NO_ROWS" };
  if (!rows.some((row: any) => String(row?.sourceInstructorText || "").trim() || Number(row?.AdInstructorId || 0))) {
    return { error: "الملف الثاني بلا أسماء أساتذة: كل خانات الأستاذ فيه فارغة. ارفع النسخة التي تحمل الأسماء.", code: "NO_NAMES" };
  }
  return { rows };
}
