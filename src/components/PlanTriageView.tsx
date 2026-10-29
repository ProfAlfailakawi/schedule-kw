import React, { useState } from "react";
import { Check, CircleSlash, CloudOff, Hourglass, Lightbulb, OctagonAlert, RotateCcw, TriangleAlert, Wrench } from "lucide-react";
import type { GapItem } from "../utils/sectionGap";
import { FOCUS_COURSE_EVENT, type PlanDecision, type PlanTier, type triagePlanItems } from "../utils/planTriage";
import { AR, countOf } from "../utils/arabicCount";
import { demandAsk, openInTimeMachine } from "../utils/timeMachineLink";

export type PlanTriage = ReturnType<typeof triagePlanItems>;

const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
const TIERS: Array<{ tier: PlanTier; label: string; Icon: typeof OctagonAlert }> = [
  { tier: "urgent", label: "عاجل", Icon: OctagonAlert },
  { tier: "important", label: "مهم", Icon: TriangleAlert },
  { tier: "opportunity", label: "فرصة", Icon: Lightbulb },
];

/** Two letters for the avatar: «د. أحمد الفيلكاوي» → «أف». Titles are skipped. */
export function decisionInitials(name: string | undefined): string {
  const words = String(name || "").replace(/^(د|أ|م|أ\.د)\.\s*/u, "").split(/\s+/).filter(word => word && !/^(د\.|أ\.|م\.)$/.test(word));
  if (!words.length) return "؟";
  const first = words[0][0] || "";
  const last = words.length > 1 ? words[words.length - 1].replace(/^ال/, "")[0] || "" : "";
  return `${first}${last}`;
}

/** Who decided and when — shared decisions carry a name, so the shelf says it. */
function DecidedBy({ decision }: { decision: PlanDecision }) {
  const date = decision.at ? new Date(decision.at) : null;
  const when = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "short" }) : "";
  const who = decision.byName || "";
  if (!who && !when) return null;
  return (
    <span className="plan-triage-by" title={[who, date ? date.toLocaleString("ar-KW-u-nu-latn") : ""].filter(Boolean).join(" · ")}>
      <i aria-hidden="true">{decisionInitials(who)}</i>
      {when ? <time dateTime={decision.at}>{when}</time> : null}
    </span>
  );
}

/**
 * «التخطيط» as three shelves (K2): a one-glance summary, then each shelf with
 * its items; every item says why it is there and carries «عالج» (show its
 * appointments on the week), «تم» and «تجاهل» — the last one asks for a reason.
 * A decision is kept with the numbers it was made on; when they change, the item
 * comes back by itself.
 */
export default function PlanTriageView({ triage, renderItem, onDecide, onClose, readOnly = false, offline = false }: {
  triage: PlanTriage;
  renderItem: (item: GapItem, actions?: React.ReactNode) => React.ReactNode;
  onDecide?: (id: number, decision: PlanDecision | null) => void;
  onClose: () => void;
  /** K5: the decision board reads; it never acts. */
  readOnly?: boolean;
  /** Decisions could not reach the server; they are queued in this browser. */
  offline?: boolean;
}) {
  const [asking, setAsking] = useState<{ id: number; state: PlanDecision["state"] } | null>(null);
  const [reason, setReason] = useState("");
  const [showHandled, setShowHandled] = useState(false);
  const { counts } = triage;
  const total = Math.max(1, counts.total);
  const decide = (entry: PlanTriage["live"][number], state: PlanDecision["state"]) => {
    const text = reason.trim();
    if (state === "ignored" && !text) return;
    onDecide?.(entry.item.id, { state, reason: text, at: new Date().toISOString(), signature: entry.signature });
    setAsking(null); setReason("");
  };
  const actionsFor = (entry: PlanTriage["live"][number]) => readOnly ? (
    <div className="plan-triage-actions"><span className={`plan-triage-why tier-${entry.tier}`}>{entry.reason}</span></div>
  ) : (
    <div className="plan-triage-actions">
      <span className={`plan-triage-why tier-${entry.tier}`}>{entry.reason}</span>
      <button type="button" className="plan-triage-act is-primary" data-guide-ignore="يُبرز مواعيد المقرر على الأسبوع للمعالجة، لا يغيّر شيئاً"
        onClick={() => { window.dispatchEvent(new CustomEvent(FOCUS_COURSE_EVENT, { detail: { code: entry.item.code, courseId: entry.item.id } })); onClose(); }}>
        <Wrench aria-hidden="true" /> عالج
      </button>
      {/* يحتاج شعبةً أخرى ← حلولٌ جاهزة في آلة الزمن، على نسخةٍ افتراضية. */}
      {entry.item.extra > 0 && entry.item.code ? (
        <button type="button" className="plan-triage-act" title="حلول جاهزة لشعبة إضافية في آلة الزمن" data-guide-ignore="يفتح آلة الزمن على نسخة افتراضية؛ لا يكتب في الجدول"
          onClick={() => { openInTimeMachine(demandAsk(entry.item.code)); onClose(); }}>
          <Hourglass aria-hidden="true" /> جرّب
        </button>
      ) : null}
      {onDecide ? <>
        <button type="button" className="plan-triage-act" aria-pressed={asking?.id === entry.item.id && asking.state === "done"}
          data-guide-ignore="يعلّم البند منجزاً في هذا المتصفح" onClick={() => { setAsking({ id: entry.item.id, state: "done" }); setReason(""); }}>
          <Check aria-hidden="true" /> تم
        </button>
        <button type="button" className="plan-triage-act" aria-pressed={asking?.id === entry.item.id && asking.state === "ignored"}
          data-guide-ignore="يتجاهل البند بسببٍ مكتوب في هذا المتصفح" onClick={() => { setAsking({ id: entry.item.id, state: "ignored" }); setReason(""); }}>
          <CircleSlash aria-hidden="true" /> تجاهل
        </button>
      </> : null}
      {asking?.id === entry.item.id ? (
        <form className="plan-triage-reason" onSubmit={event => { event.preventDefault(); decide(entry, asking.state); }}>
          <input value={reason} onChange={event => setReason(event.target.value)} autoFocus maxLength={140}
            placeholder={asking.state === "ignored" ? "السبب (مطلوب)" : "ملاحظة (اختياري)"} aria-label="سبب القرار" />
          <button type="submit" disabled={asking.state === "ignored" && !reason.trim()} data-guide-ignore="حفظ قرار البند في هذا المتصفح">حفظ</button>
        </form>
      ) : null}
    </div>
  );
  return (
    <div className="plan-triage">
      {offline ? <p className="plan-triage-offline" role="status"><CloudOff aria-hidden="true" /> دون اتصال — القرارات محفوظة في هذا المتصفح وتُرسل عند عودة الاتصال.</p> : null}
      {/* One glance: three shelves as tiles and as one bar. */}
      <div className="plan-triage-summary" role="img" aria-label={`عاجل ${counts.urgent} · مهم ${counts.important} · فرصة ${counts.opportunity}`}>
        <div className="plan-triage-tiles">
          {TIERS.map(({ tier, label, Icon }) => (
            <span key={tier} className={`plan-triage-tile tier-${tier}`} data-tier-count={tier}>
              <Icon aria-hidden="true" /><b>{num(counts[tier])}</b><small>{label}</small>
            </span>
          ))}
        </div>
        <span className="plan-triage-bar" aria-hidden="true">
          {TIERS.map(({ tier }) => counts[tier] ? <i key={tier} className={`tier-${tier}`} style={{ width: `${(counts[tier] / total) * 100}%` }} /> : null)}
        </span>
        {triage.handled.length || triage.duplicates ? (
          <small className="plan-triage-meta">
            {triage.handled.length ? <button type="button" className="plan-triage-link" onClick={() => setShowHandled(value => !value)} data-guide-ignore="عرض البنود المنجزة والمتجاهلة">
              <Check aria-hidden="true" /> {countOf(triage.handled.length, AR.item)} مُعالَجة
            </button> : null}
            {triage.duplicates ? <span>{countOf(triage.duplicates, AR.item)} مكررة بالرمز نفسه دُمجت</span> : null}
          </small>
        ) : null}
      </div>
      {TIERS.map(({ tier, label, Icon }) => {
        const shelf = triage.live.filter(entry => entry.tier === tier);
        if (!shelf.length) return null;
        return (
          <section key={tier} className={`plan-triage-shelf tier-${tier}`} aria-label={label}>
            <h5><Icon aria-hidden="true" />{label}<b>{num(shelf.length)}</b></h5>
            <ul className="apb-gap-list">{shelf.map(entry => renderItem(entry.item, actionsFor(entry)))}</ul>
          </section>
        );
      })}
      {!triage.live.length ? <p className="plan-triage-clear"><Check aria-hidden="true" /> لا بنود مفتوحة في التخطيط.</p> : null}
      {showHandled && triage.handled.length ? (
        <ul className="plan-triage-handled">
          {triage.handled.map(entry => (
            <li key={entry.item.id}>
              {entry.decision.state === "done" ? <Check aria-hidden="true" /> : <CircleSlash aria-hidden="true" />}
              <span><b>{entry.item.name}</b><small>{entry.decision.state === "done" ? "تم" : "متجاهل"}{entry.decision.reason ? ` · ${entry.decision.reason}` : ""}</small></span>
              <DecidedBy decision={entry.decision} />
              {onDecide ? <button type="button" className="plan-triage-act" onClick={() => onDecide(entry.item.id, null)} data-guide-ignore="إرجاع البند إلى القائمة المفتوحة"><RotateCcw aria-hidden="true" /> إرجاع</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
