import React from "react";
import { ChevronLeft, GraduationCap, Layers3, Loader2, Sparkles, TriangleAlert, Users } from "lucide-react";
import type { FitSide, StudentFit } from "../utils/studentFit";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── «نبض الطلبة» في نموذج الموعد ─────────────────────────────────────────────
 * حلقتان: الخريجون أولاً (ذهبية) ثم الطلبة (خضراء). كلٌّ تقول: كم ممن يحتاجون المقرر يناسبهم
 * هذا الوقت، ومع ما يتعارض عند من لا يناسبه. والأثر الجديد على الخريجين (تعارضٌ لا مفرّ منه)
 * سطرٌ أحمر في رأس البطاقة. تقديرٌ من تقرير الطلب الفعلي — ملاحظةٌ لا تمنع الحفظ.
 */
const R = 26;
const C = 2 * Math.PI * R;
const trackWord = (track: StudentFit["track"]) => track === "boys" ? "للبنين" : track === "girls" ? "للبنات" : "";

function Ring({ percent, kind }: { percent: number | null; kind: "grad" | "stud" }) {
  const value = percent == null ? 100 : Math.max(0, Math.min(100, percent));
  const tone = percent == null ? "idle" : value >= 85 ? "good" : value >= 60 ? "warn" : "bad";
  return (
    <span className={`pulse-ring is-${kind} tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <circle className="pulse-ring-track" cx="32" cy="32" r={R} />
        <circle className="pulse-ring-fill" cx="32" cy="32" r={R} strokeDasharray={`${(value / 100) * C} ${C}`} />
      </svg>
      <span className="pulse-ring-mid">
        {kind === "grad" ? <GraduationCap /> : <Users />}
        <b dir="ltr">{percent == null ? "—" : `${percent}%`}</b>
      </span>
    </span>
  );
}

function Side({ side, kind }: { side: FitSide; kind: "grad" | "stud" }) {
  const noun = kind === "grad" ? AR.graduate : AR.student;
  const title = kind === "grad" ? "الخريجون" : "الطلبة";
  return (
    <div className={`pulse-side is-${kind}`}>
      <Ring percent={side.percent} kind={kind} />
      <div className="pulse-side-copy">
        <span className="pulse-side-title">{title}</span>
        <strong>
          {side.percent == null
            ? <>يحتاجه {countOf(side.need, noun)}</>
            : side.blocked
              ? <>يناسب <bdi dir="ltr">{side.fit}</bdi> من {countOf(side.need, noun)}</>
              : <>يناسب كل من يحتاجه · {countOf(side.need, noun)}</>}
        </strong>
        {side.clashes.length ? (
          <span className="pulse-clashes">
            {side.clashes.map(clash => (
              <span key={clash.code} className="pulse-clash" title={`${clash.name} — كل شعبه في هذا الوقت`}>
                <bdi dir="ltr">{clash.code}</bdi><small>{clash.name}</small><em dir="ltr">{clash.students}</em>
              </span>
            ))}
          </span>
        ) : side.percent == null ? <small className="pulse-muted">لا تفصيل برامج في التقرير</small> : <small className="pulse-muted">لا يحجبهم عن مقررٍ آخر يحتاجونه</small>}
      </div>
    </div>
  );
}

/** أفضل خانةٍ حرّةٍ للأستاذ بنبض الطلبة (من «أسبوع الأستاذ»): بضغطةٍ يُوضع الموعد فيها. */
export interface BestTime { day: string; days: string[]; start: string; end: string; percent: number; kind: "grad" | "stud" }

/**
 * أثر الحفظ بسطرٍ واحد: «يناسب الخريجين 0٪ ← 94٪» — من يجد شعبةً تناسبه في المقرر كله قبل هذا الموعد وبعده.
 * لا يظهر إلا إن تغيّر الرقم فعلاً، وبلا طلبٍ فعلي لا شيء.
 */
export interface SaveImpact { kind: "grad" | "stud"; before: number; after: number }
export const saveImpactOf = (fit: StudentFit | null): SaveImpact | null => {
  const side = fit?.graduates?.coverage ? fit.graduates : fit?.students?.coverage ? fit.students : null;
  const kind = fit?.graduates?.coverage ? "grad" : "stud";
  return side?.coverage && side.coverage.after !== side.coverage.before ? { kind, before: side.coverage.before, after: side.coverage.after } : null;
};
export function FitImpact({ impact }: { impact: SaveImpact }) {
  const Icon = impact.kind === "grad" ? GraduationCap : Users;
  const rising = impact.after > impact.before;
  return (
    <p className={`fit-impact is-${impact.kind}${rising ? " is-up" : " is-down"}`} role="status"
      aria-label={`يناسب ${impact.kind === "grad" ? "الخريجين" : "الطلبة"}: من ${impact.before}% إلى ${impact.after}%`}>
      <Icon aria-hidden="true" />
      <span>يناسب {impact.kind === "grad" ? "الخريجين" : "الطلبة"}</span>
      <bdi dir="ltr" className="fit-impact-from">{impact.before}%</bdi>
      <ChevronLeft aria-hidden="true" />
      <bdi dir="ltr" className="fit-impact-to">{impact.after}%</bdi>
    </p>
  );
}

export default function StudentPulse({ fit, graduateImpact, best, onPickBest, bestBusy = false }: {
  fit: StudentFit | null;
  graduateImpact?: { graduates: number; pairs?: string[] } | null;
  /** يُعرض فقط إن كان أفضل من الوقت الحالي بفارقٍ يُعتدّ به. */
  best?: BestTime | null;
  onPickBest?: (best: BestTime) => void;
  /** يبحث الآن عن قاعةٍ لذلك الوقت: الزرّ يدور ولا يُضغط ثانيةً. */
  bestBusy?: boolean;
}) {
  if (!fit) return null;
  const grad = fit.graduates, stud = fit.students;
  if (!grad && !stud) return null;
  const sectionsChanged = fit.sections.after !== fit.sections.before;
  const current = grad?.percent ?? stud?.percent ?? null;
  const showBest = Boolean(best && onPickBest && current != null && best.percent >= current + 5);
  return (
    <section className="student-pulse" aria-label="نبض الطلبة: من يناسبهم هذا الوقت" role="status">
      <header className="pulse-head">
        <span className="pulse-mark" aria-hidden="true"><GraduationCap /></span>
        <div className="pulse-head-copy">
          <b>نبض الطلبة</b>
          <small>من يناسبه هذا الوقت ممن يحتاجون المقرر {trackWord(fit.track)} · تقديرٌ من الطلب الفعلي</small>
        </div>
        {sectionsChanged ? (
          <span className="pulse-sections" title="شعب المقرر في هذا المسار قبل هذا الموعد وبعده">
            <Layers3 aria-hidden="true" /><bdi dir="ltr">{fit.sections.before}</bdi><span aria-hidden="true">←</span><bdi dir="ltr">{fit.sections.after}</bdi><small>{AR.section.few}</small>
          </span>
        ) : null}
        {showBest && best ? (
          <button type="button" className={`pulse-best is-${best.kind}`} onClick={() => onPickBest!(best)} disabled={bestBusy} aria-busy={bestBusy}
            title={`أفضل خانةٍ حرّةٍ للأستاذ: يناسب ${best.percent}% من ${best.kind === "grad" ? "الخريجين" : "الطلبة"}`}
            aria-label={`ضع الموعد في أفضل وقت ${best.start}، يناسب ${best.percent}%`}
            data-guide-ignore="يضع الأيام والبداية والنهاية في أفضل خانةٍ حرّة للأستاذ بنبض الطلبة؛ لا يحفظ شيئاً">
            {bestBusy ? <Loader2 aria-hidden="true" className="pulse-best-spin" /> : <Sparkles aria-hidden="true" />}<span>أفضل وقت</span><bdi dir="ltr">{best.start}</bdi><b dir="ltr">{best.percent}%</b>
          </button>
        ) : null}
      </header>
      {graduateImpact && graduateImpact.graduates > 0 ? (
        <p className="pulse-alarm">
          <TriangleAlert aria-hidden="true" />
          <span className="pulse-alarm-copy">
            <span>تعارضٌ لا مفرّ منه يمسّ <b>{countOf(graduateImpact.graduates, AR.graduate)}</b></span>
            {(graduateImpact.pairs || []).map(pair => <bdi key={pair} dir="ltr" className="pulse-pair">{pair}</bdi>)}
          </span>
        </p>
      ) : null}
      <div className="pulse-sides">
        {grad ? <Side side={grad} kind="grad" /> : null}
        {stud ? <Side side={stud} kind="stud" /> : null}
      </div>
      <small className="pulse-foot">ملاحظةٌ لا تمنع الحفظ · الأرقام بجانب المقررات: من يحجبهم الوقت عنها</small>
    </section>
  );
}

/**
 * ── شريط النبض الصغير للبطاقة السريعة ─────────────────────────────────────────────────
 * البطاقة التي تُفتح من رسم خانةٍ على اللوحة ضيّقة: لا بطاقة كاملة، بل شرائح — «الخريجون 94%» و«الطلبة 88%» —
 * وشريحةٌ حمراء واحدة إن صنع الوقتُ تعارضاً لا مفرّ منه للخريجين. التفصيل في التلميح، فلا كلام زائداً.
 * من ردّ فحص الموعد نفسه؛ ملاحظةٌ لا تمنع الحفظ، وبلا تقرير طلبٍ فعلي لا يظهر.
 */
export interface FitChip { key: string; kind: "grad" | "stud" | "alarm"; tone: "good" | "warn" | "bad"; label: string; value: string; title: string }
export function fitChipsOf(fit: StudentFit | null | undefined, impact?: { graduates: number } | null): FitChip[] {
  const out: FitChip[] = [];
  const tone = (percent: number) => percent >= 85 ? "good" as const : percent >= 60 ? "warn" as const : "bad" as const;
  if (impact && Number(impact.graduates) > 0)
    out.push({ key: "alarm", kind: "alarm", tone: "bad", label: "لا مفرّ منه", value: String(Number(impact.graduates)), title: `تعارضٌ لا مفرّ منه يمسّ ${countOf(impact.graduates, AR.graduate)}` });
  for (const [kind, side, who, noun] of [["grad", fit?.graduates, "الخريجون", AR.graduate], ["stud", fit?.students, "الطلبة", AR.student]] as const) {
    if (!side || side.percent == null) continue;
    out.push({ key: kind, kind, tone: tone(side.percent), label: who, value: `${side.percent}%`,
      title: side.blocked ? `يناسب ${side.percent}% من ${countOf(side.need, noun)} — يحجب ${countOf(side.blocked, noun)} عن مقررٍ آخر يحتاجونه` : `يناسب كل ${countOf(side.need, noun)} الذين يحتاجون المقرر` });
  }
  return out;
}
export function FitStrip({ fit, graduateImpact }: { fit: StudentFit | null | undefined; graduateImpact?: { graduates: number } | null }) {
  const chips = fitChipsOf(fit, graduateImpact);
  if (!chips.length) return null;
  return (
    <div className="fit-strip" role="status" aria-label="نبض الطلبة: من يناسبهم هذا الوقت">
      {chips.map(chip => {
        const Icon = chip.kind === "alarm" ? TriangleAlert : chip.kind === "grad" ? GraduationCap : Users;
        return <span key={chip.key} className={`fit-chip is-${chip.kind} tone-${chip.tone}`} title={chip.title}>
          <Icon aria-hidden="true" /><span>{chip.label}</span><b dir="ltr">{chip.value}</b>
        </span>;
      })}
    </div>
  );
}
