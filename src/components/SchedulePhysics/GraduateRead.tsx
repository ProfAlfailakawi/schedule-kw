import React from "react";
import { GraduationCap, Users } from "lucide-react";
import type { StudentFit } from "../../utils/studentFit";
import { AR, countOf } from "../../utils/arabicCount";

/**
 * ── حماية الخريجين عند السحب ─────────────────────────────────────────────────────────
 * أثناء رفع المحاضرة، وعند الخانة التي يقف عليها المؤشر، سطرٌ واحد يقول ما يفعله هذا الموضع بمن يحتاجون المقرر:
 *   • تعارضٌ جديد لا مفرّ منه للخريجين («لا مفرّ منه لـ٣ خريجين») — أحمر؛
 *   • وإلا كم يناسبه الموضع (نسبةٌ بحلقةٍ صغيرة) وما يحجبه عنه؛ والخريجون أولاً ثم الطلبة.
 * من ردّ فحص الموعد نفسه (graduateImpact وstudentFit) — فلا طلبَ ثانياً ولا حسابَ ثانياً. ملاحظةٌ لا تمنع النقل.
 */
export interface DecisionGraduates {
  impact?: { graduates: number; pairs?: string[] } | null;
  fit?: StudentFit | null;
}
export interface GraduateReadFace {
  kind: "grad" | "stud";
  tone: "good" | "warn" | "bad";
  percent: number | null;
  /** كلمةٌ تقول الحال: «لا مفرّ منه لـ٣ خريجين» · «يحجب ٥ خريجين عن مقررٍ آخر» · «لا يحجب أحداً». */
  text: string;
  pairs: string[];
}

export function graduateReadOf(input: DecisionGraduates | null | undefined): GraduateReadFace | null {
  if (!input) return null;
  const fit = input.fit || null;
  const gradSide = fit?.graduates && fit.graduates.percent != null ? fit.graduates : null;
  const studSide = fit?.students && fit.students.percent != null ? fit.students : null;
  const impact = input.impact && Number(input.impact.graduates) > 0 ? input.impact : null;
  const side = gradSide || studSide;
  if (!impact && !side) return null;
  const kind: "grad" | "stud" = impact || gradSide ? "grad" : "stud";
  const noun = kind === "grad" ? AR.graduate : AR.student;
  const percent = side ? side.percent : null;
  if (impact) return { kind: "grad", tone: "bad", percent, pairs: (impact.pairs || []).slice(0, 2), text: `تعارضٌ لا مفرّ منه لـ${countOf(impact.graduates, AR.graduate)}` };
  const blocked = side!.blocked;
  return {
    kind, percent, pairs: [],
    tone: percent! >= 85 ? "good" : percent! >= 60 ? "warn" : "bad",
    text: blocked > 0 ? `يحجب ${countOf(blocked, noun)} عن مقررٍ آخر` : side!.need > 1 ? `لا يحجب أحداً من ${countOf(side!.need, noun)}` : "لا يحجب أحداً",
  };
}

/** سطر الخريجين في لوحة السحب ومعاينة القرار: أيقونة، وكلمة، ونسبة. */
export default function GraduateRead({ graduates }: { graduates?: DecisionGraduates | null }) {
  const face = graduateReadOf(graduates);
  if (!face) return null;
  const Icon = face.kind === "grad" ? GraduationCap : Users;
  return (
    <div className={`physics-conflict-row is-grad is-${face.kind} tone-${face.tone}`} role="status">
      <Icon aria-hidden="true" />
      <div>
        <small>{face.kind === "grad" ? "الخريجون" : "الطلبة"}</small>
        <strong>{face.text}</strong>
        {face.pairs.length ? <span className="physics-grad-pairs">{face.pairs.map(pair => <bdi key={pair} dir="ltr">{pair}</bdi>)}</span> : null}
      </div>
      {face.percent != null ? <b className="physics-grad-pct" dir="ltr" title={face.kind === "grad" ? "نسبة من يناسبهم هذا الموضع من الخريجين الذين يحتاجون المقرر" : "نسبة من يناسبهم هذا الموضع من الطلبة الذين يحتاجون المقرر"}>{face.percent}%</b> : null}
    </div>
  );
}
