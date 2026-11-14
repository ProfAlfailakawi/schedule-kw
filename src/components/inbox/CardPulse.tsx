/**
 * ── «نبض الكروت» في وارد الأساتذة ────────────────────────────────────────────────
 * شريطٌ واحد يقول أين وصل كلُّ أستاذٍ في بطاقته: لم يفتح · فتح · أرسل · ينتظر قرارك · مكتمل. كلُّ مرحلةٍ زرٌّ يُصفّي القائمة
 * (الحالةُ تحكمها الشاشة وتمرّرها هنا)، و«ذكّر الباقين» يرسل التذكيرَ القائم (POST /api/instructor-requests/remind-pending):
 * ورقةُ تأكيدٍ بالعدد أولاً (dryRun)، ثم الإرسال، ثم رسالةُ واتساب جاهزةٌ لكلٍّ بيد المنسّق. الخادمُ يحكم بمن يُذكَّر.
 * العدُّ من صفوف الوارد المحمّلة (cardPulse) — لا قراءةَ جديدة.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BellRing, Check, CircleCheck, Hourglass, Loader2, MailOpen, MailQuestion, Send, X } from "lucide-react";
import MiniRing from "../MiniRing";
import { AR, countOf, nounFor, type ArabicNoun } from "../../utils/arabicCount";
import { cardPulse, planReminders, PULSE_STAGES, REMIND_SKIP_LABEL, type PulseRow, type PulseStage, type RemindSkip } from "../../utils/cardPulse";
import { requestWindowOpen } from "../../utils/instructorRequestWindows";
import { reachAboutCard } from "../../utils/reachInstructor";

export type CardPulseRow = PulseRow & { id: string; AdInstructorId: number; remindedAt?: string[]; window?: { opensAt: string; closesAt: string }; individualException?: any; instructorName?: string; instructorMobile?: string; linkId?: string };

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
const verb = (one: string, two: string, many: string): ArabicNoun => ({ one, two, few: many, many });
const NOT_SENT = verb("لم يرسل", "لم يرسلا", "لم يرسلوا");
const LABEL: Record<PulseStage, ArabicNoun> = {
  unopened: AR.openedLinkVerb,
  opened: verb("فتح", "فتحا", "فتحوا"),
  sent: verb("أرسل", "أرسلا", "أرسلوا"),
  awaiting: verb("ينتظر قرارك", "ينتظران قرارك", "ينتظرون قرارك"),
  complete: verb("مكتمل", "مكتملان", "مكتملون"),
};
const HINT: Record<PulseStage, string> = {
  unopened: "لم يفتحوا رابط بطاقتهم بعد",
  opened: "فتحوا البطاقة ولم يرسلوا",
  sent: "أرسلوا ولا بندَ ينتظر قرارك (ثبّتوا جداولهم كما هي)",
  awaiting: "أرسلوا وفي طلبهم ما ينتظر قرارك",
  complete: "أرسلوا وقُرّر في كل بنودهم",
};
const ICON: Record<PulseStage, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  unopened: MailQuestion, opened: MailOpen, sent: Send, awaiting: Hourglass, complete: CircleCheck,
};

interface Plan {
  targets: Array<{ id: string; instructorId: number; name: string }>;
  skipped: Array<{ id: string; name: string; reason: RemindSkip }>;
  tally: Array<{ reason: RemindSkip; count: number }>;
  cooldownHours: number;
}
interface Delivered {
  delivery: string;
  reminded: Array<{ id: string; instructorId: number; name: string; mobile: string; linkId: string }>;
  tally: Array<{ reason: RemindSkip; count: number }>;
}

async function post(body: unknown) {
  const response = await fetch("/api/instructor-requests/remind-pending", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "تعذّر التذكير"), { code: String(data.code || ""), data });
  return data;
}

function RemindSheet({ termId, ids, onClose, onSent }: { termId: number; ids: string[]; onClose: () => void; onSent: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Delivered | null>(null);
  useEffect(() => {
    let live = true;
    post({ termId, requestIds: ids, dryRun: true }).then(data => { if (live) setPlan(data as Plan); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [termId, ids]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => cardRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus());
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (opener?.isConnected) opener.focus(); };
  }, [onClose]);
  const send = async () => {
    setSending(true); setError("");
    try { setDone(await post({ termId, requestIds: ids }) as Delivered); onSent(); }
    catch (e: any) { setError(e.message); }
    finally { setSending(false); }
  };
  const skippedLine = (tally: Array<{ reason: RemindSkip; count: number }>) => tally.map(entry => `${num(entry.count)} ${REMIND_SKIP_LABEL[entry.reason]}`).join(" · ");
  return (
    <div className="changes-extend-sheet card-pulse-sheet" role="dialog" aria-modal="true" aria-labelledby="card-pulse-sheet-title" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="changes-extend-card" ref={cardRef}>
        <header>
          <strong id="card-pulse-sheet-title"><BellRing aria-hidden="true" /> ذكّر الباقين</strong>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق النافذة — لا يغيّر شيئاً"><X /></button>
        </header>
        {done ? <>
          <p className="card-pulse-sheet-lead" aria-live="polite">
            ذُكِّر <b>{countOf(done.reminded.length, AR.instructor)}</b>{done.delivery === "demo" ? " · العرض التجريبي: تسليمٌ وهميّ، لا رسالةَ حقيقية." : " في كروتهم. وأرسل لكلٍّ رسالتَه إن شئت:"}
          </p>
          <ul className="card-pulse-wa">
            {done.reminded.map(person => {
              const reach = reachAboutCard({ AdInstructorName: person.name, AdInstructorMobile: person.mobile }, `${location.origin}/r/${person.linkId}`, "reminder");
              return <li key={person.id}><span>{person.name}</span>{reach.href
                ? <a className="request-remind" href={reach.href} target="_blank" rel="noreferrer noopener" aria-label={`رسالة واتساب إلى ${person.name}`}><Send aria-hidden="true" /> واتساب</a>
                : <span className="request-remind" data-blocked="true" title={reach.blocked || ""}>لا رقم جوّال</span>}</li>;
            })}
          </ul>
          {done.tally.length ? <p className="card-pulse-note">تُخطّي: {skippedLine(done.tally)}</p> : null}
          <div className="changes-extend-actions"><button type="button" className="btn btn-primary" onClick={onClose} data-guide-ignore="يغلق النافذة؛ لا يكتب شيئاً">تم</button></div>
        </> : <>
          {!plan && !error ? <p className="card-pulse-sheet-lead"><Loader2 className="spin" aria-hidden="true" /> يحسب من يلزمه التذكير…</p> : null}
          {plan ? <>
            <p className="card-pulse-sheet-lead">{plan.targets.length
              ? <>سيصل التذكير إلى <b>{countOf(plan.targets.length, AR.instructor)}</b> {nounFor(plan.targets.length, NOT_SENT)} بعد، في {plan.targets.length === 1 ? "كرته" : "كروتهم"}، وتبقى رسالةُ واتساب بيدك.</>
              : "لا أحدَ يلزمه التذكير الآن."}</p>
            {plan.targets.length ? <ul className="card-pulse-people">{plan.targets.slice(0, 40).map(person => <li key={person.id}>{person.name}</li>)}{plan.targets.length > 40 ? <li>+{num(plan.targets.length - 40)}</li> : null}</ul> : null}
            {plan.tally.length ? <p className="card-pulse-note">يُستثنى: {skippedLine(plan.tally)}{plan.tally.some(entry => entry.reason === "recent") ? ` (لا تذكيرَ لمن ذُكِّر قبل أقلّ من ${num(plan.cooldownHours)} ساعات)` : ""}</p> : null}
          </> : null}
          {error ? <p className="card-pulse-error" role="alert">{error}</p> : null}
          <div className="changes-extend-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} data-guide-ignore="إلغاء التذكير — لا يُرسل شيء">إلغاء</button>
            <button type="button" className="btn btn-primary" disabled={!plan?.targets.length || sending} onClick={() => void send()} data-guide-ignore="يرسل التذكير إلى من لم يرسلوا بعد، بعد تأكيدك العدد">
              {sending ? <Loader2 className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />} أرسل التذكير{plan?.targets.length ? ` (${num(plan.targets.length)})` : ""}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}

export default function CardPulse({ rows, termId, active, onPick, onReminded, isExcluded }: {
  rows: readonly CardPulseRow[]; termId: number; active: PulseStage | null; onPick: (stage: PulseStage | null) => void; onReminded?: () => void;
  /** منتدبٌ أو متدرّبٌ مستبعَد من التذكير (الوارد يعرفه من قراءة المنتدبين). */
  isExcluded?: (row: CardPulseRow) => boolean;
}) {
  const pulse = useMemo(() => cardPulse(rows), [rows]);
  /* أرقامُ البطاقات لحظةَ الفتح: إعادةُ قراءة الوارد بعد الإرسال لا تُعيد الحساب تحت الورقة. */
  const [sheet, setSheet] = useState<string[] | null>(null);
  /* من يُنتظر تذكيرُه: لم يفتح أو فتح ولم يرسل، بالقاعدة نفسها التي يحكم بها الخادمُ (planReminders): لا عرضٌ ولا تدريبٌ ولا منتدب،
     ونافذتُه مفتوحة، ولم يُذكَّر قريباً. فالعددُ على الزرّ هو عددُ الورقة إلا أن يتغيّر شيءٌ بين اللحظتين — والخادمُ يؤكّد. */
  const remindIds = useMemo(() => {
    const open = new Set([...pulse.ids.unopened, ...pulse.ids.opened]);
    const candidates = rows.filter(row => open.has(row.id));
    const excluded = new Set(candidates.filter(row => isExcluded?.(row)).map(row => Number(row.AdInstructorId)));
    return planReminders(candidates as any[], { windowOpen: row => requestWindowOpen(row as any), excluded }).targets.map(row => String(row.id));
  }, [pulse, rows, isExcluded]);
  if (!pulse.total) return null;
  const replied = pulse.counts.sent + pulse.counts.awaiting + pulse.counts.complete;
  return (
    <section className="card-pulse" aria-label="نبض الكروت">
      <div className="card-pulse-head">
        <MiniRing value={pulse.repliedPercent} size={46} decorative>{num(replied)}</MiniRing>
        <div className="card-pulse-title">
          <b>نبض الكروت</b>
          <small>أرسل {num(replied)} من {num(pulse.total)} · {num(pulse.total - replied)} {nounFor(pulse.total - replied, NOT_SENT)}</small>
        </div>
        {remindIds.length ? (
          <button type="button" className="card-pulse-remind" onClick={() => setSheet(remindIds)}
            data-guide-ignore="يفتح ورقة تأكيد بعدد من لم يرسلوا، ثم يُذكّرهم بكروتهم — لا يُرسل شيءٌ قبل تأكيدك">
            <BellRing aria-hidden="true" /> ذكّر الباقين <b>{num(remindIds.length)}</b>
          </button>
        ) : null}
      </div>
      <div className="card-pulse-bar" role="img" data-empty={pulse.total ? undefined : "1"}
        aria-label={PULSE_STAGES.map(stage => `${num(pulse.counts[stage])} ${nounFor(pulse.counts[stage], LABEL[stage])}`).join("، ")}>
        {PULSE_STAGES.filter(stage => pulse.counts[stage] > 0).map(stage => <span key={stage} data-stage={stage} style={{ flexGrow: pulse.counts[stage], flexBasis: 0 }} />)}
      </div>
      <ul className="card-pulse-stages">
        {PULSE_STAGES.map(stage => {
          const Icon = ICON[stage];
          const count = pulse.counts[stage];
          return (
            <li key={stage}>
              <button type="button" className="card-pulse-stage" data-stage={stage} data-zero={count ? undefined : "1"} aria-pressed={active === stage}
                title={HINT[stage]} aria-label={`${num(count)} ${nounFor(count, LABEL[stage])} — ${HINT[stage]}`} disabled={!count && active !== stage}
                data-guide-ignore="تصفية الوارد بمرحلة البطاقة — عرضٌ لا فعل" onClick={() => onPick(active === stage ? null : stage)}>
                <Icon aria-hidden="true" /><b>{num(count)}</b><span>{nounFor(count, LABEL[stage])}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {pulse.counts.sent ? <p className="card-pulse-note">«أرسلوا» = ثبّتوا جداولهم كما هي، ولا شيءَ ينتظر قرارك.</p> : null}
      {sheet ? <RemindSheet termId={termId} ids={sheet} onClose={() => setSheet(null)} onSent={() => onReminded?.()} /> : null}
    </section>
  );
}
