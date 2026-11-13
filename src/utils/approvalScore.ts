/**
 * ── درجة الاعتماد: معادلةٌ تُقرأ، لا رقمٌ يُصدَّق ─────────────────────────────
 *
 * «81/100» كانت صحيحة الحساب لكنها صامتة: لا يعرف القارئ من أين جاءت، ولا ماذا
 * يرفعها. المعادلة هنا واحدة ومكتوبة:
 *
 *     الدرجة = المواعيد السليمة ÷ كل مواعيد النطاق × 100
 *
 * و«السليم» موعدٌ لا يمسّه بندٌ أصلاً. كل موعدٍ يُعدّ مرّةً واحدة عند أول فئةٍ
 * تمسّه بترتيب الخطورة، فمجموع شرائح الحلقة + السليم = كل المواعيد.
 * و«لو عالجت هذا» حسابٌ صريح: المواعيد التي لا يحبسها إلا هذا البند تُحتسب،
 * فتصير الدرجة (المحتسب + هي) ÷ الكل. لا تقدير ولا وزن مخفيّ.
 *
 * نقيٌّ بلا React ولا شبكة، ليُختبر وحده (tests/approval-review-audit.ts).
 */

import { AR, countOf, nounFor } from "./arabicCount";

/**
 * ── قاعدةٌ واحدة لكل أنواع البنود (المالك 2026-11-13) ──────────────────────
 *
 * ثلاث درجاتٍ لا غير، يقرؤها الرأس والشريط والحلقة والورقة المطبوعة من هنا:
 *
 *   block       مانعٌ مادي (تعارض)       ← «تمنع الاعتماد»، يُنقص الدرجة
 *   regulation  بندٌ يحتاج معالجة         ← «للمعالجة»، يُنقص الدرجة
 *   note        ملاحظةٌ لا تمنع (تنبيهٌ،
 *               خارج سُلّم اللائحة…)      ← «للملاحظة»، لا يُنقص الدرجة
 *
 * فـ«السليم» موعدٌ لا يمسّه شيء، والملاحظةُ تُرى في العنوان والشريط ولا تُنقص
 * الدرجة (قرار المالك 2026-10-30: السُّلّم تنبيهٌ لا يُنقص). والمعادلة تقول ذلك:
 * (السليم + للملاحظة) ÷ الكل × 100.
 */
export type ScoreTone = "block" | "regulation" | "note";

export interface ScoreCategoryInput {
  key: string;
  label: string;
  tone: ScoreTone;
  rowIds: readonly number[];
}

export interface ScoreSegment {
  key: string;
  label: string;
  tone: ScoreTone;
  /** Appointments this category is the first (worst) to touch — its slice of the ring. */
  count: number;
  /** Every appointment in scope it touches, shared or not. */
  touched: number;
  /** Appointments only this category holds back: fixing it alone lets them count. */
  exclusive: number;
  /** The score once this category alone is fixed (a note never changes it). */
  projected: number;
  /** Row ids in scope it touches, for «عالج». */
  rowIds: number[];
}

export interface ApprovalScoreBreakdown {
  total: number;
  /** Appointments nothing touches. */
  clean: number;
  /** Appointments only a note touches: shown, never subtracted. */
  noted: number;
  score: number;
  segments: ScoreSegment[];
  /** The same arithmetic, as a sentence the reader can check by hand. */
  formula: string;
}

const pct = (part: number, whole: number) => (whole ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 100);
const TONE_RANK: Record<ScoreTone, number> = { block: 0, regulation: 1, note: 2 };
const reduces = (tone: ScoreTone) => tone !== "note";

export function approvalScoreBreakdown(scopeRowIds: readonly number[], categories: readonly ScoreCategoryInput[]): ApprovalScoreBreakdown {
  const scope = new Set(scopeRowIds.map(Number).filter(Number.isFinite));
  const total = scope.size;
  const touchedBy = new Map<number, string[]>();
  const heldBy = new Map<number, string[]>();
  const owner = new Map<number, string>();
  const ordered = [...categories].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
  for (const category of ordered) {
    for (const id of new Set(category.rowIds.map(Number))) {
      if (!scope.has(id)) continue;
      touchedBy.set(id, [...(touchedBy.get(id) || []), category.key]);
      if (reduces(category.tone)) heldBy.set(id, [...(heldBy.get(id) || []), category.key]);
      if (!owner.has(id)) owner.set(id, category.key);
    }
  }
  const clean = total - touchedBy.size;
  const counted = total - heldBy.size;
  const noted = counted - clean;
  const score = pct(counted, total);
  const segments: ScoreSegment[] = ordered.map(category => {
    const ids = [...new Set(category.rowIds.map(Number))].filter(id => scope.has(id));
    const exclusive = reduces(category.tone) ? ids.filter(id => (heldBy.get(id) || []).length === 1).length : 0;
    return {
      key: category.key,
      label: category.label,
      tone: category.tone,
      count: ids.filter(id => owner.get(id) === category.key).length,
      touched: ids.length,
      exclusive,
      projected: pct(counted + exclusive, total),
      rowIds: ids,
    };
  }).filter(segment => segment.touched > 0);
  const n = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
  return {
    total, clean, noted, score, segments,
    formula: !total ? "لا مواعيد في النطاق"
      : noted ? `(السليم ${n(clean)} + للملاحظة ${n(noted)}) ÷ الكل ${n(total)} × 100 = ${n(score)}`
      : `السليم ${n(clean)} ÷ الكل ${n(total)} × 100 = ${n(score)}`,
  };
}

/** كل موعدٍ مرّةً واحدة عند أخطر ما يمسّه: الشريط ومفاتيحه على الشاشة وعلى الورقة. */
export interface ApprovalSpread { high: number; medium: number; low: number; clean: number; total: number }
export function approvalSpread(breakdown: ApprovalScoreBreakdown): ApprovalSpread {
  const sum = (tone: ScoreTone) => breakdown.segments.filter(segment => segment.tone === tone).reduce((acc, segment) => acc + segment.count, 0);
  return { high: sum("block"), medium: sum("regulation"), low: sum("note"), clean: breakdown.clean, total: Math.max(1, breakdown.total) };
}

/** مفاتيح الشريط بعبارةٍ واحدة: العدد بمعدوده (countOf) ثم ما يقوله عنه. */
export function approvalSpreadKeys(spread: ApprovalSpread): Array<{ tone: "high" | "medium" | "low" | "clean"; count: number; counted: string; tail: string }> {
  const keys: Array<{ tone: "high" | "medium" | "low" | "clean"; count: number; counted: string; tail: string }> = [
    { tone: "high", count: spread.high, counted: countOf(spread.high, AR.appointment), tail: nounFor(spread.high, AR.blockVerb) + " الاعتماد" },
    { tone: "medium", count: spread.medium, counted: countOf(spread.medium, AR.appointment), tail: "للمعالجة" },
    { tone: "low", count: spread.low, counted: countOf(spread.low, AR.appointment), tail: "للملاحظة" },
    { tone: "clean", count: spread.clean, counted: countOf(spread.clean, AR.appointment), tail: nounFor(spread.clean, AR.soundAdj) },
  ];
  return keys.filter(key => key.count > 0);
}

/**
 * عنوان المراجعة — للشاشة وللورقة المطبوعة معاً، فلا يقول أحدهما غير الآخر.
 * كل درجةٍ من البنود تظهر فيه: مانع ← «يوجد ما يمنع»، معالجة ← «بنود للمعالجة»،
 * ملاحظةٌ وحدها ← «ملاحظات».
 */
export function approvalVerdict(input: { checked: boolean; blocking: number; readinessError: boolean; needsFix: number; notes: number; unclassified: number }): string {
  if (!input.checked) return "أتحقق من الموانع…";
  if (input.blocking) return "يوجد ما يمنع الاعتماد";
  if (input.readinessError) return "تعذر فحص الموانع خارج القسم";
  if (input.needsFix) return "لا مانع للتوقيع · بنود للمعالجة";
  if (input.notes) return "لا مانع للتوقيع · ملاحظات";
  if (input.unclassified) return "يلزم استكمال بيانات التدريس";
  return "لا توجد موانع ظاهرة";
}

/**
 * هل في المراجعة ما يُعرض؟ ملاحظاتُ «خارج سُلّم اللائحة» (ladderNotes) لا تدخل
 * groupedFindings، فكان قسمٌ ليس عنده غيرُها — تكنولوجيا التعليم بنين في الفصل
 * الثاني 2026/2027 — يرى «لا ملاحظات» وعنده خمس. كلُّ ما يُرسم يُعدّ هنا.
 */
export function reviewHasFindings(grouped: number, warnings: number, quiet: number): boolean {
  return grouped + warnings + quiet > 0;
}
