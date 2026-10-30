import CourseTags from "../CourseTags";
/**
 * ── الشعب الشاغرة («هيئة تدريسية») جاهزةً للإسناد ───────────────────────────
 *
 * كلُّ شعبةٍ شاغرةٍ في النطاق بحكم الخادم عليها لو أُسندت لهذا الأستاذ كما هي:
 * «متوافقة» (لا مانع ولا ملاحظة — الفحصُ نفسه الذي يحكم على المقترح)، أو
 * «للمراجعة»، أو «تتداخل» مع محاضرةٍ له، أو «مانع». المتوافقةُ تُسند بضغطةٍ
 * واحدة إلى المسودة، وأثرُها على النصاب والأيام والفراغات ظاهرٌ قبل الضغط.
 * لا شيء يُكتب في الجدول قبل موافقة الأستاذ وتثبيت القسم.
 */
import React, { useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Hourglass, LoaderCircle, Plus, Scale, Sparkles, UserRoundPlus,
} from "lucide-react";
import { PROPOSAL_DAY_KEYS, PROPOSAL_DAY_SHORT, type VacancyFit, type VacancyVerdict } from "../../utils/studyProposal";
import type { Workspace } from "./useProposalWorkspace";
import type { VacancyItem } from "./ProposalWeekGrid";
import { minutesCompact, num, timeRange, vacancyTally } from "./proposalFormat";

const FIT: Record<VacancyFit | "checking", { text: string; Icon: React.ComponentType<any> }> = {
  ready: { text: "متوافقة 100٪", Icon: CheckCircle2 },
  review: { text: "للمراجعة", Icon: Sparkles },
  blocked: { text: "مانع", Icon: AlertTriangle },
  clash: { text: "تتداخل", Icon: Clock3 },
  used: { text: "في المقترح", Icon: Check },
  unchecked: { text: "لم تُفحص", Icon: Hourglass },
  checking: { text: "جاري الفحص", Icon: LoaderCircle },
};

export interface VacancyRow extends VacancyItem {
  courseId: number;
  verdict?: { clashWith?: string; notes?: Array<{ kind: string; title: string }>; after?: { loadUnits: number | null; sections: number; attendanceDays: number; gapMinutes: number } };
}

/** يجمع قائمة الشواغر من السياق مع حكم الخادم. ما لم يُحكم عليه بعد يبقى «جاري الفحص» ولا يُسند. */
export function useVacancies(ws: Workspace): VacancyRow[] {
  const { ctx, vacancyVerdicts, vacancyCurrent, ops } = ws;
  return useMemo(() => {
    if (!ctx) return [];
    const verdictById = new Map<number, VacancyVerdict>((vacancyVerdicts || []).map(v => [v.rowId, v]));
    const used = new Set(ops.map(op => op.source?.id).filter((id): id is number => typeof id === "number"));
    const rows: VacancyRow[] = ctx.faculty.map(entry => {
      const verdict = verdictById.get(entry.snapshot.id);
      const fit: VacancyRow["fit"] = used.has(entry.snapshot.id) ? "used" : !vacancyCurrent || !verdict ? "checking" : verdict.fit;
      const note = verdict?.notes?.[0]?.title;
      return {
        item: { ...entry.item, key: `vac:${entry.snapshot.id}` }, facultyId: entry.snapshot.id, courseId: entry.snapshot.AdCourseId, fit, note,
        verdict: verdict ? { clashWith: verdict.clashWith, notes: verdict.notes, after: verdict.after } : undefined,
      };
    });
    const order: Record<VacancyRow["fit"], number> = { ready: 0, review: 1, checking: 2, unchecked: 3, blocked: 4, clash: 5, used: 6 };
    const serverOrder = new Map<number, number>((vacancyVerdicts || []).map((v, i) => [v.rowId, i]));
    return rows.sort((a, b) => order[a.fit] - order[b.fit] || (serverOrder.get(a.facultyId) ?? 1e6) - (serverOrder.get(b.facultyId) ?? 1e6));
  }, [ctx, vacancyVerdicts, vacancyCurrent, ops]);
}

function Delta({ Icon, label, value, unit, betterLower, format }: {
  Icon: React.ComponentType<any>; label: string; value: number; unit?: string; betterLower?: boolean;
  /** صيغةُ القيمة إن لم تكن رقماً مجرّداً (المدّة: «3 س 30 د» بدل «210 د»). */
  format?: (abs: number) => string;
}) {
  const tone = value === 0 ? "same" : (value > 0) === !betterLower ? "up" : "warn";
  return (
    <span className="sp-delta" data-tone={tone} title={label}>
      {/* المدّةُ نصٌّ عربيّ («3 س 30 د»): تُعزل باتجاهها هي، وإلا انقلب ترتيبُ الساعات والدقائق داخل عزلٍ يساريّ. */}
      <Icon aria-hidden="true" />{format && value
        ? <bdi>{value > 0 ? "+" : "−"}{format(Math.abs(value))}</bdi>
        : <bdi dir="ltr">{value > 0 ? "+" : value < 0 ? "−" : "="}{value ? num(Math.abs(value)) : ""}</bdi>}{unit && value ? <small>{unit}</small> : null}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default function ProposalVacancies({ ws, rows, onAssigned }: { ws: Workspace; rows: VacancyRow[]; onAssigned?: () => void }) {
  const [showOthers, setShowOthers] = useState(false);
  if (!ws.ctx) return null;
  if (ws.terminal || ws.ctx.term.frozen) {
    return (
      <section className="sp-vacancies" aria-label="الشعب الشاغرة">
        <p className="sp-empty-line"><UserRoundPlus aria-hidden="true" />لا إسناد في مقترحٍ مثبّت أو مسحوب أو في فصلٍ سابق.</p>
      </section>
    );
  }
  if (!rows.length) {
    return (
      <section className="sp-vacancies" aria-label="الشعب الشاغرة">
        <p className="sp-empty-line"><UserRoundPlus aria-hidden="true" />لا شعب شاغرة («هيئة تدريسية») ضمن نطاقك.</p>
      </section>
    );
  }
  /* الأثرُ يُقاس على الجدول الناتج الحالي: بلا مواد هو الجدول الأصلي، ومع مواد هو نتيجةُ آخر فحصٍ مكتمل. */
  const base = !ws.ops.length ? ws.ctx.current.metrics : ws.evalCurrent && ws.evaluation ? ws.evaluation.after.metrics : null;
  const good = rows.filter(r => r.fit === "ready" || r.fit === "review" || r.fit === "checking" || r.fit === "used");
  const others = rows.filter(r => !good.includes(r));
  /* العدّادُ نفسه الذي يقرؤه التبويبُ وزرُّ الجدول: لا رقمان مختلفان لكلمة «شاغرة». */
  const tally = vacancyTally(rows);
  const checkingNow = ws.vacancyState === "checking" && !ws.vacancyCurrent;
  const meter: Array<{ fit: string; n: number; text: string }> = [
    { fit: "ready", n: tally.ready, text: "جاهزة" },
    { fit: "review", n: tally.review, text: "للمراجعة" },
    { fit: "used", n: tally.used, text: "في المقترح" },
    { fit: "other", n: others.length, text: "غير متوافقة" },
  ].filter(part => part.n > 0);

  const row = (r: VacancyRow) => {
    const { item } = r;
    const fit = FIT[r.fit];
    const assignable = r.fit === "ready" || r.fit === "review";
    const a = r.verdict?.after;
    const reason = r.fit === "clash" ? `مع ${r.verdict?.clashWith || "محاضرة"}` : r.fit === "blocked" || r.fit === "review" ? r.verdict?.notes?.[0]?.title : "";
    return (
      <li key={r.facultyId} className="sp-vac" data-fit={r.fit}>
        <span className="sp-vac-mark" data-fit={r.fit} title={fit.text} aria-hidden="true"><fit.Icon className={r.fit === "checking" ? "sp-spin" : undefined} /></span>
        <button type="button" className="sp-vac-main" onClick={() => ws.setSelectedKey(item.key)}
          aria-label={`${item.courseName}، الشعبة ${item.SCode}، ${fit.text}`} data-guide-ignore="يُبرز الشعبة الشاغرة على الجدول — لا يكتب شيئاً">
          <b>{item.courseName}<CourseTags courseId={r.courseId} /></b>
          <span className="sp-vac-slot">
            <bdi className="sp-sec">{item.SCode}</bdi>
            <span>{PROPOSAL_DAY_KEYS.filter(d => item.days.includes(d)).map(d => PROPOSAL_DAY_SHORT[d]).join(" · ")}</span>
            <bdi className="sp-time">{timeRange(item.start, item.end)}</bdi>
          </span>
          {a && base && (r.fit === "ready" || r.fit === "review") ? (
            <span className="sp-vac-impact" aria-label="الأثر لو أُسندت">
              {a.loadUnits !== null && base.loadUnits !== null ? <Delta Icon={Scale} label="النصاب" value={a.loadUnits - base.loadUnits} unit="س" /> : null}
              <Delta Icon={CalendarDays} label="أيام الحضور" value={a.attendanceDays - base.attendanceDays} betterLower />
              <Delta Icon={Hourglass} label="الفراغات" value={Math.round((a.gapMinutes - base.gapMinutes))} format={minutesCompact} betterLower />
            </span>
          ) : reason ? <span className="sp-vac-why" data-fit={r.fit}>{reason}</span> : null}
        </button>
        {r.fit === "used" ? <span className="sp-vac-done"><Check aria-hidden="true" /></span> : (
          <button type="button" className="sp-vac-go" disabled={!assignable}
            onClick={() => { if (ws.assignFaculty(r.facultyId)) onAssigned?.(); }}
            aria-label={`أسند ${item.courseName}، الشعبة ${item.SCode}، لهذا الأستاذ`} title={assignable ? "أسند لهذا الأستاذ" : fit.text}
            data-guide-ignore="يضيف إسناد الشعبة الشاغرة إلى المسودة — لا يكتب في الجدول">
            <Plus aria-hidden="true" /><span>أسند</span>
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="sp-vacancies" aria-label="الشعب الشاغرة">
      <header className="sp-vac-head">
        <span className="sp-vac-badge" aria-hidden="true"><UserRoundPlus /></span>
        <div>
          <b>شاغرة · هيئة تدريسية</b>
          <small>{checkingNow ? "جاري الفحص…" : `${num(rows.length)} في النطاق`}</small>
        </div>
      </header>
      {!checkingNow && meter.length ? (
        <div className="sp-vac-summary">
          {/* شريطٌ مقسوم بنسبة كلِّ حكم، ومفتاحُه أرقامٌ ملوّنة — الصورةُ قبل القائمة. */}
          <span className="sp-vac-meter" aria-hidden="true">
            {meter.map(part => <i key={part.fit} data-fit={part.fit} style={{ flexGrow: part.n }} />)}
          </span>
          <ul className="sp-vac-key" aria-label="أحكام الشعب الشاغرة">
            {meter.map(part => <li key={part.fit} data-fit={part.fit}><i aria-hidden="true" /><b className="sp-num">{num(part.n)}</b>{part.text}</li>)}
          </ul>
        </div>
      ) : null}
      {good.length ? <ul className="sp-vac-list">{good.map(row)}</ul> : <p className="sp-empty-line"><Clock3 aria-hidden="true" />لا شعبة شاغرة تتوافق مع جدوله الآن.</p>}
      {ws.vacancyPartial ? <p className="sp-empty-line"><Hourglass aria-hidden="true" />فُحصت أقرب الشعب أولاً؛ الباقي «لم تُفحص».</p> : null}
      {others.length ? (
        <div className="sp-vac-others">
          <button type="button" className="sp-vac-toggle" aria-expanded={showOthers} onClick={() => setShowOthers(v => !v)} data-guide-ignore="يعرض الشعب الشاغرة غير المتوافقة — لا يكتب شيئاً">
            <span>غير متوافقة</span><span className="sp-count">{num(others.length)}</span><ChevronDown className="sp-chev" aria-hidden="true" />
          </button>
          {showOthers ? <ul className="sp-vac-list">{others.map(row)}</ul> : null}
        </div>
      ) : null}
      {ws.vacancyState === "failed" ? <p className="sp-empty-line" role="alert"><AlertTriangle aria-hidden="true" />تعذّر فحص الشواغر الآن.</p> : null}
    </section>
  );
}
