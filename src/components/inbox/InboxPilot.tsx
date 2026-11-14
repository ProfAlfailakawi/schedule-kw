/**
 * ── «وضع الطيّار» ─────────────────────────────────────────────────────────────
 *
 * شاشةٌ واحدة تملأ النافذة: بندٌ واحدٌ ينتظر القرار — من الأستاذ، أيُّ مقرّرٍ وشعبة،
 * «كان ← المطلوب» يوماً ووقتاً وقاعة، وما يحسبه الوارد من تعارضٍ أو تنبيهٍ لائحي —
 * وتحته ثلاثةُ أفعالٍ بمفاتيحها: «ثبّت» (F)، «بديل» (B)، «التالي» (→ أو Space).
 *
 * **ولا مسارَ ثانياً.** «ثبّت» هو `decide` في الوارد نفسه (المعاينةُ ثم /apply بختم
 * الإصدار)، و«بديل» ورقةُ الرفض نفسُها بالبدائل التي حسبها النظام (`nearestTimes`)
 * ثم /decide. وما ردّه الخادم — تعارضٌ أو فصلٌ مجمَّد أو إصدارٌ أحدث — يبقى على
 * البطاقة نفسها برسالته، ولا ينتقل الوضعُ إلى غيره.
 *
 * **ولا تراجعَ إلا عن التخطّي.** مسارُ الوارد لا يعيد فتحَ بندٍ ثُبّت منه أو رُفض
 * (reopen-fixed للتثبيت من «الجدول» وحده)، فلا يُعرض «تراجع» لهما.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, Clock3, DoorOpen, Loader2, Plus, Replace, RotateCcw, ShieldAlert, ShieldCheck, AlertTriangle, Trash2, X, Plane } from "lucide-react";
import type { FSchedule, InstructorRequestItem, InstructorRequestRejectReason } from "../../types";
import {
  buildPilotQueue, pilotAdvance, pilotCommand, pilotHandsOff, pilotJudge, pilotLookup, pilotOpen, pilotSettledCount,
  pilotUndoSkip, startPilot, type PilotEntry, type PilotKeyTarget, type PilotLiveIssue, type PilotRow, type PilotState,
} from "../../utils/inboxPilot";
import { PROPOSAL_DAY_NAMES } from "../../utils/studyProposal";
import { num } from "../proposal/proposalFormat";

type Decide<R> = (row: R, index: number, state: "fixed" | "rejected", extra?: any) => Promise<boolean>;
interface RejectSheetProps {
  item: InstructorRequestItem;
  onClose: () => void;
  onSubmit: (reason: InstructorRequestRejectReason, note: string, alternatives: any[]) => void;
  busy: boolean;
}

export interface InboxPilotProps<R extends PilotRow> {
  /** صفوفُ الوارد كما تُقرأ الآن (تتجدّد بعد كل قرار). */
  rows: R[];
  /** ما يدخل القائمة من البنود المنتظرة (الموقعُ المختار في الوارد). */
  include?: (item: InstructorRequestItem, row: R) => boolean;
  currentRows: Map<number, FSchedule>;
  busyKey: string | null;
  rowErrors: Record<string, string>;
  frozen: boolean;
  /** `decide` في الوارد نفسه. */
  onDecide: Decide<R>;
  /** `proposedRow` و`useLiveCheck` في الوارد: الفحصُ الحيّ نفسه الذي يسبق زرَّ «ثبّت». */
  candidateOf: (row: R, item: InstructorRequestItem, current?: FSchedule) => any | null;
  useLiveCheck: (candidate: any | null, enabled: boolean) => { loading: boolean; issues: PilotLiveIssue[] | null };
  /** ورقةُ الرفض في الوارد بعينها: السببُ والبدائلُ المحسوبة وسطرُ الأستاذ. */
  RejectSheet: React.ComponentType<RejectSheetProps>;
  onClose: () => void;
}

const ACTION_LABEL: Record<string, string> = { change: "تعديل", delete: "حذف", add: "إضافة" };
const READINESS_LABEL: Record<string, string> = {
  ready: "جاهز للتثبيت", review: "يحتاج قرارك", blocked: "ممنوع", checking: "يفحص…", waiting: "بانتظار قسمٍ آخر",
};
const slotDays = (slot: { day: string; days?: string[] }) => (slot.days?.length ? slot.days : [slot.day])
  .map(day => (PROPOSAL_DAY_NAMES as Record<string, string>)[day] || day).join(" · ");
const submittedLabel = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { month: "long", day: "numeric" });
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const keyTarget = (target: EventTarget | null): PilotKeyTarget => {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return "other";
  if (element.closest("input, select, textarea, [contenteditable='true']")) return "field";
  if (element.closest("button, a[href], [role='button']")) return "button";
  return "other";
};

/** زرُّ الدخول بجانب مرشّحات الوارد، بعدد ما ينتظر. */
export function InboxPilotLauncher({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button type="button" className="inbox-pilot-go" onClick={onOpen} aria-haspopup="dialog" data-inbox-pilot-launcher=""
      data-guide-ignore="يفتح «وضع الطيّار»: بندٌ واحد في كل مرّة بأزرار البطاقة نفسها (ثبّت/بديل/التالي) — فتحُه لا يكتب شيئاً">
      <Plane aria-hidden="true" />وضع الطيّار <b>{num(count)}</b>
    </button>
  );
}

export default function InboxPilot<R extends PilotRow>({
  rows, include, currentRows, busyKey, rowErrors, frozen, onDecide, candidateOf, useLiveCheck, RejectSheet, onClose,
}: InboxPilotProps<R>) {
  /* القائمةُ تُلتقط مرّةً عند الفتح: عددٌ ثابت يُقاس عليه «٧ من ٣٠». وما يقرّره زميلٌ في
     الأثناء يُتخطّى، لأن كلَّ خطوةٍ تسأل القراءةَ الأخيرة للوارد. */
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const open = useCallback((entry: PilotEntry) => pilotOpen(rowsRef.current, entry), []);
  const [state, setState] = useState<PilotState>(() => startPilot(buildPilotQueue(rows, include), entry => pilotOpen(rows, entry)));
  const [sheet, setSheet] = useState(false);
  const [working, setWorking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  const entry = state.at >= 0 ? state.order[state.at] : null;
  const found = entry ? pilotLookup(rows, entry) : null;
  const row = found?.row;
  const item = found?.item;
  const current = item?.rowId == null ? undefined : currentRows.get(Number(item.rowId));
  const candidate = useMemo(() => (row && item ? candidateOf(row, item, current) : null), [row, item, current, candidateOf]);
  const live = useLiveCheck(candidate, Boolean(item) && !item?.decision?.state && item?.action !== "delete");
  const judged = row && item && entry ? pilotJudge(row, entry.index, Boolean(current), live) : null;
  const busy = working || Boolean(entry && busyKey === entry.key);
  const error = entry ? rowErrors[entry.key] : undefined;
  const total = state.order.length;
  const settled = pilotSettledCount(state, open);

  /* البندُ المعروض قرّره زميلٌ أو تغيّر ترتيبُ طلبه: يُتخطّى إلى ما بعده بهدوء. */
  useEffect(() => {
    if (entry && !working && !open(entry)) setState(prev => prev.at >= 0 && prev.order[prev.at]?.key === entry.key ? pilotAdvance(prev, "skipped", open) : prev);
  }, [rows, entry, working, open]);

  /* كلُّ بندٍ جديد يأخذ التركيز: يُقرأ لقارئ الشاشة، وتعمل المفاتيحُ بلا زرٍّ مركَّز. */
  useEffect(() => {
    if (!sheet) { cardRef.current?.focus({ preventScroll: true }); return; }
    rootRef.current?.querySelector<HTMLElement>(".changes-extend-sheet select, .changes-extend-sheet button")?.focus();
  }, [entry?.key, sheet]);

  /* يعود التركيزُ إلى ما فتح الوضع، ولا تتحرّك الصفحةُ خلفه. يُقرأ الفاتحُ في أول رسم، قبل أن
     ينقل أثرُ البطاقة أعلاه التركيزَ إليها؛ وإن لم يكن زرّاً قائماً عاد إلى زرّ الدخول. */
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement as HTMLElement | null));
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; window.requestAnimationFrame(() => {
      const back = opener && opener !== document.body && opener.isConnected ? opener : document.querySelector<HTMLElement>("[data-inbox-pilot-launcher]");
      back?.focus?.();
    }); };
  }, []);

  const fix = async () => {
    if (!row || !item || !entry || !judged || busy || frozen) return;
    if (judged.blocked || judged.readiness === "checking") return;
    if (pilotHandsOff(item)) {
      /* الإضافةُ تحتاج شعبةً وقاعةً يختارهما القسم: بطاقتُها السريعة في الوارد، كزرّ «أضِفه الآن». */
      onClose();
      void onDecide(row, entry.index, "fixed", { after: judged.after, anchor: { x: window.innerWidth / 2, y: window.innerHeight / 3 } });
      return;
    }
    setWorking(true);
    try {
      const ok = await onDecide(row, entry.index, "fixed", { current, after: judged.after });
      if (ok) setState(prev => pilotAdvance(prev, "fixed", open));
    } finally { setWorking(false); }
  };

  /* الورقةُ تبقى مفتوحةً حتى يُحفظ الرفض: إن ردّه الخادم بقي السببُ والسطرُ والبدائلُ
     المختارة كما هي، والرسالةُ فوقها. */
  const reject = async (reasonCode: InstructorRequestRejectReason, note: string, alternatives: any[]) => {
    if (!row || !entry || busy || frozen) return;
    setWorking(true);
    try {
      const ok = await onDecide(row, entry.index, "rejected", { reasonCode, note, alternatives });
      if (ok) { setSheet(false); setState(prev => pilotAdvance(prev, "rejected", open)); }
    } finally { setWorking(false); }
  };

  const skip = () => { if (entry && !busy) setState(prev => pilotAdvance(prev, "skipped", open)); };
  const undo = () => { if (!busy) setState(prev => pilotUndoSkip(prev, open)); };
  const exit = () => { if (!working) onClose(); };

  const canFix = Boolean(judged) && !busy && !frozen && !judged!.blocked && judged!.readiness !== "checking";
  const canReject = Boolean(item) && !busy && !frozen;
  const canUndo = state.lastSkip != null && !busy;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      /* الحصرُ: Tab يدور داخل الوضع (أو داخل ورقة «بديل» حين تُفتح). */
      const scope = (sheet ? rootRef.current?.querySelector<HTMLElement>(".changes-extend-sheet") : null) || rootRef.current;
      const focusables = scope ? [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(node => node.offsetParent !== null || node === document.activeElement) : [];
      if (!focusables.length) { event.preventDefault(); return; }
      const first = focusables[0], last = focusables[focusables.length - 1];
      const inside = scope!.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
      return;
    }
    const command = pilotCommand({
      key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      target: keyTarget(event.target), sheetOpen: sheet,
    });
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    if (command === "close-sheet") setSheet(false);
    else if (command === "exit") exit();
    else if (state.at < 0) return;
    else if (command === "fix") { if (canFix) void fix(); }
    else if (command === "alternative") { if (canReject) setSheet(true); }
    else if (command === "next") skip();
    else if (command === "undo") { if (canUndo) undo(); }
  };

  const done = state.at < 0;
  const fixedCount = Object.values(state.outcomes).filter(outcome => outcome === "fixed").length;
  const rejectedCount = Object.values(state.outcomes).filter(outcome => outcome === "rejected").length;
  const ActionIcon = item?.action === "add" ? Plus : item?.action === "delete" ? Trash2 : Replace;
  const handsOff = item ? pilotHandsOff(item) : false;

  return (
    <div
      ref={rootRef}
      className="inbox-pilot"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbox-pilot-title"
      aria-describedby="inbox-pilot-keys"
      onKeyDown={onKeyDown}
    >
      <div className="inbox-pilot-frame">
        <header className="inbox-pilot-head">
          <span className="inbox-pilot-mark" aria-hidden="true"><Plane /></span>
          <strong id="inbox-pilot-title">وضع الطيّار</strong>
          <span className="inbox-pilot-count" aria-live="polite">
            {done ? `انتهت القائمة · ${num(total)}` : `${num(state.at + 1)} من ${num(total)}`}
          </span>
          <button type="button" className="inbox-pilot-exit" onClick={exit} disabled={working} aria-label="خروج من وضع الطيّار"
            data-guide-ignore="خروج من وضع الطيّار إلى الوارد — لا يغيّر شيئاً">
            <X aria-hidden="true" /><kbd aria-hidden="true">Esc</kbd>
          </button>
        </header>
        <div className="inbox-pilot-progress" role="progressbar" aria-label="ما قُرّر من القائمة" aria-valuemin={0} aria-valuemax={total} aria-valuenow={settled}
          aria-valuetext={`قُرّر ${num(settled)} من ${num(total)}`}>
          <i style={{ inlineSize: `${total ? Math.round((settled / total) * 100) : 0}%` }} />
        </div>

        {frozen ? <p className="inbox-pilot-frozen" role="status"><ShieldAlert aria-hidden="true" />فصلٌ مجمَّد: تُقرأ الطلباتُ ولا يُقرَّر فيها.</p> : null}

        {done || !row || !item || !entry || !judged ? (
          <section className="inbox-pilot-card inbox-pilot-done" ref={cardRef} tabIndex={-1} aria-live="polite">
            <ShieldCheck aria-hidden="true" />
            <strong>{total ? "لا شيء ينتظر في هذه القائمة" : "لا بنود تنتظر قرارك"}</strong>
            {total ? <span>ثُبّت {num(fixedCount)} · رُفض {num(rejectedCount)}{settled - fixedCount - rejectedCount > 0 ? ` · قرّر زملاؤك ${num(settled - fixedCount - rejectedCount)}` : ""}</span> : null}
            <button type="button" className="btn btn-primary inbox-pilot-big" onClick={exit}
              data-guide-ignore="عودة إلى الوارد بعد انتهاء القائمة — لا يغيّر شيئاً">عودة إلى الوارد</button>
          </section>
        ) : (
          <section className="inbox-pilot-card" ref={cardRef} tabIndex={-1} aria-labelledby="inbox-pilot-who" aria-describedby="inbox-pilot-change"
            data-readiness={judged.readiness} key={entry.key}>
            <div className="inbox-pilot-who">
              <strong id="inbox-pilot-who">{row.instructorName}</strong>
              <span>
                {row.sectionName ? `قسم ${String(row.sectionName).replace(/^قسم\s+/, "")}` : null}
                {submittedLabel(row.submittedAt) ? <small><Clock3 aria-hidden="true" />أُرسل {submittedLabel(row.submittedAt)}</small> : null}
              </span>
            </div>
            <div className="inbox-pilot-what">
              <span className="inbox-pilot-action" data-action={item.action}><ActionIcon aria-hidden="true" />{ACTION_LABEL[item.action] || item.action}</span>
              <strong>{item.after?.courseName || item.before?.courseName || "—"}</strong>
              {item.before?.sectionCode ? <small>شعبة {item.before.sectionCode}</small> : null}
            </div>

            <div className="inbox-pilot-change" id="inbox-pilot-change">
              {item.before && item.action !== "add" ? (
                <div className="inbox-pilot-slot" data-side="before">
                  <span>كان</span>
                  <b>{item.before.days || "—"}</b>
                  <bdi dir="ltr">{item.before.time}</bdi>
                  {item.before.room ? <small><DoorOpen aria-hidden="true" /><bdi dir="ltr">{item.before.room}</bdi></small> : null}
                </div>
              ) : null}
              {item.before && item.action !== "add" ? <ArrowLeft aria-hidden="true" className="inbox-pilot-arrow" /> : null}
              {item.action === "delete" ? (
                <div className="inbox-pilot-slot" data-side="gone"><span>المطلوب</span><b>حذف الموعد</b></div>
              ) : (
                <div className="inbox-pilot-slot" data-side="after">
                  <span>{item.action === "add" ? "جديد" : "المطلوب"}</span>
                  <b>{item.after?.days || (item.slots || []).map(slot => slotDays(slot)).join(" · ") || "—"}</b>
                  <bdi dir="ltr">{item.after?.time}</bdi>
                  {item.action === "change" && item.roomSwitch && !item.reservedRoom ? (
                    <small><DoorOpen aria-hidden="true" />القاعة بُدّلت إلى <bdi dir="ltr">{[item.roomSwitch.to.room, item.roomSwitch.to.hall].filter(Boolean).join("/")}</bdi></small>
                  ) : item.reservedRoom?.label ? <small><DoorOpen aria-hidden="true" /><bdi dir="ltr">{item.reservedRoom.label}</bdi></small> : null}
                </div>
              )}
            </div>
            {item.excuse ? <p className="inbox-pilot-excuse">{item.excuse}</p> : null}

            <p className="inbox-pilot-readiness" data-readiness={judged.changedAfterSubmit ? "review" : judged.readiness}>
              {judged.readiness === "checking" ? <Loader2 aria-hidden="true" className="spin" />
                : judged.readiness === "blocked" ? <ShieldAlert aria-hidden="true" />
                : judged.readiness === "ready" ? <ShieldCheck aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              {item.action === "delete" ? "حذفٌ لا يُفحص" : judged.changedAfterSubmit ? "تغيّر الجدول بعد الإرسال" : READINESS_LABEL[judged.readiness]}
            </p>
            {judged.issues.length ? (
              <ul className="inbox-pilot-issues">
                {judged.issues.map((issue, at) => (
                  <li key={at} data-severity={issue.severity}>{issue.text}{issue.detail ? <small> · {issue.detail}</small> : null}</li>
                ))}
              </ul>
            ) : null}
            {judged.after.length ? <p className="inbox-pilot-note">يُثبَّت معه ما يُفرغ وقتَه من طلبه نفسه.</p> : null}
            {item.action === "change" && !current ? <p className="inbox-pilot-note">لم يعد هذا الموعد في الجدول — ربما حُذف أو نُقل بعد الطلب.</p> : null}

            {(item.nearestTimes || []).length && item.action !== "delete" ? (
              <div className="inbox-pilot-alternatives" aria-label="بدائل جاهزة">
                <span>بدائل جاهزة في «بديل»</span>
                <ul>
                  {(item.nearestTimes || []).slice(0, 4).map(slot => (
                    <li key={`${(slot.days || [slot.day]).join(",")}|${slot.start}`}>{slotDays(slot)} · <bdi dir="ltr">{slot.start} – {slot.end}</bdi></li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error ? <p className="inbox-pilot-error" role="alert"><ShieldAlert aria-hidden="true" />{error}</p> : null}
          </section>
        )}

        {!done && item ? (
          <footer className="inbox-pilot-actions">
            <button type="button" className="btn btn-primary inbox-pilot-big" onClick={() => void fix()} disabled={!canFix}
              data-guide-target="requests.action.fix"
              title={judged?.waitsElsewhere ? "ينتظر قرار القسم الآخر في حذف محاضرته" : judged?.blocked ? "لا يُثبَّت بندٌ ممنوع — ارفضه ببديل أو عالجه من بطاقته" : undefined}>
              {busy ? <Loader2 aria-hidden="true" className="spin" /> : handsOff ? <Plus aria-hidden="true" /> : <Check aria-hidden="true" />}
              <span>{busy ? "يحفظ…" : handsOff ? "أضِفه الآن" : "ثبّت"}</span><kbd aria-hidden="true">F</kbd>
            </button>
            <button type="button" className="btn btn-secondary inbox-pilot-big" onClick={() => setSheet(true)} disabled={!canReject}
              data-guide-target="requests.action.reject">
              <Replace aria-hidden="true" /><span>بديل</span><kbd aria-hidden="true">B</kbd>
            </button>
            <button type="button" className="btn btn-secondary inbox-pilot-big" onClick={skip} disabled={busy}
              data-guide-ignore="تخطّي البند إلى التالي في وضع الطيّار — لا يقرّر شيئاً ويعود البندُ في آخر القائمة">
              <span>التالي</span><ChevronLeft aria-hidden="true" /><kbd aria-hidden="true">→</kbd>
            </button>
            {canUndo ? (
              <button type="button" className="inbox-pilot-undo" onClick={undo}
                data-guide-ignore="رجوعٌ إلى آخر بندٍ تُخطّي في وضع الطيّار — لا يغيّر شيئاً في الطلب">
                <RotateCcw aria-hidden="true" />رجوع إلى ما تخطّيته<kbd aria-hidden="true">Z</kbd>
              </button>
            ) : null}
          </footer>
        ) : null}
        <p className="inbox-pilot-keys" id="inbox-pilot-keys">
          <kbd>F</kbd>/<kbd>Enter</kbd> ثبّت · <kbd>B</kbd> بديل · <kbd>→</kbd>/<kbd>Space</kbd> التالي · <kbd>Esc</kbd> خروج
        </p>
      </div>

      {sheet && item ? (
        <RejectSheet item={item} busy={busy} onClose={() => setSheet(false)} onSubmit={(reason, note, alternatives) => void reject(reason, note, alternatives)} />
      ) : null}
      {sheet && error ? <p className="inbox-pilot-error inbox-pilot-sheet-error" role="alert"><ShieldAlert aria-hidden="true" />{error}</p> : null}
    </div>
  );
}
