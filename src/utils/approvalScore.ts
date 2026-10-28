/**
 * ── درجة الاعتماد: معادلةٌ تُقرأ، لا رقمٌ يُصدَّق ─────────────────────────────
 *
 * «81/100» كانت صحيحة الحساب لكنها صامتة: لا يعرف القارئ من أين جاءت، ولا ماذا
 * يرفعها. المعادلة هنا واحدة ومكتوبة:
 *
 *     الدرجة = المواعيد السليمة ÷ كل مواعيد النطاق × 100
 *
 * و«السليم» موعدٌ لا يمسّه بندٌ يحتاج معالجة. كل موعدٍ يُعدّ مرّةً واحدة عند
 * أول فئةٍ تمسّه بترتيب الخطورة، فمجموع شرائح الحلقة + السليم = كل المواعيد.
 * و«لو عالجت هذا» حسابٌ صريح: المواعيد التي لا يمسّها إلا هذا البند تصير
 * سليمة، فتصير الدرجة (السليم + هي) ÷ الكل. لا تقدير ولا وزن مخفيّ.
 *
 * نقيٌّ بلا React ولا شبكة، ليُختبر وحده (tests/approval-review-audit.ts).
 */

export type ScoreTone = "block" | "regulation";

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
  /** Appointments only this category touches: fixing it alone makes them clean. */
  exclusive: number;
  /** The score once this category alone is fixed. */
  projected: number;
  /** Row ids in scope it touches, for «عالج». */
  rowIds: number[];
}

export interface ApprovalScoreBreakdown {
  total: number;
  clean: number;
  score: number;
  segments: ScoreSegment[];
  /** The same arithmetic, as a sentence the reader can check by hand. */
  formula: string;
}

const pct = (part: number, whole: number) => (whole ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 100);

export function approvalScoreBreakdown(scopeRowIds: readonly number[], categories: readonly ScoreCategoryInput[]): ApprovalScoreBreakdown {
  const scope = new Set(scopeRowIds.map(Number).filter(Number.isFinite));
  const total = scope.size;
  const touchedBy = new Map<number, string[]>();
  const owner = new Map<number, string>();
  const ordered = [...categories].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "block" ? -1 : 1));
  for (const category of ordered) {
    for (const id of new Set(category.rowIds.map(Number))) {
      if (!scope.has(id)) continue;
      touchedBy.set(id, [...(touchedBy.get(id) || []), category.key]);
      if (!owner.has(id)) owner.set(id, category.key);
    }
  }
  const clean = total - touchedBy.size;
  const segments: ScoreSegment[] = ordered.map(category => {
    const ids = [...new Set(category.rowIds.map(Number))].filter(id => scope.has(id));
    const exclusive = ids.filter(id => (touchedBy.get(id) || []).length === 1).length;
    return {
      key: category.key,
      label: category.label,
      tone: category.tone,
      count: ids.filter(id => owner.get(id) === category.key).length,
      touched: ids.length,
      exclusive,
      projected: pct(clean + exclusive, total),
      rowIds: ids,
    };
  }).filter(segment => segment.touched > 0);
  const score = pct(clean, total);
  const n = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
  return {
    total, clean, score, segments,
    formula: total ? `${n(clean)} سليم ÷ ${n(total)} موعد × 100 = ${n(score)}` : "لا مواعيد في النطاق",
  };
}
