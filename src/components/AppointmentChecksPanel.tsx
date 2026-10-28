import React from "react";
import {
  AlertTriangle, Building2, Check, Clock3, Info, Loader2, Minus, MonitorPlay, Puzzle, UserRound, WandSparkles, X, DoorOpen,
} from "lucide-react";
import type { AppointmentVerdict, CheckKind, VerdictCheck, VerdictDetail } from "../utils/appointmentVerdict";

/**
 * ── «فحص موانع الحفظ» إنفوجرافيكاً ─────────────────────────────────────────
 * حلقة ملخّص (✅ سليم / ⚠️ تنبيه / ⛔ مانع)، ثم ست بطاقات بأيقونة وحالة وكلمة.
 * التفاصيل عند الطلب، وبجانب كل مانع زرّ «بديل» يطلب البديل من المحرّك الواحد.
 * يقرأ الحكمَ نفسه الذي يقرؤه شريط «صحّح قبل الحفظ» وزرّ الحفظ (appointmentVerdict).
 */
const ICONS: Record<CheckKind, typeof UserRound> = {
  teacher: UserRound,
  room: DoorOpen,
  section: Puzzle,
  facility: MonitorPlay,
  time: Clock3,
  college: Building2,
};
const STATE_ICON = { ok: Check, warn: AlertTriangle, block: X, idle: Minus } as const;

function Ring({ verdict }: { verdict: AppointmentVerdict }) {
  const counted = verdict.checks.filter(check => check.state !== "idle");
  const total = Math.max(1, verdict.checks.length);
  const ok = verdict.checks.filter(check => check.state === "ok").length;
  const warn = verdict.checks.filter(check => check.state === "warn").length;
  const block = verdict.checks.filter(check => check.state === "block").length;
  const radius = 21, circumference = 2 * Math.PI * radius;
  const segments = [
    { tone: "ok", value: ok },
    { tone: "warn", value: warn },
    { tone: "block", value: block },
  ];
  let offset = 0;
  return <svg className="checks-ring" viewBox="0 0 52 52" aria-hidden="true">
    <circle className="checks-ring-track" cx="26" cy="26" r={radius} />
    {segments.map(segment => {
      const length = (segment.value / total) * circumference;
      const node = segment.value ? <circle key={segment.tone} className={`checks-ring-seg is-${segment.tone}`} cx="26" cy="26" r={radius}
        strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`} strokeDashoffset={-offset} /> : null;
      offset += length;
      return node;
    })}
    <text x="26" y="27" textAnchor="middle" dominantBaseline="middle">{block ? block : warn ? warn : counted.length ? ok : "—"}</text>
  </svg>;
}

export default function AppointmentChecksPanel({
  verdict, checking, onAlternative, alternativeBusy = false, renderConflict, lockedReason, children,
}: {
  verdict: AppointmentVerdict;
  checking: boolean;
  /** «بديل» بجانب المانع: يطلب بديلاً آمناً من محرّك الاقتراح الواحد. */
  onAlternative?: (check: VerdictCheck, detail: VerdictDetail) => void;
  alternativeBusy?: boolean;
  /** بطاقة التعارض التفصيلية (خط زمني) حين يُفتح البند. */
  renderConflict?: (detail: VerdictDetail) => React.ReactNode;
  /** الحفظ مقفل لسبب خارج الموعد (الجدول عند التسجيل…). */
  lockedReason?: string | null;
  /** ما يُعرض تحت البطاقات (اقتراحات البديل، رسم النمط…). */
  children?: React.ReactNode;
}) {
  const blockers = verdict.blockers.length, notes = verdict.notes.length;
  const tone = lockedReason ? "locked" : blockers ? "block" : verdict.state === "empty" ? "idle" : notes ? "warn" : "ok";
  const headline = lockedReason ? "لا يُحفظ الآن"
    : blockers ? "موانع" : verdict.state === "empty" ? "ابدأ بالاختيار" : notes ? "ملاحظات" : "جاهز";
  return <aside className={`conflict-panel checks-panel is-${tone}`} aria-label="فحص موانع الحفظ" aria-busy={checking}>
    <header className="checks-head">
      <Ring verdict={verdict} />
      <div className="checks-head-copy">
        <strong>فحص موانع الحفظ</strong>
        <span className="checks-head-state">
          {headline}
          {checking ? <Loader2 className="checks-spin" aria-label="يفحص" /> : null}
        </span>
      </div>
      <div className="checks-tally" aria-label="الملخص">
        <span className="is-ok" title="سليم"><Check aria-hidden="true" />{verdict.okCount}</span>
        <span className="is-warn" title="تنبيهات لا تمنع الحفظ"><AlertTriangle aria-hidden="true" />{notes}</span>
        <span className="is-block" title="موانع"><X aria-hidden="true" />{blockers}</span>
      </div>
    </header>
    {lockedReason ? <p className="checks-locked"><AlertTriangle aria-hidden="true" />{lockedReason}</p> : null}
    <ul className="checks-grid">
      {verdict.checks.map(check => {
        const Icon = ICONS[check.kind];
        const StateIcon = STATE_ICON[check.state];
        const open = check.details.length > 0;
        const tile = <>
          <span className="checks-tile-icon" aria-hidden="true"><Icon /></span>
          <span className="checks-tile-label">{check.label}</span>
          <span className="checks-tile-state"><StateIcon aria-hidden="true" />{check.word}</span>
        </>;
        return <li key={check.kind} className={`checks-tile is-${check.state}`} data-check={check.kind}>
          {open ? <details open={check.state === "block"}>
            <summary aria-label={`${check.label}: ${check.word}`}>{tile}</summary>
            <ul className="checks-details">
              {check.details.map(detail => <li key={detail.id} className={detail.blocks ? "is-block" : "is-warn"}>
                {renderConflict && detail.conflict ? renderConflict(detail) : <p><b>{detail.text}</b>{detail.detail ? <small>{detail.detail}</small> : null}</p>}
                {detail.blocks && onAlternative ? <button type="button" className="checks-alt" disabled={alternativeBusy}
                  data-guide-ignore="يطلب بديلاً آمناً لهذا المانع من محرك الاقتراح الموحد؛ لا يحفظ شيئاً"
                  onClick={() => onAlternative(check, detail)}><WandSparkles aria-hidden="true" />{alternativeBusy ? "…" : "بديل"}</button> : null}
              </li>)}
            </ul>
          </details> : <div className="checks-tile-row" aria-label={`${check.label}: ${check.word}`}>{tile}</div>}
        </li>;
      })}
    </ul>
    {children}
    <p className="checks-foot"><Info aria-hidden="true" />لا يُحفظ شيء إلا بضغطك «موافق».</p>
  </aside>;
}
